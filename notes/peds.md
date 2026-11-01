# Peds — complete

Status: implemented and verified in `work/peds/` against the integrated city, vehicles, player and HUD. Only Peds-owned source files, `tools/peds/**`, and this note were edited. `game/`, other sandboxes, and `tools/harness.js` were not edited. No git mutations.

## Source files to integrate together

- `work/peds/src/ai/peds.js` — population ring, spawn/API, pedestrian AI, crossing waits, separation, panic, vehicle spatial hash and swept OBB impacts, knockdown/recovery/death, sparse synth screams, debug telemetry.
- `work/peds/src/ai/pedsRoutes.js` — footpath polylines derived from STREET and road samples, valid spawn places, city zebra crossings and parapet seats, commuter queues, families and cricket team staging.
- `work/peds/src/characters/wardrobe.js` — shared low-poly geometry, skin/clothing palettes and procedural body poses; sari/pallu, kurta, salwar/dupatta, office clothes, school uniform/backpack, Mumbai Police khaki/cap/badge/baton, cricket whites/bat, chai/chana/bhutta handcarts and BEST stop markers.
- `work/peds/src/characters/crowd.js` — instanced rendering, instance colours, individual frustum/distance culling, cached pose LOD, contact shadows, cricket balls and dithered corpse fade. Maximum 17 crowd draw calls, including all signs, accessories and shadows; no per-ped Groups or shadow-map draws.
- `work/peds/src/characters/humanoid.js` — optional standalone `createHumanoid(opts)` sharing the same appearance/pose code, with `group`, `update(dt,{speed,state})`, and additive `dispose()`. Supports idle/walk/run/sit/lie/down/dead. Group origin is at the feet.

The restored empty `characters/body.js` is unused and unchanged.

## Behaviour

220 ambient peds occupy a local ring. Managed crowds recycle beyond approximately 245 m; teleports repopulate toward the new centre. Explicitly spawned cops/drivers are separate from ambient recycling. Capacity is 512 including external peds; spawnPed returns null at capacity.

Walkers use both sides of roads and multiple bands on the promenade. Families share direction/pace and include children. Dusk crowds include joggers, sea-facing seated people using City's actual parapet height, and vendors. Churchgate/CST and Fort paths get commuters; queues have small BEST markers. Cricket teams use City's three pitch positions per maidan, with a timed bowler run-up/release, bat swing, ball flight and moving fielders.

Crossing peds look/wait at actual zebra endpoints, check occupied crossings and approaching vehicle trajectories, then cross. Normal walkers are held off the carriageway and inside land, resolve against static collision, and separate from neighbours and vendor carts. Threatened peds can sidestep cars on the footpath, including while already fleeing.

Panic/explosion/crime and large vehicleCollision events provoke a temporary flee state followed by calm. Sparse short synthesised screams use the unlocked sfx bus and a global cooldown.

Cars push at low speed. Impacts above about 2 m/s relative speed knock peds down, using a spatial hash and relative-motion sweep against vehicle OBBs. Vehicle impacts above 8 m/s are fatal. Bodies fling, turn, bounce, lie with splayed limbs, recover after about 3.3 s if alive, or dither-fade at 28–31 s and are removed. Car impulse reaction is deliberately small.

## Public interfaces

`createPeds(game)` returns:

- `update(dt)` — fixed simulation step.
- `frameUpdate(dt)` — instanced visual update (dt is optional).
- `spawnPed({x,z,heading,kind:'civ'|'cop'|'driver',controller?})` — returns ped or null at capacity. Cop appearance is khaki with cap and `isCop === true`. A driver starts fleeing automatically for about 9 s, including escaping from a road to a footpath.
- `nearest(x,z,r,filter?)` — returns the nearest matching ped directly, or null. It does not wrap the result in `{ped}`. The player supports this return form. Supply a filter to exclude dead/down peds if required.
- `panicAround(x,z,r)`.

Every ped supplies `position` and `velocity` (THREE.Vector3), `heading`, `radius`, `state`, `health`, `isCop`, `knockDown(vx,vz,source)`, `panic(x,z)`, and idempotent `remove()`. `position.y` stays ground-based; airborne knockdown height is visual. `game.peds` contains these same objects.

`knockDown(...,'player')` handles the fall; Player owns its existing punch/copAssault crime event, so Peds does not duplicate it. Vehicle hits emit `pedHit {ped,vehicle,speed}` and apply a car impulse. If `vehicle.driver === 'player'`, Peds emits `crime {type:'pedHit'|'pedKilled',x,z,victim}`.

### Controller contract for Police

The callback `controller(ped, dt)` is called every fixed step while that ped is upright. It mutates world `ped.velocity.x/z`, `ped.heading`, and optionally `ped.state` (e.g. walk/idle/flee). Peds integrates velocity after the callback. If the callback instead changes `ped.position.x/z` itself, Peds does not integrate it a second time. Both styles were tested at 1.2 m/s.

Peds still applies static collision, pedestrian separation and vehicle impacts to controlled cops. The callback is suspended during down/dead states; surviving cops resume after getting up. Cops ignore ambient panic so the Police controller retains intent. Police should spawn on free land, avoid treating movement as guaranteed through walls, and call `ped.remove()` when retiring an officer. `isCop` is available immediately for the existing minimap loop.

Do not assign a Group/mesh to the ped; appearance is handled by the shared instance batches. Headings use the CONTRACT convention `(sin h, cos h)`.

## Interfaces used

