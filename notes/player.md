# Critic follow-up � READY (2026-11-01)

The seven requested fixes are in `work/player` only. The older report below describes an earlier build and its stub-system limitations are superseded by this follow-up. No integration into `game/` or git changes were made.

- Vehicle contact: a per-vehicle contact edge and down-state hit set prevent repeat damage from the same sustained encounter. `tools/player/contact-check.js`, `contacts-before.json` and `contacts-after.json`: the controlled 10 m/s continuous contact yielded four hits and death before, one hit and 67.8 health during get-up after. A separate car can still strike while down; separation and recovery re-arm later encounters. The controlled test uses a held vehicle rather than native traffic.
- Camera: a 0.18 m collision-volume sweep starts at the player, pulls in immediately and eases out. `tools/critic-onfoot/resume-camera.json` recorded 4/16 building contacts before; `tools/player/camera-check.json` recorded 0/16 after using the same real facade and W/Shift/Q orbit. Inspected the before and after `k02-camera-in-building-5.png` screenshots. At very short distances the player's body can fill or cross the view; the camera stays outside the sampled collider.
- Civilians: optional `pushFrom` is called defensively when present and player-side circle separation removes inward velocity. The controlled fallback test measured 0.445 m separation before versus 0.64 m (combined radii) after, and speed 3.33 versus 0.50 m/s. The optional future API was not present in this sandbox and is not independently integration-tested.
- Map close: `ui-check.json` records pointer lock true -> false -> true and yaw 3.142 -> 2.566 on mouse movement without another click; the critic's original lock stayed false. If relock is denied, a click-to-resume prompt is shown. The fallback denial path was not reproduced in Edge.
- Foot police: the full map draws living cop peds, with an offset when close to the player marker. Inspected `u03-cop-minimap.png` and `u04-cop-fullmap.png` against the critic screenshots; the spawned officer is represented near the arrow.
- Duplicate HUD label: `labels-before.json` shows both labels visible for Marine Drive; `labels-after.json` shows only the street, and both labels remain visible for a distinct area. Inspected `label-same.png` and `label-distinct.png` after transitions.
- Favicon: inline SVG in `index.html`; baseline produced 404 console errors, sandbox label test and smoke produced no console errors or 404s.

Final `node tools/smoke.js tools/player/shots` against `http://127.0.0.1:8765/work/player/?test=1` passed with empty `__game.errors` and no console warnings/errors. Contact, camera, UI and label checks also reported empty errors. Evidence and scripts are in `tools/player/`.


# Player & HUD — notes (work/player)

Status: DONE. Everything in the brief (A1–A6, B) is built and verified against the current integrated city and vehicles. `__game.errors` stays empty in every test. The only console error is a 404 for the favicon.

## Files (Player-owned)
- `src/player/player.js` — `createPlayer(game)` per CONTRACT, plus extras (`action`, `stamina`, `sprinting`, `guard`, `nearVehicle`, `airborne`, `maxHealth`, `lastDamageTime`, `footCam`, `driveCam`, `model`). Exports `circleVsOBB`.
- `src/player/playerModel.js` — low-poly protagonist (21 meshes, about 2.6k tris): printed open shirt over a white banian, jeans, sneakers, moustache. Procedural anims: idle breathing, walk/run/sprint with lean and bank, jump, 3-hit punch combo, guard, enter/exit, carjack pull, knock-down, tumble, get-up, busted hands-up/kneel, wasted collapse.
- `src/player/cameras.js` — `FootCamera` (over-shoulder orbit, pointer-lock mouse plus Q/E, auto-recentre, building pull-in via `collision.raycast`; overhead orbit when wasted), `AttractCamera` (title drift along Marine Drive), `CameraBlend` (0.45 s foot<->car hand-over).
- `src/player/sfx.js` — synthesised punch, footstep, fall and door sounds on the `sfx` bus.
- `src/ui/hud.js`, `src/ui/hudStyles.js` (injected CSS), `src/ui/mapRender.js` (pre-rendered map canvas and POI badges).

## Controls
- WASD / arrows: move (camera-relative) / drive.
- Shift: sprint (stamina). Alt: walk. Space: jump / handbrake.
- F / Enter: enter, exit, jack.
- J or left click (when the pointer is locked): punch.
- Mouse (captured on game start) or Q/E: orbit. In a car, Q/E look left/right and both together look back.
- H: horn (hold). C: `DriveCamera.cycleMode()`. L: siren (police car). R: reset a stuck car (<3 m/s).
- M: big map. P / Esc: pause. Esc also releases the mouse, which pauses.

## Interfaces used
- **Vehicle:** `driverDoor()`, `getOBB()`, `setControls()`, `horn(on)`, `sirenOn`, `speed`, `velocity`, `yawRate`, `applyImpulse`, `driver`, `wrecked`, `onFire`, `forward`, `gear`/`rpm` (speedo), optional `displayName`. Optional `driverSeat` (mesh-local Vector3) would show the player seated, but the vehicles' cabins are solid with painted-on glass, so the player stays hidden inside the car.
- **DriveCamera:** `update(dt, v, {yaw, pitch, active})` with mouse and Q/E look passed in, `reset()` on enter, `cycleMode()` on C, `release()` on exit. All done, as vehicles requested.
- **Peds (defensive):** `pedSystem.nearest(x,z,r,filter)`, `ped.knockDown(vx,vz,'player')`, `pedSystem.panicAround(x,z,r)`, plus a scan of `game.peds`. Peds and traffic are still stubs in the integrated game, so this path is tested only with fake peds and fake traffic drivers.
- **Wanted (defensive):** `level`, `flashing`, `seen`, `lastKnown`, `searchRadius`, `clear()`.
- **City:** `timeOfDay` (HUD clock), `setTimeOfDay(18.7)` when the title shows.

