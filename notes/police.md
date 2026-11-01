# Police handoff

Status: implemented in `work/police/` and tested with the integrated city, vehicles, player and HUD. The sandbox still has stub traffic and peds. Police is ready for integration, with the limitations below.

## Owned files

- `src/systems/wanted.js`: witnessed crime heat and 0–5 stars, sightings, last-known position, search radius, escape timer, radio and `wantedChanged`.
- `src/ai/police.js`: patrols, dispatch, pursuit, search, roadblocks, crew, foot officers, baton and arrest, lifecycle and debug telemetry.
- `src/ai/policeNav.js`: road-graph routing, lane lookahead, speed planning, obstacle feelers and recovery using only `vehicle.setControls()`.
- `src/ai/policeFx.js`: fallback light bars, two nearest synthesized siren voices and fallback khaki officer model.

## Interfaces

`createWanted(game)` provides `level`, `heat`, `seen`, `lastKnown`, `searchRadius`, `flashing`, `escapeProgress`, `addCrime`, `reportSighting`, `setLevel`, `clear`, `update`. It listens to `crime`, `vehicleCollision`, `busted` and `wasted`, emits `wantedChanged`, and uses `hud.notify`. Escape requires continuous time outside the expanding circle: 10/15/22/28/35 seconds at stars 1–5. Cop assault raises the level to at least 2. LOS applies to cop witnesses.

`createPolice(game)` provides `update`, `frameUpdate`, `units`, `clearAll`, plus `witness`, `roadblocks`, `stats` and tuning. Cars have `ai`, a non-player cop `driver`, and `sirenOn`; police drives exclusively through `setControls`. Arrest calls `player.bust()` and avoids double-emitting `busted`. `game.debug.extra.police`, `wantedDetail`, and `game.debug.police` expose telemetry and scenario helpers.

When available, `pedSystem.spawnPed({x,z,heading,kind:'cop',controller})` must call `controller(ped,dt)` once per fixed step, with mutable `position`, `heading` and `velocity`; police owns that cop's movement. If absent, a police-owned mesh and a lightweight `game.peds` proxy expose position, state, `isCop` and `knockDown` to player/HUD; it is removed on cleanup. Police uses vehicle `driverDoor`, `getOBB`, `forward`, `right`, `speed`, `velocity`, `destroy`, and the road/collision interfaces from the contract.

## Evidence

Scripts use the shared `tools/harness.js`, 960×540 screenshots under `tools/police/shots/`. `scenarios.js`, `stress.js`, `verify.js`, and `interactions.js` exercise the system. Results in `results.jsonl` and `verify-results.txt`. Screenshots were visually inspected, including `police-detail.png` showing khaki officers, police jeep, flashing bar and minimap.

- At zero stars two patrols spawned. An unwitnessed hit yielded 0 stars; the same hit witnessed on Marine Drive yielded 1. A real player punch on a fallback cop yielded 2 stars and knocked the cop down; cleanup removed the proxy.
- One-star escape cleared after 10 seconds outside the circle; re-entry reset progress from 0.60 to 0. Both a foot arrest and a stopped-car door arrest called the player bust flow.
- In a scripted Marine Drive drive, pursuit closed to 23 m and a roadblock appeared by 10 seconds, with two registered contacts. Escalation reached five stars and the stopped player was arrested. This is a single deterministic scenario, not a broad balance study.
- Five-star 600-second stress: player teleported among six locations every five seconds to prevent an early arrest, with damage disabled. Sampled police cars remained 5–7, total vehicles 7–9, 516 units spawned and 509 recycled by the end; all sampled `game.errors` were empty. This stresses dispatch/recycling, not sustained close combat or roadblocks. The separate drive scenario exercised roadblocks and foot units.
- `__game.errors` remained empty in these tests. Browser console had a missing favicon 404. The required `tools/mapview.mjs` failed under the installed Node because `game/src/world/roads.js` was treated as CommonJS; no files outside ownership were changed to work around it.

## Known issues and requests

- Real peds and traffic were unavailable in this sandbox. Integration should verify the ped controller cadence, `remove()` behavior, cop knockdowns, civilian witnesses, siren yielding and crowded-road avoidance. Fallback cops are intentionally simple low-poly models.
- Siren synthesis and bar flashes run without errors, but the audio mix has not been evaluated by ear. Roadblock placement requires a moving suspect and suitable graph segment; placement can be delayed in short or obstructed stretches.
- The long soak uses teleports and does not establish 10 minutes of continuous close-range pursuit, audio quality, or frame-rate performance under fully integrated crowds and traffic. Balancing pursuit/escape against human driving remains advisable.
- Player/HUD: requested `bust()`, search fields and police vehicle markers are used. Vehicles: no additional interface changes requested. City: no additional changes requested.
