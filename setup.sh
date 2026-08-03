#!/usr/bin/env bash
# One-shot local setup for the External Trading Engine.
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${VENV_DIR:-.venv}"

info() { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$1"; }
fail() { printf '\033[31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

command -v "$PYTHON_BIN" >/dev/null 2>&1 || fail "$PYTHON_BIN not found on PATH"

PY_VERSION="$("$PYTHON_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
info "Using Python $PY_VERSION"
"$PYTHON_BIN" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
  || fail "Python 3.11 or newer is required (found $PY_VERSION)"

info "Creating virtual environment in $VENV_DIR"
"$PYTHON_BIN" -m venv "$VENV_DIR"

info "Installing Python dependencies"
"$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
"$VENV_DIR/bin/pip" install -r requirements-dev.txt

if [ ! -f .env ]; then
  cp .env.example .env
  GENERATED_KEY="$("$VENV_DIR/bin/python" -c 'import secrets; print(secrets.token_urlsafe(32))')"
  "$VENV_DIR/bin/python" - "$GENERATED_KEY" <<'PY'
import pathlib, sys
key = sys.argv[1]
path = pathlib.Path(".env")
path.write_text(
    path.read_text().replace("API_KEY=change_me_generate_a_long_random_value", f"API_KEY={key}")
)
PY
  info "Created .env with a generated API_KEY - add your provider keys next"
else
  warn ".env already exists, leaving it untouched"
fi

mkdir -p logs

info "Running the test suite"
"$VENV_DIR/bin/pytest" -q

if command -v pnpm >/dev/null 2>&1; then
  info "Installing JavaScript workspace dependencies"
  pnpm install
else
  warn "pnpm not found - skip if you only need the Python engine (npm i -g pnpm to install)"
fi

cat <<'NEXT'

Setup complete.

Next steps
  1. Edit .env and add your market data / broker keys.
  2. Keep DRY_RUN=true until you have validated signals end to end.
  3. Start the Python engine:   source .venv/bin/activate && python run.py
     Or the whole stack:        make docker-up
  4. Useful commands:           make help

NEXT
