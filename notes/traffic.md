# Traffic (AI cars, parked cars, signals)

Status: complete and integrated in the sandbox `work/traffic/`. Copy the five owned files below into `game/src/ai/`.

## Files (all in `work/traffic/src/ai/`)
- `traffic.js` - `createTraffic(game)`: population, parked cars, eject, reactions (rammed, sirens, honks), watchdog, recovery, debug hooks.
- `trafficNet.js` - lane network: immutable lane / connector pieces, conflict tables, stop margins, `obstructed()` / `passable()` static-prop checks.
- `trafficDriver.js` - `Driver`: pure pursuit + IDM + stop-line leader, perception (OBB corridor vs vehicles and peds), junction state.
- `trafficJunction.js` - `Arbiter`: gap-acceptance grants for junctions, signals and roundabouts (grant is never revoked).
- `signals.js` - `createSignals(game, net)`: phases for `SIGNALS`, instanced heads, additive glow.
- Test scripts: `tools/traffic/` (`t2.js` overlap log, `t8.js` roundabouts / GATE / eject / siren, `t11.js` teleport tour, `t13.js` obstruction scan, `t16.js` corner error).

## Interfaces provided
- `createTraffic(game)` returns `T` with `update(dt)`; `game.traffic = T` (as in CONTRACT).
- Driver object on a moving car: `v.driver = v.ai = Driver` with `kind: 'traffic'`, `eject()`. `eject()` releases the car immediately, sets zero controls (handbrake if slow), spawns a fleeing ped at `driverDoor()` via `pedSystem.spawnPed({kind:'driver'})` (guarded, panics it if `ped.panic` exists), and tracks the car as abandoned (recycled when far / out of sight). The player then sets `v.driver = 'player'`.
- `game.debug.extra.traffic()` returns `{active, parked, stuck, avgSpeedKmh, collisionsLastMin, aiHitsTotal, waiting, buses, abandoned, msPerStep, msMax, grants, forced, honks, recycled, why}`.
- `game.debug.traffic` = `{T, net, sig, resetPerf(), log(on)}`; `log(true)` fills `T.hitInfo` with AI-AI overlaps.
- `signals.state(node, approachKey)` -> `{s: 0 green|1 amber|2 red, t}`; `debugSet(nodeId, groupIndex)`.

## Interfaces used
`game.roads` (edges, nodes, `laneOffset`, `sample`, `nearest`), `game.collision.queryOBB`, `game.createVehicle`, `vehicle.setControls / horn / driverDoor / sirenOn / wake / destroy`, `steerLimit` (physics.js), `bodyBox`, `game.peds`, `game.pedSystem.spawnPed`, `game.camera` (frustum visibility), `game.events` (`vehicleCollision`), `SIGNALS` from mapdata.

## Behaviour summary
- 40 moving cars (+10 when the camera is far from the player), ~40% taxis, up to 4 buses on boulevard / arterial, 22-27 parked cars. Spawn 120-235 m, out of view; despawn beyond 255 m (300 m hard) or at map exits (front bumper passes the lane end).
- Left-hand lanes, speed per road kind (Marine Drive about 55-70 km/h free flow), curvature-limited, 2 s-ish headways, emergency brake, peds in the look-ahead corridor.
- Junction arbiter with time-window gap acceptance, no blocking the box, signals with amber logic, roundabouts circulate clockwise and yield to circulating cars, GATE dead end U-turns, exits despawn.
- Blocked more than 3 s: honk; pass or lane change; reverse (only if the rear is clear); deadlock cycles detected; recovery re-snaps to the nearest lane or recycles.
- Sirens within 48 m behind: pull over to the left kerb and stop, resume 2.5 s after the siren ends.
- Rammed by the player (impulse above 700): flee / stop / angry honk.

## Metrics (headless, 5 minute `debug.step` runs, 960x540)
- Stationary run 300 s: active 40, parked 27, stuck 0, AI-AI overlaps (more than 9 cm) 0, recycled 0.
- Teleport tour of 14 junctions (about 560 s): 0 overlaps, stuck 0-2 (red-light waits at DN2).
- Roundabouts FLORA / HORN / REGAL: 100% clockwise samples (0 counter-clockwise). GATE: 23 U-turns in 150 s.
- Signals: heads visible day and night (screenshots checked); stop at red, go at green.
- Perf: `msPerStep` 0.10-0.16 ms average (limit 1.5). One-off spikes up to about 50-150 ms on first seed or teleport come from `createVehicle` (reduced by spreading seeding over 24 ticks).
- No `__game.errors` in any run.

## Known issues
- The City places railings / trees across several pieces of Hazarimal Somani Marg and the KBP_VN junction box, X1 box, and one landmark on Esplanade Lane. Traffic avoids those pieces by routing and spawn weights (`net.obstructed` / `passable`), so these roads carry little traffic.
- Conflict windows are estimates; a crossing car can still stop in the box for a few seconds when a granted car stalls (resolved by the watchdog).
- Average speed counts cars waiting at signals (about 17-25 km/h); moving cars on Marine Drive reach 14-17 m/s.
- `msMax` spikes on mass reseeding after teleports are not completely removed.

## Requests to other agents
- City: open railings and move trees off the carriageway on Hazarimal Somani Marg (near KBP_VN at about (-96, 80), and near X1 at (-87, -11) / (-86, -30)) and the landmark footprint on Esplanade Lane near (-68, 302). Keep the signal corners clear as already agreed.
- Peds: provide `pedSystem.spawnPed({kind:'driver'})` returning a ped (optionally with `panic(x, z)`); traffic guards for its absence.
- Police: set `vehicle.sirenOn` while the siren runs; traffic reads it.
