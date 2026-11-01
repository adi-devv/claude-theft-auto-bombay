# Critic: driving feel, traffic, police chase

Scope: areas 1 (driving), 4 (traffic) and the traffic half of 6 (police chase, perf) from `prompts/critics.md`. Played through `tools/harness.js` with real key input (`input.setKey`) and deterministic `debug.step(1/60)` loops. Scripts and raw numbers are in `tools/critic-driving/` (`t1`..`t8.js`, `*-results.json`, `chase-*.json`). Screenshots (960x540) are in `tools/critic-driving/shots/`. Game code was not edited.

## Scores

| Area | Score | One line |
|---|---|---|
| Driving feel | **7.5 / 10** | Responsive, stable, matches `notes/vehicles.md`. Binary grip (rails or spin) and brutal wall response cost the rest. |
| Traffic believability | **6.5 / 10** | Clockwise roundabouts, no pop-in in view, cheap on CPU. Traffic freezes behind any stopped car and AI cars hit each other in queues. |
| Police chase | **6 / 10** | Escalation, roadblocks and ramming work and are tense. Units appear in plain view, cap speed far below the player, some idle, and 4-5★ has no breathing room. |

No P0 (broken) defect found. Nothing crashed, no `__game.errors`, no tunnelling, camera never inside solid (0 frames in every wall test).

Caveat on the chase numbers: my player in the chase runs was a lane-keeping autopilot at 100 km/h, not a human. Bust timing, escalation and ram counts are therefore partly confounded; spawn/visibility/speed-cap findings are not.

## Measured telemetry (sedan unless stated; 960x540, headless D3D11)

Accel / brake / top speed (`t1-results.json`, straight Marine Drive, own lane):

| type | 0-50 | 0-100 | 100-0 | top km/h | note |
|---|---|---|---|---|---|
| sedan | 2.22 s | 6.07 s | 37.6 m / 2.78 s | 164.9 | matches notes (6.08 s, 165) |
| police | 1.63 s | 4.90 s | 38.4 m / 2.82 s | 175 | |
| hatch | 3.52 s | 13.4 s | 15 m (from 100) | 124.6 | |
| taxi | 3.58 s | 15.2 s | | 114 | |
| suv | 2.38 s | 8.85 s | 44.1 m / 3.25 s | 145.9 | |
| van | 4.1 s | never (96 target in 17 s) | | 102.8 | |
| bus | 8.95 s | never | | 73.3 | |

Camera at top speed: FOV 76 (sedan/police), 68-72 other types; follow distance 7-11 m. No clipping, no jitter seen.

Steering matrix, 0.5 s full-lock right (`t2b-results.json`): sedan yaw peak 85 deg/s at 30 km/h, 65 at 60, 49 at 100, 45 at 140. 90% of peak yaw in 0.40-0.43 s at every speed. One second after release yaw rate is 0.00 and body slip 0. Max slip 6.5-10 deg even at 140 km/h. Lateral g 1.3 / 1.9 / 2.4 / 3.1. Speed bled 2.7 / 4.5 / 5.8 / 8.8 km/h.

Handbrake + steer 1 s (`t2-results.json`): sedan 60 km/h 172 deg, 100 km/h **316 deg**; hatch 182 / 323; taxi 176 at 60 km/h. After the turn the car is travelling backwards at -23 to -30 km/h two seconds later; sedan took 15.6 s to settle at 60 km/h, taxi never did.

Sustained drift (steer + handbrake held): sedan slip 46 deg, speed 55 -> 29 km/h, 256 deg yaw. Taxi slip **99 deg**, speed 58 -> 8 km/h, 73 deg yaw.

Reverse: -22.8 km/h max (bus -11.9). Reverse-to-forward: 5 km/h after 0.93 s (taxi 1.08 s).

Static impacts (`t4-results.json`, Jamshedji Tata Rd wall):

| case | speed | HP lost (of 1000) | yaw peak | rebound | impulses |
|---|---|---|---|---|---|
| sedan head-on | 60 | 279 | 0.7 rad/s | -4.5 km/h | 23.4k |
| sedan head-on | 95 | 430 | **5.9 rad/s** | -12.9 | 30.9k, 7.5k, 4.8k |
| suv head-on | 70 | 229 | 4.4 | -11.3 | 32.5k, 8.8k, 6.3k |
| taxi head-on | 55 | 195 | 4.1 | -8.9 | 13.1k, 3.6k |
| bus head-on | 40 | 37 | 0.6 | -1.2 | 126k |
| sedan glance, 0.20 rad bias | 86 | 460 | | ends **0 km/h** | 6.2k, 33.5k |
| sedan glance, 0.35 rad bias | 67 | 238 | | ends 0 km/h, 32 deg off street | 4.2k, 19.7k |
| taxi glance, 0.25 rad bias | 56 | 212 | | ends 0 km/h | 5.2k, 3.1k, 11.7k |

