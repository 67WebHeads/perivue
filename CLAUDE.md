# CLAUDE.md — PeriVue Project Guide

## Project Overview

PeriVue is a **clinical peripheral vision testing system** that digitizes the **tangent screen test** — a standard ophthalmology procedure that maps the boundary of a patient's peripheral visual field. Built for Centro Escolar University (CEU) eye clinic. The system replaces the manual paper-based tangent screen with a software-driven version projected onto a screen.

### Physical Setup

- One laptop running everything
- Laptop connects to a **projector via HDMI**
- Projector displays the test canvas on a large screen
- Patient sits in front of the projected screen
- A **webcam** faces the patient and feeds into MediaPipe for eye tracking
- Clinician uses the laptop screen (Tab 1 = clinician panel, Tab 2 = test canvas projected)

### How the Test Works

The tangent screen test maps peripheral vision by showing stimuli at various locations around a central fixation point. The patient stares at the center and responds when they see a dot appear in their periphery.

**Static mode** — a dot flashes at a fixed peripheral location for ~200ms. The patient presses a button if they see it. Result: seen or not seen at that coordinate.

**Kinetic mode** — a dot moves inward from the periphery along a defined angle toward the center. The patient presses when they first see it. Result: the position of the dot at the moment of response (the field boundary for that angle).

**Output:** A visual field map — a polar diagram showing which static points were seen vs not seen, and the isopter boundary line drawn from kinetic boundary points.

**Note:** This is NOT a threshold perimetry test (no Humphrey-style dB measurement, no ZEST, no staircase). It is purely a tangent screen / field boundary test.

---

## Architecture

Both tabs (clinician panel and test canvas) are React pages that talk to the Django REST API on `localhost`. There are **no WebSockets, no Redis, no Django Channels** — the canvas polls the run state endpoint every second.

```
Tab 1 (Clinician panel)  ─────┐
Tab 2 (Test canvas)      ─────┤──► Django REST API ──► PostgreSQL
MediaPipe Python script  ─────┘
```

The MediaPipe script runs as a **separate Python process** alongside Django. It reads the webcam, detects whether the patient is fixating on the center, and POSTs fixation status to a Django endpoint every ~200ms.

---

## Tech Stack

| Layer          | Technology                                                  |
| -------------- | ----------------------------------------------------------- |
| Frontend       | React 19, React Router v7, Vite 7.2                        |
| Styling        | Tailwind CSS 4.1 + DaisyUI 5.5 + MUI v7 (Emotion)         |
| State          | React Context API (AuthContext)                             |
| Backend        | Django 6.0, Django REST Framework 3.16                      |
| Database       | PostgreSQL on Supabase (session pooler)                     |
| Auth           | JWT (SimpleJWT) + Google OAuth (django-allauth, CEU domain) |
| Eye Tracking   | MediaPipe (Python, runs as a separate process)              |
| Email          | Gmail SMTP via django.core.mail                             |
| AI             | Google Gemini (google-genai)                                |
| PDF            | xhtml2pdf, reportlab, pypdf                                 |
| CI/CD          | GitHub Actions (lint, audit, Semgrep OWASP scan)            |
| Containers     | Docker Compose (dev + prod)                                 |
| Formatter      | ESLint (frontend), Black (backend)                          |

---

## Project Structure

```
perivue/
├── backend/
│   ├── config/              # Django settings, URLs, ASGI/WSGI
│   │   ├── settings.py
│   │   └── urls.py
│   ├── users/               # User model, auth views, OAuth adapter
│   │   ├── models.py        # User (UUID, email, role), UserIdentity
│   │   ├── views.py         # TestLoginView, MeView, StaffListView
│   │   ├── urls.py
│   │   └── adapters.py      # CEUAccountAdapter (ceu.edu.ph filter)
│   ├── patients/            # Patient records CRUD
│   │   ├── models.py        # Patient (UUID, patient_code PV-YYYYMMDD-XXXX)
│   │   ├── views.py         # PatientListCreateView, PatientDetailView
│   │   ├── serializers.py   # List/Detail/Create serializers
│   │   └── urls.py
│   ├── visual_tests/        # All test models, views, serializers
│   │   ├── models.py        # TestProtocol, ProtocolPoint, TestSession, TestRun, TrialResult, FixationEvent
│   │   ├── views.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── admin.py
│   │   └── management/commands/seed_protocol.py
│   ├── manage.py
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── main.jsx              # Entry point (BrowserRouter)
│   │   ├── App.jsx               # Splash screen redirect
│   │   ├── Home.jsx              # Post-login home
│   │   ├── components/
│   │   │   ├── Layout.jsx        # Main layout with sidebar
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── SplashScreen.jsx
│   │   │   └── CustomInput.jsx
│   │   ├── config/
│   │   │   └── api.js            # API_BASE_URL
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Auth state, JWT, authFetch
│   │   └── pages/
│   │       ├── auth/
│   │       │   └── Login.jsx     # Google OAuth + dev test login
│   │       └── general/
│   │           ├── Dashboard.jsx
│   │           ├── Records.jsx   # Patient CRUD UI
│   │           └── CompleteProfile.jsx
│   ├── package.json
│   └── .env
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── .github/workflows/ci.yml
└── ask.py                        # Gemini AI terminal assistant
```

