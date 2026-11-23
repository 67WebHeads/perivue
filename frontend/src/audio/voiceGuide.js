// ─── voiceGuide.js ────────────────────────────────────────────────────────────
// Spoken instructions through the browser's built-in text-to-speech
// (speechSynthesis) — no audio files, works offline with the voices installed
// on the computer. Settings are saved per browser like the other display
// preferences.
//
// Browsers only allow sound after the user has clicked on the page; pressing
// Begin test on the canvas covers that.

import { readPref, savePref } from '../config/projection'

export const VOICE_ENABLED_KEY = 'perivue_voice_enabled'
export const VOICE_READ_FIL_KEY = 'perivue_voice_read_fil'
export const VOICE_EN_KEY = 'perivue_voice_en'
export const VOICE_FIL_KEY = 'perivue_voice_fil'
export const VOICE_RATE_KEY = 'perivue_voice_rate'
export const VOICE_VOLUME_KEY = 'perivue_voice_volume'

export const DEFAULT_RATE = 0.9 // a little slower than normal speech
export const MIN_RATE = 0.6
export const MAX_RATE = 1.3

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
export const VOICE_SUPPORTED = Boolean(synth && window.SpeechSynthesisUtterance)

// ── Preferences ──
const num = (key, fallback, min, max) => {
  const n = Number(readPref(key, fallback))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

export function readVoicePrefs() {
  return {
    enabled: readPref(VOICE_ENABLED_KEY, 'on') !== 'off',
    readFilipino: readPref(VOICE_READ_FIL_KEY, 'on') !== 'off',
    enVoice: readPref(VOICE_EN_KEY, ''),
    filVoice: readPref(VOICE_FIL_KEY, ''),
    rate: num(VOICE_RATE_KEY, DEFAULT_RATE, MIN_RATE, MAX_RATE),
    volume: num(VOICE_VOLUME_KEY, 1, 0, 1),
  }
}

export function saveVoicePref(key, value) {
  if (typeof value === 'boolean') savePref(key, value ? 'on' : 'off')
  else savePref(key, value)
}

// ── Voices ──
// The list loads asynchronously in Chrome and Edge; wait for it (briefly)
export function loadVoices(timeoutMs = 1500) {
  if (!VOICE_SUPPORTED) return Promise.resolve([])
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise(resolve => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done)
      clearTimeout(timer)
      resolve(synth.getVoices())
    }
    const timer = setTimeout(done, timeoutMs)
    synth.addEventListener('voiceschanged', done)
  })
}

export const isFilipino = v => /^(fil|tl)\b/i.test(v.lang)
export const isEnglish = v => /^en\b/i.test(v.lang)

// Clinic defaults: Microsoft Edge's natural online voices. Used whenever they
// exist and the examiner hasn't picked another voice; other browsers fall back
// to the best match for the language.
export const DEFAULT_VOICE_NAMES = {
  en: /Microsoft Sonia.*English \(United Kingdom\)/i,
  fil: /Microsoft Blessica.*Filipino/i,
}

// The saved voice if it is still installed, else the clinic default, else the
// best match for the language
export function pickVoice(voices, lang, savedUri) {
  const saved = savedUri && voices.find(v => v.voiceURI === savedUri)
  if (saved) return saved
  const preferred = voices.find(v => DEFAULT_VOICE_NAMES[lang].test(v.name))
  if (preferred) return preferred
  if (lang === 'fil') return voices.find(isFilipino) || null
  const english = voices.filter(isEnglish)
  return (
    english.find(v => /^en-PH/i.test(v.lang)) ||
    english.find(v => /^en-US/i.test(v.lang)) ||
    english.find(v => /^en-GB/i.test(v.lang)) ||
    english[0] ||
    null
  )
}

// ── Speaking ──
// Each speak() call cancels whatever is still playing. `generation` lets an
// older call notice it was cancelled and stop queueing its remaining sentences.
let generation = 0

export function stopSpeaking() {
  generation += 1
  if (VOICE_SUPPORTED) synth.cancel()
}

// Long utterances get cut off after ~15 s in Chrome, so long text is split into
// chunks of whole sentences. Chunks stay fairly large: each one is a separate
// request for Edge's online voices, and every request is a chance for Edge to
// fall back to Windows' built-in (American English) voice.
const MAX_CHUNK = 220
function chunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? []
  const out = []
  for (const s of sentences) {
    const last = out[out.length - 1]
    if (last && last.length + s.length + 1 <= MAX_CHUNK) out[out.length - 1] = `${last} ${s}`
    else out.push(s)
  }
  return out
}

const wait = ms => new Promise(r => setTimeout(r, ms))

function speakOnce(text, voice, lang, { rate, volume }) {
  return new Promise(resolve => {
    const u = new window.SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = voice?.lang || (lang === 'fil' ? 'fil-PH' : 'en-US')
    u.rate = rate
    u.volume = volume
    // onend sometimes never fires (Chrome); don't let a caller wait forever
    const safety = setTimeout(() => resolve('timeout'), 3000 + (text.length * 90) / rate)
    u.onend = () => { clearTimeout(safety); resolve('ok') }
    u.onerror = e => {
      clearTimeout(safety)
      // 'interrupted' / 'canceled' come from our own stopSpeaking(); anything
      // else (usually a failed request for an online voice) is worth a retry
      resolve(e.error === 'interrupted' || e.error === 'canceled' ? 'stopped' : 'error')
    }
    synth.speak(u)
  })
}

async function speakOne(text, voice, lang, prefs, gen) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (gen !== generation) return
    const result = await speakOnce(text, voice, lang, prefs)
    if (result !== 'error') return
    await wait(400)
  }
}

/**
 * Speak a list of { text, lang: 'en' | 'fil' } parts in order.
 * Resolves when finished, cancelled, or immediately when voice is off.
 * Filipino parts are skipped when no Filipino voice is installed —
 * Filipino text read by an English voice is unintelligible.
 * Pass `force: true` to play even when voice instructions are turned off
 * (used by the "Play sample" buttons).
 */
export async function speakParts(parts, { force = false } = {}) {
  const prefs = readVoicePrefs()
  if (!VOICE_SUPPORTED || (!prefs.enabled && !force)) return
  stopSpeaking()
  const gen = generation
  const voices = await loadVoices()
  // Speaking straight after cancel() makes Edge drop the chosen online voice
  // and use the default one; give it a moment
  await wait(150)
  if (gen !== generation) return
  const voiceFor = {
    en: pickVoice(voices, 'en', prefs.enVoice),
    fil: pickVoice(voices, 'fil', prefs.filVoice),
  }
  for (const part of parts) {
    if (part.lang === 'fil' && !voiceFor.fil) continue
    for (const chunk of chunks(part.text)) {
      if (gen !== generation) return
      await speakOne(chunk, voiceFor[part.lang], part.lang, prefs, gen)
    }
  }
}

// An English line, fire-and-forget (errors never break the test flow)
export function say(text) {
  speakParts([{ text, lang: 'en' }]).catch(() => {})
}

// An English line the caller waits for, e.g. before the countdown starts
export function sayAndWait(text) {
  return speakParts([{ text, lang: 'en' }]).catch(() => {})
}

export async function hasFilipinoVoice() {
  return (await loadVoices()).some(isFilipino)
}
