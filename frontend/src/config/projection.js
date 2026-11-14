// ─── projection.js ────────────────────────────────────────────────────────────
// Test display preferences (saved per browser) and the projector geometry used
// by the Settings page's setup guide and the canvas settings panel.

export const STIMULUS_COLOR_KEY = 'perivue_stimulus_color'
export const TANGENT_OPACITY_KEY = 'perivue_tangent_opacity'
export const VIEWING_DISTANCE_KEY = 'perivue_viewing_distance_cm'

// White is the standard tangent screen target; red is used for colour
// desaturation checks (e.g. optic nerve / chiasmal lesions).
export const STIMULUS_COLORS = [
  { value: 'white',  label: 'White',  css: '#ffffff' },
  { value: 'red',    label: 'Red',    css: '#ff2a2a' },
  { value: 'green',  label: 'Green',  css: '#22e05a' },
  { value: 'blue',   label: 'Blue',   css: '#3b82ff' },
  { value: 'yellow', label: 'Yellow', css: '#ffe500' },
]
export const DEFAULT_STIMULUS_COLOR = 'white'

export function stimulusCss(value) {
  return (STIMULUS_COLORS.find(c => c.value === value) ?? STIMULUS_COLORS[0]).css
}

// 1 m is the classic tangent screen viewing distance
export const DEFAULT_VIEWING_DISTANCE_CM = 100
export const MIN_VIEWING_DISTANCE_CM = 50
export const MAX_VIEWING_DISTANCE_CM = 300

// Must match drawGrid() in TestScreen.jsx: the outermost ring's radius is 44%
// of the canvas's shorter side (the height, on a landscape projector).
const OUTER_RING_DEG = 35
const OUTER_RING_FRACTION_OF_HEIGHT = 0.44
const RINGS = [5, 10, 15, 20, 25, 30, 35]

const tanDeg = (deg) => Math.tan((deg * Math.PI) / 180)

/**
 * Projected sizes for a patient seated `distanceCm` from the screen.
 * The outer 35° ring is sized to its true tangent-screen size (distance × tan 35°).
 * The canvas spaces the rings evenly, so inner rings come out slightly larger
 * than on a printed tangent screen — `rings` lists both for checking.
 */
export function projectionFor(distanceCm) {
  const outerRadius = distanceCm * tanDeg(OUTER_RING_DEG)
  const outerDiameter = outerRadius * 2
  const imageHeight = outerRadius / OUTER_RING_FRACTION_OF_HEIGHT
  return {
    outerDiameter,
    imageHeight,
    imageWidth16x9: (imageHeight * 16) / 9,
    imageWidth16x10: (imageHeight * 16) / 10,
    rings: RINGS.map(deg => ({
      deg,
      canvasDiameter: (outerDiameter * deg) / OUTER_RING_DEG,
      tangentDiameter: 2 * distanceCm * tanDeg(deg),
    })),
  }
}

export function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Storage blocked: the setting just won't be remembered next time
  }
}

export function readViewingDistance() {
  const n = Number(readPref(VIEWING_DISTANCE_KEY, DEFAULT_VIEWING_DISTANCE_CM))
  return Number.isFinite(n) && n >= MIN_VIEWING_DISTANCE_CM && n <= MAX_VIEWING_DISTANCE_CM
    ? n
    : DEFAULT_VIEWING_DISTANCE_CM
}
