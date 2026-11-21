import cv2
import mediapipe as mp
import requests
import argparse
import math
import time
import sys
import os
import threading

# ── Args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Perivue eye tracking runner")
parser.add_argument(
    "--run_id", required=True, help="TestRun UUID to post fixation status to"
)
parser.add_argument(
    "--camera",
    type=int,
    default=None,
    help="Camera index (default: auto-probe 0-3 for the first non-black feed)",
)
parser.add_argument(
    "--api", default="http://localhost:8000", help="Django API base URL"
)
parser.add_argument(
    "--eye",
    choices=["OD", "OS", "OU"],
    default="OU",
    help=(
        "Eye under test. OD = right eye tested (patient covers the LEFT eye), "
        "OS = left eye tested (patient covers the RIGHT eye), OU = both open. "
        "Only the tested eye is tracked: MediaPipe still emits a full, made-up "
        "mesh for an eye hidden behind a hand, and averaging that in drags the "
        "gaze estimate away from where the patient is actually looking."
    ),
)
args = parser.parse_args()

API_URL = f"{args.api}/api/visual-tests/runs/{args.run_id}/fixation/"
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mediapipe.log")
# Some cameras (iPhone Continuity Camera, some webcam drivers) deliver
# pre-mirrored frames, which inverts left/right. Press F in the preview to
# flip; the choice persists here for future runs.
FLIP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".mediapipe_flip")


def load_flip():
    try:
        with open(FLIP_FILE) as f:
            return f.read().strip() != "0"
    except Exception:
        return True  # default: mirror the frame (normal webcam)


def save_flip(value):
    try:
        with open(FLIP_FILE, "w") as f:
            f.write("1" if value else "0")
    except Exception:
        pass


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line)
    try:
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


EYE_LABEL = {
    "OD": "OD - right eye tested (patient covers LEFT)",
    "OS": "OS - left eye tested (patient covers RIGHT)",
    "OU": "OU - both eyes tested",
}[args.eye]

log(f"Starting eye tracker for run: {args.run_id}")
log(f"Tracking: {EYE_LABEL}")
log(f"Posting to: {API_URL}")
print("Press Ctrl+C to stop.\n")

# ── MediaPipe setup ───────────────────────────────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# One eye's landmark indices. MediaPipe's own left/right naming refers to its
# canonical model, and the frame may additionally be mirrored (see FLIP_FILE),
# so neither is a reliable way to tell which eye is which. The two groups are
# kept side-agnostic here and matched to the patient's real left/right per
# frame from their position in the image — see split_eyes().
EYE_A = {"inner": 33, "outer": 133, "upper": 159, "lower": 145, "iris": 468}
EYE_B = {"inner": 362, "outer": 263, "upper": 386, "lower": 374, "iris": 473}


def split_eyes(landmarks, flipped):
    """
    Returns (patient_right_eye, patient_left_eye) specs for this frame.

    A raw camera frame shows the patient facing the lens, so their right eye
    falls on the image's left half; mirroring the frame swaps the two.
    """
    a_x = landmarks[EYE_A["inner"]].x + landmarks[EYE_A["outer"]].x
    b_x = landmarks[EYE_B["inner"]].x + landmarks[EYE_B["outer"]].x
    image_left, image_right = (EYE_A, EYE_B) if a_x <= b_x else (EYE_B, EYE_A)
    return (image_right, image_left) if flipped else (image_left, image_right)


def eyes_under_test(landmarks, flipped):
    """
    Returns (tracked, ignored) eye specs for this frame.

    In OD/OS the patient occludes the other eye with a hand or an occluder.
    MediaPipe still reports a complete, plausible-looking mesh for the hidden
    eye, so its iris ratios are fiction — including them in the average is what
    pushed the gaze marker to the edge of the frame. Everything downstream
    (ratios, blink, occlusion, baseline) sees only the tracked list, so the
    covered eye cannot influence the result at all.
    """
    right, left = split_eyes(landmarks, flipped)
    if args.eye == "OD":
        return [right], [left]
    if args.eye == "OS":
        return [left], [right]
    return [right, left], []


