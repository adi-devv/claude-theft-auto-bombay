# Claude Theft Auto: Bombay ? on-foot, pedestrians and traffic critique

| Area | Score /10 |
|---|---:|
| On-foot controls and interactions | **6/10** |
| Pedestrians | **5/10** |
| Traffic AI | **5/10** |

The basic actions exist, but physical interaction is inconsistent: cars ignore the person the player controls, crowds accept deep overlap, and orbiting beside a facade puts the camera inside it. These are integration defects, not missing decorative detail.

Tested the integrated `http://localhost:8765/game/?test=1` through `tools/harness.js`, on Windows/headless Edge/D3D11, at **960?540**. Continued the interrupted run's artifacts rather than overwriting its audits. All gameplay PNGs were checked for 960?540 dimensions; the original 89 were inspected in `tools/critic-onfoot/contact-1.jpg` through `contact-6.jpg`, with report-critical images also opened individually. New camera, obstruction and UI images were opened individually.

Inputs were real Playwright key presses and mouse movement. Debug teleports, a real bus/taxi spawn, and wanted/cop setup arranged scenarios; actions, impacts, driver ejection, arrests and AI decisions ran through the integrated systems. `panic` injection and direct lethal damage were supplementary API tests, not claimed gunfire or naturally caused deaths. Read-only timing wrappers measured existing update methods. No game/work source edits or git mutations.

## Ranked defects

**No confirmed P0.** P1 means a clear gameplay/immersion failure; P2 means polish or a narrower limitation. Source locations below are likely owners, not implemented fixes.

### 1. P1 ? Traffic does not perceive the on-foot player

- **Repro:** Run `node tools/critic-onfoot/audit.js`; its roadblock phase places the player about 16 m ahead of a native moving car. Remain still. Alternatively step into the northbound Marine Drive lane around `(-409,13)`.
- **Evidence:** `audit.json`, `roadblock-0` through `roadblock-11`: the tracked car keeps **brake=0**, throttle **0.24?0.68**, and goes from **11.90 to 15.55 m/s** through the encounter. Player health falls from 100 to zero. [Approach](../tools/critic-onfoot/shots/a15-roadblock-start.png), [fatal contact](../tools/critic-onfoot/shots/a16-roadblock-impact.png). This is not a driver braking too late: its wait reason remains empty.
- **Owner/file:** **traffic**, `game/src/ai/trafficDriver.js`, `perceive()` pedestrian scan. It scans `game.peds`; the player is a separate object.
- **Fix:** Include the live on-foot player in the same predicted obstacle corridor as civilians, including down/get-up states. Brake for a stationary person and replan only when a safe passing corridor exists.

### 2. P1 ? One vehicle contact becomes repeated damage while the player is helpless

- **Repro:** Same roadblock; do not press anything after the first impact.
- **Evidence:** `audit.json`: `playerHit` at **22.200, 22.817 and 23.433 s**, with reported closing speeds **12.87, 13.96 and 14.94 m/s**. Health becomes **54.58 ? 4.18 ? 0**. The player remains `action:'down'` before death and is carried about **18 m** from the initial standing point. [Result](../tools/critic-onfoot/shots/a16-roadblock-impact.png).
- **Owner/file:** **player**, `game/src/player/player.js:333`, `collideVehicles()`. Damage re-arms after 0.6 s and excludes `tumble`, but not an existing `down` contact.
- **Fix:** Track contact separation per vehicle and calculate impact from relative motion. Do not treat continuous pushing as a fresh full-speed collision every 0.6 s. Separate the body from the bumper and allow a fair get-up window; retain distinct damage from a genuinely new strike.

### 3. P1 ? Foot camera enters a solid building during ordinary orbit

