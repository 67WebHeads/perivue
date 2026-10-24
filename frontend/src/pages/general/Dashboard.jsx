import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import API_BASE_URL from "../../config/api";
import { cachedFetch } from "../../cache/Apicache";

function StatCard({ title, value, period, trend, icon, loading }) {
  const trendUp = trend > 0;
  const trendLabel = trend != null ? `${trend > 0 ? "+" : ""}${trend}%` : null;

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-zinc-400/10 shadow-sm bg-white/5 p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-base-content/60">{title}</p>
        <span className="text-base-content/40">{icon}</span>
      </div>

      <p className="text-3xl font-medium leading-none">
        {loading ? <span className="loading loading-spinner loading-sm" /> : value}
      </p>

      <div className="flex items-center gap-2">
        {!loading && trendLabel && (
          <>
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                trendUp ? "bg-success/10 text-success" : "bg-error/10 text-error"
              }`}
            >
              {trendLabel}
            </span>
            <span className="h-2.5 w-px bg-base-content/20" />
          </>
        )}
        <span className="text-xs text-base-content/40">{period}</span>
      </div>
    </div>
  );
}

const EYE_LABELS = { OD: "OD — Right", OS: "OS — Left", OU: "Both" };

function RecentSessions({ sessions, loading }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-zinc-400/10 bg-white/5 p-5 h-full">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-sm font-medium">Recent Sessions</p>
        <button
          onClick={() => navigate("/records")}
          className="text-xs text-base-content/40 hover:text-base-content/70 transition-colors"
        >
          View all →
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-base-content/30 py-4 text-center">No sessions yet</p>
      ) : (
        <div className="flex flex-col divide-y divide-white/5 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-3 gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium truncate">{s.patient_name}</span>
                <span className="text-xs text-base-content/40">{s.patient_code}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-base-content/40">{EYE_LABELS[s.eye] ?? s.eye}</span>
                <span className="text-xs text-base-content/30">
                  {new Date(s.session_datetime).toLocaleDateString("en-PH", {
                    month: "short", day: "numeric",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  const navigate = useNavigate();

  const actions = [
    {
      label: "New Patient",
      desc: "Register a patient",
      onClick: () => navigate("/records"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="19" y1="8" x2="19" y2="14"/>
          <line x1="16" y1="11" x2="22" y2="11"/>
        </svg>
      ),
    },
    {
      label: "Start Test",
      desc: "Begin a new session",
      onClick: () => navigate("/test-menu"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      ),
    },
    {
      label: "View Records",
      desc: "Browse all patients",
      onClick: () => navigate("/records"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-zinc-400/10 bg-white/5 p-5">
      <p className="text-sm font-medium">Quick Actions</p>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="flex items-center gap-3 rounded-2xl border border-zinc-400/10 bg-white/5 hover:bg-white/10 transition-colors px-4 py-3 text-left"
          >
            <span className="text-base-content/50">{a.icon}</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{a.label}</span>
              <span className="text-xs text-base-content/40">{a.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    // Stats: 60s TTL — changes after each test but slight staleness is fine
    cachedFetch(authFetch, `${API_BASE_URL}/api/visual-tests/dashboard/stats/`, { ttl: 60_000 })
      .then(setStats)
      .catch(() => setStats({ total_patients: "—", total_sessions: "—", passing_rate: null }))
      .finally(() => setStatsLoading(false));

    // Recent sessions: 2 min TTL — busted in TestHome after a new session is created
    cachedFetch(authFetch, `${API_BASE_URL}/api/visual-tests/sessions/`, { ttl: 2 * 60_000 })
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.results ?? []);
        setSessions(list.slice(0, 8));
      })
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [authFetch]);

  const cards = [
    {
      key: "patients",
      title: "Total Patients",
      value: stats?.total_patients ?? "—",
      trend: stats?.patients_trend ?? null,
      period: "vs last month",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      ),
    },
    {
      key: "sessions",
      title: "Tests Done",
      value: stats?.total_sessions ?? "—",
      trend: stats?.sessions_trend ?? null,
      period: "vs last month",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <path d="M9 3h6"/>
          <path d="M10 3v5l-5.5 9.5A3 3 0 0 0 7 21h10a3 3 0 0 0 2.5-3.5L14 8V3"/>
          <path d="M8 13h8"/>
        </svg>
      ),
    },
    {
      key: "passing_rate",
      title: "Passing Rate",
      value: stats?.passing_rate != null ? `${stats.passing_rate}%` : "N/A",
      trend: stats?.passing_rate_trend ?? null,
      period: "vs last month",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <path d="M3 17l6-6 4 4 8-8"/>
          <path d="M14 7h7v7"/>
        </svg>
      ),
    },
    {
      key: "patients_today",
      title: "Tested Today",
      value: stats?.patients_today ?? "—",
      trend: null,
      period: "Unique patients today",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 stroke-current">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0">
        {cards.map((card) => (
          <StatCard key={card.key} {...card} loading={statsLoading} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1 min-h-0">
        <div className="sm:col-span-2 min-h-0">
          <RecentSessions sessions={sessions} loading={sessionsLoading} />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}