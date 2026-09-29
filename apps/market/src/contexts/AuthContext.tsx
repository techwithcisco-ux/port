import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  isPlatformAuthenticated,
  platformLogin,
  platformLogout,
  SESSION_EXPIRED_EVENT,
} from '../lib/api';

interface MarketAuth {
  authenticated: boolean;
  login: (password: string) => Promise<{ error: string | null }>;
  logout: () => void;
}

const MarketAuthContext = createContext<MarketAuth | null>(null);

export function useMarketAuth() {
  const ctx = useContext(MarketAuthContext);
  if (!ctx) throw new Error('useMarketAuth must be used within MarketAuthProvider');
  return ctx;
}

/**
 * Server-verified admin gate for the Market dashboard. The password is
 * checked by the API (MARKET_ADMIN_PASS on branchport-api) and exchanged
 * for a 12h platform JWT — it never ships in the JS bundle, and login is
 * impossible when the server has no password configured. When the token
 * expires mid-session the data layer fires SESSION_EXPIRED_EVENT and the
 * app returns to the login gate.
 */
export function MarketAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(isPlatformAuthenticated);

  useEffect(() => {
    const onExpired = () => setAuthenticated(false);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (password: string): Promise<{ error: string | null }> => {
    const res = await platformLogin(password);
    if (!res.ok) return { error: res.error };
    setAuthenticated(true);
    return { error: null };
  }, []);

  const logout = useCallback(() => {
    platformLogout();
    setAuthenticated(false);
  }, []);

  return (
    <MarketAuthContext.Provider value={{ authenticated, login, logout }}>
      {children}
    </MarketAuthContext.Provider>
  );
}
