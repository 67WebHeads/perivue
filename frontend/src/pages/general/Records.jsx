import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import API_BASE_URL from '../../config/api';

const CLINIC_ID = "00000000-0000-0000-0000-000000000001";

const inputClass = `
  w-full px-3 py-2 rounded-lg text-sm
  bg-white/5 border border-white/10
  text-white placeholder-white/25
  focus:outline-none focus:border-white/30
  transition-all
`;
const labelClass = "block text-white/35 text-xs uppercase tracking-wider font-mono mb-1.5";

function getInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const emptyForm = {
  first_name:      "",
  last_name:       "",
  birth_date:      "",
  phone:           "",
  email:           "",
  assigned_doctor: "",
  sex:             "U",
  notes:           "",
};

export default function Records() {
  const { authFetch } = useAuth();

  const [patients, setPatients]       = useState([]);
  const [staff, setStaff]             = useState([]);       // ← doctors/admins from DB
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState(null);
  const [showNewTest, setShowNewTest] = useState(false);
  const [form, setForm]               = useState(emptyForm);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);

  // ─── Fetch staff (doctors + admins) once on mount ────────────────────────
  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/users/staff/`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setStaff(data))
      .catch(() => setStaff([]));
  }, [authFetch]);

  // ─── Fetch patients ───────────────────────────────────────────────────────
  const fetchPatients = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const url = new URL(`${API_BASE_URL}/api/patients/`);
      if (q) url.searchParams.set("search", q);

      const res = await authFetch(url.toString(), {
        headers: { "X-Clinic-ID": CLINIC_ID },
      });

      if (!res.ok) throw new Error("Failed to fetch patients");
      setPatients(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // ─── Debounced search ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => fetchPatients(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchPatients]);

  // ─── Form handlers ────────────────────────────────────────────────────────
  function handleFormChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleBeginTest() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/patients/`, {
        method: "POST",
        headers: { "X-Clinic-ID": CLINIC_ID },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err));
      }

      await fetchPatients(search);
      setShowNewTest(false);
      setForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCloseNewTest() {
    setShowNewTest(false);
    setForm(emptyForm);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search patient, phone, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
        />
        <button
          onClick={() => setShowNewTest(true)}
          className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-blue-500/20 border border-blue-500/25 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/40 transition-all hover:cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          New patient
        </button>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Patient</th>
              <th className="text-left px-4 py-3 font-medium">Contact</th>
              <th className="text-left px-4 py-3 font-medium">Assigned doctor</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-white/25 text-sm font-mono">Loading…</td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-white/25 text-sm font-mono">No patients found</td>
              </tr>
            ) : patients.map((p, i) => (
              <tr
                key={p.id}
                className={`border-b border-white/5 transition-colors hover:bg-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shrink-0">
                      {getInitials(p.full_name)}
                    </div>
                    <div>
                      <p className="text-white/80 font-medium leading-tight">{p.full_name}</p>
                      <p className="text-white/30 text-xs font-mono">
                        {p.patient_code ? `#${p.patient_code}` : `#${String(p.id).slice(0, 8)}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-white/60 text-xs">{p.phone || "—"}</p>
                  <p className="text-white/30 text-xs font-mono">{p.email || "—"}</p>
                </td>
                <td className="px-4 py-3 text-white/50 text-sm">{p.assigned_doctor || "—"}</td>
                <td className="px-4 py-3 text-white/30 text-xs font-mono">
                  {new Date(p.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setSelected(p)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/25 font-mono">
        {patients.length} patient{patients.length !== 1 ? "s" : ""}
      </p>

      {/* ── View modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md mx-4 bg-[#0d1325]/95 border border-white/10 rounded-2xl p-6 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-white/70">
                  {getInitials(selected.full_name)}
                </div>
                <div>
                  <p className="text-white font-medium">{selected.full_name}</p>
                  <p className="text-white/30 text-xs font-mono">
                    {selected.patient_code ? `#${selected.patient_code}` : `#${String(selected.id).slice(0, 8)}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="border-t border-white/10" />
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Phone",           value: selected.phone           || "—" },
                { label: "Email",           value: selected.email           || "—" },
                { label: "Assigned doctor", value: selected.assigned_doctor || "—" },
                { label: "Sex",             value: selected.sex             || "—" },
                { label: "Date of birth",   value: selected.birth_date      || "—" },
                { label: "Patient since",   value: new Date(selected.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-white/30 text-xs uppercase tracking-wider font-mono mb-1">{label}</p>
                  <p className="text-white/70 text-sm">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button className="flex-1 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all">
                Edit record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New patient modal ── */}
      {showNewTest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleCloseNewTest}
        >
          <div
            className="w-full max-w-lg mx-4 bg-[#0d1325]/95 border border-white/10 rounded-2xl p-6 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">New patient</p>
                <p className="text-white/30 text-xs font-mono mt-0.5">Enter patient information to begin</p>
              </div>
              <button onClick={handleCloseNewTest} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="border-t border-white/10" />

            {error && (
              <p className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>First name</label>
                  <input type="text" name="first_name" value={form.first_name} onChange={handleFormChange}
                    placeholder="e.g. Maria" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Last name</label>
                  <input type="text" name="last_name" value={form.last_name} onChange={handleFormChange}
                    placeholder="e.g. Santos" className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Date of birth</label>
                  <input type="date" name="birth_date" value={form.birth_date} onChange={handleFormChange}
                    className={inputClass + " [color-scheme:dark]"} />
                </div>
                <div>
                  <label className={labelClass}>Sex</label>
                  <select name="sex" value={form.sex} onChange={handleFormChange} className={inputClass}>
                    {[["M","Male"],["F","Female"],["X","Other"],["U","Unknown"]].map(([v,l]) => (
                      <option key={v} value={v} className="bg-[#0d1325] text-white">{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Phone</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleFormChange}
                    placeholder="09XX-XXX-XXXX" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" name="email" value={form.email} onChange={handleFormChange}
                    placeholder="example@email.com" className={inputClass} />
                </div>
              </div>

              {/* ── Assigned doctor — fetched from DB ── */}
              <div>
                <label className={labelClass}>Assigned doctor</label>
                <select
                  name="assigned_doctor"
                  value={form.assigned_doctor}
                  onChange={handleFormChange}
                  className={inputClass}
                >
                  <option value="" disabled className="bg-[#0d1325]">
                    {staff.length === 0 ? "No doctors available" : "Select a doctor"}
                  </option>
                  {staff.map(s => (
                    <option key={s.id} value={s.full_name} className="bg-[#0d1325] text-white">
                      {s.full_name}
                      {s.role === "admin" ? " (Admin)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-white/10" />
            <div className="flex items-center justify-between">
              <button onClick={handleCloseNewTest}
                className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all">
                Cancel
              </button>
              <button onClick={handleBeginTest} disabled={submitting}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/25 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Saving…" : "Begin test →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}