# HANDOFF — Claude Theft Auto: Bombay

Read this first if you are a new Claude session (or a human) picking this project up.

## The original ask (verbatim intent)
Build a browser game "Claude Theft Auto Bombay" in **Three.js**, set ONLY in **Marine Drive + Fort** (Mumbai).
Mini-GTA: drive & walk freely in a dense, detailed recreation; working cars with good handling, pedestrians,
traffic, simple wanted/police system, get in/out of cars. Authentic atmosphere: sea on one side, Art Deco +
colonial buildings, streetlights, traffic, Mumbai coastal feel. Small dense map, quality over size.
**Process required by the user:** fan out sub-agents per system (city/layout, car physics & driving,
pedestrians & traffic, police, player controls); for each important piece use a **separate harsh critic agent
that checks the actual running game**; keep improving until driving feel, density, and atmosphere are genuinely good.

## Where it lives
- GitHub: https://github.com/adi-devv/claude-theft-auto-bombay (branch `main`; push to main auto-deploys
  `game/` to https://adi-devv.github.io/claude-theft-auto-bombay/ via .github/workflows/pages.yml)
- Local (original machine): `~/Desktop/claude-theft-auto-bombay`
- On a fresh machine/account: `git clone https://github.com/adi-devv/claude-theft-auto-bombay.git`, then run the
  setup below. Commit + push progress to `main` at the end of every phase so the next session can resume.

## Layout of this folder
```
game/                 the integrated, playable game (open via http server, see below)
  CONTRACT.md         architecture + ownership + interfaces — the source of truth for all agents
  index.html, style.css, src/main.js (architect-owned loop), src/core/*, src/world/{mapdata,roads,collision}.js
  src/world/city.js, src/vehicles/*, src/ai/*, src/systems/*, src/player/*, src/ui/*  (system files; may still be stubs)
  vendor/             three.js r169 + addons (vendored, no CDN)
work/<agent>/         per-agent sandbox copies of the game (city, vehicles, traffic, peds, police, player)
tools/
  harness.js          headless Chrome (playwright-core, channel 'chrome') play-test harness — read its header
  smoke.js            minimal smoke test:  node tools/smoke.js <outdir>
  mapview.mjs         top-down plan PNG:    node tools/mapview.mjs out.png
  integrate.sh        copy each agent's OWNED files from work/<agent>/ into game/:  tools/integrate.sh [agent...]
  <agent>/            each agent's test scripts + shots/
notes/<agent>.md      each builder's report (what was built, metrics, known issues, requests)
prompts/              exact briefs used for builder agents + the critic plan (re-launch from these)
```

## How to run
```bash
cd <this folder> && python3 -m http.server 8765 --bind 127.0.0.1
# game:            http://localhost:8765/game/          (?test=1 skips title screen)
# agent sandbox:   http://localhost:8765/work/<agent>/?test=1
# first time after a clone:
cd tools && npm i && cd ..                                    # playwright-core (uses installed Google Chrome)
for a in work/*/; do [ -d "$a/vendor" ] || cp -R game/vendor "$a/"; done   # sandboxes don't commit vendor/
```
Harness targets `GAME_URL` (default `http://localhost:8765/game/`). Headless Chrome WebGL2 works on this Mac (`--use-angle=metal`).

## Status (as of 2026-10-12)
- [x] Phase 0 — Architect foundation DONE: map data (compressed real layout, 25 named roads, roundabouts at
      Flora/Horniman/Regal, signals list, landmarks, parks, coast), RoadNetwork, StaticCollision (OBB/SAT, raycast, LOS),
      main loop (fixed 60 Hz), input/events/audio/rng, CONTRACT.md, stubs for every system, harness, integrate script.
      Smoke test passes at 60 fps on stubs.
- [~] Phase 1 — Six BUILDER agents launched in parallel (one per sandbox in work/): city, vehicles, traffic, peds,
      police, player(+HUD). Check `notes/<agent>.md` — **if a note exists, that builder finished**; if it does not,
      the builder was cut off: inspect `work/<agent>/` and relaunch it from `prompts/builders/<agent>.md`
      telling it to continue from the existing sandbox files rather than start over.
- [ ] Phase 2 — Integrate: `tools/integrate.sh` (all agents) → run `node tools/smoke.js` against game/, fix
      cross-system breakage (errors show in `__game.errors`). Architect may adjust only architect-owned files.
- [ ] Phase 3 — CRITIC round(s): see `prompts/critics.md`. One harsh critic per area runs the INTEGRATED game
      headlessly and returns ranked defects with evidence (screenshots/telemetry). Feed each critique back to the
      matching builder (in its sandbox, re-copy game/ shared files first), re-integrate, re-critique. Stop when
      driving feel, density and atmosphere critics all rate ≥ 8/10 with no P0/P1 issues.
- [ ] Phase 4 — Final polish + perf pass (< 600 draw calls, 60 fps), README with controls, deliver.

## Rules that keep parallel work safe
- Each agent edits ONLY its owned files (table in CONTRACT.md). Architect owns main.js, core/, mapdata/roads/collision.
- Builders work in `work/<agent>/` so a broken half-written module can't break other agents' tests.
- Before re-running a builder after integration, refresh its sandbox from game/ so it sees the other systems:
  `rsync -a --delete game/ work/<agent>/` THEN restore nothing (its owned files are already in game/ after integrate).

## Gotchas
- Heading convention: forward = (sin h, cos h); +Z is south; increasing heading turns LEFT; steer +1 = RIGHT.
- India drives on the LEFT; roundabouts clockwise; cars are right-hand drive (driver door on the right).
- `input.pressed()` consumes the edge — one owner per key (see key table in CONTRACT.md).
- Original session's scratch path (may still hold newer agent output if this copy was taken mid-run):
  `/Users/air/Library/Application Support/Claude/scratch-workspaces/dc37d11d-e944-49bb-8c36-f75de693d08a/23cb327e-2e33-4d7e-aa81-c3bd44618a8d/scratch-2026-10-12-84bbbd`
  If it still exists and has newer files in work/ or notes/, rsync them over:
  `rsync -a "<that path>/work/" work/ && rsync -a "<that path>/notes/" notes/ && rsync -a "<that path>/tools/" tools/`
