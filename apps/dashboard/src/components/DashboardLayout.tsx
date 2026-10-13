import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GyeNyame } from './AdinkraSymbols';
import AssistiveTouch from './AssistiveTouch';

function avatarInitials(name: string | undefined) {
  if (!name) return 'B';
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Navigation lives in the floating AssistiveTouch circle now: tap it and
// the menu (owner + operations sections, view switch, sign out) pops open.
// This layout only provides the brand bar and the page container.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-30 bg-ink text-white shadow-[0_10px_30px_-18px_rgba(26,26,46,0.9)]">
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--ghana-gold)' }}>
              <GyeNyame size={26} color="#1A1A2E" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold tracking-[-0.02em] text-white">BranchPort</p>
              <p className="mt-0.5 truncate text-[11px] font-medium tracking-wide text-gray-300">
                Multi-branch retail, made simple
              </p>
            </div>
          </div>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10"
            title={profile?.name ?? 'Account'}
          >
            <span className="text-xs font-bold tracking-wide text-white">
              {avatarInitials(profile?.name)}
            </span>
          </div>
        </div>
      </header>

      <main className="min-w-0">
        {/* pb-24 keeps the floating AssistiveTouch button (bottom-right) off page content */}
        <div className="page-enter max-w-6xl mx-auto px-3 py-4 pb-24 sm:px-5 sm:py-6 sm:pb-24 lg:px-8 lg:py-7">{children}</div>
      </main>

      <AssistiveTouch />
    </div>
  );
}
