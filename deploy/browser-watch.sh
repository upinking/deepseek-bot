#!/bin/sh
# Restart the dedicated Chrome when its tab process has died but the main process is still up.
set -eu
if ! systemctl is-active --quiet deepseek-bot-browser; then
  exit 0
fi
probe=$(mktemp)
trap 'rm -f "$probe"' EXIT
code=$(curl -sS -m 8 -o "$probe" -w '%{http_code}' -X PUT 'http://127.0.0.1:9223/json/new?about:blank' || true)
if [ "$code" != "200" ]; then
  systemctl restart deepseek-bot-browser
  exit 0
fi
target=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$probe" 2>/dev/null || true)
if [ -n "$target" ]; then
  curl -sS -m 8 -o /dev/null "http://127.0.0.1:9223/json/close/${target}" || true
fi
