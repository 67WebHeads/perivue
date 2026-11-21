import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import API_BASE_URL from '../../config/api'
import { invalidatePrefix } from '../../cache/Apicache'
import { summarizeRun, GLOSSARY } from '../../results/plainLanguage'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'

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
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2 pb-3">
      <span className="text-[10px] font-semibold text-white/35 uppercase tracking-widest">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-5xl font-bold leading-none ${colors[color] ?? 'text-white'}`}>
          {value ?? '—'}
        </span>
        {value != null && unit && (
          <span className="text-xs font-medium text-white/30">{unit}</span>
        )}
      </div>
      {sub && <span className="text-[11px] text-white/40 leading-snug mt-1">{sub}</span>}
    </div>
  )
}

// ─── Plain-language summary ───────────────────────────────────────────────────

const TONE_STYLES = {
  good:       { chip: 'bg-green-500/15 border-green-500/30 text-green-300',    label: 'Mostly seen' },
  mixed:      { chip: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300', label: 'Some dots missed' },
  concern:    { chip: 'bg-red-500/15 border-red-500/30 text-red-300',          label: 'Many dots missed' },
  unreliable: { chip: 'bg-orange-500/15 border-orange-500/30 text-orange-300', label: 'May need a repeat' },
}

function PlainSummary({ run }) {
  const summary = summarizeRun(run)
  const tone = TONE_STYLES[summary.tone]
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">What these results mean</span>
        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${tone.chip}`}>
          {tone.label}
        </span>
      </div>
      <p className="text-base text-white/90 leading-snug">{summary.headline}</p>
      <ul className="flex flex-col gap-2 list-disc pl-5 text-sm text-white/70 leading-relaxed">
        {summary.points.map((point, i) => <li key={i}>{point}</li>)}
      </ul>
    </div>
  )
}

