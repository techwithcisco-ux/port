import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadFeatureConfig, isFeatureEnabled, type FeatureKey } from '@branchport/shared';
import { IconCart, IconCurrency, IconTeam, IconSettings, IconReceipt, IconShop } from './Icons';
import { Nsoromma, Aya, Dwennimmen, NkrumahSilhouette } from './AdinkraSymbols';
import InstallBanner from './InstallBanner';

// ─── Menu data (was the sidebar/drawer) ─────────────────────────
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
  { to: '/manager/pos', label: 'Tua (Sell)', icon: <IconCart size={18} /> },
  { to: '/manager/stock', label: 'Aduane (Stock)', icon: <Aya size={18} /> },
  { to: '/manager/money', label: 'Sika (Money)', icon: <IconCurrency size={18} /> },
  { to: '/manager/team', label: 'Adwo (Team)', icon: <IconTeam size={18} /> },
  { to: '/manager/waitlist', label: 'Waitlist (Orders)', icon: <IconShop size={18} /> },
];

const ownerLinks: NavLink[] = [
  { to: '/owner/stores', label: 'Dzi wo fi (Stores)', icon: <Nsoromma size={18} /> },
  { to: '/owner/money', label: 'Sika Data', icon: <IconCurrency size={18} /> },
  { to: '/owner/team', label: 'Adwo (Team)', icon: <IconTeam size={18} /> },
  { to: '/owner/audit-log', label: 'Nsusuwii (Audit)', icon: <Dwennimmen size={18} /> },
  { to: '/owner/account', label: 'Account', icon: <IconReceipt size={18} /> },
  { to: '/owner/features', label: 'Nhyehyee (Settings)', icon: <IconSettings size={18} /> },
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

// ─── Menu ───────────────────────────────────────────────────────
export default function AssistiveTouch() {
  const { profile, signOut } = useAuth();
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
    () => loadFeatureConfig((profile?.role as 'owner' | 'manager' | 'staff') ?? 'manager'),
    [profile?.role],
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
  }, [open ]);

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
  const panelW = Math.min(320, vw - 24);
  const panelX = Math.min(Math.max(12, pos.x + BTN / 2 - panelW / 2), Math.max(12, vw - panelW - 12));

  function renderLinks(links: NavLink[], offset: number) {
    return links.map((link, i) => {
      const active = location.pathname === link.to;
      return (
        <Link
          key={link.to}
          to={link.to}
          role="menuitem"
          onClick={close}
          className={`flex items-center gap-3 rounded-2xl px-3 transition-colors ${
            active ? 'text-white' : 'text-gray-700 active:bg-gray-100'
          }`}
          style={{
            minHeight: 54,
            background: active ? 'var(--ghana-black)' : undefined,
            animation: 'assistive-pop 0.18s ease both',
            animationDelay: `${(offset + i) * 22}ms`,
          }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ background: active ? 'var(--ghana-gold)' : '#f3f4f6', color: active ? 'var(--ghana-black)' : '#374151' }}
          >
            {link.icon}
          </span>
          <span className="flex-1 text-sm font-medium">{link.label}</span>
          {active && <span className="text-xs" style={{ color: 'var(--ghana-gold)' }}>●</span>}
        </Link>
      );
    });
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
            maxHeight: '70vh',
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
                  Okradi / Owner
                </p>
                {renderLinks(visibleOwner, 0)}
              </>
            )}
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {showOwnerSection ? 'Dwa (Operations)' : 'Tem (Manage)'}
            </p>
            {renderLinks(visibleManager, visibleOwner.length)}

            {isOwner && (
              <div className="mt-2 rounded-2xl bg-gray-50 p-2">
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
