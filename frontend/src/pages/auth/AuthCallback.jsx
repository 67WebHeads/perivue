import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// The backend redirects here after Google login with the JWTs in the URL
// fragment: /auth/callback#access=...&refresh=...
function AuthCallback() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false); // StrictMode runs effects twice in dev

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get("access");
    const refresh = params.get("refresh");
    // Drop the tokens from the address bar and browser history
    window.history.replaceState(null, "", window.location.pathname);

    if (!access || !refresh) {
      navigate("/login?error=google_failed", { replace: true });
      return;
    }

    login(access, refresh).then((me) => {
      if (!me) navigate("/login?error=google_failed", { replace: true });
      else if (!me.profile_complete) navigate("/complete-profile", { replace: true });
      else navigate("/dashboard", { replace: true });
    });
  }, [login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('./assets/PeriVue_Background.webp')] bg-cover bg-center">
      <p className="text-white/70 text-sm">Signing you in...</p>
    </div>
  );
}

export default AuthCallback;
