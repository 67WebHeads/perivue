import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import API_BASE_URL from "../../config/api";

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

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/visual-tests/dashboard/stats/`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats({ total_patients: "—", total_sessions: "—", passing_rate: null }))
      .finally(() => setLoading(false));
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
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <StatCard key={card.key} {...card} loading={loading} />
      ))}
    </div>
  );
}