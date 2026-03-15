import React, { useState } from 'react';

// temp lang to
const allPatients = [
  { id: 1,  name: "Maria Santos",    phone: "0917-123-4567", email: "maria.santos@email.com",  doctor: "Dr. Reyes",   lastVisit: "Jan 8, 2025",  status: "active",   joined: "Mar 14, 2023" },
  { id: 2,  name: "Jose dela Cruz",  phone: "0918-234-5678", email: "jose.delacruz@email.com", doctor: "Dr. Lim",     lastVisit: "Feb 2, 2025",  status: "active",   joined: "Jul 2, 2022"  },
  { id: 3,  name: "Ana Reyes",       phone: "0919-345-6789", email: "ana.reyes@email.com",     doctor: "Dr. Reyes",   lastVisit: "Nov 20, 2024", status: "inactive", joined: "Jan 9, 2021"  },
  { id: 4,  name: "Carlos Mendoza",  phone: "0920-456-7890", email: "c.mendoza@email.com",     doctor: "Dr. Garcia",  lastVisit: "Feb 14, 2025", status: "active",   joined: "Sep 30, 2023" },
  { id: 5,  name: "Liza Villanueva", phone: "0921-567-8901", email: "liza.v@email.com",        doctor: "Dr. Lim",     lastVisit: "Dec 5, 2024",  status: "pending",  joined: "Feb 11, 2024" },
  { id: 6,  name: "Ramon Bautista",  phone: "0922-678-9012", email: "rbautista@email.com",     doctor: "Dr. Garcia",  lastVisit: "Jan 29, 2025", status: "active",   joined: "Apr 18, 2022" },
  { id: 7,  name: "Teresa Flores",   phone: "0923-789-0123", email: "t.flores@email.com",      doctor: "Dr. Reyes",   lastVisit: "Oct 11, 2024", status: "inactive", joined: "Jun 5, 2021"  },
  { id: 8,  name: "Miguel Aquino",   phone: "0924-890-1234", email: "m.aquino@email.com",      doctor: "Dr. Lim",     lastVisit: "Feb 20, 2025", status: "active",   joined: "Nov 22, 2023" },
];

const statusStyles = {
  active:   "bg-green-500/15 text-green-400 border border-green-500/20",
  inactive: "bg-red-500/15 text-red-400 border border-red-500/20",
  pending:  "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
};

const doctors = ["all", "Dr. Reyes", "Dr. Lim", "Dr. Garcia"];
const test = ["Test"];

const inputClass = `
  w-full px-3 py-2 rounded-lg text-sm
  bg-white/5 border border-white/10
  text-white placeholder-white/25
  focus:outline-none focus:border-white/30
  transition-all
`;

const labelClass = "block text-white/35 text-xs uppercase tracking-wider font-mono mb-1.5";

function getInitials(name) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const emptyForm = {
  fullName:       "",
  dob:            "",
  phone:          "",
  email:          "",
  assignedDoctor: "",
  test:"",
  //so on, so forth
};

