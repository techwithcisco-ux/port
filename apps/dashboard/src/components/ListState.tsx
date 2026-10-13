// Shared loading / empty states for list-heavy dashboard routes.
// Rendering the empty message while a fetch is still in flight flashes
// "No results" for a few hundred ms on every page load — these two
// components let a route show a skeleton until its data actually arrives.

export function ListSkeleton({ rows = 4, height = 'h-12' }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2 animate-pulse" role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`rounded-lg bg-gray-200/70 ${height}`} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
