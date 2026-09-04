import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatGHS } from './utils';

// Shared, monochrome chart kit used by the manager Sales report and the
// owner overview. Deliberately spare: no legend, no axis lines, one
// hairline grid, rounded bars in the single dark accent, and a clean
// white tooltip. Full figures appear in the tooltip; large axis labels
// are compacted so the chart stays readable at a glance.

interface MoneyPoint {
  label: string;
  value: number;
}

function compactGHS(n: number): string {
  return `GHS ${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string | number }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-[0_4px_12px_rgba(17,24,39,0.10)]">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      {payload.map((p, i) => (
        <p key={`${p.dataKey ?? p.name ?? i}`} className="text-sm font-semibold text-gray-900 tabular-nums">
          {formatGHS(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

export function RevenueByDay({ data }: { data: MoneyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid stroke="#f1f3f5" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tickFormatter={(v: number) => compactGHS(v)}
          tick={{ fontSize: 12, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
        <Bar dataKey="value" name="Revenue" fill="#111827" radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueByBranch({ data }: { data: MoneyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid stroke="#f1f3f5" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => compactGHS(v)}
          tick={{ fontSize: 12, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 13, fill: '#374151' }}
          width={92}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
        <Bar dataKey="value" name="Revenue" fill="#111827" radius={[0, 6, 6, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}