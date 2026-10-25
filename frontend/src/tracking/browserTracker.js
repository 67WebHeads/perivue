// ─── browserTracker.js ────────────────────────────────────────────────────────
// In-browser port of backend/mediapipe_runner.py, so the hosted site can track
// fixation with nothing installed on the clinic laptop. The page opens the
// webcam, runs MediaPipe's face landmarker on each frame, and POSTs the same
// payload the Python runner sends to /runs/<id>/fixation/ — the server-side
// calibration and debounce in visual_tests/views.py are unchanged.
//
// The algorithm, constants and their reasoning are carried over from the
// Python runner one-to-one; keep the two in sync when tuning either.
//
// Enabled with VITE_EYE_TRACKER=browser. Without it the Python runner (started
// by the backend, or by tracker_agent.py in hosted mode) is used as before.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

export const BROWSER_TRACKING = import.meta.env.VITE_EYE_TRACKER === 'browser'

// Keep in sync with the @mediapipe/tasks-vision version in package.json
const MP_VERSION = '0.10.35'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const FLIP_KEY = 'perivue_tracker_flip'
const CAMERA_KEY = 'perivue_tracker_camera'

// One eye's landmark indices. MediaPipe's own left/right naming refers to its
// canonical model, and the frame may additionally be mirrored (see flip), so
// neither is a reliable way to tell which eye is which. The two groups are
// kept side-agnostic here and matched to the patient's real left/right per
// frame from their position in the image — see splitEyes().
const EYE_A = { inner: 33, outer: 133, upper: 159, lower: 145, iris: 468 }
const EYE_B = { inner: 362, outer: 263, upper: 386, lower: 374, iris: 473 }

// Vertical iris movement is only a few % of eye width — scale it up so the
// usable range maps to roughly 0-1 like the horizontal ratio
const V_SCALE = 5.0
// Second downward cue: the upper lid follows the iris when looking down, so
// lid droop below the person's own baseline pushes the signal down
const OPENNESS_GAIN = 1.2
// The first ~1s of face frames defines this person's "center"
const BASELINE_FRAMES = 30
// The center creeps toward the current reading, but ONLY while that reading is
// inside the fixation window — see BASELINE_ADAPT in mediapipe_runner.py.
// Per frame, ~4s time constant at 30fps.
const BASELINE_ADAPT = 0.008

// Occlusion guard — an open eye is high-contrast, a palm is close to flat.
// Judged against this person's own baseline contrast. Freezes tracking only.
const OCCLUSION_TRIP_RATIO = 0.45
const OCCLUSION_CLEAR_RATIO = 0.60
const OCCLUSION_TRIP_FRAMES = 3
const OCCLUSION_MIN_BASELINE = 8.0

// Uncalibrated fixation window (baseline-adjusted ratio units)
const FIX_HALF_H = 0.15
const FIX_HALF_V = 0.20
// Half-width of the ratio range that spans the screen — deliberately not the
// fixation window, so small drift doesn't look like a wild glance
const GAZE_HALF_H = 0.25
const GAZE_HALF_V = GAZE_HALF_H * (FIX_HALF_V / FIX_HALF_H)
// Mirrors FIXATION_WINDOW in visual_tests/views.py — display only
const SERVER_FIXATION_WINDOW = 0.12

const BLACK_FRAME_MEAN = 5.0
const BAD_THRESHOLD_SECS = 0.5
// Heavy EMA so streamed ratios are stable enough to calibrate against
const EMA_ALPHA = 0.12
// Below this lid-gap/eye-width ratio the eye counts as closed (a real blink);
// looking down droops lids to ~0.10-0.15 and must keep tracking
const BLINK_OPENNESS = 0.10
const POST_INTERVAL = 0.2

// ── Geometry (ports of the runner's helpers) ─────────────────────────────────

function splitEyes(lm, flipped) {
  // A raw frame shows the patient facing the lens, so their right eye falls
  // on the image's left half; mirroring the frame swaps the two
  const aX = lm[EYE_A.inner].x + lm[EYE_A.outer].x
  const bX = lm[EYE_B.inner].x + lm[EYE_B.outer].x
  const [imageLeft, imageRight] = aX <= bX ? [EYE_A, EYE_B] : [EYE_B, EYE_A]
  return flipped ? [imageRight, imageLeft] : [imageLeft, imageRight]
}