- **Repro:** Run `node tools/critic-onfoot/resume-camera.js`. It starts at `(-406.763,387.316)`, heading 1.424; hold W+Shift for 2 s against the real facade, then orbit with Q.
- **Evidence:** `resume-camera.json`: **4/16** sampled orbit poses intersect a 74.8 m-high building using a 0.10 m camera probe. Maximum penetration is **0.555 m**; camera distance is clamped at **0.7 m**, camera height 1.715 m. The player has **zero static contacts** in those samples. [Clipped view](../tools/critic-onfoot/shots/k02-camera-in-building-5.png), [adjacent pose](../tools/critic-onfoot/shots/k02-camera-in-building-7.png). The character fills the view and the facade disappears from behind.
- **Owner/file:** **player**, `game/src/player/cameras.js:60`.
- **Fix:** Replace the unconditional 0.7 m minimum with collision-safe camera placement. Sweep a small camera volume, constrain the shoulder pivot too, and fade the protagonist when collision requires a very short distance. A comfort minimum must not override the wall hit.

### 4. P1 ? Running through civilians has no physical or behavioural response

- **Repro:** In `audit.js`, approach the selected native idle walker from 2.2 m away and hold W for 1 s; no punch.
- **Evidence:** `audit.json ? playerPed`: centre separation reaches **0.0094 m**, against radii **0.35 + 0.29 = 0.64 m**. The victim remains idle and the player keeps running. [Intersection](../tools/critic-onfoot/shots/a07-running-through-ped.png). This was a real ambient ped, not a fake collision target.
- **Owner/file:** **player/peds**, `game/src/player/player.js:126` and `game/src/ai/peds.js:229`. Player movement resolves vehicles/static geometry; crowd separation only handles other peds.
- **Fix:** Add player?ped circle separation, with bounded displacement and a brief stumble/avoid response at running speed. Keep intentional punches separate from incidental contact.

### 5. P1 ? Crossing pedestrians ignore the signal phase

- **Repro:** Run `node tools/critic-onfoot/focused-evidence.js`; observe the AZW zebra crossings through a complete signal cycle.
- **Evidence:** `focused-evidence.json`: ped **103** starts crossing at **t=11.600**, `(-78.717,-139.888)`, on **AZW / edge 43**, while the matching traffic approach **key 86 is state 0 (green)**. [Crossing context](../tools/critic-onfoot/shots/e-green-ped-crossing.png). The earlier observer also captured **18 green-phase records** among 44 crossing records; that observer contains duplicate transition records, so this is not a violation rate. Source `safeCrossing()` checks cars but never queries signals.
- **Owner/file:** **peds**, `game/src/ai/peds.js:178`; coordinate the interface with **traffic**, `game/src/ai/signals.js`.
- **Fix:** Require a permitted pedestrian phase/all conflicting approaches stopped before starting, then retain vehicle gap checks. Let an already committed pedestrian finish rather than stop in the carriageway when lights change.

### 6. P1 ? Crowd separation allows people to merge on footpaths

- **Repro:** Stand near Fort/Bazargate and let normal opposing walkers meet. Run `focused-evidence.js` for a nearby pair; the broader `continue-world.js` audit records repeated cases.
- **Evidence:** `continue-world.json ? observations.pairs` fills its **100-record cap across 61 distinct pairs**. All captured states are upright walk/idle, not ragdolls. Minimum recorded distance **0.230 m** versus **0.580 m** combined radius: **0.350 m overlap**. The focused pair **215/154** is **0.318 m** apart. [Focused footpath context](../tools/critic-onfoot/shots/e-ped-overlap.png); the tight pair is ahead of the player. The JSON is the precise overlap evidence.
- **Owner/file:** **peds**, `game/src/ai/peds.js:229`, `separate()`.
- **Fix:** Use symmetric positional correction with a few bounded iterations after path integration, then resolve walls again. Reduce forward speed or yield at bottlenecks instead of allowing the path follower to continually defeat separation.

### 7. P1 ? Traffic creation produces update spikes hundreds of milliseconds long

