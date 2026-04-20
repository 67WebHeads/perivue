import React, { useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PersonIcon from '@mui/icons-material/Person'
import VisibilityIcon from '@mui/icons-material/Visibility'
import AssessmentIcon from '@mui/icons-material/Assessment'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import { Link } from 'react-router-dom'
import bg from '../../assets/PeriVue_Background.webp'

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PATIENT = {
  name: 'Jeffrey Pascual',
  patientCode: 'PV-20260420-0012',
  age: 54,
  sex: 'Everyday',
  assignedDoctor: 'Dr. Reyes',
  testDate: 'April 20, 2026',
  protocol: 'Default Tangent Screen',
}

const MOCK_METRICS = {
  OD: {
    detectionAccuracy: 87.5,
    sensitivity: 83.3,
    avgReactionTime: 412,
    stimuliSeen: 21,
    stimuliTotal: 24,
    kineticBoundaryPoints: 14,
    kineticTotal: 16,
    reliability: 91,
    fixationLosses: 2,
  },
  OS: {
    detectionAccuracy: 75.0,
    sensitivity: 70.8,
    avgReactionTime: 538,
    stimuliSeen: 18,
    stimuliTotal: 24,
    kineticBoundaryPoints: 11,
    kineticTotal: 16,
    reliability: 78,
    fixationLosses: 5,
  },
}

const MOCK_INTERPRETATION = {
  OD: {
    summary: 'Within normal limits',
    detail:
      'Right eye visual field shows mostly intact peripheral vision with minor nasal depression. Detection accuracy is within the expected clinical range for this age group.',
    flag: 'normal',
  },
  OS: {
    summary: 'Mild peripheral field loss detected',
    detail:
      'Left eye shows reduced detection in the superior-temporal quadrant (45°–135°). Reaction times are elevated compared to the right eye. Recommend follow-up Humphrey perimetry for threshold confirmation.',
    flag: 'warning',
  },
}

// ─── Static polar grid points (mock seen/not-seen) ────────────────────────────

const STATIC_POINTS = [
  // angle, radius, seen
  { a: 0,   r: 10, seen: true  }, { a: 0,   r: 20, seen: true  }, { a: 0,   r: 30, seen: true  },
  { a: 45,  r: 10, seen: true  }, { a: 45,  r: 20, seen: true  }, { a: 45,  r: 30, seen: false },
  { a: 90,  r: 10, seen: true  }, { a: 90,  r: 20, seen: false }, { a: 90,  r: 30, seen: false },
  { a: 135, r: 10, seen: true  }, { a: 135, r: 20, seen: false }, { a: 135, r: 30, seen: false },
  { a: 180, r: 10, seen: true  }, { a: 180, r: 20, seen: true  }, { a: 180, r: 30, seen: true  },
  { a: 225, r: 10, seen: true  }, { a: 225, r: 20, seen: true  }, { a: 225, r: 30, seen: true  },
  { a: 270, r: 10, seen: true  }, { a: 270, r: 20, seen: true  }, { a: 270, r: 30, seen: true  },
  { a: 315, r: 10, seen: true  }, { a: 315, r: 20, seen: true  }, { a: 315, r: 30, seen: true  },
]

const KINETIC_BOUNDARIES_OD = [
  { a: 0 }, { a: 22.5 }, { a: 45 }, { a: 67.5 },
  { a: 90 }, { a: 112.5 }, { a: 135 }, { a: 157.5 },
  { a: 180 }, { a: 202.5 }, { a: 225 }, { a: 247.5 },
  { a: 270 }, { a: 292.5 }, { a: 315 }, { a: 337.5 },
].map((p, i) => ({ ...p, r: 24 + Math.sin(i * 0.8) * 4 }))

const KINETIC_BOUNDARIES_OS = [
  { a: 0 }, { a: 22.5 }, { a: 45 }, { a: 67.5 },
  { a: 90 }, { a: 112.5 }, { a: 135 }, { a: 157.5 },
  { a: 180 }, { a: 202.5 }, { a: 225 }, { a: 247.5 },
  { a: 270 }, { a: 292.5 }, { a: 315 }, { a: 337.5 },
].map((p, i) => ({ ...p, r: i >= 2 && i <= 6 ? 14 + Math.random() * 3 : 22 + Math.sin(i * 0.6) * 3 }))

// ─── Polar Field Map (SVG) ─────────────────────────────────────────────────────

function polarToXY(angleDeg, radiusDeg, cx, cy, scale) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + Math.cos(rad) * radiusDeg * scale,
    y: cy + Math.sin(rad) * radiusDeg * scale,
  }
}

