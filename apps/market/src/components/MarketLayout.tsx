import { Outlet } from 'react-router-dom';
import { useMarketAuth } from '../contexts/AuthContext';
import AssistiveTouch from './AssistiveTouch';

// Navigation lives in the floating AssistiveTouch circle now: tap it and
// the section menu pops open. This layout only provides the brand bar.
export default function MarketLayout() {
  const { logout } = useMarketAuth();

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-30 bg-ink text-white shadow-[0_10px_30px_-18px_rgba(26,26,46,0.9)]">
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ghana-gold text-base font-black leading-none text-ink">
              ★
            </div>
            <div>
              <p className="text-[15px] font-bold leading-none tracking-[-0.02em]">Market Intelligence</p>
              <p className="mt-1 text-[10px] font-medium tracking-wide text-ghana-gold">
                🇬🇭 BranchPort platform
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="min-w-0">
        <div className="page-enter px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
          <Outlet />
        </div>
      </main>

      <AssistiveTouch />
    </div>
  );
}
