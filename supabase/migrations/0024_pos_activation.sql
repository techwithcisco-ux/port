-- 0024_pos_activation.sql
-- Single-use POS activation via RPC. The old client flow read the users
-- table by token as anon (blocked by RLS — activation links never worked)
-- and never cleared the token (replayable forever). This RPC validates the
-- token server-side, flips pos_activated, BURNS the token (single use),
-- and returns only the phone number so the app can redirect to login.
-- It grants NO session: staff still sign in with phone + password, which
-- is what gives them a real Auth session that satisfies RLS on sales.
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION activate_pos_account(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'Invalid activation link';
  END IF;
  SELECT * INTO v_user FROM users WHERE pos_activation_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired activation link. Ask your manager for a new one.';
  END IF;
  UPDATE users
  SET pos_activated = true,
      pos_activation_token = NULL
  WHERE id = v_user.id;
  RETURN jsonb_build_object(
    'user_id', v_user.id,
    'phone', v_user.phone,
    'name', v_user.name
  );
END;
$$;

REVOKE ALL ON FUNCTION activate_pos_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_pos_account(text) TO anon, authenticated;