Car-car, player into parked-style target with traffic update off: sedan 60 -> taxi: player keeps 32 km/h, taxi rolls 83.8 m, HP -75 / -132. Sedan into bus: player stops (1 km/h), bus moves 4.7 m, player HP -250, bus undamaged.

Roundabouts (`t7-results.json`, scripted clockwise ring route): Flora W->E 18 s, S->N 18 s; Horniman W->S 24 s, N->W 26 s; Regal W->SE 23 s, N->E 14 s. Ring traffic 61-328 samples clockwise vs 0-4 counter-clockwise. Min gap to a traffic car 3.6-11 m. Player contact with traffic: Horniman 1 + 1, Regal N->E 3 (31 HP).

Perf (`t6-results.json`, 128-sample tour of Marine Drive / Veer Nariman / Horniman, plus 4000 frame run): fps min 78, draw calls max 219, triangles max 927k, frame p50 7 ms / p95 13.9 / p99 14 / max 27.8, 0 frames over 33 ms. Traffic `msPerStep` avg 0.55 ms; `msMax` 145.3 ms (one-off, on reseed). No `__game.errors`.

Traffic blockage (`t8.js`, player stationary with handbrake, 50-60 s each, traffic left running):

| scenario | peak cars within 70 m | stopped | stuck (watchdog) | honks | AI-AI hits (cumulative) | result |
|---|---|---|---|---|---|---|
| sedan in MD lane 1 (3 free lanes) | 11 | 5 of 5 | 5 at 44-50 s | 21 | 3 | **0 cars moving within 70 m from 38 s on** |
| bus across Bazargate St | 3 | 2 | up to 9 at 90 s | 42 | 8 | cleared by ~108 s |
| sedan across Veer Nariman Rd | 8 | 6 | up to 5 at 158 s | 48 | 9 | partial flow at 164 s |

Police (`chase-*.json`): 1★ sedan: cops spawned at 128-183 m, none visible, escape took 34 s (2.8 -> 37.1 s) closest cop 7 m. 2★ taxi: 6 spawns, 3 in view. 3★ taxi: 11 spawns, 6 in view. 4★ sedan: 13 spawns, 4 in view, 13 rams, 16 player collisions, player vehicle HP 1000 -> 248. 5★ sedan: 11 spawns, 5 in view, 20 rams, 25 collisions, HP -> 427. 3★ escalated to 5★ within 42 s in the taxi run. Cops held 20-45 m behind at 100-108 km/h at 4-5★.

## Ranked defect list

### P0 (broken)

None.

### P1 (clearly hurts feel)

**1. Police cars and roadblocks appear in plain view of the player.**
Owner: police. File: `game/src/ai/police.js` (spawn rejection ~line 266, roadblock placement ~line 309).
Evidence: `chase-*.json` `spawnInView` = 3/6 (2★), 6/11 (3★), 4/13 (4★), 5/11 (5★): 40-55% of spawns have `vis:true`. Roadblock pairs appear in the same tick at 166-226 m (ids 40/41 at d=166/168, ids 5/6 at d=211/213), visible. Shots: `shots/chase-4-sedan-roadblock.png`, `shots/chase-3-taxi-roadblock.png`, `shots/chase-5-sedan-roadblock.png`.
Repro: `node tools/critic-driving/t5.js sedan:4:30:36`; watch `spawn[].vis`.
Fix: the view test only runs when `dP < 150`. Apply `isVisible` (with a 6-8 m margin) at every distance up to `spawnMax`, reject candidates in view, and retry farther or behind a corner. For roadblocks, place only where the road is not in the camera frustum, or spawn them 60+ m past a bend, or fade them in over 0.5 s.

