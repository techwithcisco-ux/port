import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
      <path d="M2 2l20 20" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${ok ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
      {ok ? '✓' : '·'}
    </span>
  );
}

export default function Signup() {
  const { signUpOwner, authUserId, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authUserId && profile) navigate('/', { replace: true });
  }, [authUserId, profile, navigate]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ruleLen = password.length >= 8;
  const ruleAlpha = /[A-Za-z]/.test(password);
  const ruleNum = /[0-9]/.test(password);
  const ruleMatch = password !== '' && password === confirmPassword;

  function validate() {
    if (!name.trim()) return 'Your name is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (phone.trim().replace(/\D/g, '').length < 9) return 'Please enter a valid Ghana phone number.';
    if (!businessName.trim()) return 'Business name is required.';
    if (!password) return 'Password is required.';
    if (!ruleLen || !ruleAlpha || !ruleNum) return 'Password must be 8+ characters with a letter and a number.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);

    const { error: signUpError } = await signUpOwner({
      name: name.trim(),
      phone: phone.trim(),
      businessName: businessName.trim(),
      businessType: 'other',
      password,
    });

    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }

    navigate('/onboarding', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 page-enter bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-gray-900 shadow-lg shadow-gray-900/10 mb-4">
            <span className="text-xl font-black leading-none text-amber-300">★</span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">BranchPort Business</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-gray-900">Create your business</h1>
          <p className="mt-1 text-sm text-gray-500">One account for every branch and till</p>
        </div>

        <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(17,24,39,0.08)] card-enter sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="su-name" className="label">Your name</label>
                <input id="su-name" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kwame Asante" className="input w-full" />
              </div>
              <div>
                <label htmlFor="su-phone" className="label">Phone number</label>
                <input id="su-phone" type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="054 354 7819" className="input w-full" />
              </div>
            </div>
            <p className="-mt-2 text-xs text-gray-400">Your phone number is your login.</p>

            <div>
              <label htmlFor="su-biz" className="label">Business name</label>
              <input id="su-biz" type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Aunt Amma's Provisions" className="input w-full" />
            </div>

            <div>
              <label htmlFor="su-pw" className="label">Password</label>
              <div className="relative">
                <input
                  id="su-pw"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ characters, letter + number"
                  className="input w-full pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <EyeIcon off={showPw} />
                </button>
              </div>
              {password !== '' && (
                <ul className="mt-2 space-y-1.5">
                  <li className="flex items-center gap-2 text-xs text-gray-500"><CheckIcon ok={ruleLen} /> At least 8 characters</li>
                  <li className="flex items-center gap-2 text-xs text-gray-500"><CheckIcon ok={ruleAlpha && ruleNum} /> A letter and a number</li>
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="su-pw2" className="label">Confirm password</label>
              <input
                id="su-pw2"
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type it again"
                className="input w-full"
              />
              {confirmPassword !== '' && (
                <p className={`mt-1.5 flex items-center gap-2 text-xs ${ruleMatch ? 'text-emerald-600' : 'text-gray-400'}`}>
                  <CheckIcon ok={ruleMatch} /> {ruleMatch ? 'Passwords match' : 'Passwords must match'}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">!</span>
                <p className="text-sm leading-snug text-red-800">{error}</p>
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary w-full !py-3.5 text-[15px] font-semibold">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Creating your business…
                </span>
              ) : (
                'Create business'
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-gray-100 pt-5 text-center">
            <Link to="/login" className="text-sm font-semibold text-gray-900 hover:underline">
              Already have an account? Sign in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
