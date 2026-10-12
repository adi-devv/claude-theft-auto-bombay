#!/bin/zsh
# Snapshot in-progress agent work to wip/<agent> branches WITHOUT touching the checked-out branch.
# Each wip/<agent> tree = main's tree + that agent's work/<agent>/, tools/<agent>/, notes/<agent>.md from disk.
# Usage: tools/snapshot-wip.sh [agent ...]     (default: all builders)
# Optional: SYNC_FROM=<dir> rsyncs work/ notes/ tools/ from another copy first (e.g. an old session folder).
setopt null_glob
ROOT="${0:A:h:h}"; cd "$ROOT" || exit 1
if [[ -n "$SYNC_FROM" && -d "$SYNC_FROM" ]]; then
  for d in work notes tools; do
    [[ -d "$SYNC_FROM/$d" ]] && rsync -a --exclude node_modules --exclude 'shots/' --exclude vendor/ --exclude .DS_Store "$SYNC_FROM/$d/" "$ROOT/$d/"
  done
fi
agents=("$@"); (( ${#agents} )) || agents=(city vehicles traffic peds police player)
git fetch -q origin 2>/dev/null
for a in $agents; do
  paths=(); for p in work/$a tools/$a notes/$a.md; do [[ -e $p ]] && paths+=$p; done
  (( ${#paths} )) || continue
  idx=$(mktemp)
  GIT_INDEX_FILE=$idx git read-tree main
  GIT_INDEX_FILE=$idx git add -A -- $paths
  tree=$(GIT_INDEX_FILE=$idx git write-tree); rm -f $idx
  parent=$(git rev-parse -q --verify refs/remotes/origin/wip/$a || git rev-parse main)
  if [[ "$(git rev-parse $parent^{tree})" == "$tree" ]]; then echo "wip/$a: unchanged"; continue; fi
  c=$(git commit-tree $tree -p $parent -m "WIP snapshot: $a $(date '+%Y-%m-%d %H:%M')")
  git push -q origin "${c}:refs/heads/wip/${a}" && echo "wip/$a: pushed ${c[1,7]}"
done
