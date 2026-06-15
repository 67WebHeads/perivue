import React, { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "../../context/AuthContext"
import API_BASE_URL from "../../config/api"

const ROLE_OPTIONS = [
  { value: "admin",     label: "Admin",     desc: "Full access including user management" },
  { value: "clinician", label: "Clinician", desc: "Can run tests and view records" },
  { value: "viewer",    label: "Viewer",    desc: "Read-only access" },
]

const ROLE_STYLES = {
  admin:     "bg-purple-500/15 text-purple-300 border-purple-500/25",
  clinician: "bg-blue-500/15   text-blue-300   border-blue-500/25",
  viewer:    "bg-white/8       text-white/50   border-white/12",
}

function getInitials(name = "") {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"
}

function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0d1325]/98 border border-white/10 rounded-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function RoleSelect({ value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {ROLE_OPTIONS.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
              ${active
                ? "bg-purple-500/15 border-purple-500/40"
                : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
              }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
              ${active ? "border-purple-400" : "border-white/20"}`}>
              {active && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
            </div>
            <div>
              <p className={`text-sm font-medium ${active ? "text-white" : "text-white/70"}`}>{opt.label}</p>
              <p className="text-xs text-white/30">{opt.desc}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function UserManagement() {
  const { authFetch, user: currentUser } = useAuth()

  const [users,     setUsers]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [search,    setSearch]    = useState("")

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: "", full_name: "", role: "clinician" })
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState(null)

  // Edit modal
  const [editTarget, setEditTarget] = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users/manage/`)
      if (!res.ok) throw new Error("Failed to load users")
      setUsers(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  )

  // ── Create user ───────────────────────────────────────────────────────────
  async function handleCreate() {
    setCreating(true)
    setCreateErr(null)
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users/manage/`, {
        method: "POST",
        body: JSON.stringify(createForm),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create user")
      }
      await fetchUsers()
      setShowCreate(false)
      setCreateForm({ email: "", full_name: "", role: "clinician" })
    } catch (err) {
      setCreateErr(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Edit user ─────────────────────────────────────────────────────────────
  function openEdit(user) {
    setEditTarget(user)
    setEditForm({ full_name: user.full_name || "", role: user.role, is_active: user.is_active })
    setSaveErr(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveErr(null)
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users/manage/${editTarget.id}/`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save")
      }
      await fetchUsers()
      setEditTarget(null)
    } catch (err) {
      setSaveErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete user ───────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true)
    try {
      await authFetch(`${API_BASE_URL}/api/users/manage/${deleteTarget.id}/`, {
        method: "DELETE",
      })
      await fetchUsers()
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const inputClass = `
    w-full px-3 py-2 rounded-lg text-sm
    bg-white/5 border border-white/10
    text-white placeholder-white/25
    focus:outline-none focus:border-white/30
    transition-all
  `
  const labelClass = "block text-white/35 text-xs uppercase tracking-wider mb-1.5"

  return (
    <div className="flex flex-col gap-4 font-sans">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm
            bg-white/5 border border-white/10 text-white placeholder-white/30
            focus:outline-none focus:border-white/30 transition-all"
        />
        <button
          onClick={() => { setShowCreate(true); setCreateErr(null) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium
            bg-purple-500/20 border border-purple-500/25 text-white
            hover:bg-purple-500/30 hover:border-purple-500/40 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
          </svg>
          New user
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-white/25 text-sm">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="text-center py-12 text-red-400 text-sm">{error}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-white/25 text-sm">No users found</td></tr>
            ) : filtered.map((u, i) => (
              <tr
                key={u.id}
                className={`border-b border-white/5 transition-colors hover:bg-white/5
                  ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center
                      text-xs font-semibold text-white/70 shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                        : getInitials(u.full_name)
                      }
                    </div>
                    <div>
                      <p className="text-white/80 font-medium leading-tight">
                        {u.full_name || "—"}
                        {u.id === currentUser?.id && (
                          <span className="ml-2 text-[10px] text-white/30 font-normal">(you)</span>
                        )}
                      </p>
                      <p className="text-white/30 text-xs">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium capitalize
                    ${ROLE_STYLES[u.role] || ROLE_STYLES.viewer}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium
                    ${u.is_active
                      ? "bg-green-500/15 text-green-300 border-green-500/25"
                      : "bg-white/5 text-white/30 border-white/10"
                    }`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/30 text-xs">
                  {new Date(u.created_at).toLocaleDateString("en-PH", {
                    year: "numeric", month: "short", day: "numeric"
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10
                        text-white/50 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                      Edit
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/15
                          text-red-400/70 hover:text-red-400 hover:bg-red-500/15 transition-all"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/25">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</p>

      {/* ── Create modal ── */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
            <div>
              <p className="text-white font-medium">New user</p>
              <p className="text-white/30 text-xs mt-0.5">Create a new account</p>
            </div>
            <button onClick={() => setShowCreate(false)}
              className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {createErr && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {createErr}
              </p>
            )}
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                placeholder="name@ceu.edu.ph"
                value={createForm.email}
                onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                placeholder="e.g. Dr. Maria Santos"
                value={createForm.full_name}
                onChange={e => setCreateForm(p => ({ ...p, full_name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <RoleSelect value={createForm.role} onChange={v => setCreateForm(p => ({ ...p, role: v }))} />
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 shrink-0">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/10
                text-white/40 hover:text-white hover:bg-white/10 transition-all">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={creating}
              className="px-5 py-2 rounded-lg text-sm font-medium
                bg-purple-500/20 border border-purple-500/25 text-white
                hover:bg-purple-500/30 transition-all disabled:opacity-50">
              {creating ? "Creating…" : "Create user →"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <Modal onClose={() => setEditTarget(null)}>
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
            <div>
              <p className="text-white font-medium">Edit user</p>
              <p className="text-white/30 text-xs mt-0.5">{editTarget.email}</p>
            </div>
            <button onClick={() => setEditTarget(null)}
              className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {saveErr && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {saveErr}
              </p>
            )}
            <div>
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                value={editForm.full_name}
                onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              {editTarget.id === currentUser?.id ? (
                <p className="text-white/30 text-xs px-1">You cannot change your own role.</p>
              ) : (
                <RoleSelect value={editForm.role} onChange={v => setEditForm(p => ({ ...p, role: v }))} />
              )}
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <div className="flex gap-2">
                {[
                  { v: true,  label: "Active" },
                  { v: false, label: "Inactive" },
                ].map(opt => {
                  const active = editForm.is_active === opt.v
                  return (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setEditForm(p => ({ ...p, is_active: opt.v }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all
                        ${active
                          ? opt.v
                            ? "bg-green-500/15 border-green-500/30 text-green-300"
                            : "bg-red-500/15 border-red-500/30 text-red-300"
                          : "bg-white/5 border-white/10 text-white/40 hover:bg-white/8"
                        }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 shrink-0">
            <button onClick={() => setEditTarget(null)}
              className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/10
                text-white/40 hover:text-white hover:bg-white/10 transition-all">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium
                bg-blue-500/20 border border-blue-500/25 text-blue-400
                hover:bg-blue-500/30 transition-all disabled:opacity-50">
              {saving ? "Saving…" : "Save changes →"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ── */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <div className="px-6 py-6 flex flex-col gap-5">
            <div>
              <p className="text-white font-medium">Delete user</p>
              <p className="text-white/40 text-sm mt-2">
                Are you sure you want to delete{" "}
                <span className="text-white font-medium">{deleteTarget.full_name || deleteTarget.email}</span>?
                This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm bg-white/5 border border-white/10
                  text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm font-medium
                  bg-red-500/20 border border-red-500/30 text-red-400
                  hover:bg-red-500/30 transition-all disabled:opacity-50">
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}