function Glossary() {
  return (
    <details className="bg-white/5 border border-white/10 rounded-2xl p-5 group">
      <summary className="cursor-pointer text-sm font-semibold list-none flex items-center justify-between">
        Words used in this report
        <span className="text-white/30 text-xs group-open:hidden">Show</span>
        <span className="text-white/30 text-xs hidden group-open:inline">Hide</span>
      </summary>
      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        {GLOSSARY.map(([term, meaning]) => (
          <React.Fragment key={term}>
            <dt className="text-white/80 font-medium">{term}</dt>
            <dd className="text-white/55 leading-relaxed">{meaning}</dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
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
      <PlainSummary run={run} />
      <div className="flex gap-4 md:flex-row flex-col items-center  justify-center bg-black/40 rounded-2xl border border-white/10 p-4">
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
              Edge of side vision (isopter)
            </span>
          </div>
          <p className="text-[11px] text-white/30 text-center max-w-[280px] leading-snug">
            The cross is where the eye looked. Each mark is a spot where a dot flashed,
            seen from the patient&apos;s side.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Detection Accuracy"
              value={m.detection_accuracy}
              unit="%"
              sub={`Saw ${m.stimuli_seen} of ${m.stimuli_total} flashing dots`}
              color={detectionColor}
            />
            <MetricCard
              label="Avg Reaction Time"
              value={m.avg_reaction_time}
              unit="ms"
              sub={m.avg_reaction_time != null
                ? `About ${(m.avg_reaction_time / 1000).toFixed(1)} s from dot to button press`
                : 'Time from dot to button press'}
              color="yellow"
            />
            <MetricCard
              label="Kinetic Boundary"
              value={m.kinetic_boundary_points}
              unit={`/ ${m.kinetic_total}`}
              sub="Moving dots noticed before reaching the centre"
              color="purple"
            />
            <MetricCard
              label="Test Reliability"
              value={m.reliability}
              unit="%"
              sub={`How steadily the eye stayed on the centre · looked away ${run.fixation_loss_count} time${run.fixation_loss_count !== 1 ? 's' : ''}`}
              color={reliabilityColor}
            />
          </div>

          {/* Stimulus Breakdown */}
          <div className="border-t border-white/5 pt-3 flex flex-col gap-3">
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Stimulus Breakdown</span>
            <div className="flex flex-col gap-2.5">
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

// ─── Printable (light) Field Map ──────────────────────────────────────────────

function PrintableFieldMap({ eye, staticResults, kineticResults }) {
  const size  = 320
  const cx    = size / 2
  const cy    = size / 2
  const scale = (size / 2 - 22) / 35
  const rings = [5, 10, 15, 20, 25, 30, 35]
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315]

  const boundaryPoints = kineticResults
    .filter(r => r.result === 'seen' && r.boundary_x != null && r.boundary_y != null)
    .map(r => {
      const angle = Math.atan2(r.boundary_y, r.boundary_x) * (180 / Math.PI)
      return { angle, x: r.boundary_x, y: r.boundary_y }
    })
    .sort((a, b) => a.angle - b.angle)

  const boundaryPath = boundaryPoints.length >= 3
    ? boundaryPoints.map((p, i) => {
        const { x, y } = cartesianToSvg(p.x, p.y, cx, cy, scale)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ') + ' Z'
    : null

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <rect x={0} y={0} width={size} height={size} fill="#ffffff" />
      {rings.map(r => (
        <circle
          key={r} cx={cx} cy={cy} r={r * scale}
          fill="none"
          stroke={r % 10 === 0 ? '#666' : '#bbb'}
          strokeWidth={r % 10 === 0 ? 1 : 0.5}
        />
      ))}
      {spokes.map(a => {
        const inner = polarToXY(a, 0,  cx, cy, scale)
        const outer = polarToXY(a, 35, cx, cy, scale)
        return (
          <line key={a}
            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke="#ccc" strokeWidth={0.5}
          />
        )
      })}
      {[10, 20, 30].map(r => (
        <text key={r}
          x={cx + 2} y={cy - r * scale - 2}
          fontSize={9} fill="#888"
        >
          {r}°
        </text>
      ))}
      {boundaryPath && (
        <path
          d={boundaryPath}
          fill="rgba(120, 80, 200, 0.10)"
          stroke="#5b2da3"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {staticResults.map((r, i) => {
        const { x, y } = cartesianToSvg(r.x_deg, r.y_deg, cx, cy, scale)
        return r.result === 'seen' ? (
          <circle key={i} cx={x} cy={y} r={4} fill="#1f8a3b" />
        ) : (
          <g key={i}>
            <line x1={x-4} y1={y-4} x2={x+4} y2={y+4} stroke="#c0392b" strokeWidth={1.5} />
            <line x1={x+4} y1={y-4} x2={x-4} y2={y+4} stroke="#c0392b" strokeWidth={1.5} />
          </g>
        )
      })}
      <line x1={cx-6} y1={cy} x2={cx+6} y2={cy} stroke="#222" strokeWidth={1.2} />
      <line x1={cx} y1={cy-6} x2={cx} y2={cy+6} stroke="#222" strokeWidth={1.2} />
      <text x={10} y={18} fill="#444" fontSize={11} fontWeight="700">{eye}</text>
    </svg>
  )
}

// ─── Printable Report (formal clinical layout) ────────────────────────────────

// ─── Printable plain-language summary ─────────────────────────────────────────

function PrintableSummary({ run }) {
  const summary = summarizeRun(run)
  return (
    <div style={{
      marginTop: 12, padding: '10px 0', background: '#ffffff',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#5b2da3', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        What this means
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', margin: '4px 0 6px' }}>
        {summary.headline}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10.5, color: '#333', lineHeight: 1.5 }}>
        {summary.points.map((point, i) => <li key={i}>{point}</li>)}
      </ul>
    </div>
  )
}

function PrintableReport({ session, patient, runs }) {
  const SEX_LABELS = { M: 'Male', F: 'Female', X: 'Other', U: 'Unknown' }
  const dateStr = new Date(session.session_datetime).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const generatedStr = new Date().toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const labelStyle = { fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }
  const valueStyle = { fontSize: 12, color: '#111', fontWeight: 500 }
  const rowStyle = { display: 'flex', flexDirection: 'column', gap: 2 }
  const sectionTitle = {
    fontSize: 11, fontWeight: 700, color: '#5b2da3',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
    paddingBottom: 4, borderBottom: '1px solid #ddd',
  }

  return (
    <div style={{
      width: 720,
      padding: '32px 40px',
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      color: '#111',
      background: '#ffffff',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '2px solid #5b2da3',
        paddingBottom: 12,
        marginBottom: 20,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#5b2da3', letterSpacing: 1 }}>
            CEU EYE CLINIC
          </div>
          <div style={{ fontSize: 10, color: '#555' }}>
            Centro Escolar University — Department of Optometry
          </div>
          <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
            Mendiola, Manila, Philippines
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#888' }}>Report generated</div>
          <div style={{ fontSize: 11, color: '#333', fontWeight: 600 }}>{generatedStr}</div>
        </div>
      </div>

      {/* Document title */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
          TANGENT SCREEN VISUAL FIELD TEST REPORT
        </div>
        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
          Examination of {dateStr}
        </div>
      </div>

      {/* Patient info */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionTitle}>Patient Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 10, columnGap: 32 }}>
          <div style={rowStyle}>
            <span style={labelStyle}>Name</span>
            <span style={valueStyle}>{patient.full_name}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Patient Code</span>
            <span style={valueStyle}>{patient.patient_code || '—'}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Age</span>
            <span style={valueStyle}>{patient.age != null ? `${patient.age} years` : '—'}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Sex</span>
            <span style={valueStyle}>{SEX_LABELS[patient.sex] ?? patient.sex}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Assigned Doctor</span>
            <span style={valueStyle}>{patient.assigned_doctor || '—'}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Email</span>
            <span style={valueStyle}>{patient.email || '—'}</span>
          </div>
        </div>
      </div>

      {/* Examination details */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionTitle}>Examination Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 10, columnGap: 32 }}>
          <div style={rowStyle}>
            <span style={labelStyle}>Test Protocol</span>
            <span style={valueStyle}>{session.protocol_name}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Performed By</span>
            <span style={valueStyle}>{session.performed_by || '—'}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Eye(s) Tested</span>
            <span style={valueStyle}>
              {runs.map(r => r.eye === 'OD' ? 'Right (OD)' : 'Left (OS)').join(', ')}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Examination Date</span>
            <span style={valueStyle}>{dateStr}</span>
          </div>
        </div>
      </div>

      {/* Runs */}
      {runs.map((run, idx) => {
        const m = run.metrics
        const eyeLabel = run.eye === 'OD' ? 'Right Eye (OD)' : 'Left Eye (OS)'
        let duration = '—'
        if (run.start_time && run.end_time) {
          const secs = Math.round(
            (new Date(run.end_time) - new Date(run.start_time)) / 1000
          )
          duration = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
        }
        return (
          <div key={run.id} style={{
            marginBottom: 18,
            pageBreakInside: 'avoid',
            ...(idx > 0 ? { borderTop: '1px dashed #ccc', paddingTop: 18 } : {}),
          }}>
            <div style={sectionTitle}>{eyeLabel} — Results</div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: 4 }}>
                <PrintableFieldMap
                  eye={run.eye}
                  staticResults={run.static_results}
                  kineticResults={run.kinetic_results}
                />
              </div>
              <div style={{ flex: 1 }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse', fontSize: 11,
                }}>
                  <tbody>
                    {[
                      ['Detection Accuracy', `${m.detection_accuracy}%`,
                        `Saw ${m.stimuli_seen} of ${m.stimuli_total} flashing dots`],
                      ['Avg. Reaction Time', m.avg_reaction_time != null ? `${m.avg_reaction_time} ms` : '—',
                        'Time from dot to button press'],
                      ['Kinetic Boundary',
                        `${m.kinetic_boundary_points} / ${m.kinetic_total}`,
                        'Moving dots noticed before reaching the centre'],
                      ['Test Reliability', `${m.reliability}%`,
                        `Eye looked away from the centre ${run.fixation_loss_count} time${run.fixation_loss_count !== 1 ? 's' : ''}`],
                      ['Status', run.status, `Duration: ${duration}`],
                    ].map(([label, val, sub]) => (
                      <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px 8px', color: '#666', width: '40%' }}>{label}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{val}</td>
                        <td style={{ padding: '6px 8px', color: '#888', fontSize: 10 }}>{sub}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: 9, color: '#666', display: 'flex', gap: 14 }}>
                  <span>● Seen (green)</span>
                  <span>✕ Not seen (red)</span>
                  <span>― Edge of side vision / isopter (purple)</span>
                </div>
              </div>
            </div>
            <PrintableSummary run={run} />
          </div>
        )
      })}

      {/* Notes */}
      {[
        ['Patient Notes', session.patient_notes],
        ['Examiner Notes', session.examiner_notes],
      ].filter(([, text]) => text).map(([title, text]) => (
        <div key={title} style={{ marginBottom: 20 }}>
          <div style={sectionTitle}>{title}</div>
          <p style={{
            fontSize: 11, color: '#333', lineHeight: 1.5,
            whiteSpace: 'pre-wrap', margin: 0,
          }}>
            {text}
          </p>
        </div>
      ))}

      {/* Signature */}
      <div style={{ marginTop: 32, display: 'flex', gap: 40 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 10, color: '#666' }}>
            Examiner / Clinician Signature
          </div>
          <div style={{ fontSize: 11, marginTop: 6 }}>{session.performed_by || ''}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4, fontSize: 10, color: '#666' }}>
            Reviewing Physician
          </div>
          <div style={{ fontSize: 11, marginTop: 6 }}>{patient.assigned_doctor || ''}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 28,
        paddingTop: 10,
        borderTop: '1px solid #ddd',
        fontSize: 8,
        color: '#888',
        textAlign: 'center',
        lineHeight: 1.5,
      }}>
        This report was generated by PeriVue, the digital tangent screen system used by CEU Eye Clinic.
        Results are intended for use by qualified eye-care professionals and should be interpreted
        in the context of a complete ophthalmic examination.
      </div>
    </div>
  )
}

