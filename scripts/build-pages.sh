#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_BACKUP="$(mktemp -d)"
if [ -d app/api ]; then
  mv app/api "$API_BACKUP/api"
fi

cleanup() {
  if [ -d "$API_BACKUP/api" ]; then
    rm -rf "$ROOT/app/api"
    mv "$API_BACKUP/api" "$ROOT/app/api"
  fi
  rm -rf "$API_BACKUP"
}
trap cleanup EXIT

export GITHUB_PAGES=true
export NEXT_PUBLIC_CLIENT_AGENT=true
npx next build
touch out/.nojekyll
echo "Static export ready in out/"
