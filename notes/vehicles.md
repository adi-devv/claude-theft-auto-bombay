# Vehicles — build notes

Owner: VEHICLES agent. Code: `work/vehicles/src/vehicles/**`. CONTRACT.md Vehicle / collisions / DriveCamera interfaces kept exactly; the extras listed below are additive.

## What was built

| File | Contents |
|---|---|
| `tuning.js` | Per-type specs (pure data, no three.js) + derivation (axle split, inertia, final drive from redline/vmax, drag from vmax, tyre B factors). `torqueAt()`, `PALETTE`. |
| `physics.js` | Pure physics (no three.js, also runs in node): steering ramp + speed/grip-limited lock, GTA pedal logic, auto gearbox, two-axle tyre model, brakes, handbrake, assists, substeps, static collisions, sleep, LOD step. |
| `vehicle.js` | `Vehicle` class (CONTRACT interface) + `createVehicle(game, opts)`. Damage/fire/explosion, hit processing, visuals (wheels, body roll/pitch/bounce, lights, pools), FX + audio hooks. |
| `collisions.js` | `resolveVehicleCollisions(game, dt)`: sweep-and-prune broadphase, OBB SAT, mass-split positional correction, impulses with friction and spin. |
| `driveCamera.js` | `DriveCamera`: modes near / far / bonnet, chase spring, look-into-turn, speed FOV, look orbit with spring back, raycast pull-in, teleport snap, crash shake. |
| `models.js` | Seven merged low-poly models, 4 meshes per car (paint, detail+decals, glass, lights). Canvas text atlas (TAXI, BEST, POLICE, number plates, "123 CHURCHGATE STN" board). Sky-gradient PMREM reflections scaled by city light level. |
| `effects.js` | Shared instanced wheels, blob shadows, night light pools, skid-mark ring buffer, smoke / fire / spark point pools, explosion flashes, one SpotLight for the player car's headlights at night. |
| `audio.js` | Engine synth (3 pooled voices: saw+square+filtered noise following RPM, gear shifts, load), tyre screech, scrape, crash thumps, explosions, two-tone horns (bus is deeper), siren for a police car the player drives. Runs only when `game.audio.ready`. |

### Physics model (summary)
- Bicycle model with front and rear axles; slip angles; Pacejka-like saturating curve `sin(C·atan(Bα))`; friction ellipse (drive or brake force eats lateral grip); longitudinal weight transfer.
- Steering: rate-limited ramp (fast to centre, slower at speed), max lock limited by speed and available grip, so full lock at 120 km/h does not spin the car.
- Assists: yaw stability toward kinematic yaw, counter-steer assist, anti-spin damping beyond ~24 deg of slip, low-speed jitter clamp.
- Handbrake: rear locks (sliding friction) plus an arcade yaw kick. Holding throttle after a handbrake flick switches to "drift mode" (less stability, more counter-steer) until the slide is caught.
- GTA brake semantics: brake slows the car, holds it at a stop, then reverses. Throttle while rolling backwards brakes first.
- Engine: torque curve, auto gearbox with shift cut, rev limiter, engine braking, drag and rolling resistance tuned so each type tops out near its vmax.
- 2–5 substeps per tick, depending on speed (≤0.3 m per substep). Static collision runs every substep (3 iterations), so nothing tunnels at 175 km/h through a 0.3 m wall.
- Sleep after 0.4 s at rest (no physics cost). Woken by impulses, collisions, controls or `wake()`.
- LOD: AI cars more than 150 m from the camera use a kinematic step (no tyre model).

## Tuning table

| type | mass kg | drive | torque Nm | vmax km/h | mu | character |
|---|---|---|---|---|---|---|
| taxi (Padmini) | 950 | RWD | 108 | 112 | 1.02 | soft and floaty, lots of roll, easy to slide |
| hatch (800) | 720 | FWD | 72 | 132 | 1.08 | light, buzzy 3-cyl, understeers |
| sedan | 1300 | RWD | 265 | 162 | 1.26 | the fun one: quick, balanced, drifts on command |
| suv | 1850 | AWD | 330 | 150 | 1.08 | heavy, rolls, sturdy (durability 1.25) |
| police | 1700 | AWD | 400 | 172 | 1.32 | fastest and grippiest (durability 1.5) |
| van (Omni) | 820 | RWD | 74 | 104 | 0.98 | tall box, tippy-feeling roll, slow |
| bus (BEST) | 11000 | RWD | 1050 | 72 | 0.95 | slow, wide turns, barely reacts to handbrake (durability 4) |

