#!/usr/bin/env bash
#
# Local CI/CD-style pipeline for the Motor Asset Manager app:
#   backend  (Flask + SQLAlchemy + Postgres) install -> migrate -> test -> build
#   frontend (Angular 20)                    install -> test -> build
# then starts both applications and waits for them to become healthy.
#
# Usage:
#   ./ci.sh              full pipeline: install, migrate, test, build, seed, run
#   SKIP_SEED=1 ./ci.sh   same, but don't reseed the database
#   SKIP_RUN=1  ./ci.sh   stop after build (no servers started) — the "CI" part only
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-5000}"
FRONTEND_PORT="${FRONTEND_PORT:-4200}"

export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg2://postgres:postgres@localhost:5432/backend}"

# Homebrew's postgresql@16 isn't on PATH by default on macOS; harmless elsewhere.
if [ -d "/opt/homebrew/opt/postgresql@16/bin" ]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

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
# Backend
# ---------------------------------------------------------------------------
section "Backend: install dependencies (uv sync)"
(cd "$BACKEND_DIR" && uv sync)

section "Backend: checking Postgres connectivity (creating the database if missing)"
if ! (cd "$BACKEND_DIR" && uv run python scripts/ensure_db.py); then
  err "Postgres server is not reachable at DATABASE_URL=$DATABASE_URL"
  err "Start it first, e.g.:"
  err "  brew services start postgresql@16          # Homebrew Postgres"
  err "  docker compose -f $BACKEND_DIR/docker/docker-compose.yml up -d db   # Docker"
  exit 1
fi

section "Backend: apply database migrations"
(cd "$BACKEND_DIR" && uv run flask --app run db upgrade)

section "Backend: run test suite (pytest)"
(cd "$BACKEND_DIR" && uv run pytest)

section "Backend: build Docker image"
if command -v docker >/dev/null 2>&1; then
  (cd "$BACKEND_DIR" && docker build -t motor-asset-backend -f docker/Dockerfile .)
else
  skip "Docker not found — skipping backend image build (uv/Flask still work locally)."
fi

if [ "${SKIP_SEED:-0}" = "1" ]; then
  skip "SKIP_SEED=1 set — skipping seed step."
elif (cd "$BACKEND_DIR" && uv run python scripts/is_seeded.py); then
  skip "Seed data already present — skipping seed.py."
else
  section "Backend: seed demo data"
  (cd "$BACKEND_DIR" && uv run python scripts/seed.py)
fi

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
section "Frontend: install dependencies (npm install)"
(cd "$FRONTEND_DIR" && npm install)

section "Frontend: run test suite (Karma/Jasmine, headless)"
(cd "$FRONTEND_DIR" && npx ng test --watch=false --browsers=ChromeHeadless)

section "Frontend: production build"
(cd "$FRONTEND_DIR" && npx ng build)

if [ "${SKIP_RUN:-0}" = "1" ]; then
  skip "SKIP_RUN=1 set — stopping after build (not starting the dev servers)."
  exit 0
fi

# ---------------------------------------------------------------------------
# Run both applications
# ---------------------------------------------------------------------------
section "Starting backend (Flask) on :$BACKEND_PORT"
(cd "$BACKEND_DIR" && uv run flask --app run run --port "$BACKEND_PORT") &
BACKEND_PID=$!

section "Starting frontend (Angular dev server) on :$FRONTEND_PORT"
(cd "$FRONTEND_DIR" && npm start -- --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

cleanup() {
  echo
  echo "Stopping backend ($BACKEND_PID) and frontend ($FRONTEND_PID)..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

section "Waiting for both servers to become healthy"
until curl -sf "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null 2>&1; do sleep 1; done
success "Backend healthy:  http://127.0.0.1:$BACKEND_PORT"

until curl -sf "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; do sleep 1; done
success "Frontend healthy: http://localhost:$FRONTEND_PORT"

echo
success "Both applications are running:"
success "  Backend:  http://127.0.0.1:$BACKEND_PORT  (docs at /apidocs)"
success "  Frontend: http://localhost:$FRONTEND_PORT"
echo
echo "Press Ctrl+C to stop both."
wait
