import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadFeatureConfig, isFeatureEnabled } from '@branchport/shared';
import { IconCart, IconBox, IconReceipt, IconDebtors, IconChart, IconCalculator, IconSync } from './Icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

// Floating AssistiveTouch circle for the till: tap it and the home-style
// icon grid (Sell / Stock / Invoices / Balance / Calculator / Sync) pops
// open. The circle is draggable and remembers its spot on this device.

const BTN = 60;
const POS_KEY = 'branchport-pos-at-pos';

interface Tab {
  to: string;
  label: string;
  icon: React.ReactNode;
  feature?: 'pos_balance_sheet' | 'pos_invoice_history' | 'posCalculator';
}

const allTabs: Tab[] = [
  { to: '/', label: 'Sell', icon: <IconCart size={24} /> },
  { to: '/dashboard', label: 'Stock', icon: <IconBox size={24} /> },
  { to: '/invoices', label: 'Invoices', icon: <IconReceipt size={24} />, feature: 'pos_invoice_history' },
  { to: '/debtors', label: 'Debtors', icon: <IconDebtors size={24} /> },
  { to: '/balance-sheet', label: 'Balance', icon: <IconChart size={24} />, feature: 'pos_balance_sheet' },
  { to: '/calculator', label: 'Calculator', icon: <IconCalculator size={24} />, feature: 'posCalculator' },
  { to: '/sync', label: 'Sync', icon: <IconSync size={24} /> },
];

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

export default function AssistiveTouch() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(() => clampPos(loadPos() ?? defaultPos()));
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const queuedCount = useLiveQuery(() => db.sales.filter((s) => !s.synced).count(), []) ?? 0;

  const config = useMemo(
    () => loadFeatureConfig((profile?.role as 'owner' | 'manager' | 'staff') ?? 'staff', profile?.id),
    [profile?.role, profile?.id],
  );
  const tabs = allTabs.filter((t) => !t.feature || isFeatureEnabled(config, t.feature));

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  const vw = typeof window === 'undefined' ? 400 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const openUp = pos.y + BTN / 2 > vh / 2;
  const panelW = Math.min(320, vw - 24);
  const panelX = Math.min(Math.max(12, pos.x + BTN / 2 - panelW / 2), Math.max(12, vw - panelW - 12));

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

      {open && (
        <div
          role="menu"
          aria-label="POS menu"
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
          <div className="flex">
            <div className="flex-1" style={{ background: 'var(--ghana-red)', height: 4 }} />
            <div className="flex-1" style={{ background: 'var(--ghana-gold)', height: 4 }} />
            <div className="flex-1" style={{ background: 'var(--ghana-green)', height: 4 }} />
          </div>
          <div className="p-3">
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Menu
            </p>
            <div className="grid grid-cols-3 gap-x-1 gap-y-2 px-1 pt-1">
              {tabs.map((tab, i) => {
                const active = tab.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(tab.to);
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    role="menuitem"
                    onClick={close}
                    className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 active:bg-gray-100"
                    style={{ animation: 'assistive-pop 0.18s ease both', animationDelay: `${i * 18}ms` }}
                  >
                    <span
                      className="relative grid h-14 w-14 place-items-center rounded-[18px]"
                      style={{
                        background: active ? 'var(--ghana-black)' : '#f3f4f6',
                        color: active ? 'var(--ghana-gold)' : '#374151',
                        boxShadow: active ? '0 6px 16px rgba(17,24,39,0.25)' : 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                      }}
                    >
                      {tab.icon}
                      {tab.to === '/sync' && queuedCount > 0 && (
                        <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                          {queuedCount}
                        </span>
                      )}
                    </span>
                    <span
                      className="w-full text-center text-[10px] font-medium leading-tight"
                      style={{ color: active ? 'var(--ghana-black)' : '#4b5563' }}
                    >
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-gray-50 px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-900 text-xs font-bold text-white">
                {(profile?.name?.[0] ?? 'S').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-gray-900">{profile?.name ?? 'Staff'}</p>
                <p className="text-[11px] capitalize text-gray-500">{profile?.role ?? ''}</p>
              </div>
              <button
                type="button"
                onClick={() => { void signOut().then(() => navigate('/login', { replace: true })); close(); }}
                className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-900"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

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
          background: 'var(--ghana-green)',
          border: '2px solid var(--ghana-gold)',
          boxShadow: '0 12px 32px rgba(17,24,39,0.35), 0 2px 8px rgba(17,24,39,0.25)',
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <span className="grid grid-cols-3 gap-[5px]" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="h-[5px] w-[5px] rounded-full bg-white" />
            ))}
          </span>
        )}
      </button>
    </>
  );
}