function eyesUnderTest(lm, flipped, eye) {
  // MediaPipe invents a plausible mesh for an occluded eye, so only the
  // tested eye may feed ratios, blink, occlusion and baseline
  const [right, left] = splitEyes(lm, flipped)
  if (eye === 'OD') return [[right], [left]]
  if (eye === 'OS') return [[left], [right]]
  return [[right, left], []]
}

function irisAxisCoords(lm, spec, w, h) {
  // Iris position along the eye's own corner-to-corner axis, which removes
  // head tilt from the signal. Returns [along, perp, span] or null.
  const a = lm[spec.inner]
  const b = lm[spec.outer]
  const iris = lm[spec.iris]
  const [origin, far] = a.x <= b.x ? [a, b] : [b, a]
  const ax = (far.x - origin.x) * w
  const ay = (far.y - origin.y) * h
  const spanSq = ax * ax + ay * ay
  if (spanSq < 1) return null

  const px = (iris.x - origin.x) * w
  const py = (iris.y - origin.y) * h
  const span = Math.sqrt(spanSq)
  return [(px * ax + py * ay) / spanSq, (py * ax - px * ay) / span, span]
}

function getIrisRatio(lm, spec, w, h) {
  const coords = irisAxisCoords(lm, spec, w, h)
  return coords === null ? 0.5 : coords[0]
}

function eyeOpenness(lm, spec, w, h) {
  const inner = lm[spec.inner]
  const outer = lm[spec.outer]
  const upper = lm[spec.upper]
  const lower = lm[spec.lower]
  const span = Math.hypot((outer.x - inner.x) * w, (outer.y - inner.y) * h)
  if (span < 1) return 0.0
  return Math.hypot((lower.x - upper.x) * w, (lower.y - upper.y) * h) / span
}

function getIrisRatioVertical(lm, spec, w, h) {
  // ~0.5 = center, larger = looking further down. Iris offset from the
  // corner line plus lid openness; the baseline re-centers the offset
  const coords = irisAxisCoords(lm, spec, w, h)
  if (coords === null) return 0.5
  const [, perp, span] = coords
  const irisTerm = (V_SCALE * perp) / span
  const lidTerm = -OPENNESS_GAIN * eyeOpenness(lm, spec, w, h)
  return irisTerm + lidTerm
}

function isBlinking(lm, specs, w, h) {
  return specs.some((spec) => eyeOpenness(lm, spec, w, h) < BLINK_OPENNESS)
}

function getRatios(lm, specs, w, h) {
  const hs = specs.map((s) => getIrisRatio(lm, s, w, h))
  const vs = specs.map((s) => getIrisRatioVertical(lm, s, w, h))
  return [hs.reduce((a, b) => a + b, 0) / hs.length, vs.reduce((a, b) => a + b, 0) / vs.length]
}

function eyeBbox(lm, spec, w, h) {
  // ~60% of the eye width tall, which always contains the iris and sclera
  let x0 = Math.trunc(Math.min(lm[spec.inner].x, lm[spec.outer].x) * w)
  let x1 = Math.trunc(Math.max(lm[spec.inner].x, lm[spec.outer].x) * w)
  const cy = ((lm[spec.upper].y + lm[spec.lower].y) / 2) * h
  const half = Math.max(4.0, (x1 - x0) * 0.30)

  x0 = Math.max(0, x0)
  x1 = Math.min(w, x1)
  const y0 = Math.max(0, Math.trunc(cy - half))
  const y1 = Math.min(h, Math.trunc(cy + half))
  if (x1 - x0 < 4 || y1 - y0 < 4) return null
  return [x0, y0, x1, y1]
}

function eyeContrast(ctx, lm, spec, w, h) {
  // Std-dev of the grayscale eye ROI — high for a visible eye, low for skin
  const box = eyeBbox(lm, spec, w, h)
  if (box === null) return null
  const [x0, y0, x1, y1] = box
  const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
  const n = data.length / 4
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < data.length; i += 4) {
    // Same weights as OpenCV's BGR2GRAY
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += g
    sumSq += g * g
  }
  const mean = sum / n
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean))
}

function isFixatingLocal(avgH, avgV) {
  return Math.abs(avgH - 0.5) <= FIX_HALF_H && Math.abs(avgV - 0.5) <= FIX_HALF_V
}