- **Repro:** Fresh harness launch, inspect `__game.debug.extra.traffic()` through initial population; repeat after a large debug relocation. Compare against a reset, settled sample.
- **Evidence:** Native traffic `msMax` is **344.7 ms** in `traffic-visible.json`, **369.6 ms** in `targeted-block.json`, and **405.4 ms** in the preserved probe log. These maxima include initial seeding; they are **not sustained step costs**. In contrast, resetting after setup in `resume-roadblock.json` gives **0.616 ms mean / 4.7 ms max** over 2,515 steps. [Measured live scene](../tools/critic-onfoot/shots/v-marine-observe.png). A 345 ms update alone consumes about 21 nominal 60 Hz frame budgets.
- **Owner/file:** **traffic/vehicles**, `game/src/ai/traffic.js:99`, `:156`, `:508`; vehicle construction in `game/src/vehicles/vehicle.js` and models.
- **Fix:** Prewarm/pool shared vehicle resources and spread population work against a measured millisecond budget. A fixed count of creations per tick does not cap the duration of a single expensive creation. Measure fresh launch and moving population boundaries separately.

### 8. P1 ? Local activity distribution leaves Fort looking substantially emptier than the promenade

- **Repro:** Compare street-level views at Marine Drive `(-418,150)`, Fort `(58,80)`, and Horniman `(213,105)` after population settles; use the live portions of the world audits.
- **Evidence:** Marine Drive has **23?26 peds within 20 m**, **74?77 within 50 m**. Fort has **4?6 within 20 m**; Horniman **2?3**, with only **2 crowd instances in the camera frustum** in all eight live Horniman samples. Traffic still reports **40 moving cars globally**. [Fort street](../tools/critic-onfoot/shots/c-fort-live.png), [Horniman](../tools/critic-onfoot/shots/c-horniman-live.png), [Marine Drive](../tools/critic-onfoot/shots/w-marine-street.png). Fort's road foreground stays mostly vacant; the promenade receives a disproportionate share of the visible life. This is an immersion judgement supported by local counts, not a claim that every Fort street must be packed.
- **Owner/file:** **peds/traffic**, `game/src/ai/peds.js:90` and `:154`, `game/src/ai/pedsRoutes.js`, `game/src/ai/traffic.js:13` and spawn weighting. **City** should provide useful public-space anchors where routes are missing.
- **Fix:** Allocate population by visible district and walkable public frontage, including Horniman's perimeter; ensure local minimums before filling the larger ring. Increase useful local distribution before raising global counts and CPU cost.

### 9. P2 ? Closing the full map silently disables mouse look until another click

- **Repro:** Capture the pointer, press M twice, move the mouse without clicking.
- **Evidence:** `resume-ui.json`: pointer **true ? false ? false**; game resumes, but yaw remains **?** after the mouse move. One canvas click restores capture and mouse movement changes yaw to **2.734**. [Map closed](../tools/critic-onfoot/shots/u02-map-closed.png). P pause/resume separately restored capture in `resume-camera.json`; this is the M path.
- **Owner/file:** **player**, `game/src/ui/hud.js:184`, `toggleBigMap()`.
- **Fix:** Remember prior pointer capture and request it on the user gesture that closes the map. If the browser refuses, show an explicit click-to-resume-look prompt.

### 10. P2 ? Full map omits foot police that the minimap tracks

- **Repro:** At Marine Drive, set one wanted star and use the public police debug spawn to put an officer 3 m away; open M before the arrest.
- **Evidence:** `resume-ui.json`: actual cop **221** at `(-418.109,152.287)`, police unit `F2:chase!@2`, `foot:1`. [Cop and minimap](../tools/critic-onfoot/shots/u03-cop-minimap.png), [full map](../tools/critic-onfoot/shots/u04-cop-fullmap.png). The full map's police layer iterates vehicles only; `drawMinimap()` also iterates `game.peds` for `isCop`. At this zoom the nearby officer would be close to the player arrow, so the missing loop is stronger evidence than an absent individual pixel.
- **Owner/file:** **player**, `game/src/ui/hud.js:410`, `drawBigMap()`.
- **Fix:** Share police marker filtering between both maps, including upright foot officers. Draw overlapping markers with a small offset or stack indicator.

