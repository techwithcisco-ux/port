import { ReactNode, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadFeatureConfig, isFeatureEnabled, type FeatureKey } from '@branchport/shared';
import {
  IconCart, IconBox, IconCurrency, IconTeam, IconShop,
  IconSettings, IconShield, IconReceipt,
} from './Icons';
import {
  Adinkrahene, Nsoromma, Sankofa, Aya, Dwennimmen,
  BlackStar, GyeNyame, GhanaFlagStripe, NkrumahSilhouette,
} from './AdinkraSymbols';

type ViewMode = 'owner' | 'manager';
const VIEW_MODE_KEY = 'branchport-view-mode';

interface NavLink {
  to: string;
  label: string;
  feature?: FeatureKey;
  icon: ReactNode;
}

const managerLinks: NavLink[] = [
  { to: '/manager/pos', label: 'Tua (Sell)', icon: <IconCart size={18} /> },
  { to: '/manager/stock', label: 'Aduane (Stock)', icon: <Aya size={18} /> },
  { to: '/manager/money', label: 'Sika (Money)', icon: <IconCurrency size={18} /> },
  { to: '/manager/team', label: 'Adwo (Team)', icon: <IconTeam size={18} /> },
];

const ownerLinks: NavLink[] = [
  { to: '/owner/stores', label: 'Dzi wo fi (Stores)', icon: <Nsoromma size={18} /> },
  { to: '/owner/money', label: 'Sika Data', icon: <IconCurrency size={18} /> },
  { to: '/owner/team', label: 'Adwo (Team)', icon: <IconTeam size={18} /> },
  { to: '/owner/audit-log', label: 'Nsusuwii (Audit)', icon: <Dwennimmen size={18} /> },
  { to: '/owner/account', label: 'Account', icon: <IconReceipt size={18} /> },
  { to: '/owner/features', label: 'Nhyehyee (Settings)', icon: <IconSettings size={18} /> },
];

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

function NavLinks({ mode, onNavigate }: { mode: ViewMode; onNavigate?: () => void }) {
  const { profile } = useAuth();
  const location = useLocation();
  const isOwner = profile?.role === 'owner';
  const showOwnerSection = isOwner && mode === 'owner';
  const config = useMemo(() => loadFeatureConfig(profile?.role as 'owner' | 'manager' | 'staff' ?? 'manager'), [profile?.role]);

  const visibleOwnerLinks = ownerLinks.filter((link) => !link.feature || isFeatureEnabled(config, link.feature));
  const visibleManagerLinks = managerLinks.filter((link) => !link.feature || isFeatureEnabled(config, link.feature));

  return (
    <>
      {showOwnerSection && (
        <>
          <div className="px-3 pb-1 pt-6 flex items-center gap-2">
            <Dwennimmen size={14} className="text-amber-400/70" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Okradi / Owner</p>
          </div>
          {visibleOwnerLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              className={`nav-link ${location.pathname === link.to ? 'nav-link-active' : ''}`}
            >
              <span className="shrink-0 opacity-80">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
        </>
      )}
      <div className="px-3 pb-1 pt-6 flex items-center gap-2">
        <Aya size={14} className="text-emerald-400/70" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{showOwnerSection ? 'Dwa (Operations)' : 'Tem (Manage)'}</p>
      </div>
      {visibleManagerLinks.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          onClick={onNavigate}
          className={`nav-link ${location.pathname === link.to ? 'nav-link-active' : ''}`}
        >
          <span className="shrink-0 opacity-80">{link.icon}</span>
          <span>{link.label}</span>
        </Link>
      ))}
    </>
  );
}

function ViewSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const { profile } = useAuth();
  if (profile?.role !== 'owner') return null;
  return (
    <div className="px-3 pb-2">
      <p className="nav-section">View as</p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.06] p-1">
        <button
          type="button"
          onClick={() => onChange('owner')}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === 'owner' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
          }`}
        >
          Owner
        </button>
        <button
          type="button"
          onClick={() => onChange('manager')}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === 'manager' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
          }`}
        >
          Manager
        </button>
      </div>
    </div>
  );
}

function ProfileFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="p-3 border-t border-gray-800">
      <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
        <div className="h-8 w-8 shrink-0 rounded-full grid place-items-center" style={{background: 'var(--kente-indigo)'}}>
          <NkrumahSilhouette size={20} color="var(--ghana-gold)" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate leading-tight">{profile?.name ?? 'Signed in'}</p>
          <p className="text-[11px] capitalize" style={{color: 'var(--ghana-gold)'}}>{profile?.role ?? '—'}</p>
        </div>
      </div>
      <button
        onClick={() => {
          void signOut().then(() => navigate('/login', { replace: true }));
          onNavigate?.();
        }}
        className="mt-1 w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-gray-400 hover:bg-white/[0.06] hover:text-white transition-colors"
      >
        Medaase / Sign out
      </button>
      {/* Ghana proverb at bottom */}
      <div className="mt-2 px-2.5 py-2 rounded-lg" style={{background: 'rgba(252,209,22,0.08)'}}>
        <p className="text-[10px] italic" style={{color: 'var(--ghana-gold)'}}>
          "Obi nkyere abofra Nyame" — No one teaches a child about God
        </p>
        <div className="mt-1.5 flex justify-center">
          <GyeNyame size={20} color="var(--ghana-gold)" />
        </div>
      </div>
    </div>
  );
}

function BrandMark({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${small ? 'h-9 w-9' : 'h-10 w-10'} shrink-0 rounded-lg grid place-items-center`} style={{background: 'var(--ghana-gold)'}}>
        <GyeNyame size={small ? 24 : 28} color="var(--ghana-black)" />
      </div>
      <div className="min-w-0">
        <p className="font-bold tracking-tight text-white leading-tight">★ BranchPort</p>
        <p className="text-[11px] mt-0.5 truncate" style={{color: 'var(--ghana-gold)'}}>🇬🇭 Akwaaba — Nkrumah's Legacy</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'owner' || saved === 'manager' ? saved : 'owner';
  });
  const closeNav = () => setNavOpen(false);
  const changeMode = (next: ViewMode) => {
    setMode(next);
    localStorage.setItem(VIEW_MODE_KEY, next);
  };

  return (
    <div className="min-h-screen lg:flex" style={{background: 'var(--cream)'}}>
      {/* Mobile top bar — visible below lg. The hamburger opens the drawer. */}
      <header className="lg:hidden sticky top-0 z-30 text-white flex flex-col" style={{background: 'var(--ghana-black)'}}>
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          className="h-10 w-10 -ml-1.5 rounded-lg grid place-items-center hover:bg-white/10 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <BrandMark small />
        <div className="h-8 w-8 rounded-full grid place-items-center" style={{background: 'var(--kente-indigo)'}}>
          <span className="text-xs font-semibold text-white">{avatarInitials(profile?.name)}</span>
        </div>
        </div>
      </header>

      {/* Mobile drawer — slide-over with a dimmed backdrop */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={closeNav}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[80%] max-w-[19rem] bg-gray-900 text-gray-300 flex flex-col shadow-2xl scroll-dark" style={{animation: 'slide-in-left 0.25s cubic-bezier(0.22, 1, 0.36, 1)'}}>
            <div className="px-4 py-4 flex items-center justify-between border-b border-gray-800">
              <BrandMark small />
              <button
                onClick={closeNav}
                aria-label="Close menu"
                className="h-9 w-9 rounded-lg grid place-items-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 pb-4 overflow-y-auto scroll-dark" onClick={closeNav}>
              <NavLinks mode={mode} onNavigate={closeNav} />
            </nav>
            <ViewSwitch mode={mode} onChange={changeMode} />
            <ProfileFooter onNavigate={closeNav} />
          </div>
        </div>
      )}

      {/* Desktop sidebar — hidden below lg */}
      <aside className="hidden lg:flex w-60 text-gray-300 flex-col sticky top-0 h-screen scroll-dark" style={{background: 'var(--ghana-black)', borderRight: '3px solid var(--ghana-gold)'}}>
        <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
        <div className="px-4 py-5">
          <BrandMark />
        </div>

        <ViewSwitch mode={mode} onChange={changeMode} />
        <nav className="flex-1 px-3 pb-4 overflow-y-auto scroll-dark">
          <NavLinks mode={mode} />
        </nav>

        <ProfileFooter />
      </aside>

      <main className="flex-1 min-w-0">
        <div className="px-4 py-6 sm:px-6 lg:px-12 lg:py-10 page-enter">{children}</div>
      </main>
    </div>
  );
}