# Claude Theft Auto: Bombay — architecture contract

A mini-GTA in Three.js (r169, vendored at `vendor/`, import as `'three'` / `'three/addons/...'`), set ONLY in
Marine Drive + Fort, South Bombay. Plain ES modules, no build step. Served at `http://localhost:8765/`
(`python3 -m http.server 8765` from `game/`). `?test=1` skips the title screen.

Quality bar: dense, atmospheric, fun to drive. Dusk over the Arabian Sea, the "Queen's Necklace" of
sodium streetlights curving along Marine Drive, Art Deco facades, Victorian Gothic in Fort, black-and-yellow
Premier Padmini taxis, red BEST buses, honking, crowds on the promenade. **No autorickshaws** (they are
banned in South Bombay — authentic detail). India drives on the **LEFT**; vehicles are right-hand drive.

## Coordinates & conventions (everyone)
- Metres. +X east, +Z south (north is −Z). +Y up. Ground y = 0. Sea level `roads.coast.seaLevel` (−1.6).
- **Heading** `h`: forward vector = `(sin h, cos h)` in XZ. Build models facing **+Z**; set `mesh.rotation.y = h`.
  Increasing `h` turns LEFT (counter-clockwise seen from above).
- "Left of direction (tx,tz)" = `(tz, −tx)`. "Right" = `(−tz, tx)`.
- Fixed simulation step 1/60 s. `update(dt)` = fixed step (physics/AI). `frameUpdate(dt)` = once per rendered frame (visual-only work).
- Randomness: `game.rng()` (seeded) for anything gameplay-relevant.

## Main loop (src/main.js — architect-owned, do NOT edit)
fixed step: `player.update` → `traffic.update` → `police.update` → each `vehicle.update` → `resolveVehicleCollisions(game, dt)` → `pedSystem.update` → `wanted.update`
per frame: `player.updateCamera` → `city.update` → each `vehicle.frameUpdate` → `pedSystem.frameUpdate` → `police.frameUpdate` → `hud.update` → render (through `game.composer` if the city sets one).
Exceptions thrown by a system are caught and logged once to `game.errors` — keep it empty.

## The `game` object
`THREE, renderer, scene, camera, params, input, events, audio, rng, roads, collision, vehicles[], peds[],
city, player, traffic, pedSystem, police, wanted, hud, time, fps, paused, timeScale, started, testMode,
composer, debug, errors, createVehicle(opts)`.

## Shared modules (architect-owned; read them, don't fork them)
- `src/world/mapdata.js` — nodes, roads, parks, landmarks, monuments, coast, spawn, area names. **Frozen** during the build phase except
  you may *add* data your system needs (e.g. parking spots, pedestrian crossings, spawn points) in a clearly marked section of your own.
- `src/world/roads.js` — `RoadNetwork`: `edges[]` (`pts`, `cum`, `length`, `width`, `lanes`, `laneWidth`, `median`, `kind`, `a`, `b`, `name`),
  `nodes` (Map; `x,z,radius,roundabout,exit,edges:[{edge,dir}]`), `sample(edge,s)`, `lanePoint(edge,s,dir,lane)`, `laneOffset`,
  `nearest(x,z,maxDist)` → `{edge,s,x,z,tx,tz,dist,lateral}`, `junctionAt`, `isOnRoad`, `roadNameAt`, `areaNameAt`, `land` (polygon),
  `seaEdge` (Marine Drive promenade sea edge, south→north), `isLand`, `parkAt`, `randomLanePoint(rng, filter)`, `bounds`.
  Lanes: travel a→b uses the half LEFT of the a→b tangent; lane 0 = kerb-side.
- `src/world/collision.js` — `StaticCollision`: `addBox(cx,cz,hw,hd,rot,{h,tag})`, `addCircle`, `addSegment`, `addPolyline`,
  `queryCircle`, `resolveCircle(x,z,r)`, `queryOBB(cx,cz,hw,hd,rot)` → contacts `{nx,nz,depth,px,pz,shape}` (n pushes the box OUT),
  `raycast(x,z,dx,dz,max,minH)`, `lineOfSight(x1,z1,x2,z2,minH)`, `queryAABB`. Export `obbOverlap(A,B)` for dynamic box pairs.
  Static only: buildings, walls, poles, trees, fountains, sea wall. Moving things (cars, peds) are NOT in it.
- `mapdata.js` also exports `STREET` (footpath/promenade/kerb cross-section — city builds it, peds walk it) and
  `SIGNALS` (junction ids that get traffic lights; Traffic owns the lights, City keeps those corners clear).
- `src/core/input.js` — `down(code)`, `pressed(code)` (edge, consumed on read: one owner per key), `axis`, `consumeMouse()`, `setKey` (tests).
- `src/core/events.js`, `src/core/audio.js` (`game.audio.bus('engine'|'sfx'|'ambient'|'siren'|'ui')`, `noiseBuffer()`, lazy & gesture-unlocked),
  `src/core/rng.js`.

