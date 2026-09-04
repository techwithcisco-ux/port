import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// BranchPort: staff invite/link generation (requirements.txt Section 2.1).
// Accounts are identified by NAME and PHONE NUMBER — no email, no password.
// The invited user signs in with name+phone at the app login screen.
//
// Why this exists as an Edge Function and NOT as a client insert:
//   - `users` has no client write policy (0002). Rows there are only ever
//     created by provision_staff_user / provision_user, security-definer functions.
//   - Creating the Supabase Auth account AND the public.users row must be
//     atomic from the manager's perspective; the client holds only the
//     anon key and cannot do either.
//
// Trust boundary (important):
//   - The function trusts ONLY the caller's JWT to decide WHO is asking.
//   - It refuses to provision unless the caller is a manager or owner AND the
//     target branch belongs to the caller's own business. Inviting a MANAGER
//     additionally requires the caller to be an owner (managers cannot mint
//     other managers). An owner or another business's manager gets 403
//     before anything is created.
//
// Deploy:  supabase functions deploy invite-staff --no-verify-jwt
//   (JWT verification happens in code so we can authorise by app role,
//    not merely by "is a valid Supabase user").

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const redirectTo = Deno.env.get('INVITE_REDIRECT_TO') ?? supabaseUrl;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server not configured (SUPABASE_SERVICE_ROLE_KEY missing)' }, 500);
  }

  // Resolve the CALLER from their JWT — never trust the body for auth.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !authData.user) return json({ error: 'Invalid session' }, 401);

  const callerId = authData.user.id;

  const { branch_id, name, email, role } = await req.json().catch(() => ({}));
  if (!branch_id || !name?.trim() || !email?.trim()) {
    return json({ error: 'branch_id, name and email are required' }, 400);
  }
  const targetRole = role === 'manager' ? 'manager' : 'staff';

  // Authorise: caller must be a manager (or owner) in the business that owns
  // branch_id. Managers can only invite staff; owners can invite managers too.
  const { data: caller, error: callerErr } = await admin
    .from('users')
    .select('id, role, business_id')
    .eq('id', callerId)
    .single();
  if (callerErr || !caller || (caller.role !== 'manager' && caller.role !== 'owner')) {
    return json({ error: 'Only a manager or owner can invite' }, 403);
  }
  if (targetRole === 'manager' && caller.role !== 'owner') {
    return json({ error: 'Only an owner can invite a manager' }, 403);
  }

  const { data: branch, error: branchErr } = await admin
    .from('branches')
    .select('business_id')
    .eq('id', branch_id)
    .single();
  if (branchErr || !branch || branch.business_id !== caller.business_id) {
    return json({ error: 'Branch does not belong to your business' }, 403);
  }

  const { data: branch, error: branchErr } = await admin
    .from('branches')
    .select('business_id')
    .eq('id', branch_id)
    .single();
  if (branchErr || !branch || branch.business_id !== caller.business_id) {
    return json({ error: 'Branch does not belong to your business' }, 403);
  }

  // Create the auth user keyed by phone. phone_confirm is set to false
  // because SMS OTP delivery requires a Twilio/Telegram/etc provider configured
  // on the Supabase project; without it the account is created immediately
  // (phone_confirm=false) and users sign in with name+phone at the app login.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    phone: phone.trim(),
    phone_confirm: false,
    user_metadata: { name: name.trim(), branch_id, role: targetRole },
  });
  if (createErr) return json({ error: createErr.message }, 400);

  // Provision the public.users row via the security-definer function.
  // provision_user (0011) covers all roles; provision_staff_user (0004) kept
  // for staff invites against older schemas. p_phone is optional — rows
  // created before 0012 will have null phone.
  const provisionArgs = {
    p_auth_user_id: created.user.id,
    p_business_id: caller.business_id,
    p_branch_id: branch_id,
    p_name: name.trim(),
    p_role: targetRole,
    p_phone: phone.trim(),
  };
  let provisionErr: { message: string } | null = null;
  if (targetRole === 'staff') {
    const { error } = await admin.rpc('provision_staff_user', provisionArgs);
    provisionErr = error;
  } else {
    const { error } = await admin.rpc('provision_user', provisionArgs);
    if (error?.code === 'PGRST202') {
      const { error: fallbackErr } = await admin.rpc('provision_staff_user', provisionArgs);
      provisionErr = fallbackErr;
    } else {
      provisionErr = error;
    }
  }
  if (provisionErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: provisionErr.message }, 500);
  }

  // Generate an invite URL pointing the new user to the app's login page
  // where they can sign in with name+phone. The redirect_to URL tells them
  // to open the POS or dashboard and register their account.
  const redirectTo = Deno.env.get('INVITE_REDIRECT_TO') ?? supabaseUrl;
  const inviteUrl = `${redirectTo}/auth/v1/signup?phone=${encodeURIComponent(phone.trim())}&name=${encodeURIComponent(name.trim())}`;

  return json({
    user_id: created.user.id,
    name: name.trim(),
    branch_id,
    role: targetRole,
    invite_url: inviteUrl,
  });
});
