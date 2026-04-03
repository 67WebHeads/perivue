import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import splash_art_perivue from "../../assets/splash_art_perivue.png";
import API_BASE_URL from "../../config/api";
import { useAuth } from "../../context/AuthContext";

const ROLES = [
  { value: "admin",     label: "Admin",     desc: "Full access to all clinic features" },
  { value: "clinician", label: "Clinician", desc: "Conduct and review patient tests" },
  { value: "viewer",    label: "Viewer",    desc: "Read-only access to records" },
];

const inputClass = `
  w-full px-4 py-2.5 rounded-xl text-sm
  bg-white/10 border border-white/20
  text-white placeholder-white/30
  focus:outline-none focus:border-white/40
  transition-all
`;

export default function CompleteProfile() {
  const { user, authFetch, login } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [role, setRole]         = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit() {
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!role) {
      setError("Please select a role.");
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users/me/`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName.trim(), role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      // Re-fetch fresh tokens aren't needed — just refresh the user in context
      // by calling login with the existing tokens (re-reads /me/)
      const access  = localStorage.getItem("access_token");
      const refresh = localStorage.getItem("refresh_token");
      await login(access, refresh);

      navigate("/dashboard", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('./assets/PeriVue_Background.webp')] bg-cover bg-center bg-no-repeat">
      <div className="flex flex-col items-center gap-6 p-10 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl w-full max-w-md mx-4">

        {/* Avatar + name from Google */}
        <div className="flex flex-col items-center gap-3">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt="avatar"
              className="w-16 h-16 rounded-full border-2 border-white/20 object-cover"
            />
          ) : (
            <img src={splash_art_perivue} alt="PeriVue" className="w-16 h-16 object-contain" />
          )}
          <div className="text-center">
            <h1 className="text-white text-xl font-bold tracking-wide">Complete your profile</h1>
            <p className="text-white/50 text-sm mt-1">{user?.email}</p>
          </div>
        </div>

        <div className="border-t border-white/10 w-full" />

        {/* Full name */}
        <div className="w-full flex flex-col gap-1.5">
          <label className="text-white/40 text-xs uppercase tracking-wider font-mono">
            Full name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Maria Santos"
            className={inputClass}
          />
          <p className="text-white/25 text-xs font-mono">
            Pre-filled from your Google account — edit if needed.
          </p>
        </div>

        {/* Role selector */}
        <div className="w-full flex flex-col gap-2">
          <label className="text-white/40 text-xs uppercase tracking-wider font-mono">
            Role
          </label>
          <div className="flex flex-col gap-2">
            {ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`
                  w-full text-left px-4 py-3 rounded-xl border transition-all
                  ${role === r.value
                    ? "bg-blue-500/20 border-blue-500/40 text-white"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                  }
                `}
              >
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs opacity-60 mt-0.5">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 w-full">
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving…" : "Continue to PeriVue →"}
        </button>

      </div>
    </div>
  );
}