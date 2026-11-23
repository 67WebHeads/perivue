// ─── voiceScripts.js ──────────────────────────────────────────────────────────
// Every line the voice guide speaks. The pre-test instructions exist in English
// and Filipino (the pop-up shows English; the voice reads English, then
// Filipino). Prompts during the test are English only.
//
// The Filipino text is everyday Taglish — have someone at the clinic review it
// before it is used with patients.

// Pre-test instructions, one entry per numbered step on the pop-up.
// `en` is also the text shown on screen.
export function buildInstructionSteps({ eye, eyeTracking }) {
  const covered = eye === 'OD' ? 'left' : eye === 'OS' ? 'right' : null

  // Filipino lines: Jeff's Taglish script (2026-11-23). The covered eye is
  // filled in from the test (left/right).
  return [
    {
      en: 'Sit comfortably and keep your head still for the whole test.',
      fil: 'Umupo ng maayos at wag igalaw ang ulo during test.',
    },
    covered && {
      en: `Keep your ${covered} eye covered until the test is finished.`,
      fil: `Takpan ang ${covered} eye hanggang sa matapos ang test.`,
    },
    {
      en: 'Always look at the cross in the centre. Do not move your eyes to search for the dots.',
      fil: 'Palaging tumingin sa gitna. Wag tignan nang direkta ang mga dots.',
    },
    {
      en: 'First you will check your button and do a short practice, so you know what the dots look like.',
      fil: 'Una, iche-check kung maayos ba ang inyong clicker sa practice test, para malaman ang makikita sa test.',
    },
    eyeTracking && {
      en: 'Next, a few dots will appear near the corners. Look at each one when asked. This lets the camera learn where you are looking.',
      fil: 'Pagkatapos, may lalabas na dots sa bawat corner ng screen. Tignan ang mga dots na ito para maayos ang calibration ng system.',
    },
    {
      en: 'Press the button as soon as you see a dot, whether it flashes or slowly moves in from the edge.',
      fil: 'Habang nagte-test, ang dots ay nagfa-flash o gumagalaw. Pindutin ang clicker pag nakita mo na ito.',
    },
    {
      en: 'It is normal to miss some dots. Blink normally and stay relaxed.',
      fil: 'Okay lang kung may mga dots na hindi mo makita. Pumikit lang naturally at maging kalmado throughout the test.',
    },
  ].filter(Boolean)
}

// Spoken before and after the numbered steps
export const INSTRUCTION_INTRO = {
  en: 'Before we begin, please listen to these instructions.',
  fil: 'Bago tayo mag-start, makinig po muna sa instructions.',
}
export const INSTRUCTION_OUTRO = {
  en: 'Tell the examiner if you feel uncomfortable or need a break. The test can be paused at any time.',
  fil: 'Sabihan lang po ang examiner kung hindi kayo comfortable o kailangan ninyong magpahinga. Puwedeng i-pause ang test anytime.',
}

// In-test prompts (English only)
export const LINES = {
  buttonCheck: 'Press your button once, so we can check that it works.',
  practiceIntro: "Let's practise first. Keep looking at the centre cross, and press when you see a dot.",
  practiceDone: 'Practice finished. Well done.',
  calibRetry: "We couldn't see your eye. Please look at the dot again.",
  calibHold: 'Hold still.',
  calibrated: 'Well done. Now look at the centre cross.',
  testStart: 'The test starts now. Keep looking at the centre cross, and press whenever you see a dot.',
  fixationLost: 'Please look back at the centre cross.',
  paused: 'The test is paused. You can rest your eyes.',
  resumed: "We're continuing. Keep looking at the centre cross.",
  finished: 'The test is finished. Thank you, you can relax now.',
}

// "Look at the dot in the top-left corner." from a target's screen fractions
export function calibrationLine(sx, sy) {
  const v = sy < 0.3 ? 'top' : sy > 0.7 ? 'bottom' : null
  const h = sx < 0.3 ? 'left' : sx > 0.7 ? 'right' : null
  if (!v && !h) return 'Look at the dot in the centre.'
  if (v && h) return `Look at the dot in the ${v}-${h} corner.`
  return `Look at the dot on the ${v || h}.`
}

// Played by the "Play sample" buttons in the voice settings
export const SAMPLE = {
  en: 'This is how the instructions will sound. Keep looking at the centre cross.',
  fil: 'Ganito po ang tunog ng instructions. Laging tumingin sa cross sa gitna.',
}
