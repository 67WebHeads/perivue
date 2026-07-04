# PeriVue Context

This file is a working memory for Codex. It summarizes the current codebase shape without copying env files or sensitive values.

## Product

PeriVue is a clinical peripheral vision testing system for a CEU eye clinic workflow. It digitizes a tangent screen test:

- A clinician starts a patient/session/run from the laptop.
- A separate browser tab is opened as the projected test canvas.
- The patient fixates on the center and responds when they see a stimulus.
- Static points produce `seen` / `not_seen` results at fixed coordinates.
- Kinetic points move inward and record a boundary coordinate at patient response time.
- A separate MediaPipe Python process reads webcam gaze/fixation and posts status back to Django.

This is tangent screen / field-boundary testing, not Humphrey-style threshold perimetry.

## Stack

- Backend: Django 6, Django REST Framework, SimpleJWT, django-allauth / dj-rest-auth, PostgreSQL via env-configured DB.
- Frontend: React 19, React Router 7, Vite 7, Tailwind CSS 4, DaisyUI, MUI icons/components, jsPDF, html2canvas-pro.
- Eye tracking: `backend/mediapipe_runner.py` with OpenCV + MediaPipe, launched by backend endpoint.
- Containers: `docker-compose.dev.yml`, `docker-compose.prod.yml`, backend/frontend Dockerfiles.

## Repository Layout

- `backend/config/`: Django settings and URL routing.
- `backend/users/`: custom UUID email user model, CEU-domain test login, current-user profile, staff list.
- `backend/patients/`: patient CRUD and patient code generation.
- `backend/visual_tests/`: test protocols, sessions, runs, fixation events, run state, commands, results, email, dashboard stats.
- `backend/mediapipe_runner.py`: standalone camera process that posts fixation and gaze to a run.
- `frontend/src/context/AuthContext.jsx`: JWT storage, refresh, authenticated fetch.
- `frontend/src/components/Layout.jsx`: authenticated app shell/sidebar.
- `frontend/src/pages/general/Records.jsx`: patient records and test history.
- `frontend/src/pages/general/TestHome.jsx`: create session/run and open canvas.
- `frontend/src/pages/general/TestScreen.jsx`: fullscreen projected test canvas.
- `frontend/src/pages/general/TestResults.jsx`: result visualization, PDF export, email send.
- `CLAUDE.md`: useful guide, but some sections are stale; trust code when it differs.

## Run Commands

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_protocol
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Useful checks:

```bash
cd backend && python manage.py check
cd frontend && npm run lint
cd frontend && npm run build
```

The frontend API base comes from `VITE_API_URL`, defaulting to `http://localhost:8000` in `frontend/src/config/api.js`.

## Auth

- Custom `users.User` uses UUID primary key and email as `USERNAME_FIELD`.
- Roles in the model: `admin`, `clinician`, `technician`, `viewer`.
- `users.views.ALLOWED_ROLES` currently allows profile completion as `admin`, `clinician`, or `viewer`; it omits `technician`.
- JWT tokens are stored in localStorage as `access_token` and `refresh_token`.
- `AuthContext.authFetch()` attaches `Authorization: Bearer ...` and retries once after token refresh on 401.
- SimpleJWT access lifetime in settings is currently 60 minutes, though the AuthContext comment says 5 minutes and refreshes every 4 minutes.
- Google OAuth is configured through allauth and restricted by `users.adapters.CEUAccountAdapter` to CEU accounts.
- Dev-only `POST /api/users/test-login/` creates/gets a CEU email user when `DEBUG=True`.

## Backend API Map

Root and auth:

- `GET /`: API status JSON.
- `POST /test-email/`: test SMTP email to a hardcoded recipient in `config/urls.py`.
- `POST /api/auth/login/`: SimpleJWT token obtain.
- `POST /api/token/refresh/`: refresh JWT.
- `POST /api/token/blacklist/`: blacklist refresh token.
- `/accounts/`: allauth routes.
- `/api/auth/` and `/api/auth/registration/`: dj-rest-auth routes.
- `GET/PATCH /api/users/me/`: current user profile.
- `GET /api/users/staff/`: active admin/clinician users for assigned doctor dropdown.

Patients:

- `GET /api/patients/?search=&sex=`: list/search/filter.
- `POST /api/patients/`: create.
- `GET/PATCH/DELETE /api/patients/<uuid>/`: detail/update/delete.

Visual tests:

