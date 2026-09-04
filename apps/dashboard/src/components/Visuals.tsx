import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatGHS } from '../lib/utils';

// ════════════════════════════════════════════════════════════════════════
// COLOR LEGEND — shows what each color means so anyone can understand
// ════════════════════════════════════════════════════════════════════════

interface LegendItem {
  color: string; // tailwind bg class e.g. 'bg-green-500'
  label: string;
}

export function ColorLegend({ items, className = '' }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-3 items-center ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-full ${item.color} shrink-0`} />
          <span className="text-[11px] text-gray-500 font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// GAUGE METER — animated circular gauge for a single metric
// ════════════════════════════════════════════════════════════════════════

export function GaugeMeter({
  value,
  max,
  label,
  sublabel,
  color = 'green',
  size = 120,
}: {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  color?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'orange' | 'teal';
  size?: number;
}) {
  const [animated, setAnimated] = useState(0);
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - animated);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimated(pct), 100);
    return () => clearTimeout(timeout);
  }, [pct]);

  const colorMap: Record<string, string> = {
    green: '#22c55e', red: '#ef4444', amber: '#f59e0b',
    blue: '#3b82f6', purple: '#a855f7', orange: '#f97316', teal: '#14b8a6',
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke={colorMap[color]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums text-gray-900">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <p className="text-xs font-medium text-gray-700 mt-1.5 text-center">{label}</p>
      {sublabel && <p className="text-[10px] text-gray-400 text-center">{sublabel}</p>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// HORIZONTAL BAR METER — for comparing items side by side
// ════════════════════════════════════════════════════════════════════════

export function BarMeter({
  value,
  max,
  color = 'green',
  label,
  rightLabel,
  height = 8,
}: {
  value: number;
  max: number;
  color?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'orange' | 'teal';
  label?: string;
  rightLabel?: string;
  height?: number;
}) {
  const [animated, setAnimated] = useState(0);
  const pct = max > 0 ? Math.min(value / max, 1) : 0;

  useEffect(() => {
    const timeout = setTimeout(() => setAnimated(pct), 50);
    return () => clearTimeout(timeout);
  }, [pct]);

  const colorMap: Record<string, string> = {
    green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500',
    blue: 'bg-blue-500', purple: 'bg-purple-500', orange: 'bg-orange-500', teal: 'bg-teal-500',
  };

  return (
    <div className="w-full">
      {(label || rightLabel) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs font-medium text-gray-600 truncate">{label}</span>}
          {rightLabel && <span className="text-xs tabular-nums text-gray-500">{rightLabel}</span>}
        </div>
      )}
      <div className="w-full rounded-full overflow-hidden" style={{ height, backgroundColor: '#f1f5f9' }}>
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${colorMap[color]}`}
          style={{ width: `${animated * 100}%` }}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// FUNNEL — animated sales funnel showing flow from top to bottom
// ════════════════════════════════════════════════════════════════════════

interface FunnelStep {
  label: string;
  value: number;
  color: string; // tailwind bg class
  textColor?: string;
}

