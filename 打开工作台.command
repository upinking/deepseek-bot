#!/bin/zsh
set -eu
cd -- "${0:A:h}"
workspace_url="${BOT_WORKSPACE_URL:-}"
if [[ -z "$workspace_url" && -f data/workspace-url.txt ]]; then
    IFS= read -r workspace_url < data/workspace-url.txt || true
fi
open "${workspace_url:-http://127.0.0.1:8765}"
