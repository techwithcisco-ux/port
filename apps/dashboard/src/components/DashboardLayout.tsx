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
    <div className="min-h-screen" style={{ background: 'var(--cream)' }}>
      <header className="sticky top-0 z-30 text-white flex flex-col" style={{ background: 'var(--ghana-black)' }}>
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-lg grid place-items-center" style={{ background: 'var(--ghana-gold)' }}>
              <GyeNyame size={24} color="var(--ghana-black)" />
            </div>
            <div className="min-w-0">
              <p className="font-bold tracking-tight text-white leading-tight">★ BranchPort</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ghana-gold)' }}>🇬🇭 Akwaaba — Nkrumah's Legacy</p>
            </div>
          </div>
          <div className="h-8 w-8 rounded-full grid place-items-center" style={{ background: 'var(--kente-indigo)' }}>
            <span className="text-xs font-semibold text-white">{avatarInitials(profile?.name)}</span>
          </div>
        </div>
      </header>

      <main className="min-w-0">
        <div className="px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5 page-enter max-w-6xl mx-auto">{children}</div>
      </main>

      <AssistiveTouch />
    </div>
  );
}
