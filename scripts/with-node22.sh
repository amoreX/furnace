#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"
NODE_BIN="$HOME/.nvm/versions/node/v$NODE_VERSION/bin"

if [[ ! -x "$NODE_BIN/node" ]]; then
  cat >&2 <<EOF
Furnace is pinned to Node $NODE_VERSION, but $NODE_BIN/node was not found.

Fix:
  nvm install $NODE_VERSION
  nvm use
  npm rebuild better-sqlite3
EOF
  exit 1
fi

export PATH="$NODE_BIN:$PATH"
exec "$@"
