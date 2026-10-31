#!/bin/sh
set -e

# Reinstall only when the lockfile changes, such as after pulling a teammate's new dependency.
lock_hash=$(sha256sum package-lock.json | cut -d" " -f1)
if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$lock_hash" ]; then
  echo "Installing dependencies..."
  npm ci
  echo "$lock_hash" > node_modules/.lock-hash
fi

npm run db:migrate
npm run db:seed

exec npm run dev -- --hostname 0.0.0.0