### 11. P2 ? Ambient crowd update has avoidable long-tail CPU spikes

- **Repro:** Run `resume-roadblock.js` without accelerated stepping; remain in the populated promenade scene.
- **Evidence:** `resume-roadblock.json`: ped update **3.151 ms mean / 24.3 ms max**, **one step over 20 ms** in 2,515 steps with 220 peds. The earlier mixed live/accelerated world observer measured **2.845 ms mean / 84.4 ms max**; do not interpret the latter as a normal rendered frame duration. [Crowd scene](../tools/critic-onfoot/shots/r03-roadblock-end.png). Native crowd render calls stay low, so counting instanced draws alone misses the simulation cost.
- **Owner/file:** **peds**, `game/src/ai/peds.js`, candidate/route projection, population recycling, separation and spatial hashes.
- **Fix:** Profile these phases separately, reuse temporary arrays/hash entries, and stagger expensive candidate rebuilding. Publish peak and percentile update timings, rather than only EMA timings.

### 12. P2 ? Safe obstruction passing takes too long to begin

- **Repro:** Run `targeted-block.js`: a real bus is placed 28 m ahead of a native moving driver on three-lane Marine Drive; enter the bus with F and wait.
- **Evidence:** Driver **39** brakes from **13.28 m/s**, then spends roughly **11 s near standstill**: 0.34 m/s at **t=10.37**, zero at **15.05?20.55**. A passing shift first appears at **21.22**, with counters `stopped:12`, `blocked:9`. It does subsequently pass and accelerate; **permanent gridlock was not reproduced**. `targeted-block.json` contains the trajectory. [Obstruction context](../tools/critic-onfoot/shots/t-block-12.png), [street view](../tools/critic-onfoot/shots/t-block-street.png); the bus obscures the target in the camera screenshots, so they do not independently prove the pass.
- **Owner/file:** **traffic**, `game/src/ai/traffic.js:329`, `watchdog()`, `tryPass()` and lane-change checks.
- **Fix:** Begin checking legal free adjacent lanes after a short stable obstacle wait, with separate timers for genuine signal waits and blocked lanes. Avoid stacking the initial stopped-time grace period with another six blocked seconds before the first useful manoeuvre.

### 13. P2 ? Traffic visibly appears and disappears on the open Marine Drive sightline

- **Repro:** Run `traffic-visible.js`; leave the camera looking north from `(-418,150)` after warm-up. The observer compares vehicle object membership, camera frustum inclusion and a static-occlusion ray without altering population decisions.
- **Evidence:** `traffic-visible.json` records **9 unobstructed in-frustum appearances/disappearances** in the stationary observation segment. Example: an SUV appears at **193.55 m**, projected pixel **(534.9,185.4)**, estimated height **4.8 px**; a sedan disappears at **307.78 m**, about **3 px** tall. [Appearance context](../tools/critic-onfoot/shots/v-pop-5.png), [stationary view](../tools/critic-onfoot/shots/v-marine-observe.png). These are small distant pops, not cars vanishing directly in front of the player; membership/visibility telemetry establishes the transition more clearly than a single still.
- **Owner/file:** **traffic**, `game/src/ai/traffic.js:99`, population/spawn visibility and `RING_HARD` despawn rules.
- **Fix:** Apply visibility protection across the full spawn ring instead of only below 150 m. Use occlusion, a distance fade or a lower-detail persistent vehicle beyond the hard ring so silhouettes do not abruptly disappear on the boulevard's long sightline.

## Coverage and performance interpretation