## Key bindings (one owner each)
| Key | Action | Owner |
|---|---|---|
| W/S/A/D, arrows | drive / walk | Player |
| Space | handbrake (car) / jump (foot) | Player |
| Shift | sprint (foot) | Player |
| F or Enter | enter / exit / carjack | Player |
| H | horn | Player (calls `vehicle.horn()`) |
| C | cycle camera | Player (drive cam modes via DriveCamera) |
| Mouse (pointer lock) / Q,E | orbit camera | Player |
| J or left click | punch | Player |
| M | big map toggle | Player/HUD |
| R | flip / reset stuck car | Player |
| T | cycle time of day | City |
| P / Esc | pause | Player/HUD |
| L | toggle siren (when in a police car) | Player (sets `vehicle.sirenOn`) |

## Ownership (edit ONLY your files; add new files under your folders freely)
| Agent | Files |
|---|---|
| City | `src/world/city.js` and any new `src/world/*` except mapdata/roads/collision |
| Vehicles | `src/vehicles/**` (vehicle.js, collisions.js, driveCamera.js, models, engine audio) |
| Traffic | `src/ai/traffic.js`, new `src/ai/traffic*/` or `src/ai/signals.js` (traffic signal logic AND signal-head visuals at `SIGNALS` junctions) |
| Peds | `src/ai/peds.js`, `src/characters/**`, new `src/ai/peds*` files |
| Police | `src/ai/police.js`, `src/systems/wanted.js`, new `src/systems/*` |
| Player | `src/player/**`, `src/ui/**`, `style.css` (HUD rules go in src/ui, injected) |

If you need something from another system, code against the interface below defensively (`game.hud?.message?.(...)`)
and write the request in `notes/<your-agent>.md`. Never edit another agent's file.

## Interfaces

### Vehicle (`src/vehicles/vehicle.js`: `export class Vehicle`, `export function createVehicle(game, opts)`)
`opts`: `{ type, x, z, heading, color?, parked? }`. Types: `'taxi'` (Padmini kaali-peeli), `'sedan'`, `'hatch'`, `'suv'`,
`'bus'` (BEST double-decker, red), `'police'` (white/blue Mumbai Police), `'van'`. Constructor adds `mesh` to scene and itself to `game.vehicles`.
Fields: `type, isPolice, mesh, position (Vector3, y≈0), heading, velocity (Vector3, world), yawRate, length, width, mass,
health (0..1000), wrecked, driver (null | 'player' | object with optional eject()), ai (owner's controller or null),
sirenOn, controls {throttle 0..1, brake 0..1, steer −1..1 (+1 = RIGHT), handbrake bool}`.
Getters/methods: `forward {x,z}`, `right {x,z}`, `speed` (signed forward m/s), `setControls(partial)`, `applyImpulse(ix,iz,px,pz)`,
`driverDoor()` → `{x,z}` (driver sits on the RIGHT — RHD), `horn(on?)`, `damage(amount, {x,z})`, `getOBB()` → `{cx,cz,hw,hd,rot}`,
`update(dt)` (physics + static collision via `game.collision.queryOBB`), `frameUpdate(dt)` (visual sync, wheels, lights), `destroy()`.
Brake semantics (GTA-style): `brake` while moving forward brakes; when nearly stopped it reverses. AI uses the same controls.
Lights: headlights/taillights on when `game.city.isNight` (or `game.city.lightLevel < x`); brake lights when braking.

### Vehicle collisions (`src/vehicles/collisions.js`)
`resolveVehicleCollisions(game, dt)`: vehicle↔vehicle impulses. Emit `'vehicleCollision' {a, b, impulse, x, z}`.

### DriveCamera (`src/vehicles/driveCamera.js`: `export class DriveCamera`)
`new DriveCamera(game)`, `update(dt, vehicle, look = {yaw, pitch, active})`, `reset()`, `cycleMode()`, `mode`. Must avoid clipping into buildings.

### Characters (`src/characters/humanoid.js`, Peds-owned)
`createHumanoid(opts)` → `{ group, update(dt, {speed, state}) }` — a generic single character (e.g. for cutscene-ish use).
Crowds must NOT use one Group per ped — use instancing. The **player's** own model + animations live in `src/player/` (Player-owned).

