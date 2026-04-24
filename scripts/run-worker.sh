#!/bin/bash
# Wrapper that launchd invokes to run the StreamHub worker.
# Loads env from .env.local and execs `npm run worker`.

set -euo pipefail

cd /Users/z/streamhub

# Make sure nvm-installed node + homebrew ffmpeg + user bin are on PATH.
export PATH="/Users/z/.nvm/versions/node/v22.19.0/bin:/opt/homebrew/bin:/usr/local/bin:/Users/z/bin:/usr/bin:/bin"

# Export every var from .env.local.
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
else
  echo "ERROR: .env.local not found in $(pwd)" >&2
  exit 1
fi

exec npm run worker
