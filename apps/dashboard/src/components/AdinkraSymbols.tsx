/**
 * Detailed Adinkra Symbol SVG Components
 *
 * Authentic geometric representations of Ghanaian cultural symbols.
 * Gye Nyame is public domain (CC0) from Open Clip Art Library.
 * Others are traditional geometric patterns that are in the public domain.
 *
 * Each symbol includes its cultural meaning for accessibility.
 */

import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// ═══════════════════════════════════════════════════════════════════════
// GYE NYAME — "Except God" — Supremacy of God
// The most popular Adinkra symbol. Two opposing S-curves with knobs
// representing the knuckles of a clenched fist (power).
// Source: Open Clip Art Library, CC0 Public Domain
// ═══════════════════════════════════════════════════════════════════════
export function GyeNyame({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Gye Nyame — Except God"
      role="img"
      {...props}
    >
      {/* Central body - opposing curves forming the iconic shape */}
      <path d="M50 15 C35 15, 20 25, 20 40 C20 48, 25 52, 30 50 C35 48, 32 42, 35 38 C38 34, 42 35, 44 38 C46 41, 44 46, 40 48 C36 50, 38 56, 42 58 C46 60, 50 56, 50 52 C50 48, 46 46, 48 42 C50 38, 55 36, 58 40 C61 44, 58 50, 54 52 C50 54, 52 60, 56 62 C60 64, 64 58, 64 54 C64 48, 58 42, 60 36 C62 30, 68 26, 72 30 C76 34, 74 42, 70 46 C66 50, 68 56, 72 58 C76 60, 80 55, 80 50 C80 38, 70 25, 55 15 Z" />
      {/* Knobs/knuckles down the center representing power */}
      <circle cx="50" cy="30" r="3.5" />
      <circle cx="50" cy="42" r="3.5" />
      <circle cx="50" cy="54" r="3.5" />
      <circle cx="50" cy="66" r="3.5" />
      {/* Top curl */}
      <path d="M38 18 C28 10, 15 15, 15 28 C15 35, 20 38, 25 35 C30 32, 28 25, 32 22 C36 19, 38 18, 38 18 Z" />
      {/* Bottom curl */}
      <path d="M62 82 C72 90, 85 85, 85 72 C85 65, 80 62, 75 65 C70 68, 72 75, 68 78 C64 81, 62 82, 62 82 Z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SANKOFA — "Go back and get it" — Learn from the past
// A bird looking backward, sometimes with an egg in its beak.
// Also represented as a heart with spirals.
// ═══════════════════════════════════════════════════════════════════════
export function Sankofa({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Sankofa — Go back and get it"
      role="img"
      {...props}
    >
      {/* Bird body - looking backward */}
      <path d="M55 30 C55 20, 40 12, 30 18 C20 24, 18 35, 22 42 C26 49, 35 48, 40 44 C45 40, 42 34, 38 32 C34 30, 28 32, 28 36 C28 40, 32 42, 36 40" />
      {/* Head turned backward */}
      <circle cx="25" cy="30" r="6" />
      {/* Eye */}
      <circle cx="23" cy="29" r="1.5" fill="white" />
      {/* Beak */}
      <path d="M18 30 L12 28 L18 33 Z" />
      {/* Egg in beak - representing the future/next generation */}
      <ellipse cx="13" cy="27" rx="3" ry="4" />
      {/* Body extending down */}
      <path d="M40 44 C45 50, 50 58, 48 68 C46 78, 55 88, 65 85 C75 82, 80 72, 78 62 C76 52, 68 48, 60 50 C52 52, 50 45, 55 40" />
      {/* Tail feathers */}
      <path d="M65 85 C70 90, 78 88, 82 82" />
      <path d="M62 88 C68 94, 76 92, 80 86" />
      <path d="M58 90 C62 96, 70 96, 74 90" />
      {/* Feet */}
      <path d="M48 68 L42 80 M42 80 L38 76 M42 80 L46 76" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BLACK STAR OF AFRICA — Ghana's national symbol
// The black five-pointed star on the Ghana flag, representing African
// freedom and unity. Placed by Kwame Nkrumah.
// ═══════════════════════════════════════════════════════════════════════
export function BlackStar({ size = 48, color = '#1a1a2e', ...props }: IconProps) {
  // Five-pointed star geometry
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 2) + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 40 : 18;
    points.push([50 + r * Math.cos(angle), 50 - r * Math.sin(angle)]);
  }
  const starPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-label="Black Star of Africa — Ghana"
      role="img"
      {...props}
    >
      <path d={starPath} fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DWENNIMMEN — "Ram's horns" — Humility and strength
// Four ram's horns in a balanced pattern. Used on Ghana's 100-cedi note.
// ═══════════════════════════════════════════════════════════════════════
export function Dwennimmen({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      aria-label="Dwennimmen — Humility and Strength"
      role="img"
      {...props}
    >
      {/* Four ram horns spiraling outward from center */}
      {/* Top-left horn */}
      <path d="M50 50 C50 35, 40 25, 25 25 C15 25, 10 32, 15 38 C20 44, 30 42, 35 38" />
      <path d="M35 38 C38 35, 40 30, 38 25" />
      {/* Top-right horn */}
      <path d="M50 50 C50 35, 60 25, 75 25 C85 25, 90 32, 85 38 C80 44, 70 42, 65 38" />
      <path d="M65 38 C62 35, 60 30, 62 25" />
      {/* Bottom-left horn */}
      <path d="M50 50 C50 65, 40 75, 25 75 C15 75, 10 68, 15 62 C20 56, 30 58, 35 62" />
      <path d="M35 62 C38 65, 40 70, 38 75" />
      {/* Bottom-right horn */}
      <path d="M50 50 C50 65, 60 75, 75 75 C85 75, 90 68, 85 62 C80 56, 70 58, 65 62" />
      <path d="M65 62 C62 65, 60 70, 62 75" />
      {/* Center dot */}
      <circle cx="50" cy="50" r="3" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// NSOROMMA — "Star" — Child of the heavens / guardianship
// A star with rays, representing watchfulness and guardianship.
// ═══════════════════════════════════════════════════════════════════════
export function Nsoromma({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Nsoromma — Child of the heavens"
      role="img"
      {...props}
    >
      {/* Star with rays */}
      <path d="M50 5 L58 38 L95 38 L65 58 L75 92 L50 70 L25 92 L35 58 L5 38 L42 38 Z" />
      {/* Inner star cutout for detail */}
      <circle cx="50" cy="48" r="8" fill="white" opacity="0.3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// FUNTUNFUNEFU-DENKYEMFUNEFU — Two crocodiles sharing one stomach
// Meaning: unity, shared destiny, democracy
// ═══════════════════════════════════════════════════════════════════════
export function Funtunfunefu({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Funtunfunefu — Unity in diversity"
      role="img"
      {...props}
    >
      {/* Top crocodile facing left */}
      <path d="M15 35 L25 30 L30 32 C35 34, 40 30, 45 32 C50 34, 55 30, 60 32 L70 30 L85 35" />
      {/* Head of top crocodile */}
      <path d="M15 35 L8 32 L8 38 L15 38" />
      {/* Tail of top crocodile */}
      <path d="M85 35 L92 30 L95 35 L92 40 L85 38" />
      {/* Bottom crocodile facing right */}
      <path d="M85 65 L75 70 L70 68 C65 66, 60 70, 55 68 C50 66, 45 70, 40 68 L30 70 L15 65" />
      {/* Head of bottom crocodile */}
      <path d="M85 65 L92 68 L92 62 L85 62" />
      {/* Tail of bottom crocodile */}
      <path d="M15 65 L8 70 L5 65 L8 60 L15 62" />
      {/* Shared stomach in center */}
      <ellipse cx="50" cy="50" rx="12" ry="8" strokeWidth="3" />
      <circle cx="50" cy="50" r="3" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ADINKRAHENE — "Chief of Adinkra" — Greatness, leadership
// Three concentric circles representing charisma and leadership.
// ═══════════════════════════════════════════════════════════════════════
export function Adinkrahene({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="3"
      aria-label="Adinkrahene — Leadership and Greatness"
      role="img"
      {...props}
    >
      <circle cx="50" cy="50" r="42" />
      <circle cx="50" cy="50" r="28" />
      <circle cx="50" cy="50" r="14" />
      <circle cx="50" cy="50" r="4" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AYA — "Fern" — Endurance, enterprise, resourcefulness
// ═══════════════════════════════════════════════════════════════════════
export function Aya({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Aya — Endurance and Enterprise"
      role="img"
      {...props}
    >
      {/* Central stem */}
      <rect x="47" y="10" width="6" height="80" rx="3" />
      {/* Leaves alternating left and right */}
      {[20, 35, 50, 65, 80].map((y, i) => (
        <g key={i}>
          <ellipse
            cx={i % 2 === 0 ? 32 : 68}
            cy={y}
            rx="14"
            ry="5"
            transform={`rotate(${i % 2 === 0 ? -20 : 20}, ${i % 2 === 0 ? 32 : 68}, ${y})`}
          />
        </g>
      ))}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// NYAME DUA — "God's altar / tree" — Divine presence, protection
// A cross-like pattern with circular elements.
// ═══════════════════════════════════════════════════════════════════════
export function NyameDua({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Nyame Dua — God's Altar"
      role="img"
      {...props}
    >
      {/* Central cross */}
      <rect x="46" y="10" width="8" height="80" rx="2" />
      <rect x="10" y="46" width="80" height="8" rx="2" />
      {/* Diagonal cross */}
      <rect x="46" y="10" width="8" height="80" rx="2" transform="rotate(45, 50, 50)" />
      <rect x="10" y="46" width="80" height="8" rx="2" transform="rotate(45, 50, 50)" />
      {/* Central circle */}
      <circle cx="50" cy="50" r="10" />
      <circle cx="50" cy="50" r="5" fill="white" />
      {/* Corner circles */}
      <circle cx="20" cy="20" r="5" />
      <circle cx="80" cy="20" r="5" />
      <circle cx="20" cy="80" r="5" />
      <circle cx="80" cy="80" r="5" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GHANA FLAG STRIPE — Red, Gold, Green with Black Star
// Used as decorative divider / header stripe
// ═══════════════════════════════════════════════════════════════════════
export function GhanaFlagStripe({
  width = '100%',
  height = 6,
  showStar = false,
  className = '',
}: {
  width?: string | number;
  height?: number;
  showStar?: boolean;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ width, height: showStar ? height + 2 : height, display: 'flex', overflow: 'hidden', borderRadius: showStar ? 3 : 0 }}
    >
      <div style={{ flex: 1, background: '#CE1126' }} />
      <div style={{ flex: 1, background: '#FCD116', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showStar && <BlackStar size={height * 2} color="#1a1a2e" />}
      </div>
      <div style={{ flex: 1, background: '#006B3F' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// KENTE PATTERN — Traditional woven cloth pattern
// Used as background decoration
// ═══════════════════════════════════════════════════════════════════════
export function KentePattern({
  width = 200,
  height = 200,
  opacity = 0.08,
  className = '',
}: {
  width?: number;
  height?: number;
  opacity?: number;
  className?: string;
}) {
  const colors = ['#CE1126', '#FCD116', '#006B3F', '#1B1464', '#FF6B00', '#8B4513'];
  const stripeWidth = 12;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ opacity }}
      aria-hidden="true"
    >
      <defs>
        <pattern id="kente-v" patternUnits="userSpaceOnUse" width={stripeWidth * colors.length} height={height}>
          {colors.map((c, i) => (
            <rect key={`v${i}`} x={i * stripeWidth} y={0} width={stripeWidth} height={height} fill={c} />
          ))}
        </pattern>
        <pattern id="kente-h" patternUnits="userSpaceOnUse" width={width} height={stripeWidth * colors.length}>
          {colors.map((c, i) => (
            <rect key={`h${i}`} x={0} y={i * stripeWidth} width={width} height={stripeWidth} fill={c} />
          ))}
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#kente-v)" />
      <rect width={width} height={height} fill="url(#kente-h)" style={{ mixBlendMode: 'overlay' }} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// NKOSUOHENE / NKRUMAH SILHOUETTE — Profile silhouette
// A dignified profile silhouette representing Dr. Kwame Nkrumah
// ═══════════════════════════════════════════════════════════════════════
export function NkrumahSilhouette({ size = 48, color = '#1a1a2e', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Dr. Kwame Nkrumah — Osagyefo"
      role="img"
      {...props}
    >
      {/* Simplified dignified profile silhouette */}
      <path d="M55 8 C45 8, 35 12, 32 20 C29 28, 30 32, 32 36 C34 40, 36 42, 35 45 C34 48, 30 50, 28 52 C26 54, 25 58, 26 62 C27 66, 30 68, 32 70 L32 78 C32 80, 34 82, 36 82 L64 82 C66 82, 68 80, 68 78 L68 70 C70 68, 73 66, 74 62 C75 58, 74 54, 72 52 C70 50, 66 48, 65 45 C64 42, 66 40, 68 36 C70 32, 71 28, 68 20 C65 12, 65 8, 55 8 Z" />
      {/* Collar detail */}
      <path d="M36 76 L50 70 L64 76" fill="white" opacity="0.3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BIG SIX — Six stars arranged in a circle representing the
// founding fathers of Ghana's independence:
// 1. Kwame Nkrumah  2. J.B. Danquah  3. Edward Akufo-Addo
// 4. Joseph Boakye Danquah  5. Emmanuel Obetsebi-Lamptey  6. William Ofori-Atta
// ═══════════════════════════════════════════════════════════════════════
export function BigSix({ size = 48, color = 'currentColor', ...props }: IconProps) {
  const cx = 50, cy = 50, r = 30;
  const stars: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
    stars.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }

  // Small 5-pointed star at each position
  const starPath = (sx: number, sy: number, sr: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? sr : sr * 0.4;
      pts.push([sx + rad * Math.cos(a), sy - rad * Math.sin(a)]);
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill={color}
      aria-label="Big Six — Founding fathers of Ghana"
      role="img"
      {...props}
    >
      {stars.map(([sx, sy], i) => (
        <path key={i} d={starPath(sx, sy, 10)} />
      ))}
      {/* Center unity circle */}
      <circle cx={cx} cy={cy} r="6" fill="none" stroke={color} strokeWidth="2" />
      <circle cx={cx} cy={cy} r="2" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AYA (FERN) — Endurance and Enterprise
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// NKYINKYIM — "Twisting" — Initiative and Dynamism
// A zigzag path representing the twists of life.
// ═══════════════════════════════════════════════════════════════════════
export function Nkyinkyim({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Nkyinkyim — Initiative and Dynamism"
      role="img"
      {...props}
    >
      {/* Twisting zigzag path */}
      <path d="M15 20 L35 20 L35 40 L15 40 L15 60 L35 60 L35 80 L15 80" />
      <path d="M50 20 L70 20 L70 40 L50 40 L50 60 L70 60 L70 80 L50 80" />
      {/* Connecting curve */}
      <path d="M35 80 C42 80, 50 75, 50 70 L50 20" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ESSO — "Rhombus" — Good fortune, diligence
// ═══════════════════════════════════════════════════════════════════════
export function Esso({ size = 48, color = 'currentColor', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="3"
      aria-label="Esso — Good fortune"
      role="img"
      {...props}
    >
      <rect x="25" y="25" width="50" height="50" transform="rotate(45, 50, 50)" />
      <rect x="35" y="35" width="30" height="30" transform="rotate(45, 50, 50)" />
      <circle cx="50" cy="50" r="5" fill={color} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CONVENIENCE: Export all symbols as a map for lookup by name
// ═══════════════════════════════════════════════════════════════════════
export const ADINKRA_MAP = {
  'gye-nyame': GyeNyame,
  'sankofa': Sankofa,
  'black-star': BlackStar,
  'dwennimmen': Dwennimmen,
  'nsoromma': Nsoromma,
  'funtunfunefu': Funtunfunefu,
  'adinkrahene': Adinkrahene,
  'aya': Aya,
  'nyame-dua': NyameDua,
  'nkyinkyim': Nkyinkyim,
  'big-six': BigSix,
  'nkrumah': NkrumahSilhouette,
  'esso': Esso,
} as const;

export type AdinkraName = keyof typeof ADINKRA_MAP;