export function SalesFunnel({ steps, title }: { steps: FunnelStep[]; title?: string }) {
  const maxValue = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-semibold text-gray-700 mb-3">{title}</p>}
      {steps.map((step, i) => {
        const widthPct = 100 - (i / steps.length) * 30;
        return (
          <div key={step.label} className="flex items-center gap-3">
            <div className="w-28 text-right shrink-0">
              <p className="text-xs font-medium text-gray-600">{step.label}</p>
            </div>
            <div className="flex-1 flex items-center">
              <div
                className={`h-10 rounded-lg ${step.color} flex items-center justify-center transition-all duration-700 ease-out shadow-sm`}
                style={{ width: `${widthPct}%`, minWidth: 60 }}
              >
                <span className={`text-xs font-bold tabular-nums ${step.textColor ?? 'text-white'}`}>
                  {step.value.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TREND INDICATOR — arrow + color showing direction
// ════════════════════════════════════════════════════════════════════════

export function TrendIndicator({ value, suffix = '%', size = 'sm' }: { value: number; suffix?: string; size?: 'sm' | 'md' }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  const color = isNeutral ? 'text-gray-400' : isPositive ? 'text-green-600' : 'text-red-600';
  const arrow = isNeutral ? '→' : isPositive ? '↑' : '↓';
  const fontSize = size === 'sm' ? 'text-[11px]' : 'text-sm';

  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${color} ${fontSize}`}>
      {arrow} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
// STATUS BADGE — color-coded badge for any status
// ════════════════════════════════════════════════════════════════════════

export function StatusBadge({
  color,
  children,
  pulse,
}: {
  color: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'orange';
  children: ReactNode;
  pulse?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${colorMap[color]}`}>
      {pulse && (
        <span className={`relative flex h-2 w-2`}>
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color === 'green' ? 'bg-green-400' : color === 'red' ? 'bg-red-400' : color === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${color === 'green' ? 'bg-green-500' : color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
        </span>
      )}
      {children}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
// COLORED STAT CARD — a stat card with a colored accent stripe
// ════════════════════════════════════════════════════════════════════════

export function ColorStatCard({
  label,
  value,
  color = 'blue',
  sublabel,
  trend,
  icon,
}: {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'orange' | 'teal';
  sublabel?: string;
  trend?: number;
  icon?: React.ReactNode;
}) {
  const borderColor: Record<string, string> = {
    green: 'border-l-green-500', red: 'border-l-red-500', amber: 'border-l-amber-500',
    blue: 'border-l-blue-500', purple: 'border-l-purple-500', orange: 'border-l-orange-500', teal: 'border-l-teal-500',
  };
  const valueColor: Record<string, string> = {
    green: 'text-green-700', red: 'text-red-700', amber: 'text-amber-700',
    blue: 'text-blue-700', purple: 'text-purple-700', orange: 'text-orange-700', teal: 'text-teal-700',
  };
  const iconBg: Record<string, string> = {
    green: 'bg-green-100', red: 'bg-red-100', amber: 'bg-amber-100',
    blue: 'bg-blue-100', purple: 'bg-purple-100', orange: 'bg-orange-100', teal: 'bg-teal-100',
  };

  return (
    <div className={`card p-3 sm:p-5 border-l-4 ${borderColor[color]} relative overflow-hidden`}>
      {icon && (
        <div className={`absolute top-2 right-2 sm:top-3 sm:right-3 h-7 w-7 sm:h-8 sm:w-8 rounded-lg ${iconBg[color]} flex items-center justify-center`}>
          {icon}
        </div>
      )}
      <p className="stat-label text-[9px] sm:text-[11px]">{label}</p>
      <p className={`text-lg sm:text-2xl font-bold tracking-tight mt-1.5 sm:mt-2 tabular-nums ${valueColor[color]}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
        {trend !== undefined && <TrendIndicator value={trend} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// STACKED BAR — for comparing composition across items
// ════════════════════════════════════════════════════════════════════════

interface StackedSegment {
  value: number;
  color: string; // tailwind bg class
  label: string;
}

export function StackedBar({ segments, height = 12 }: { segments: StackedSegment[]; height?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;

  return (
    <div className="w-full">
      <div className="flex rounded-full overflow-hidden" style={{ height }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${seg.color} transition-all duration-700 ease-out first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${seg.color}`} />
            <span className="text-[10px] text-gray-500">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ANIMATED COUNTER — counts up from 0 to target value
// ════════════════════════════════════════════════════════════════════════

export function AnimatedCounter({ value, prefix = '', suffix = '', duration = 1200 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        ref.current = requestAnimationFrame(tick);
      }
    }

    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {prefix}{display.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{suffix}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PROFIT BREAKDOWN — visual cost → profit breakdown for stock intake
// ════════════════════════════════════════════════════════════════════════

export function ProfitBreakdown({
  bulkCost,
  unitsPerBulk,
  perUnitCost,
  targetSellPrice,
  perUnitProfit,
  totalPotentialProfit,
  bulkUnitName = 'units',
}: {
  bulkCost: number;
  unitsPerBulk: number;
  perUnitCost: number;
  targetSellPrice: number;
  perUnitProfit: number;
  totalPotentialProfit: number;
  bulkUnitName?: string;
}) {
  const totalBulkUnits = Math.ceil(bulkCost > 0 ? bulkCost / perUnitCost : 0);

  return (
    <div className="card p-4 mb-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">How the profit is calculated</p>

      {/* Cost side */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 font-medium">Bulk purchase cost</p>
          <p className="text-lg font-bold text-red-600">{formatGHS(bulkCost)}</p>
          <p className="text-[10px] text-red-400">× {unitsPerBulk} units per box</p>
        </div>
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-600 font-medium">Per-unit cost</p>
          <p className="text-xl font-bold text-blue-600">{formatGHS(perUnitCost)}</p>
          <p className="text-[10px] text-blue-400">per {unitsPerBulk} {bulkUnitName}</p>
        </div>
      </div>

      {/* Sell side */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-green-50 border border-green-200">
          <p className="text-xs text-green-600 font-medium">Target sell price</p>
          <p className="text-lg font-bold text-green-600">{formatGHS(targetSellPrice)}</p>
          <p className="text-[10px] text-green-400">per bulk box</p>
        </div>
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
          <p className="text-xs text-purple-600 font-medium">Per-unit sell</p>
          <p className="text-xl font-bold text-purple-600">{formatGHS(targetSellPrice)}</p>
          <p className="text-[10px] text-purple-400">per unit</p>
        </div>
      </div>

      {/* Profit result */}
      <div className="border-t pt-4 mb-4">
        <p className="text-xs text-gray-500 font-medium mb-1">Expected profit</p>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${perUnitProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatGHS(perUnitProfit)} per unit
          </span>
          <span className="text-base text-gray-400">× {unitsPerBulk} units</span>
        </div>
        <p className={`text-lg font-bold ${totalPotentialProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatGHS(totalPotentialProfit)} total potential
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// PROGRESS RING — mini ring for inline status
// ════════════════════════════════════════════════════════════════════════

export function ProgressRing({ pct, color = '#22c55e', size = 32 }: { pct: number; color?: string; size?: number }) {
  const circumference = 2 * Math.PI * 12;
  const offset = circumference * (1 - Math.min(pct, 1));

  return (
    <svg width={size} height={size} viewBox="0 0 30 30" className="-rotate-90">
      <circle cx="15" cy="15" r="12" fill="none" stroke="#f1f5f9" strokeWidth="3" />
      <circle
        cx="15" cy="15" r="12" fill="none"
        stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  );
}
