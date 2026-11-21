// ─── cameraMonitor.js ─────────────────────────────────────────────────────────
// The camera preview lives in its own window (/test/camera) so it can sit on
// the clinician's laptop screen while the projector shows only the test. The
// test page keeps running the tracker — it is fullscreen on the projector, so
// the browser never throttles it — and talks to the monitor over a
// BroadcastChannel (same browser, nothing goes through the server):
//
//   test page → monitor:  { type: 'status', runId, eye, status }
//                          { type: 'frame', blob }        preview JPEG, ~10/s
//                          { type: 'ended' }              tracker stopped
//   monitor → test page:  { type: 'hello' }              heartbeat, every 1s
//                          { type: 'command', name, arg } flip / relearn / camera

export const MONITOR_CHANNEL = 'perivue-camera-monitor'
export const MONITOR_PATH = '/test/camera'
// Same name every time, so a second click reuses the open window
const MONITOR_WINDOW_NAME = 'perivue-camera-monitor'

// The monitor counts as open while its heartbeats keep arriving
export const MONITOR_TIMEOUT_MS = 3000

// Commands the monitor may run on the tracker
export const MONITOR_COMMANDS = ['toggleFlip', 'relearn', 'setCamera']

// Must be called from a click handler — browsers block pop-ups otherwise.
// Returns null when the pop-up was blocked.
export function openCameraMonitor() {
  try {
    return window.open(MONITOR_PATH, MONITOR_WINDOW_NAME, 'popup,width=560,height=640')
  } catch {
    return null
  }
}

// One-line summary of the tracker's state, shared by the monitor window and
// the test page's status line
export function trackerMessage(status) {
  if (!status || status.phase === 'starting') {
    return { tone: 'muted', text: 'Starting camera — allow camera access if the browser asks' }
  }
  if (status.phase === 'loading') return { tone: 'muted', text: 'Loading eye-tracking model…' }
  if (status.phase === 'error') return { tone: 'bad', text: status.error }
  if (status.feedIsBlack) {
    return { tone: 'bad', text: "Camera picture is black — check the camera isn't covered or in use by another app" }
  }
  if (!status.facePresent) {
    return { tone: 'warn', text: 'Camera OK — no face detected. Seat the patient facing the camera' }
  }
  if (status.occluded) {
    return { tone: 'bad', text: 'Tested eye looks covered — the occluder goes over the OTHER eye' }
  }
  if (status.learning) {
    return {
      tone: 'warn',
      text: `Learning centre gaze — cover the untested eye and have the patient look at the centre (${status.learning.count}/${status.learning.total})`,
    }
  }
  if (!status.faceDetected) return { tone: 'warn', text: 'Camera OK — eye not readable (blink or glare?)' }
  return {
    tone: 'good',
    text: `Camera OK — face detected · fixation ${status.fixating ? 'OK' : 'LOST'}${status.calibrated ? ' (calibrated)' : ''}`,
  }
}

export const TONE_CLASS = {
  muted: 'text-white/45',
  warn: 'text-amber-400/90',
  bad: 'text-red-400',
  good: 'text-emerald-400/90',
}
