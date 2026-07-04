import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import GoogleIcon from "@mui/icons-material/Google";
import splash_art_perivue from "../../assets/splash_art_perivue.png";
import API_BASE_URL from "../../config/api";
import { useAuth } from "../../context/AuthContext";

function Login() {
  const [testEmail, setTestEmail] = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  const { login, resetSessionExpired } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";
  const expiredNotice = location.state?.sessionExpired
    ? "Your session expired. Please sign in again."
    : "";

  const handleGoogleLogin = () => {
    resetSessionExpired();
    window.location.href = `${API_BASE_URL}/accounts/google/login/`;
  };

  const handleTestLogin = async () => {
    resetSessionExpired();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/test-login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      // login() returns the /me/ payload which includes profile_complete
      const me = await login(data.access, data.refresh);

      if (me && !me.profile_complete) {
        navigate("/complete-profile", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('./assets/PeriVue_Background.webp')] bg-cover bg-center bg-no-repeat">
      <div className="flex flex-col items-center justify-center space-y-6 p-10 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl">
        <img
          src={splash_art_perivue}
          alt="Splash"
          className="w-[200px] h-[200px] object-contain"
        />
        <div className="flex flex-col items-center space-y-2">
          <h1 className="text-white text-2xl font-bold tracking-wide">Welcome to PeriVue</h1>
          <p className="text-white/60 text-sm">Sign in to continue</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="flex items-center justify-center gap-2 p-4 w-[220px] rounded-full bg-white text-black font-medium hover:bg-gray-200 active:scale-95 transition-all"
        >
          <GoogleIcon fontSize="small" />
          <span>Sign in with Google</span>
        </button>

        {expiredNotice && (
          <p className="w-full rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-center text-xs text-yellow-200">
            {expiredNotice}
          </p>
        )}

        {import.meta.env.DEV && (
          <div className="flex flex-col items-center space-y-2 border-t border-white/20 pt-4 w-full">
            <p className="text-yellow-400 text-xs">⚠️ Dev Mode Only</p>
            <input
              type="email"
              placeholder="test@ceu.edu.ph"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTestLogin()}
              className="p-2 rounded-lg text-black text-sm w-full text-center"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              onClick={handleTestLogin}
              disabled={loading}
              className="p-2 w-full rounded-full bg-yellow-400 text-black text-sm font-medium hover:bg-yellow-300 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Test Login (Dev Only)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;