All values are in `tuning.js` `TYPES`. BASE holds the assist defaults.

## Measured telemetry vs targets
Headless runs are `node tools/vehicles/sim.mjs <type>`. In-browser runs are `tools/vehicles/browser.js` (deterministic `debug.step`) and match the headless numbers.

| test | target | sedan measured |
|---|---|---|
| 0–100 km/h | 6–7 s | **6.08 s** (0–50 in 2.23 s) |
| top speed | ~160 | 165 km/h |
| 100–0 braking | 35–40 m | **37.0 m**, 2.8 s |
| 90° turn at 45 km/h, steering only | completes | 1.68 s, radius ~13.6 m, 6° body slip, exits at 44 km/h |
| handbrake + steer for 1 s at 60 km/h | reliable 180 | **178–187°** (node and browser) |
| slalom 60 / 100 km/h, full-lock bang-bang | no spin | max slip 9° / 20°, no spin |
| steady-state lateral grip at 50 km/h | — | 1.2 g |

| type | 0–100 | vmax | 100–0 | handbrake 1 s at 60 | slalom 100 max slip |
|---|---|---|---|---|---|
| taxi | 15.2 s | 114 | 43.4 m | 178° | 32° (floaty by design) |
| hatch | 13.4 s | 134 | 44.4 m | 182° | 22° |
| suv | 8.9 s | 153 | 43.7 m | 176° | 27° |
| police | 4.9 s | 175 | 37.9 m | 178° | 17° |
| van | 20.2 s | 106 | 47.3 m | 187° | 29° |
| bus | 0–50 in 9.0 s | 73 | 50–0 in 12.3 m | 58° | 7° |

Crash tests (browser):
- **Wall scrape at 100 km/h, 10° into a wall.** The car glances off and aligns with the wall, then keeps about 100 km/h on 0.6 throttle. Sparks, one `vehicleHitStatic` event, small damage (scrapes cost ~0.02·speed per tick).
- **Tunnelling.** Police at 175 km/h, sedan at 165, hatch at 140 and bus at 75, each into a 0.3 m wall: none passed through. Health after impact: police 340, sedan 89 (smoking), hatch 269, bus 910.
- **Head-on.** A sedan and a taxi, each at 60 km/h: impulse about 19,800 N·s, relative speed 34.5 m/s. Both cars stop and separate cleanly. Health after: sedan 775, taxi 663. Two `panic` events.
- **T-bone.** A sedan at 80 km/h into a parked bus: the bus moves 1.1 m and is undamaged; the sedan stops with health 671.
- **Fire and explosion.** At 0 health the car burns, then explodes 4.5 s later. That emits `explosion` and `panic`, leaves a black charred shell that can't be driven, and does blast damage to a hatch 3 m away (it was left at 553 health).

Performance (browser, 40 cars plus the player car):
- **Full physics:** 0.145 ms average and 0.8 ms worst per fixed step for all 41 cars, including vehicle-vehicle collisions. The target was under 2 ms.
- **LOD and parked cars:** about 0.05 ms when the cars are far away or parked.
- **Per-frame visuals:** about 0.1 ms.
- **Draw calls:** 4 per car, plus a fixed few for shared instanced wheels, shadows, pools, skids and particles.

## API notes for traffic / police / player

