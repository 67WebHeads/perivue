import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import API_BASE_URL from "../config/api";

const AuthContext = createContext(null);
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "perivue_last_activity_at";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         
  const [loading, setLoading] = useState(true);   
  const [sessionExpired, setSessionExpired] = useState(false);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getAccessToken = () => localStorage.getItem("access_token");
  const getRefreshToken = () => localStorage.getItem("refresh_token");

  const saveTokens = (access, refresh, { markActivity = true } = {}) => {
    localStorage.setItem("access_token", access);
    if (refresh) localStorage.setItem("refresh_token", refresh);
    if (markActivity) localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setSessionExpired(false);
  };

  const clearTokens = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  };

  const isIdleSessionExpired = useCallback(() => {
    const lastActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    if (!lastActivityAt) return false;
    return Date.now() - lastActivityAt >= SESSION_IDLE_TIMEOUT_MS;
  }, []);

  const markSessionActivity = useCallback(() => {
    if (
      !localStorage.getItem("access_token") &&
      !localStorage.getItem("refresh_token")
    ) {
      return;
    }
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  }, []);

  const expireSession = useCallback(() => {
    clearTokens();
    setUser(null);
    setSessionExpired(true);
  }, []);

  const resetSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const makeUnauthorizedResponse = () => {
    return new Response(JSON.stringify({ error: "Session expired." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  // ─── Refresh access token ────────────────────────────────────────────────────

  const refreshAccessToken = useCallback(async () => {
    if (isIdleSessionExpired()) {
      expireSession();
      return null;
    }

    const refresh = getRefreshToken();
    if (!refresh) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        expireSession();
        return null;
      }

      const data = await res.json();
      saveTokens(data.access, data.refresh ?? null, { markActivity: false });
      return data.access;
    } catch {
      expireSession();
      return null;
    }
  }, [expireSession, isIdleSessionExpired]);

  // ─── Authenticated fetch (auto-refreshes on 401) ─────────────────────────────

  const authFetch = useCallback(async (url, options = {}) => {
    if (isIdleSessionExpired()) {
      expireSession();
      return makeUnauthorizedResponse();
    }

    let token = getAccessToken();
    if (!token) return makeUnauthorizedResponse();

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

    if (res.ok) markSessionActivity();
    return res;
  }, [expireSession, isIdleSessionExpired, markSessionActivity, refreshAccessToken]);


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
    setSessionExpired(false);
  }, [authFetch]);


  useEffect(() => {
    const bootstrap = async () => {
      const access = getAccessToken();
      const refresh = getRefreshToken();

      if (!access && !refresh) {
        setLoading(false);
        return;
      }

      if (isIdleSessionExpired()) {
        expireSession();
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
          expireSession();
        }
      }

      setLoading(false);
    };

    bootstrap();
  }, [expireSession, fetchMe, isIdleSessionExpired, refreshAccessToken]);

  // ─── Proactive token refresh (access token lasts 60 minutes server-side) ─────

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      await refreshAccessToken();
    }, 45 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, refreshAccessToken]);

  // ─── Idle session expiration ────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    let lastTouch = 0;
    const touchActivity = () => {
      const now = Date.now();
      if (now - lastTouch < 30 * 1000) return;
      lastTouch = now;
      markSessionActivity();
    };

    const events = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    events.forEach((event) => {
      window.addEventListener(event, touchActivity, { passive: true });
    });

    const interval = setInterval(() => {
      if (isIdleSessionExpired()) expireSession();
    }, 60 * 1000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, touchActivity);
      });
      clearInterval(interval);
    };
  }, [expireSession, isIdleSessionExpired, markSessionActivity, user]);

  // ─── Context value ────────────────────────────────────────────────────────────

  const value = {
    user,           // null = not logged in
    loading,        // true while bootstrapping
    sessionExpired, // true after idle timeout / failed refresh
    resetSessionExpired,
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
