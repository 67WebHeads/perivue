import cv2
import mediapipe as mp
import requests
import argparse
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
args = parser.parse_args()

API_URL = f"{args.api}/api/visual-tests/runs/{args.run_id}/fixation/"
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mediapipe.log")


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line)
    try:
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


log(f"Starting eye tracker for run: {args.run_id}")
log(f"Posting to: {API_URL}")
print("Press Ctrl+C to stop.\n")

# ── MediaPipe setup ───────────────────────────────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

LEFT_INNER = 33
LEFT_OUTER = 133
LEFT_IRIS = 468
RIGHT_INNER = 362
RIGHT_OUTER = 263
RIGHT_IRIS = 473


# ── Iris ratio helpers ────────────────────────────────────────────────────────
def get_iris_ratio(landmarks, inner_idx, outer_idx, iris_idx, img_w, img_h):
    inner = landmarks[inner_idx]
    outer = landmarks[outer_idx]
    iris = landmarks[iris_idx]

    inner_x = inner.x * img_w
    outer_x = outer.x * img_w
    iris_x = iris.x * img_w

    eye_width = abs(outer_x - inner_x)
    if eye_width < 1:
        return 0.5

    return (iris_x - min(inner_x, outer_x)) / eye_width


def get_iris_ratio_vertical(landmarks, upper_idx, lower_idx, iris_idx, img_w, img_h):
    upper = landmarks[upper_idx]
    lower = landmarks[lower_idx]
    iris = landmarks[iris_idx]

    upper_y = upper.y * img_h
    lower_y = lower.y * img_h
    iris_y = iris.y * img_h

    eye_height = abs(lower_y - upper_y)
    if eye_height < 1:
        return 0.5

    return (iris_y - min(upper_y, lower_y)) / eye_height


def get_ratios(landmarks, img_w, img_h):
    """Per-eye horizontal/vertical iris ratios for one frame."""
    left_h = get_iris_ratio(landmarks, LEFT_INNER, LEFT_OUTER, LEFT_IRIS, img_w, img_h)
    right_h = get_iris_ratio(
        landmarks, RIGHT_INNER, RIGHT_OUTER, RIGHT_IRIS, img_w, img_h
    )
    left_v = get_iris_ratio_vertical(landmarks, 159, 145, LEFT_IRIS, img_w, img_h)
    right_v = get_iris_ratio_vertical(landmarks, 386, 374, RIGHT_IRIS, img_w, img_h)
    return left_h, right_h, left_v, right_v


# ── Fixation detection (uncalibrated fallback) ────────────────────────────────
def is_fixating(left_h, right_h, left_v, right_v):
    h_ok = (0.35 <= left_h <= 0.65) and (0.35 <= right_h <= 0.65)
    v_ok = (0.30 <= left_v <= 0.70) and (0.30 <= right_v <= 0.70)
    return h_ok and v_ok


# ── Gaze estimation (uncalibrated fallback) ───────────────────────────────────
def estimate_gaze(avg_h, avg_v):
    """
    Returns normalized screen position (0-1, 0-1) based on iris position.
    0.5, 0.5 = center of screen (fixation cross).
    Maps iris ratio range 0.35-0.65 (H) and 0.30-0.70 (V) to full screen 0-1.
    """
    screen_x = (avg_h - 0.35) / (0.65 - 0.35)
    screen_y = (avg_v - 0.30) / (0.70 - 0.30)
    return max(0.0, min(1.0, screen_x)), max(0.0, min(1.0, screen_y))


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
EMA_ALPHA = 0.3

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

        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            left_h, right_h, left_v, right_v = get_ratios(landmarks, img_w, img_h)
            fixating = is_fixating(left_h, right_h, left_v, right_v)

            avg_h = (left_h + right_h) / 2
            avg_v = (left_v + right_v) / 2
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
            f"Gaze: ({disp_gx:.2f}, {disp_gy:.2f})",
            (20, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (200, 200, 200),
            1,
        )
        if feed_is_black:
            cv2.putText(
                frame,
                "CAMERA FEED IS BLACK - check macOS camera permission",
                (20, 120),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2,
            )
        cv2.putText(
            frame,
            f"Run: {args.run_id[:8]}...",
            (20, img_h - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (200, 200, 200),
            1,
        )

        cv2.imshow("PeriVue Eye Tracker", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

cap.release()
cv2.destroyAllWindows()
print("Eye tracker stopped.")
