import { useEffect, useId, useRef, useState } from 'react';

/**
 * BranchVessel — the owner dashboard's store-performance funnel, redrawn as
 * a living calabash instead of a rectangular tube.
 *
 * A calabash is the vessel West African shops have actually used to hold
 * measure and money, so "how full is this shop?" reads instantly without a
 * legend. The liquid's COLOUR is the shop's health score (red → amber →
 * green, see lib/branchHealth.ts), the LEVEL is its revenue against the
 * busiest shop, and the surface never stops moving — so the tile communicates
 * performance before a single number is read.
 *
 * Tapping a vessel opens the drill-down page that explains the colour.
 */

// Wide-mouthed gourd silhouette — deliberately asymmetric (a real calabash
// never is) so it reads as hand-shaped rather than machine-drawn.
const GOURD =
  'M60 8 ' +
  'C78 8 92 12 94 21 ' +       // rim, right side
  'C96 30 87 34 85 41 ' +
  'C104 54 112 78 112 104 ' +  // shoulder into the belly
  'C112 133 89 152 60 152 ' +  // belly bottom
  'C31 152 8 133 8 104 ' +
  'C8 78 16 54 35 41 ' +
  'C33 34 24 30 26 21 ' +
  'C28 12 42 8 60 8 Z';

// Two full wave periods wide so a -120px translate loops seamlessly.
const WAVE =
  'M0 10 Q15 0 30 10 T60 10 T90 10 T120 10 ' +
  'T150 10 T180 10 T210 10 T240 10 ' +
  'L240 260 L0 260 Z';

const TOP = 16;      // highest the liquid surface can sit (inside the rim)
const BOTTOM = 150;  // lowest point of the belly

export default function BranchVessel({
  fillPct,
  color,
  label,
  value,
  grade,
  onClick,
  size = 132,
  active = false,
}: {
  fillPct: number;
  color: string;
  label: string;
  value: string;
  grade?: string;
  onClick?: () => void;
  size?: number;
  active?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const fill = Math.max(0, Math.min(100, fillPct));
  // Liquid surface position in viewBox units — empty vessel sits at the
  // belly floor, a full one reaches just under the rim.
  const surfaceY = BOTTOM - (fill / 100) * (BOTTOM - TOP);

  // Rise-from-empty on mount: start parked below the gourd, then settle.
  const [risen, setRisen] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      // Double rAF so the browser paints the "empty" frame first and the
      // transition actually runs instead of snapping.
      requestAnimationFrame(() => requestAnimationFrame(() => setRisen(true)));
      return;
    }
    setRisen(true);
  }, [fill]);

  // Bubbles only make sense once there is liquid to rise through.
  const showBubbles = fill > 18;

  return (
    <div className="flex flex-col items-center">
      {/* Halo — a soft breathing wash of the health colour behind the gourd */}
      <div className="relative flex items-center justify-center">
        <div
          aria-hidden
          className="bv-halo pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color} 0%, transparent 68%)`,
            transform: 'scale(1.5)',
            opacity: raisedOpacity(fill),
          }}
        />
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          aria-label={
            onClick
              ? `${label}: ${value}${grade ? `, ${grade}` : ''}. Open this shop's breakdown.`
              : label
          }
          className={`relative block bv-sway transition-transform duration-200 ${
            onClick
              ? 'cursor-pointer hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2'
              : 'cursor-default'
          }`}
          style={{
            width: size,
            filter: `drop-shadow(0 6px 16px ${color}55)`,
            ...(active ? { '--tw-ring-color': color } as React.CSSProperties : {}),
          }}
        >
          <svg
            width={size}
            height={(size * 170) / 120}
            viewBox="0 0 120 170"
            fill="none"
            aria-hidden
          >
            <defs>
              <clipPath id={`clip-${uid}`}>
                <path d={GOURD} />
              </clipPath>
              {/* Vertical sheen down the gourd's left flank */}
              <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="rgba(255,255,255,0.30)" />
                <stop offset="0.45" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>

            {/* Empty-vessel interior */}
            <path d={GOURD} fill="#f4f2ec" />

            {/* ── Liquid ─────────────────────────────────────────────── */}
            <g clipPath={`url(#clip-${uid})`}>
              <g
                style={{
                  transform: `translateY(${risen ? 0 : 175}px)`,
                  transition: 'transform 1.5s cubic-bezier(.22,1,.36,1)',
                }}
              >
                <g transform={`translate(0 ${surfaceY})`}>
                  {/* Back surface — slower, paler, sits a touch higher */}
                  <g className={fill > 2 ? 'bv-wave-back' : ''}>
                    <path
                      d={WAVE}
                      fill={color}
                      opacity="0.45"
                      transform="translate(0 -6)"
                      style={{ willChange: 'transform' }}
                    />
                  </g>
                  {/* Front surface — the crisp waterline */}
                  <g className={fill > 2 ? 'bv-wave-front' : ''}>
                    <path
                      d={WAVE}
                      fill={color}
                      opacity="0.92"
                      style={{ willChange: 'transform' }}
                    />
                  </g>
                  {/* Bright meniscus right on the surface */}
                  <rect x="0" y="8" width="240" height="2.5" fill="rgba(255,255,255,0.55)" />
                </g>

                {/* Bubbles rising through the liquid */}
                {showBubbles && (
                  <g clipPath={`url(#clip-${uid})`}>
                    {[
                      { cx: 46, delay: 0, r: 3.4 },
                      { cx: 68, delay: 1.3, r: 2.6 },
                      { cx: 58, delay: 2.5, r: 4.0 },
                      { cx: 76, delay: 3.4, r: 2.2 },
                    ].map((b, i) => (
                      <circle
                        key={i}
                        className="bv-bubble"
                        cx={b.cx}
                        cy={BOTTOM - 6}
                        r={b.r}
                        fill="rgba(255,255,255,0.7)"
                        style={{ animationDelay: `${b.delay}s` }}
                      />
                    ))}
                  </g>
                )}
              </g>
            </g>

            {/* Gourd outline — hand-weighted stroke */}
            <path
              d={GOURD}
              stroke="rgba(26,26,46,0.32)"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {/* Sheen on top of everything */}
            <path d={GOURD} fill={`url(#sheen-${uid})`} />

            {/* Stem nub at the crown — the calabash handle */}
            <path
              d="M56 9 C56 3 64 3 64 9"
              stroke="rgba(26,26,46,0.32)"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      {/* Readout under the vessel */}
      <div className="mt-1 text-center">
        <p className="text-sm font-bold tabular-nums text-gray-900 leading-tight">{value}</p>
        <p className="text-[11px] text-gray-500 max-w-[86px] truncate leading-tight">{label}</p>
        {grade && (
          <p
            className="mt-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color }}
          >
            {grade}
          </p>
        )}
      </div>
    </div>
  );
}

/** Halo opacity scales with how full (and therefore how alive) the vessel is. */
function raisedOpacity(fill: number): number {
  if (fill <= 1) return 0.08;
  return 0.3 + (fill / 100) * 0.45;
}
