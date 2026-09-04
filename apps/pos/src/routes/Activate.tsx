import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { activatePOS } from '@branchport/shared';

/**
 * POS Activation page.
 *
 * When the owner sends a staff member an activation link, it points here
 * with ?token=xxx&user=xxx&d=xxx. The page:
 * 1. Decodes the user data from the URL (cross-device: works on any phone)
 * 2. Creates the user locally in this device's localStorage if needed
 * 3. Activates POS access and signs the user in
 * 4. Redirects to the Sell screen
 */
export default function Activate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activateAccount, authUserId, profile } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const token = searchParams.get('token');
  const encodedData = searchParams.get('d');

  useEffect(() => {
    if (authUserId && profile) {
      navigate('/', { replace: true });
      return;
    }

    if (!token) {
      setStatus('error');
      setMessage('No activation link found. Ask your manager to send you a new one.');
      return;
    }

    // If cross-device user data is encoded in the URL, ensure the user exists
    // in this device's localStorage before trying to activate.
    if (encodedData) {
      try {
        const userData = JSON.parse(atob(decodeURIComponent(encodedData)));
        ensureUserExists(userData, token);
      } catch {
        // If decoding fails, try activatePOS anyway — it might find the user
        // if both devices share the same localStorage (same browser).
      }
    }

    activateAccount(token).then((result) => {
      if (result.error) {
        setStatus('error');
        setMessage(result.error);
      } else {
        setStatus('success');
        setMessage(`Welcome, ${result.user?.name ?? 'there'}! Your POS access is now active.`);
        // Redirect to the sell screen after a brief moment
        setTimeout(() => navigate('/', { replace: true }), 1500);
      }
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white shadow rounded-lg p-8 w-full max-w-sm text-center space-y-4">
        <div className="inline-flex items-center gap-2.5 mb-2">
          <div className="h-9 w-9 rounded-xl bg-gray-900 grid place-items-center">
            <span className="text-sm font-bold text-white">B</span>
          </div>
          <p className="text-lg font-semibold">BranchPort</p>
        </div>

        {status === 'loading' && (
          <>
            <div className="animate-pulse">
              <div className="h-16 w-16 bg-gray-200 rounded-full mx-auto mb-4" />
            </div>
            <p className="text-sm text-gray-500">Activating your POS access…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="h-16 w-16 bg-green-100 rounded-full mx-auto flex items-center justify-center">
              <span className="text-3xl">✓</span>
            </div>
            <p className="text-sm text-green-700 font-medium">{message}</p>
            <p className="text-xs text-gray-400">Redirecting you to the till…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="h-16 w-16 bg-red-100 rounded-full mx-auto flex items-center justify-center">
              <span className="text-3xl">✗</span>
            </div>
            <p className="text-sm text-red-600">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gray-900 text-white rounded-md py-2.5 text-sm font-medium mt-2"
            >
              Go to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Ensure a user exists in this device's localStorage.
 * Called when the activation link carries user data from another device.
 */
function ensureUserExists(userData: {
  id: string;
  name: string;
  phone: string;
  branch_id: string | null;
  business_id: string;
  role: string;
}, token: string) {
  const STORAGE_KEY = 'branchport-demo-users-v2';
  let users: Array<Record<string, unknown>> = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) users = JSON.parse(raw);
  } catch { /* empty */ }

  const existing = users.find((u) => u.id === userData.id);
  if (!existing) {
    // Create the user with the activation token so activatePOS() can find them
    users.push({
      ...userData,
      password_hash: null,
      pos_activated: false,
      pos_activation_token: token,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } else if (!existing.pos_activation_token) {
    // User exists but has no token yet — set it so activatePOS() works
    existing.pos_activation_token = token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }
}
