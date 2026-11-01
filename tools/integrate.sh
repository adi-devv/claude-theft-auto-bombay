#!/usr/bin/env bash
# Copy each agent's OWNED files from work/<agent>/ into game/. Usage: tools/integrate.sh [agent ...]
# Plain bash (macOS, Linux, Git Bash on Windows).
set -e
shopt -s nullglob
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
G="$ROOT/game"; W="$ROOT/work"
agents=("$@"); (( ${#agents[@]} )) || agents=(city vehicles traffic peds police player)
for a in "${agents[@]}"; do
  S="$W/$a"
  [[ -d "$S" ]] || { echo "skip $a (no sandbox)"; continue; }
  case $a in
    city)     for f in "$S"/src/world/*; do b=$(basename "$f"); [[ $b == mapdata.js || $b == roads.js || $b == collision.js ]] && continue; rm -rf "$G/src/world/$b"; cp -R "$f" "$G/src/world/"; done ;;
    vehicles) rm -rf "$G/src/vehicles"; cp -R "$S/src/vehicles" "$G/src/" ;;
    traffic)  for f in "$S"/src/ai/traffic* "$S"/src/ai/signals*; do rm -rf "$G/src/ai/$(basename "$f")"; cp -R "$f" "$G/src/ai/"; done ;;
    peds)     for f in "$S"/src/ai/peds*; do rm -rf "$G/src/ai/$(basename "$f")"; cp -R "$f" "$G/src/ai/"; done; rm -rf "$G/src/characters"; cp -R "$S/src/characters" "$G/src/" ;;
    police)   for f in "$S"/src/ai/police*; do rm -rf "$G/src/ai/$(basename "$f")"; cp -R "$f" "$G/src/ai/"; done; rm -rf "$G/src/systems"; cp -R "$S/src/systems" "$G/src/" ;;
    player)   rm -rf "$G/src/player" "$G/src/ui"; cp -R "$S/src/player" "$S/src/ui" "$G/src/"; cmp -s "$S/style.css" "$G/style.css" || cp "$S/style.css" "$G/style.css" ;;
  esac
  echo "integrated $a"
done
