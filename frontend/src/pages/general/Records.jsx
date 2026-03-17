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
const textareaClass = `
  w-full px-3 py-2 rounded-lg text-sm
  bg-white/5 border border-white/10
  text-white placeholder-white/25
  focus:outline-none focus:border-white/30
  transition-all resize-none
`;
const labelClass = "block text-white/35 text-xs uppercase tracking-wider font-mono mb-1.5";

function getInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const PLACEHOLDER_TESTS = [
  { id: 1, date: "Mar 10, 2025", test_name: "Humphrey 24-2", performed_by: "Dr. Reyes" },
  { id: 2, date: "Jan 4, 2025",  test_name: "Humphrey 30-2", performed_by: "Dr. Lim"   },
];

const emptyForm = {
  first_name:       "",
  last_name:        "",
  birth_date:       "",
  phone:            "",
  email:            "",
  assigned_doctor:  "",
  sex:              "U",
  visual_condition: "",
  case_history:     "",
  notes:            "",
};

export default function Records() {
  const { authFetch } = useAuth();

  const [patients, setPatients]       = useState([]);
  const [staff, setStaff]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState(null);
  const [isEditing, setIsEditing]     = useState(false);
  const [editForm, setEditForm]       = useState({});
  const [saving, setSaving]           = useState(false);
  const [editError, setEditError]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [showNewTest, setShowNewTest] = useState(false);
  const [form, setForm]               = useState(emptyForm);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);

  // ─── Fetch staff once on mount ────────────────────────────────────────────
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

  useEffect(() => {
    const t = setTimeout(() => fetchPatients(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchPatients]);

  // ─── New patient handlers ─────────────────────────────────────────────────
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

  // ─── Edit handlers ────────────────────────────────────────────────────────
  function handleStartEdit() {
    setEditForm({
      first_name:       selected.first_name       || "",
      last_name:        selected.last_name        || "",
      birth_date:       selected.birth_date       || "",
      phone:            selected.phone            || "",
      email:            selected.email            || "",
      assigned_doctor:  selected.assigned_doctor  || "",
      sex:              selected.sex              || "U",
      visual_condition: selected.visual_condition || "",
      case_history:     selected.case_history     || "",
      notes:            selected.notes            || "",
    });
    setEditError(null);
    setIsEditing(true);
  }

  function handleEditChange(e) {
    setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditError(null);
  }

  async function handleSaveEdit() {
    setSaving(true);
    setEditError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/patients/${selected.id}/`, {
        method: "PATCH",
        headers: { "X-Clinic-ID": CLINIC_ID },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err));
      }
      const updated = await res.json();
      // Update the modal and the table row in place — no full refetch needed
      setSelected(updated);
      setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
      setIsEditing(false);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCloseModal() {
    setSelected(null);
    setIsEditing(false);
    setEditError(null);
    setConfirmDelete(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/patients/${selected.id}/`, {
        method: "DELETE",
        headers: { "X-Clinic-ID": CLINIC_ID },
      });
      if (!res.ok) throw new Error("Failed to delete patient");
      setPatients(prev => prev.filter(p => p.id !== selected.id));
      handleCloseModal();
    } catch (err) {
      setEditError(err.message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
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
              <tr><td colSpan={5} className="text-center py-12 text-white/25 text-sm font-mono">Loading…</td></tr>
            ) : patients.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-white/25 text-sm font-mono">No patients found</td></tr>
            ) : patients.map((p, i) => (
              <tr key={p.id} className={`border-b border-white/5 transition-colors hover:bg-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
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
                    onClick={() => { setSelected(p); setIsEditing(false); }}
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

      {/* ── Expanded patient modal ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-2xl mx-4 bg-[#0d1325]/95 border border-white/10 rounded-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
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
              <div className="flex items-center gap-2">
                {isEditing && <span className="text-xs text-yellow-400/70 font-mono">Editing…</span>}
                <button onClick={handleCloseModal} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* ── VIEW MODE ── */}
            {!isEditing && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Email",           value: selected.email           || "—" },
                    { label: "Phone",           value: selected.phone           || "—" },
                    { label: "Sex",             value: selected.sex             || "—" },
                    { label: "Age",             value: selected.age != null ? `${selected.age} yrs old` : "—" },
                    { label: "Date of birth",   value: selected.birth_date      || "—" },
                    { label: "Assigned doctor", value: selected.assigned_doctor || "—" },
                    { label: "Patient since",   value: new Date(selected.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-white/30 text-xs uppercase tracking-wider font-mono mb-1">{label}</p>
                      <p className="text-white/70 text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10" />
                <div>
                  <p className="text-white/30 text-xs uppercase tracking-wider font-mono mb-1.5">Visual condition</p>
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${selected.visual_condition ? "text-white/70" : "text-white/20 italic"}`}>
                    {selected.visual_condition || "None indicated"}
                  </p>
                </div>

                <div className="border-t border-white/10" />
                <div>
                  <p className="text-white/30 text-xs uppercase tracking-wider font-mono mb-1.5">Case history</p>
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${selected.case_history ? "text-white/70" : "text-white/20 italic"}`}>
                    {selected.case_history || "None indicated"}
                  </p>
                </div>

                <div className="border-t border-white/10" />

                {/* Action buttons */}
                {!confirmDelete ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartEdit}
                      className="flex-1 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all"
                    >
                      Edit record
                    </button>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="px-4 py-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-white/60 text-sm text-center">
                      Are you sure you want to delete <span className="text-white font-medium">{selected.full_name}</span>? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                        className="flex-1 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting ? "Deleting…" : "Yes, delete"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Tests table */}
                <div className="border-t border-white/10" />
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider font-mono mb-3">Tests performed</p>
                  {PLACEHOLDER_TESTS.length === 0 ? (
                    <p className="text-white/20 text-xs font-mono text-center py-6">No tests recorded yet</p>
                  ) : (
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                            <th className="text-left px-4 py-2.5 font-medium">Date</th>
                            <th className="text-left px-4 py-2.5 font-medium">Test</th>
                            <th className="text-left px-4 py-2.5 font-medium">Performed by</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {PLACEHOLDER_TESTS.map((t, i) => (
                            <tr key={t.id} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                              <td className="px-4 py-2.5 text-white/40 text-xs font-mono">{t.date}</td>
                              <td className="px-4 py-2.5 text-white/70 text-xs">{t.test_name}</td>
                              <td className="px-4 py-2.5 text-white/50 text-xs">{t.performed_by}</td>
                              <td className="px-4 py-2.5 text-right">
                                <button className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all">
                                  View test
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── EDIT MODE ── */}
            {isEditing && (
              <>
                {editError && (
                  <p className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {editError}
                  </p>
                )}

                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>First name</label>
                      <input type="text" name="first_name" value={editForm.first_name} onChange={handleEditChange} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Last name</label>
                      <input type="text" name="last_name" value={editForm.last_name} onChange={handleEditChange} className={inputClass} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Date of birth</label>
                      <input type="date" name="birth_date" value={editForm.birth_date} onChange={handleEditChange}
                        className={inputClass + " [color-scheme:dark]"} />
                    </div>
                    <div>
                      <label className={labelClass}>Sex</label>
                      <select name="sex" value={editForm.sex} onChange={handleEditChange} className={inputClass}>
                        {[["M","Male"],["F","Female"],["X","Other"],["U","Unknown"]].map(([v,l]) => (
                          <option key={v} value={v} className="bg-[#0d1325] text-white">{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Phone</label>
                      <input type="tel" name="phone" value={editForm.phone} onChange={handleEditChange}
                        placeholder="09XX-XXX-XXXX" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Email</label>
                      <input type="email" name="email" value={editForm.email} onChange={handleEditChange}
                        placeholder="example@email.com" className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Assigned doctor</label>
                    <select name="assigned_doctor" value={editForm.assigned_doctor} onChange={handleEditChange} className={inputClass}>
                      <option value="" className="bg-[#0d1325]">None</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.full_name} className="bg-[#0d1325] text-white">
                          {s.full_name}{s.role === "admin" ? " (Admin)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Visual condition</label>
                    <textarea name="visual_condition" value={editForm.visual_condition} onChange={handleEditChange}
                      rows={3} placeholder="e.g. Myopia, Glaucoma suspect..." className={textareaClass} />
                  </div>

                  <div>
                    <label className={labelClass}>Case history</label>
                    <textarea name="case_history" value={editForm.case_history} onChange={handleEditChange}
                      rows={3} placeholder="e.g. Previous surgeries, past diagnoses..." className={textareaClass} />
                  </div>
                </div>

                <div className="border-t border-white/10" />
                <div className="flex items-center justify-between">
                  <button onClick={handleCancelEdit} disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/25 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? "Saving…" : "Save changes →"}
                  </button>
                </div>
              </>
            )}

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
            className="w-full max-w-lg mx-4 bg-[#0d1325]/95 border border-white/10 rounded-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
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

              <div>
                <label className={labelClass}>Assigned doctor</label>
                <select name="assigned_doctor" value={form.assigned_doctor} onChange={handleFormChange} className={inputClass}>
                  <option value="" disabled className="bg-[#0d1325]">
                    {staff.length === 0 ? "No doctors available" : "Select a doctor"}
                  </option>
                  {staff.map(s => (
                    <option key={s.id} value={s.full_name} className="bg-[#0d1325] text-white">
                      {s.full_name}{s.role === "admin" ? " (Admin)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Visual condition</label>
                <textarea name="visual_condition" value={form.visual_condition} onChange={handleFormChange}
                  rows={3} placeholder="e.g. Myopia, Glaucoma suspect, Diabetic retinopathy..."
                  className={textareaClass} />
              </div>

              <div>
                <label className={labelClass}>Case history</label>
                <textarea name="case_history" value={form.case_history} onChange={handleFormChange}
                  rows={3} placeholder="e.g. Previous surgeries, past diagnoses, relevant medical history..."
                  className={textareaClass} />
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
                {submitting ? "Saving…" : "Save patient →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}