// ─── Notes panel ──────────────────────────────────────────────────────────────

function NotesPanel({ session, authFetch, onSaved }) {
  const [examinerNotes, setExaminerNotes] = useState(session.examiner_notes || '')
  const [patientNotes,  setPatientNotes]  = useState(session.patient_notes || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const dirty =
    examinerNotes !== (session.examiner_notes || '') ||
    patientNotes  !== (session.patient_notes || '')

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await authFetch(`${API_BASE_URL}/api/visual-tests/sessions/${session.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          examiner_notes: examinerNotes.trim() || null,
          patient_notes:  patientNotes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save notes')
      const updated = await res.json()
      // Session lists (Records, Dashboard) carry the notes too
      invalidatePrefix(`${API_BASE_URL}/api/visual-tests/sessions/`)
      setExaminerNotes(updated.examiner_notes || '')
      setPatientNotes(updated.patient_notes || '')
      onSaved({ examiner_notes: updated.examiner_notes, patient_notes: updated.patient_notes })
      setStatus({ type: 'success', msg: 'Notes saved' })
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    {
      id: 'patient-notes',
      label: 'Patient Notes',
      hint: 'Symptoms or concerns reported by the patient',
      value: patientNotes,
      onChange: setPatientNotes,
    },
    {
      id: 'examiner-notes',
      label: 'Examiner Notes',
      hint: 'Observations during the test — cooperation, fixation, reliability',
      value: examinerNotes,
      onChange: setExaminerNotes,
    },
  ]

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
      <span className="text-sm font-semibold">Notes</span>

      {fields.map(f => (
        <label key={f.id} htmlFor={f.id} className="flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <span className="text-xs text-white/50 uppercase tracking-wider">{f.label}</span>
            <span className="text-xs text-white/25">{f.hint}</span>
          </span>
          <textarea
            id={f.id}
            rows={3}
            value={f.value}
            onChange={e => { f.onChange(e.target.value); setStatus(null) }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80
              focus:border-purple-500/50 focus:outline-none resize-y"
          />
        </label>
      ))}

      <div className="flex items-center justify-end gap-3">
        {status && (
          <p className={`text-xs ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {status.msg}
          </p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-xs px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white
            transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TestResults() {
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('run_id')
  const { authFetch }   = useAuth()

  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [activeEye, setActiveEye] = useState(null)

  const reportRef = useRef(null)
  const printableRef = useRef(null)
  const [exporting,    setExporting]    = useState(false)
  const [emailOpen,    setEmailOpen]    = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailStatus,  setEmailStatus]  = useState(null)
  const [emailForm,    setEmailForm]    = useState({ to: '', subject: '', body: '' })

  // Build PDF from the report DOM. Returns a jsPDF doc + filename.
  const buildPdf = useCallback(async () => {
    const node = printableRef.current
    if (!node) throw new Error('Report not ready')
    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    })
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 24
    const contentW = pageW - margin * 2
    const contentH = pageH - margin * 2
    const scaleFactor = contentW / canvas.width
    const fullImgH = canvas.height * scaleFactor
    if (fullImgH <= contentH) {
      const imgData = canvas.toDataURL('image/jpeg', 0.85)
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, fullImgH)
    } else {
      // Slice into pages
      const sliceHeightPx = Math.floor(contentH / scaleFactor)
      let yPx = 0
      let firstPage = true
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      const ctx = sliceCanvas.getContext('2d')
      while (yPx < canvas.height) {
        const remaining = canvas.height - yPx
        const h = Math.min(sliceHeightPx, remaining)
        sliceCanvas.height = h
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, h)
        ctx.drawImage(canvas, 0, yPx, canvas.width, h, 0, 0, canvas.width, h)
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.85)
        if (!firstPage) pdf.addPage()
        pdf.addImage(sliceData, 'JPEG', margin, margin, contentW, h * scaleFactor)
        firstPage = false
        yPx += h
      }
    }
    const code = data?.patient?.patient_code || 'patient'
    const date = new Date(data?.session?.session_datetime || Date.now())
      .toISOString().split('T')[0]
    return { pdf, filename: `perivue_${code}_${date}.pdf` }
  }, [data])

  const handleDownloadPdf = useCallback(async () => {
    try {
      setExporting(true)
      const { pdf, filename } = await buildPdf()
      pdf.save(filename)
    } catch (e) {
      alert(`Failed to generate PDF: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }, [buildPdf])

  const openEmailModal = useCallback(() => {
    if (!data) return
    const p = data.patient
    const date = new Date(data.session.session_datetime).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    const lines = [
      `Dear ${p.full_name},`,
      '',
      `Attached is your peripheral vision test report from ${date}.`,
      '',
      'Test summary:',
      ...data.runs.map(r => {
        const m = r.metrics
        const eye = r.eye === 'OD' ? 'Right eye (OD)' : 'Left eye (OS)'
        return `  • ${eye} — Detection ${m.detection_accuracy}% (${m.stimuli_seen}/${m.stimuli_total}), Reliability ${m.reliability}%`
      }),
      '',
      'Please discuss these results with your assigned doctor.',
      '',
      'Regards,',
      'PeriVue / CEU Eye Clinic',
    ]
    setEmailForm({
      to: p.email || '',
      subject: `Visual Field Test Results — ${p.full_name}`,
      body: lines.join('\n'),
    })
    setEmailStatus(null)
    setEmailOpen(true)
  }, [data])

  const handleSendEmail = useCallback(async () => {
    if (!emailForm.to.trim()) {
      setEmailStatus({ type: 'error', msg: 'Recipient email is required.' })
      return
    }
    try {
      setEmailSending(true)
      setEmailStatus(null)
      const { pdf, filename } = await buildPdf()
      const blob = pdf.output('blob')
      const fd = new FormData()
      fd.append('pdf', blob, filename)
      fd.append('to', emailForm.to)
      fd.append('subject', emailForm.subject)
      fd.append('body', emailForm.body)
      const token = localStorage.getItem('access_token')
      const res = await fetch(
        `${API_BASE_URL}/api/visual-tests/sessions/${data.session.id}/email/`,
        {
          method: 'POST',
          body: fd,
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to send email')
      setEmailStatus({ type: 'success', msg: `Email sent to ${json.sent_to}` })
    } catch (e) {
      setEmailStatus({ type: 'error', msg: e.message })
    } finally {
      setEmailSending(false)
    }
  }, [emailForm, buildPdf, authFetch, data])

  const fetchResults = useCallback(async () => {
    const sessionId = searchParams.get('session_id')
    const runId     = searchParams.get('run_id')

    if (!sessionId && !runId) {
      setError('No session or run ID provided')
      setLoading(false)
      return
    }

    try {
      let resolvedSessionId = sessionId

      // If we only have run_id, look up the session_id from run state
      if (!resolvedSessionId) {
        const runRes = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
        if (!runRes.ok) throw new Error('Run not found')
        const run = await runRes.json()
        resolvedSessionId = run.session_id
      }

      const sessionRes = await authFetch(
        `${API_BASE_URL}/api/visual-tests/sessions/${resolvedSessionId}/results/`
      )
      if (!sessionRes.ok) throw new Error('Results not found')
      const results = await sessionRes.json()

      setData(results)
      if (results.runs.length > 0) setActiveEye(results.runs[0].eye)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [runId, searchParams, authFetch])

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
        <Link to="/records" className="text-white/40 text-xs hover:text-white transition-colors">
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
      <div className="sticky top-0 z-10 bg-[#0d0d1a] border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link to="/records" className="text-white/40 hover:text-white transition-colors">
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
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={exporting}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          {exporting ? 'Generating…' : 'Download PDF'}
        </button>
        <button
          type="button"
          onClick={openEmailModal}
          className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          Email Patient
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">

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

        <Glossary />

        {/* Notes — editable; saved notes also appear in the PDF report */}
        <NotesPanel
          session={session}
          authFetch={authFetch}
          onSaved={updated => setData(d => ({ ...d, session: { ...d.session, ...updated } }))}
        />

      </div>

      {/* Hidden printable report (captured for PDF export) */}
      <div style={{
        position: 'absolute',
        left: -10000,
        top: 0,
        pointerEvents: 'none',
        background: '#ffffff',
      }}>
        <div ref={printableRef}>
          <PrintableReport session={session} patient={patient} runs={runs} />
        </div>
      </div>

      {/* Email modal */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#15152a] border border-white/10 rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Email results to patient</h2>
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>

            <label className="flex flex-col gap-1 text-xs text-white/50">
              To
              <input
                type="email"
                value={emailForm.to}
                onChange={e => setEmailForm({ ...emailForm, to: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="patient@example.com"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-white/50">
              Subject
              <input
                type="text"
                value={emailForm.subject}
                onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-white/50">
              Message
              <textarea
                rows={9}
                value={emailForm.body}
                onChange={e => setEmailForm({ ...emailForm, body: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </label>

            <p className="text-xs text-white/30">
              The PDF report is generated and attached automatically.
            </p>

            {emailStatus && (
              <p className={`text-xs ${emailStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {emailStatus.msg}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEmailOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={emailSending}
                className="px-4 py-2 rounded-lg text-sm bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40"
              >
                {emailSending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}