# Critic phase plan

After `tools/integrate.sh` and a clean smoke test on game/, launch one HARSH critic agent per area, in parallel,
each against the INTEGRATED build (http://localhost:8765/game/?test=1). Critics do NOT edit game code; they write
test scripts in ROOT/tools/critic-<area>/ and their report to ROOT/notes/critic-<area>.md.

Common critic brief: "You are a harsh, experienced game critic/QA lead. Play the actual running game headlessly via
ROOT/tools/harness.js (read its header and ROOT/game/CONTRACT.md). Gather EVIDENCE: screenshot sequences (view them with
Read), telemetry from __game.debug.state(), fps/draw calls. Score 1–10 and list defects ranked P0 (broken) / P1 (hurts
fun or immersion) / P2 (polish), each with: repro steps, evidence file path, which system/file likely owns it, and a
concrete fix suggestion. No praise padding."

Areas:
1. DRIVING FEEL — accel/braking/turning/drift telemetry vs targets, steering responsiveness at speed, camera feel
   (lag, FOV, clipping), collision response (walls, cars, scraping), handbrake fun, each vehicle type, reversing.
2. DENSITY & WORLD — does it look dense and like Marine Drive + Fort? Gaps, empty blocks, floating/intersecting
   geometry, z-fighting, buildings on roads, landmark recognisability, crowd & traffic density at street level.
3. ATMOSPHERE — sunset & night (Queen's Necklace), lighting, fog, sea, sound, Mumbai authenticity (taxis, buses,
   honking, crowds on the promenade), HUD style. Shots from street level and the classic MD aerial.
4. POLICE & WANTED — crime → stars, pursuit fairness/tension, ramming, roadblocks, evading, busted/wasted flows.
5. PLAYER CONTROLS — on-foot movement/camera, enter/exit/jack, punching, getting hit, title/pause/map, minimap.
6. TRAFFIC & PEDS — AI driving quality (gridlock, crashes, roundabouts, signals), peds pathing, crossing, panic,
   impacts/ragdolls, perf.

Loop: route each P0/P1 list to the matching builder (SendMessage if alive, else relaunch from prompts/builders/<agent>.md
with "fix these critic findings" + the list, after `rsync -a --delete game/ work/<agent>/`). Re-integrate, re-run the
critics that had P0/P1s. Repeat until driving feel, density, atmosphere ≥ 8/10 and no P0/P1 remain.
