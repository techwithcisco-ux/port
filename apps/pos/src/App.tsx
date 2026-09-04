import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { startSyncLoop, pullLatestCatalog } from './lib/sync';
import Login from './routes/Login';
import Activate from './routes/Activate';
import Sell from './routes/Sell';
import Dashboard from './routes/Dashboard';
import InvoiceHistory from './routes/InvoiceHistory';
import PosBalanceSheet from './routes/PosBalanceSheet';
import BottomNav from './components/BottomNav';

// Pulls the catalog once on login and starts the online/offline sync
// loop (see lib/sync.ts) for as long as a branch-scoped user is signed
// in. This is what lets Sell.tsx read purely from the local Dexie cache
// and still be showing data that was fetched minutes ago over the network.
function SyncBoundary({ children }: { children: JSX.Element }) {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.branch_id) return;
    pullLatestCatalog(profile.branch_id);
    return startSyncLoop(profile.branch_id);
  }, [profile?.branch_id]);

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { loading, authUserId, profile } = useAuth();

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (!authUserId || !profile) return <Navigate to="/login" replace />;
  // The POS is staff-only. A manager/owner account can still authenticate
  // here (Supabase Auth doesn't know about app roles), but this app has
  // no use for them — send them back to login rather than into a screen
  // built around a branch_id they don't have.
  if (profile.role !== 'staff' || !profile.branch_id) {
    return <Navigate to="/login" replace />;
  }
  return <SyncBoundary>{children}</SyncBoundary>;
}

export default function App() {
  return (
    <AuthProvider>
      {/* Production builds live under /pos/ (single Vercel project with
          the dashboard at /); dev runs at the root of :5174. */}
      <BrowserRouter basename={import.meta.env.PROD ? '/pos' : '/'}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/activate" element={<Activate />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Sell />
              </RequireAuth>
            }
          />
          <Route
            path="/invoices"
            element={
              <RequireAuth>
                <InvoiceHistory />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/balance-sheet"
            element={
              <RequireAuth>
                <PosBalanceSheet />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