function FieldMap({ eye, staticPoints, kineticBoundaries }) {
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const scale = (size / 2 - 16) / 35
  const rings = [5, 10, 15, 20, 25, 30, 35]
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315]

  // Build SVG path for kinetic isopter
  const boundaryPath = kineticBoundaries.map((p, i) => {
    const { x, y } = polarToXY(p.a, p.r, cx, cy, scale)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z'

  return (
    <svg width={size} height={size} className="block">
      {/* Rings */}
      {rings.map((r) => (
        <circle
          key={r}
          cx={cx} cy={cy}
          r={r * scale}
          fill="none"
          stroke="#ffffff18"
          strokeWidth={r === 10 || r === 20 || r === 30 ? 1.5 : 0.75}
        />
      ))}

      {/* Spokes */}
      {spokes.map((a) => {
        const inner = polarToXY(a, 0, cx, cy, scale)
        const outer = polarToXY(a, 35, cx, cy, scale)
        return (
          <line
            key={a}
            x1={inner.x} y1={inner.y}
            x2={outer.x} y2={outer.y}
            stroke="#ffffff12" strokeWidth={0.75}
          />
        )
      })}

      {/* Kinetic isopter fill */}
      <path d={boundaryPath} fill="#a855f720" stroke="#a855f7" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Static points */}
      {staticPoints.map((p, i) => {
        const { x, y } = polarToXY(p.a, p.r, cx, cy, scale)
        return p.seen ? (
          <circle key={i} cx={x} cy={y} r={4} fill="#22c55e" opacity={0.85} />
        ) : (
          <g key={i}>
            <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke="#ef4444" strokeWidth={1.5} />
            <line x1={x + 3.5} y1={y - 3.5} x2={x - 3.5} y2={y + 3.5} stroke="#ef4444" strokeWidth={1.5} />
          </g>
        )
      })}

      {/* Fixation cross */}
      <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} stroke="white" strokeWidth={1.5} />
      <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} stroke="white" strokeWidth={1.5} />

      {/* Eye label */}
      <text x={8} y={18} fill="#ffffff60" fontSize={11} fontWeight="600">{eye}</text>
    </svg>
  )
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, sub, color }) {
  const colors = {
    green:  'text-green-400',
    yellow: 'text-yellow-400',
    blue:   'text-blue-400',
    purple: 'text-purple-400',
  }
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${colors[color] ?? 'text-white'}`}>
        {value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
      </span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}

// ─── Eye Result Panel ─────────────────────────────────────────────────────────

function EyePanel({ eye, label, metrics, interpretation, staticPoints, kineticBoundaries }) {
  const flagStyles = {
    normal:  'bg-green-500/15 border-green-500/30 text-green-300',
    warning: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
    alert:   'bg-red-500/15 border-red-500/30 text-red-300',
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <VisibilityIcon className="text-purple-400" fontSize="small" />
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        <span className={`ml-auto text-xs px-2.5 py-0.5 rounded-full border font-medium ${flagStyles[interpretation.flag]}`}>
          {interpretation.summary}
        </span>
      </div>

      {/* Field Map */}
      <div className="flex justify-center bg-black/40 rounded-2xl border border-white/10 p-4">
        <div className="flex flex-col items-center gap-2">
          <FieldMap eye={eye} staticPoints={staticPoints} kineticBoundaries={kineticBoundaries} />
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Seen</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-500 inline-block" style={{clipPath:'polygon(0 0,100% 100%,0 100%,100% 0)'}} />Not seen</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-purple-400 inline-block" />Isopter</span>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Detection Accuracy"
          value={metrics.detectionAccuracy}
          unit="%"
          sub={`${metrics.stimuliSeen}/${metrics.stimuliTotal} stimuli seen`}
          color="green"
        />
        <MetricCard
          label="Sensitivity"
          value={metrics.sensitivity}
          unit="%"
          sub="Correct detections vs. presented"
          color="blue"
        />
        <MetricCard
          label="Avg Reaction Time"
          value={metrics.avgReactionTime}
          unit="ms"
          sub="Across all seen stimuli"
          color="yellow"
        />
        <MetricCard
          label="Test Reliability"
          value={metrics.reliability}
          unit="%"
          sub={`${metrics.fixationLosses} fixation loss${metrics.fixationLosses !== 1 ? 'es' : ''}`}
          color="purple"
        />
      </div>

      {/* Stimulus detection breakdown */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Stimulus Detection</span>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-gray-300">
            <span>Static ({metrics.stimuliSeen}/{metrics.stimuliTotal})</span>
            <span>{metrics.detectionAccuracy}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${metrics.detectionAccuracy}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-300 mt-1">
            <span>Kinetic boundary ({metrics.kineticBoundaryPoints}/{metrics.kineticTotal})</span>
            <span>{Math.round((metrics.kineticBoundaryPoints / metrics.kineticTotal) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500 transition-all"
              style={{ width: `${(metrics.kineticBoundaryPoints / metrics.kineticTotal) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

function TestResults() {
  const [activeEye, setActiveEye] = useState('OD')

  const eyeData = {
    OD: {
      label: 'OD — Right Eye',
      metrics: MOCK_METRICS.OD,
      interpretation: MOCK_INTERPRETATION.OD,
      staticPoints: STATIC_POINTS,
      kineticBoundaries: KINETIC_BOUNDARIES_OD,
    },
    OS: {
      label: 'OS — Left Eye',
      metrics: MOCK_METRICS.OS,
      interpretation: MOCK_INTERPRETATION.OS,
      staticPoints: STATIC_POINTS.map((p) => ({
        ...p,
        seen: p.a >= 45 && p.a <= 135 && p.r >= 20 ? false : p.seen,
      })),
      kineticBoundaries: KINETIC_BOUNDARIES_OS,
    },
  }

  const current = eyeData[activeEye]

  return (
    <div className="relative min-h-screen bg-[#0d0d1a] text-white overflow-x-hidden">
      {/* Background image isolated so it doesn't affect content opacity */}
      <div
        className="fixed inset-0 bg-center bg-cover bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url(${bg})`, opacity: 0.08 }}
      />

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#0d0d1a]/90 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link to="/test-menu" className="text-gray-400 hover:text-white transition-colors">
          <ArrowBackIcon fontSize="small" />
        </Link>
        <h1 className="text-base font-semibold">Visual Field Test Results</h1>
        <span className="ml-auto text-xs text-gray-500">{MOCK_PATIENT.testDate}</span>
      </div>

      <div className="w-full px-8 py-8 flex flex-col gap-8">
        {/* max-w-2xl */}

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <PersonIcon className="text-purple-400" fontSize="small" />
            <span className="text-sm font-semibold text-white">Patient Information</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {[
              ['Name', MOCK_PATIENT.name],
              ['Patient Code', MOCK_PATIENT.patientCode],
              ['Age', MOCK_PATIENT.age],
              ['Sex', MOCK_PATIENT.sex],
              ['Assigned Doctor', MOCK_PATIENT.assignedDoctor],
              ['Protocol', MOCK_PATIENT.protocol],
            ].map(([label, val]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-gray-200">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Eye Switcher */}
        <div className="flex gap-2 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
          {['OD', 'OS'].map((eye) => (
            <button
              key={eye}
              type="button"
              onClick={() => setActiveEye(eye)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all hover:cursor-pointer ${
                activeEye === eye
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {eye === 'OD' ? 'OD — Right' : 'OS — Left'}
            </button>
          ))}
        </div>

        {/* Eye Result */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <AssessmentIcon className="text-purple-400" fontSize="small" />
            <h2 className="text-sm font-semibold text-white">Test Metrics</h2>
          </div>
          <EyePanel key={activeEye} eye={activeEye} {...current} />
        </div>

        {/* Recommendations */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <LightbulbIcon className="text-yellow-400" fontSize="small" />
            <span className="text-sm font-semibold text-white">Recommendations & Interpretation</span>
          </div>
          <div className="flex flex-col gap-4">
            {Object.entries(MOCK_INTERPRETATION).map(([eye, data]) => {
              const flagStyles = {
                normal:  'border-l-green-500  bg-green-500/10',
                warning: 'border-l-yellow-500 bg-yellow-500/10',
                alert:   'border-l-red-500    bg-red-500/10',
              }
              return (
                <div key={eye} className={`border-l-2 rounded-r-xl px-4 py-3 flex flex-col gap-1 ${flagStyles[data.flag]}`}>
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    {eye === 'OD' ? 'OD — Right Eye' : 'OS — Left Eye'}
                  </span>
                  <span className="text-sm text-gray-200">{data.detail}</span>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

export default TestResults
