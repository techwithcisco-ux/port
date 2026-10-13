import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { startSyncLoop, pullLatestCatalog } from './lib/sync';
import Login from './routes/Login';
import Activate from './routes/Activate';
import Sell from './routes/Sell';
import Dashboard from './routes/Dashboard';
import InvoiceHistory from './routes/InvoiceHistory';
import Debtors from './routes/Debtors';
import Waitlist from './routes/Waitlist';
import PosBalanceSheet from './routes/PosBalanceSheet';
import CalculatorPage from './routes/CalculatorPage';
import SyncPage from './routes/SyncPage';
import AssistiveTouch from './components/AssistiveTouch';

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
      <AssistiveTouch />
    </>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { loading, authUserId, profile } = useAuth();

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (!authUserId || !profile) return <Navigate to="/login" replace />;
  // The till is branch-scoped, not role-scoped: any account bound to a
  // branch may sell here — the owner from "Main Store" (created at
  // signup), a manager from the branch they were assigned. An account
  // with no branch has no stock to sell, so it goes back to sign-in.
  if (!profile.branch_id) {
    return <Navigate to="/login" replace />;
  }
  return <SyncBoundary>{children}</SyncBoundary>;
}

// The POS is served under /pos/ in the combined Vercel build, or at the
// root of its own site when deployed standalone on Render (VITE_BASE=/) —
// follow whatever base Vite compiled with instead of hardcoding the path.
const viteBase = import.meta.env.BASE_URL || '/';
const routerBasename = viteBase !== '/' ? viteBase.replace(/\/$/, '') : undefined;

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm rounded-3xl border border-gray-200/80 bg-white p-7 text-center shadow-[0_8px_30px_rgba(17,24,39,0.08)]">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gray-900 text-lg font-black text-white">B</div>
        <h1 className="text-lg font-bold text-gray-900">Page not found</h1>
        <p className="mt-1 text-sm text-gray-500">That screen does not exist on this till.</p>
        <Link
          to="/"
          className="mt-5 inline-flex w-full justify-center rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white active:scale-[0.99]"
        >
          Back to the till
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={routerBasename}>
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
            path="/debtors"
            element={
              <RequireAuth>
                <Debtors />
              </RequireAuth>
            }
          />
          <Route
            path="/waitlist"
            element={
              <RequireAuth>
                <Waitlist />
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
          <Route
            path="/calculator"
            element={
              <RequireAuth>
                <CalculatorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/sync"
            element={
              <RequireAuth>
                <SyncPage />
              </RequireAuth>
            }
          />
          {/* No catch-all meant an unknown URL rendered a blank white page. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
