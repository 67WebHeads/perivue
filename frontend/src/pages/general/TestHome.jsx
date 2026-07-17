import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import API_BASE_URL from "../../config/api";
import { useNavigate } from "react-router-dom";

function getInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const EYE_OPTIONS = [
  { value: "OD", label: "OD", description: "Right eye" },
  { value: "OS", label: "OS", description: "Left eye" },
];

// ── Patient search dropdown ───────────────────────────────────────────────────
function PatientSelect({ patients, value, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = patients.find(p => p.id === value);
  const filtered = query.trim()
    ? patients.filter(p =>
        p.full_name.toLowerCase().includes(query.toLowerCase()) ||
        (p.phone || "").includes(query) ||
        (p.email || "").toLowerCase().includes(query.toLowerCase())
      )
    : patients;

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handlePick(patient) {
    onChange(patient.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl
            bg-white/10 border border-white/20 hover:border-white/30
            text-left transition-all group"
        >
          {selected ? (
            <>
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shrink-0">
                {getInitials(selected.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{selected.full_name}</p>
                <p className="text-white/30 text-xs truncate">{selected.phone || selected.email || "—"}</p>
              </div>
            </>
          ) : (
            <span className="text-white/25 text-sm">
              {loading ? "Loading patients…" : "Search patient…"}
            </span>
          )}
          <svg className="w-4 h-4 text-white/20 shrink-0 group-hover:text-white/40 transition-colors"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <div className="w-full rounded-xl bg-white/10 border border-white/25 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
            <svg className="w-3.5 h-3.5 text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name, phone, or email…"
              className="flex-1 bg-transparent text-sm text-white placeholder-white/25 focus:outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} className="text-white/20 hover:text-white/50 transition-colors text-xs">✕</button>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-white/25 text-sm text-center">No patients found</li>
            ) : filtered.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handlePick(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/10 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/60 shrink-0">
                    {getInitials(p.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-sm truncate">{p.full_name}</p>
                    <p className="text-white/30 text-xs truncate">{p.phone || p.email || "—"}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Eye + Protocol selector ───────────────────────────────────────────────────
function OptionGrid({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map(t => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-4 px-4 py-3 rounded-xl border text-left transition-all
              ${active
                ? "bg-purple-500/15 border-purple-500/40 text-white"
                : "bg-white/10 border-white/20 text-white/60 hover:bg-white/15 hover:border-white/30 hover:text-white/80"
              }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all
              ${active ? "border-purple-400" : "border-white/20"}`}>
              {active && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium transition-colors ${active ? "text-white" : "text-white/70"}`}>
                {t.label}
              </p>
              <p className="text-xs text-white/30 mt-0.5">{t.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TestHome() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [patients, setPatients]     = useState([]);
  const [protocols, setProtocols]   = useState([]);
  const [loadingPx, setLoadingPx]   = useState(true);
  const [patientId, setPatientId]   = useState(null);
  const [protocolId, setProtocolId] = useState(null);
  const [eye, setEye]               = useState(null);
  const [starting, setStarting]     = useState(false);
  const [error, setError]           = useState(null);

  // Fetch patients
  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/patients/`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setPatients(data))
      .catch(() => setPatients([]))
      .finally(() => setLoadingPx(false));
  }, [authFetch]);

  // Fetch protocols
  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/visual-tests/protocols/`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setProtocols(data);
        // Auto-select first protocol if only one exists
        if (data.length === 1) setProtocolId(data[0].id);
      })
      .catch(() => setProtocols([]));
  }, [authFetch]);

  const ready = patientId && protocolId && eye;

  async function handleBeginTest() {
    if (!ready) return;
    setStarting(true);
    setError(null);

    try {
      // Step 1 — create session
      const sessionRes = await authFetch(`${API_BASE_URL}/api/visual-tests/sessions/`, {
        method: "POST",
        body: JSON.stringify({
          patient: patientId,
          protocol: protocolId,
          eye: eye,
        }),
      });
      if (!sessionRes.ok) throw new Error("Failed to create session");
      const session = await sessionRes.json();

      // Step 2 — create run
      const runRes = await authFetch(
        `${API_BASE_URL}/api/visual-tests/sessions/${session.id}/runs/`,
        {
          method: "POST",
          body: JSON.stringify({ eye }),
        }
      );
      if (!runRes.ok) throw new Error("Failed to create run");
      const run = await runRes.json();

      // Step 3 — launch MediaPipe (unless eye tracking is toggled off on
      // the test canvas — the toggle there can also start it later)
      if (localStorage.getItem('perivue_eye_tracking') !== 'off') {
        try {
          await authFetch(
            `${API_BASE_URL}/api/visual-tests/runs/${run.id}/mediapipe/start/`,
            { method: 'POST' }
          )
        } catch {
          // Non-fatal — test can continue without eye tracking
          console.warn('MediaPipe could not be started')
        }
      }

      // Step 4 — go to canvas in the same tab
      navigate(`/test/canvas?run_id=${run.id}`)

    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const protocolOptions = protocols.map(p => ({
    value: p.id,
    label: p.name,
    description: `${p.point_count} points · ${p.stimulus_color} stimulus`,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto py-4 font-sans">
      <div>
        <h1 className="text-white font-semibold text-lg tracking-tight">New test session</h1>
        <p className="text-white/30 text-sm mt-0.5">Select a patient, protocol, and eye to begin</p>
      </div>

      {error && (
        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Step 1 — Patient */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-white/50 text-xs font-medium shrink-0">1</span>
          <p className="text-white/50 text-xs uppercase tracking-wider font-medium">Patient</p>
        </div>
        <PatientSelect
          patients={patients}
          value={patientId}
          onChange={setPatientId}
          loading={loadingPx}
        />
      </section>

      <div className="border-t border-white/8" />

      {/* Step 2 — Protocol */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-white/50 text-xs font-medium shrink-0">2</span>
          <p className="text-white/50 text-xs uppercase tracking-wider font-medium">Protocol</p>
        </div>
        {protocols.length === 0 ? (
          <p className="text-white/25 text-sm px-1">Loading protocols…</p>
        ) : (
          <OptionGrid options={protocolOptions} value={protocolId} onChange={setProtocolId} />
        )}
      </section>

      <div className="border-t border-white/8" />

      {/* Step 3 — Eye */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-white/50 text-xs font-medium shrink-0">3</span>
          <p className="text-white/50 text-xs uppercase tracking-wider font-medium">Eye</p>
        </div>
        <OptionGrid options={EYE_OPTIONS} value={eye} onChange={setEye} />
      </section>

      <div className="border-t border-white/8" />

      {/* Begin */}
      <section>
        <button
          type="button"
          onClick={handleBeginTest}
          disabled={!ready || starting}
          className={`w-full py-3 rounded-xl text-sm font-medium transition-all
            ${ready
              ? "bg-purple-500/20 border border-purple-500/30 text-white hover:bg-purple-500/30 hover:border-purple-500/50 cursor-pointer"
              : "bg-white/5 border border-white/10 text-white/25 cursor-not-allowed"
            } disabled:opacity-60`}
        >
          {starting ? "Starting…" : "Begin test →"}
        </button>
      </section>
    </div>
  );
}
