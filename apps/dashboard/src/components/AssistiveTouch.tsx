import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadFeatureConfig, isFeatureEnabled, type FeatureKey } from '@branchport/shared';
import {
  IconCart, IconCurrency, IconTeam, IconSettings, IconReceipt, IconShop,
  IconSupplier, IconBox, IconProfit, IconCost, IconShield, IconPerson,
  IconChart, IconTag, IconInvite, IconDocument, IconReconcile, IconScale, IconList,
  AdinkraHome, AdinkraAllocate, AdinkraAlert, AdinkraAudit,
} from './Icons';
import { Nsoromma, Aya, NkrumahSilhouette } from './AdinkraSymbols';
import InstallBanner from './InstallBanner';

// ─── Menu data ──────────────────────────────────────────────────
type ViewMode = 'owner' | 'manager';
const VIEW_MODE_KEY = 'branchport-view-mode';
const POS_KEY = 'branchport-at-pos';

interface NavLink {
  to: string;
  label: string;
  feature?: FeatureKey;
  icon: ReactNode;
}

const managerLinks: NavLink[] = [
  { to: '/manager', label: 'Home', icon: <AdinkraHome size={24} /> },
  { to: '/manager/pos', label: 'Sell', icon: <IconCart size={24} /> },
  { to: '/manager/stock', label: 'Stock', icon: <Aya size={24} /> },
  { to: '/manager/money', label: 'Money', icon: <IconCurrency size={24} /> },
  { to: '/manager/team', label: 'Team', icon: <IconTeam size={24} /> },
  { to: '/manager/products', label: 'Products', icon: <IconTag size={24} /> },
  { to: '/manager/intake', label: 'Stock Intake', icon: <IconShop size={24} /> },
  { to: '/manager/allocation', label: 'Allocation', icon: <AdinkraAllocate size={24} /> },
  { to: '/manager/suppliers', label: 'Suppliers', icon: <IconSupplier size={24} /> },
  { to: '/manager/stock-balance', label: 'Stock Balance', icon: <IconBox size={24} />, feature: 'stock_balance_overview' },
  { to: '/manager/sales-report', label: 'Sales Report', icon: <IconChart size={24} />, feature: 'manager_sales_report' },
  { to: '/manager/profit-loss', label: 'Profit & Loss', icon: <IconProfit size={24} />, feature: 'manager_profit_loss' },
  { to: '/manager/expenses', label: 'Expenses', icon: <IconCost size={24} />, feature: 'manager_expenses' },
  { to: '/manager/ledger', label: 'Ledger', icon: <IconReceipt size={24} />, feature: 'manager_ledger' },
  { to: '/manager/reconciliation', label: 'Reconcile', icon: <IconReconcile size={24} /> },
  { to: '/manager/waitlist', label: 'Waitlist', icon: <IconList size={24} /> },
  { to: '/manager/documents', label: 'Documents', icon: <IconDocument size={24} /> },
  { to: '/manager/staff', label: 'Staff & Invites', icon: <IconInvite size={24} /> },
];

const ownerLinks: NavLink[] = [
  { to: '/owner', label: 'Home', icon: <AdinkraHome size={24} /> },
  { to: '/owner/stores', label: 'Stores', icon: <Nsoromma size={24} /> },
  { to: '/owner/products', label: 'Products', icon: <IconTag size={24} /> },
  { to: '/owner/money', label: 'Money', icon: <IconCurrency size={24} /> },
  { to: '/owner/team', label: 'Team', icon: <IconTeam size={24} /> },
  { to: '/owner/stock-allocation', label: 'Allocation', icon: <AdinkraAllocate size={24} /> },
  { to: '/owner/balance-sheet', label: 'Balance Sheet', icon: <IconScale size={24} />, feature: 'owner_balance_sheet' },
  { to: '/owner/trading-account', label: 'Trading Account', icon: <IconCost size={24} />, feature: 'owner_trading_account' },
  { to: '/owner/intelligence', label: 'Market', icon: <IconChart size={24} />, feature: 'owner_market_intelligence' },
  { to: '/owner/flags', label: 'Pricing Flags', icon: <AdinkraAlert size={24} />, feature: 'owner_flags' },
  { to: '/owner/managers', label: 'Managers', icon: <IconShield size={24} />, feature: 'owner_managers' },
  { to: '/owner/audit-log', label: 'Audit Log', icon: <AdinkraAudit size={24} />, feature: 'owner_audit_log' },
  { to: '/owner/account', label: 'Account', icon: <IconPerson size={24} /> },
  { to: '/owner/features', label: 'Settings', icon: <IconSettings size={24} /> },
];

// ─── Floating button ────────────────────────────────────────────
const BTN = 60;

interface Pos { x: number; y: number; }

function defaultPos(): Pos {
  if (typeof window === 'undefined') return { x: 300, y: 600 };
  return { x: Math.max(8, window.innerWidth - BTN - 16), y: Math.max(8, window.innerHeight - BTN - 88) };
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return p;
  } catch { return null; }
}

function clampPos(p: Pos): Pos {
  if (typeof window === 'undefined') return p;
  return {
    x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - BTN - 8)),
    y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - BTN - 8)),
  };
}

function TouchIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  // 3x3 dot grid — the AssistiveTouch mark.
  return (
    <span className="grid grid-cols-3 gap-[5px]" aria-hidden>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="h-[5px] w-[5px] rounded-full bg-white" />
      ))}
    </span>
  );
}

