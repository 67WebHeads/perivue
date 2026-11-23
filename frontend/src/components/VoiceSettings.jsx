import React, { useEffect, useState } from "react";
import {
  VOICE_SUPPORTED,
  VOICE_ENABLED_KEY,
  VOICE_READ_FIL_KEY,
  VOICE_EN_KEY,
  VOICE_FIL_KEY,
  VOICE_RATE_KEY,
  VOICE_VOLUME_KEY,
  MIN_RATE,
  MAX_RATE,
  readVoicePrefs,
  saveVoicePref,
  loadVoices,
  isEnglish,
  isFilipino,
  pickVoice,
  speakParts,
  stopSpeaking,
} from "../audio/voiceGuide";
import { SAMPLE } from "../audio/voiceScripts";

// Voice instruction controls. Used in the test screen's settings modal and on
// the Settings page; both read and write the same saved preferences.

function Toggle({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-xs font-medium text-white/65">{label}</span>
      <span className="relative inline-flex items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="w-9 h-5 rounded-full bg-white/15 peer-checked:bg-emerald-500/60 transition-colors
          peer-focus-visible:ring-2 peer-focus-visible:ring-purple-400" />
        <span className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-all peer-checked:left-[18px]" />
      </span>
    </label>
  );
}

const selectCls =
  "w-full rounded-lg border border-white/15 bg-[#15152a] px-2 py-1.5 text-xs text-white/80";

export default function VoiceSettings() {
  const [prefs, setPrefs] = useState(readVoicePrefs);
  const [voices, setVoices] = useState([]);

  // The voice list arrives asynchronously and can change (e.g. Edge's online voices)
  useEffect(() => {
    if (!VOICE_SUPPORTED) return;
    let alive = true;
    const refresh = () => loadVoices().then((v) => alive && setVoices(v));
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      alive = false;
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  // Stop any sample still playing when the controls close
  useEffect(() => stopSpeaking, []);

  if (!VOICE_SUPPORTED) {
    return (
      <p className="text-xs text-amber-300/80">
        This browser can&apos;t speak instructions. Use Chrome or Microsoft Edge.
      </p>
    );
  }

  function update(key, field, value) {
    saveVoicePref(key, value);
    setPrefs((p) => ({ ...p, [field]: value }));
  }

  const englishVoices = voices.filter(isEnglish);
  const filipinoVoices = voices.filter(isFilipino);
  const noFilipino = voices.length > 0 && filipinoVoices.length === 0;
  // What "Automatic" resolves to: the clinic default (Sonia / Blessica) when installed
  const autoLabel = (lang) => {
    const v = pickVoice(voices, lang, "");
    return v ? `Automatic (${v.name})` : "Automatic";
  };

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        id="voice-enabled"
        label="Voice instructions"
        checked={prefs.enabled}
        onChange={(v) => update(VOICE_ENABLED_KEY, "enabled", v)}
      />

      <div className={`flex flex-col gap-3 ${prefs.enabled ? "" : "opacity-50"}`}>
        <label htmlFor="voice-en" className="flex flex-col gap-1">
          <span className="text-[11px] text-white/45">English voice</span>
          <select
            id="voice-en"
            value={prefs.enVoice}
            onChange={(e) => update(VOICE_EN_KEY, "enVoice", e.target.value)}
            className={selectCls}
          >
            <option value="">{autoLabel("en")}</option>
            {englishVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </label>

        <Toggle
          id="voice-read-fil"
          label="Also read the instructions in Filipino"
          checked={prefs.readFilipino}
          onChange={(v) => update(VOICE_READ_FIL_KEY, "readFilipino", v)}
        />

        {prefs.readFilipino && (
          noFilipino ? (
            <p className="text-[11px] leading-relaxed text-amber-300/80">
              No Filipino voice was found on this computer, so the instructions will be read in
              English only. Microsoft Edge usually offers online Filipino voices, or add one in
              Windows Settings → Time &amp; language → Speech.
            </p>
          ) : (
            <label htmlFor="voice-fil" className="flex flex-col gap-1">
              <span className="text-[11px] text-white/45">Filipino voice</span>
              <select
                id="voice-fil"
                value={prefs.filVoice}
                onChange={(e) => update(VOICE_FIL_KEY, "filVoice", e.target.value)}
                className={selectCls}
              >
                <option value="">{autoLabel("fil")}</option>
                {filipinoVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </label>
          )
        )}

        <div className="grid grid-cols-2 gap-3">
          <label htmlFor="voice-rate" className="flex flex-col gap-1">
            <span className="flex justify-between text-[11px] text-white/45">
              Speed <span className="font-mono tabular-nums">{prefs.rate.toFixed(1)}×</span>
            </span>
            <input
              id="voice-rate"
              type="range"
              min={MIN_RATE}
              max={MAX_RATE}
              step="0.1"
              value={prefs.rate}
              onChange={(e) => update(VOICE_RATE_KEY, "rate", Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </label>
          <label htmlFor="voice-volume" className="flex flex-col gap-1">
            <span className="flex justify-between text-[11px] text-white/45">
              Volume <span className="font-mono tabular-nums">{Math.round(prefs.volume * 100)}%</span>
            </span>
            <input
              id="voice-volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={prefs.volume}
              onChange={(e) => update(VOICE_VOLUME_KEY, "volume", Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => speakParts([{ text: SAMPLE.en, lang: "en" }], { force: true })}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/10 border border-white/15 text-white/80 hover:bg-white/15"
          >
            Play English sample
          </button>
          {!noFilipino && (
            <button
              type="button"
              onClick={() => speakParts([{ text: SAMPLE.fil, lang: "fil" }], { force: true })}
              className="px-3 py-1.5 rounded-lg text-xs bg-white/10 border border-white/15 text-white/80 hover:bg-white/15"
            >
              Play Filipino sample
            </button>
          )}
          <button
            type="button"
            onClick={stopSpeaking}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-white/50 hover:text-white"
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
