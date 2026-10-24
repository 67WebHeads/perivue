import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from the .env file
load_dotenv()

import os
if os.getenv("SSL_CERT_FILE"):
    os.environ["SSL_CERT_FILE"] = os.getenv("SSL_CERT_FILE")

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("SECRET_KEY")

# SECURITY WARNING: don't run with debug turned on in production!
# This safely checks if DEBUG is set to the string "True" in your .env
DEBUG = os.getenv("DEBUG", "False") == "True"

# Comma-separated in .env, e.g. ALLOWED_HOSTS=localhost,127.0.0.1,pabu.local
ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]


def _lan_ip():
    """This laptop's current Wi-Fi IP (no packets are sent)."""
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


# Let other devices on the same network connect, even when the IP changes
# between networks (school Wi-Fi, home Wi-Fi, phone hotspot).
LAN_IP = _lan_ip()
if LAN_IP:
    ALLOWED_HOSTS.append(LAN_IP)

# Render sets this to the service's public hostname (e.g. perivue-api.onrender.com)
if os.getenv("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.getenv("RENDER_EXTERNAL_HOSTNAME"))

# Where the React app lives — used for CORS and to send users back after Google login
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # Third party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "dj_rest_auth",
    "dj_rest_auth.registration",
    # Local
    "users",
    "patients",
    "visual_tests",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "5432"),
        # Reusing connections matters when the server is far from Supabase;
        # keep 0 locally so dev servers don't hold pooler slots open
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "0")),
        "CONN_HEALTH_CHECKS": True,
    }
}

# Custom User Model
AUTH_USER_MODEL = "users.User"

# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = "static/"

# REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

# JWT
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# Tell dj-rest-auth to use JWTs instead of standard tokens
REST_AUTH = {
    "USE_JWT": True,
    "JWT_AUTH_COOKIE": "my-app-auth",
    "JWT_AUTH_REFRESH_COOKIE": "my-refresh-token",
}

# CORS
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]
if FRONTEND_URL not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)

# Allow the frontend when it is opened from another device on the local network
# (e.g. http://192.168.1.23:5173), without hardcoding this laptop's current IP.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)(:(5173|4173))?$",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
]

# Authentication Backends
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# Allauth
SITE_ID = 1
ACCOUNT_EMAIL_VERIFICATION = "none"
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]

# This line is CRITICAL because your custom user model doesn't have a username!
ACCOUNT_USER_MODEL_USERNAME_FIELD = None

# Google OAuth
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APP": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "secret": os.getenv("GOOGLE_SECRET"),
        },
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
    }
}

# Only allow CEU emails (plus EXTRA_ALLOWED_EMAILS below)
SOCIALACCOUNT_ADAPTER = "users.adapters.CEUAccountAdapter"

# Comma-separated non-CEU emails that may also sign in (e.g. developers' Gmail).
# Kept in .env / the host's env vars so personal emails aren't committed.
EXTRA_ALLOWED_EMAILS = {
    e.strip().lower()
    for e in os.getenv("EXTRA_ALLOWED_EMAILS", "").split(",")
    if e.strip()
}

# The frontend sends the browser to /accounts/google/login/ with a plain link,
# so start the Google redirect straight away instead of showing allauth's
# "Continue?" page
SOCIALACCOUNT_LOGIN_ON_GET = True
# Google verifies emails, so a Google login for an email that already has a
# user row (e.g. created in User Management) logs in as that user
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True

# Redirects — after Google login, GoogleLoginCompleteView swaps the Django
# session for JWTs and sends the browser on to the React app
LOGIN_REDIRECT_URL = "/api/users/google/complete/"
ACCOUNT_LOGOUT_REDIRECT_URL = f"{FRONTEND_URL}/login"

# Behind a hosting proxy (Render) — trust its HTTPS header so the Google
# callback URL is built as https://
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    ACCOUNT_DEFAULT_HTTP_PROTOCOL = "https"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Eye tracking on a hosted backend: the server has no webcam, so instead of
# launching mediapipe_runner.py itself it hands the run to tracker_agent.py on
# the clinic laptop. Setting this token turns that mode on.
TRACKER_TOKEN = os.getenv("TRACKER_TOKEN", "")

# Email Backend Configuration
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.getenv("EMAIL_HOST")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

# Use TLS for port 587
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False
