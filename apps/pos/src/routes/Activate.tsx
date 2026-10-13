import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * POS Activation page.
 *
 * When the owner sends a staff member an activation link, it points here
 * with ?token=xxx. The page activates POS access and signs the user in.
 */
export default function Activate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activateAccount, authUserId, profile } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const token = searchParams.get('token');
  // The token is single-use. React StrictMode runs effects twice in dev, so
  // without this guard the second call burns an already-spent token and
  // replaces the success screen with "Invalid or expired activation link".
  const attempted = useRef(false);

  // Already signed in (or activation just opened a session) → the till.
  // Skipped while the success screen is showing so it stays readable.
  useEffect(() => {
    if (authUserId && profile && status !== 'success') {
      navigate('/', { replace: true });
    }
  }, [authUserId, profile, status, navigate]);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No activation link found. Ask your manager to send you a new one.');
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

    activateAccount(token).then((result) => {
      if (result.error) {
        setStatus('error');
        setMessage(result.error);
      } else {
        setStatus('success');
        setMessage('Your POS access is active and you are signed in.');
        // Activation opens a session, so the till is the right destination.
        setTimeout(() => navigate('/', { replace: true }), 1500);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-ink text-white">
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="flex items-center gap-2.5 px-5 py-3.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ghana-gold text-base font-black leading-none text-ink">
            ★
          </div>
          <p className="text-sm font-bold tracking-[-0.02em]">★ BranchPort POS</p>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="card w-full max-w-sm p-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-ghana-gold text-sm font-black leading-none text-ink">
              ★
            </div>
            <p className="text-lg font-bold tracking-tight text-ink">BranchPort</p>
          </div>

          {status === 'loading' && (
            <>
              <div className="mx-auto h-16 w-16 rounded-full border-4 border-line border-t-ghana-green animate-spin" />
              <p className="text-sm text-ink-mute">Activating your POS access…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--green-tint)' }}>
                <span className="text-3xl text-ghana-green">✓</span>
              </div>
              <p className="text-sm font-medium text-ghana-green">{message}</p>
              <p className="text-xs text-ink-faint">Taking you to the till…</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'var(--red-tint)' }}>
                <span className="text-3xl text-ghana-red">✗</span>
              </div>
              <p className="text-sm text-ghana-red">{message}</p>
              <button onClick={() => navigate('/login')} className="btn btn-primary w-full">
                Go to Sign In
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}


