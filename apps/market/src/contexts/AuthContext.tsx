import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface MarketAuth {
  authenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const MarketAuthContext = createContext<MarketAuth | null>(null);

export function useMarketAuth() {
  const ctx = useContext(MarketAuthContext);
  if (!ctx) throw new Error('useMarketAuth must be used within MarketAuthProvider');
  return ctx;
}

const STORAGE_KEY = 'branchport_market_auth';
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Admin credentials — set via environment variables in production
function getAdminCredentials(): { username: string; password: string } {
  const username = import.meta.env.VITE_MARKET_ADMIN_USER || 'admin';
  const password = import.meta.env.VITE_MARKET_ADMIN_PASS || 'market2024';
  return { username, password };
}

export function MarketAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);

  // Check stored session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { ts } = JSON.parse(stored);
        if (Date.now() - ts < SESSION_TTL) {
          setAuthenticated(true);
          return;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = (password: string): boolean => {
    const creds = getAdminCredentials();
    if (password === creds.password) {
      setAuthenticated(true);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
      return true;
    }
    return false;
  };

  const logout = () => {
    setAuthenticated(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <MarketAuthContext.Provider value={{ authenticated, login, logout }}>
      {children}
    </MarketAuthContext.Provider>
  );
}
