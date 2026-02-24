# PeriVue Backend Setup Guide

## 📦 Requirements

* Python 3.12+ (3.14 works)
* Git
* PowerShell (Windows) / Terminal (Mac/Linux)

---

# 🚀 Backend Setup

## 1️⃣ Clone the repository

```bash
git clone <your-repo-url>
cd perivue/backend
```

---

## 2️⃣ Create Virtual Environment

Inside the `backend` folder:

```bash
python -m venv venv
```

---

## 3️⃣ Activate Virtual Environment

### Windows (PowerShell)

```bash
.\venv\Scripts\Activate.ps1
```

If blocked by execution policy:

```bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then activate again.

---

### Mac / Linux

```bash
source venv/bin/activate
```

You should now see:

```
(venv)
```

in your terminal.

---

## 4️⃣ Install Dependencies

Install all required packages:

```bash
python -m pip install -r requirements.txt
```

⚠️ Important: It is `-r requirements.txt`, not `pip install requirements.txt`

---

## 5️⃣ Run Migrations

```bash
python manage.py migrate
```

---

## 6️⃣ Run Development Server

```bash
python manage.py runserver
```

Backend will run at:

```
http://127.0.0.1:8000/
```

---

# 📂 Project Structure

```
backend/
│
├── manage.py
├── requirements.txt
├── config/
├── api/
├── venv/   (not committed to git)
```

---

# 🛑 Important Notes

* Do NOT commit `venv/`
* Do NOT commit `.env`
* Always activate venv before running Django commands
* Use `python -m pip` instead of `pip` if PowerShell does not recognize pip

---

# 🔄 Updating Dependencies

If new packages are added:

```bash
python -m pip freeze > requirements.txt
```

---

# ✅ Backend Status Check

Test the backend:

```
http://127.0.0.1:8000/api/health/
```

You should see JSON response if the API is configured.

---

# PeriVue Frontend Setup Guide

## 📦 Requirements

* Node.js 18+ (Recommended: Latest LTS)
* npm (comes with Node)
* Git
* PowerShell (Windows) / Terminal (Mac/Linux)

---

# 🚀 Frontend Setup

## 1️⃣ Clone the repository

```bash
git clone <your-repo-url>
cd perivue/frontend
```

---

## 2️⃣ Install Dependencies

Inside the `frontend` folder:

```bash
npm install
```

⚠️ Important: You must run `npm install` before running the development server.

---

## 3️⃣ Run Development Server

```bash
npm run dev
```

Frontend will run at:

```
http://localhost:5173/
```

---

## 4️⃣ Environment Variables (If Needed)

Create a `.env` file inside the `frontend` folder:

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

⚠️ Important:

* All Vite environment variables must start with `VITE_`
* Do NOT commit `.env` to git

Access inside your React code:

```javascript
const API = import.meta.env.VITE_API_BASE_URL;
```

---

# 📂 Project Structure

```
frontend/
│
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── pages/
│   ├── App.jsx
│   └── main.jsx
│
├── index.html
├── package.json
├── vite.config.js
└── node_modules/   (not committed to git)
```

---

# 🛑 Important Notes

* Do NOT commit `node_modules/`
* Do NOT commit `.env`
* Always run `npm install` after pulling new changes
* If `vite` is not recognized, run `npm install` again

---

# 🔄 Updating Dependencies

If new packages are added:

```bash
npm install <package-name>
```

To update packages:

```bash
npm update
```

---

# 🏗 Build for Production

Create production build:

```bash
npm run build
```

Build output will be inside:

```
dist/
```

Preview production build locally:

```bash
npm run preview
```

---

# ✅ Frontend Status Check

Open:

```
http://localhost:5173/
```

# 🐳 Docker Setup – `docker-container` Branch

This branch contains a **fully containerized setup** with **separate development and production configurations**.

You do **not** need to change any application code.
You only choose **how Docker runs the app**.

---

## 📦 Requirements

* Docker Desktop (Windows / macOS / Linux)
* Docker Compose v2 (included with Docker Desktop)

Verify:

```bash
docker --version
docker compose version
```

---

## 📁 Project Structure (Important)

```text
backend/
├── Dockerfile.dev       # Development image
├── Dockerfile.prod      # Production (AWS-ready) image
├── entrypoint.sh
└── ...

frontend/
├── Dockerfile.dev
├── Dockerfile.prod
└── ...

docker-compose.dev.yml   # Daily development
docker-compose.prod.yml  # Production-style (not implemented)
```
---

## 🧠 Quick Command Cheat Sheet

```text

REBUILD and first build:
docker compose -f docker-compose.dev.yml up --build

DAILY START:
docker compose -f docker-compose.dev.yml up

STOP:
docker compose -f docker-compose.dev.yml down

REBUILD and first build:
docker compose -f docker-compose.dev.yml up --build

CLEAN RESET:
docker compose -f docker-compose.dev.yml down -v
```

---

## ✅ Summary

* Same application code
* Two Docker execution modes:

  * **DEV** → daily work
  * **PROD** →production validation
* Dockerfiles are multi-stage and compliant
---

**You’re ready to work. Just run DEV mode and code.** 🚀
