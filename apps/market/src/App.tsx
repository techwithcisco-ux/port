import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MarketAuthProvider, useMarketAuth } from './contexts/AuthContext';
import MarketLayout from './components/MarketLayout';
import MarketLogin from './routes/MarketLogin';
import MarketHome from './routes/MarketHome';
import UsersDirectory from './routes/UsersDirectory';
import ItemsTracker from './routes/ItemsTracker';
import LiveMarketGraph from './routes/LiveMarketGraph';
import UsageAnalytics from './routes/UsageAnalytics';
import Reports from './routes/Reports';

function ProtectedRoutes() {
  const { authenticated } = useMarketAuth();

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<MarketLayout />}>
        <Route index element={<MarketHome />} />
        <Route path="users" element={<UsersDirectory />} />
        <Route path="items" element={<ItemsTracker />} />
        <Route path="live" element={<LiveMarketGraph />} />
        <Route path="analytics" element={<UsageAnalytics />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}

// Served under /market/ in the combined Vercel build, or at the root of
// its own site when deployed standalone on Render (VITE_BASE=/) — follow
// whatever base Vite compiled with instead of hardcoding the path.
const base = import.meta.env.BASE_URL || '/';
const routerBasename = base !== '/' ? base.replace(/\/$/, '') : undefined;

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <MarketAuthProvider>
        <Routes>
          <Route path="/login" element={<PublicLogin />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </MarketAuthProvider>
    </BrowserRouter>
  );
}

function PublicLogin() {
  const { authenticated } = useMarketAuth();

  // Redirect to dashboard if already logged in
  if (authenticated) {
    return <Navigate to="/" replace />;
  }

  return <MarketLogin />;
}
