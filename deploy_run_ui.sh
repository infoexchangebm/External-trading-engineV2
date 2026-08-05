#!/usr/bin/env bash
set -euo pipefail

# Deploy External-trading-engineV2 UI on port 3300 and bring up stack
# This script expects docker and docker-compose (or docker-compose plugin) to be installed

PROJECT_DIR="/srv/projects/External-trading-engineV2"
cd "$PROJECT_DIR" || { echo "Failed to cd to $PROJECT_DIR"; exit 1; }

# Ensure .env exists and UI_PORT is set to 3300
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    touch .env
  fi
fi

if grep -q '^UI_PORT=' .env; then
  if ! grep -q '^UI_PORT=3300' .env; then
    sed -i 's/^UI_PORT=.*/UI_PORT=3300/' .env
  fi
else
  echo 'UI_PORT=3300' >> .env
fi

# Ensure API_KEY exists (dummy placeholder if missing for local setup)
if ! grep -q '^API_KEY=' .env; then
  echo 'API_KEY=changeme' >> .env
fi


echo "Using UI_PORT=$(grep '^UI_PORT=' .env | cut -d'=' -f2)"

# Detect docker-compose capability
if command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
elif command -v docker >/dev/null 2>&1; then
  # Check if docker-compose plugin is available as 'docker compose'
  if docker compose version >/dev/null 2>&1; then
    DC=(docker "compose")
  else
    echo "Docker-compose is required (or docker compose plugin)." >&2
    exit 2
  fi
else
  echo "Docker and docker-compose (or docker-compose plugin) are required." >&2
  exit 2
fi


echo "Bringing stack down (if running)..."
"${DC[@]}" down || true

echo "Building and starting stack..."
"${DC[@]}" up -d --build

echo "Dashboard should be available at http://<server-ip>:3300"
echo "If you are behind NAT or need a domain, configure DNS to point to this host and/or set up a reverse proxy as needed."

# Optional: attempt to fetch and print a probable public IP for quick link hint
if command -v curl >/dev/null 2>&1; then
  IP=$(curl -s http://ifconfig.me || true)
  if [ -n "$IP" ]; then
    echo "Public IP detected: $IP"
    echo "Try: http://$IP:3300"
  fi
fi
