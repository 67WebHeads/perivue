import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import API_BASE_URL from '../../config/api'
import { BROWSER_TRACKING, startBrowserTracker } from '../../tracking/browserTracker'
import {
  MONITOR_CHANNEL,
  MONITOR_COMMANDS,
  MONITOR_TIMEOUT_MS,
  TONE_CLASS,
  openCameraMonitor,
  trackerMessage,
} from '../../tracking/cameraMonitor'
import {
  STIMULUS_COLORS, STIMULUS_COLOR_KEY, DEFAULT_STIMULUS_COLOR, TANGENT_OPACITY_KEY,
  stimulusCss, readPref, savePref, readViewingDistance, projectionFor,
} from '../../config/projection'
import { drawGrid, drawDot } from '../../canvas/tangentGrid'
import StimulusPreview from '../../components/StimulusPreview'

// ─── Hard-coded default protocol ──────────────────────────────────────────────
//
// Mirrors exactly what `python manage.py seed_protocol` creates:
//   - 16 kinetic points at 22.5° increments, each starting at radius 35°
//   - 24 static points: 8 angles × 3 radii (10°, 20°, 30°)
//
// The protocol_point_id values are the UUIDs that seed_protocol creates in the
// database. They are stable — seed_protocol uses get_or_create so they never
// change between runs.  If you ever re-seed on a fresh DB the UUIDs will
// differ; update the constants below to match.
//
// point_index 0-15  → kinetic
// point_index 16-39 → static

const DEFAULT_PROTOCOL_SETTINGS = {
  stimulus_color: 'white',
  stimulus_size_deg: 0.5,
  background_color: 'black',
  kinetic_speed_deg_per_sec: 2.0,
}

const KINETIC_ANGLES = [
  0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5,
  180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5,
]

// Static grid: 8 directions × 3 radii
// Angle convention: 0° = right (+x), 90° = up (+y)  (standard math coords)
const STATIC_ANGLES_DEG = [0, 45, 90, 135, 180, 225, 270, 315]
const STATIC_RADII = [10, 20, 30]

function buildDefaultPoints() {
  const points = []

  // 16 kinetic
  KINETIC_ANGLES.forEach((angleDeg, i) => {
    points.push({
      point_index: i,
      point_type: 'kinetic',
      angle_deg: angleDeg,
      start_radius_deg: 35,
      x_deg: null,
      y_deg: null,
      is_blindspot_check: false,
      protocol_point_id: null,  // filled in below from seed UUIDs
    })
  })

  // 24 static — ordered by angle then radius (matches seed_protocol)
  let idx = 16
  STATIC_ANGLES_DEG.forEach(angleDeg => {
    const rad = angleDeg * (Math.PI / 180)
    STATIC_RADII.forEach(r => {
      points.push({
        point_index: idx++,
        point_type: 'static',
        angle_deg: null,
        start_radius_deg: null,
        x_deg: parseFloat((r * Math.cos(rad)).toFixed(2)),
        y_deg: parseFloat((r * Math.sin(rad)).toFixed(2)),
        is_blindspot_check: false,
        protocol_point_id: null,
      })
    })
  })

  return points
}

const DEFAULT_POINTS = buildDefaultPoints()
const TOTAL_POINTS = DEFAULT_POINTS.length  // 40

// Five-point gaze calibration targets in normalized screen coordinates.
const CALIBRATION_TARGETS = [
  [0.10, 0.10],
  [0.90, 0.10],
  [0.50, 0.50],
  [0.10, 0.90],
  [0.90, 0.90],
]

// How far the gaze may stray from the centre cross before the test pauses, in
// degrees of visual angle (the grid's own units). The innermost static ring is
// 10°, so even "relaxed" catches a look at any dot. Saved per laptop.
const FIXATION_TOLERANCE_KEY = 'perivue_fixation_tolerance_deg'
const FIXATION_TOLERANCES = [
  { value: 3, label: 'Strict — 3°' },
  { value: 5, label: 'Standard — 5°' },
  { value: 7, label: 'Relaxed — 7°' },
]
const DEFAULT_FIXATION_TOLERANCE = 5

function readFixationTolerance() {
  const n = Number(readPref(FIXATION_TOLERANCE_KEY, DEFAULT_FIXATION_TOLERANCE))
  return FIXATION_TOLERANCES.some(t => t.value === n) ? n : DEFAULT_FIXATION_TOLERANCE
}

