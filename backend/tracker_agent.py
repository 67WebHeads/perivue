"""Eye tracking for the hosted PeriVue site.

The hosted backend has no webcam, so this runs on the clinic laptop (the one
with the webcam and projector). It polls the backend for the run the clinician
just started and launches mediapipe_runner.py for it, posting fixation data to
the hosted API. Leave it running during the whole clinic session.

Usage (from the backend folder, with the venv active):
    python tracker_agent.py --api https://perivue-api.onrender.com --token <TRACKER_TOKEN>

TRACKER_TOKEN is the value set in the hosted backend's environment variables.
"""

import argparse
import os
import subprocess
import sys
import time

import requests

parser = argparse.ArgumentParser(description="PeriVue tracker agent (hosted mode)")
parser.add_argument("--api", required=True, help="Hosted Django API base URL")
parser.add_argument("--token", required=True, help="TRACKER_TOKEN from the hosted backend")
parser.add_argument("--camera", type=int, default=None, help="Camera index passed to the runner")
parser.add_argument("--interval", type=float, default=1.0, help="Seconds between polls")
args = parser.parse_args()

API = args.api.rstrip("/")
JOB_URL = f"{API}/api/visual-tests/tracker/job/"
RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mediapipe_runner.py")

runner = None  # subprocess.Popen for mediapipe_runner.py
current_run = None


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def stop_runner():
    global runner, current_run
    if runner and runner.poll() is None:
        runner.terminate()
        try:
            runner.wait(timeout=5)
        except subprocess.TimeoutExpired:
            runner.kill()
        log(f"Stopped tracking run {current_run}")
    runner = None
    current_run = None


def start_runner(run_id, eye):
    global runner, current_run
    stop_runner()
    cmd = [sys.executable, RUNNER, "--run_id", run_id, "--eye", eye, "--api", API]
    if args.camera is not None:
        cmd += ["--camera", str(args.camera)]
    # Runner output goes straight to this terminal
    runner = subprocess.Popen(cmd)
    current_run = run_id
    log(f"Tracking run {run_id} ({eye})")


log(f"Waiting for tests from {API}  (Ctrl+C to quit)")
warned_offline = False
last_start = 0.0

try:
    while True:
        try:
            resp = requests.get(
                JOB_URL, headers={"X-Tracker-Token": args.token}, timeout=30
            )
            if resp.status_code == 403:
                log("Backend rejected the tracker token — check --token. Exiting.")
                break
            resp.raise_for_status()
            job = resp.json()
            if warned_offline:
                log("Backend reachable again")
                warned_offline = False
        except requests.RequestException as e:
            # Free hosts sleep when idle and take ~1 min to wake; keep any
            # running tracker going and retry
            if not warned_offline:
                log(f"Backend unreachable ({e.__class__.__name__}), retrying...")
                warned_offline = True
            time.sleep(max(args.interval, 3))
            continue

        run_id = job.get("run_id")
        if run_id and run_id != current_run:
            start_runner(run_id, job.get("eye") or "OU")
            last_start = time.time()
        elif run_id and runner.poll() is not None and time.time() - last_start > 5:
            log("Tracker exited unexpectedly — restarting")
            start_runner(run_id, job.get("eye") or "OU")
            last_start = time.time()
        elif not run_id and current_run:
            stop_runner()

        time.sleep(args.interval)
except KeyboardInterrupt:
    pass
finally:
    stop_runner()
