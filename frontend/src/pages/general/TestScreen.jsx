import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import API_BASE_URL from '../../config/api'

const RINGS = [5, 10, 15, 20, 25, 30, 35]
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315]
// Each key is the internal spoke angleDeg (drawGrid uses angleDeg-90 as canvas rotation,
// so angleDeg=0 draws UPWARD, angleDeg=90 draws RIGHTWARD, etc).
// Values are labels matching the clinical reference image: 0 left, 90 top, 180 right, 270 bottom.
const ANGLE_LABELS = {
  0:   '90',   // spoke upward      → 90
  45:  '135',   // spoke upper-right → 45
  90:  '180',    // spoke rightward   → 0
  135: '225',  // spoke lower-right → 315
  180: '270',  // spoke downward    → 270
  225: '315',  // spoke lower-left  → 225
  270: '0',  // spoke leftward    → 180
  315: '45',  // spoke upper-left  → 135
}

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

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function drawGrid(canvas) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const maxRing = RINGS[RINGS.length - 1]
  const scale = Math.min(W, H) * 0.44 / maxRing

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  RINGS.forEach(r => {
    const px = r * scale
    ctx.beginPath()
    ctx.arc(cx, cy, px, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = r === maxRing ? 2 : 1
    ctx.stroke()
    if (r < maxRing) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = `${Math.max(10, scale * 1.1)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(r), cx, cy - px - 3)
    }
  })

  SPOKES.forEach(angleDeg => {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    const outerPx = maxRing * scale
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + outerPx * Math.cos(rad), cy + outerPx * Math.sin(rad))
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 0.6
    ctx.stroke()
  })

  const labelR = (maxRing + 4) * scale
  SPOKES.forEach(angleDeg => {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    const lx = cx + labelR * Math.cos(rad)
    const ly = cy + labelR * Math.sin(rad)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `${Math.max(11, scale * 1.3)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ANGLE_LABELS[angleDeg], lx, ly)
  })

  const crossAngles = Array.from({ length: 16 }, (_, i) => i * (Math.PI / 8))
  const innerR = scale * 0.5
  const outerR = scale * 1.6
  ctx.strokeStyle = 'rgba(255,255,255,1.0)'
  ctx.lineWidth = 1.2
  crossAngles.forEach(a => {
    ctx.beginPath()
    ctx.moveTo(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a))
    ctx.lineTo(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a))
    ctx.stroke()
  })

  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fillStyle = 'white'
  ctx.fill()

  return { cx, cy, scale }
}

