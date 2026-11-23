import React, { useCallback, useEffect, useRef, useState } from "react";
import VideocamIcon from "@mui/icons-material/Videocam";
import CastIcon from "@mui/icons-material/Cast";
import TuneIcon from "@mui/icons-material/Tune";
import StimulusPreview from "../../components/StimulusPreview";
import VoiceSettings from "../../components/VoiceSettings";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import { BROWSER_TRACKING, CAMERA_STORAGE_KEY } from "../../tracking/browserTracker";
import {
  STIMULUS_COLORS,
  STIMULUS_COLOR_KEY,
  DEFAULT_STIMULUS_COLOR,
  TANGENT_OPACITY_KEY,
  stimulusCss,
  readPref,
  VIEWING_DISTANCE_KEY,
  MIN_VIEWING_DISTANCE_CM,
  MAX_VIEWING_DISTANCE_CM,
  projectionFor,
  readViewingDistance,
  savePref,
} from "../../config/projection";

// Browser camera permission for in-page eye tracking. Lets the clinician grant
// access and check the picture before a patient sits down, instead of meeting
// the browser prompt for the first time mid-test, and pick which camera the
// test uses (saved where tracking/browserTracker.js reads it).

const PERMISSION_BADGE = {
  granted: { label: "Allowed", cls: "bg-success/10 text-success" },
  denied: { label: "Blocked", cls: "bg-error/10 text-error" },
  prompt: { label: "Not allowed yet", cls: "bg-warning/10 text-warning" },
  unavailable: { label: "Unavailable", cls: "bg-error/10 text-error" },
  unknown: { label: "Unknown", cls: "bg-white/10 text-white/60" },
};

function readSavedCamera() {
  try {
    return localStorage.getItem(CAMERA_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveCamera(deviceId) {
  try {
    if (deviceId) localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);
    else localStorage.removeItem(CAMERA_STORAGE_KEY);
  } catch {
    // Storage blocked — the test will just use the default camera
  }
}

function errorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
      return "Camera access was blocked. Follow the steps below to allow it.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found. Plug in the webcam and try again.";
    case "NotReadableError":
      return "The camera is being used by another app. Close it and try again.";
    default:
      return `Could not open the camera (${err?.name || err}).`;
  }
}