export default function Records() {
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState("all");
  const [doctor, setDoctor]       = useState("all");
  const [selected, setSelected]   = useState(null);
  const [showNewTest, setShowNewTest] = useState(false);
  const [form, setForm]           = useState(emptyForm);

  const filtered = allPatients.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.email.toLowerCase().includes(q);
    const matchStatus = status === "all" || p.status === status;
    const matchDoctor = doctor === "all" || p.doctor === doctor;
    return matchSearch && matchStatus && matchDoctor;
  });

  function handleFormChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleBeginTest() {
    // TODO: wire up to test page navigation or submit logic
    setShowNewTest(false);
    setForm(emptyForm);
  }

  function handleCloseNewTest() {
    setShowNewTest(false);
    setForm(emptyForm);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search patient, phone, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-all"
        />
        <div className="flex gap-1.5">
          {["all", "active", "inactive", "pending"].map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-2 rounded-lg text-xs capitalize transition-all ${
                status === s
                  ? "bg-white/20 text-white"
                  : "bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <select
          value={doctor}
          onChange={e => setDoctor(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-white/60 focus:outline-none focus:border-white/30 transition-all"
        >
          {doctors.map(d => (
            <option key={d} value={d} className="bg-[#0d1325] text-white">
              {d === "all" ? "All doctors" : d}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowNewTest(true)}
          className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-blue-500/20 border border-blue-500/25 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/40 transition-all hover:cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          New test
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Patient</th>
              <th className="text-left px-4 py-3 font-medium">Contact</th>
              <th className="text-left px-4 py-3 font-medium">Assigned doctor</th>
              <th className="text-left px-4 py-3 font-medium">Last visit</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/25 text-sm font-mono">
                  No patients found
                </td>
              </tr>
            ) : filtered.map((p, i) => (
              <tr
                key={p.id}
                className={`border-b border-white/5 transition-colors hover:bg-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shrink-0">
                      {getInitials(p.name)}
                    </div>
                    <div>
                      <p className="text-white/80 font-medium leading-tight">{p.name}</p>
                      <p className="text-white/30 text-xs font-mono">#{String(p.id).padStart(4, "0")}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-white/60 text-xs">{p.phone}</p>
                  <p className="text-white/30 text-xs font-mono">{p.email}</p>
                </td>
                <td className="px-4 py-3 text-white/50 text-sm">{p.doctor}</td>
                <td className="px-4 py-3 text-white/40 text-xs font-mono">{p.lastVisit}</td>
                <td className="px-4 py-3 text-white/30 text-xs font-mono">{p.joined}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[p.status]}`}>
                    {p.status}
                  </span>
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
        {filtered.length} of {allPatients.length} patients
      </p>

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
                  {getInitials(selected.name)}
                </div>
                <div>
                  <p className="text-white font-medium">{selected.name}</p>
                  <p className="text-white/30 text-xs font-mono">#{String(selected.id).padStart(4, "0")}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="border-t border-white/10" />
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Phone", value: selected.phone },
                { label: "Email", value: selected.email },
                { label: "Assigned doctor", value: selected.doctor },
                { label: "Status", value: selected.status },
                { label: "Last visit", value: selected.lastVisit },
                { label: "Patient since", value: selected.joined },
                // { label: "Test Done", value: selected.test },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-white/30 text-xs uppercase tracking-wider font-mono mb-1">{label}</p>
                  <p className="text-white/70 text-sm capitalize">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button className="flex-1 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-all">
                Edit record
              </button>
              {/* <button className="flex-1 py-2 rounded-lg text-sm bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all">
                Schedule visit
              </button> */}
            </div>
          </div>
        </div>
      )}

      {showNewTest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleCloseNewTest}
        >
          <div
            className="w-full max-w-lg mx-4 bg-[#0d1325]/95 border border-white/10 rounded-2xl p-6 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">New test</p>
                <p className="text-white/30 text-xs font-mono mt-0.5">Enter patient information to begin</p>
              </div>
              <button onClick={handleCloseNewTest} className="text-white/30 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="border-t border-white/10" />

            <div className="flex flex-col gap-4">

              <div>
                <label className={labelClass}>Full name</label>
                <input
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleFormChange}
                  placeholder="e.g. Maria Santos"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Date of birth</label>
                  <input
                    type="date"
                    name="dob"
                    value={form.dob}
                    onChange={handleFormChange}
                    className={inputClass + " [color-scheme:dark]"}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleFormChange}
                    placeholder="09XX-XXX-XXXX"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleFormChange}
                  placeholder="example@email.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Assigned doctor</label>
                <select
                  name="assignedDoctor"
                  value={form.assignedDoctor}
                  onChange={handleFormChange}
                  className={inputClass}
                >
                  <option value="" disabled className="bg-[#0d1325]">Select a doctor</option>
                  {["Dr. Reyes", "Dr. Lim", "Dr. Garcia"].map(d => (
                    <option key={d} value={d} className="bg-[#0d1325] text-white">{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Test</label>
                <select
                  name="test"
                  value={form.test}
                  onChange={handleFormChange}
                  className={inputClass}
                >
                  <option value="" disabled className="bg-[#0d1325]">Select Test Mode</option>
                  {["Test 1"].map(d => (
                    <option key={d} value={d} className="bg-[#0d1325] text-white">{d}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="border-t border-white/10" />
            <div className="flex items-center justify-between">
              <button
                onClick={handleCloseNewTest}
                className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBeginTest}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/25 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/40 transition-all"
              >
                Begin test →
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}