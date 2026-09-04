import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useMarketAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: '📊' },
  { to: '/users', label: 'User Directory', icon: '👥' },
  { to: '/items', label: 'Items Tracker', icon: '📦' },
  { to: '/live', label: 'Live Market', icon: '📈' },
  { to: '/analytics', label: 'Usage Analytics', icon: '⏱' },
  { to: '/reports', label: 'Reports', icon: '📄' },
];

export default function MarketLayout() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const { logout } = useMarketAuth();

  return (
    <div className="min-h-screen lg:flex bg-gray-50">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-gray-900 text-white flex items-center justify-between px-4 py-3">
        <button onClick={() => setNavOpen(true)} className="h-10 w-10 -ml-1.5 rounded-lg grid place-items-center hover:bg-white/10 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <p className="font-semibold tracking-tight">Market Analytics</p>
        </div>
        <button onClick={logout} className="h-8 px-2.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-medium">
          Sign out
        </button>
      </header>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[80%] max-w-[19rem] bg-gray-900 text-gray-300 flex flex-col shadow-2xl">
            <div className="px-4 py-4 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-3">
                <span className="text-lg">📈</span>
                <div>
                  <p className="font-semibold text-white">Market Analytics</p>
                  <p className="text-[11px] text-gray-400">Stock Intelligence</p>
                </div>
              </div>
              <button onClick={() => setNavOpen(false)} className="h-9 w-9 rounded-lg grid place-items-center text-gray-400 hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 overflow-y-auto" onClick={() => setNavOpen(false)}>
              <NavLinks />
            </nav>
            <div className="p-3 border-t border-gray-800">
              <button
                onClick={logout}
                className="w-full py-2.5 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 bg-gray-900 text-gray-300 flex-col sticky top-0 h-screen border-r border-gray-800">
        <div className="px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="text-xl">📈</span>
            <div>
              <p className="font-semibold tracking-tight text-white leading-tight">Market Analytics</p>
              <p className="text-[11px] text-gray-400">Stock Intelligence</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 pb-4 overflow-y-auto">
          <NavLinks />
        </nav>

        <div className="p-3 border-t border-gray-800 space-y-2">
          <button
            onClick={logout}
            className="w-full py-2 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-colors"
          >
            Sign out
          </button>
          <p className="text-[10px] text-gray-600 text-center">
            Connected to BranchPort
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <div className="px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavLinks() {
  const location = useLocation();
  return (
    <>
      <p className="nav-section">Navigation</p>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`nav-link flex items-center gap-2.5 ${location.pathname === item.to ? 'nav-link-active' : ''}`}
        >
          <span className="text-base">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </>
  );
}
