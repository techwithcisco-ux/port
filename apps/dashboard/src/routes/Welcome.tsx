import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { markWelcomeSeen } from '../lib/utils';
import AuthShell from '../components/AuthShell';

// POS-first greeting. Every account lands here once per device before its
// role home: owner signups, and staff/manager accounts the first time they
// sign in after being provisioned. The till is the primary action because
// recording sales is the first thing a new account can actually do — the
// dashboard needs products, intake and allocations before it shows numbers.
// In production set VITE_POS_URL; the dev default is the POS dev server.
export default function Welcome() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const posUrl = (import.meta.env.VITE_POS_URL as string | undefined) ?? 'http://localhost:5174';

  // The greeting counts as delivered as soon as it is on screen, so a back
  // navigation goes to the role home instead of looping here.
  useEffect(() => {
    if (profile?.id) markWelcomeSeen(profile.id);
  }, [profile?.id]);

  const role = profile?.role;
  const next =
    role === 'owner'
      ? { label: 'Set up my business', to: '/onboarding' }
      : role === 'manager'
        ? { label: 'Open my dashboard', to: '/manager' }
        : { label: 'Continue', to: '/staff' };

  const steps = [
    { n: '1', title: 'Open the till', body: 'Record sales, take customer names and run credit — online or offline.' },
    { n: '2', title: 'Stock stays in sync', body: 'Every sale syncs back here, so revenue and stock are current.' },
    { n: '3', title: 'Set up when ready', body: 'Products, intake, branches and staff live in this dashboard.' },
  ];

  return (
    <AuthShell
      eyebrow="BranchPort"
      title={`Welcome, ${profile?.name ?? 'there'}`}
      subtitle="Your account is ready. Start at the point-of-sale — you can record your first sale right now."
      footer={
        <button
          type="button"
          onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
          className="text-sm font-medium text-ink-mute hover:text-ink"
        >
          Not you? Sign out
        </button>
      }
      aside={
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Your first step
          </p>
          <h2 className="mt-4 max-w-md text-[2.1rem] font-bold leading-[1.12] tracking-[-0.03em] text-white">
            The till is open.
            <span className="text-ghana-gold"> Everything else follows.</span>
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
            Record a sale and BranchPort has something real to work with — stock levels,
            daily revenue and supplier credit all start moving.
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
            <span className="block text-[15px] font-bold tracking-tight">Open the Point-of-Sale</span>
            <span className="mt-0.5 block text-[11px] text-white/70">Record sales, online or offline</span>
          </span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-lg transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </a>

        <button
          type="button"
          onClick={() => navigate(next.to, { replace: true })}
          className="btn btn-outline mt-3 w-full !py-3.5"
        >
          {next.label}
        </button>

        <ol className="mt-6 space-y-4 border-t border-line pt-5">
          {steps.map((s, i) => (
            <li key={s.n} className="flex gap-3.5">
              <span
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: i === 0 ? 'var(--ghana-gold)' : '#F7F2E3',
                  color: i === 0 ? 'var(--ink)' : 'var(--ink-mute)',
                  border: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                {s.n}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-mute">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </AuthShell>
  );
}
