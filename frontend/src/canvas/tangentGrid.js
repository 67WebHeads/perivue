// ─── tangentGrid.js ───────────────────────────────────────────────────────────
// Draws the projected tangent screen (rings, spokes, angle labels, fixation
// starburst) and the stimulus dot. Shared by the test canvas (TestScreen.jsx)
// and the Settings page preview, so the preview is exactly what is projected.
//
// The 0.44 factor in drawGrid is mirrored in config/projection.js — keep the
// two in sync.

export const RINGS = [5, 10, 15, 20, 25, 30, 35]
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

export function drawGrid(canvas, opacity = 1) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const maxRing = RINGS[RINGS.length - 1]
  const scale = Math.min(W, H) * 0.44 / maxRing
  // Lets the clinician fade the printed tangent screen behind the projection
  // without dimming the stimulus dot — see the settings panel
  const gridOpacity = Math.max(0, Math.min(1, opacity))
  const white = (alpha) => `rgba(255,255,255,${alpha * gridOpacity})`

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  RINGS.forEach(r => {
    const px = r * scale
    ctx.beginPath()
    ctx.arc(cx, cy, px, 0, Math.PI * 2)
    ctx.strokeStyle = white(0.7)
    ctx.lineWidth = r === maxRing ? 2 : 1
    ctx.stroke()
    if (r < maxRing) {
      ctx.fillStyle = white(0.7)
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
    ctx.strokeStyle = white(0.55)
    ctx.lineWidth = 0.6
    ctx.stroke()
  })

  const labelR = (maxRing + 4) * scale
  SPOKES.forEach(angleDeg => {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    const lx = cx + labelR * Math.cos(rad)
    const ly = cy + labelR * Math.sin(rad)
    ctx.fillStyle = white(0.9)
    ctx.font = `${Math.max(11, scale * 1.3)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ANGLE_LABELS[angleDeg], lx, ly)
  })

  const crossAngles = Array.from({ length: 16 }, (_, i) => i * (Math.PI / 8))
  const innerR = scale * 0.5
  const outerR = scale * 1.6
  ctx.strokeStyle = white(1.0)
  ctx.lineWidth = 1.2
  crossAngles.forEach(a => {
    ctx.beginPath()
    ctx.moveTo(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a))
    ctx.lineTo(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a))
    ctx.stroke()
  })

  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fillStyle = white(1.0)
  ctx.fill()

  return { cx, cy, scale }
}

export function drawDot(canvas, meta, xDeg, yDeg, color = 'white', sizeDeg = 0.5) {
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
