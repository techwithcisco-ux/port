import { useNavigate } from 'react-router-dom';
import SyncIndicator from '../components/SyncIndicator';

// Full sync status screen: connection, unsynced queue, last-synced time,
// manual retry. Reachable from the AssistiveTouch menu (Sync tile).
export default function SyncPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sync</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sales recorded offline are pushed from here</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 active:scale-95"
        >
          Back
        </button>
      </header>
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-4">
        <SyncIndicator />
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 leading-relaxed">
          <p className="font-medium text-gray-900 mb-1">How syncing works</p>
          <p>
            Every sale is saved on this device first, so the till keeps working without
            internet. Sales upload automatically when you are back online — you can also
            press Retry now. If sync says your session expired, sign out and sign back in.
          </p>
        </div>
      </div>
    </div>
  );
}
