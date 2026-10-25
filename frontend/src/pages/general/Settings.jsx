import React, { useCallback, useEffect, useRef, useState } from "react";
import VideocamIcon from "@mui/icons-material/Videocam";
import { BROWSER_TRACKING, CAMERA_STORAGE_KEY } from "../../tracking/browserTracker";

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

function Settings() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-base-content/50">Settings for this browser on this device</p>
      </div>
      <CameraSettings />
    </div>
  );
}

export default Settings;
