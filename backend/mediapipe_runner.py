import cv2
import mediapipe as mp
import requests
import argparse
import time
import sys
import threading

# ── Args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Perivue eye tracking runner")
parser.add_argument("--run_id", required=True, help="TestRun UUID to post fixation status to")
parser.add_argument("--camera", type=int, default=0, help="Camera index (default 0)")
parser.add_argument("--api", default="http://localhost:8000", help="Django API base URL")
args = parser.parse_args()

API_URL = f"{args.api}/api/visual-tests/runs/{args.run_id}/fixation/"

print(f"Starting eye tracker for run: {args.run_id}")
print(f"Posting to: {API_URL}")
print(f"Camera index: {args.camera}")
print("Press Ctrl+C to stop.\n")

# ── MediaPipe setup ───────────────────────────────────────────────────────────
mp_face_mesh       = mp.solutions.face_mesh
mp_drawing         = mp.solutions.drawing_utils
mp_drawing_styles  = mp.solutions.drawing_styles

# MediaPipe Face Mesh landmark indices
# Left eye corners:  33 (inner), 133 (outer)
# Left iris center:  468
# Right eye corners: 362 (inner), 263 (outer)
# Right iris center: 473

LEFT_INNER  = 33
LEFT_OUTER  = 133
LEFT_IRIS   = 468
RIGHT_INNER = 362
RIGHT_OUTER = 263
RIGHT_IRIS  = 473

# ── Fixation detection ────────────────────────────────────────────────────────
def get_iris_ratio(landmarks, inner_idx, outer_idx, iris_idx, img_w, img_h):
    """
    Returns how centered the iris is horizontally between the eye corners.
    0.0 = fully left, 1.0 = fully right, 0.5 = perfectly centered.
    """
    inner = landmarks[inner_idx]
    outer = landmarks[outer_idx]
    iris  = landmarks[iris_idx]

    inner_x = inner.x * img_w
    outer_x = outer.x * img_w
    iris_x  = iris.x  * img_w

    eye_width = abs(outer_x - inner_x)
    if eye_width < 1:
        return 0.5  # fallback

    # Normalize iris position within the eye
    ratio = (iris_x - min(inner_x, outer_x)) / eye_width
    return ratio


def get_iris_ratio_vertical(landmarks, upper_idx, lower_idx, iris_idx, img_w, img_h):
    """
    Returns how centered the iris is vertically between upper/lower eyelid.
    0.0 = fully up, 1.0 = fully down, 0.5 = centered.
    Left eye upper lid: 159, lower lid: 145
    Right eye upper lid: 386, lower lid: 374
    """
    upper = landmarks[upper_idx]
    lower = landmarks[lower_idx]
    iris  = landmarks[iris_idx]

    upper_y = upper.y * img_h
    lower_y = lower.y * img_h
    iris_y  = iris.y  * img_h

    eye_height = abs(lower_y - upper_y)
    if eye_height < 1:
        return 0.5

    ratio = (iris_y - min(upper_y, lower_y)) / eye_height
    return ratio


def is_fixating(landmarks, img_w, img_h):
    """
    Returns True if both eyes are roughly centered (looking at the fixation cross).
    Acceptable range: iris position ratio between 0.35 and 0.65 horizontally,
    and between 0.30 and 0.70 vertically.
    """
    # Horizontal check
    left_h  = get_iris_ratio(landmarks, LEFT_INNER,  LEFT_OUTER,  LEFT_IRIS,  img_w, img_h)
    right_h = get_iris_ratio(landmarks, RIGHT_INNER, RIGHT_OUTER, RIGHT_IRIS, img_w, img_h)

    # Vertical check (eyelid landmarks)
    left_v  = get_iris_ratio_vertical(landmarks, 159, 145, LEFT_IRIS,  img_w, img_h)
    right_v = get_iris_ratio_vertical(landmarks, 386, 374, RIGHT_IRIS, img_w, img_h)

    h_ok = (0.35 <= left_h <= 0.65) and (0.35 <= right_h <= 0.65)
    v_ok = (0.30 <= left_v <= 0.70) and (0.30 <= right_v <= 0.70)

    return h_ok and v_ok


# ── POST to Django (async so it never blocks the frame loop) ──────────────────
def _post_fixation_worker(fixating: bool):
    try:
        requests.post(
            API_URL,
            json={"is_fixating": fixating},
            timeout=1,
        )
    except Exception as e:
        print(f"  [warn] Failed to POST fixation: {e}")


def post_fixation(fixating: bool):
    threading.Thread(target=_post_fixation_worker, args=(fixating,), daemon=True).start()


# ── Main loop ─────────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(args.camera)
if not cap.isOpened():
    print(f"ERROR: Could not open camera {args.camera}")
    sys.exit(1)

# State tracking for ~500ms debounce
# We need ~3 consecutive bad frames at ~30fps (~100ms each) = ~300ms
# Or we track time directly
BAD_THRESHOLD_SECS = 0.5
last_good_time     = time.time()
currently_fixating = True
last_posted        = None   # avoid spamming identical status
post_interval      = 0.2    # POST every 200ms max
last_post_time     = 0

with mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,   # REQUIRED for iris landmarks (468, 473)
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
) as face_mesh:

    print("Eye tracker running. Waiting for face...\n")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("Failed to read frame.")
            continue

        # Flip frame horizontally (mirror) so left/right match patient's perspective
        frame = cv2.flip(frame, 1)
        img_h, img_w = frame.shape[:2]

        # Convert to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results   = face_mesh.process(rgb_frame)

        now = time.time()

        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            fixating  = is_fixating(landmarks, img_w, img_h)

            if fixating:
                last_good_time     = now
                currently_fixating = True
            else:
                # Only mark as not fixating after BAD_THRESHOLD_SECS of bad frames
                if now - last_good_time >= BAD_THRESHOLD_SECS:
                    currently_fixating = False
        else:
            # No face detected — treat as not fixating after threshold
            if now - last_good_time >= BAD_THRESHOLD_SECS:
                currently_fixating = False

        # POST at most every 200ms, and only when status changes OR on interval
        if now - last_post_time >= post_interval:
            if currently_fixating != last_posted:
                print(f"  Fixation: {'OK' if currently_fixating else 'LOST'}")
            post_fixation(currently_fixating)
            last_posted    = currently_fixating
            last_post_time = now

        # ── Draw overlay on preview window (lightweight: contours + irises only) ──
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

        status_text  = "FIXATION: OK" if currently_fixating else "FIXATION: LOST"
        status_color = (0, 255, 0) if currently_fixating else (0, 0, 255)
        cv2.putText(frame, status_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2)
        cv2.putText(frame, f"Run: {args.run_id[:8]}...", (20, img_h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow("PeriVue Eye Tracker", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

cap.release()
cv2.destroyAllWindows()
print("Eye tracker stopped.")