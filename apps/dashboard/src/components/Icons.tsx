/**
 * BranchPort Icon System
 *
 * Three visual languages, consistently applied:
 * 1. Currency-note-style imagery — anything money-related (sales, profit, cost)
 * 2. Simple universal icons — box for stock, person for staff, shop for branch
 * 3. Adinkra symbols — worked in deliberately, not decoratively
 *
 * Adinkra symbol meanings mapped to functions:
 * - Funtunfunefu-Denkyemfunefu (unity) → multi-branch overview
 * - Dwennimmen (humility + strength) → audit/owner trust view
 * - Sankofa (learn from the past) → history/review
 * - Aya (enterprise/endurance) → stock intake/inventory
 * - Nkyinkyim (initiative/adaptability) → stock allocation/routing
 * - Akoben (vigilance) → alerts/flags
 * - Nyame Dua (God's altar / presence) → dashboard/home
 * - Epa (handcuffs/law) → audit enforcement
 */

import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// ═══════════════════════════════════════════════════════════════════════
// ADINKRA SYMBOLS
// ═══════════════════════════════════════════════════════════════════════

/** Funtunfunefu-Denkyemfunefu — two crocodiles sharing one stomach.
 *  Meaning: unity, togetherness, shared destiny.
 *  Used for: multi-branch overview, stores, team unity. */
export function AdinkraUnity({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Two stylized crocodiles facing each other, sharing a central stomach */}
      <path d="M4 12c0-3 2-5 4-5s3 1 4 3c1-2 2-3 4-3s4 2 4 5" />
      <path d="M4 12c0 3 2 5 4 5s3-1 4-3c1 2 2 3 4 3s4-2 4-5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** Dwennimmen — ram's horns.
 *  Meaning: humility together with strength, patience.
 *  Used for: owner audit view, trust, oversight. */
export function AdinkraTrust({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Four ram horns in a balanced pattern */}
      <path d="M12 4c-4 0-6 3-6 5s2 3 4 2" />
      <path d="M12 4c4 0 6 3 6 5s-2 3-4 2" />
      <path d="M12 20c-4 0-6-3-6-5s2-3 4-2" />
      <path d="M12 20c4 0 6-3 6-5s-2-3-4-2" />
    </svg>
  );
}

/** Sankofa — bird looking backward.
 *  Meaning: learn from the past, go back and get it.
 *  Used for: history, audit log, past records. */
export function AdinkraHistory({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Stylized Sankofa bird */}
      <path d="M16 4c2 0 4 2 4 4s-1 3-3 3h-2" />
      <path d="M16 4c-3 0-6 2-7 5s-1 6 0 8" />
      <path d="M9 17l-2 3" />
      <path d="M11 18l-1 3" />
      <path d="M9 17c-2-1-4-3-4-5" />
      <circle cx="17" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

/** Aya — fern leaf.
 *  Meaning: endurance, enterprise, resourcefulness.
 *  Used for: stock intake, inventory, products. */
export function AdinkraStock({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Stylized fern / aya pattern */}
      <path d="M12 3v18" />
      <path d="M8 7l4 2 4-2" />
      <path d="M7 11l5 2 5-2" />
      <path d="M8 15l4 2 4-2" />
    </svg>
  );
}

/** Nkyinkyim — twisting path.
 *  Meaning: initiative, dynamism, adaptability.
 *  Used for: stock allocation, routing stock to branches. */
export function AdinkraAllocate({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Zigzag / twisting path */}
      <path d="M4 6l4 4-4 4 4 4-4 4" />
      <path d="M20 6l-4 4 4 4-4 4 4 4" />
    </svg>
  );
}

/** Akoben — war horn / vigilance.
 *  Meaning: vigilance, wariness, readiness.
 *  Used for: alerts, flags, warnings. */
export function AdinkraAlert({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Horn shape */}
      <path d="M6 4h12v6l-3 4v2h-6v-2l-3-4V4z" />
      <path d="M10 18h4" />
      <path d="M11 20h2" />
    </svg>
  );
}

/** Nyame Dua — God's altar / sacred presence.
 *  Meaning: divine presence, protection.
 *  Used for: dashboard home, overview. */