### Peds (`src/ai/peds.js`: `export function createPeds(game)` → pedSystem)
`game.peds[]` entries: `{ position (Vector3), heading, velocity, radius, state ('walk'|'idle'|'flee'|'down'|'dead'|'driver'),
health, isCop, knockDown(vx, vz, source), panic(x, z), remove() }`.
pedSystem: `update(dt)`, `frameUpdate(dt)`, `spawnPed(opts)` → ped (`opts`: `{x, z, heading, kind:'civ'|'cop'|'driver', controller?(ped, dt)}` —
a `controller` takes over that ped's movement each step, e.g. Police drives foot cops; kind 'cop' renders a khaki Mumbai Police uniform), `nearest(x,z,r, filter)`, `panicAround(x,z,r)`.
Peds own ped↔vehicle impacts: on impact emit `'pedHit' {ped, vehicle, speed}` and, if caused by the player's vehicle,
`'crime' {type:'pedHit'|'pedKilled', x, z}`. Use `vehicle.applyImpulse` for the small reaction on the car.

### Traffic (`src/ai/traffic.js`: `export function createTraffic(game)`)
Spawns/despawns AI vehicles around the player along lanes, follows lanes with the vehicle `controls`, junction
handling (incl. roundabouts — clockwise, left-hand traffic), yields, keeps distance, honks, reacts to the player and
to sirens (pull over to the left). Also parked cars along kerbs. AI drivers are `vehicle.driver = {kind:'traffic', eject()}`;
`eject()` must release the car (stop AI control) and spawn a ped at `vehicle.driverDoor()` who flees.

### Wanted (`src/systems/wanted.js`: `export function createWanted(game)`)
`{ level (0..5), heat, seen, lastKnown {x,z}, update(dt), addCrime(type, x, z), reportSighting(x,z), setLevel(n), clear(), flashing }`.
Listens to `'crime'` events: `{type, x, z, victim?}`; types: `pedHit, pedKilled, carjack, vehicleRam, copAssault, punch, policeRam`.

### Police (`src/ai/police.js`: `export function createPolice(game)`)
Spawns pursuit cars/foot cops by wanted level, chase/ram/box-in AI, roadblocks at 3+, sirens + light bars, line-of-sight
via `collision.lineOfSight` → `wanted.reportSighting`, arrest via `player.bust()`. Police cars use Vehicle + controls.

### Player (`src/player/player.js`: `export function createPlayer(game)`)
`{ mode ('foot'|'vehicle'), state ('normal'|'busted'|'wasted'|'respawning'), position (Vector3), heading, velocity, vehicle,
health 0..100, radius, update(dt), updateCamera(dt), enterVehicle(v, {instant}), exitVehicle(), teleport(x,z,h), damage(n, source),
bust(), wasted() }`. Owns on-foot movement/animation, enter/exit (walk to door, jack driver via `driver.eject()` → `'crime' carjack`),
cameras (on-foot orbit cam; delegates to DriveCamera in vehicles), input mapping, punching, respawn (hospital / police station).

### HUD (`src/ui/hud.js`: `export function createHUD(game)`)
`{ update(dt), message(text, secs), bigText(text, style), notify(text), showTitle() }`. Title screen (sets `game.started = true`),
minimap (roads, player arrow, police blips, landmarks), speedometer, health, wanted stars, street + area name on change,
BUSTED / WASTED overlays, pause & help overlay, big map (M).

### City (`src/world/city.js`: `export async function createCity(game)`)
Returns `{ update(dt), setTimeOfDay(h), timeOfDay, isNight, lightLevel, sunDir }`. Builds ground, roads (markings, zebra crossings,
footpaths/kerbs), sea + sea wall + tetrapods + promenade, buildings (Art Deco, Victorian Gothic, Fort blocks), landmarks, maidans, trees,
streetlights (the Necklace), props, sky, fog, lighting, shadows, ambient audio. Registers ALL static colliders.
Must also register the land boundary (sea wall / map edges) as colliders.

## Events catalogue
`'crime' {type,x,z,victim?}` · `'pedHit' {ped,vehicle,speed}` · `'vehicleCollision' {a,b,impulse,x,z}` · `'playerEnteredVehicle' {vehicle, jacked}` ·
`'playerExitedVehicle' {vehicle}` · `'explosion' {x,z,radius}` · `'panic' {x,z,radius}` (gunshot-like scare: crash, explosion, siren burst) · `'busted' {}` · `'wasted' {}` · `'respawn' {x,z}` · `'wantedChanged' {level, prev}` · `'ready'` · `'resize'`.

## Debug / tests
`window.__game.debug`: `state()`, `teleport(x,z,h)`, `spawnCar(type)`, `setTime(h)`, `setWanted(n)`, `step(seconds)`;
add your own via `game.debug.extra.<name> = () => ({...})` (included in `state()`) and `game.debug.<fn>`.
Headless harness: `tools/harness.js` (see header). Example: `node tools/smoke.js <outdir>`. Top-down plan: `node tools/mapview.mjs out.png`.

## Performance budget (whole game, 1280×720, M-series Mac)
60 fps. < 600 draw calls, < 1.5 M triangles. Merge static geometry by material, use `InstancedMesh` for repeated
props / crowds / wheels, canvas-generated textures (no external assets), at most ONE shadow-casting light, no per-car
real-time point lights (use emissive + sprites/fake cones), dispose what you remove.
