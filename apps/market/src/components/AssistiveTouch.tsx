import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMarketAuth } from '../contexts/AuthContext';

// Floating AssistiveTouch circle for Market analytics: tap it and the
// section menu pops open next to it. Draggable, position remembered.

const BTN = 60;
const POS_KEY = 'branchport-market-at-pos';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', hint: 'Platform stats', icon: '📊' },
  { to: '/users', label: 'User Directory', hint: 'People & activity', icon: '👥' },
  { to: '/items', label: 'Items Tracker', hint: 'Prices & trends', icon: '📦' },
  { to: '/live', label: 'Live Market', hint: 'Ticker board', icon: '📈' },
  { to: '/analytics', label: 'Usage Analytics', hint: 'Growth graphs', icon: '⏱' },
  { to: '/reports', label: 'Reports', hint: 'CSV exports', icon: '📄' },
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
  const location = useLocation();
  const { logout } = useMarketAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(() => clampPos(loadPos() ?? defaultPos()));
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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

  const vw = typeof window === 'undefined' ? 400 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const openUp = pos.y + BTN / 2 > vh / 2;
  const panelW = Math.min(300, vw - 24);
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
          aria-label="Market menu"
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
          <div className="p-3">
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Market Analytics
            </p>
            {NAV_ITEMS.map((item, i) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  onClick={close}
                  className="flex items-center gap-3 rounded-2xl px-3 text-gray-900 active:bg-gray-100"
                  style={{
                    minHeight: 54,
                    background: active ? '#111827' : undefined,
                    color: active ? '#fff' : undefined,
                    animation: 'assistive-pop 0.18s ease both',
                    animationDelay: `${i * 20}ms`,
                  }}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-lg">
                    {item.icon}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium leading-tight">{item.label}</span>
                    <span className="block text-xs text-gray-400">{item.hint}</span>
                  </span>
                  {active && <span className="text-xs text-emerald-400">●</span>}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => { logout(); close(); }}
              className="mt-2 w-full rounded-2xl bg-red-500/10 py-3 text-sm font-medium text-red-500 hover:bg-red-500/20"
            >
              Sign out
            </button>
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
        className="fixed z-50 grid touch-none place-items-center rounded-full bg-gray-900 text-white shadow-2xl transition-transform active:scale-95"
        style={{
          left: pos.x,
          top: pos.y,
          width: BTN,
          height: BTN,
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