function drawDot(canvas, meta, xDeg, yDeg, color = 'white', sizeDeg = 0.5) {
  const ctx = canvas.getContext('2d')
  const { cx, cy, scale } = meta
  const px = cx + xDeg * scale
  const py = cy - yDeg * scale
  const radius = Math.max(4, sizeDeg * scale * 2)
  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

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

export default function TestScreen() {
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('run_id')
  const { authFetch } = useAuth()

  const canvasRef = useRef(null)
  const gridMeta  = useRef({ cx: 0, cy: 0, scale: 1 })

  const [overlay,    setOverlay]    = useState(true)
  const [started,    setStarted]    = useState(false)
  const [paused,     setPaused]     = useState(false)
  const [completed,  setCompleted]  = useState(false)
  const [progress,   setProgress]   = useState({ current: 0, total: TOTAL_POINTS })
  const [isFixating, setIsFixating] = useState(true)
<<<<<<< Updated upstream
  const [calibMessage, setCalibMessage] = useState('')
  // Which of the 5 calibration targets is live, and whether it is currently
  // being sampled — null whenever calibration is not running
  const [calibStep, setCalibStep] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tangentScreenOpacity, setTangentScreenOpacity] = useState(100)
  const tangentScreenOpacityRef = useRef(100)

  // ── Fixation-loss auto-pause ──────────────────────────────────────────────
  // When the (calibrated) gaze leaves the center, the test halts on the
  // current point until the clinician presses Space/Enter or clicks; the
  // interrupted point is then repeated, not recorded.
  const [fixationPaused, setFixationPaused] = useState(false)
  const fixationPausedRef = useRef(false)

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

  // ── Calibration refs ──────────────────────────────────────────────────────
  const calibratingRef = useRef(false)
=======
>>>>>>> Stashed changes

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
    gridMeta.current = drawGrid(canvas)
  }

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  // ── Pulse + gaze animation — only while overlay is visible ────────────────
  useEffect(() => {
    if (!overlay) {
      if (pulseAnimRef.current) cancelAnimationFrame(pulseAnimRef.current)
      if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current)
      return
    }

    let startTime = null
    function animatePulse(timestamp) {
      if (!startTime) startTime = timestamp
      const elapsed = (timestamp - startTime) / 1000
      const pulse = (Math.sin(elapsed * Math.PI * 1.5) + 1) / 2

      if (canvasRef.current) {
        gridMeta.current = drawGrid(canvasRef.current)
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
  }, [overlay])

  // ── Stop MediaPipe ────────────────────────────────────────────────────────
  const stopMediaPipe = useCallback(async () => {
    if (!runId) return
    try {
      await authFetch(
        `${API_BASE_URL}/api/visual-tests/runs/${runId}/mediapipe/stop/`,
        { method: 'POST' }
      )
    } catch { }
  }, [runId, authFetch])

  useEffect(() => { stopMediaPipeRef.current = stopMediaPipe }, [stopMediaPipe])

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
      gridMeta.current = drawGrid(canvasRef.current)
    }
  }, [])

  // ── Static trial ──────────────────────────────────────────────────────────
  const runStaticTrial = useCallback((point) => {
    const canvas = canvasRef.current
    if (!canvas) return

    trialActiveRef.current = true
    trialStartRef.current  = null               // set after dot appears
    const { stimulus_size_deg: sizeDeg, stimulus_color: color } = DEFAULT_PROTOCOL_SETTINGS
    const delay = 200 + Math.random() * 400

    setTimeout(() => {
      if (!trialActiveRef.current) return
      drawDot(canvas, gridMeta.current, point.x_deg, point.y_deg, color, sizeDeg)
      trialStartRef.current = performance.now()

      responseWindowRef.current = setTimeout(async () => {
        if (!trialActiveRef.current) return
        trialActiveRef.current = false
        if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current)
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

    trialActiveRef.current = true
    trialStartRef.current  = performance.now()

    const { kinetic_speed_deg_per_sec: speedDegPerSec, stimulus_color: color, stimulus_size_deg: sizeDeg } = DEFAULT_PROTOCOL_SETTINGS
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

      drawGrid(canvas)
      drawDot(canvas, gridMeta.current, xDeg, yDeg, color, sizeDeg)

      if (currentRadius <= 0) {
        trialActiveRef.current = false
        if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current)
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
    if (canvasRef.current) gridMeta.current = drawGrid(canvasRef.current)

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

        setIsFixating(state.is_fixating)
        isFixatingRef.current = state.is_fixating

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
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    poll()
    const interval = setInterval(poll, 1000)
    return () => clearInterval(interval)
  }, [started, runId, authFetch, endTrial])

  // ── Gaze polling during overlay ───────────────────────────────────────────
  useEffect(() => {
    if (!overlay || !runId) return

    async function pollGaze() {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
        if (!res.ok) return
        const state = await res.json()
        isFixatingRef.current = state.is_fixating
        if (state.gaze_x != null && state.gaze_y != null) {
          gazePosRef.current = { x: state.gaze_x, y: state.gaze_y }
        }
<<<<<<< Updated upstream
        if (state.tracker) setTracker(state.tracker)
        if (state.eye) setRunEye(state.eye)
        setFaceDetected(state.raw_h != null)
=======
>>>>>>> Stashed changes
      } catch { }
    }

    pollGaze()
    const interval = setInterval(pollGaze, 300)
    return () => clearInterval(interval)
  }, [overlay, runId, authFetch])

  // ── Commands ──────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    if (!runId) return
    await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/command/`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    })
  }, [runId, authFetch])

  function handleStart() {
    if (!runId) return
<<<<<<< Updated upstream
    try {
      await authFetch(
        `${API_BASE_URL}/api/visual-tests/runs/${runId}/mediapipe/${next ? 'start' : 'stop'}/`,
        { method: 'POST' }
      )
    } catch { /* non-fatal — the status line will show the tracker state */ }
    if (!next) setTracker({ running: false, camera_ok: null })
  }

  // ── Gaze calibration ──────────────────────────────────────────────────────
  // Resolves when the patient presses Space/Enter or clicks (same response
  // button as the test). Capture phase so nothing else swallows the event.
  function waitForPress() {
    return new Promise(resolve => {
      function cleanup() {
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('mousedown', onMouse, true)
      }
      function onKey(e) {
        if (e.code !== 'Space' && e.code !== 'Enter') return
        e.preventDefault()
        cleanup()
        resolve()
      }
      function onMouse(e) {
        if (e.button !== 0) return
        if (e.target?.closest?.('[data-calibration-cancel]')) return
        cleanup()
        resolve()
      }
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('mousedown', onMouse, true)
    })
  }

  // Sample raw iris ratios from the state endpoint: 8 reads at 150ms
  // intervals, skip nulls (no face), need at least 4 to accept. The tracker
  // is shaky even on a still eye, so use the median — one blink or landmark
  // spike can't drag the calibration point the way a mean would.
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  async function sampleIrisRatios() {
    // Let the head/eyes settle after the button press before sampling
    await new Promise(r => setTimeout(r, 300))

    const hs = []
    const vs = []
    for (let i = 0; i < 8; i++) {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
        if (res.ok) {
          const state = await res.json()
          if (state.raw_h != null && state.raw_v != null) {
            hs.push(state.raw_h)
            vs.push(state.raw_v)
          }
        }
      } catch { /* failed read — counts as a skipped sample */ }
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
    let animId = null
    try {
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
            redrawGrid()
            drawCalibrationDot(canvasRef.current, sx, sy, pulse)
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
      const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/calibrate/`, {
        method: 'POST',
        body: JSON.stringify({ points }),
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
      return true
    } catch (err) {
      console.error('Calibration error:', err)
      return false
    } finally {
      if (animId) cancelAnimationFrame(animId)
      calibratingRef.current = false
      setCalibStep(null)
      setCalibMessage('')
      redrawGrid()
    }
  }

  async function handleStart() {
    if (!runId) return
    if (calibratingRef.current) return
=======
>>>>>>> Stashed changes
    // Reset local state for a fresh run
    currentPointIndexRef.current = 0
    pendingTrialsRef.current = []
    setProgress({ current: 1, total: TOTAL_POINTS })
    setOverlay(false)
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
  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden cursor-none"
      onDoubleClick={handleDoubleClick}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Progress counter */}
      {started && !overlay && progress.total > 0 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20
          px-4 py-1.5 rounded-full bg-white/5 border border-white/10
          text-white/30 text-xs font-mono pointer-events-none">
          {progress.current} / {progress.total}
        </div>
      )}