// ─── Menu (iPhone-style home grid) ──────────────────────────────
export default function AssistiveTouch() {
  const { profile, authUserId, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(() => clampPos(loadPos() ?? defaultPos()));
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'owner' || saved === 'manager' ? saved : 'owner';
  });
  const changeMode = (next: ViewMode) => {
    setMode(next);
    localStorage.setItem(VIEW_MODE_KEY, next);
  };

  const isOwner = profile?.role === 'owner';
  const showOwnerSection = isOwner && mode === 'owner';
  const config = useMemo(
    () => loadFeatureConfig((profile?.role as 'owner' | 'manager' | 'staff') ?? 'manager', profile?.id ?? authUserId),
    [profile?.role, profile?.id, authUserId],
  );
  const visibleOwner = ownerLinks.filter((l) => !l.feature || isFeatureEnabled(config, l.feature));
  const visibleManager = managerLinks.filter((l) => !l.feature || isFeatureEnabled(config, l.feature));

  // Re-clamp on viewport change (rotation, resize).
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    btnRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) > 8) d.moved = true;
    if (d.moved) setPos(clampPos({ x: d.ox + dx, y: d.oy + dy }));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* quota */ }
    } else {
      setOpen((o) => !o);
    }
  }

  const close = () => setOpen(false);

  // Panel anchors above the button when it sits low, below it when high.
  const vw = typeof window === 'undefined' ? 400 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const openUp = pos.y + BTN / 2 > vh / 2;
  const panelW = Math.min(360, vw - 24);
  const panelX = Math.min(Math.max(12, pos.x + BTN / 2 - panelW / 2), Math.max(12, vw - panelW - 12));

  function renderGrid(links: NavLink[], offset: number) {
    return (
      <div className="grid grid-cols-4 gap-x-1 gap-y-2 px-1 pt-1">
        {links.map((link, i) => {
          const active = location.pathname === link.to
            || (link.to !== '/manager' && link.to !== '/owner' && location.pathname.startsWith(link.to + '/'));
          return (
            <Link
              key={link.to}
              to={link.to}
              role="menuitem"
              onClick={close}
              className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors active:bg-gray-100"
              style={{ animation: 'assistive-pop 0.18s ease both', animationDelay: `${(offset + i) * 16}ms` }}
            >
              <span
                className="grid h-14 w-14 place-items-center rounded-[18px] transition-colors"
                style={{
                  background: active ? 'var(--ghana-black)' : '#f3f4f6',
                  color: active ? 'var(--ghana-gold)' : '#374151',
                  boxShadow: active ? '0 6px 16px rgba(17,24,39,0.25)' : 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                {link.icon}
              </span>
              <span
                className="w-full text-center text-[10px] font-medium leading-tight"
                style={{ color: active ? 'var(--ghana-black)' : '#4b5563' }}
              >
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          style={{ animation: 'assistive-fade 0.15s ease both' }}
          onClick={close}
          aria-hidden
        />
      )}

      {/* Menu panel */}
      {open && (
        <div
          role="menu"
          aria-label="BranchPort menu"
          className="fixed z-50 overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
          style={{
            left: panelX,
            width: panelW,
            maxHeight: '75vh',
            overflowY: 'auto',
            ...(openUp
              ? { bottom: Math.max(8, vh - pos.y + 12) }
              : { top: Math.min(vh - 200, pos.y + BTN + 12) }),
            animation: 'assistive-pop 0.18s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          <div className="ghana-stripe"><div className="red" /><div className="gold" /><div className="green" /></div>
          <div className="p-3">
            {showOwnerSection && (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Owner
                </p>
                {renderGrid(visibleOwner, 0)}
              </>
            )}
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {showOwnerSection ? 'Operations' : 'Menu'}
            </p>
            {renderGrid(visibleManager, visibleOwner.length)}

            {isOwner && (
              <div className="mt-3 rounded-2xl bg-gray-50 p-2">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">View as</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-200/60 p-1">
                  {(['owner', 'manager'] as ViewMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => changeMode(m)}
                      className={`rounded-lg px-2 py-2 text-xs font-medium capitalize transition-colors ${
                        mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center gap-2.5 rounded-2xl bg-gray-50 px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: 'var(--kente-indigo)' }}>
                <NkrumahSilhouette size={22} color="var(--ghana-gold)" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-gray-900">{profile?.name ?? 'Signed in'}</p>
                <p className="text-[11px] capitalize text-gray-500">{profile?.role ?? '—'}</p>
              </div>
              <button
                type="button"
                onClick={() => { void signOut().then(() => navigate('/login', { replace: true })); close(); }}
                className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-900"
              >
                Sign out
              </button>
            </div>
            <div className="mt-2 px-1">
              <InstallBanner />
            </div>
          </div>
        </div>
      )}

      {/* Floating circle */}
      <button
        ref={btnRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="fixed z-50 grid touch-none place-items-center rounded-full text-white shadow-2xl transition-transform active:scale-95"
        style={{
          left: pos.x,
          top: pos.y,
          width: BTN,
          height: BTN,
          background: 'var(--ghana-black)',
          border: '2px solid var(--ghana-gold)',
          boxShadow: '0 12px 32px rgba(17,24,39,0.35), 0 2px 8px rgba(17,24,39,0.25)',
        }}
      >
        <TouchIcon open={open} />
      </button>
    </>
  );
}