---

## Running the Project

```bash
# Backend (port 8000)
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_protocol    # Seed default test protocol
python manage.py runserver

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

---

## API Routes

### General
```
GET    /                             # API status message
POST   /test-email/                  # Send test email
```

### Auth
```
POST   /api/auth/login/              # JWT login
POST   /api/token/refresh/           # Refresh access token
POST   /api/token/blacklist/         # Logout (blacklist refresh)
GET    /accounts/google/login/       # Google OAuth initiate
GET    /api/auth/                    # dj-rest-auth endpoints
POST   /api/auth/registration/       # Registration
POST   /api/users/test-login/        # Dev-only test login (DEBUG=True)
GET    /api/users/me/                # Current user profile
PATCH  /api/users/me/                # Update profile (full_name, role)
GET    /api/users/staff/             # List staff
```

### Patients
```
GET    /api/patients/                # List patients (search, sex filter)
POST   /api/patients/                # Create patient
GET    /api/patients/<uuid>/         # Patient detail
PATCH  /api/patients/<uuid>/         # Update patient
DELETE /api/patients/<uuid>/         # Delete patient
```

### Visual Tests
```
GET    /api/visual-tests/protocols/                    # List active protocols
POST   /api/visual-tests/protocols/                    # Create protocol
GET    /api/visual-tests/protocols/<uuid>/              # Get protocol + all points
DELETE /api/visual-tests/protocols/<uuid>/              # Soft delete protocol

GET    /api/visual-tests/sessions/                     # List sessions (?patient_id=)
POST   /api/visual-tests/sessions/                     # Create session
GET    /api/visual-tests/sessions/<uuid>/               # Get session detail
POST   /api/visual-tests/sessions/<uuid>/runs/          # Start a test run ({eye: "OD"|"OS"})