- `GET/POST /api/visual-tests/protocols/`.
- `GET/DELETE /api/visual-tests/protocols/<uuid>/`; delete is soft delete via `is_active=False`.
- `GET/POST /api/visual-tests/sessions/`; accepts optional `?patient_id=`.
- `GET /api/visual-tests/sessions/<uuid>/`.
- `POST /api/visual-tests/sessions/<session_pk>/runs/`: create an `OD` or `OS` run.
- `GET /api/visual-tests/runs/<uuid>/state/`: polled by canvas.
- `POST /api/visual-tests/runs/<uuid>/command/`: `pause`, `resume`, `next`, `repeat`, `end`, `abort`.
- `GET /api/visual-tests/runs/<run_pk>/results/`: raw JSON trials from `TestRun.trials`.
- `POST /api/visual-tests/runs/<run_pk>/submit/`: append trial and auto-advance.
- `POST /api/visual-tests/runs/<run_pk>/fixation/`: AllowAny endpoint for MediaPipe.
- `POST /api/visual-tests/runs/<run_pk>/mediapipe/start/`: launch `mediapipe_runner.py`.
- `POST /api/visual-tests/runs/<run_pk>/mediapipe/stop/`: terminate backend-held MediaPipe process.
- `GET /api/visual-tests/sessions/<uuid>/results/`: aggregate patient/session/run metrics and map data.
- `POST /api/visual-tests/sessions/<uuid>/email/`: multipart PDF email endpoint.
- `GET /api/visual-tests/dashboard/stats/`: dashboard totals/trends.

## Data Model Notes

- `Patient`: UUID PK, auto-generated `patient_code` like `PV-YYYYMMDD-0001`, demographics/contact/doctor/history fields, `full_name`, `age`.
- `TestProtocol`: reusable stimulus settings and active flag.
- `ProtocolPoint`: ordered static or kinetic point. Static uses `x_deg`, `y_deg`; kinetic uses `angle_deg`, `start_radius_deg`.
- `TestSession`: patient + protocol + clinician + requested eye (`OD`, `OS`, `OU`).
- `TestRun`: one actual run for `OD` or `OS`; stores status, current point index, fixation state/loss count, latest gaze, and `trials` JSON.
- `FixationEvent`: log of fixation status changes/posts.
- There is no current `TrialResult` model in code; results are denormalized inside `TestRun.trials`.

## Frontend Routes

- `/`: splash screen, redirects to `/login`.
- `/login`: auth page.
- `/complete-profile`: post-login profile setup.
- Protected inside `Layout`: `/dashboard`, `/records`, `/test-menu`.
- Outside `Layout`: `/test/canvas?run_id=...`, `/test/results?run_id=...` or `/test/results?session_id=...`.

## Test Flow

1. `TestHome.jsx` loads patients and active protocols.
2. User selects patient, protocol, and `OD`/`OS`.
3. It creates a `TestSession`, then a `TestRun`.
4. It calls MediaPipe start endpoint, but treats failure as non-fatal.
5. It opens `/test/canvas?run_id=<run id>` in a new tab.
6. `TestScreen.jsx` draws the grid on canvas and starts after the overlay button.
7. Canvas polls run state once per second while started and polls gaze every 300 ms during overlay.
8. Patient response is Space, Enter, or left mouse click.
9. Static trials flash a dot after a short delay and wait up to 2 seconds.
10. Kinetic trials animate inward until response or center.
11. Submit endpoint appends trial JSON and advances/completes the run.
12. On completion, canvas links to `/test/results?run_id=...`.
13. `TestResults.jsx` resolves session results, renders field maps, can download a PDF, and can email a PDF attachment.

## MediaPipe Details

- Backend stores a module-level `_mediapipe_process`, so this is single-process/single-active-run oriented.
- `mediapipe_runner.py` defaults to camera index `0` and API `http://localhost:8000`.
- It posts `is_fixating`, `gaze_x`, and `gaze_y` roughly every 200 ms.
- It opens an OpenCV preview window and exits on `q` or process termination.
- The backend start endpoint launches it with only `--run_id`, so custom camera/API options are not currently exposed by the API.

## Current Gotchas

- `CLAUDE.md` says the test canvas, clinician control panel, results view, MediaPipe script, and settings page are not built. The canvas/results/MediaPipe script are now present; a separate rich clinician control panel/settings page still looks incomplete.
- README says to check `/api/health/`, but current code exposes root `/` as the status endpoint.
- `TestScreen.jsx` has a back link to `/test`, but the actual menu route is `/test-menu`.
- `TestScreen.jsx` progress total is hardcoded to `40` rather than using protocol point count from state.
- `Layout.jsx` logout button navigates to `/login` but does not call `logout()`, so tokens may remain.
- `AuthContext.authFetch()` sets `Content-Type: application/json` by default. For multipart uploads, `TestResults.jsx` correctly bypasses it and uses raw `fetch`.
- `config/settings.py` has `ALLOWED_HOSTS = []`; production/container deployment likely needs this adjusted via env/settings work.
- `patients/serializers.py` no longer contains the `clinic_id` remnants mentioned in `CLAUDE.md`; that known issue appears fixed in current code.
- `visual_tests/views.py` imports `EmailMessage` and `FixationEventSerializer` but does not appear to use them.

## Coding Style

- Backend views are mostly DRF `APIView` classes with explicit serializers and `get_object_or_404`.
- UUID primary keys are the norm.
- Most protected backend endpoints use `IsAuthenticated`; fixation POST is intentionally `AllowAny`.
- Frontend uses function components, hooks, local component helpers in page files, Tailwind utility classes, and `authFetch`.
- Existing UI is dark, glassy, and compact. Avoid broad style rewrites unless asked.
- Do not read or expose env files/secrets. Keep config references generic.