<<<<<<< Updated upstream
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

=======
>>>>>>> Stashed changes
      {/* Fixation warning */}
      {!isFixating && started && !overlay && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20
          px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30
          text-red-400 text-xs font-medium pointer-events-none">
          Look at the center
        </div>
      )}

      {/* Overlay */}
      {overlay && (
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <div className="flex items-center justify-between px-5 py-4 pointer-events-auto">
            <Link
              to="/test"
              onClick={() => { sendCommand('abort'); stopMediaPipeRef.current?.() }}
              className="w-8 h-8 flex items-center justify-center rounded-full
                bg-white/8 border border-white/12 text-white/50
                hover:text-white hover:bg-white/15 transition-all"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>

            {runId && (
              <span className="text-white/15 text-xs font-mono">{runId.slice(0, 8)}…</span>
            )}

            <button className="w-8 h-8 flex items-center justify-center rounded-full
              bg-white/8 border border-white/12 text-white/50
              hover:text-white hover:bg-white/15 transition-all">
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
<<<<<<< Updated upstream

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
                {eyeTracking && !tracker.running && (
                  <p className="text-amber-400/80 text-xs">
                    Eye tracker not running
                  </p>
                )}
                {eyeTracking && tracker.running && tracker.camera_ok === false && (
                  <p className="text-red-400 text-xs text-center max-w-md">
                    Camera feed is black — give camera access to the app running Django
                    (System Settings → Privacy &amp; Security → Camera), then restart it
                  </p>
                )}
                {eyeTracking && tracker.running && tracker.camera_ok !== false && (
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

=======
>>>>>>> Stashed changes
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
                  onClick={handleStart}
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
    </div>
  )
}