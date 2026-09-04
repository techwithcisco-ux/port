import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// The dashboard serves managers and owners. A staff account that signs in
// here (Supabase Auth doesn't know about app roles) is pointed at the
// point-of-sale app instead of being silently bounced in a redirect loop.
// In production set VITE_POS_URL; the dev default is the POS dev server.
export default function StaffNotice() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const posUrl = (import.meta.env.VITE_POS_URL as string | undefined) ?? 'http://localhost:5174';

  return (
    <div className="min-h-screen bg-gray-50 grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_8px_30px_rgba(17,24,39,0.08)]">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-900 grid place-items-center">
            <span className="text-base font-bold text-white">B</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Welcome, {profile?.name ?? 'there'}</h1>
            <p className="text-sm text-gray-500">BranchPort staff</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-gray-700">
          This dashboard is for managers and business owners. As staff, your daily
          work — recording sales — lives in the BranchPort point-of-sale app.
        </p>

        <a
          href={posUrl}
          className="mt-6 block w-full rounded-xl bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Open the Point-of-Sale app
        </a>

        <button
          onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
          className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