export function AdinkraHome({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Altar / cross-staff pattern */}
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M7 7l10 10" />
      <path d="M17 7l-10 10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Epa — handcuffs / law.
 *  Meaning: law, justice, enforcement.
 *  Used for: audit enforcement, compliance. */
export function AdinkraAudit({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Handcuff-like linked circles */}
      <circle cx="8" cy="12" r="4" />
      <circle cx="16" cy="12" r="4" />
      <path d="M12 8v8" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CURRENCY-NOTE STYLE ICONS — money-related
// ═══════════════════════════════════════════════════════════════════════

/** Currency note icon — for sales, money, revenue */
export function IconCurrency({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Stylized banknote */}
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M13.5 10.5c-.5-.5-1.5-.5-1.5 0s1 0.5 1.5 1 1.5 1 1.5 0-1-.5-1.5-1z" />
    </svg>
  );
}

/** Profit / growth icon — green upward arrow with currency feel */
export function IconProfit({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 17l6-6 4 4 8-10" />
      <path d="M15 5h6v6" />
    </svg>
  );
}

/** Cost / price tag icon */
export function IconCost({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Supplier / factory icon */
export function IconSupplier({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 20h20" />
      <path d="M4 20V10l4-3v13" />
      <path d="M10 20V8l4-3v15" />
      <path d="M16 20V6l4-3v17" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSAL ICONS — standard actions/objects
// ═══════════════════════════════════════════════════════════════════════

/** Box / package icon — stock, inventory */
export function IconBox({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8V21H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M12 12v9" />
      <path d="M12 12l8-4" />
      <path d="M12 12L4 8" />
    </svg>
  );
}

/** Person icon — staff, team */
export function IconPerson({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0112 0v1" />
    </svg>
  );
}

/** Shop / store / branch icon */
export function IconShop({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9l9-5 9 5" />
      <path d="M4 9v11h16V9" />
      <path d="M9 21v-6h6v6" />
      <path d="M4 9c0 1.5 3.5 3 8 3s8-1.5 8-3" />
    </svg>
  );
}

/** Cart / sale icon — POS */
export function IconCart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </svg>
  );
}

/** Settings / gear icon */
export function IconSettings({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

/** Receipt / invoice icon */
export function IconReceipt({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2L4 2z" />
      <path d="M8 10h8" />
      <path d="M8 14h4" />
    </svg>
  );
}

/** Team / group icon */
export function IconTeam({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <circle cx="17" cy="7" r="3" />
      <path d="M21 21v-2a4 4 0 00-3-3.87" />
    </svg>
  );
}

/** Chart / analytics icon */
export function IconChart({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

/** Shield / security icon — for audit trust */
export function IconShield({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** Phone icon — for POS / activation */
export function IconPhone({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <path d="M12 18h.01" />
    </svg>
  );
}

/** Link / chain icon — for activation links */
export function IconLink({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Filter icon */
export function IconFilter({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

/** Search icon */
export function IconSearch({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

/** Arrow back icon */
export function IconBack({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TUBE / FUNNEL VISUAL — branch performance rendering
// ═══════════════════════════════════════════════════════════════════════

/** Performance tube — renders a single branch's performance as a vertical tube
 *  with fill level representing relative performance. */
export function PerformanceTube({
  fillPct,
  label,
  value,
  color = '#22c55e',
  height = 120,
  width = 36,
}: {
  fillPct: number;
  label: string;
  value: string;
  color?: string;
  height?: number;
  width?: number;
}) {
  const fill = Math.max(0, Math.min(100, fillPct));
  const fillH = (fill / 100) * (height - 8);
  const tubeRadius = width / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Tube outline */}
        <rect
          x="1"
          y="4"
          width={width - 2}
          height={height - 8}
          rx={tubeRadius - 1}
          fill="#f1f5f9"
          stroke="#e2e8f0"
          strokeWidth="1.5"
        />
        {/* Fill from bottom */}
        <rect
          x="1"
          y={height - 4 - fillH}
          width={width - 2}
          height={fillH}
          rx={tubeRadius - 1}
          fill={color}
          opacity="0.85"
          style={{ transition: 'height 1s ease-out, y 1s ease-out' }}
        />
        {/* Level lines */}
        {[25, 50, 75].map((pct) => (
          <line
            key={pct}
            x1="4"
            y1={height - 4 - (pct / 100) * (height - 8)}
            x2={width - 4}
            y2={height - 4 - (pct / 100) * (height - 8)}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.5"
          />
        ))}
      </svg>
      <div className="text-center">
        <p className="text-[10px] font-bold tabular-nums text-gray-900">{value}</p>
        <p className="text-[9px] text-gray-500 max-w-[60px] truncate">{label}</p>
      </div>
    </div>
  );
}
