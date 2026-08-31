"""Keep the Supabase project from auto-pausing.

Free-tier Supabase projects pause after ~7 days without activity. Opening a
connection and running a trivial query counts as activity, so running this on a
schedule (every 2-3 days) keeps the project awake.

Reads credentials from backend/.env, or from real environment variables when
running in CI (env vars win over the .env file).

Usage:
    python backend/scripts/keepalive.py
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# override=False so CI-provided secrets take precedence over a committed .env
load_dotenv(BASE_DIR / ".env", override=False)

REQUIRED_VARS = ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST")


def main():
    missing = [name for name in REQUIRED_VARS if not os.getenv(name)]
    if missing:
        print(f"keepalive: missing env vars: {', '.join(missing)}", file=sys.stderr)
        return 1

    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT", "5432"),
            sslmode=os.getenv("DB_SSLMODE", "require"),
            connect_timeout=15,
        )
    except psycopg2.Error as exc:
        print(f"keepalive: connection failed: {exc}", file=sys.stderr)
        return 1

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
    except psycopg2.Error as exc:
        print(f"keepalive: query failed: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"keepalive: ok at {stamp} ({os.getenv('DB_HOST')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
