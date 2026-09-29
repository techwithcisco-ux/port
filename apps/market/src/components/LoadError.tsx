interface LoadErrorProps {
  message: string;
  onRetry: () => void;
}

/**
 * Shared failure state for the analytics views. The API layer throws
 * descriptive errors (network down, session expired, export failed) —
 * this surfaces them instead of the old silent zeroed-out dashboards.
 * Polling views also retry on their own interval.
 */
export default function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center max-w-sm px-4">
        <div className="text-3xl mb-3">⚠️</div>
        <p className="text-sm font-medium text-red-500 mb-1">Couldn't load market data</p>
        <p className="text-xs text-gray-500 mb-5">{message}</p>
        <button onClick={onRetry} className="btn btn-green">
          Retry
        </button>
      </div>
    </div>
  );
}