GET    /api/visual-tests/runs/<uuid>/state/             # Poll run state (canvas polls every ~1s)
POST   /api/visual-tests/runs/<uuid>/command/           # Clinician command (pause|resume|next|repeat|end|abort)
GET    /api/visual-tests/runs/<uuid>/results/           # Get all trial results for a run
POST   /api/visual-tests/runs/<uuid>/submit/            # Submit trial result (canvas calls after each stimulus)
POST   /api/visual-tests/runs/<uuid>/fixation/          # MediaPipe POSTs fixation status (no auth)
```

### Run State Response (what the canvas polls)
```json
{
  "id": "uuid",
  "status": "in_progress",
  "current_point_index": 3,
  "is_fixating": true,
  "fixation_loss_count": 0,
  "current_point": {
    "id": "uuid",
    "point_index": 3,
    "point_type": "static",
    "x_deg": "10.00",
    "y_deg": "0.00",
    "angle_deg": null,
    "start_radius_deg": null,
    "is_blindspot_check": false
  },
  "protocol": {
    "stimulus_color": "white",
    "stimulus_size_deg": "0.50",
    "background_color": "black",
    "kinetic_speed_deg_per_sec": "2.00"
  }
}
```

---

## Frontend Routes

```
/                    → SplashScreen (3s redirect to /login)
/login               → Google OAuth + Test Login (dev)
/complete-profile    → Role/full name setup (post-login)
/home                → Home page (protected)
/dashboard           → Stats overview (protected)
/records             → Patient records table (protected)
```

---

## Database Models

### User (users app)
- UUID PK, email-based auth (no username), full_name, avatar_url
- role: admin / clinician / technician / viewer
- profile_complete (bool), timestamps

### Patient (patients app)
- UUID PK, patient_code (auto-generated: PV-YYYYMMDD-XXXX, resets daily)
- first_name, last_name, sex (M/F/X/U), birth_date
- phone, email, assigned_doctor, visual_condition, case_history, notes
- Computed properties: full_name, age

### TestProtocol (visual_tests app)
Reusable test configuration. Defines dot appearance and kinetic speed.
- name, description, stimulus_color, stimulus_size_deg, background_color
- kinetic_speed_deg_per_sec, is_active (soft delete)

### ProtocolPoint (visual_tests app)
One test point within a protocol. Either static or kinetic.
- protocol (FK), point_index, point_type ('static' | 'kinetic')
- x_deg, y_deg (static only), angle_deg, start_radius_deg (kinetic only)
- is_blindspot_check

### TestSession (visual_tests app)
One clinical visit. Links patient + protocol + clinician + eye.
- patient (FK), protocol (FK), performed_by (FK → User)
- eye ('OD' | 'OS' | 'OU'), notes, session_datetime

### TestRun (visual_tests app)
The actual execution — one per eye. This is what the canvas polls.
- session (FK), eye ('OD' | 'OS')
- status: pending / in_progress / paused / completed / aborted
- current_point_index, fixation_loss_count, is_fixating
- start_time, end_time

### TrialResult (visual_tests app)
One result per stimulus — works for both static and kinetic.
- run (FK), protocol_point (FK)
- result: 'seen' / 'not_seen' / 'not_tested'
- response_time_ms, boundary_x_deg, boundary_y_deg (kinetic only)
- presented_at

### FixationEvent (visual_tests app)
Log entry written by MediaPipe every time fixation status changes.
- run (FK), is_fixating, recorded_at

---

## Default Protocol (seeded via `python manage.py seed_protocol`)

- Name: "Default Tangent Screen"
- 16 kinetic points — angles: 0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5 degrees (each starts at 35° from center, moves inward)
- 24 static points — 8 angles (0, 45, 90, 135, 180, 225, 270, 315) × 3 radii (10, 20, 30 degrees)
- Total: 40 points (16 kinetic first, then 24 static)

---

## Test Canvas UI Reference

The test canvas is a **black fullscreen polar grid** displayed on the projector:
- Concentric circles at 5-degree intervals out to 35 degrees
- Angle markers at 0, 45, 90, 135, 180, 225, 270, 315 degrees
- A fixation cross (starburst) at the exact center
- A red dot at the current stimulus position
- An X/close button and settings gear icon in the corners

---

## Key Patterns

- **Auth:** JWT in localStorage (access + refresh), auto-refresh every 4 min, `authFetch()` wrapper in AuthContext
- **Protected routes:** `<ProtectedRoute>` component wraps authenticated pages
- **Single clinic:** `clinic_id` was removed from the Patient model (migration 0004). No multi-tenant support.
- **User roles:** admin, clinician, technician, viewer
- **OAuth restriction:** Google login limited to `@ceu.edu.ph` domain
- **UI theme:** Dark blue with glass-morphism effects (backdrop-blur, bg-white/10)
- **Backend views:** Class-based APIViews with separate serializers per action
- **UUIDs:** All primary keys use UUID fields
- **Permissions:** `IsAuthenticated` on all views except `FixationStatusView` (AllowAny — called by local Python process)
- **get_object_or_404:** Used for all single-object fetches

---

## Known Issues

- **`clinic_id` remnants:** The `clinic_id` field was removed from the Patient model (migration 0004), but `patients/serializers.py` still references `clinic_id` in field lists, validation, and `create()`. Frontend `Records.jsx` still sends a hardcoded `X-Clinic-ID` header. These references need cleanup.

---

## What Is Already Built

### Backend
- Custom User model (UUID PK, email auth, Google OAuth via allauth)
- JWT authentication (SimpleJWT), login, refresh, blacklist
- `patients` app — full CRUD for patient records
- `visual_tests` app — all 6 models, serializers, views, urls, admin, migrations
- Default protocol seeded via `python manage.py seed_protocol`
- Email sending via Gmail SMTP (test endpoint: `POST /test-email/`)

### Frontend
- Login page with Google OAuth + dev test login
- Complete profile page (role + full name selection post-OAuth)
- Dashboard (stats cards — placeholder data)
- Patient records (list with search, create, inline edit, delete with confirmation)
- Auth context with auto-refresh, protected routes, sidebar layout

### Not Yet Built
- React test canvas (the projected polar grid UI)
- Clinician control panel
- Results view (field map rendering)
- MediaPipe eye tracking script
- Settings page (nav link exists, no page)

---

## Environment Variables

**Backend (.env):** SECRET_KEY, DEBUG, DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, GOOGLE_CLIENT_ID, GOOGLE_SECRET, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD

**Note:** Database is hosted on Supabase using session pooler (`aws-1-ap-southeast-2.pooler.supabase.com:5432`). The direct host (`db.mdwydskkgjyiehlrjnvc.supabase.co`) has DNS issues — use the pooler connection.

**Frontend (.env):** VITE_API_URL (default: http://localhost:8000)

---

## Code Placement Instructions

When providing code, follow these rules strictly and without exception.

### Rules

1. **No vague placement language**
   Never use phrases like:
   - "add this near..."
   - "place this somewhere in..."
   - "inside your logic..."
   - "around your hooks"
   - "somewhere in the component"

2. **Always specify an exact location**
   Every code instruction must include:
   - **File name** — the exact filename and path
   - **Anchor code** — the exact existing code to find
   - **Action** — one of: `Replace`, `Insert above`, `Insert below`

3. **Use findable anchors**
   Anchor placement using identifiable code such as:
   - Function or variable names
   - `useEffect`, `return`, API calls, JSX blocks
   - Import statements or export lines

4. **Show original and updated code when modifying**
   If changing existing code:
   - Show the original lines to locate
   - Then show the replacement

### Required Format

```
File: path/to/filename.jsx

Find this code:
// exact existing code to locate

Action: Replace / Insert above / Insert below

With this code:
// new or modified code
```

### Invalid Instructions

The following are **not acceptable**:
- "Add this next to your hooks"
- "Somewhere in the component"
- "Modify your logic like this"
- "Put this near the top"

### Fallback Rule

If no exact anchor point can be identified, **ask for the file contents first**. Do not guess placement.