- RoadNetwork: edges/nodes, sample, isLand, isOnRoad, parks, sea-edge layout through STREET offsets.
- StaticCollision: queryCircle and resolveCircle.
- Optional City extras, guarded: `promenadeSeats` (fallback `benchSpots`) and `crossings`. These are provided in the current integrated city and requested in City notes. The primary crowd still works without them; exact wall seating/crossing roles require those arrays.
- Vehicles: position, velocity, getOBB(), length, driver and optional applyImpulse(). No traffic implementation internals are read.
- Player position for population focus; no player internals needed by the system.
- Events on/emit; game.rng; optional unlocked Audio ctx/bus('sfx').

`game.debug.extra.peds()` reports required `{active,visible,byState,drawCalls}` plus byActivity, route/place counts, hit/fatal/recovery/crossing/dodge/scream/recycle counters and EMA update/frame CPU timings. `visible` means in camera frustum and within render distance, before scene occlusion.

## Verification and measured metrics

All gameplay screenshots are 960×540 and were actually opened and inspected. The map plan was also rendered and inspected. Final tests used Edge headless through the unchanged harness at `http://localhost:8765/work/peds/`.

- **220 active / 220 in camera frustum: 122 fps**, crowd **15 draw calls**, whole frame **140 calls / 681,377 triangles**. Crowd update EMA 1.609 ms and frame update 1.931 ms in that view. These are measurements on this Windows test environment, not a Mac benchmark.
- Structural worst case: **17 draw calls**, including all clothing, four sign types, umbrella/cart parts, cricket ball and contact shadows; below the 25-call budget.
- **225 simulated seconds across five locations** (Marine Drive, Churchgate, Fort, CST, Oval): 220 ambient peds throughout; zero unintended road entries, land escapes, static overlaps (with 2 cm tolerance), or non-finite values. 89 completed zebra traversals during that stress segment. Typical steady simulation EMA approximately 1.3–1.6 ms.
- Real Vehicle tests at **1 / 5 / 14 / 48 m/s**, including rotated headings and fast sweep: low-speed push / down / dead / dead. Measured impact speeds approximately 4.99, 13.99 and 47.96 m/s; player crimes were pedHit, pedKilled and pedKilled. Surviving knockdown recovered.
- Occupied zebra: waited motionless for 3 s; after removing the car, crossed 2.53 m in 2 s.
- Footpath dodge: moved laterally **1.67 m in 0.4 s**, stayed alive and fled.
- All four panic event sources verified; ambient flee subsequently calmed.
- Corpse airborne at 0.3 s, visible dither fade at 29.3 s, removed after 31 s.
- Controller velocity and direct-position styles both moved exactly **1.2 m in 1 s**. Ejected-driver spawn started on the road and reached a footpath within 6 s.
- Existing Player input/punch path struck a real cop: down state, exactly one copAssault event, surrounding panic. Cop minimap field and khaki appearance verified.
- Standalone humanoid states and disposal verified.
- **Zero `__game.errors` in every completed final test.** Browser console still logs unrelated HTTP 404 resource messages from the existing app; there are no system/shader/JavaScript errors.

Tests (PowerShell):

```powershell
$env:GAME_URL='http://localhost:8765/work/peds/'
node tools/peds/validate.js
node tools/peds/interactions.js
node tools/peds/edges.js
node tools/peds/player.js
node tools/peds/visual.js
node tools/peds/inspect.js
```

`validate.js`: stress, APIs, recovery/calm and real car hits. `interactions.js`: crossings, events, dodge, death/fade and standalone model. `edges.js`: direct-position controller and driver road escape. `player.js`: real player punch + cop/minimap. `visual.js`: 220-visible perf and character/vendor/seat galleries. `inspect.js`: integrated gameplay, promenade, Churchgate, Fort arcade and cricket views.

Screenshots: `tools/peds/shots/01-player.png` through `15-player-punch.png`; especially `02-promenade.png`, `05-fort.png`, `06-cricket.png`, `09-vendors.png`, and `11-impact-airborne.png` to `13-impact-fade.png`.

## Known limits and integration requests

- Walking routes patrol and turn at safe local footpath ends; they do not plan a journey across the entire street graph. Crossings are separate timed routes. Cricket is a visual match cycle rather than a scored sport simulation.
- Ragdolls use procedural body poses and a simple vertical bounce, not a bone/rigid-body solver. Vendor carts and BEST signs are cosmetic crowd accessories; they have no independent vehicle physics or persistence after their owner leaves/panics. Peds avoid the cart footprint.
- Audio node lifecycle/error checks passed; the synth mix was not reviewed by ear.
- Traffic and Police in this sandbox remain their provided stubs. Real car interactions and the public controller interface were tested, but a full parallel Traffic/Police build was not imported or edited.
- **Integrator:** copy all five source files listed above together; no main.js or other system changes are required.
- **Traffic:** on eject, call `game.pedSystem?.spawnPed?.({kind:'driver',x:door.x,z:door.z,heading})`. The returned ped flees automatically. Existing vehicle.driver='player' identifies criminal vehicle hits.
- **Police:** the controller contract above is ready; retain `isCop` and use `remove()` for lifecycle cleanup. No blocker.
- **Player/HUD:** requested nearest/knockDown/panicAround/state/isCop interfaces are ready and the real punch path passed. No changes requested.
- **City (optional):** canonical BEST stop positions/shelter placement would let queue anchors replace the current sparse road-based stop placement. Existing parapet-seat and crossing data work well.
