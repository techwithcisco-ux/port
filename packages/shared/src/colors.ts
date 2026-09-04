// ── Color System ────────────────────────────────────────────────────────
// Ghanaian informal market friendly colors:
// 🟢 Green = good, profit, healthy, money IN
// 🔴 Red = bad, loss, danger, money OWED / going OUT
// 🟡 Amber/Yellow = warning, pending, caution
// 🔵 Blue = neutral, info, revenue, data
// 🟣 Purple = premium, special, highlight
// Each color has: bg, text, border, ring variants for every context.

export const COLORS = {
  green: {
    50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
    400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534',
  },
  red: {
    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
    400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b',
  },
  amber: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
    400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e',
  },
  blue: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
    400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af',
  },
  purple: {
    50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
    400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8',
  },
  teal: {
    50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4',
    400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59',
  },
  orange: {
    50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74',
    400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412',
  },
} as const;

export type ColorName = keyof typeof COLORS;

/** Get the appropriate color for a financial metric. */
export function profitColor(value: number): ColorName {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return 'amber';
}

export function stockHealthColor(remaining: number, total: number): ColorName {
  if (total === 0) return 'red';
  const ratio = remaining / total;
  if (ratio > 0.5) return 'green';
  if (ratio > 0.2) return 'amber';
  return 'red';
}

export function debtorColor(daysOld: number): ColorName {
  if (daysOld <= 7) return 'green';
  if (daysOld <= 30) return 'amber';
  if (daysOld <= 60) return 'orange';
  return 'red';
}

export function trendColor(change: number): ColorName {
  if (change > 5) return 'green';
  if (change < -5) return 'red';
  if (change > 0) return 'green';
  if (change < 0) return 'red';
  return 'amber';
}

/** Color class strings for Tailwind. */
export function colorClasses(color: ColorName) {
  return {
    bg50: `bg-${color}-50`,
    bg100: `bg-${color}-100`,
    bg200: `bg-${color}-200`,
    text600: `text-${color}-600`,
    text700: `text-${color}-700`,
    text800: `text-${color}-800`,
    border200: `border-${color}-200`,
    border300: `border-${color}-300`,
    ring200: `ring-${color}-200`,
  };
}
