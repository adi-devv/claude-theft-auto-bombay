#!/usr/bin/env bash
# Refresh work/<agent>/ from game/ (rsync -a --delete game/ work/<agent>/ without needing rsync). Usage: tools/sync-sandbox.sh <agent>
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; a="$1"; [[ -n "$a" ]] || { echo "usage: $0 <agent>"; exit 1; }
rm -rf "$ROOT/work/$a"; cp -R "$ROOT/game" "$ROOT/work/$a"; echo "synced work/$a from game/"
