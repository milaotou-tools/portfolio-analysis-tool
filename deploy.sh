#!/usr/bin/env bash
set -euo pipefail

APP_NAME="portfolio-analysis-tool"
APP_DIR="/www/wwwroot/portfolio-analysis-tool"
PORT="3001"
PM2_NAME="portfolio-analysis-tool"

log() {
  printf '[deploy] %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[deploy] missing command: $1" >&2
    exit 1
  fi
}

require_cmd npm
require_cmd pm2

if [ ! -d "$APP_DIR" ]; then
  echo "[deploy] missing app directory: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

log "installing dependencies"
npm ci

log "building app"
npm run build

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  log "restarting pm2 process"
  pm2 restart "$PM2_NAME" --update-env
else
  log "starting pm2 process"
  pm2 start npm --name "$PM2_NAME" -- run start -- -p "$PORT" -H 0.0.0.0
fi

log "saving pm2 process list"
pm2 save

log "done"