function estimateGaze(avgH, avgV) {
  const sx = 0.5 + (avgH - 0.5) / (2 * GAZE_HALF_H)
  const sy = 0.5 + (avgV - 0.5) / (2 * GAZE_HALF_V)
  return [Math.max(0, Math.min(1, sx)), Math.max(0, Math.min(1, sy))]
}

function median(values) {
  // Same pick as the runner: sorted[len // 2]
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const round4 = (v) => Math.round(v * 1e4) / 1e4

function cameraErrorMessage(err) {
  if (!window.isSecureContext) {
    return 'The camera only works over https:// or on localhost'
  }
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Camera access was blocked — click the camera icon in the address bar and allow it'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found — plug in the webcam and try again'
    case 'NotReadableError':
      return 'The camera is being used by another app — close it and try again'
    default:
      return `Could not open the camera (${err?.name || err})`
  }
}

// ── Tracker ──────────────────────────────────────────────────────────────────

/**
 * Starts tracking for one run. Returns controls:
 *   stop(), toggleFlip(), relearn(), setCamera(deviceId), whenReady(timeoutMs)
 * onStatus(status) is called whenever the displayed state changes.
 * getPreviewCanvas() may return a <canvas> to draw the camera preview into.
 */
export function startBrowserTracker({ runId, eye, apiBase, onStatus, getPreviewCanvas }) {
  const fixationUrl = `${apiBase}/api/visual-tests/runs/${runId}/fixation/`
  let stopped = false
  let video = null
  let stream = null
  let landmarker = null
  let frameHandle = null

  // Work canvas holding the (optionally mirrored) frame, for pixel reads
  const work = document.createElement('canvas')
  const workCtx = work.getContext('2d', { willReadFrequently: true })
  const tiny = document.createElement('canvas')
  tiny.width = 64
  tiny.height = 36
  const tinyCtx = tiny.getContext('2d', { willReadFrequently: true })

  let flipEnabled = readFlip()
  let cameraId = safeGet(CAMERA_KEY)
  let cameras = []

  // Runner state
  let lastGoodTime = now()
  let currentlyFixating = true
  let lastPostTime = 0
  let postPending = false
  let gazeX = 0.5
  let gazeY = 0.5
  let emaH = null
  let emaV = null
  let faceDetected = false
  let baselineH = null
  let baselineV = null
  let baselineContrast = null
  let baselineSamples = []
  let occluded = false
  let occlusionFrames = 0
  let lastBlackCheck = 0
  let feedIsBlack = false
  let blinking = false
  // Landmarks found at all — faceDetected stays false while the baseline is
  // still being learned, so the panel needs this to say "no face" honestly
  let facePresent = false
  let server = { isFixating: null, gazeX: null, gazeY: null, calibrated: false }

  let phase = 'starting' // starting | loading | running | error
  let error = ''
  let lastStatusKey = ''
  let readyWaiters = []

  function now() {
    return performance.now() / 1000
  }

  function emitStatus() {
    const displayFixating = server.isFixating !== null ? server.isFixating : currentlyFixating
    const status = {
      phase,
      error,
      faceDetected,
      facePresent,
      learning: phase === 'running' && baselineH === null
        ? { count: baselineSamples.length, total: BASELINE_FRAMES }
        : null,
      occluded,
      blinking,
      feedIsBlack,
      fixating: displayFixating,
      calibrated: server.calibrated,
      flip: flipEnabled,
      cameras,
      cameraId,
      offset: emaH !== null && emaV !== null ? { h: emaH - 0.5, v: emaV - 0.5 } : null,
    }
    // Only re-render the page when something visible changed
    const key = JSON.stringify({ ...status, offset: status.offset && [status.offset.h.toFixed(2), status.offset.v.toFixed(2)] })
    if (key === lastStatusKey) return
    lastStatusKey = key
    onStatus?.(status)
  }

  function resolveReady() {
    readyWaiters.forEach((r) => r())
    readyWaiters = []
  }

  function resetBaseline() {
    baselineH = null
    baselineV = null
    baselineContrast = null
    baselineSamples = []
    occluded = false
    occlusionFrames = 0
    emaH = null
    emaV = null
  }

  async function openCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop())
    const videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: cameraId ? { ...videoConstraints, deviceId: { exact: cameraId } } : videoConstraints,
        audio: false,
      })
    } catch (err) {
      // A remembered camera that was unplugged — fall back to the default one
      if (cameraId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
        cameraId = null
        safeSet(CAMERA_KEY, null)
        return openCamera()
      }
      throw err
    }
    if (stopped) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    cameraId = stream.getVideoTracks()[0]?.getSettings().deviceId || cameraId
    // Device labels are only available once permission has been granted
    try {
      cameras = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
    } catch {
      cameras = []
    }

    if (!video) {
      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      // Kept in the page (invisibly) — Safari won't decode frames for a
      // detached <video>
      Object.assign(video.style, {
        position: 'fixed', width: '1px', height: '1px', opacity: '0',
        pointerEvents: 'none', left: '0', top: '0',
      })
      document.body.appendChild(video)
    }
    video.srcObject = stream
    await video.play()
  }

  async function createLandmarker() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      return await FaceLandmarker.createFromOptions(fileset, options('GPU'))
    } catch {
      // Some machines/browsers have no usable WebGL — CPU is slower but works
      return await FaceLandmarker.createFromOptions(fileset, options('CPU'))
    }
  }

  async function postFixation(payload) {
    if (postPending) return false // previous POST still in flight — skip this tick
    postPending = true
    try {
      const res = await fetch(fixationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        server = {
          isFixating: data.is_fixating ?? null,
          gazeX: data.gaze_x ?? null,
          gazeY: data.gaze_y ?? null,
          calibrated: Boolean(data.calibrated),
        }
      }
    } catch {
      // Network blip — the next tick retries
    } finally {
      postPending = false
    }
    return true
  }

  function processFrame() {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    const t = now()

    if (work.width !== w || work.height !== h) {
      work.width = w
      work.height = h
    }
    // The runner flips the frame before everything else; mirror the pixels
    // here and the landmarks below so all geometry sees the same image
    workCtx.save()
    if (flipEnabled) {
      workCtx.translate(w, 0)
      workCtx.scale(-1, 1)
    }
    workCtx.drawImage(video, 0, 0, w, h)
    workCtx.restore()

    if (t - lastBlackCheck >= 2.0) {
      lastBlackCheck = t
      tinyCtx.drawImage(work, 0, 0, tiny.width, tiny.height)
      const { data } = tinyCtx.getImageData(0, 0, tiny.width, tiny.height)
      let sum = 0
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2]
      feedIsBlack = sum / ((data.length / 4) * 3) <= BLACK_FRAME_MEAN
    }

    const result = landmarker.detectForVideo(video, performance.now())
    const raw = result.faceLandmarks?.[0]
    facePresent = Boolean(raw)
    let lm = null
    let specs = []
    let ignoredSpecs = []
    blinking = false

    if (raw) {
      lm = flipEnabled ? raw.map((p) => ({ x: 1 - p.x, y: p.y })) : raw
      ;[specs, ignoredSpecs] = eyesUnderTest(lm, flipEnabled, eye)
      blinking = isBlinking(lm, specs, w, h)

      // Is the tested eye visible, or has the occluder drifted over it?
      // Take the worst eye so one covered eye trips OU too.
      const measured = specs
        .map((spec) => eyeContrast(workCtx, lm, spec, w, h))
        .filter((c) => c !== null)
      const frameContrast = measured.length ? Math.min(...measured) : null

      if (
        baselineContrast !== null &&
        baselineContrast >= OCCLUSION_MIN_BASELINE &&
        frameContrast !== null
      ) {
        // Hysteresis + a few frames to trip, so a passing shadow can't blank it
        if (occluded) {
          if (frameContrast > baselineContrast * OCCLUSION_CLEAR_RATIO) {
            occluded = false
            occlusionFrames = 0
          }
        } else if (frameContrast < baselineContrast * OCCLUSION_TRIP_RATIO) {
          occlusionFrames += 1
          if (occlusionFrames >= OCCLUSION_TRIP_FRAMES) occluded = true
        } else {
          occlusionFrames = 0
        }
      }

      if (blinking || occluded) {
        // Ratios are meaningless — hold the last gaze, report no reading so
        // calibration never samples a guess
        faceDetected = emaH !== null && !occluded
        if (t - lastGoodTime >= BAD_THRESHOLD_SECS) currentlyFixating = false
      } else {
        const [rawH, rawV] = getRatios(lm, specs, w, h)

        if (baselineH === null) {
          // Still learning this person's center — collect, don't stream
          baselineSamples.push([rawH, rawV, frameContrast])
          if (baselineSamples.length >= BASELINE_FRAMES) {
            baselineH = median(baselineSamples.map((s) => s[0]))
            baselineV = median(baselineSamples.map((s) => s[1]))
            const cs = baselineSamples.map((s) => s[2]).filter((c) => c !== null)
            baselineContrast = cs.length ? median(cs) : null
            resolveReady()
          }
          faceDetected = false
          lastGoodTime = t
        } else {
          const avgH = 0.5 + (rawH - baselineH)
          const avgV = 0.5 + (rawV - baselineV)
          const fixating = isFixatingLocal(avgH, avgV)

          // Creep the center toward where they're looking — only inside the
          // window, and frozen once calibrated (the saved mapping is expressed
          // in these baseline-relative ratios)
          if (fixating && !server.calibrated) {
            baselineH += BASELINE_ADAPT * (avgH - 0.5)
            baselineV += BASELINE_ADAPT * (avgV - 0.5)
          }

          emaH = emaH === null ? avgH : EMA_ALPHA * avgH + (1 - EMA_ALPHA) * emaH
          emaV = emaV === null ? avgV : EMA_ALPHA * avgV + (1 - EMA_ALPHA) * emaV
          ;[gazeX, gazeY] = estimateGaze(emaH, emaV)
          faceDetected = true

          if (fixating) {
            lastGoodTime = t
            currentlyFixating = true
          } else if (t - lastGoodTime >= BAD_THRESHOLD_SECS) {
            currentlyFixating = false
          }
        }
      }
    } else {
      faceDetected = false
      if (t - lastGoodTime >= BAD_THRESHOLD_SECS) currentlyFixating = false
      gazeX = 0.5
      gazeY = 0.5
    }

    if (t - lastPostTime >= POST_INTERVAL && !postPending) {
      lastPostTime = t
      postFixation({
        is_fixating: currentlyFixating,
        gaze_x: round4(gazeX),
        gaze_y: round4(gazeY),
        // EMA-smoothed ratios — the canvas samples these during calibration
        raw_h: faceDetected && emaH !== null ? round4(emaH) : null,
        raw_v: faceDetected && emaV !== null ? round4(emaV) : null,
        camera_ok: !feedIsBlack,
      })
    }

    return { lm, specs, ignoredSpecs, w, h }
  }

  function drawPreview(frame) {
    const canvas = getPreviewCanvas?.()
    if (!canvas || !frame) return
    const dpr = window.devicePixelRatio || 1
    const cw = Math.round(canvas.clientWidth * dpr)
    const ch = Math.round(canvas.clientHeight * dpr)
    if (!cw || !ch) return
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }
    const ctx = canvas.getContext('2d')
    const { lm, specs, ignoredSpecs, w, h } = frame
    const sx = cw / w
    const sy = ch / h
    ctx.drawImage(work, 0, 0, cw, ch)

    if (lm) {
      // Grey out the untested eye — if this lands on the eye actually being
      // tested, the eye setting or the flip is wrong
      ctx.lineWidth = 1 * dpr
      for (const spec of ignoredSpecs) {
        const box = eyeBbox(lm, spec, w, h)
        if (!box) continue
        let [x0, y0, x1, y1] = box
        const pad = (x1 - x0) / 4
        x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy)
        ctx.strokeStyle = 'rgba(150,150,150,0.9)'
        ctx.strokeRect(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy)
        ctx.fillStyle = 'rgba(170,170,170,0.9)'
        ctx.font = `${10 * dpr}px sans-serif`
        ctx.fillText('not used', x0 * sx, Math.max(10 * dpr, y0 * sy - 3 * dpr))
      }
      // Ring the eye(s) driving the gaze
      ctx.lineWidth = 2 * dpr
      ctx.strokeStyle = occluded ? '#f87171' : '#34d399'
      for (const spec of specs) {
        ctx.beginPath()
        ctx.arc(lm[spec.iris].x * w * sx, lm[spec.iris].y * h * sy, 12 * dpr, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // Fixation tolerance, in the same normalized space as the gaze marker
    const [boxH, boxV] = server.calibrated
      ? [SERVER_FIXATION_WINDOW, SERVER_FIXATION_WINDOW]
      : [FIX_HALF_H / (2 * GAZE_HALF_H), FIX_HALF_V / (2 * GAZE_HALF_V)]
    ctx.lineWidth = 1 * dpr
    ctx.strokeStyle = 'rgba(160,160,160,0.7)'
    ctx.strokeRect((0.5 - boxH) * cw, (0.5 - boxV) * ch, 2 * boxH * cw, 2 * boxV * ch)

    const useServer = server.calibrated && server.gazeX !== null && server.gazeY !== null
    const gx = (useServer ? server.gazeX : gazeX) * cw
    const gy = (useServer ? server.gazeY : gazeY) * ch
    ctx.strokeStyle = '#facc15'
    ctx.fillStyle = '#facc15'
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    ctx.arc(gx, gy, 7 * dpr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(gx, gy, 2.5 * dpr, 0, Math.PI * 2)
    ctx.fill()
  }

  let lastVideoTime = -1
  function onFrame() {
    if (stopped) return
    try {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        drawPreview(processFrame())
        emitStatus()
      }
    } catch (err) {
      console.error('Eye tracker frame error:', err)
    }
    scheduleNext()
  }

  function cancelFrame() {
    if (frameHandle?.type === 'vfc') video?.cancelVideoFrameCallback?.(frameHandle.id)
    if (frameHandle?.type === 'timeout') clearTimeout(frameHandle.id)
    frameHandle = null
  }

  function scheduleNext() {
    if (stopped) return
    // Fires once per new camera frame; the fallback polls at ~30fps
    if (video.requestVideoFrameCallback) {
      frameHandle = { type: 'vfc', id: video.requestVideoFrameCallback(onFrame) }
    } else {
      frameHandle = { type: 'timeout', id: setTimeout(onFrame, 33) }
    }
  }

  async function start() {
    let step = 'camera'
    try {
      emitStatus()
      await openCamera()
      if (stopped) return
      phase = 'loading'
      step = 'model'
      emitStatus()
      landmarker = await createLandmarker()
      if (stopped) {
        landmarker.close()
        return
      }
      phase = 'running'
      lastGoodTime = now()
      emitStatus()
      scheduleNext()
    } catch (err) {
      if (stopped) return
      phase = 'error'
      error = step === 'camera'
        ? cameraErrorMessage(err)
        : 'Could not load the eye-tracking model — check the internet connection and reload the page'
      console.error('Eye tracker failed to start:', err)
      emitStatus()
      resolveReady()
    }
  }

  start()

  return {
    stop() {
      stopped = true
      cancelFrame()
      stream?.getTracks().forEach((t) => t.stop())
      if (video) {
        video.srcObject = null
        video.remove()
      }
      landmarker?.close()
      resolveReady()
    },
    // Horizontal geometry changes, and so may which eye is which — relearn center
    toggleFlip() {
      flipEnabled = !flipEnabled
      safeSet(FLIP_KEY, flipEnabled ? '1' : '0')
      resetBaseline()
      emitStatus()
    },
    // Re-anchor center after the patient shifts or the occluder goes on late
    relearn() {
      resetBaseline()
      emitStatus()
    },
    async setCamera(deviceId) {
      if (deviceId === cameraId) return
      cameraId = deviceId
      safeSet(CAMERA_KEY, deviceId)
      resetBaseline()
      // The pending frame callback belongs to the old stream — restart the loop
      cancelFrame()
      try {
        await openCamera()
        if (landmarker && !stopped) {
          phase = 'running'
          error = ''
          lastVideoTime = -1
          scheduleNext()
        }
      } catch (err) {
        phase = 'error'
        error = cameraErrorMessage(err)
      }
      emitStatus()
    },
    // Resolves once the center baseline is learned (or on error / timeout),
    // so calibration doesn't start before the tracker has any readings
    whenReady(timeoutMs = 10000) {
      if (baselineH !== null || phase === 'error' || stopped) return Promise.resolve()
      return new Promise((resolve) => {
        readyWaiters.push(resolve)
        setTimeout(resolve, timeoutMs)
      })
    },
  }
}

function readFlip() {
  // Default: mirror the frame (normal webcam), same as the runner
  return safeGet(FLIP_KEY) !== '0'
}

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked — the setting just won't persist
  }
}
