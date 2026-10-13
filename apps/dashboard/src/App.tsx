import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './routes/Login';
import Signup from './routes/Signup';
import ManagerHome from './routes/manager/ManagerHome';
import Pos from './routes/manager/Pos';
import Allocation from './routes/manager/Allocation';
import Suppliers from './routes/manager/Suppliers';
import SalesReport from './routes/manager/SalesReport';
import ProfitLoss from './routes/manager/ProfitLoss';
import Expenses from './routes/manager/Expenses';
import Ledger from './routes/manager/Ledger';
import Documents from './routes/manager/Documents';
import PaymentReconciliation from './routes/manager/PaymentReconciliation';
import ProductSetup from './routes/manager/ProductSetup';
import StockIntake from './routes/manager/StockIntake';
import Team from './routes/manager/Team';
import StockBalance from './routes/manager/StockBalance';
import OwnerHome from './routes/owner/OwnerHome';
import OwnerStores from './routes/owner/OwnerStores';
import OwnerMoney from './routes/owner/OwnerMoney';
import OwnerProducts from './routes/owner/OwnerProducts';
import OwnerTeam from './routes/owner/OwnerTeam';
import BalanceSheet from './routes/owner/BalanceSheet';
import TradingAccount from './routes/owner/TradingAccount';
import FeatureSettings from './routes/owner/FeatureSettings';
import AuditLog from './routes/owner/AuditLog';
import FlagsPanel from './routes/owner/FlagsPanel';
import Managers from './routes/owner/Managers';
import MarketIntelligence from './routes/owner/MarketIntelligence';
import OwnerStockAllocation from './routes/owner/OwnerStockAllocation';
import BranchDetail from './routes/owner/BranchDetail';
import Account from './routes/owner/Account';
import StaffNotice from './routes/StaffNotice';
import Welcome from './routes/Welcome';
import Onboarding from './routes/Onboarding';
import SplashScreen from './components/SplashScreen';
import ManagerStock from './routes/manager/ManagerStock';
import ManagerMoney from './routes/manager/ManagerMoney';
import ManagerTeam from './routes/manager/ManagerTeam';
import Waitlist from './routes/manager/Waitlist';
import { hasSeenWelcome } from './lib/utils';
import { useState, useCallback } from 'react';

// Route guard: renders children only once a profile with the required role
// has loaded. The owner implicitly has manager-level access too, so
// 'manager' routes accept both roles; owner surfaces stay owner-only.
function LoadingScreen({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="loader-3d">
      <div className="loader-3d-star">
        <svg width="64" height="64" viewBox="0 0 100 100" aria-hidden>
          {(() => {
            const points: [number, number][] = [];
            for (let i = 0; i < 10; i++) {
              const angle = Math.PI / 2 + (i * Math.PI) / 5;
              const r = i % 2 === 0 ? 40 : 18;
              points.push([50 + r * Math.cos(angle), 50 - r * Math.sin(angle)]);
            }
            const starPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
            return <path d={starPath} fill="var(--ghana-gold)" />;
          })()}
        </svg>
      </div>
      <div className="loader-3d-bar" />
      <p className="text-sm font-medium" style={{ color: 'var(--ghana-black)' }}>{text}</p>
    </div>
  );
}

// POS-first greeting: no protected screen may render before the welcome
// screen has been seen, so a deep link, a browser restore or a second tab
// can't skip it. /welcome is exempt or it would redirect to itself.
function posFirstRedirect(pathname: string, userId: string): string | null {
  return pathname !== '/welcome' && !hasSeenWelcome(userId) ? '/welcome' : null;
}

function RequireRole({
  roles,
  children,
}: {
  roles: Array<'manager' | 'owner' | 'staff'>;
  children: JSX.Element;
}) {
  const { loading, authUserId, profile } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!authUserId || !profile) return <Navigate to="/login" replace />;
  const greeted = posFirstRedirect(location.pathname, profile.id);
  if (greeted) return <Navigate to={greeted} replace />;
  if (!roles.includes(profile.role as 'manager' | 'owner' | 'staff')) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function HomeRedirect() {
  const { loading, profile } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!profile) return <Navigate to="/login" replace />;
  // The POS-first greeting owns this decision for every account — owner
  // signups and freshly provisioned staff/manager alike — so landing after
  // signup and landing after a first sign-in resolve identically.
  if (!hasSeenWelcome(profile.id)) return <Navigate to="/welcome" replace />;
  if (profile.role === 'staff') return <Navigate to="/staff" replace />;
  return <Navigate to={profile.role === 'owner' ? '/owner' : '/manager'} replace />;
}

