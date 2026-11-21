// ─── plainLanguage.js ─────────────────────────────────────────────────────────
// Turns a run from GET sessions/<id>/results/ into short, plain-language
// sentences for patients, with the clinical direction term alongside for the
// examiner. Used on the results page and in the PDF report.
//
// It only describes what happened during the test (which dots were seen and
// where side vision reached). It never says "normal" or "abnormal": that
// judgement belongs to the clinician.
//
// Directions are from the patient's point of view: the screen's right is the
// patient's right. Angles use the protocol convention (0° = right, 90° = up).

const DIRECTIONS = [
  { name: 'right',       v: null,       h: 'right' },
  { name: 'upper right', v: 'superior', h: 'right' },
  { name: 'top',         v: 'superior', h: null },
  { name: 'upper left',  v: 'superior', h: 'left' },
  { name: 'left',        v: null,       h: 'left' },
  { name: 'lower left',  v: 'inferior', h: 'left' },
  { name: 'bottom',      v: 'inferior', h: null },
  { name: 'lower right', v: 'inferior', h: 'right' },
]

// Closest of the 8 compass directions for an angle in degrees
function directionIndex(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360
  return Math.round(a / 45) % 8
}

// Right eye: the patient's right is the temporal (outer) side. Left eye: nasal.
function clinicalTerm(dir, eye) {
  const side = dir.h == null
    ? null
    : (dir.h === 'right') === (eye === 'OD') ? 'temporal' : 'nasal'
  if (dir.v && side) return `${dir.v === 'superior' ? 'supero' : 'infero'}${side}`
  return dir.v || side
}

function where(dir, eye) {
  return `${dir.name} (${clinicalTerm(dir, eye)})`
}

const RING_WORDS = { 10: 'close to the centre', 20: 'in the middle area', 30: 'far out at the edge' }

