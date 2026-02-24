Here’s a clean, professional **README.md** you can place inside your `backend/` folder.

You can copy-paste this directly.

---

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

If you'd like, I can now create:

* A production-ready README (with PostgreSQL + .env)
* A Docker version
* Or a full-stack setup README (frontend + backend combined)