# ── Iris ratio helpers ────────────────────────────────────────────────────────
def iris_axis_coords(landmarks, spec, img_w, img_h):
    """
    Iris position in the eye's own frame — returns (along, perp, span):
      along - 0..1 along the corner-to-corner axis, 0 at the corner nearest
              the image's left edge
      perp  - pixels below that axis (positive = lower in the image)
      span  - corner-to-corner distance, in pixels

    Measuring along the eye's own axis instead of raw x/y removes head tilt
    from the signal. The old version divided by the corners' x-distance, which
    shrinks as the head tilts; at 20 degrees of roll that added ~0.018 of false
    sideways glance, small next to the +/-0.15 fixation window but free to
    remove here since the projection costs the same to compute.
    """
    a = landmarks[spec["inner"]]
    b = landmarks[spec["outer"]]
    iris = landmarks[spec["iris"]]

    # Point the axis toward the image's right so both eyes agree on sign
    origin, far = (a, b) if a.x <= b.x else (b, a)
    ax = (far.x - origin.x) * img_w
    ay = (far.y - origin.y) * img_h
    span_sq = ax * ax + ay * ay
    if span_sq < 1:
        return None

    px = (iris.x - origin.x) * img_w
    py = (iris.y - origin.y) * img_h
    span = math.sqrt(span_sq)
    return (px * ax + py * ay) / span_sq, (py * ax - px * ay) / span, span


def get_iris_ratio(landmarks, spec, img_w, img_h):
    coords = iris_axis_coords(landmarks, spec, img_w, img_h)
    return 0.5 if coords is None else coords[0]


# Vertical iris movement is only a few % of eye width — scale it up so the
# usable range maps to roughly 0-1 like the horizontal ratio
V_SCALE = 5.0
# Second downward cue: the upper lid follows the iris when looking down, so
# lid droop below the person's own baseline pushes the signal down (and
# wide-open lids when looking up push it up). Downward iris travel alone is
# small and partly occluded by the lid, which is why the gaze dot barely
# followed it.
OPENNESS_GAIN = 1.2
# Anatomy differs per person (natural lid openness, iris height vs the eye
# corners), so absolute ratios are meaningless — the first ~1s of face frames
# defines this person's "center" and everything is reported relative to it.
BASELINE_FRAMES = 30
# That one-shot baseline is only true for the pose it was captured in. The
# patient settles into the chair, turns their head a few degrees, raises a hand
# to occlude an eye — and every later reading carries a standing offset, so the
# marker parks off to one side while they are looking straight at the cross.
# The center therefore creeps toward the current reading, but ONLY while that
# reading is inside the fixation window: drift that already counts as
# acceptable fixation gets absorbed, whereas a real look-away falls outside the
# window, is reported as a fixation loss, and is never learned as "center".
# Per frame, ~4s time constant at 30fps. Fast enough that the clinician sees
# the marker settle back to the middle, far too slow to chase a saccade.
BASELINE_ADAPT = 0.008


def get_iris_ratio_vertical(landmarks, spec, img_w, img_h):
    """
    Vertical gaze signal, ~0.5 = center, larger = looking further down.
    Combines two cues:
      - iris position relative to the eye-corner line (corners don't move
        with gaze, unlike the eyelids the old ratio measured against)
      - lid openness relative to nominal (lids droop when looking down,
        widen when looking up)
    """
    coords = iris_axis_coords(landmarks, spec, img_w, img_h)
    if coords is None:
        return 0.5
    _, perp, span = coords

    iris_term = V_SCALE * perp / span
    lid_term = -OPENNESS_GAIN * eye_openness(landmarks, spec, img_w, img_h)

    # Raw signal — offset is arbitrary per person; the startup baseline
    # re-centers it to 0.5
    return iris_term + lid_term


def eye_openness(landmarks, spec, img_w, img_h):
    """Lid gap over corner-to-corner distance — near 0 when the eye is shut."""
    inner = landmarks[spec["inner"]]
    outer = landmarks[spec["outer"]]
    upper = landmarks[spec["upper"]]
    lower = landmarks[spec["lower"]]

    # Both distances are true 2D lengths, so a tilted head neither inflates the
    # ratio nor makes an open eye look like a blink
    span = math.hypot((outer.x - inner.x) * img_w, (outer.y - inner.y) * img_h)
    if span < 1:
        return 0.0
    return math.hypot((lower.x - upper.x) * img_w, (lower.y - upper.y) * img_h) / span


