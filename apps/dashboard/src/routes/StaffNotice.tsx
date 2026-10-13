import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';

// The dashboard serves managers and owners. A staff account that signs in
// here (login succeeds before the app role is checked) is pointed at the
// point-of-sale app instead of being silently bounced in a redirect loop.
// In production set VITE_POS_URL; the dev default is the POS dev server.
export default function StaffNotice() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const posUrl = (import.meta.env.VITE_POS_URL as string | undefined) ?? 'http://localhost:5174';

  return (
    <AuthShell
      eyebrow="BranchPort staff"
      title={`Welcome, ${profile?.name ?? 'there'}`}
      subtitle="Your daily work lives in the point-of-sale app, not this dashboard."
      footer={
        <button
          onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
          className="text-sm font-medium text-ink-mute hover:text-ink"
        >
          Sign out
        </button>
      }
      aside={
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Point-of-sale
          </p>
          <h2 className="mt-4 max-w-md text-[2.1rem] font-bold leading-[1.12] tracking-[-0.03em] text-white">
            This dashboard is for managers
            <span className="text-ghana-gold"> and business owners.</span>
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
            Recording sales is done on the till. Once your account has a branch, the
            point-of-sale app is where you belong.
          </p>
        </>
      }
    >
      <div>
        <a
          href={posUrl}
          className="group flex w-full items-center justify-between gap-3 rounded-xl bg-ghana-green px-5 py-4 text-white transition-all hover:bg-[#007A4A] active:translate-y-px"
          style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 26px -14px rgba(0,107,63,1)' }}
        >
          <span className="text-left">
            <span className="block text-[15px] font-bold tracking-tight">Open the Point-of-Sale app</span>
            <span className="mt-0.5 block text-[11px] text-white/70">Sign in with your phone + password</span>
          </span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-lg transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </a>

        <div className="panel mt-4 flex items-start gap-3 px-4 py-3.5">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ghana-gold text-[11px] font-bold text-ink">
            i
          </span>
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Ask your manager to assign you a branch if the till asks — without one there is
            nothing to sell against.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
