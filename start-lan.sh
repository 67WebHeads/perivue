#!/usr/bin/env bash
# Host PeriVue on this laptop so other devices on the same Wi-Fi can use it.
# Usage: ./start-lan.sh   (Ctrl+C stops both servers)

ROOT="$(cd "$(dirname "$0")" && pwd)"
IP="$(ipconfig getifaddr en0 || ipconfig getifaddr en1)"

if [ -z "$IP" ]; then
  echo "Not connected to Wi-Fi — no LAN IP found."
  exit 1
fi

trap 'kill 0' EXIT

(cd "$ROOT/backend" && ./venv/bin/python manage.py runserver 0.0.0.0:8000) &
(cd "$ROOT/frontend" && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort) &

sleep 3
echo
echo "=============================================="
echo " PeriVue is running"
echo "   This laptop:     http://localhost:5173"
echo "   Other devices:   http://$IP:5173"
echo "=============================================="
echo

wait
