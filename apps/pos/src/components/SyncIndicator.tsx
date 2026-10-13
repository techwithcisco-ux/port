import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { pushQueuedSales, pushLedger, getLastSyncAt, getLastSyncError } from '../lib/sync';
import { ghFormatTime } from '@branchport/shared';

// Compact sync status shown in page headers: online dot, queue count,
// last-synced time, and a manual Retry now button (the background loop
// already retries every 30s — this is for the impatient or the stuck).
export default function SyncIndicator({ compact = false }: { compact?: boolean }) {
  // Outbound queue: unsynced sales + any invoice/debtor still pending its
  // server copy (offline credit sale, dropped upsert, etc.).
  const queuedCount = useLiveQuery(
    async () => {
      const sales = await db.sales.filter((s) => !s.synced).count();
      const invoices = await db.invoices.filter((i) => i.serverSynced !== true).count();
      const debtors = await db.debtors.filter((d) => d.serverSynced !== true).count();
      return sales + invoices + debtors;
    },
    [],
  ) ?? 0;
  const [online, setOnline] = useState(() => navigator.onLine);
  const [lastAt, setLastAt] = useState<string | null>(getLastSyncAt);
  const [error, setError] = useState<string | null>(getLastSyncError);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const t = setInterval(() => {
      setLastAt(getLastSyncAt());
      setError(getLastSyncError());
    }, 4000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(t);
    };
  }, []);

  async function retry() {
    setRetrying(true);
    try {
      await pushQueuedSales();
      await pushLedger();
      setLastAt(getLastSyncAt());
      setError(getLastSyncError());
    } finally {
      setRetrying(false);
    }
  }

  const waiting = queuedCount > 0;
  const label = online
    ? waiting
      ? `${queuedCount} waiting`
      : lastAt
        ? `Synced ${ghFormatTime(lastAt)}`
        : 'Online'
    : 'Offline';

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
          aria-hidden
        />
        <span className={`text-xs font-medium ${waiting ? 'text-amber-700' : online ? 'text-gray-600' : 'text-red-600'}`}>
          {label}
        </span>
        {waiting && online && (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 active:scale-95 disabled:opacity-50"
          >
            {retrying ? '…' : 'Retry now'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-gray-900">{online ? 'Online' : 'Offline'}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying || !online}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          {retrying ? 'Retrying…' : 'Retry now'}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>
      )}
      {!error && waiting && (
        <p className="mt-3 text-xs text-gray-500">
          Sales, invoices and credit records are safe on this device and will sync automatically when you are back online.
        </p>
      )}
    </div>
  );
}