function listCounts(entries) {
  // [['upper left (superonasal)', 3], ...] → "3 toward the upper left (superonasal) and 1 toward …"
  const parts = entries.map(([label, n]) => `${n} toward the ${label}`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * @returns {{ tone: 'good'|'mixed'|'concern'|'unreliable', headline: string,
 *             points: string[] }}
 */
export function summarizeRun(run) {
  const m = run.metrics
  const eye = run.eye
  const eyeWords = eye === 'OD' ? 'right eye' : 'left eye'
  const points = []

  // ── Flashing (static) dots ──
  const statics = run.static_results.filter(s => s.x_deg != null && s.y_deg != null)
  const missed = statics.filter(s => s.result === 'not_seen')
  if (statics.length > 0) {
    if (missed.length === 0) {
      points.push(`Saw every one of the ${statics.length} flashing dots.`)
    } else {
      const byDir = new Map()
      const byRing = new Map()
      missed.forEach(s => {
        const dir = DIRECTIONS[directionIndex((Math.atan2(s.y_deg, s.x_deg) * 180) / Math.PI)]
        const key = where(dir, eye)
        byDir.set(key, (byDir.get(key) || 0) + 1)
        const ring = Math.round(Math.hypot(s.x_deg, s.y_deg) / 10) * 10
        byRing.set(ring, (byRing.get(ring) || 0) + 1)
      })
      const dirs = [...byDir.entries()].sort((a, b) => b[1] - a[1])
      points.push(
        `Saw ${m.stimuli_seen} of ${statics.length} flashing dots. ` +
        `The ${missed.length} missed ${missed.length === 1 ? 'dot was' : 'dots were'} ` +
        `${listCounts(dirs.slice(0, 3))}${dirs.length > 3 ? ', plus a few in other directions' : ''}.`
      )
      const [topRing, topCount] = [...byRing.entries()].sort((a, b) => b[1] - a[1])[0]
      if (RING_WORDS[topRing] && topCount > missed.length / 2) {
        points.push(
          `Most missed dots were ${RING_WORDS[topRing]} of the field of view (${topRing}° from the centre).`
        )
      }
    }
  }

  // ── Moving (kinetic) dots: how far out side vision reached ──
  const kinetic = run.kinetic_results.filter(k => k.angle_deg != null)
  const reached = kinetic
    .filter(k => k.result === 'seen' && k.boundary_x != null && k.boundary_y != null)
    .map(k => ({ ...k, radius: Math.hypot(k.boundary_x, k.boundary_y) }))
  const neverSeen = kinetic.filter(k => k.result !== 'seen')

  if (reached.length > 0) {
    const avg = reached.reduce((sum, k) => sum + k.radius, 0) / reached.length
    points.push(
      `Moving dots were noticed on average about ${Math.round(avg)}° from the centre, ` +
      `which shows how far side vision reaches (the lavender line on the map).`
    )
    if (reached.length >= 4) {
      const sorted = [...reached].sort((a, b) => a.radius - b.radius)
      const narrow = sorted[0]
      const wide = sorted[sorted.length - 1]
      if (wide.radius - narrow.radius >= 5) {
        points.push(
          `Side vision reached furthest toward the ` +
          `${where(DIRECTIONS[directionIndex(wide.angle_deg)], eye)}, about ${Math.round(wide.radius)}°, ` +
          `and was narrowest toward the ` +
          `${where(DIRECTIONS[directionIndex(narrow.angle_deg)], eye)}, about ${Math.round(narrow.radius)}°.`
        )
      }
    }
  }
  if (neverSeen.length > 0) {
    const dirs = [...new Set(neverSeen.map(k => where(DIRECTIONS[directionIndex(k.angle_deg)], eye)))]
    points.push(
      `In ${neverSeen.length} of ${kinetic.length} directions the moving dot was not noticed ` +
      `before it reached the centre: ${dirs.join(', ')}.`
    )
  }

  // ── Reaction time ──
  if (m.avg_reaction_time != null) {
    points.push(
      `On average the button was pressed ${(m.avg_reaction_time / 1000).toFixed(1)} seconds after a dot appeared.`
    )
  }

  // ── Reliability (same thresholds as the colour coding on the metric cards) ──
  const losses = run.fixation_loss_count
  const lossWords = `${losses} time${losses === 1 ? '' : 's'}`
  let reliabilityText
  if (m.reliability >= 85) {
    reliabilityText = losses === 0
      ? 'The eye stayed on the centre cross throughout, so these results are reliable.'
      : `The eye stayed on the centre cross for most of the test (it looked away ${lossWords}), so these results are reliable.`
  } else if (m.reliability >= 70) {
    reliabilityText = `The eye looked away from the centre cross ${lossWords}, so treat these results with some caution.`
  } else {
    reliabilityText = `The eye looked away from the centre cross ${lossWords}. These results may not be reliable, and a repeat test may be needed.`
  }
  points.push(reliabilityText)

  // ── Headline ──
  let tone
  let headline
  if (m.reliability < 70) {
    tone = 'unreliable'
    headline = `The ${eyeWords} test may need to be repeated.`
  } else if (m.detection_accuracy >= 90 && neverSeen.length === 0) {
    tone = 'good'
    headline = `The ${eyeWords} saw almost all of the test dots.`
  } else if (m.detection_accuracy >= 70) {
    tone = 'mixed'
    headline = `The ${eyeWords} saw most of the test dots but missed some.`
  } else {
    tone = 'concern'
    headline = `The ${eyeWords} missed a number of the test dots.`
  }

  return {
    tone,
    headline,
    points,
  }
}

// Plain explanations of the technical terms used on the page
export const GLOSSARY = [
  ['Visual field', 'Everything you can see, including at the sides, while looking straight ahead.'],
  ['Flashing (static) dots', 'Dots that blink on in one spot. Each one checks a single place in your side vision.'],
  ['Moving (kinetic) dots', 'Dots that slide in from the edge toward the centre. Where you first notice one marks the edge of your side vision.'],
  ['Isopter', 'The lavender line joining those edge points: the outline of how far your side vision reaches.'],
  ['Fixation', 'Keeping your eye on the centre cross. Looking away during the test makes the results less accurate.'],
  ['Nasal / temporal', 'Nasal is the side of your vision toward your nose; temporal is the side toward your ear.'],
  ['OD / OS', 'OD means the right eye and OS means the left eye.'],
]
