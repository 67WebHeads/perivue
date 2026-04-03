import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import API_BASE_URL from "../../config/api";
import { useNavigate } from "react-router-dom";

const CLINIC_ID = "00000000-0000-0000-0000-000000000001";

const TEST_TYPES = [
  { value: "gay test", label: "faggot 3.1", description: "gaywad" },
];

function getInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function PatientSelect({ patients, value, onChange, loading }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const ref                 = useRef(null);
  const inputRef            = useRef(null);

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
            <button type="button" onClick={() => setOpen(false)} className="text-white/20 hover:text-white/50 transition-colors text-xs">
              ✕
            </button>
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

function TestTypeGrid({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {TEST_TYPES.map(t => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-4 px-4 py-3 rounded-xl border text-left transition-all
              ${active
                ? "bg-blue-500/15 border-blue-500/40 text-white"
                : "bg-white/10 border-white/20 text-white/60 hover:bg-white/15 hover:border-white/30 hover:text-white/80"
              }`}
          >
            {/* Radio dot */}
            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all
              ${active ? "border-blue-400" : "border-white/20"}`}>
              {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
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

export default function TestHome() {
  const { authFetch } = useAuth();
  const navigate      = useNavigate();

  const [patients,    setPatients]    = useState([]);
  const [loadingPx,   setLoadingPx]   = useState(true);
  const [patientId,   setPatientId]   = useState(null);
  const [testType,    setTestType]    = useState(null);

  // useEffect(() => {
  //   authFetch(`${API_BASE_URL}/api/patients/`, {
  //     headers: { "X-Clinic-ID": CLINIC_ID },
  //   })
  //     .then(res => res.ok ? res.json() : [])
  //     .then(data => setPatients(data))
  //     .catch(() => setPatients([]))
  //     .finally(() => setLoadingPx(false));
  // }, [authFetch]);

  const ready = patientId && testType;

  function handleBeginTest() {
    // if (!ready) return;
    navigate('/test')
    // navigate(`/test/${testType}?patient=${patientId}`);
  }

  const selectedPatient  = patients.find(p => p.id === patientId);
  const selectedTestType = TEST_TYPES.find(t => t.value === testType);

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto py-4 font-sans">
      <div>
        <h1 className="text-white font-semibold text-lg tracking-tight">New test session</h1>
        <p className="text-white/30 text-sm mt-0.5">Select a patient and test type to begin</p>
      </div>

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

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-white/50 text-xs font-medium shrink-0">2</span>
          <p className="text-white/50 text-xs uppercase tracking-wider font-medium">Test type</p>
        </div>
        <TestTypeGrid value={testType} onChange={setTestType} />
      </section>

      <div className="border-t border-white/8" />

      <section className="flex flex-col gap-3">
        {ready && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-sm">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/60 shrink-0">
              {getInitials(selectedPatient.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/70 truncate">
                <span className="text-white font-medium">{selectedPatient.full_name}</span>
                <span className="text-white/30 mx-2">·</span>
                {selectedTestType.label}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleBeginTest}
          disabled={false} //!ready
          className={`w-full py-3 rounded-xl text-sm font-medium transition-all bg-purple-500/20 border border-purple-500/30 text-white hover:bg-purple-500/30 hover:border-purple-500/50 cursor-pointer
            `}
            // ${ready
            //   ? "bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/50 cursor-pointer"
            //   : "bg-white/10 border border-white/20 text-white/30 cursor-not-allowed"
            // }
        >
          {/* {ready ? "Begin test →" : "Select patient and test type to continue"} */}
          Begin test →
        </button>
      </section>
    </div>
  );
}