- **Movement:** real W and D gave forward/strafe motion; normal run telemetry reached **4.6 m/s** in `probe.json`. The clear-promenade sprint segment in `followup.json` covered **14.75 m** between samples at 7.42 and 9.68 s (terminal speed sample **6.33 m/s**, after key release); jump height reached **0.63 m**. Wall pushing and running into a stationary car stopped the player; the camera and pedestrian failures above are separate.
- **Interactions:** `followup.json` records native carjack pull, `vehicle` mode, ejected driver **221** fleeing, then a moving exit/tumble. `finish-interactions.json` records real taxi/ped contact at **6.38 m/s**, a down state at **55.31 health**, and later fatal hits above **11 m/s**, with corresponding crimes and panic. Viewed `f08`?`f11` and `i06`?`i10` sequences. Ragdolls are procedural; this audit did not establish a broken recovery flow.
- **Death/arrest:** native traffic caused WASTED; hospital respawn restored normal state/100 health at approximately `(267.77,-474.06)`. A native spawned officer caused BUSTED, followed by release at `(-22.68,-393.46)` and normal state. Earlier arrest attempts at `x=-423` were inside the seawall and are excluded as bad setup. The failed early carjack ran during respawn and is also excluded.
- **Menus/maps/HUD:** viewed title and Enter transition, pause/help, big map, minimap and overlay sequences. The title was restored through `hud.showTitle()` because harness launch auto-clicks the centre; this is not an untouched cold-title test. Pause held simulation time at **14.32 s** despite W. Coast/road orientation and player arrow were visually consistent in sampled minimap views; clock/health/menu text remained legible at 960?540. Map defects are ranked above.
- **Peds:** normal non-crossing carriageway occupancy was **zero in the captured world scans**. Recorded static contacts in the completed continuation were seawall contacts, consistent with seated parapet occupants; they are not evidence of walking through buildings. No building-clipping defect is asserted. There is no firearm binding in this build: gunshot-like panic was tested through the documented `panic` event, while punch and vehicle-impact panic came from real input.
- **Traffic:** **832/832** qualifying lane samples were on the left; **64 clockwise / 0 counter-clockwise** roundabout samples were recorded. Signals and native waiting were inspected; the confirmed signal defect is pedestrian phase use. The targeted stationary-bus encounter recovered. One later hatch/bus collision event had impulse **3,222.7**, but the event log lacks enough object identity to assign it confidently to the player bus versus an ambient bus. Do not call `aiHitsTotal:0` proof that no collision events occurred: it counts sampled AI overlap rising edges, not all resolved contacts.

| Live test | FPS min / median / max | Whole-frame draw calls | Relevant CPU update mean / max |
|---|---:|---:|---|
| Marine Drive visibility, 90 samples | 34 / 40 / 45 | 220?260 | Native traffic end mean 0.837 ms; cumulative max 344.7 ms includes seeding |
| Settled bus scene, 48 samples | 49 / 70.5 / 85 | 272?312 | Traffic **0.616 / 4.7 ms**; peds **3.151 / 24.3 ms**; police **0.081 / 8.0 ms** |
| Prior live Fort / Horniman | 53?65 / 46?75 ranges | See raw samples | Separate location samples; no accelerated FPS used |

The settled bus scene rendered **1.180?1.192 million triangles**. Native `debug.extra.peds` supplies update/frame EMA timings and traffic supplies mean/max; **`debug.extra.police` supplies no ms timing**, so police timings above come from the read-only wrapper. Hardware/load and warm-up differed between runs; these are Windows measurements, not verification of the contract's M-series Mac target. Several harness launches timed out, including the first camera follow-up; the camera retry and all final tests cited above completed. Accelerated `debug.step` FPS and stress samples after an unintended hospital respawn are excluded from location/performance conclusions. Completed cited runs reported empty `__game.errors`; console 404s were logged separately.

## Summary

Fix player perception and repeat-contact damage first, then camera collision and person-to-person separation. Signal-aware crossing and useful Fort population distribution are still missing. Traffic can keep left, circulate clockwise and eventually pass a bus, but that does not compensate for driving straight through the player. The integrated game is below an acceptable interaction-quality bar.