**2. Cops are capped far below the player's speed, so the chase is escaped by holding the throttle.**
Owner: police. File: `game/src/ai/police.js` (`TUNE.vmax` line 19, speed target ~lines 365-400).
Evidence: `vmax` = 40 / 61 / 76 / 90 / 101 / 112 km/h for 1-5★ (11/17/21/25/28/31 m/s) against a sedan that reaches 165 and a stolen police car that reaches 175 km/h. A free Marine Drive straight is 430 m, enough for the player to gain 50+ m. At 1★ cops (40 km/h) are slower than traffic free flow; escape took 34 s of simply driving away with `minD` 146 m at the end (`chase-1-sedan.json`). My chase runs held 20-45 m only because the autopilot cruised at 100-108 km/h. Not measured at full throttle: inferred from the cap.
Fix: raise `vmax` for 3-5★ to roughly 28 / 36 / 44 m/s (100 / 130 / 160 km/h), or keep the cap but add rubber-banding (`vT = max(vmax, pSp + 4)` when the gap exceeds 60 m, capped at the car's own top speed). Make the 1★ escape need line-of-sight loss, not a 34 s timer.

**3. Traffic freezes behind a stationary player car even with free lanes.**
Owner: traffic. File: `game/src/ai/traffic.js` (pass logic ~lines 349-375, `lanChange` / `laneClearForPass`).
Evidence: `t8.js` md-lane: player parked in lane 1 of a 3-lane carriageway. Cars within 70 m: 11 at 1 s, 7 moving at 13 s, 2 moving at 32 s, **0 moving from 38 s**, watchdog `stuck` = 5 at 44-50 s, 21 honks. Shot: `shots/block-md-lane-end.png` (road ahead clear, queue is behind the player). A human abandoning a car in a lane would never see this.
Repro: `node tools/critic-driving/t8.js`.
Fix: the overtake only fires when the wait is at least 6 s and the obstacle is exactly `obsKind === 1` with speed < 0.4. Drop that to about 2.5 s for any stationary obstacle ahead on a multi-lane road, try both neighbouring lanes before waiting, and make an obstructed car re-plan its lane instead of waiting for the watchdog.

**4. AI cars hit each other while queued behind an obstruction.**
Owner: traffic. File: `game/src/ai/traffic.js` (reverse/pass recovery ~lines 340-380, 427-430 random lane changes).
Evidence: `t8.js` AI-AI collisions 3, 8, 9 (cumulative) across 164 s of obstruction; `t6` free-flow tour also logged `aiaa` = 3. The traffic notes claim 0 overlaps in free flow, so the cause is the blocked-state logic (reverse and pass attempts into queued cars).
Fix: lane changes and reversing should check a 6-8 m rear/side OBB against all vehicles including stopped ones, and the random 4% lane change (line 430) must be disabled while any car within 15 m is stopped.

**5. Glancing a wall at speed kills all speed and then takes a second big hit.**
Owner: vehicles/physics. File: `game/src/vehicles/physics.js` + `game/src/vehicles/collisions.js`; damage in `game/src/vehicles/vehicle.js` (`_processHits`, `(dv-4)*20`).
Evidence: `t4-results.json` glance-sedan-0.20: 86 km/h, ends at 0 km/h, 460 HP lost, impulses 6.2k then **33.5k** (second impulse is a head-on-sized hit); glance 0.35: ends 0 km/h at 32 deg off the street; taxi glance 212 HP lost. `notes/vehicles.md` states a 10 deg scrape "glances off and keeps about 100 km/h with small damage". Whether a human would trigger the second hit depends on correction, but the bias here was a small constant steer, the kind of drift any player has on Marine Drive's kerb.
Repro: `node tools/critic-driving/t4.js`.
Fix: when the contact normal is more than 60 deg from the velocity, remove only the normal component plus a small tangential friction, and add a short post-impact steering-assist/yaw damping so the rebound does not re-aim the car into the wall.

**6. Head-on wall hits spin the car at 4-6 rad/s.**
Owner: vehicles/physics. File: `game/src/vehicles/physics.js` (static collision torque).
Evidence: sedan 95 km/h head-on: yaw peak 5.92 rad/s (340 deg/s), 3 static events, rest in 0.52 s; suv 70: 4.37; taxi 55: 4.14; sedan 60: only 0.7. A perpendicular wall hit should not impart a spin (the wall is flat); the yaw comes from the corner contact lever arm. The camera follows the heading, so this whips the view.
Fix: clamp post-impact yaw rate to ~2.5 rad/s, or scale the contact torque by `1 - |dot(normal, heading)|` so near-perpendicular hits don't spin.

**7. Grip is binary: on rails below the limit, an uncontrollable spin above it.**
Owner: vehicles/physics. File: `game/src/vehicles/tuning.js`, `game/src/vehicles/physics.js`.
Evidence: normal steering returns to zero yaw and zero slip within 1 s of release at every speed (slip max 10 deg at 140 km/h), then the handbrake gives 316-323 deg at 100 km/h (a near full donut), the car ends up reversing at -23 to -30 km/h two seconds later, a sedan takes 15.6 s to settle at 60 km/h, and the taxi never settles. A held drift is not sustainable: taxi slip 99 deg and 58 -> 8 km/h; sedan 46 deg, 55 -> 29 km/h. No intermediate "drift" state. Shot: `shots/handbrake.png`, `shots/flora-handbrake.png`.
Fix: add a rear-grip recovery term while handbrake is released and slip is under about 40 deg (self-aligning torque), cap handbrake yaw rate at about 3.5 rad/s above 60 km/h, and ease rear grip reduction with speed so a handbrake at 100 km/h gives ~200 deg rather than 316.

**8. Cops stand still in pursue/respond for 4-9 s.**
Owner: police. File: `game/src/ai/police.js` (`policeNav` stuck recovery; `stats.stuck`/recycle).
Evidence: `chase-3-taxi.json` unit 21 below 3 km/h for 21 samples (about 9 s) and unit 25 for 8; `chase-4-sedan.json` unit 17 for 11 (about 4.6 s); `chase-5-sedan.json` units 23, 25, 29 for 11-12 each, all while mode is `pursue`/`respond` at distances above 12 m. Probably boxed in by pile-ups and roadblock cars. Medium confidence: units might be waiting on the roadblock formation.
Fix: in the stuck watchdog, trigger a 3 s reverse-and-reroute or a recycle if a pursuit unit is under 3 km/h for more than 3 s and not within 12 m of the player.

**9. A big vehicle blocking a street gridlocks it for about 40 s with up to 9 stuck cars and 40+ honks.**
Owner: traffic. File: `game/src/ai/traffic.js` (watchdog, `deadlock cycles`).
Evidence: `t8.js` bus across Bazargate St: stuck 9 at 90 s, 42 honks, cleared at ~108 s; AI-AI hits 5 during it. Shots: `shots/block-bazargate-bus-end.png`, `shots/block-vn-block-sedan-end.png` (sedan stopped beside a double-decker bus, little moving).
Fix: same as defect 3; plus when a one-lane street is fully blocked, let the queue head U-turn or recycle after 8 s instead of 20+.

### P2 (polish)

**10. Player-traffic contact in roundabouts.** `t7`: Regal N->E 3 contacts (31 HP), Horniman 1 + 1; min gap to traffic 3.6-4.5 m; only 0 contacts at Flora. My follower does not yield, so some is mine, but traffic does not slow to make a gap for a car already on the ring. Owner: traffic (`trafficJunction.js` arbiter). Fix: treat the player vehicle as a granted ring participant with a 1.5 s gap.

**11. 4-5★ has no recovery time.** 13-25 rams/collisions per 36 s (a hit every 1.4-2.8 s); player vehicle HP 1000 -> 248 (4★) and -> 427 (5★) in one run; busted 1.5 s after stopping near a cop (`police.js` ~line 659 `arrest.car >= 1.5`). Owner: police. Fix: ramming cooldown of 3 s per unit, `rammers` 2/3/7 -> 2/3/5, and `arrest.car` 2.5 s with a drain if the player moves off.

**12. Traffic spawns inside the 100 m ring at least once.** POP log: an SUV appeared at 91 m moving 28 km/h (t = 52.4 s); the other 9 appearances were 162-226 m. Owner: traffic (`traffic.js` spawn, 120-235 m design). Fix: reject any candidate with `isVisible` within 150 m, including after recycling.

**13. One-off 145 ms traffic spike on reseed/teleport.** `extra.traffic().msMax` 145.3 ms (documented as known). Does not show in normal play: frame max 27.8 ms, 0 frames over 33 ms in 4000. Owner: traffic. Fix: spread reseed over 24+ ticks (already partly), pre-create vehicles in a pool.

**14. Console 404 on load (twice).** `/favicon.ico` is missing (also `/game/favicon.ico`). Cosmetic. Owner: city/build. Fix: add the icon or a `<link rel="icon" href="data:,">`.

**15. Low-confidence: Marine Drive top speed outruns the world.** 165 km/h in a 55-70 km/h traffic flow, 100 km/h closing speed; weaving at 80-108 km/h was clean (slip 10 deg, 3 HP) but the visual reaction time before a traffic car is short because the camera pulls back only 7-8 m. Owner: player/camera. Fix: raise camera distance and add a small speed-based look-ahead at above 120 km/h (`driveCamera.js`, distance term `1.9*sp` to `2.6*sp` and a +2 m look target).

## What I could not test or chose not to rank

- No human-timed input: reaction timing, bust-evasion and escape-by-skill need playtesting.
- Get in/out and the bonnet camera were not exercised in depth.
- My harness follower (`AP2`/`planRoute`) stops at roundabout islands, so `shots/stuck-horn.png`, `shots/stuck-regal.png` and `shots/stuck-cst.png` are harness artefacts, not game defects.
- Chases ran on Marine Drive only; Fort tight streets were only seen in the `t6` traffic tour, not driven hard or chased.
