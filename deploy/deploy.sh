#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_PATH"

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[deploy] tidak ada commit baru"
  exit 0
fi

echo "[deploy] update $LOCAL -> $REMOTE"
if ! git merge --ff-only origin/main --quiet; then
  echo "[deploy] divergen → reset hard ke origin/main"
  git reset --hard origin/main
fi

if git diff --name-only "$LOCAL" "$REMOTE" -- package-lock.json | grep -q .; then
  echo "[deploy] package-lock berubah → npm ci"
  npm ci --no-audit --no-fund
fi

echo "[deploy] typecheck..."
if ! npx tsc --noEmit; then
  echo "[deploy] TYPECHECK GAGAL → bot TIDAK direstart, kode di VPS sudah ketarik tapi jangan dijalankan"
  exit 1
fi

npx pm2 reload nokos-bot --update-env || npx pm2 start npm --name nokos-bot --max-memory-restart 250M -- run start
npx pm2 reload nokos-reseller --update-env || npx pm2 start npm --name nokos-reseller --max-memory-restart 300M -- run reseller
npx pm2 save --force >/dev/null 2>&1 || true

echo "[deploy] selesai ✓"