## Events emitted
`crime` {type:'punch'|'copAssault'|'carjack', x, z, victim} · `playerEnteredVehicle` {vehicle, jacked} · `playerExitedVehicle` {vehicle} · `wasted` · `busted` · `respawn` {x,z} · `playerHit` {vehicle, speed} (extra).
Listens: `vehicleCollision` (crash damage to the driver), `explosion` (blast damage and knockdown; own car exploding means wasted).

## HUD API (CONTRACT + extras)
`update, message(text,secs), notify(text, {kind:'radio', secs}?), bigText(text|null, 'wasted'|'busted'|'mission'), showTitle()`, plus `fadeTo(alpha, secs)`, `help(html, secs)`, `setPaused(bool)`, `toggleBigMap()`, `start()`, `titleVisible`.
`notify()`: text starting with "Radio/Control/Dispatch/Unit/Police", or `{kind:'radio'}`, gets a blue RADIO tag. "Name: text" bolds the speaker.

## Changes in the resume session
- **Title screen:** the "PRESS ENTER" line no longer overlaps the controls grid (new `.cta-foot` flex container, sizes scale with vh).
- **Pointer lock:** the mouse is captured on game start (the Enter or click is the user gesture), except with `?test=1`.
- **HUD scaling:** `gameUI` is zoomed with the viewport (0.8x to 1.6x, 1280x720 = 1.0).
- **Big map:** greedy label placement. POI labels try right, left, above, below. Street names are skipped where they would collide. Area names are clamped inside the map. The map is clean at 960x540 and 1280x720.
- **Pause card:** no more "MARINE DRIVE · MARINE DRIVE".
- **Car entry:** the approach timeout is 9 s (was 5), because walking round a bus took longer than 5 s. Arrival is now within 1 m after 1.2 s.
- **Wasted camera:** it now rises to look down at the body (pitch 1.0, closer), and busted gets a lower, closer orbit.
- **Burning car:** the player is warned ("Your car is on fire — get out!") and takes about 14 hp/s after 1.2 s, so they should bail (F) before the 4.5 s explosion. The explosion itself already made the player wasted, as vehicles asked.

## Test evidence (tools/player/)
- `t1.js`: camera-relative walking, Q orbit, sprint (7.6 m/s, stamina drains).
- `t2.js`: approach, enter, drive, bail tumble at 47 km/h (hp 100 to 88), carjack (event `crime` carjack).
- `t3.js`: title screen and Enter start, car hit at 62 km/h (hp 100 to 31), wasted (timeScale 0.3), respawn at the hospital (268,-474) with hp 100, busted, release at Azad Maidan (-23,-393), pause and map pause.
- `t4.js`: punch, combo, camera vs wall, police car exit.
- `t5.js`: camera pull-in against a building (1.58 m).
- `t6.js`: perf. `hud.update` 0.04 ms, `player.update` plus camera 0.024 ms, 132 draw calls and 626k tris for the whole game, 144 fps headless.
- `t9.js`: enter and exit from the far side for all 7 vehicle types. Cars take 2.0-2.5 s from 3 m away on the wrong side, the bus about 5.5 s. The player always exits on the right side (lx about -1.4 to -1.6 m).
- `t11.js`: own car at 0 health burns, the player takes damage, then the explosion makes the player wasted. Respawn follows.
- `walk_stress.js`: 80 random walks of 10 s each (WASD combos, sprint, yaw changes). No NaN, no escape from land, no stuck. 2 of 80 ended 0.01-0.02 m inside a building wall after a corner, which is not visible.
- `drive_tel.js` (player input path): sedan 0-50 in 2.25 s, 0-100 in 6.1 s (vehicles' own number is 6.08). Steering right at 49 km/h gives 7.6 degrees in 0.3 s and 56 degrees in 1 s.
- Visual: `v1.js` to `v6.js` and `poses.js` write screenshots to `tools/player/shots/`. `mont.js` builds montages.

## Known issues / limits
- Peds, traffic, police and wanted are still stubs, so these are untested against the real systems: real ped knock-down and panic, real traffic `eject()`, police blips and the search circle, and real `bust()` calls. The search-circle and police-blip rendering was tested with fake `wanted` fields and fake police vehicles.
- The player is hidden while in a car (solid cabin meshes), so there is no visible driver.
- The hospital respawn lands about 36 m from the hospital icon, on the nearest free footpath that is away from colliders and parked cars.
- A burning car makes the HUD damage flash every tick, which reads as a continuous red pulse. This is intended.
- No gamepad or touch support.

## Requests to other agents
- **Police:** call `game.player.bust()` for arrests, and provide `wanted.searchRadius`, `lastKnown`, `flashing`, `seen` for the minimap. Police cars should have `v.ai` set or `sirenOn`, or a non-player `driver`, to show on the minimap.
- **Peds:** `ped.state`, `ped.isCop`, `knockDown(vx, vz, 'player')`, `panicAround`. Cops on the minimap are `ped.isCop`.
- **Traffic:** `driver.eject()` must release the car immediately. The player sets `v.driver = 'player'` right afterwards.
- **Vehicles:** none outstanding.