function readInitialOpacity() {
  const n = Number(readPref(TANGENT_OPACITY_KEY, 100))
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function drawCalibrationDot(canvas, meta, pulse) {
  const ctx = canvas.getContext('2d')
  const { cx, cy } = meta
  const outerR = 6 + pulse * 5
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255, 80, 80, ${0.3 + pulse * 0.5})`
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 80, 80, 0.9)'
  ctx.fill()
}

function drawGazeDot(canvas, gazeX, gazeY, isFixating) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const px = gazeX * W
  const py = gazeY * H

  ctx.beginPath()
  ctx.arc(px, py, 14, 0, Math.PI * 2)
  ctx.strokeStyle = isFixating
    ? 'rgba(50, 255, 120, 0.25)'
    : 'rgba(255, 80, 80, 0.25)'
  ctx.lineWidth = 8
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(px, py, 6, 0, Math.PI * 2)
  ctx.fillStyle = isFixating
    ? 'rgba(50, 255, 120, 0.85)'
    : 'rgba(255, 80, 80, 0.85)'
  ctx.fill()
}

// ─── Component ────────────────────────────────────────────────────────────────

function redrawGrid(canvasRef, gridMeta, opacity = 1) {
  const canvas = canvasRef.current
  if (!canvas) return
  gridMeta.current = drawGrid(canvas, opacity)
}

function drawCalibrationTarget(canvas, sx, sy, pulse) {
  const px = sx * canvas.width
  const py = sy * canvas.height
  const outerR = 6 + pulse * 5

  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.arc(px, py, outerR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255, 80, 80, ${0.3 + pulse * 0.5})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(px, py, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 80, 80, 0.9)'
  ctx.fill()
}

// ─── Pre-test instructions ────────────────────────────────────────────────────
// Projected to the patient, so the text is large and plain. Opens from the
// Begin test button; Start test then runs handleStart (calibration → trials).
function PreTestInstructions({ eye, eyeTracking, onBack, onStart }) {
  const coveredEye = eye === 'OD' ? 'left' : eye === 'OS' ? 'right' : null

  const steps = [
    'Sit comfortably and keep your head still for the whole test.',
    coveredEye && `Keep your ${coveredEye} eye covered until the test is finished.`,
    'Always look at the cross in the centre. Do not move your eyes to search for the dots.',
    'First you will check your button and do a short practice, so you know what the dots look like.',
    eyeTracking && 'First, a few dots will appear near the corners. Look at each one when asked. This lets the camera learn where you are looking.',
    'Press the button as soon as you see a dot, whether it flashes or slowly moves in from the edge.',
    'It is normal to miss some dots. Blink normally and stay relaxed.',
  ].filter(Boolean)

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-auto p-6"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pretest-title"
        className="w-full max-w-2xl rounded-2xl border border-white/12 bg-[#10101f] p-8 text-white shadow-2xl"
      >
        <h2 id="pretest-title" className="text-2xl font-semibold">Before we begin</h2>
        <p className="mt-1 text-sm text-white/40">Please read these instructions carefully.</p>

        <ol className="mt-6 flex flex-col gap-4">
          {steps.map((text, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                bg-purple-500/20 border border-purple-500/30 text-sm font-medium text-purple-200">
                {i + 1}
              </span>
              <span className="text-lg leading-snug text-white/85">{text}</span>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-sm text-white/35">
          Tell the examiner if you feel uncomfortable or need a break. The test can be paused at any time.
        </p>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-3 rounded-xl text-sm font-medium
              bg-white/5 border border-white/10 text-white/50
              hover:bg-white/10 hover:text-white transition-all"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onStart}
            autoFocus
            className="px-8 py-3 rounded-xl text-sm font-medium tracking-wide
              bg-purple-500/20 border border-purple-500/30 text-white
              hover:bg-purple-500/30 hover:border-purple-500/50
              active:scale-95 transition-all"
          >
            Start test
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Clicker check + practice run ─────────────────────────────────────────────
// Before calibration the patient checks their response button, then does a
// short run-through with the exam's own static stimulus (same colour, size and
// 2 s response window). Practice dots sit at 10° — inside almost any field, so
// a miss means the patient or the button, not a defect — and two "catch"
// rounds show no dot at all, so presses without a stimulus are caught. Nothing
// here is saved to the run; it is for the clinician to judge readiness.
// The button check before it is open-ended so a clicker can be swapped.
const PRACTICE_DOT_COUNT = 6
const PRACTICE_CATCH_COUNT = 2
const PRACTICE_RADIUS_DEG = 10
const PRACTICE_RESPONSE_WINDOW_MS = 2000 // same as runStaticTrial
const SLOW_RESPONSE_MS = 900
const COUNTDOWN_SECONDS = 3

function buildPracticeTrials() {
  const angles = [...STATIC_ANGLES_DEG].sort(() => Math.random() - 0.5).slice(0, PRACTICE_DOT_COUNT)
  const trials = angles.map((a) => {
    const rad = (a * Math.PI) / 180
    return { xDeg: PRACTICE_RADIUS_DEG * Math.cos(rad), yDeg: PRACTICE_RADIUS_DEG * Math.sin(rad) }
  })
  for (let i = 0; i < PRACTICE_CATCH_COUNT; i++) trials.push(null) // catch round
  return trials.sort(() => Math.random() - 0.5)
}

function summarizePractice(results) {
  const dots = results.filter((r) => r.target)
  const rts = dots.filter((r) => r.kind === 'hit').map((r) => r.rt)
  const falsePresses = results.reduce((n, r) => n + r.early + (r.kind === 'false_press' ? 1 : 0), 0)
  const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null

  const hints = []
  if (!rts.length) {
    hints.push('No dots were answered — check the button is connected and the patient knows to press it.')
  } else {
    if (rts.length < dots.length) {
      hints.push('Some dots were missed — check the patient is looking at the centre cross and can see the screen clearly.')
    }
    if (avg > SLOW_RESPONSE_MS) {
      hints.push('Responses are slow — remind the patient to press as soon as a dot appears.')
    }
  }
  if (falsePresses >= 2) {
    hints.push('Several presses came without a dot — remind the patient to press only when they see one.')
  }

  return {
    seen: rts.length,
    total: dots.length,
    avg,
    fastest: rts.length ? Math.min(...rts) : null,
    slowest: rts.length ? Math.max(...rts) : null,
    falsePresses,
    hints,
    ready: rts.length === dots.length && avg <= SLOW_RESPONSE_MS && falsePresses < 2,
  }
}

// Full-screen prompts for the steps between the instructions and the first
// test point. Projected to the patient, so the text is large and plain.
// Buttons marked data-ui-control are for the clinician; waitForPress ignores
// clicks on them so they never count as the patient's button press.
function StagePrompt({ stage, onChoice }) {
  const card = (title, children, footer) => (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm cursor-auto p-6"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div role="dialog" aria-modal="true"
        className="w-full max-w-xl rounded-2xl border border-white/12 bg-[#10101f] p-8 text-white text-center shadow-2xl">
        {title}
        {children}
        {footer && <div className="mt-8">{footer}</div>}
      </div>
    </div>
  )
  const pressHint = (text) => (
    <p className="text-sm text-purple-200/80 animate-pulse">{text}</p>
  )
  // 'skip' and 'next' are picked up by waitForPress (they must not count as a
  // patient press); the rest go through onChoice
  const clinicianBtn = (label, value, primary, disabled = false) => (
    <button
      type="button"
      data-ui-control
      data-stage-skip={value === 'skip' ? '' : undefined}
      data-stage-next={value === 'next' && !disabled ? '' : undefined}
      disabled={disabled}
      onClick={() => value !== 'skip' && value !== 'next' && onChoice(value)}
      className={`px-6 py-3 rounded-xl text-sm font-medium transition-all active:scale-95
        disabled:opacity-35 disabled:cursor-not-allowed ${
        primary
          ? 'bg-purple-500/20 border border-purple-500/30 text-white hover:bg-purple-500/30'
          : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  )

  switch (stage.kind) {
    case 'device': {
      const pressed = stage.presses > 0
      return card(
        <h2 className="text-2xl font-semibold">Check your button</h2>,
        pressed ? (
          <div className="mt-5">
            {/* key: re-mounts on every press so each one visibly flashes */}
            <p key={stage.presses} className="text-3xl font-semibold text-emerald-300 animate-[pulse_0.6s_ease-out_1]">
              ✓ Your button works
            </p>
            <p className="mt-3 text-base text-white/60">
              {stage.input === 'mouse' ? 'Mouse click' : 'Key press'} received
              {' · '}{stage.presses} {stage.presses === 1 ? 'press' : 'presses'}
            </p>
            <p className="mt-4 text-sm text-white/40">Press again to keep testing.</p>
          </div>
        ) : (
          <p className="mt-4 text-lg text-white/80">Press your button now.</p>
        ),
        <div className="flex flex-col items-center gap-4">
          {!pressed && pressHint('Waiting for a press…')}
          <p className="text-xs text-white/35 max-w-sm">
            Examiner: if presses don&apos;t show up, swap the clicker and try again.
            Press N or click Next when it works.
          </p>
          <div className="flex justify-center gap-3">
            {clinicianBtn('Skip practice', 'skip')}
            {clinicianBtn('Next (N)', 'next', true, !pressed)}
          </div>
        </div>,
      )
    }
    case 'practiceIntro':
      return card(
        <h2 className="text-2xl font-semibold">Practice run</h2>,
        <p className="mt-4 text-lg leading-snug text-white/80">
          Keep looking at the centre cross. A few dots will flash — press your
          button as soon as you see one. Sometimes no dot will appear.
        </p>,
        <div className="flex flex-col items-center gap-5">
          {pressHint('Press your button to start the practice')}
          {clinicianBtn('Skip practice', 'skip')}
        </div>,
      )
    case 'practiceResult': {
      const s = stage.summary
      const stat = (label, value) => (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-3">
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="text-[11px] text-white/40 mt-0.5">{label}</div>
        </div>
      )
      return card(
        <h2 className={`text-2xl font-semibold ${s.ready ? 'text-emerald-300' : 'text-amber-300'}`}>
          {s.ready ? '✓ Practice complete' : 'Practice complete'}
        </h2>,
        <>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stat('Dots seen', `${s.seen} / ${s.total}`)}
            {stat('Average response', s.avg != null ? `${s.avg} ms` : '—')}
            {stat('Fastest / slowest', s.fastest != null ? `${s.fastest}–${s.slowest}` : '—')}
            {stat('Presses without a dot', s.falsePresses)}
          </div>
          {s.hints.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-1.5 text-sm text-amber-200/80 text-left">
              {s.hints.map((h) => <li key={h}>• {h}</li>)}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-emerald-200/70">The button and response times look good.</p>
          )}
        </>,
        <div className="flex justify-center gap-3">
          {clinicianBtn('Practice again', 'again')}
          {clinicianBtn('Continue', 'continue', true)}
        </div>,
      )
    }
    case 'calibrated':
      return card(
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full
            bg-emerald-500/15 border border-emerald-400/30 text-3xl text-emerald-300">✓</div>
          <h2 className="text-2xl font-semibold text-emerald-300">Calibration successful</h2>
        </>,
        <p className="mt-3 text-lg text-white/75">The camera has learned where you are looking.</p>,
        pressHint('Look at the centre cross, then press your button to continue'),
      )
    case 'countdown':
      return card(
        <h2 className="text-2xl font-semibold">The examination is about to begin</h2>,
        <>
          <div className="mt-6 text-7xl font-semibold tabular-nums text-purple-200">{stage.seconds}</div>
          <p className="mt-6 text-lg text-white/75">
            Keep looking at the centre cross and press your button whenever you see a dot.
          </p>
        </>,
      )
    default:
      return null
  }
}

