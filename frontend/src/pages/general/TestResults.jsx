import React, { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import API_BASE_URL from '../../config/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function polarToXY(angleDeg, radiusDeg, cx, cy, scale) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + Math.cos(rad) * radiusDeg * scale,
    y: cy + Math.sin(rad) * radiusDeg * scale,
  }
}

function cartesianToSvg(xDeg, yDeg, cx, cy, scale) {
  return {
    x: cx + xDeg * scale,
    y: cy - yDeg * scale,
  }
}

// ─── Field Map ────────────────────────────────────────────────────────────────

function FieldMap({ eye, staticResults, kineticResults }) {
  const size  = 280
  const cx    = size / 2
  const cy    = size / 2
  const scale = (size / 2 - 18) / 35
  const rings = [5, 10, 15, 20, 25, 30, 35]
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315]

  // Build isopter path from kinetic boundary points that were seen
  // Sort by angle so the path connects correctly
  const boundaryPoints = kineticResults
    .filter(r => r.result === 'seen' && r.boundary_x != null && r.boundary_y != null)
    .map(r => {
      const angle = Math.atan2(r.boundary_y, r.boundary_x) * (180 / Math.PI)
      const radius = Math.sqrt(r.boundary_x ** 2 + r.boundary_y ** 2)
      return { angle, radius, x: r.boundary_x, y: r.boundary_y }
    })
    .sort((a, b) => a.angle - b.angle)

  const boundaryPath = boundaryPoints.length >= 3
    ? boundaryPoints.map((p, i) => {
        const { x, y } = cartesianToSvg(p.x, p.y, cx, cy, scale)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ') + ' Z'
    : null

  return (
    <svg width={size} height={size} className="block">
      {/* Rings */}
      {rings.map(r => (
        <circle
          key={r} cx={cx} cy={cy} r={r * scale}
          fill="none"
          stroke={r % 10 === 0 ? '#ffffff22' : '#ffffff12'}
          strokeWidth={r % 10 === 0 ? 1.2 : 0.6}
        />
      ))}

      {/* Spokes */}
      {spokes.map(a => {
        const inner = polarToXY(a, 0,  cx, cy, scale)
        const outer = polarToXY(a, 35, cx, cy, scale)
        return (
          <line key={a}
            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke="#ffffff10" strokeWidth={0.6}
          />
        )
      })}

      {/* Kinetic isopter */}
      {boundaryPath && (
        <path
          d={boundaryPath}
          fill="#a855f718"
          stroke="#a855f7"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}

      {/* Static results */}
      {staticResults.map((r, i) => {
        const { x, y } = cartesianToSvg(r.x_deg, r.y_deg, cx, cy, scale)
        return r.result === 'seen' ? (
          <circle key={i} cx={x} cy={y} r={4} fill="#22c55e" opacity={0.85} />
        ) : (
          <g key={i}>
            <line x1={x-3.5} y1={y-3.5} x2={x+3.5} y2={y+3.5} stroke="#ef4444" strokeWidth={1.5} />
            <line x1={x+3.5} y1={y-3.5} x2={x-3.5} y2={y+3.5} stroke="#ef4444" strokeWidth={1.5} />
          </g>
        )
      })}

      {/* Fixation cross */}
      <line x1={cx-5} y1={cy} x2={cx+5} y2={cy} stroke="white" strokeWidth={1.5} />
      <line x1={cx} y1={cy-5} x2={cx} y2={cy+5} stroke="white" strokeWidth={1.5} />

      {/* Eye label */}
      <text x={8} y={18} fill="#ffffff60" fontSize={11} fontWeight="600">{eye}</text>
    </svg>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, sub, color }) {
  const colors = {
    green:  'text-green-400',
    yellow: 'text-yellow-400',
    blue:   'text-blue-400',
    purple: 'text-purple-400',
    red:    'text-red-400',
  }
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${colors[color] ?? 'text-white'}`}>
        {value ?? '—'}
        {value != null && <span className="text-sm font-normal text-white/40 ml-1">{unit}</span>}
      </span>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  )
}

// ─── Run Panel ────────────────────────────────────────────────────────────────

function RunPanel({ run }) {
  const m = run.metrics

  const detectionColor = m.detection_accuracy >= 80 ? 'green'
    : m.detection_accuracy >= 60 ? 'yellow' : 'red'
  const reliabilityColor = m.reliability >= 85 ? 'green'
    : m.reliability >= 70 ? 'yellow' : 'red'

  // Duration
  let duration = null
  if (run.start_time && run.end_time) {
    const secs = Math.round(
      (new Date(run.end_time) - new Date(run.start_time)) / 1000
    )
    duration = secs < 60
      ? `${secs}s`
      : `${Math.floor(secs / 60)}m ${secs % 60}s`
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Field map */}
      <div className="flex justify-center bg-black/40 rounded-2xl border border-white/10 p-4">
        <div className="flex flex-col items-center gap-3">
          <FieldMap
            eye={run.eye}
            staticResults={run.static_results}
            kineticResults={run.kinetic_results}
          />
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              Seen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 inline-block relative">
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <line x1="0" y1="0" x2="10" y2="10" stroke="#ef4444" strokeWidth="1.5"/>
                  <line x1="10" y1="0" x2="0" y2="10" stroke="#ef4444" strokeWidth="1.5"/>
                </svg>
              </span>
              Not seen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-purple-400 inline-block" />
              Isopter
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Detection Accuracy"
          value={m.detection_accuracy}
          unit="%"
          sub={`${m.stimuli_seen}/${m.stimuli_total} stimuli seen`}
          color={detectionColor}
        />
        <MetricCard
          label="Avg Reaction Time"
          value={m.avg_reaction_time}
          unit="ms"
          sub="Across seen stimuli"
          color="yellow"
        />
        <MetricCard
          label="Kinetic Boundary"
          value={m.kinetic_boundary_points}
          unit={`/ ${m.kinetic_total}`}
          sub="Points with response"
          color="purple"
        />
        <MetricCard
          label="Test Reliability"
          value={m.reliability}
          unit="%"
          sub={`${run.fixation_loss_count} fixation loss${run.fixation_loss_count !== 1 ? 'es' : ''}`}
          color={reliabilityColor}
        />
      </div>

      {/* Progress bars */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
        <span className="text-xs text-white/40 uppercase tracking-wider">Stimulus Breakdown</span>
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Static detection ({m.stimuli_seen}/{m.stimuli_total})</span>
              <span>{m.detection_accuracy}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${m.detection_accuracy}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Kinetic boundary ({m.kinetic_boundary_points}/{m.kinetic_total})</span>
              <span>{m.kinetic_total > 0 ? Math.round((m.kinetic_boundary_points / m.kinetic_total) * 100) : 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${m.kinetic_total > 0 ? (m.kinetic_boundary_points / m.kinetic_total) * 100 : 0}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Fixation reliability</span>
              <span>{m.reliability}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-purple-400 transition-all"
                style={{ width: `${m.reliability}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Duration */}
      {duration && (
        <p className="text-xs text-white/25 text-center">
          Test duration: {duration}
        </p>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TestResults() {
  const [searchParams]  = useSearchParams()
  const runId           = searchParams.get('run_id')
  const { authFetch }   = useAuth()

  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [activeEye, setActiveEye] = useState(null)

  const fetchResults = useCallback(async () => {
  if (!runId) { setError('No run ID provided'); setLoading(false); return }

  try {
    // Step 1 — get run to find session_id
    const runRes = await authFetch(
      `${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`
    )
    if (!runRes.ok) throw new Error('Run not found')
    const run = await runRes.json()

    // Step 2 — get full session results using session_id from run
    const sessionRes = await authFetch(
      `${API_BASE_URL}/api/visual-tests/sessions/${run.session_id}/results/`
    )
    if (!sessionRes.ok) throw new Error('Results not found')
    const results = await sessionRes.json()

    setData(results)
    if (results.runs.length > 0) {
      setActiveEye(results.runs[0].eye)
    }
  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}, [runId, authFetch])

  useEffect(() => { fetchResults() }, [fetchResults])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
        <p className="text-white/30 text-sm">Loading results…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <Link to="/test" className="text-white/40 text-xs hover:text-white transition-colors">
          ← Back to test menu
        </Link>
      </div>
    )
  }

  const { session, patient, runs } = data
  const activeRun = runs.find(r => r.eye === activeEye)

  const SEX_LABELS = { M: 'Male', F: 'Female', X: 'Other', U: 'Unknown' }

  return (
    <div className="relative min-h-screen bg-[#0d0d1a] text-white overflow-x-hidden font-sans">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#0d0d1a]/90 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link to="/test" className="text-white/40 hover:text-white transition-colors">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-sm font-semibold">Visual Field Test Results</h1>
        <span className="ml-auto text-xs text-white/25">
          {new Date(session.session_datetime).toLocaleDateString('en-PH', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* Patient info */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24" className="text-purple-400">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            <span className="text-sm font-semibold">Patient Information</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              ['Name',            patient.full_name],
              ['Patient Code',    patient.patient_code || '—'],
              ['Age',             patient.age != null ? `${patient.age} years old` : '—'],
              ['Sex',             SEX_LABELS[patient.sex] ?? patient.sex],
              ['Assigned Doctor', patient.assigned_doctor || '—'],
              ['Protocol',        session.protocol_name],
              ['Performed By',    session.performed_by || '—'],
            ].map(([label, val]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-xs text-white/30">{label}</span>
                <span className="text-white/70">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Eye switcher — only show if more than one run */}
        {runs.length > 1 && (
          <div className="flex gap-2 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
            {runs.map(r => (
              <button
                key={r.eye}
                type="button"
                onClick={() => setActiveEye(r.eye)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all
                  ${activeEye === r.eye
                    ? 'bg-purple-600 text-white'
                    : 'text-white/40 hover:text-white'
                  }`}
              >
                {r.eye === 'OD' ? 'OD — Right' : 'OS — Left'}
              </button>
            ))}
          </div>
        )}

        {/* Single eye label if only one run */}
        {runs.length === 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {runs[0].eye === 'OD' ? 'OD — Right Eye' : 'OS — Left Eye'}
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium
              ${runs[0].status === 'completed'
                ? 'bg-green-500/15 border-green-500/30 text-green-300'
                : 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300'
              }`}>
              {runs[0].status}
            </span>
          </div>
        )}

        {/* Run panel */}
        {activeRun && <RunPanel run={activeRun} />}

        {/* Notes */}
        {session.notes && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Session Notes</p>
            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
              {session.notes}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}