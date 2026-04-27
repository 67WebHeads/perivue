import cv2
import mediapipe as mp
import requests
import argparse
import time
import sys
import threading

# ── Args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Perivue eye tracking runner")
parser.add_argument(
    "--run_id", required=True, help="TestRun UUID to post fixation status to"
)
parser.add_argument("--camera", type=int, default=0, help="Camera index (default 0)")
parser.add_argument(
    "--api", default="http://localhost:8000", help="Django API base URL"
)
args = parser.parse_args()

API_URL = f"{args.api}/api/visual-tests/runs/{args.run_id}/fixation/"

print(f"Starting eye tracker for run: {args.run_id}")
print(f"Posting to: {API_URL}")
print(f"Camera index: {args.camera}")
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


# ── Fixation detection ────────────────────────────────────────────────────────
def is_fixating(landmarks, img_w, img_h):
    left_h = get_iris_ratio(landmarks, LEFT_INNER, LEFT_OUTER, LEFT_IRIS, img_w, img_h)
    right_h = get_iris_ratio(
        landmarks, RIGHT_INNER, RIGHT_OUTER, RIGHT_IRIS, img_w, img_h
    )
    left_v = get_iris_ratio_vertical(landmarks, 159, 145, LEFT_IRIS, img_w, img_h)
    right_v = get_iris_ratio_vertical(landmarks, 386, 374, RIGHT_IRIS, img_w, img_h)

    h_ok = (0.35 <= left_h <= 0.65) and (0.35 <= right_h <= 0.65)
    v_ok = (0.30 <= left_v <= 0.70) and (0.30 <= right_v <= 0.70)

    return h_ok and v_ok


# ── Gaze estimation ───────────────────────────────────────────────────────────
def estimate_gaze(landmarks, img_w, img_h):
    """
    Returns normalized screen position (0-1, 0-1) based on iris position.
    0.5, 0.5 = center of screen (fixation cross).
    Maps iris ratio range 0.35-0.65 (H) and 0.30-0.70 (V) to full screen 0-1.
    """
    left_h = get_iris_ratio(landmarks, LEFT_INNER, LEFT_OUTER, LEFT_IRIS, img_w, img_h)
    right_h = get_iris_ratio(
        landmarks, RIGHT_INNER, RIGHT_OUTER, RIGHT_IRIS, img_w, img_h
    )
    left_v = get_iris_ratio_vertical(landmarks, 159, 145, LEFT_IRIS, img_w, img_h)
    right_v = get_iris_ratio_vertical(landmarks, 386, 374, RIGHT_IRIS, img_w, img_h)

    avg_h = (left_h + right_h) / 2
    avg_v = (left_v + right_v) / 2

    # Map iris ratio range to 0-1 screen range
    screen_x = (avg_h - 0.35) / (0.65 - 0.35)
    screen_y = (avg_v - 0.30) / (0.70 - 0.30)

    # Clamp to 0-1
    screen_x = max(0.0, min(1.0, screen_x))
    screen_y = max(0.0, min(1.0, screen_y))

    return screen_x, screen_y


# ── POST to Django ────────────────────────────────────────────────────────────
def _post_fixation_worker(fixating: bool, gaze_x: float, gaze_y: float):
    try:
        requests.post(
            API_URL,
            json={
                "is_fixating": fixating,
                "gaze_x": round(gaze_x, 4),
                "gaze_y": round(gaze_y, 4),
            },
            timeout=1,
        )
    except Exception as e:
        print(f"  [warn] Failed to POST fixation: {e}")


def post_fixation(fixating: bool, gaze_x: float, gaze_y: float):
    threading.Thread(
        target=_post_fixation_worker, args=(fixating, gaze_x, gaze_y), daemon=True
    ).start()


# ── Main loop ─────────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(args.camera)
if not cap.isOpened():
    print(f"ERROR: Could not open camera {args.camera}")
    sys.exit(1)

BAD_THRESHOLD_SECS = 0.5
last_good_time = time.time()
currently_fixating = True
last_posted = None
post_interval = 0.2
last_post_time = 0
gaze_x = 0.5
gaze_y = 0.5

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

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)

        now = time.time()

        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            fixating = is_fixating(landmarks, img_w, img_h)
            gaze_x, gaze_y = estimate_gaze(landmarks, img_w, img_h)

            if fixating:
                last_good_time = now
                currently_fixating = True
            else:
                if now - last_good_time >= BAD_THRESHOLD_SECS:
                    currently_fixating = False
        else:
            if now - last_good_time >= BAD_THRESHOLD_SECS:
                currently_fixating = False
            gaze_x, gaze_y = 0.5, 0.5

        if now - last_post_time >= post_interval:
            if currently_fixating != last_posted:
                print(f"  Fixation: {'OK' if currently_fixating else 'LOST'}")
            post_fixation(currently_fixating, gaze_x, gaze_y)
            last_posted = currently_fixating
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

        # Gaze position on preview
        gaze_px = int(gaze_x * img_w)
        gaze_py = int(gaze_y * img_h)
        cv2.circle(frame, (gaze_px, gaze_py), 12, (0, 255, 255), 2)
        cv2.circle(frame, (gaze_px, gaze_py), 4, (0, 255, 255), -1)

        status_text = "FIXATION: OK" if currently_fixating else "FIXATION: LOST"
        status_color = (0, 255, 0) if currently_fixating else (0, 0, 255)
        cv2.putText(
            frame, status_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2
        )
        cv2.putText(
            frame,
            f"Gaze: ({gaze_x:.2f}, {gaze_y:.2f})",
            (20, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (200, 200, 200),
            1,
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