function CameraSettings() {
  const supported = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
  const [permission, setPermission] = useState(supported ? "unknown" : "unavailable");
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState(readSavedCamera);
  const [previewOn, setPreviewOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(
        devices
          .filter((d) => d.kind === "videoinput" && d.deviceId)
          .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      );
    } catch {
      setCameras([]);
    }
  }, []);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewOn(false);
  }, []);

  // Current permission, kept live if it changes in the browser's site settings
  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return;
    let status;
    const onChange = () => {
      setPermission(status.state);
      if (status.state === "granted") listCameras();
    };
    navigator.permissions
      .query({ name: "camera" })
      .then((s) => {
        status = s;
        onChange();
        status.addEventListener("change", onChange);
      })
      .catch(() => {
        // Browser can't report camera permission — the button still works
      });
    return () => status?.removeEventListener("change", onChange);
  }, [supported, listCameras]);

  // Release the camera when leaving the page
  useEffect(() => stopPreview, [stopPreview]);

  async function startPreview(deviceId = cameraId) {
    setBusy(true);
    setError("");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        });
      } catch (err) {
        // The saved camera was unplugged — fall back to the default one
        if (!deviceId || !["OverconstrainedError", "NotFoundError"].includes(err?.name)) throw err;
        saveCamera("");
        setCameraId("");
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPreviewOn(true);
      setPermission("granted");
      // Device names are only visible once access is granted
      await listCameras();
    } catch (err) {
      if (err?.name === "NotAllowedError") setPermission("denied");
      setError(errorMessage(err));
      setPreviewOn(false);
    } finally {
      setBusy(false);
    }
  }

  function handleCameraChange(e) {
    const id = e.target.value;
    setCameraId(id);
    saveCamera(id);
    if (previewOn) startPreview(id);
  }

  const badge = PERMISSION_BADGE[permission] ?? PERMISSION_BADGE.unknown;
  const btn =
    "px-4 py-2 rounded-xl text-sm font-medium border transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-400/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-base-content/50">
            <VideocamIcon />
          </span>
          <div>
            <p className="text-sm font-medium">Camera</p>
            <p className="text-xs text-base-content/50">
              Used for eye tracking during the visual field test
            </p>
          </div>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {!BROWSER_TRACKING && (
        <p className="text-xs text-base-content/50 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
          Eye tracking currently runs through the PeriVue tracker program on the clinic
          laptop, which uses the camera itself. Browser access below is only needed when
          eye tracking runs in the browser.
        </p>
      )}

      {permission === "unavailable" ? (
        <p className="text-sm text-error">
          The camera only works when the site is opened over https:// or on localhost.
        </p>
      ) : (
        <>
          <div
            className={`relative w-full max-w-md aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/40 ${
              previewOn ? "" : "hidden"
            }`}
          >
            {/* Mirrored like a normal webcam view, so it's easy to position the patient */}
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover -scale-x-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!previewOn ? (
              <button
                type="button"
                onClick={() => startPreview()}
                disabled={busy}
                className={`${btn} bg-white/10 border-white/20 hover:bg-white/15`}
              >
                {busy
                  ? "Opening camera…"
                  : permission === "granted"
                    ? "Test camera"
                    : "Allow camera access"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopPreview}
                className={`${btn} bg-white/5 border-white/10 text-white/70 hover:bg-white/10`}
              >
                Stop preview
              </button>
            )}

            {cameras.length > 0 && (
              <select
                value={cameraId}
                onChange={handleCameraChange}
                className="rounded-xl bg-white/10 border border-white/20 text-sm px-3 py-2 max-w-xs"
                aria-label="Camera used for tests"
              >
                <option value="" className="bg-neutral-900">Default camera</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id} className="bg-neutral-900">
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          {permission === "denied" && (
            <div className="text-xs text-base-content/60 rounded-xl bg-white/5 border border-white/10 px-3 py-3 flex flex-col gap-1.5">
              <p className="font-medium text-base-content/80">
                The browser won&apos;t ask again once access is blocked. To allow it:
              </p>
              <p>
                1. Click the icon to the left of the address bar (the camera or the sliders
                icon), set <span className="text-base-content/80">Camera</span> to{" "}
                <span className="text-base-content/80">Allow</span>, then reload this page.
              </p>
              <p>
                2. Still blocked? On a Mac, open System Settings → Privacy &amp; Security →
                Camera and turn on your browser, then restart the browser.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Test display (opacity, stimulus colour) with a live preview ──────────────
// Same saved values the canvas's gear panel uses, and the same drawing code as
// the projected canvas, so the preview is what the patient will see.

function readOpacity() {
  const n = Number(readPref(TANGENT_OPACITY_KEY, 100));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
}

function TestDisplaySettings() {
  const [opacity, setOpacity] = useState(readOpacity);
  const [color, setColor] = useState(() => readPref(STIMULUS_COLOR_KEY, DEFAULT_STIMULUS_COLOR));
  function handleOpacity(e) {
    const n = Number(e.target.value);
    setOpacity(n);
    savePref(TANGENT_OPACITY_KEY, n);
  }

  function handleColor(e) {
    setColor(e.target.value);
    savePref(STIMULUS_COLOR_KEY, e.target.value);
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-400/10 bg-white/5 p-5">
      <div className="flex items-center gap-3">
        <span className="text-base-content/50">
          <TuneIcon />
        </span>
        <div>
          <p className="text-sm font-medium">Test display</p>
          <p className="text-xs text-base-content/50">
            How the tangent screen and stimulus look on the projector
          </p>
        </div>
      </div>

      <StimulusPreview opacity={opacity} color={color} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="settings-opacity" className="text-sm">Tangent screen opacity</label>
            <span className="text-xs font-mono tabular-nums text-base-content/60">{opacity}%</span>
          </div>
          <input
            id="settings-opacity"
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacity}
            onChange={handleOpacity}
            className="w-full accent-purple-500"
          />
          <p className="text-xs text-base-content/40">
            Fades the grid. The stimulus stays at full brightness.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="settings-stimulus-color" className="text-sm">Stimulus colour</label>
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full border border-white/20 shrink-0"
              style={{ backgroundColor: stimulusCss(color) }}
              aria-hidden="true"
            />
            <select
              id="settings-stimulus-color"
              value={color}
              onChange={handleColor}
              className="flex-1 rounded-xl bg-white/10 border border-white/20 text-sm px-3 py-2"
            >
              {STIMULUS_COLORS.map((c) => (
                <option key={c.value} value={c.value} className="bg-neutral-900">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-base-content/40">Saved with each test result.</p>
        </div>
      </div>

      <p className="text-xs text-base-content/40">
        These settings are saved in this browser and used by the next test. You can also
        change them during a test from the gear icon on the test screen.
      </p>
    </div>
  );
}

// ── Projector setup guide ─────────────────────────────────────────────────────
// The canvas sizes the grid to the window, so its real size on the wall depends
// entirely on the projector. This works out the measurements that make the
// projected degrees match the patient's viewing distance.
const cm = (n) => `${n.toFixed(1)} cm`;

function ProjectorSetup() {
  const [distance, setDistance] = useState(readViewingDistance);
  const [draft, setDraft] = useState(String(readViewingDistance()));

  const valid =
    draft.trim() !== "" &&
    Number(draft) >= MIN_VIEWING_DISTANCE_CM &&
    Number(draft) <= MAX_VIEWING_DISTANCE_CM;

  function handleDistanceChange(e) {
    const value = e.target.value;
    setDraft(value);
    const n = Number(value);
    if (value.trim() !== "" && n >= MIN_VIEWING_DISTANCE_CM && n <= MAX_VIEWING_DISTANCE_CM) {
      setDistance(n);
      savePref(VIEWING_DISTANCE_KEY, n);
    }
  }

  const p = projectionFor(distance);
  const ten = p.rings.find((r) => r.deg === 10);

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-400/10 bg-white/5 p-5">
      <div className="flex items-center gap-3">
        <span className="text-base-content/50">
          <CastIcon />
        </span>
        <div>
          <p className="text-sm font-medium">Projector setup</p>
          <p className="text-xs text-base-content/50">
            Size the projected tangent screen so each ring matches its angle in degrees
          </p>
        </div>
      </div>

      <label htmlFor="viewing-distance" className="flex flex-wrap items-center gap-3 text-sm">
        <span>Patient viewing distance</span>
        <span className="flex items-center gap-2">
          <input
            id="viewing-distance"
            type="number"
            inputMode="numeric"
            min={MIN_VIEWING_DISTANCE_CM}
            max={MAX_VIEWING_DISTANCE_CM}
            step="1"
            value={draft}
            onChange={handleDistanceChange}
            className="w-24 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm"
          />
          <span className="text-base-content/50">cm</span>
        </span>
        <span className="text-xs text-base-content/40">
          From the patient&apos;s eye to the screen. 100 cm is standard.
        </span>
      </label>
      {!valid && (
        <p className="text-xs text-error">
          Enter a distance between {MIN_VIEWING_DISTANCE_CM} and {MAX_VIEWING_DISTANCE_CM} cm.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ["Outer 35° ring", cm(p.outerDiameter), "Diameter on the screen"],
          ["Projected image height", cm(p.imageHeight), "Top to bottom of the picture"],
          ["Projected image width", cm(p.imageWidth16x9), `16:9 projector (16:10: ${cm(p.imageWidth16x10)})`],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
            <p className="text-xs text-base-content/50">{label}</p>
            <p className="text-lg font-medium tabular-nums">{value}</p>
            <p className="text-xs text-base-content/40">{sub}</p>
          </div>
        ))}
      </div>

      <ol className="flex flex-col gap-2 text-sm text-base-content/80 list-decimal pl-5">
        <li>
          Seat the patient so their eye is <b>{distance} cm</b> from the screen, level with
          the centre of the projected picture.
        </li>
        <li>
          Start a test and press <b>F11</b> on the canvas so it fills the whole projector
          picture. The grid sizes itself to the window, so do this before measuring.
        </li>
        <li>
          Adjust the projector&apos;s zoom and distance until the outer 35° ring measures{" "}
          <b>{cm(p.outerDiameter)}</b> across. That makes the whole picture about{" "}
          {cm(p.imageHeight)} tall.
        </li>
        <li>
          Measure the ring both horizontally and vertically. If the two differ, fix the
          projector&apos;s keystone or tilt until they match.
        </li>
        <li>
          Check: the 10° ring should measure about <b>{cm(ten.canvasDiameter)}</b> across.
        </li>
        <li>
          Make sure the centre cross sits at the patient&apos;s eye level, then don&apos;t
          move the projector, screen or chair between patients.
        </li>
      </ol>

      <details className="text-xs text-base-content/60">
        <summary className="cursor-pointer text-base-content/70">Size of every ring</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="text-left tabular-nums">
            <thead className="text-base-content/50">
              <tr>
                <th className="pr-6 py-1 font-medium">Ring</th>
                <th className="pr-6 py-1 font-medium">PeriVue projection</th>
                <th className="py-1 font-medium">Printed tangent screen</th>
              </tr>
            </thead>
            <tbody>
              {p.rings.map((r) => (
                <tr key={r.deg} className="border-t border-white/5">
                  <td className="pr-6 py-1">{r.deg}°</td>
                  <td className="pr-6 py-1">{cm(r.canvasDiameter)}</td>
                  <td className="py-1">{cm(r.tangentDiameter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          PeriVue spaces its rings evenly, while a printed tangent screen spaces them by the
          tangent of the angle. With the outer ring matched, the inner rings come out slightly
          larger than on a printed screen.
        </p>
      </details>
    </div>
  );
}

// ── Voice instructions ────────────────────────────────────────────────────────
// Spoken prompts during the test (browser text-to-speech). Same saved settings
// as the voice controls in the test screen's gear modal.
function VoiceInstructionsCard() {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-400/10 bg-white/5 p-5">
      <div className="flex items-center gap-3">
        <span className="text-base-content/50">
          <RecordVoiceOverIcon />
        </span>
        <div>
          <p className="text-sm font-medium">Voice instructions</p>
          <p className="text-xs text-base-content/50">
            Reads the instructions aloud in English and Filipino, and speaks short English
            prompts during the test. Silent while dots are on screen.
          </p>
        </div>
      </div>
      <VoiceSettings />
    </div>
  );
}

function Settings() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-base-content/50">Settings for this browser on this device</p>
      </div>
      <TestDisplaySettings />
      <VoiceInstructionsCard />
      <ProjectorSetup />
      <CameraSettings />
    </div>
  );
}

export default Settings;