def is_blinking(landmarks, specs, img_w, img_h):
    """Only the tested eye counts — the occluded one reads shut permanently."""
    return any(
        eye_openness(landmarks, spec, img_w, img_h) < BLINK_OPENNESS for spec in specs
    )


def get_ratios(landmarks, specs, img_w, img_h):
    """Mean horizontal/vertical iris ratio across the tested eye(s)."""
    hs = [get_iris_ratio(landmarks, spec, img_w, img_h) for spec in specs]
    vs = [get_iris_ratio_vertical(landmarks, spec, img_w, img_h) for spec in specs]
    return sum(hs) / len(hs), sum(vs) / len(vs)


# ── Occlusion guard ───────────────────────────────────────────────────────────
# Every geometric check still passes on an eye hidden behind a hand, because
# MediaPipe invents landmarks for it. What does not survive occlusion is the
# picture itself: an open eye is high-contrast (dark iris against white sclera),
# a palm is close to flat. Judged against this person's own baseline contrast
# rather than an absolute number, that holds up across skin tones and lighting.
# Used only to freeze tracking, never to claim fixation.
OCCLUSION_TRIP_RATIO = 0.45
OCCLUSION_CLEAR_RATIO = 0.60
OCCLUSION_TRIP_FRAMES = 3
# Below this the baseline is too flat to tell an eye from skin at all (very dim
# room, heavy glare on glasses) — the guard disables itself rather than guess.
OCCLUSION_MIN_BASELINE = 8.0


def eye_bbox(landmarks, spec, img_w, img_h):
    """
    Pixel box around one eye, or None if it lands off-frame. The lid gap is too
    thin a strip to be stable, so the box is ~60% of the eye width tall, which
    always contains the iris and sclera.
    """
    x0 = int(min(landmarks[spec["inner"]].x, landmarks[spec["outer"]].x) * img_w)
    x1 = int(max(landmarks[spec["inner"]].x, landmarks[spec["outer"]].x) * img_w)
    cy = ((landmarks[spec["upper"]].y + landmarks[spec["lower"]].y) / 2) * img_h
    half = max(4.0, (x1 - x0) * 0.30)

    x0, x1 = max(0, x0), min(img_w, x1)
    y0, y1 = max(0, int(cy - half)), min(img_h, int(cy + half))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    return x0, y0, x1, y1


def eye_contrast(gray, landmarks, spec, img_w, img_h):
    """Std-dev of the eye ROI. High for a visible eye, low for skin/hand."""
    box = eye_bbox(landmarks, spec, img_w, img_h)
    if box is None:
        return None
    x0, y0, x1, y1 = box
    return float(gray[y0:y1, x0:x1].std())


# ── Fixation detection (uncalibrated fallback) ────────────────────────────────
# How far the baseline-adjusted ratio may stray and still count as fixating.
FIX_HALF_H = 0.15
FIX_HALF_V = 0.20


def is_fixating(avg_h, avg_v):
    """Baseline-adjusted averages: 0.5 = this person's center gaze."""
    return (abs(avg_h - 0.5) <= FIX_HALF_H) and (abs(avg_v - 0.5) <= FIX_HALF_V)


# ── Gaze estimation (uncalibrated fallback) ───────────────────────────────────
# Half-width of the ratio range that spans the screen. This is deliberately
# NOT the fixation window: mapping the window itself onto the full screen made
# the marker hit the edge of the frame while the patient was still well inside
# the tolerance, so every small drift looked like a wild sideways glance.
GAZE_HALF_H = 0.25
GAZE_HALF_V = GAZE_HALF_H * (FIX_HALF_V / FIX_HALF_H)


def estimate_gaze(avg_h, avg_v):
    """
    Returns normalized screen position (0-1, 0-1) based on iris position.
    0.5, 0.5 = center of screen (fixation cross).
    """
    screen_x = 0.5 + (avg_h - 0.5) / (2 * GAZE_HALF_H)
    screen_y = 0.5 + (avg_v - 0.5) / (2 * GAZE_HALF_V)
    return max(0.0, min(1.0, screen_x)), max(0.0, min(1.0, screen_y))


