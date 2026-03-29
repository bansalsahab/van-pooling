import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "../lib/api";
import type { UserProfile } from "../lib/types";

const ACCESS_TOKEN_KEY = "vanpool_access_token";
const REFRESH_TOKEN_KEY = "vanpool_refresh_token";

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    requestedRole?: UserProfile["role"],
  ) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    company_domain: string;
    company_name?: string;
    requested_role?: UserProfile["role"];
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserProfile: (profile: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(ACCESS_TOKEN_KEY),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const profile = await api.me(token);
        if (!cancelled) {
          setUser(profile);
        }
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAuthResult(
    result: Awaited<ReturnType<typeof api.login>>,
  ): Promise<void> {
    localStorage.setItem(ACCESS_TOKEN_KEY, result.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
    setToken(result.access_token);
    setUser(result.user);
  }

  async function login(
    email: string,
    password: string,
    requestedRole?: UserProfile["role"],
  ) {
    const result = await api.login(email, password, requestedRole);
    await handleAuthResult(result);
  }

  async function register(payload: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    company_domain: string;
    company_name?: string;
    requested_role?: UserProfile["role"];
  }) {
    const result = await api.register(payload);
    await handleAuthResult(result);
  }

  async function refreshUser() {
    if (!token) {
      setUser(null);
      return;
    }
    const profile = await api.me(token);
    setUser(profile);
  }

  function setUserProfile(profile: UserProfile) {
    setUser(profile);
  }

  function logout() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      refreshUser,
      setUserProfile,
      logout,
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
