#!/usr/bin/env bash
#
# Resets local state back to a blank slate so the next ./ci.sh run does every step of
# the pipeline instead of skipping ones it finds already done: stops any already-running
# backend/frontend processes (so ci.sh can bind its ports cleanly), drops the Postgres
# database entirely (so ensure_db.py recreates it, every migration reruns from scratch,
# and is_seeded.py finds it empty and reseeds), and clears build/test caches.
#
# It does NOT remove node_modules or .venv — ci.sh's install steps (npm install, uv
# sync) already run unconditionally on every invocation regardless of whether those
# exist, so wiping them would only add reinstall time without making ci.sh "do" any
# step it wasn't already doing.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [ -d "/opt/homebrew/opt/postgresql@16/bin" ]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

PGUSER="${PGUSER:-postgres}"
PGHOST="${PGHOST:-localhost}"
PGDATABASE="${PGDATABASE:-backend}"

section() {
  echo
  echo "======================================================================"
  echo "  $1"
  echo "======================================================================"
}

# Colored output: skip messages in blue, warnings in orange, errors in red.
# Falls back to plain text when stdout isn't a terminal (e.g. redirected to a log file).
if [ -t 1 ]; then
  C_SKIP=$'\033[38;5;33m'
  C_WARN=$'\033[38;5;208m'
  C_ERR=$'\033[38;5;196m'
  C_SUCCESS=$'\033[38;5;40m'
  C_RESET=$'\033[0m'
else
  C_SKIP=""
  C_WARN=""
  C_ERR=""
  C_SUCCESS=""
  C_RESET=""
fi

skip() { echo "${C_SKIP}$*${C_RESET}"; }
warn() { echo "${C_WARN}$*${C_RESET}" >&2; }
err() { echo "${C_ERR}$*${C_RESET}" >&2; }
success() { echo "${C_SUCCESS}$*${C_RESET}"; }

# ---------------------------------------------------------------------------
# Stop anything already running, so ci.sh can bind its ports cleanly.
# ---------------------------------------------------------------------------
section "Stopping any running ci.sh / backend / frontend processes"
pkill -f 'ci\.sh' 2>/dev/null || true
pkill -f 'flask --app run run' 2>/dev/null || true
pkill -f 'ng serve' 2>/dev/null || true
pkill -f 'npm start' 2>/dev/null || true
sleep 1
success "Done."

# ---------------------------------------------------------------------------
# Drop the Postgres database entirely.
# ---------------------------------------------------------------------------
section "Dropping the '$PGDATABASE' Postgres database"
if psql -U "$PGUSER" -h "$PGHOST" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" 2>/dev/null | grep -q 1; then
  psql -U "$PGUSER" -h "$PGHOST" -d postgres -c "DROP DATABASE \"$PGDATABASE\";"
  success "Dropped database '$PGDATABASE'."
else
  skip "Database '$PGDATABASE' doesn't exist — nothing to drop."
fi

# ---------------------------------------------------------------------------
# Clear build/test caches so builds and tests run from scratch too.
# ---------------------------------------------------------------------------
section "Clearing backend caches"
rm -rf "$BACKEND_DIR/.pytest_cache"
find "$BACKEND_DIR" -type d -name "__pycache__" -not -path "*/.venv/*" -exec rm -rf {} + 2>/dev/null || true
success "Done."

section "Clearing frontend build artifacts"
rm -rf "$FRONTEND_DIR/dist" "$FRONTEND_DIR/.angular"
success "Done."

echo
success "======================================================================"
success "  Reset complete — the next ./ci.sh run will do everything from scratch"
success "======================================================================"
