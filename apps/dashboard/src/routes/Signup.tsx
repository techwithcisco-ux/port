import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate() {
    if (!name.trim()) return 'Your name is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (phone.trim().replace(/\D/g, '').length < 9) return 'Please enter a valid Ghana phone number.';
    if (!businessName.trim()) return 'Business name is required.';
    if (!password) return 'Password is required.';
    if (password.length < 7) return 'Password must be at least 7 characters.';
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 page-enter" style={{ background: '#FEFDF5' }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(17,24,39,0.12),0_2px_8px_rgba(17,24,39,0.06)] card-enter">
        <div className="flex h-1.5">
          <div className="flex-1" style={{ background: '#CE1126' }} />
          <div className="flex-1" style={{ background: '#FCD116' }} />
          <div className="flex-1" style={{ background: '#006B3F' }} />
        </div>

        <div className="bg-white p-4 sm:p-8">
          <div className="text-center mb-3">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-3" style={{ background: '#FCD116' }}>
              <span className="text-lg font-bold" style={{ color: '#1a1a2e' }}>★</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#1a1a2e' }}>Create Your Business</h1>
            <p className="text-sm text-gray-500 mt-1">Akwaaba! Set up your shop on BranchPort.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kwame Asante" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="054 354 7819" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
              <p className="text-xs text-gray-400 mt-1">This is your login — use your Ghana phone number</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
              <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Aunt Amma's Provisions" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 7 characters" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Type your password again" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900" />
            </div>

            {error && (
              <p className="text-sm text-red-800 bg-red-50 p-3 rounded-lg">{error}</p>
            )}

            <button type="submit" disabled={submitting} className="w-full px-8 py-3 rounded-xl text-white font-medium transition-colors disabled:opacity-50" style={{ background: '#006B3F' }}>
              {submitting ? 'Creating your business…' : '★ Create Business — BrɛMu'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-900 font-medium">Already have an account? Sign in →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}