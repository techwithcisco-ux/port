import { Link, useLocation } from 'react-router-dom';
import { IconCart, IconBox, IconReceipt, IconChart } from './Icons';

interface Tab {
  to: string;
  label: string;
  twiLabel: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { to: '/', label: 'Sell', twiLabel: 'Tua', icon: <IconCart size={22} /> },
  { to: '/dashboard', label: 'Stock', twiLabel: 'Aduane', icon: <IconBox size={22} /> },
  { to: '/invoices', label: 'Invoices', twiLabel: 'Nkrataa', icon: <IconReceipt size={22} /> },
  { to: '/balance-sheet', label: 'Balance', twiLabel: 'Sika', icon: <IconChart size={22} /> },
];

/**
 * Bottom tab navigation for the POS app.
 * Mobile-first: fixed to bottom, icon-first with small label underneath.
 * Each tab is at least 48px tall for easy tapping.
 */
export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t-2 safe-bottom lg:hidden" style={{borderColor: 'var(--ghana-gold)'}}>
      <div className="h-1 flex">
        <div className="flex-1" style={{background: 'var(--ghana-red)'}} />
        <div className="flex-1" style={{background: 'var(--ghana-gold)'}} />
        <div className="flex-1" style={{background: 'var(--ghana-green)'}} />
      </div>
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const active = tab.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors ${
                active
                  ? 'text-gray-900'
                  : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <span className={`transition-transform ${active ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                {tab.twiLabel}
              </span>
              {active && (
                <span className="absolute top-0 inset-x-0 h-0.5 rounded-full" style={{background: 'var(--ghana-gold)'}} />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