// The dashboard is manager/owner-only. A staff session (POS app) is shown
// a notice pointing at the point-of-sale app rather than a blank redirect.
function RequireStaff({ children }: { children: JSX.Element }) {
  const { loading, authUserId, profile } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!authUserId || !profile) return <Navigate to="/login" replace />;
  const greeted = posFirstRedirect(location.pathname, profile.id);
  if (greeted) return <Navigate to={greeted} replace />;
  if (profile.role !== 'staff') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('bp-splash-seen'));
  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem('bp-splash-seen', '1');
    setShowSplash(false);
  }, []);

  return (
    <ErrorBoundary>
    {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/onboarding"
            element={
              <RequireRole roles={['owner']}>
                <Onboarding />
              </RequireRole>
            }
          />
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/welcome"
            element={
              <RequireRole roles={['staff', 'manager', 'owner']}>
                <Welcome />
              </RequireRole>
            }
          />
          <Route
            path="/staff"
            element={
              <RequireStaff>
                <StaffNotice />
              </RequireStaff>
            }
          />

          {/* Management view — accessible to manager AND owner */}
          <Route
            path="/manager"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <ManagerHome />
              </RequireRole>
            }
          />
          <Route
            path="/manager/pos"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Pos />
              </RequireRole>
            }
          />
          <Route
            path="/manager/intake"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <StockIntake />
              </RequireRole>
            }
          />
          <Route
            path="/manager/allocation"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Allocation />
              </RequireRole>
            }
          />
          <Route
            path="/manager/suppliers"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Suppliers />
              </RequireRole>
            }
          />
          <Route
            path="/manager/sales-report"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <SalesReport />
              </RequireRole>
            }
          />
          <Route
            path="/manager/profit-loss"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <ProfitLoss />
              </RequireRole>
            }
          />
          <Route
            path="/manager/expenses"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Expenses />
              </RequireRole>
            }
          />
          <Route
            path="/manager/ledger"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Ledger />
              </RequireRole>
            }
          />
          <Route
            path="/manager/stock-balance"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <StockBalance />
              </RequireRole>
            }
          />
          <Route
            path="/manager/products"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <ProductSetup />
              </RequireRole>
            }
          />
          <Route
            path="/manager/staff"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Team />
              </RequireRole>
            }
          />
          <Route
            path="/manager/stock"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <ManagerStock />
              </RequireRole>
            }
          />
          <Route
            path="/manager/money"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <ManagerMoney />
              </RequireRole>
            }
          />
          <Route
            path="/manager/team"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <ManagerTeam />
              </RequireRole>
            }
          />
          <Route
            path="/manager/waitlist"
            element={
              <RequireRole roles={['staff', 'manager', 'owner']}>
                <Waitlist />
              </RequireRole>
            }
          />
          <Route
            path="/manager/documents"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <Documents />
              </RequireRole>
            }
          />
          <Route
            path="/manager/reconciliation"
            element={
              <RequireRole roles={['manager', 'owner']}>
                <PaymentReconciliation />
              </RequireRole>
            }
          />

          {/* Owner view — owner only. RLS on audit_events backs this up at
              the database level regardless of this route guard. */}
          <Route
            path="/owner"
            element={
              <RequireRole roles={['owner']}>
                <OwnerHome />
              </RequireRole>
            }
          />
          <Route
            path="/owner/stores"
            element={
              <RequireRole roles={['owner']}>
                <OwnerStores />
              </RequireRole>
            }
          />
          <Route
            path="/owner/money"
            element={
              <RequireRole roles={['owner']}>
                <OwnerMoney />
              </RequireRole>
            }
          />
          <Route
            path="/owner/products"
            element={
              <RequireRole roles={['owner']}>
                <OwnerProducts />
              </RequireRole>
            }
          />
          <Route
            path="/owner/team"
            element={
              <RequireRole roles={['owner']}>
                <OwnerTeam />
              </RequireRole>
            }
          />
          <Route
            path="/owner/audit-log"
            element={
              <RequireRole roles={['owner']}>
                <AuditLog />
              </RequireRole>
            }
          />
          <Route
            path="/owner/flags"
            element={
              <RequireRole roles={['owner']}>
                <FlagsPanel />
              </RequireRole>
            }
          />
          <Route
            path="/owner/managers"
            element={
              <RequireRole roles={['owner']}>
                <Managers />
              </RequireRole>
            }
          />
          <Route
            path="/owner/balance-sheet"
            element={
              <RequireRole roles={['owner']}>
                <BalanceSheet />
              </RequireRole>
            }
          />
          <Route
            path="/owner/trading-account"
            element={
              <RequireRole roles={['owner']}>
                <TradingAccount />
              </RequireRole>
            }
          />
          <Route
            path="/owner/features"
            element={
              <RequireRole roles={['owner']}>
                <FeatureSettings />
              </RequireRole>
            }
          />
          <Route
            path="/owner/intelligence"
            element={
              <RequireRole roles={['owner']}>
                <MarketIntelligence />
              </RequireRole>
            }
          />
          <Route
            path="/owner/stock-allocation"
            element={
              <RequireRole roles={['owner']}>
                <OwnerStockAllocation />
              </RequireRole>
            }
          />
          <Route
            path="/owner/account"
            element={
              <RequireRole roles={['owner']}>
                <Account />
              </RequireRole>
            }
          />
          <Route
            path="/owner/branch/:branchId"
            element={
              <RequireRole roles={['owner']}>
                <BranchDetail />
              </RequireRole>
            }
          />

          {/* Catch-all: redirect unknown routes to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}