import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import API_BASE_URL from "../config/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         
  const [loading, setLoading] = useState(true);   

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getAccessToken = () => localStorage.getItem("access_token");
  const getRefreshToken = () => localStorage.getItem("refresh_token");

  const saveTokens = (access, refresh) => {
    localStorage.setItem("access_token", access);
    if (refresh) localStorage.setItem("refresh_token", refresh);
  };

  const clearTokens = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  };

  // ─── Refresh access token ────────────────────────────────────────────────────

  const refreshAccessToken = useCallback(async () => {
    const refresh = getRefreshToken();
    if (!refresh) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        clearTokens();
        return null;
      }

      const data = await res.json();
      saveTokens(data.access, data.refresh ?? null);
      return data.access;
    } catch {
      clearTokens();
      return null;
    }
  }, []);

  // ─── Authenticated fetch (auto-refreshes on 401) ─────────────────────────────

  const authFetch = useCallback(async (url, options = {}) => {
    let token = getAccessToken();

    const doFetch = (t) =>
      fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
          Authorization: `Bearer ${t}`,
        },
      });

    let res = await doFetch(token);

    if (res.status === 401) {
      token = await refreshAccessToken();
      if (!token) return res;        
      res = await doFetch(token);
    }

    return res;
  }, [refreshAccessToken]);


  const fetchMe = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users/me/`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [authFetch]);

  // ─── Login (called after receiving tokens) ───────────────────────────────────

  const login = useCallback(async (access, refresh) => {
    saveTokens(access, refresh);
    const me = await fetchMe();
    setUser(me);
    return me;
  }, [fetchMe]);

  // ─── Logout ──────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();

    // Attempt to blacklist the refresh token on the server (best-effort)
    if (refresh) {
      try {
        await authFetch(`${API_BASE_URL}/api/token/blacklist/`, {
          method: "POST",
          body: JSON.stringify({ refresh }),
        });
      } catch {
        // Ignore — we still clear locally
      }
    }

    clearTokens();
    setUser(null);
  }, [authFetch]);


  useEffect(() => {
    const bootstrap = async () => {
      const access = getAccessToken();
      const refresh = getRefreshToken();

      if (!access && !refresh) {
        setLoading(false);
        return;
      }

      const me = await fetchMe();

      if (me) {
        setUser(me);
      } else {
        // Access token may be expired — try refresh
        const newAccess = await refreshAccessToken();
        if (newAccess) {
          const me2 = await fetchMe();
          setUser(me2 ?? null);
        } else {
          clearTokens();
          setUser(null);
        }
      }

      setLoading(false);
    };

    bootstrap();
  }, [fetchMe, refreshAccessToken]);

  // ─── Proactive token refresh (every 4 minutes, access token lasts 5 min) ─────

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      await refreshAccessToken();
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, refreshAccessToken]);

  // ─── Context value ────────────────────────────────────────────────────────────

  const value = {
    user,           // null = not logged in
    loading,        // true while bootstrapping
    login,          // login(access, refresh) → sets user
    logout,         // logout() → clears tokens + user
    authFetch,      // authenticated fetch wrapper
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}