# Mirrors FIXATION_WINDOW in visual_tests/views.py — once a calibration exists
# the server decides fixation from screen coordinates, so the preview has to
# draw the server's window rather than this file's. Display only; keep in sync.
SERVER_FIXATION_WINDOW = 0.12


# ── POST to Django ────────────────────────────────────────────────────────────
# Single-flight: skip a tick entirely while a POST is still pending — the
# Supabase DB can be slow, and stacking requests caused broken-pipe spam.
_post_pending = threading.Event()
_server_lock = threading.Lock()
_server_state = {"is_fixating": None, "gaze_x": None, "gaze_y": None, "calibrated": False}


def _post_fixation_worker(payload):
    try:
        resp = requests.post(API_URL, json=payload, timeout=5)
        if resp.ok:
            data = resp.json()
            with _server_lock:
                _server_state["is_fixating"] = data.get("is_fixating")
                _server_state["gaze_x"] = data.get("gaze_x")
                _server_state["gaze_y"] = data.get("gaze_y")
                _server_state["calibrated"] = bool(data.get("calibrated"))
    except Exception as e:
        log(f"[warn] Failed to POST fixation: {e}")
    finally:
        _post_pending.clear()


def post_fixation(payload):
    if _post_pending.is_set():
        return False  # previous POST still in flight — skip this tick
    _post_pending.set()
    threading.Thread(target=_post_fixation_worker, args=(payload,), daemon=True).start()
    return True


def get_server_state():
    with _server_lock:
        return dict(_server_state)


# ── Camera selection ──────────────────────────────────────────────────────────
BLACK_FRAME_MEAN = 5.0


def open_camera(forced_index):
    """
    Open the camera. With --camera, use that index. Otherwise probe 0-3 and
    pick the first index whose frames are not black — an inactive iPhone
    Continuity Camera often occupies index 0 and streams black frames.
    """
    if forced_index is not None:
        cap = cv2.VideoCapture(forced_index)
        if not cap.isOpened():
            log(f"ERROR: Could not open camera {forced_index}")
            sys.exit(1)
        log(f"Camera index: {forced_index} (forced)")
        return cap

    first_openable = None
    for idx in range(4):
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            cap.release()
            continue
        if first_openable is None:
            first_openable = idx

        bright_frames = 0
        for _ in range(5):
            success, frame = cap.read()
            if success and frame is not None and frame.mean() > BLACK_FRAME_MEAN:
                bright_frames += 1
        if bright_frames >= 2:
            log(f"Camera index: {idx} (auto-probed, live feed)")
            return cap
        log(f"Camera {idx}: opened but frames are black — skipping")
        cap.release()

    if first_openable is not None:
        log(
            f"WARNING: no camera with a live feed found — falling back to "
            f"index {first_openable}. If the feed stays black, check macOS "
            f"camera permission for the app hosting Django."
        )
        cap = cv2.VideoCapture(first_openable)
        if cap.isOpened():
            return cap

    log("ERROR: Could not open any camera (tried indices 0-3)")
    sys.exit(1)


# ── Main loop ─────────────────────────────────────────────────────────────────
cap = open_camera(args.camera)

BAD_THRESHOLD_SECS = 0.5
# Iris landmarks jitter frame-to-frame even when the eye is still — keep the
# EMA heavy (low alpha) so the streamed ratios are stable enough to calibrate
# against; the added lag is fine since dots are stared at for ~1s.
EMA_ALPHA = 0.12
# Below this lid-gap/eye-width ratio the eye counts as closed and the frame
# is skipped (last good ratios/gaze held). Kept low on purpose: looking DOWN
# also droops the lids (~0.10-0.15 openness), and that must keep tracking —
# only a near-full closure (a real blink, ~0.03-0.06) should freeze.
BLINK_OPENNESS = 0.10

last_good_time = time.time()
currently_fixating = True
last_shown = None
post_interval = 0.2
last_post_time = 0
gaze_x = 0.5
gaze_y = 0.5
ema_h = None
ema_v = None
face_detected = False
# Per-person center reference — median of the first BASELINE_FRAMES clean
# (face visible, not blinking) frames. Nothing is streamed until it exists.
baseline_h = None
baseline_v = None
baseline_contrast = None
baseline_samples = []
occluded = False
occlusion_frames = 0
flip_enabled = load_flip()
log(f"Horizontal flip: {'on' if flip_enabled else 'off'} (press F in preview to toggle)")
black_feed_warned = False
last_black_check = 0
feed_is_black = False

with mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
) as face_mesh:

    print("Eye tracker running. Waiting for face...\n")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("Failed to read frame.")
            continue

        if flip_enabled:
            frame = cv2.flip(frame, 1)
        img_h, img_w = frame.shape[:2]

        now = time.time()

        # Warn if the feed is black (usually a macOS camera-permission issue)
        if now - last_black_check >= 2.0:
            last_black_check = now
            feed_is_black = frame.mean() <= BLACK_FRAME_MEAN
            if feed_is_black and not black_feed_warned:
                black_feed_warned = True
                log(
                    "WARNING: camera feed is black — grant camera permission "
                    "to the app hosting Django (System Settings → Privacy)."
                )

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)

        blinking = False
        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            specs, ignored_specs = eyes_under_test(landmarks, flip_enabled)
            blinking = is_blinking(landmarks, specs, img_w, img_h)

            # Is the tested eye actually visible, or has the occluder drifted
            # over it? Take the worst eye so one covered eye trips OU too.
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            measured = [
                c
                for c in (
                    eye_contrast(gray, landmarks, spec, img_w, img_h)
                    for spec in specs
                )
                if c is not None
            ]
            frame_contrast = min(measured) if measured else None

            if (
                baseline_contrast is not None
                and baseline_contrast >= OCCLUSION_MIN_BASELINE
                and frame_contrast is not None
            ):
                # Hysteresis + a few frames to trip: a passing hand shadow or a
                # single bad landmark frame must not blank the tracker
                if occluded:
                    if frame_contrast > baseline_contrast * OCCLUSION_CLEAR_RATIO:
                        occluded = False
                        occlusion_frames = 0
                        log("Tested eye visible again")
                elif frame_contrast < baseline_contrast * OCCLUSION_TRIP_RATIO:
                    occlusion_frames += 1
                    if occlusion_frames >= OCCLUSION_TRIP_FRAMES:
                        occluded = True
                        log(
                            "[warn] Tested eye looks covered — holding gaze. "
                            "The occluder belongs over the OTHER eye."
                        )
                else:
                    occlusion_frames = 0

            if blinking or occluded:
                # Eye closed or hidden — the ratios are meaningless. Hold the
                # last gaze so the marker doesn't jump, but report no reading
                # (raw_h/raw_v null) so calibration never samples a guess. A
                # closure longer than BAD_THRESHOLD_SECS still goes LOST
                # because last_good_time isn't refreshed.
                face_detected = ema_h is not None and not occluded
                if now - last_good_time >= BAD_THRESHOLD_SECS:
                    currently_fixating = False
            else:
                raw_h_frame, raw_v_frame = get_ratios(landmarks, specs, img_w, img_h)

                if baseline_h is None:
                    # Still learning this person's center — collect, don't stream
                    baseline_samples.append(
                        (raw_h_frame, raw_v_frame, frame_contrast)
                    )
                    if len(baseline_samples) >= BASELINE_FRAMES:
                        hs = sorted(s[0] for s in baseline_samples)
                        vs = sorted(s[1] for s in baseline_samples)
                        cs = sorted(s[2] for s in baseline_samples if s[2] is not None)
                        baseline_h = hs[len(hs) // 2]
                        baseline_v = vs[len(vs) // 2]
                        baseline_contrast = cs[len(cs) // 2] if cs else None
                        log(
                            f"Center baseline captured: "
                            f"h={baseline_h:.3f} v={baseline_v:.3f} "
                            f"contrast={baseline_contrast if baseline_contrast is None else round(baseline_contrast, 1)}"
                        )
                        if (
                            baseline_contrast is None
                            or baseline_contrast < OCCLUSION_MIN_BASELINE
                        ):
                            log(
                                "[warn] Eye contrast too low to detect occlusion "
                                "— guard disabled. Check lighting, glasses "
                                "glare, and that the tested eye was uncovered."
                            )
                    face_detected = False
                    last_good_time = now
                else:
                    avg_h = 0.5 + (raw_h_frame - baseline_h)
                    avg_v = 0.5 + (raw_v_frame - baseline_v)
                    fixating = is_fixating(avg_h, avg_v)

                    # Creep the center toward where they are actually looking —
                    # see BASELINE_ADAPT. Only inside the window, so a genuine
                    # look-away can never become "center".
                    #
                    # Frozen once a calibration exists. The saved mapping is
                    # expressed in these baseline-relative ratios, so drifting
                    # the baseline underneath it moves the calibrated origin
                    # too and the calibration decays as the run goes on.
                    if fixating and not get_server_state()["calibrated"]:
                        baseline_h += BASELINE_ADAPT * (avg_h - 0.5)
                        baseline_v += BASELINE_ADAPT * (avg_v - 0.5)

                    ema_h = avg_h if ema_h is None else EMA_ALPHA * avg_h + (1 - EMA_ALPHA) * ema_h
                    ema_v = avg_v if ema_v is None else EMA_ALPHA * avg_v + (1 - EMA_ALPHA) * ema_v
                    gaze_x, gaze_y = estimate_gaze(ema_h, ema_v)
                    face_detected = True

                    if fixating:
                        last_good_time = now
                        currently_fixating = True
                    else:
                        if now - last_good_time >= BAD_THRESHOLD_SECS:
                            currently_fixating = False
        else:
            face_detected = False
            if now - last_good_time >= BAD_THRESHOLD_SECS:
                currently_fixating = False
            gaze_x, gaze_y = 0.5, 0.5

        if now - last_post_time >= post_interval:
            posted = post_fixation(
                {
                    "is_fixating": currently_fixating,
                    "gaze_x": round(gaze_x, 4),
                    "gaze_y": round(gaze_y, 4),
                    # EMA-smoothed iris ratios — the canvas samples these
                    # during calibration; null when no face is detected
                    "raw_h": round(ema_h, 4) if face_detected and ema_h is not None else None,
                    "raw_v": round(ema_v, 4) if face_detected and ema_v is not None else None,
                    # Lets the canvas show camera health before the test starts
                    "camera_ok": not feed_is_black,
                }
            )
            if posted:
                last_post_time = now

        # ── Preview window ────────────────────────────────────────────────────
        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_contours_style(),
                )
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_IRISES,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_iris_connections_style(),
                )

            # Grey out the untested eye. It contributes nothing to the gaze,
            # blink or occlusion checks, and painting over it says so at a
            # glance — if the block ever lands on the eye the patient is
            # actually testing with, the eye setting or the [F] flip is wrong.
            for spec in ignored_specs:
                box = eye_bbox(landmarks, spec, img_w, img_h)
                if box is None:
                    continue
                x0, y0, x1, y1 = box
                pad = (x1 - x0) // 4
                x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
                x1, y1 = min(img_w, x1 + pad), min(img_h, y1 + pad)
                patch = frame[y0:y1, x0:x1]
                patch[:] = (patch * 0.25).astype(patch.dtype)
                cv2.rectangle(frame, (x0, y0), (x1, y1), (120, 120, 120), 1)
                cv2.line(frame, (x0, y0), (x1, y1), (120, 120, 120), 1)
                cv2.line(frame, (x0, y1), (x1, y0), (120, 120, 120), 1)
                cv2.putText(
                    frame,
                    "not used",
                    (x0, max(12, y0 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (150, 150, 150),
                    1,
                )

            # Ring the eye(s) actually driving the gaze, so a wrong eye choice
            # or a mirrored camera is obvious at a glance instead of showing up
            # as inexplicably bad tracking
            for spec in specs:
                ex = int(landmarks[spec["iris"]].x * img_w)
                ey = int(landmarks[spec["iris"]].y * img_h)
                cv2.circle(
                    frame, (ex, ey), 22, (0, 0, 255) if occluded else (0, 255, 0), 2
                )

        # When the run is calibrated the server overrides the fixation
        # verdict — display what the server decided, not the local windows
        srv = get_server_state()
        display_fixating = (
            srv["is_fixating"] if srv["is_fixating"] is not None else currently_fixating
        )
        tag = "[calibrated]" if srv["calibrated"] else "[uncalibrated]"
        if srv["calibrated"] and srv["gaze_x"] is not None and srv["gaze_y"] is not None:
            disp_gx, disp_gy = srv["gaze_x"], srv["gaze_y"]
        else:
            disp_gx, disp_gy = gaze_x, gaze_y

        if display_fixating != last_shown:
            print(f"  Fixation: {'OK' if display_fixating else 'LOST'} {tag}")
            last_shown = display_fixating

        # Fixation tolerance, drawn in the same normalized space as the marker,
        # so "is the patient still looking straight ahead" is a question you can
        # answer by looking rather than by reading two decimals
        if srv["calibrated"]:
            box_h = box_v = SERVER_FIXATION_WINDOW
        else:
            box_h = FIX_HALF_H / (2 * GAZE_HALF_H)
            box_v = FIX_HALF_V / (2 * GAZE_HALF_V)
        cv2.rectangle(
            frame,
            (int((0.5 - box_h) * img_w), int((0.5 - box_v) * img_h)),
            (int((0.5 + box_h) * img_w), int((0.5 + box_v) * img_h)),
            (90, 90, 90),
            1,
        )

        gaze_px = int(disp_gx * img_w)
        gaze_py = int(disp_gy * img_h)
        cv2.circle(frame, (gaze_px, gaze_py), 12, (0, 255, 255), 2)
        cv2.circle(frame, (gaze_px, gaze_py), 4, (0, 255, 255), -1)

        status_text = f"FIXATION: {'OK' if display_fixating else 'LOST'} {tag}"
        status_color = (0, 255, 0) if display_fixating else (0, 0, 255)
        cv2.putText(
            frame, status_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2
        )
        cv2.putText(
            frame,
            f"Gaze: ({disp_gx:.2f}, {disp_gy:.2f})" + ("  BLINK" if blinking else ""),
            (20, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 200, 255) if blinking else (200, 200, 200),
            1,
        )
        # Offset from this person's learned center, in raw ratio units — the
        # number to look at when the marker sits off-center while the patient
        # insists they are looking straight ahead
        dev_text = ""
        if ema_h is not None and ema_v is not None:
            dev_text = f"   offset from center: h={ema_h - 0.5:+.3f} v={ema_v - 0.5:+.3f}"
        cv2.putText(
            frame,
            f"Tracking: {EYE_LABEL}{dev_text}",
            (20, 110),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (200, 200, 200),
            1,
        )
        if feed_is_black:
            cv2.putText(
                frame,
                "CAMERA FEED IS BLACK - check macOS camera permission",
                (20, 150),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2,
            )
        elif occluded:
            cv2.putText(
                frame,
                "TESTED EYE IS COVERED - the occluder goes over the OTHER eye",
                (20, 150),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2,
            )
        elif baseline_h is None:
            cv2.putText(
                frame,
                f"LEARNING CENTER BASELINE - cover the untested eye NOW and "
                f"look at the screen center ({len(baseline_samples)}/{BASELINE_FRAMES})",
                (20, 150),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 200, 255),
                2,
            )
        cv2.putText(
            frame,
            f"Run: {args.run_id[:8]}...   [F] flip left/right   "
            f"[R] re-learn baseline   [Q] quit",
            (20, img_h - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (200, 200, 200),
            1,
        )

        cv2.imshow("PeriVue Eye Tracker", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("f"):
            flip_enabled = not flip_enabled
            save_flip(flip_enabled)
            # Horizontal geometry just changed — relearn this person's center.
            # It also swaps which eye is which, so the tested eye may move.
            baseline_h = None
            baseline_v = None
            baseline_contrast = None
            baseline_samples = []
            occluded = False
            occlusion_frames = 0
            ema_h = None
            ema_v = None
            log(
                f"Horizontal flip toggled {'on' if flip_enabled else 'off'} — "
                f"re-learning baseline. If a calibration was saved for this "
                f"run, restart the run and calibrate again."
            )
        if key == ord("r"):
            # The baseline is only valid for the pose it was captured in — if
            # the patient covered their eye after it was taken, or shifted in
            # the chair, this re-anchors center without restarting the run
            baseline_h = None
            baseline_v = None
            baseline_contrast = None
            baseline_samples = []
            occluded = False
            occlusion_frames = 0
            ema_h = None
            ema_v = None
            log("Re-learning center baseline (requested with [R])")

cap.release()
cv2.destroyAllWindows()
print("Eye tracker stopped.")
