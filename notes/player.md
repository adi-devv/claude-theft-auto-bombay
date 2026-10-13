# Player & HUD — notes (work/player)

Status: IN PROGRESS (on-foot + camera + enter/exit done; HUD written; testing ongoing).

## Files (Player-owned)
- `src/player/player.js` — `createPlayer(game)` per CONTRACT + extras (`action`, `stamina`, `sprinting`, `guard`, `nearVehicle`, `airborne`, `maxHealth`, `lastDamageTime`, `footCam`, `driveCam`, `model`). Exports `circleVsOBB`.
- `src/player/playerModel.js` — low-poly protagonist (printed open shirt over white banian, rolled jeans, sneakers, moustache) + procedural anims (idle breathing, walk/run/sprint w/ lean & bank, jump, 3-hit punch combo, guard, enter/exit, carjack pull, knock-down, tumble, get-up, busted hands-up/kneel, wasted collapse, seated).
- `src/player/cameras.js` — FootCamera (over-shoulder orbit, pointer-lock mouse + Q/E, auto-recenter, building pull-in via `collision.raycast`), AttractCamera (title drift along Marine Drive), CameraBlend (0.45 s foot<->car hand-over).
- `src/player/sfx.js` — synthesized punch/footstep/fall/door sounds on the `sfx` bus.
- `src/ui/hud.js`, `src/ui/hudStyles.js` (injected CSS), `src/ui/mapRender.js` (pre-rendered map canvas + POI badges).

## Controls
WASD/arrows move (camera-relative) / drive · Shift sprint (stamina) · Alt walk · Space jump / handbrake · F/Enter enter-exit-jack ·
J or left click (when pointer locked) punch · mouse (click canvas to lock) or Q/E orbit (in car: Q/E look left/right, both = look back) ·
H horn (hold) · C DriveCamera.cycleMode() · L siren (police car) · R reset stuck car (<3 m/s) · M big map · P/Esc pause.

## Interfaces used
- Vehicle: `driverDoor()`, `getOBB()`, `setControls()`, `horn(on)`, `sirenOn`, `speed`, `velocity`, `yawRate`, `applyImpulse`, `driver`, `wrecked`, `forward`, optional `gear`/`rpm` (speedo), optional `displayName`, optional `driverSeat` (Vector3 in mesh-local space → player shown seated; otherwise hidden in car).
- DriveCamera: `update(dt, v, {yaw,pitch,active})`, `reset()`, `cycleMode()`, `release()` (called on exit).
- Peds (defensive): `pedSystem.nearest(x,z,r,filter)`, `ped.knockDown(vx,vz,'player')`, `pedSystem.panicAround(x,z,r)`; also scans `game.peds`.
- Wanted (defensive): `level`, `flashing`, `seen`, `lastKnown`, `searchRadius`, `clear()`.
- City: `timeOfDay` (HUD clock), `setTimeOfDay(18.7)` when the title screen shows.

## Events emitted
`crime` {type:'punch'|'copAssault'|'carjack', x, z, victim} · `playerEnteredVehicle` {vehicle, jacked} · `playerExitedVehicle` {vehicle} ·
`wasted` {} · `busted` {} · `respawn` {x,z} · `playerHit` {vehicle, speed} (extra: player hit by a car).
Listens: `vehicleCollision` (crash damage to driver), `explosion` (damage/knockdown; own car exploding → wasted).

## HUD API (CONTRACT + extras)
`update, message(text,secs), notify(text, {kind:'radio', secs}?), bigText(text|null, 'wasted'|'busted'|'mission'), showTitle()` +
`fadeTo(alpha, secs)`, `help(html, secs)`, `setPaused(bool)`, `toggleBigMap()`, `start()`, `titleVisible`.
notify(): text starting with "Radio/Control/Dispatch/Unit/Police" or `{kind:'radio'}` gets a blue RADIO tag; "Name: text" bolds the speaker.

## Requests
- Vehicles: optional `driverSeat` (THREE.Vector3, mesh-local hip point) so the player can be shown seated; optional `displayName`.
- Police: provide `wanted.searchRadius` + `lastKnown` + `flashing` for the minimap search circle.