export default function TestScreen() {
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('run_id')
  const { authFetch } = useAuth()
  const navigate = useNavigate()

  const canvasRef = useRef(null)
  const gridMeta  = useRef({ cx: 0, cy: 0, scale: 1 })

  const [overlay,    setOverlay]    = useState(true)
  const [started,    setStarted]    = useState(false)
  const [paused,     setPaused]     = useState(false)
  const [completed,  setCompleted]  = useState(false)
  const [progress,   setProgress]   = useState({ current: 0, total: TOTAL_POINTS })
  const [isFixating, setIsFixating] = useState(true)

  const [calibMessage, setCalibMessage] = useState('')
  // Which of the 5 calibration targets is live, and whether it is currently
  // being sampled — null whenever calibration is not running
  const [calibStep, setCalibStep] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Pre-test instructions for the patient — shown on the projection when the
  // clinician presses Begin test, before calibration and the first stimulus
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  // Remembered per browser, so the clinician sets them once for this projector
  const [tangentScreenOpacity, setTangentScreenOpacity] = useState(readInitialOpacity)
  const tangentScreenOpacityRef = useRef(tangentScreenOpacity)
  const [stimulusColor, setStimulusColor] = useState(
    () => readPref(STIMULUS_COLOR_KEY, DEFAULT_STIMULUS_COLOR)
  )
  const stimulusColorRef = useRef(stimulusColor)
  // Read once per canvas load; set on the Settings page's projector guide
  const [viewingDistance] = useState(readViewingDistance)

  // ── Fixation-loss auto-pause ──────────────────────────────────────────────
  // When the (calibrated) gaze leaves the center, the test halts on the
  // current point until the clinician presses Space/Enter or clicks; the
  // interrupted point is then repeated, not recorded.
  const [fixationPaused, setFixationPaused] = useState(false)
  const fixationPausedRef = useRef(false)
  // True only while trials are running (not before start, not while the
  // clinician has paused) — the in-page tracker's instant verdict checks it
  const trialsRunningRef = useRef(false)
  const pauseForFixationRef = useRef(null)
  const [fixationTolerance, setFixationTolerance] = useState(readFixationTolerance)
  const fixationToleranceRef = useRef(fixationTolerance)

  // ── Eye tracking toggle + tracker health ──────────────────────────────────
  // Persisted so the clinician doesn't have to re-disable it every session
  // (e.g. when macOS camera permission isn't sorted out on this machine)
  const [eyeTracking, setEyeTracking] = useState(
    () => localStorage.getItem('perivue_eye_tracking') !== 'off'
  )
  const eyeTrackingRef = useRef(eyeTracking)
  const [tracker, setTracker] = useState({ running: false, camera_ok: null })
  const [faceDetected, setFaceDetected] = useState(false)
  // Which eye this run tests — the tracker follows only that eye, so the other
  // one must be occluded before the baseline is taken
  const [runEye, setRunEye] = useState(null)

  // ── In-browser tracker (VITE_EYE_TRACKER=browser) ─────────────────────────
  // Replaces the Python runner on the hosted site: this page opens the webcam
  // and posts fixation data itself. See tracking/browserTracker.js.
  const browserTrackerRef = useRef(null)
  const [browserStatus, setBrowserStatus] = useState(null)
  // The camera preview is shown in a separate monitor window (/test/camera)
  // so it never appears on the projector — see tracking/cameraMonitor.js
  const [monitorOpen, setMonitorOpen] = useState(false)

  // ── Calibration refs ──────────────────────────────────────────────────────
  const calibratingRef = useRef(false)

  // ── Pre-exam stages (clicker check, practice, calibrated, countdown) ──────
  const [stage, setStage] = useState(null)
  const stageChoiceRef = useRef(null)
  // Set when the canvas unmounts (e.g. Cancel) so the practice loop stops.
  // Reset on every mount: React's StrictMode (dev) mounts, unmounts and
  // re-mounts each component, and a flag left set by that dry run made the
  // button check quit at the first press.
  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])
  // The button check runs until the clinician moves on: N key, the Next
  // button, or Next in the camera monitor (which calls pressNextRef)
  const buttonCheckRef = useRef({ running: false, presses: 0, input: null })
  const pressNextRef = useRef(null)
  const monitorChannelRef = useRef(null)
  // Mirrors the button check into the camera monitor window
  const postButtonCheck = () =>
    monitorChannelRef.current?.postMessage({ type: 'buttonCheck', ...buttonCheckRef.current })


  // ── Trial refs ────────────────────────────────────────────────────────────
  const trialActiveRef      = useRef(false)
  const trialStartRef       = useRef(null)
  const currentPointIndexRef = useRef(0)        // drives the sequence client-side
  const kineticAnimRef      = useRef(null)
  const kineticPosRef       = useRef(null)
  const responseWindowRef   = useRef(null)
  const submittingRef       = useRef(false)
  const pulseAnimRef        = useRef(null)

  // Accumulated results — submitted in one batch at the end
  const pendingTrialsRef = useRef([])

  // ── Gaze refs ─────────────────────────────────────────────────────────────
  const gazePosRef    = useRef({ x: 0.5, y: 0.5 })
  const isFixatingRef = useRef(true)

  // ── Stable callback refs so polling loop never restarts ───────────────────
  const runStaticTrialRef  = useRef(null)
  const runKineticTrialRef = useRef(null)
  const stopMediaPipeRef   = useRef(null)

  // ── Canvas resize ─────────────────────────────────────────────────────────
  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    gridMeta.current = drawGrid(canvas, tangentScreenOpacityRef.current / 100)
  }

  // Redraw on every slider step so the change is visible while dragging
  function handleTangentOpacityChange(e) {
    const nextOpacity = Number(e.target.value)
    setTangentScreenOpacity(nextOpacity)
    tangentScreenOpacityRef.current = nextOpacity
    savePref(TANGENT_OPACITY_KEY, nextOpacity)
    redrawGrid(canvasRef, gridMeta, nextOpacity / 100)
  }

  // Applies from the next stimulus; each trial records the colour it used
  function handleStimulusColorChange(e) {
    const next = e.target.value
    setStimulusColor(next)
    stimulusColorRef.current = next
    savePref(STIMULUS_COLOR_KEY, next)
  }

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  // ── Pulse + gaze animation — only while overlay is visible ────────────────
  useEffect(() => {
    // Also runs during a fixation pause, so the clinician can watch the gaze
    // dot to see when the patient is back on the centre cross
    if (!overlay && !fixationPaused) {
      if (pulseAnimRef.current) cancelAnimationFrame(pulseAnimRef.current)
      if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)
      return
    }

    let startTime = null
    function animatePulse(timestamp) {
      if (!startTime) startTime = timestamp
      const elapsed = (timestamp - startTime) / 1000
      const pulse = (Math.sin(elapsed * Math.PI * 1.5) + 1) / 2

      if (canvasRef.current) {
        gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)
        drawCalibrationDot(canvasRef.current, gridMeta.current, pulse)
        drawGazeDot(
          canvasRef.current,
          gazePosRef.current.x,
          gazePosRef.current.y,
          isFixatingRef.current
        )
      }
      pulseAnimRef.current = requestAnimationFrame(animatePulse)
    }

    pulseAnimRef.current = requestAnimationFrame(animatePulse)
    return () => {
      if (pulseAnimRef.current) cancelAnimationFrame(pulseAnimRef.current)
    }
  }, [overlay, fixationPaused])

  // ── Stop MediaPipe ────────────────────────────────────────────────────────
  const stopMediaPipe = useCallback(async () => {
    // Browser mode: the tracker effect below stops with the page / run
    if (!runId || BROWSER_TRACKING) return
    try {
      await authFetch(
        `${API_BASE_URL}/api/visual-tests/runs/${runId}/mediapipe/stop/`,
        { method: 'POST' }
      )
    } catch { }
  }, [runId, authFetch])

  useEffect(() => { stopMediaPipeRef.current = stopMediaPipe }, [stopMediaPipe])

  // ── Browser tracker lifecycle ─────────────────────────────────────────────
  // Runs while eye tracking is on and the run's eye is known (it decides which
  // eye to follow). Stops on completion, toggle-off, or leaving the page.
  useEffect(() => {
    if (!BROWSER_TRACKING || !eyeTracking || !runId || !runEye || completed) return

    // Off-page canvas the tracker draws its preview into; frames are copied
    // from it to the camera monitor window while one is open
    const preview = document.createElement('canvas')
    preview.width = 640
    preview.height = 360
    const channel = new BroadcastChannel(MONITOR_CHANNEL)
    monitorChannelRef.current = channel
    let monitorSeenAt = 0
    let latestStatus = null
    const monitorAlive = () => Date.now() - monitorSeenAt < MONITOR_TIMEOUT_MS
    const sendStatus = () =>
      channel.postMessage({ type: 'status', runId, eye: runEye, status: latestStatus })

    const tracker = startBrowserTracker({
      runId,
      eye: runEye,
      apiBase: API_BASE_URL,
      onStatus: (status) => {
        latestStatus = status
        setBrowserStatus(status)
        sendStatus()
      },
      // Decided in this page from the calibrated gaze, so a glance pauses the
      // test straight away instead of after a trip through the backend
      onFixationChange: (fixating) => {
        isFixatingRef.current = fixating
        setIsFixating(fixating)
        if (!fixating) pauseForFixationRef.current?.()
      },
      // Skip drawing the preview entirely when nobody is watching
      getPreviewCanvas: () => (monitorAlive() ? preview : null),
    })
    browserTrackerRef.current = tracker

    channel.onmessage = ({ data }) => {
      if (data?.type === 'hello') {
        monitorSeenAt = Date.now()
        sendStatus()
        postButtonCheck()
      } else if (data?.type === 'command' && data.name === 'buttonCheckNext') {
        pressNextRef.current?.()
      } else if (data?.type === 'command' && MONITOR_COMMANDS.includes(data.name)) {
        tracker[data.name](data.arg)
      }
    }

    // ~10 preview frames a second as JPEG — plenty for positioning the patient
    let encoding = false
    const frameTimer = setInterval(() => {
      setMonitorOpen(monitorAlive())
      if (!monitorAlive() || encoding || latestStatus?.phase !== 'running') return
      encoding = true
      preview.toBlob((blob) => {
        encoding = false
        if (blob) channel.postMessage({ type: 'frame', blob })
      }, 'image/jpeg', 0.75)
    }, 100)

    return () => {
      clearInterval(frameTimer)
      tracker.stop()
      channel.postMessage({ type: 'ended' })
      channel.close()
      monitorChannelRef.current = null
      browserTrackerRef.current = null
      setBrowserStatus(null)
      setMonitorOpen(false)
    }
  }, [eyeTracking, runId, runEye, completed])

  // ── Batch submit — called once after all 40 points are done ──────────────
  const submitBatch = useCallback(async () => {
    if (!runId) return
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/submit-batch/`, {
        method: 'POST',
        body: JSON.stringify({ trials: pendingTrialsRef.current }),
      })
    } catch (err) {
      console.error('Failed to submit batch:', err)
    } finally {
      submittingRef.current = false
    }
  }, [runId, authFetch])

  // ── Advance to next point or finish ───────────────────────────────────────
  const advanceOrFinish = useCallback(async () => {
    const nextIndex = currentPointIndexRef.current + 1
    if (nextIndex >= TOTAL_POINTS) {
      // All points done — submit everything and mark complete
      await submitBatch()
      stopMediaPipeRef.current?.()
      setCompleted(true)
      setStarted(false)
      return
    }
    currentPointIndexRef.current = nextIndex
    setProgress({ current: nextIndex + 1, total: TOTAL_POINTS })

    const nextPoint = DEFAULT_POINTS[nextIndex]
    if (nextPoint.point_type === 'static') {
      runStaticTrialRef.current?.(nextPoint)
    } else {
      runKineticTrialRef.current?.(nextPoint)
    }
  }, [submitBatch])

  // ── Record a trial result locally ─────────────────────────────────────────
  function recordTrial(point, result, responseTimeMs, boundaryX = null, boundaryY = null) {
    pendingTrialsRef.current.push({
      protocol_point_id: point.protocol_point_id,
      point_index: point.point_index,
      point_type: point.point_type,
      x_deg: point.x_deg !== null ? String(point.x_deg) : null,
      y_deg: point.y_deg !== null ? String(point.y_deg) : null,
      angle_deg: point.angle_deg !== null ? String(point.angle_deg) : null,
      start_radius_deg: point.start_radius_deg !== null ? String(point.start_radius_deg) : null,
      is_blindspot_check: point.is_blindspot_check,
      stimulus_color: stimulusColorRef.current,
      result,
      response_time_ms: responseTimeMs,
      boundary_x_deg: boundaryX,
      boundary_y_deg: boundaryY,
      presented_at: new Date().toISOString(),
    })
  }

  // ── End active trial (cancel animation / timeout) ─────────────────────────
  const endTrial = useCallback(() => {
    trialActiveRef.current = false
    kineticPosRef.current  = null

    if (kineticAnimRef.current) {
      cancelAnimationFrame(kineticAnimRef.current)
      kineticAnimRef.current = null
    }
    if (responseWindowRef.current) {
      clearTimeout(responseWindowRef.current)
      responseWindowRef.current = null
    }
    if (canvasRef.current) {
      gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)
    }
  }, [])

  // ── Fixation pause trigger ────────────────────────────────────────────────
  // Halts the run on the current point (it is repeated on resume). Shared by
  // the in-page tracker's instant verdict, the state poll (Python tracker),
  // and the checks below. Returns true if it paused.
  useEffect(() => {
    trialsRunningRef.current = started && !paused && !overlay && !completed
  }, [started, paused, overlay, completed])

  useEffect(() => {
    pauseForFixationRef.current = () => {
      if (!eyeTrackingRef.current || calibratingRef.current) return false
      if (fixationPausedRef.current || !trialsRunningRef.current) return false
      fixationPausedRef.current = true
      setFixationPaused(true)
      endTrial()
      return true
    }
  }, [endTrial])

  // Before presenting a point: if the patient is still looking away (e.g. the
  // clinician resumed too early), pause again instead of showing the dot
  function haltIfLookingAway() {
    const tracker = browserTrackerRef.current
    if (!tracker || tracker.isFixating()) return false
    return pauseForFixationRef.current?.() ?? false
  }

  // Fixation tolerance as the tracker's ellipse half-axes, in fractions of the
  // canvas (the space the calibration dots are placed in)
  function fixationLimit(toleranceDeg = fixationToleranceRef.current) {
    const canvas = canvasRef.current
    const scale = gridMeta.current?.scale
    if (!canvas?.width || !canvas?.height || !scale) return null
    return { x: (toleranceDeg * scale) / canvas.width, y: (toleranceDeg * scale) / canvas.height }
  }

  function handleFixationToleranceChange(e) {
    const next = Number(e.target.value)
    setFixationTolerance(next)
    fixationToleranceRef.current = next
    savePref(FIXATION_TOLERANCE_KEY, next)
    const limit = fixationLimit(next)
    if (limit) browserTrackerRef.current?.setFixationLimit(limit)
  }

  // ── Static trial ──────────────────────────────────────────────────────────
  const runStaticTrial = useCallback((point) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (fixationPausedRef.current) return  // resume will re-run this point
    if (haltIfLookingAway()) return

    trialActiveRef.current = true
    trialStartRef.current  = null               // set after dot appears
    const { stimulus_size_deg: sizeDeg } = DEFAULT_PROTOCOL_SETTINGS
    const color = stimulusCss(stimulusColorRef.current)
    const delay = 200 + Math.random() * 400

    setTimeout(() => {
      if (!trialActiveRef.current) return
      drawDot(canvas, gridMeta.current, point.x_deg, point.y_deg, color, sizeDeg)
      trialStartRef.current = performance.now()

      responseWindowRef.current = setTimeout(async () => {
        if (!trialActiveRef.current) return
        trialActiveRef.current = false
        if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)
        recordTrial(point, 'not_seen', null)
        await advanceOrFinish()
      }, 2000)
    }, delay)
  }, [advanceOrFinish])

  useEffect(() => { runStaticTrialRef.current = runStaticTrial }, [runStaticTrial])

  // ── Kinetic trial ─────────────────────────────────────────────────────────
  const runKineticTrial = useCallback((point) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (fixationPausedRef.current) return  // resume will re-run this point
    if (haltIfLookingAway()) return

    trialActiveRef.current = true
    trialStartRef.current  = performance.now()

    const { kinetic_speed_deg_per_sec: speedDegPerSec, stimulus_size_deg: sizeDeg } = DEFAULT_PROTOCOL_SETTINGS
    const color = stimulusCss(stimulusColorRef.current)
    const angleDeg    = point.angle_deg
    const startRadius = point.start_radius_deg
    const angleRad    = angleDeg * (Math.PI / 180)

    let currentRadius = startRadius
    let lastTime      = null

    async function animate(timestamp) {
      if (!trialActiveRef.current) return
      if (!lastTime) lastTime = timestamp
      const dt = (timestamp - lastTime) / 1000
      lastTime = timestamp
      currentRadius -= speedDegPerSec * dt

      const xDeg = currentRadius * Math.cos(angleRad)
      const yDeg = currentRadius * Math.sin(angleRad)
      kineticPosRef.current = { xDeg, yDeg }

      drawGrid(canvas, tangentScreenOpacityRef.current / 100)
      drawDot(canvas, gridMeta.current, xDeg, yDeg, color, sizeDeg)

      if (currentRadius <= 0) {
        trialActiveRef.current = false
        if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)
        recordTrial(point, 'not_seen', null, null, null)
        kineticPosRef.current = null
        await advanceOrFinish()
        return
      }
      kineticAnimRef.current = requestAnimationFrame(animate)
    }

    setTimeout(() => {
      if (!trialActiveRef.current) return
      kineticAnimRef.current = requestAnimationFrame(animate)
    }, 300)
  }, [advanceOrFinish])

  useEffect(() => { runKineticTrialRef.current = runKineticTrial }, [runKineticTrial])

  // ── Patient response (Space / Enter / mouse click) ────────────────────────
  const handleResponse = useCallback(async (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return
    if (!trialActiveRef.current) return

    e.preventDefault()

    // A press while (or just after) looking at the dot doesn't measure the
    // peripheral field — pause and repeat this point instead of scoring it
    const tracker = browserTrackerRef.current
    if (
      tracker &&
      trialStartRef.current &&
      tracker.lookedAwaySince(trialStartRef.current) &&
      pauseForFixationRef.current?.()
    ) {
      return
    }

    const responseTime = trialStartRef.current
      ? Math.round(performance.now() - trialStartRef.current)
      : null
    const point = DEFAULT_POINTS[currentPointIndexRef.current]
    const pos   = kineticPosRef.current

    trialActiveRef.current = false
    if (kineticAnimRef.current) {
      cancelAnimationFrame(kineticAnimRef.current)
      kineticAnimRef.current = null
    }
    if (responseWindowRef.current) {
      clearTimeout(responseWindowRef.current)
      responseWindowRef.current = null
    }
    if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)

    if (point?.point_type === 'kinetic' && pos) {
      recordTrial(
        point,
        'seen',
        responseTime,
        Math.round(pos.xDeg * 100) / 100,
        Math.round(pos.yDeg * 100) / 100,
      )
    } else {
      recordTrial(point, 'seen', responseTime)
    }

    kineticPosRef.current = null
    await advanceOrFinish()
  }, [advanceOrFinish])

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (e.button === 0 && !overlay) {
        handleResponse({ code: 'Space', preventDefault: () => {} })
      }
    }
    window.addEventListener('keydown', handleResponse)
    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleResponse)
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [handleResponse, overlay])

  // ── Polling loop — only checks status + fixation; point sequencing is local ─
  useEffect(() => {
    if (!started || !runId) return

    async function poll() {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
        if (!res.ok) return
        const state = await res.json()

        // The in-page tracker reports its verdict directly (onFixationChange)
        if (!browserTrackerRef.current) {
          setIsFixating(state.is_fixating)
          isFixatingRef.current = state.is_fixating
        }

        if (state.gaze_x != null && state.gaze_y != null) {
          gazePosRef.current = { x: state.gaze_x, y: state.gaze_y }
        }

        // Handle server-driven pause / abort
        if (state.status === 'completed' || state.status === 'aborted') {
          setCompleted(true)
          setStarted(false)
          endTrial()
          stopMediaPipeRef.current?.()
          return
        }

        if (state.status === 'paused') {
          setPaused(true)
          setOverlay(true)
          endTrial()
        } else {
          setPaused(false)

          // Fixation lost mid-test → halt on the current point until the
          // clinician re-centers the patient and presses to continue. The
          // in-page tracker does this itself, instantly (onFixationChange)
          if (!BROWSER_TRACKING && !state.is_fixating) {
            pauseForFixationRef.current?.()
          }
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    poll()
    // The Python tracker's verdict only arrives through here — poll it fast.
    // The in-page tracker pauses by itself, so this is just status there.
    const interval = setInterval(poll, BROWSER_TRACKING ? 1000 : 250)
    return () => clearInterval(interval)
  }, [started, runId, authFetch, endTrial])

  // ── Gaze polling during overlay / fixation pause ──────────────────────────
  useEffect(() => {
    if ((!overlay && !fixationPaused) || !runId) return

    async function pollGaze() {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
        if (!res.ok) return
        const state = await res.json()
        isFixatingRef.current = state.is_fixating
        if (state.gaze_x != null && state.gaze_y != null) {
          gazePosRef.current = { x: state.gaze_x, y: state.gaze_y }
        }

        if (state.tracker) setTracker(state.tracker)
        if (state.eye) setRunEye(state.eye)
        setFaceDetected(state.raw_h != null)

      } catch { }
    }

    pollGaze()
    const interval = setInterval(pollGaze, 300)
    return () => clearInterval(interval)
  }, [overlay, fixationPaused, runId, authFetch])

  // ── Fixation pause: clinician continues with Space/Enter/click ────────────
  useEffect(() => {
    if (!fixationPaused) return

    function resume() {
      fixationPausedRef.current = false
      setFixationPaused(false)
      // Small delay so a stray second press can't register as a false
      // "seen" on the repeated trial
      setTimeout(() => {
        if (fixationPausedRef.current) return
        const point = DEFAULT_POINTS[currentPointIndexRef.current]
        if (!point) return
        if (point.point_type === 'static') {
          runStaticTrialRef.current?.(point)
        } else {
          runKineticTrialRef.current?.(point)
        }
      }, 400)
    }

    function onKey(e) {
      if (e.code !== 'Space' && e.code !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      resume()
    }
    function onMouse(e) {
      if (e.button !== 0) return
      e.stopPropagation()
      resume()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
    }
  }, [fixationPaused])

  // ── Commands ──────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    if (!runId) return
    await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/command/`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    })
  }, [runId, authFetch])

  async function handleCancelTest() {
    setCalibMessage('Cancelling test…')
    try {
      await sendCommand('abort')
    } catch { /* still stop tracking and leave the canvas */ }
    try {
      await stopMediaPipeRef.current?.()
    } catch { /* non-fatal */ }
    // Discard the run entirely. The session and run rows are created before
    // the canvas even opens, so without this a cancelled test still lands in
    // the patient's history as an entry with no results in it.
    if (runId) {
      try {
        await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/`, {
          method: 'DELETE',
        })
      } catch { /* non-fatal — the session list hides unfinished ones anyway */ }
    }
    navigate('/test-menu', { replace: true })
  }

  function handleBackToPreviousPage() {
    // Abort/stop tracking in the background, then return to the page that
    // opened the canvas instead of navigating to a hard-coded route.
    sendCommand('abort').catch(() => {})
    Promise.resolve(stopMediaPipeRef.current?.()).catch(() => {})
    navigate(-1)
  }

  // ── Eye tracking toggle — starts/stops the MediaPipe process ─────────────
  async function setMediaPipeRunning(next) {
    if (!runId) return
    // Browser mode: the tracker effect follows eyeTracking — no server process
    if (!BROWSER_TRACKING) {
      try {
        await authFetch(
          `${API_BASE_URL}/api/visual-tests/runs/${runId}/mediapipe/${next ? 'start' : 'stop'}/`,
          { method: 'POST' }
        )
      } catch {
        // Non-fatal — tracker status will show the current state.
      }
    }
    if (!next) setTracker({ running: false, camera_ok: null })
  }

  async function handleToggleEyeTracking() {
    const next = !eyeTrackingRef.current
    eyeTrackingRef.current = next
    setEyeTracking(next)
    localStorage.setItem('perivue_eye_tracking', next ? 'on' : 'off')
    await setMediaPipeRunning(next)
  }

  // ── Gaze calibration ──────────────────────────────────────────────────────
  // Resolves when the patient presses Space/Enter or clicks (same response
  // button as the test), with { input: 'key' | 'mouse' }, or { skip: true }
  // when the clinician clicks a Skip button. With allowNext, the clinician's
  // N key, a Next button, or pressNextRef (camera monitor) resolve
  // { next: true }. Capture phase so nothing else swallows the event; clicks
  // on other clinician controls are ignored.
  function waitForPress({ allowNext = false } = {}) {
    return new Promise(resolve => {
      function cleanup() {
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('mousedown', onMouse, true)
        if (allowNext) pressNextRef.current = null
      }
      if (allowNext) {
        pressNextRef.current = () => { cleanup(); resolve({ next: true }) }
      }
      // stopPropagation: the code after this press can start a trial straight
      // away, and the same event must not then reach handleResponse and score
      // that trial as "seen"
      function onKey(e) {
        if (allowNext && e.code === 'KeyN') {
          e.preventDefault()
          cleanup()
          resolve({ next: true })
          return
        }
        if (e.code !== 'Space' && e.code !== 'Enter') return
        e.preventDefault()
        e.stopPropagation()
        cleanup()
        resolve({ input: 'key' })
      }
      function onMouse(e) {
        if (e.button !== 0) return
        if (e.target?.closest?.('[data-calibration-cancel]')) return
        if (e.target?.closest?.('[data-stage-skip]')) {
          cleanup()
          resolve({ skip: true })
          return
        }
        if (allowNext && e.target?.closest?.('[data-stage-next]')) {
          cleanup()
          resolve({ next: true })
          return
        }
        if (e.target?.closest?.('[data-ui-control]')) return
        e.stopPropagation()
        cleanup()
        resolve({ input: 'mouse' })
      }
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('mousedown', onMouse, true)
    })
  }

  // Sample raw iris ratios: 8 reads at 150ms intervals, skip nulls (no face),
  // need at least 4 to accept. The tracker is shaky even on a still eye, so
  // use the median — one blink or landmark spike can't drag the calibration
  // point the way a mean would.
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  // The in-page tracker has the reading right here; the Python runner's only
  // reaches this page through the state endpoint
  async function readIrisRatios() {
    if (browserTrackerRef.current) return browserTrackerRef.current.latestReading()
    try {
      const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
      if (res.ok) {
        const state = await res.json()
        if (state.raw_h != null && state.raw_v != null) {
          return { h: state.raw_h, v: state.raw_v }
        }
      }
    } catch { /* failed read — counts as a skipped sample */ }
    return null
  }

  async function sampleIrisRatios() {
    // Let the head/eyes settle after the button press before sampling
    await new Promise(r => setTimeout(r, 300))

    const hs = []
    const vs = []
    for (let i = 0; i < 8; i++) {
      const reading = await readIrisRatios()
      if (reading) {
        hs.push(reading.h)
        vs.push(reading.v)
      }
      await new Promise(r => setTimeout(r, 150))
    }
    if (hs.length < 4) return null
    return { h: median(hs), v: median(vs) }
  }

  // Show the 5 dots in order, sample the patient's iris ratios at each, and
  // save the calibration. Returns true if calibrated, false if the test
  // should start uncalibrated.
  async function runCalibration() {
    calibratingRef.current = true
    browserTrackerRef.current?.setCalibrating(true)
    let animId = null
    try {
      // The Python tracker learns this from the server: clearing the old
      // calibration marks the run as calibrating, which holds its centre
      // still while the patient stares at the corner dots
      if (!browserTrackerRef.current) {
        await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/calibrate/`, {
          method: 'DELETE',
        }).catch(() => {})
      }

      const points = []

      for (let i = 0; i < CALIBRATION_TARGETS.length; i++) {
        const [sx, sy] = CALIBRATION_TARGETS[i]

        // Pulse-animate this target dot until sampling is done
        let startTime = null
        function animateDot(timestamp) {
          if (!startTime) startTime = timestamp
          const elapsed = (timestamp - startTime) / 1000
          const pulse = (Math.sin(elapsed * Math.PI * 1.5) + 1) / 2
          if (canvasRef.current) {
            redrawGrid(canvasRef, gridMeta, tangentScreenOpacityRef.current / 100)
            drawCalibrationTarget(canvasRef.current, sx, sy, pulse)
          }
          animId = requestAnimationFrame(animateDot)
        }
        animId = requestAnimationFrame(animateDot)

        let sample = null
        for (let attempt = 0; attempt < 2 && !sample; attempt++) {
          setCalibStep({ index: i, sampling: false })
          setCalibMessage(attempt === 0
            ? 'Stare at the dot, then press Space'
            : 'Face not detected — stare at the dot and press again')
          await waitForPress()
          setCalibStep({ index: i, sampling: true })
          setCalibMessage('Hold still…')
          sample = await sampleIrisRatios()
        }

        cancelAnimationFrame(animId)
        animId = null

        if (!sample) {
          setCalibStep(null)
          setCalibMessage('Face not detected — starting test without calibration')
          await new Promise(r => setTimeout(r, 2500))
          return false
        }
        points.push({ sx, sy, h: sample.h, v: sample.v })
      }

      setCalibStep(null)
      const limit = fixationLimit()
      const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/calibrate/`, {
        method: 'POST',
        // window: the fixation tolerance for the Python tracker's verdict,
        // which the server decides
        body: JSON.stringify(limit ? { points, window: limit } : { points }),
      })
      if (!res.ok) {
        console.error('Failed to save calibration:', res.status)
        setCalibMessage('Could not save calibration — starting test without it')
        await new Promise(r => setTimeout(r, 2500))
        return false
      }
      // Saving is not the same as being usable: if the patient tracked the
      // dots with their head instead of their eyes, the readings barely differ
      // between dots and the mapping gets discarded on every frame. Say so
      // here rather than letting the run look calibrated when it isn't.
      const result = await res.json().catch(() => null)
      if (result && result.usable === false) {
        console.warn('Calibration too flat to use:', result)
        setCalibMessage(
          'Eye movement between the dots was too small to calibrate — ' +
          'ask the patient to keep their head still and move only their eyes, ' +
          'then calibrate again. Starting without calibration.'
        )
        await new Promise(r => setTimeout(r, 4000))
        return false
      }
      // The in-page tracker decides fixation itself from here on
      if (browserTrackerRef.current && limit) {
        browserTrackerRef.current.setCalibration(points, limit)
      }
      return true
    } catch (err) {
      console.error('Calibration error:', err)
      return false
    } finally {
      if (animId) cancelAnimationFrame(animId)
      browserTrackerRef.current?.setCalibrating(false)
      calibratingRef.current = false
      setCalibStep(null)
      setCalibMessage('')
      redrawGrid(canvasRef, gridMeta, tangentScreenOpacityRef.current / 100)
    }
  }

  // Clinician picks a button on a stage prompt (Practice again / Continue)
  function waitForChoice() {
    return new Promise((resolve) => { stageChoiceRef.current = resolve })
  }

  // One practice round: same stimulus and timing as runStaticTrial, but the
  // answer is only returned, never recorded. target null = catch round.
  function runPracticeTrial(target) {
    return new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas || unmountedRef.current) return resolve(null)
      const { stimulus_size_deg: sizeDeg } = DEFAULT_PROTOCOL_SETTINGS
      const color = stimulusCss(stimulusColorRef.current)
      let shownAt = null
      let early = 0
      let done = false
      let showTimer = null
      let windowTimer = null

      function finish(result) {
        if (done) return
        done = true
        clearTimeout(showTimer)
        clearTimeout(windowTimer)
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('mousedown', onMouse, true)
        if (canvasRef.current) {
          gridMeta.current = drawGrid(canvasRef.current, tangentScreenOpacityRef.current / 100)
        }
        resolve({ target, early, ...result })
      }
      function onPress(e) {
        e.stopPropagation()
        // Before the stimulus appears, a press is a guess — count it, keep going
        if (shownAt === null) { early += 1; return }
        const rt = Math.round(performance.now() - shownAt)
        finish(target ? { kind: 'hit', rt } : { kind: 'false_press' })
      }
      function onKey(e) {
        if (e.code !== 'Space' && e.code !== 'Enter') return
        e.preventDefault()
        onPress(e)
      }
      function onMouse(e) {
        if (e.button !== 0) return
        if (e.target?.closest?.('[data-calibration-cancel], [data-ui-control]')) return
        onPress(e)
      }
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('mousedown', onMouse, true)

      showTimer = setTimeout(() => {
        if (target && canvasRef.current) {
          drawDot(canvasRef.current, gridMeta.current, target.xDeg, target.yDeg, color, sizeDeg)
        }
        shownAt = performance.now()
        windowTimer = setTimeout(
          () => finish({ kind: target ? 'miss' : 'catch_ok' }),
          PRACTICE_RESPONSE_WINDOW_MS,
        )
      }, 600 + Math.random() * 900)
    })
  }

  // Button check: open-ended, so the clinician can swap a clicker that isn't
  // registering and watch the new one work. Every press shows up straight
  // away; it ends when the clinician presses N or clicks Next (on the test
  // screen or in the camera monitor). Returns 'next', 'skip' or 'cancel'.
  async function runButtonCheck() {
    const info = { running: true, presses: 0, input: null }
    const update = () => {
      buttonCheckRef.current = { ...info }
      setStage({ kind: 'device', presses: info.presses, input: info.input })
      postButtonCheck()
    }
    try {
      for (;;) {
        update()
        const press = await waitForPress({ allowNext: true })
        if (unmountedRef.current) return 'cancel'
        if (press.skip) return 'skip'
        if (press.next) {
          if (info.presses > 0) return 'next'
          continue // nothing has worked yet — stay on the check
        }
        info.presses += 1
        info.input = press.input
      }
    } finally {
      buttonCheckRef.current = { running: false, presses: 0, input: null }
      postButtonCheck()
    }
  }

  // Button check, then an 8-round practice the clinician can repeat.
  // Returns early if the clinician skips.
  async function runClickerCheck() {
    const check = await runButtonCheck()
    if (check !== 'next') { setStage(null); return }

    for (;;) {
      if (unmountedRef.current) return
      setStage({ kind: 'practiceIntro' })
      const start = await waitForPress()
      if (start?.skip || unmountedRef.current) { setStage(null); return }
      setStage(null)

      const trials = buildPracticeTrials()
      const results = []
      for (let i = 0; i < trials.length; i++) {
        setCalibMessage(`Practice — ${i + 1} of ${trials.length}. Press when you see a dot`)
        const result = await runPracticeTrial(trials[i])
        if (!result) return
        results.push(result)
      }
      setCalibMessage('')

      setStage({ kind: 'practiceResult', summary: summarizePractice(results) })
      const choice = await waitForChoice()
      if (choice !== 'again') { setStage(null); return }
    }
  }

  async function runCountdown() {
    for (let s = COUNTDOWN_SECONDS; s > 0; s--) {
      if (unmountedRef.current) return
      setStage({ kind: 'countdown', seconds: s })
      await new Promise((r) => setTimeout(r, 1000))
    }
    setStage(null)
  }

  async function handleStart() {
    if (!runId) return
    if (calibratingRef.current) return

    // Reset local state for a fresh run. This has to come before calibration:
    // every calibration prompt is gated on !overlay, so calibrating with the
    // overlay still up runs the whole 5-dot sequence invisibly behind it.
    currentPointIndexRef.current = 0
    pendingTrialsRef.current = []
    setProgress({ current: 1, total: TOTAL_POINTS })
    setOverlay(false)

    // Everything up to the first test point counts as "calibrating": it keeps a
    // double-click from pausing and the fixation monitor from halting a run
    // that hasn't started yet
    calibratingRef.current = true
    try {
      // Button check + practice run — pause/resume never comes back through
      // here, so this happens once per run
      await runClickerCheck()
      if (unmountedRef.current) return

      // Calibrate — skipped entirely when the clinician disabled eye tracking
      if (eyeTrackingRef.current) {
        await setMediaPipeRunning(true)
        if (BROWSER_TRACKING) {
          // The in-page tracker may still be loading its model or learning the
          // centre baseline — calibrating before then samples nothing
          setCalibMessage('Starting eye tracking…')
          await browserTrackerRef.current?.whenReady(10000)
          setCalibMessage('')
        } else {
          // Give the tracker a moment to start and populate its state before calibration.
          await new Promise(r => setTimeout(r, 700))
        }
        const calibrated = await runCalibration()
        calibratingRef.current = true // runCalibration clears it when done
        if (unmountedRef.current) return

        // Calibration ends on a keypress, and the first stimulus used to
        // follow it immediately — the patient was still resettling from the
        // last corner dot. The success pop-up waits for a deliberate press
        // once they're looking at the centre cross again. (A failed
        // calibration has already shown its own message.)
        if (calibrated) {
          setStage({ kind: 'calibrated' })
          await waitForPress()
          setStage(null)
        }
      }

      await runCountdown()
      if (unmountedRef.current) return
    } finally {
      setStage(null)
      setCalibMessage('')
      calibratingRef.current = false
    }

    setStarted(true)

    // Kick off the first point immediately
    const firstPoint = DEFAULT_POINTS[0]
    if (firstPoint.point_type === 'static') {
      runStaticTrialRef.current?.(firstPoint)
    } else {
      runKineticTrialRef.current?.(firstPoint)
    }
  }

  async function handleResume() {
    await sendCommand('resume')
    setOverlay(false)
    setPaused(false)

    // Resume from the current local point index
    const point = DEFAULT_POINTS[currentPointIndexRef.current]
    if (point) {
      if (point.point_type === 'static') {
        runStaticTrialRef.current?.(point)
      } else {
        runKineticTrialRef.current?.(point)
      }
    }
  }

  async function handleDoubleClick() {
    if (calibratingRef.current) return    // no pausing mid-calibration
    if (fixationPausedRef.current) return // resume handles the clicks here
    await sendCommand('pause')
    setOverlay(true)
    setPaused(true)
    endTrial()
  }

  // ── Completed screen ──────────────────────────────────────────────────────
  if (completed) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-6 font-sans">
        <div className="text-center">
          <p className="text-white text-xl font-medium">Test complete</p>
          <p className="text-white/40 text-sm mt-1">All points have been tested</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.href = `/test/results?run_id=${runId}`}
            className="px-6 py-2.5 rounded-xl text-sm font-medium
              bg-purple-500/20 border border-purple-500/30 text-white
              hover:bg-purple-500/30 transition-all"
          >
            View results →
          </button>
          <button
            onClick={() => window.close()}
            className="px-6 py-2.5 rounded-xl text-sm font-medium
              bg-white/8 border border-white/12 text-white/50
              hover:bg-white/15 hover:text-white transition-all"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  // The cursor is hidden over the projection so it can't be mistaken for a
  // stimulus, but it has to come back for the settings panel to be usable
  const cursorClass = started && !overlay && !settingsOpen
    ? 'cursor-none'
    : 'cursor-auto'

  return (
    <div
      className={`relative w-screen h-screen bg-black overflow-hidden ${cursorClass}`}
      onDoubleClick={handleDoubleClick}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Cancel, during calibration and the pre-test wait. Without this there
          is no way off the canvas short of finishing all 40 points, and the
          run it abandons is discarded rather than left in the patient's
          history — see handleCancelTest. */}
      {stage && !overlay && (
        <StagePrompt
          stage={stage}
          onChoice={(value) => {
            const resolve = stageChoiceRef.current
            stageChoiceRef.current = null
            resolve?.(value)
          }}
        />
      )}

      {(calibMessage || stage) && !overlay && !started && (
        <button
          type="button"
          data-calibration-cancel
          onClick={handleCancelTest}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute left-5 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-full
            border border-white/12 bg-white/8 text-white/50 cursor-auto
            hover:bg-red-500/20 hover:border-red-400/30 hover:text-red-200 transition-all"
          aria-label="Cancel test"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Progress counter */}
      {started && !overlay && progress.total > 0 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20
          px-4 py-1.5 rounded-full bg-white/5 border border-white/10
          text-white/30 text-xs font-mono pointer-events-none">
          {progress.current} / {progress.total}
        </div>
      )}


      {/* Calibration progress. A bare "3 / 5" tells the clinician how much is
          left but not what is about to happen, so the counter sits next to a
          small map of the screen with the five target positions on it — the
          next dot's corner is visible before it appears, which is what you
          need to be able to direct the patient. */}
      {calibStep && !overlay && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20
          flex items-center gap-3.5 px-4 py-2.5 rounded-xl
          bg-white/5 border border-white/10 pointer-events-none">
          <div className="relative h-9 w-14 rounded-md border border-white/15 bg-black/30">
            {CALIBRATION_TARGETS.map(([sx, sy], i) => {
              const done = i < calibStep.index
              const current = i === calibStep.index
              return (
                <span
                  key={`${sx}-${sy}`}
                  className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2
                    rounded-full transition-all duration-300
                    ${current
                      ? calibStep.sampling
                        ? 'bg-amber-300 ring-2 ring-amber-300/40 scale-150'
                        : 'bg-red-400 ring-2 ring-red-400/40 scale-150 animate-pulse'
                      : done
                        ? 'bg-emerald-400/80'
                        : 'bg-white/20'}`}
                  style={{ left: `${sx * 100}%`, top: `${sy * 100}%` }}
                />
              )
            })}
          </div>

          <div>
            <div className="text-white/80 text-sm font-medium tabular-nums">
              Point {calibStep.index + 1} of {CALIBRATION_TARGETS.length}
            </div>
            <div className={`text-[11px] ${calibStep.sampling ? 'text-amber-300/80' : 'text-white/35'}`}>
              {calibStep.sampling ? 'Sampling — hold still' : 'Waiting for Space'}
            </div>
          </div>

          <div className="flex gap-1">
            {CALIBRATION_TARGETS.map(([sx, sy], i) => (
              <span
                key={`bar-${sx}-${sy}`}
                className={`h-1 w-4 rounded-full transition-colors duration-300
                  ${i < calibStep.index
                    ? 'bg-emerald-400/70'
                    : i === calibStep.index
                      ? 'bg-white/70'
                      : 'bg-white/15'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Calibration caption */}
      {calibMessage && !overlay && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20
          px-5 py-2.5 rounded-xl bg-white/5 border border-white/10
          text-white/70 text-sm font-medium pointer-events-none">
          {calibMessage}
        </div>
      )}


      {/* Fixation warning */}
      {!isFixating && started && !overlay && !fixationPaused && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20
          px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30
          text-red-400 text-xs font-medium pointer-events-none">
          Look at the center
        </div>
      )}

      {/* Fixation pause — the test halts on the current point until the
          clinician has the patient back on the cross and presses to continue.
          The point is then re-run, so nothing is scored while they looked away. */}
      {fixationPaused && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center
          gap-3 bg-black/70 backdrop-blur-sm pointer-events-none">
          <p className="text-red-400 text-lg font-medium">Test paused — eyes moved off the centre</p>
          <p className="text-white/70 text-base">
            Please look only at the centre cross. Don&apos;t look at the dots.
          </p>
          <p className="text-white/30 text-xs mt-1">
            Press Space or click to continue — this point will be repeated
          </p>
        </div>
      )}

      {/* Overlay */}
      {overlay && (
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <div className="flex items-center justify-between px-5 py-4 pointer-events-auto">
            <button
              type="button"
              onClick={handleBackToPreviousPage}
              aria-label="Go back"
              className="w-8 h-8 flex items-center justify-center rounded-full
                bg-white/8 border border-white/12 text-white/50
                hover:text-white hover:bg-white/15 transition-all"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {runId && (
              <span className="text-white/15 text-xs font-mono">{runId.slice(0, 8)}…</span>
            )}

            {/* settings button */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full
              bg-white/8 border border-white/12 text-white/50
              hover:text-white hover:bg-white/15 transition-all"
              aria-label="Open test settings"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-end pb-10 gap-3 pointer-events-auto">
            {paused && (
              <p className="text-white/40 text-xs">
                Test paused — {currentPointIndexRef.current} / {TOTAL_POINTS} done
              </p>
            )}
            {!paused && (
              <p className="text-white/25 text-xs">
                Ask the patient to look at the red dot
              </p>
            )}
            {!runId && (
              <p className="text-red-400 text-xs mb-2">
                No run ID — go back and start a session
              </p>
            )}


            {/* Eye tracking toggle + camera status — settings before Begin test */}
            {!paused && (
              <div className="flex flex-col items-center gap-1.5 mb-1">
                <button
                  onClick={handleToggleEyeTracking}
                  className="flex items-center gap-2.5 px-4 py-2 rounded-xl
                    bg-white/5 border border-white/10
                    hover:bg-white/10 transition-all"
                >
                  <span className="text-white/50 text-xs font-medium">Eye tracking</span>
                  <span className={`relative w-9 h-5 rounded-full transition-colors
                    ${eyeTracking ? 'bg-emerald-500/60' : 'bg-white/15'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white
                      transition-all ${eyeTracking ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>

                {!eyeTracking && (
                  <p className="text-white/30 text-xs">
                    Off — the test will run without fixation monitoring or calibration
                  </p>
                )}
                {/* Browser mode: one status line here; the camera picture and
                    its controls are in the monitor window, off the projector */}
                {eyeTracking && BROWSER_TRACKING && (() => {
                  const msg = trackerMessage(browserStatus)
                  return (
                    <div className="flex flex-col items-center gap-1.5">
                      <p className={`text-xs text-center max-w-md ${TONE_CLASS[msg.tone]}`}>{msg.text}</p>
                      <button
                        type="button"
                        onClick={openCameraMonitor}
                        className="px-3 py-1 rounded-lg bg-white/5 border border-white/10
                          text-white/50 text-[11px] hover:bg-white/10 hover:text-white transition-all"
                      >
                        {monitorOpen ? 'Camera monitor open — show it' : 'Open camera monitor'}
                      </button>
                    </div>
                  )
                })()}
                {eyeTracking && !BROWSER_TRACKING && !tracker.running && (
                  <p className="text-amber-400/80 text-xs">
                    Eye tracker not running
                  </p>
                )}
                {eyeTracking && !BROWSER_TRACKING && tracker.running && tracker.camera_ok === false && (
                  <p className="text-red-400 text-xs text-center max-w-md">
                    Camera feed is black — give camera access to the app running Django
                    (System Settings → Privacy &amp; Security → Camera), then restart it
                  </p>
                )}
                {eyeTracking && !BROWSER_TRACKING && tracker.running && tracker.camera_ok !== false && (
                  <p className={`text-xs ${faceDetected ? 'text-emerald-400/90' : 'text-amber-400/80'}`}>
                    {faceDetected ? 'Camera OK — face detected' : 'Camera OK — no face detected'}
                  </p>
                )}
                {/* The tracker learns the patient's centre gaze in its first
                    second of video and follows only the tested eye, so the
                    occluder has to be in place before any of that happens */}
                {eyeTracking && (runEye === 'OD' || runEye === 'OS') && (
                  <p className="text-white/40 text-xs text-center max-w-md">
                    Testing the {runEye === 'OD' ? 'right' : 'left'} eye
                    {' — '}cover the patient&apos;s{' '}
                    <span className="text-white/70">
                      {runEye === 'OD' ? 'left' : 'right'} eye
                    </span>{' '}
                    before starting, and keep it covered for the whole run
                  </p>
                )}
              </div>
            )}


            <div className="flex gap-3">
              {paused ? (
                <button
                  onClick={handleResume}
                  className="px-8 py-3 rounded-xl text-sm font-medium tracking-wide
                    bg-white/10 border border-white/20 text-white/80
                    hover:bg-white/15 hover:border-white/35 hover:text-white
                    active:scale-95 transition-all"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={() => setInstructionsOpen(true)}
                  disabled={!runId}
                  className="px-8 py-3 rounded-xl text-sm font-medium tracking-wide
                    bg-white/10 border border-white/20 text-white/80
                    hover:bg-white/15 hover:border-white/35 hover:text-white
                    active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Begin test
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {instructionsOpen && (
        <PreTestInstructions
          eye={runEye}
          eyeTracking={eyeTracking}
          onBack={() => setInstructionsOpen(false)}
          onStart={() => {
            setInstructionsOpen(false)
            handleStart()
          }}
        />
      )}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-auto p-4"
          onClick={() => setSettingsOpen(false)}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/12 bg-[#10101f] p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Test settings</h2>
                <p className="mt-1 text-xs text-white/35">
                  Adjust the projected test display.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full
                  border border-white/10 bg-white/5 text-white/45
                  hover:bg-white/10 hover:text-white transition-all"
                aria-label="Close test settings"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5">
              <StimulusPreview opacity={tangentScreenOpacity} color={stimulusColor} />
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <label htmlFor="tangent-screen-opacity" className="text-xs font-medium text-white/65">
                  Tangent screen opacity
                </label>
                <span className="min-w-12 rounded-lg bg-white/8 px-2 py-1 text-right text-xs font-mono text-white/55">
                  {tangentScreenOpacity}%
                </span>
              </div>
              <input
                id="tangent-screen-opacity"
                type="range"
                min="0"
                max="100"
                step="1"
                value={tangentScreenOpacity}
                onChange={handleTangentOpacityChange}
                className="w-full accent-purple-500"
              />
              <div className="mt-2 flex justify-between text-[10px] text-white/25">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="stimulus-color" className="text-xs font-medium text-white/65">
                  Stimulus colour
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full border border-white/20"
                    style={{ backgroundColor: stimulusCss(stimulusColor) }}
                    aria-hidden="true"
                  />
                  <select
                    id="stimulus-color"
                    value={stimulusColor}
                    onChange={handleStimulusColorChange}
                    className="rounded-lg border border-white/15 bg-[#15152a] px-2 py-1 text-xs text-white/80"
                  >
                    {STIMULUS_COLORS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/30">
                Applies from the next dot. The colour is saved with each result.
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="fixation-tolerance" className="text-xs font-medium text-white/65">
                  Fixation tolerance
                </label>
                <select
                  id="fixation-tolerance"
                  value={fixationTolerance}
                  onChange={handleFixationToleranceChange}
                  className="rounded-lg border border-white/15 bg-[#15152a] px-2 py-1 text-xs text-white/80"
                >
                  {FIXATION_TOLERANCES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-[11px] text-white/30">
                How far the patient&apos;s gaze may leave the centre cross before the test
                pauses. Use Relaxed if it pauses while they are holding still.
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-white/40">
              <p className="text-xs font-medium text-white/65">Projector size check</p>
              <p className="mt-1">
                With the patient at <span className="text-white/75">{viewingDistance} cm</span>,
                the outer 35° ring should measure{' '}
                <span className="text-white/75">
                  {projectionFor(viewingDistance).outerDiameter.toFixed(1)} cm
                </span>{' '}
                across on the screen, both horizontally and vertically.
                Change the distance in Settings → Projector setup.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
