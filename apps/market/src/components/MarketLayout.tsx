import { Outlet } from 'react-router-dom';
import { useMarketAuth } from '../contexts/AuthContext';
import AssistiveTouch from './AssistiveTouch';

// Navigation lives in the floating AssistiveTouch circle now: tap it and
// the section menu pops open. This layout only provides the brand bar.
export default function MarketLayout() {
  const { logout } = useMarketAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-gray-900 text-white flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <p className="font-semibold tracking-tight">Market Analytics</p>
        </div>
        <button onClick={logout} className="h-8 px-2.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-medium">
          Sign out
        </button>
      </header>

      <main className="min-w-0">
        <div className="px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
          <Outlet />
        </div>
      </main>

      <AssistiveTouch />
    </div>
  );
}