- `createVehicle(game, {type, x, z, heading, color?, parked?})` adds the car to `game.vehicles` and the scene. `destroy()` removes it from both.
- **Holding a car still:** set `handbrake: true` or use all-zero controls; both hold it in place. Don't hold `brake` at a standstill: brake reverses after stopping (GTA semantics). To stop and stay stopped, AI should brake until `|speed| < 0.5`, then release brake and set handbrake.
- **Wake-up:** parked or idle cars go to sleep and wake automatically on controls, impulses or collisions. `v.wake()` also exists, and `v.sleeping` is a getter.
- **Extra read-only getters:** `kmh`, `rpm`, `gear` (number or `R`), `sleeping`, `onFire`, `lastImpact` {dv, x, z, time, other}.
- **`getOBB()`:** returns the body box. The body centre can sit slightly ahead of `position` (the CG); `getOBB()` already accounts for this.
- **`driverDoor()`:** returns the world point on the RIGHT side next to the driver (Indian RHD).
- **`horn(on)`:** a sustained two-tone horn. Call `horn(true)` and later `horn(false)`; a short beep is about 0.3 s. The bus horn is deeper.
- **`sirenOn`:** flashes the light bar. Siren audio only plays for a police car the player drives. Police AI owns its own siren audio; set `v.sirenAudio = false` to suppress mine.
- **`damage(amount, {x, z})`:** subtracts `amount / durability` from health. White smoke starts below 450 health; it turns dark below 220. At 0 the car catches fire, then explodes 4.5 s later. The explosion emits `explosion` `{x, z, radius: 9, vehicle}` and `panic` `{x, z, radius: 45}`.
- **After an explosion:** `wrecked = true` and the car stays as a shell. **Player/Police must handle the occupant** (eject or kill the player or driver). The car does NOT call `driver.eject()`; that is the occupant owner's decision.
- **Extra events (additive):**
  - `vehicleHitStatic` `{vehicle, impulse, x, z}`, for wall and pole hits.
  - `vehicleCollision` also carries `relSpeed`.
  - Vehicle-vehicle events are throttled per pair, at most once every 0.35 s unless a much harder hit comes in.
- **DriveCamera:**
  - `update(dt, vehicle, look)`, `reset()`, `cycleMode()`, `mode` ('near' | 'far' | 'bonnet').
  - Extra: `release()` restores the default FOV (62) when leaving the car. **Player should call it on exit.**
  - **Player should pass the mouse look** `{yaw, pitch, active}` and **call `cycleMode()` on `KeyC`.** The stub player does neither yet.
- **Night lighting** reads `game.city.isNight` and `game.city.lightLevel` (0..1). Reflection intensity follows `lightLevel` when the city provides it.
- **`v.ai` is never touched by me.** Traffic AI owns it.

## Requests to other systems
- **Player:**
  - Call `driveCam.release()` on exit.
  - Pass the mouse look into `driveCam.update`.
  - Bind `C` to `cycleMode()`.
  - Hold `H` to call `horn(true/false)`.
  - On `explosion` with `vehicle === player.vehicle`, eject the player and set them on fire, or kill them.
- **City:**
  - Expose `lightLevel` (0..1) as well as `isNight`; car lights fade in on it.
  - Static collision shapes for kerbs are not needed. Buildings, walls and poles are enough; camera pull-in uses `collision.raycast` with `minH`.
- **Traffic/Police:** use the stop/hold advice above. Cars more than 150 m from the camera run cheap LOD physics, so for distant cars precise steering is approximate.

## Known issues / limits
- No vertical dynamics: cars never leave the ground, and the hop on explosions is visual only. No ramps.
- The taxi and van are deliberately loose in hard slaloms (up to ~30° of slip), but they don't spin.
- Wrecks are pushable shells. Their positional correction is mass-based, so a bus pushes a wreck easily.
- Audio has been checked for errors and node lifetime only (headless). Mix levels have not been tuned by ear.
- The stub city has no buildings, so camera pull-in was tested against a test box only: the camera stops in front of a wall 5.5 m behind the car.
- Visual damage is the charred shell at 0 health plus smoke and fire. There is no per-panel deformation.

## Test scripts (tools/vehicles/)
- `sim.mjs`: headless telemetry.
- `browser.js`: in-browser accel, brake, handbrake, scrape, tunnel, head-on, T-bone and explosion tests.
- `perf.js`: 40-car performance test.
- `drive.js`: real-time keyboard drive with screenshots.
- `camtest*.js`: camera modes, orbit, reverse, teleport and pull-in.
- `closeups.js [types] [night]` and `lineup.js`: model screenshots.
