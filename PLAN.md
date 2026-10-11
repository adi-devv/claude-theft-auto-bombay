# Plan: "Claude Theft Auto Bombay", a low-poly GTA-style game set in South Mumbai (Three.js + Vite)

Versions checked 2026-10-12: **three 0.186.1, vite 8.3.4, @playwright/test 1.64.0**. Node 26.9.0. Pin exact versions. If Vite 8 (Rolldown) misbehaves, fall back to `vite@7`.

Original brief: GTA-style open-world 3D browser game set in South Mumbai — only Marine Drive and the Fort area (Nariman Point, Churchgate, CSMT, Gateway of India). Taxis, autos, left-hand traffic. Three.js + Vite. Procedural, low-poly: everything from boxes/cylinders/planes with flat colours, no textures or external assets. Spend effort on gameplay, not visuals. Each loop: improve the game, run `npm run build` and a Playwright test that loads it with zero console errors; fix until both pass, then commit. Goal: a complete, fun, playable game.

---

## 0. Ground rules

- Plain JavaScript ES modules, no TypeScript, no runtime deps other than `three`. Addons via `three/addons/utils/BufferGeometryUtils.js`. `WebGLRenderer` only, never `three/webgpu`.
- Never call `Math.random()`. All randomness from `core/rng.js` (mulberry32) seeded by `?seed=N` (default 1337).
- World units = metres. **+X = east, +Z = south, Y = up.** Minimap maps (x, z) → canvas (x, y), north up.
- Heading `h`: models built facing +Z, `mesh.rotation.y = h`, forward = `(sin h, 0, cos h)`, right = `(-cos h, 0, sin h)`, **left = `(cos h, 0, -sin h)`**. Use `utils/math.js` helpers; never recompute these vectors ad hoc.
- Every iteration ends with `npm test` (build, unit tests, Playwright) green, then `git commit`.

## 1. Project layout

```
index.html               # canvas#game, div#ui, inline favicon <link rel="icon" href="data:image/svg+xml,...">
vite.config.js           # build.chunkSizeWarningLimit:2000, preview {port:4173, strictPort:true}
playwright.config.js
package.json  .gitignore (node_modules, dist, test-results, playwright-report)
tests/unit/*.test.js     # node --test: lanes, graph, collision, wanted thresholds
tests/e2e/smoke.spec.js  tests/e2e/gameplay.spec.js  tests/e2e/helpers.js
src/main.js              # boot: renderer check, new Game(), expose window.__game
src/core/   Game.js (state machine + wiring), loop.js (fixed step), events.js (bus),
            rng.js, input.js, save.js, config.js (ALL tunables), testApi.js
src/utils/  math.js, geom.js (colored box/cyl helpers, merge)
src/world/  mapData.js (pure data), roadGraph.js, coast.js, roadMesh.js, cityBuilder.js,
            chunks.js (merge static geometry per 300 m chunk), props.js, signals.js,
            landmarks/{csmt,gateway,taj,churchgate,flora,rajabai,nariman,artdeco,tetrapods,maidans,misc}.js
src/physics/ spatialGrid.js, collision.js (circle vs OBB, circle vs circle, segment LOS)
src/entities/ vehicleTypes.js, Vehicle.js, VehicleRenderer.js (InstancedMesh per type), Player.js,
             PedSystem.js, PedRenderer.js
src/ai/      TrafficSystem.js, driver.js, PoliceSystem.js, RacerAI.js
src/gameplay/ Economy.js, Wanted.js, Health.js, MissionManager.js, missionKit.js,
             missions/{taxiFare,dabbaRush,chorPolice,tajGetaway,marineRace,story}.js, Collectibles.js
src/render/  CameraRig.js, sky.js, markers.js
src/ui/      ui.css, hud.js, minimap.js, bigmap.js, menus.js, toast.js
src/audio/   audio.js, radio.js
```

Systems communicate via **`events.js`** (`on/off/emit`). Systems receive `ctx = {scene, graph, grid, rng, bus, player, traffic, peds, police, economy, wanted, missions, audio, time}` from `Game`.

Core events: `vehicle:enter/exit`, `crime {type, pos, heat}`, `ped:hit`, `vehicle:damaged`, `player:wasted/busted/respawn`, `money:change`, `mission:start/step/complete/fail`, `collect`, `horn`, `ui:toast`.

**Loop:** fixed `dt = 1/60`, accumulator clamped to 0.25 s. Order: input → player/vehicle physics → traffic/peds/police AI → collisions → gameplay (wanted, missions, collectibles) → camera. Render once per RAF. `__game.advance(sec)` runs the same fixed steps synchronously for tests.

**States:** `title`, `playing`, `paused` / `phone` / `map`, `wasted` / `busted` (3 s overlay then respawn), `finale`. Simulation doesn't step while a menu is open.

## 2. Map design

Bounds X ∈ [-900, 900], Z ∈ [-1000, 1000].

**Coast (`coast.js`)** — land polygon:
- West: Marine Drive centreline offset 22 m seaward (promenade + sea wall).
- North: z = -1000.
- East (harbour): x = 760 from z = -1000 to 300, then x = 690 down to z = 800 (Gateway bulge at x = 700, z ≈ 640).
- South: z = 960 from x = 650 to -200, rounding to Nariman Point tip at about (-350, 940).

Sea = 4 km plane at y = -0.6; ground = land polygon at y = 0. Sea wall = chain of segment colliders. Vehicles can never enter water.

**Marine Drive**: Catmull-Rom through `(-330,880) (-360,700) (-390,500) (-420,300) (-455,100) (-500,-100) (-560,-300) (-630,-500) (-700,-700) (-780,-900)`. Chowpatty beach sand patch at about (-760, -940).

| Id | Name | Pos | Notes |
|---|---|---|---|
| J_NP | Nariman Point | (-300, 860) | Air India tower 80 m (-250, 915), NCPA drum, Trident tower |
| J_MDVN | Marine Dr × Veer Nariman Rd | (-495, -90) | signal |
| J_CG | Churchgate | (-260, -120) | signal; station 140×40 at (-220, -175) with central gable tower |
| — | Cross Maidan | x[-180,-30] z[-380,-200] | grass |
| — | Oval Maidan | x[-230,-40] z[40,440] | grass + cricket pitches |
| — | Rajabai Tower | (40, 250) | 85 m clock tower; High Court block x[60,140] z[60,200] |
| J_FF | Flora Fountain / Hutatma Chowk | (200, -160) | signal; fountain + flame memorial |
| J_KG | Kala Ghoda | (280, 250) | signal |
| J_REGAL | Regal Circle | (330, 520) | **roundabout r = 18, clockwise** |
| — | Gateway of India | (620, 640) | arch facing east; plaza 80×60; Taj 90×60 at (530, 700), red domes |
| J_CSMT | CSMT | (480, -760) | signal; CSMT 180×70 at (600, -820): central dome on octagonal drum, 2 wings, 6 spires |
| J_METRO | Metro junction | (120, -880) | signal |
| — | Azad Maidan | x[180,420] z[-640,-420] | grass |
| — | Wankhede (stylised ring) | (-430, -380) | optional |
| SPAWN | Churchgate taxi stand | (-240, -150) | 3 parked taxis + 2 autos |
| HOSP | GT Hospital | (330, -900) | respawn after Wasted |
| COPS | Colaba Police Stn | (380, 800) | respawn after Busted |
| GARAGE | Mistry Garage, Ballard Estate | (650, -300) | repair + clear wanted (₹200 × stars) |

**Roads (`mapData.js`)**: `{id, name, pts:[nodeIds], lanes (per direction), width, limit (m/s), median:boolean}`. Lane width 3.5 m; footpaths 3 m each side.

1. **Marine Drive**: J_NP → J_MDVN → Chowpatty (-780, -900). 3 lanes/dir, 2 m median, width 23, limit 20. Promenade sea side only.
2. **Maharshi Karve Rd**: J_NP → (-260, 500) → (-250, 40) → J_CG → (-330, -500) → Marine Lines (-420, -900). 2 lanes, limit 14.
3. **Veer Nariman Rd**: J_MDVN → J_CG → (-30, -140) → J_FF. 2 lanes.
4. **D.N. Road**: J_FF → (300, -420) → (400, -620) → J_CSMT. 2 lanes.
5. **M.G. Road**: J_METRO → (150, -500) → J_FF → J_KG → J_REGAL. 2 lanes.
6. **Mahapalika Marg**: J_METRO → J_CSMT. 2 lanes.
7. **Marine Lines connector**: (-420, -900) → (-780, -900) and (-420, -900) → J_METRO.
8. **Madame Cama Rd**: Marine Dr (-385, 520) → (-40, 480) → J_REGAL. 2 lanes.
9. **Colaba Causeway**: J_REGAL → (340, 980).
10. **Apollo Bunder**: J_REGAL → (480, 600) → Gateway loop (600, 600)/(600, 690).
11. **Cuffe Parade link**: J_NP → (-100, 900) → (340, 890) (point on the Causeway).
12. **P. D'Mello Rd**: J_CSMT → (700, -500) → (700, 300) → (620, 560). 2 lanes.
13. **Fort grid**: E–W streets at z = -450, 80, 300 from x = 200 to 700; N–S street at x = 450 from z = -620 to 300; **Mayo Rd** x = 60 from (60, -140) to (60, 480). 1 lane, limit 11.

**`roadGraph.js`**: node with degree ≠ 2 is a junction. Each run between junctions becomes an edge with sampled polyline (every 4 m) and cumulative lengths: `{id, a, b, pts, len, lanes, width, limit, name}`.

Lane = `(edgeId, dir ∈ {+1,-1}, laneIdx)`. Lane centre = `centre + left(dirTangent) * (median/2 + 3.5*(laneIdx + 0.5))`. **Left-hand traffic: heading north (-Z), lane centre is at smaller x.** Unit-test that exact case.

Each junction precomputes **connectors** for every incoming→outgoing lane pair: quadratic Bézier with the junction node as control point, labelled `turn: 'left'|'straight'|'right'`. U-turns only at dead ends. Regal Circle = ring of 4 nodes with one-way clockwise edges.

Exports `nearestLane(x, z)`, `footpaths` (both sides at offset `width/2 + 1.5`), `routeTo(from, to)` (A*, used for GPS).

**Buildings (`cityBuilder.js`)**: jittered 22 m grid inside land polygon. Footprints 12–30 m, heights 9–40 m (Fort 15–28 m stone/cream; Nariman Point 3 towers 60–90 m). Reject if within `width/2 + 3 + 1.5` of any road segment, or overlapping a maidan, landmark footprint, or promenade. ~1,200–1,600 boxes with parapet and balcony slabs.

**Art-deco row** east of Marine Drive: ~30 buildings at 24 m, pastel cream/pink/mint, following the curve, rounded corner + eyebrow slabs. **Tetrapods**: InstancedMesh ~700 along the sea wall. **Streetlights** every 15 m on the sea side (~140), emissive bulbs brighten at night (Queen's Necklace).

## 3. Rendering and performance

- One shared `MeshLambertMaterial({vertexColors:true, flatShading:true})` for static geometry, plus emissive and water materials. Every helper geometry gets a `color` attribute, `uv` deleted, kept indexed (else `mergeGeometries` returns null).
- Merge static geometry per 300 m chunk (~42 meshes).
- HemisphereLight + one DirectionalLight, **no shadow maps**, fog 250–800 m, camera far 1200, `setPixelRatio(min(dpr, 1.5))` (1 in test mode).
- Vehicles: per type 2 InstancedMeshes (paint with instanceColor; fixed-colour mesh for tyres, glass, taxi livery). `setColorAt` all slots before first render; hide pooled slots with zero-scale matrix; `frustumCulled = false`.
- Peds: InstancedMesh bodies (instanceColor = clothes) + heads; bob/sway in the matrix.
- Budgets: < 150 draw calls (expose `renderer.info.render.calls`), < 400k tris. **36 traffic vehicles (pool 44), 60 peds (pool 70), up to 8 police, 3 racers.**
- Layering: ground 0, road 0.03, junction patches 0.04, markings 0.06, footpath 0.15.

## 4. Player and vehicles

**On foot**: capsule r 0.4, camera-relative, walk 4 m/s, sprint (Shift) 7.5, Space jump vy 5 gravity 20, damped facing. Collision circle vs OBB and vs vehicle circles. Hit by vehicle at rel speed > 6: damage `(v-6)*6` + knockback.

**Enter/exit (F or E)**: nearest vehicle within 4 m. AI-driven → carjack: driver ejected as fleeing ped, `crime {type:'carjack', heat:15}`. Exit on vehicle's right side (kerb side in LHT), else left.

**Vehicle physics (arcade bicycle model)**: state `{pos, heading, speed, vel, steer, health, type, controller}`. Throttle × accel; opposite direction brakes; reverse capped at `revMax`; drag `speed -= (0.12*speed + 0.4*sign)*dt`. Steer eases to `input*steerMax*(1 - 0.55*min(1,|speed|/maxSpeed))`, `yawRate = speed*tan(steer)/wheelbase`. `vel` lerps to `forward*speed` at `grip*8`; handbrake (Space) grip ×0.25 → drift. Collision bodies 2–3 circles; static: push out, remove normal vel (restitution 0.3), `speed *= 0.6`, damage `(impact-5)*dmgK` if impact > 5. Vehicle-vehicle: mass-weighted separation + impulse, damage both. Health < 30 smoke; 0 → wrecked (dark, undrivable). R (or stuck 3 s) snaps to nearest lane.

| type | L×W×H m | maxSpd | accel | brake | steerMax | grip | mass | health | notes |
|---|---|---|---|---|---|---|---|---|---|
| taxi (Padmini, black body / yellow roof) | 3.9×1.5×1.45 | 28 | 5.5 | 14 | 0.60 | 0.90 | 1.0 | 100 | fares |
| auto (green/yellow, 3 wheels) | 2.6×1.3×1.7 | 15 | 4.5 | 10 | 0.80 | 0.75 | 0.5 | 60 | player takes 30% of crash damage; body roll |
| car | 4.3×1.7×1.5 | 32 | 6.5 | 15 | 0.55 | 0.95 | 1.1 | 110 | |
| bus (BEST red double-decker) | 10×2.5×4.4 | 16 | 2.2 | 8 | 0.42 | 1.0 | 4.0 | 300 | |
| police (white, red/blue bar) | 4.4×1.8×1.6 | 34 | 7.5 | 16 | 0.60 | 1.0 | 1.3 | 150 | |
| bike (Bullet) | 2.1×0.7×1.1 | 30 | 7.0 | 14 | 0.70 | 0.85 | 0.3 | 40 | unlock via chai |
| sports | 4.4×1.9×1.2 | 40 | 9 | 18 | 0.55 | 1.1 | 1.0 | 90 | buy ₹5000 |

**Camera**: on foot 6 m back 2.5 up; vehicle distance `8 + speed*0.12`, height 3.5, damping `1 - exp(-5*dt)`, look target 0.3 s ahead. C cycles presets. Mouse drag orbits temporarily. **No pointer lock.**

## 5. Traffic, peds, police

**Traffic**: spawn 120–280 m from player outside frustum; despawn > 330 m when not visible. Mix 40% taxi, 20% auto, 12% bus, 23% car, 5% police patrol. Driver holds `{edge, dir, lane, s}`; at edge end picks connector 60% straight / 20% left / 20% right; pure-pursuit 6–10 m ahead. IDM-lite speed: target = limit × 0.85–1.1; gap from forward box (length `6 + speed*1.2`, width 2.4) via dynamic spatial hash (10 m cells) against vehicles, peds, player, red stop lines; stop 3 m short.
- **Signals** at J_CG, J_MDVN, J_FF, J_KG, J_CSMT, J_METRO: 2 axis groups, 14 s green / 3 s amber / 1 s all-red. Free left on red after yielding. Unsignalled: wait if junction box occupied.
- Honk if blocked > 2.5 s (4 s cooldown), audible within 45 m.
- Stuck > 15 s and off-screen → respawn.
- `__game.debug.trafficStats()` → `{count, stuck, wrongSide}`.

**Peds**: 1.2–1.6 m/s along footpaths; promenade boost (~40% peds, joggers 3 m/s, ~60 static wall-sitters). Flee on horn within 10 m or vehicle approaching > 15 m/s. Hit > 5 m/s: knocked down 3 s, then flee; `crime {type:'ped', heat:25}`. No gore. Mission passengers = peds with `role`.

**Wanted**: heat 20→1★, 60→2★, 120→3★, 220→4★, 350→5★. Heat doubled if a cop has LOS within 80 m. Crimes: ped hit 25, carjack 15, ram police 40, red light seen by cop 10, speeding > 30 m/s near cop 5/s, destroy vehicle 30. Evasion: no cop LOS within 120 m for `8 + 4*stars` s → 0 stars. Minimap flashing search circle.

**Police**: cops per star `[0,2,3,5,6,8]`, spawn 150–250 m away, route via `routeTo`, direct pursuit within 60 m. 1–2★ follow/nudge; 3★ ram (aim 4 m ahead) + spawn ahead; 4★ roadblocks 200 m ahead; 5★ +15% speed, bus barricades. **Busted**: on foot or < 2 m/s with cop within 6 m for 2.5 s → lose 10% money, fail mission, respawn COPS. **Wasted**: health 0 → respawn HOSP, lose 10%.

## 6. Gameplay

Start ₹500, health 100. Spend on: vada pav (₹20, +40 HP), garage (free repair, ₹200×stars clears wanted), sports car ₹5000, hospital.

**MissionManager**: `{id, title, kind, unlock:{after}, start:{x,z}, vehicleReq?, create(ctx)}` → `{start(), update(dt), cleanup()}`. `missionKit.js`: `goTo`, `enterVehicle`, `pickup`, `deliver`, `timer`, `destroy`, `loseWanted`, `checkpoints`. Steps set objective text, world marker (pulsing ring + arrow), minimap GPS route. Yellow "!" mission-giver pillars. Fail → retry prompt.

**Side jobs** (phone, Tab):
- **Taxi fares** (T in a taxi): passenger 150–500 m away; destination random landmark; fare `40 + 0.15×routeDist`; par time `dist/14` s gives up to +100% bonus; crash damage reduces tip; streak ×1.0→×2.0 over 5 fares.
- **Dabba Rush** (auto): collect at Churchgate, 4 drops in Fort in 150 s; ₹250 + ₹15/s remaining.
- **Marine Drive time trial**: NP → Chowpatty → back, 8 checkpoints; gold 95 s, silver 115, bronze 140.
- **Vigilante** (police car): ram fleeing chor cars, ₹150 each.

**Story** (sequential):
1. "Pehla Din" tutorial: walk to Churchgate stand, take a taxi, fare to Gateway. ₹300.
2. "Dabba Rush" story version. ₹400.
3. "Chor Police": bag-snatcher car flees Flora Fountain → CSMT; ram to 0 HP before it gets > 300 m away. ₹600.
4. "Queen's Necklace Race" (night): 3 AI racers, rubber-band ±10%; finish 1st. ₹1000.
5. "Taj Getaway": VIP at Taj, game sets 3★, lose cops, drop at Nariman Point. ₹1200.
6. "Bambai ka Badshah" finale: chase, escape 4★, reach Gateway before ferry timer (180 s). ₹3000 → credits, free roam.

**Collectibles**: 25 "cutting chai" glasses (₹50 each; all 25 → ₹2500 + bike unlock); 12 vada pav stalls (heal).

**Completion %** = story 50 + chai 25 + race gold 10 + 10 fares 10 + sports car 5.

**Day/night**: 12 real minutes per day, start 17:30; lerp sky, fog, hemi, necklace emissive. HUD clock.

**Save**: localStorage `ctaBombay.save.v1` = `{v:1, money, story, done:{}, chai:[ids], bestRace, fares, owned:[], stats, settings}`. Autosave on mission complete, pause, every 60 s. Load with try/catch + shape check. Title: Continue / New Game.

## 7. UI and audio

HUD (DOM overlay): top right ₹ money, 5 stars, clock; top centre objective + timer; bottom left 180 px circular minimap + health bar; bottom right km/h speedometer + vehicle health + radio station; centre toasts. Update DOM at 10 Hz only on change.

Minimap: pre-render coast/roads/maidans/landmark icons offscreen at 0.25 px/m; each frame rotate to heading, ~250 m radius; blips (player, objective, cops flashing, mission givers, stalls) + GPS route; clamp off-screen objectives to rim. M = full map.

Menus: Title (name, controls, Continue/New Game, Enter starts); Pause (Esc: Resume, Controls, Volume, Restart Mission, Quit); Phone (Tab: missions, lock states, best times); overlays WASTED / BUSTED / MISSION PASSED +₹X / MISSION FAILED. preventDefault Tab, Space, arrows.

| Key | Action |
|---|---|
| WASD / arrows | Move / drive |
| Shift | Sprint |
| Space | Jump / handbrake |
| F / E | Enter/exit vehicle |
| H | Horn |
| Q | Radio |
| C | Camera preset |
| R | Reset vehicle |
| T | Taxi job |
| Tab | Phone |
| M | Full map |
| Esc | Pause |
| N | Mute |

Audio: create/resume `AudioContext` **only inside the first keydown/pointerdown handler**, try/catch; otherwise no-ops. Engine sawtooth+lowpass `45 + speed*4` (auto: buzzier square). Horn 400+500 Hz squares. Siren sine 650–1300 Hz LFO. Crash noise burst. Coin/fail jingles. Radio: 2-station step sequencer 96–110 BPM, tabla-ish noise + sine kicks, Karplus-Strong plucks on S r G m P d N. Q cycles Off / "Bombay Beats" / "Filmi FM".

## 8. Testing

```json
"dev": "vite", "build": "vite build", "preview": "vite preview --port 4173 --strictPort --host 127.0.0.1",
"test:unit": "node --test tests/unit/", "test:e2e": "playwright test",
"test": "npm run build && npm run test:unit && playwright test"
```
One-time: `npx playwright install chromium`.

`playwright.config.js`: `testDir: 'tests/e2e'`, `workers: 1`, `retries: 0`, `timeout: 60_000`, `use: {baseURL: 'http://127.0.0.1:4173', viewport: {width: 1024, height: 640}, launchOptions: {args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}}`, `webServer: {command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30_000}`.

**WebGL must fail loudly**: create `WebGLRenderer` in try/catch; check `renderer.getContext()` non-null and not lost; on failure `console.error('WebGL init failed')`, `__game.webgl = false`, error panel. Test asserts `webgl === true`.

**`window.__game`**: `{ready, webgl, frame, state, seed, drawCalls, fps}`, `player()` → `{x, z, inVehicle, vehicleType, speed, health}`, `money()`, `wanted()`, `mission()` → `{id, step}`, `advance(sec)`, `debug.teleport(x,z)`, `debug.spawnVehicle(type,dx,dz)`, `debug.startMission(id)`, `debug.trafficStats()`, `debug.addHeat(n)`. `?test=1`: pixel ratio 1, fixed time of day, halved ped/traffic counts, all systems enabled.

`helpers.js`: collect `console` errors, `pageerror`, `requestfailed`, responses ≥ 400; `afterEach` expects `errors` empty.

`smoke.spec.js`: goto `/?seed=1&test=1`, wait `__game?.ready`, `webgl === true`, canvas visible, `frame >= 10`, `0 < drawCalls < 200`.

`gameplay.spec.js` (grows per milestone): click canvas, Enter → `playing`; hold W + `advance(1.5)` → moved > 3 m; `spawnVehicle('taxi',2,0)` + F → in taxi; W + `advance(3)` → speed > 8; F → on foot; Esc → paused, Esc → playing. Later: `startMission('taxiFare')` active; `addHeat(70)` + `advance(5)` → wanted ≥ 2 and cops > 0; `advance(30)` → `wrongSide === 0`, `stuck < 3`. Use `advance()`, not sleeps. No pixel screenshots.

Unit tests (pure modules, no `three`): lane side in 4 compass directions; no orphan nodes and every junction has ≥ 1 outgoing connector per incoming lane; circle-vs-OBB push-out; Regal ring clockwise (assert explicitly); wanted thresholds; save round-trip.

## 9. Milestones (each ends with `npm test` green + commit)

**M1 – Foundations and the city**: scaffold, configs, test harness, `__game`; rng, events, loop, input; mapData, roadGraph, coast, sea, roads with markings/footpaths; procedural buildings, maidans, landmark blockouts (CSMT, Gateway, Taj, Rajabai, Churchgate); chunk merging; on-foot player + collision + camera; title & pause; minimap with roads + player. Accept: smoke + walking tests, lane/graph unit tests, draw calls < 100, walkable Churchgate → Gateway, recognisable landmarks.

**M2 – Wheels**: vehicle types, physics, instanced renderer; parked vehicles at stands (Churchgate, CSMT, Gateway, Nariman Point); enter/exit, collisions, sea wall, R reset; speedometer, vehicle health, smoke; camera per vehicle. Accept: e2e enters taxi and accelerates; taxi/auto/bus feel distinct.

**M3 – Living city**: traffic AI (left lanes, connectors, signals, free left, yielding, honking), Regal roundabout, pooling; peds on footpaths/promenade, flee, knockdown; landmark detail, art-deco row, tetrapods, streetlights, trees. Accept: `wrongSide === 0`, stuck < 3 after 30 s; < 150 draw calls.

**M4 – Hustle**: Economy, MissionManager, missionKit; markers, GPS, phone; taxi fares (streaks), Dabba Rush; toasts, passed/failed; save/load + Continue; story 1 & 2. Accept: e2e taxi fare via teleports pays out; reload + Continue restores money.

**M5 – Heat**: health/damage, Wanted, PoliceSystem (pursuit, ram, roadblocks), LOS evasion; busted/wasted respawns; garage, sirens, vada pav stalls; story 3 & 5, Vigilante. Accept: addHeat → stars + cops; evasion clears; health 0 → wasted → HOSP.

**M6 – Queen's Necklace**: day/night + necklace lights; RacerAI, time trial, story 4, finale 6; 25 chai + bike unlock; sports car purchase; audio, engine, radio; full map + completion %. Accept: whole story completable via scripted teleports; no audio errors.

**M7 – Polish & done**: tuning (fares, timers, cop aggression), camera juice (shake, FOV 60→72), tutorial hints, settings (volume, traffic density), perf pass, update the existing README.md to match what was actually built (controls, missions, how to run/test) and remove its work-in-progress note.

**Definition of done:**
- [ ] `npm test` green from clean clone; zero console errors, page errors, 4xx.
- [ ] Title → gameplay < 3 s; all menus keyboard-reachable.
- [ ] 6 story missions, 4 side jobs, 25 collectibles completable; finale credits.
- [ ] Wanted 1–5 distinct; escape and bust both possible.
- [ ] Traffic stays left, obeys signals, clockwise at Regal; never permanently gridlocks.
- [ ] Every landmark identifiable on minimap and street level.
- [ ] 60 fps, ≤ 150 draw calls, no memory growth (pooling).
- [ ] Save/Continue works; money always has a use.
- [ ] 10-minute playtest: no soft-locks, always a next objective.

## 10. Pitfalls

- **Favicon 404** logs a console error → inline data-URI icon; no missing `public/` paths.
- **AudioContext** only after a gesture; guard every call.
- **`mergeGeometries` null** on mismatched attributes → normalise (position, normal, color, no uv, indexed) in `geom.js`.
- **InstancedMesh**: `setColorAt` before first render; `instanceMatrix.needsUpdate = true`; `frustumCulled = false`.
- **Colour space**: `new Color(hex)` converts sRGB → linear; don't double-gamma.
- **Left-hand traffic**: lane offset on the **left** of travel; left turns tight, right turns cross oncoming and must yield; roundabout clockwise; exit on right (kerb) side.
- **Headless perf**: swiftshader is slow; use `advance()` and low `?test=1` counts; never assert fps in e2e.
- **Keyboard focus**: listen on `window`, click canvas first in tests; preventDefault Tab/Space/arrows; clear keys on blur.
- **No pointer lock / fullscreen** (promise rejections → console errors).
- Never `console.error` for expected situations.
- Raise `chunkSizeWarningLimit`.
- **Determinism**: no `Date.now()`/`Math.random()` in simulation.
- **AI stability**: pure-pursuit look-ahead ≥ 6 m; sea wall thick or swept check to avoid tunnelling at 40 m/s.

## 11. Parallel-build contracts (authoritative; added for parallel work)

Several engineers build at once in separate git worktrees. **Only touch files you own.** If you need something from another owner's module, code against the contract below; if it doesn't exist yet in your checkout, write a tiny local stub in your own test only.

### `src/utils/geom.js` (exists; shared, do not edit without coordination)
`box(w,h,d,color,x,y,z,ry)` and `cyl(rTop,rBot,h,seg,color,x,y,z,ry)` (base sits at y), `cone(r,h,seg,color,x,y,z,ry)`, `dome(r,seg,color,x,y,z)`, `flatPoly([[x,z],...],color,y)`, `place(geo,x,y,z,ry,rx,rz)`, `colorize(geo,color)`, `merge(list)` (disposes inputs), `staticMaterial()`. All outputs indexed with position/normal/color, no uv.

### Landmarks — owned by the landmarks engineer: `src/world/landmarks/*.js`, `src/world/props.js`
`src/world/landmarks/index.js` exports `buildLandmarks()` → `{ geoms: BufferGeometry[], emissive: BufferGeometry[], colliders: Collider[], instanced: THREE.Object3D[], streetlights: { material, setNight(t /*0..1*/) } }`.
- `geoms`: world-positioned static geometry from geom.js (city builder merges into chunks).
- `emissive`: world-positioned geometry rendered with an emissive material that brightens at night.
- `colliders`: `{ x, z, hw, hd, rot }` oriented boxes (centre, half-width along local X, half-depth along local Z, rotation = heading radians). Same shape the city builder uses for buildings.
- `instanced`: ready-to-add Object3Ds (tetrapods InstancedMesh, streetlight poles, trees).
- Also exports `landmarkFootprints()` → `[{ id, x, z, hw, hd, rot }]` so the city builder can keep procedural buildings out of them, and `LANDMARK_POIS` → `[{ id, name, x, z }]` for minimap/missions.
- Uses mapData.js coordinates from §2 (Marine Drive curve points etc.). Landmarks may import `src/world/mapData.js` read-only.

### Audio — owned by the audio engineer: `src/audio/audio.js`, `src/audio/radio.js`
`createAudio(bus)` → `{ unlock(), update(dt, listener), engine(vehicleType|null, speed, throttle), horn(pos?), siren(on), crash(intensity 0..1), coin(), fail(), success(), radioNext() → stationName, setVolume(0..1), toggleMute() → bool, get ready() }`.
`unlock()` is called by Game inside the first keydown/pointerdown; before that every call is a silent no-op. Never construct AudioContext at import time. Never console.error. Subscribes to bus events `horn`, `vehicle:damaged`, `money:change` (positive → coin), `mission:complete`, `mission:fail` itself.

### Pure sim logic — owned by the sim engineer (no `three` imports, unit-tested with node --test)
- `src/entities/vehicleTypes.js`: `VEHICLE_TYPES` table from §4 (+ wheelbase, revMax, dmgK, radius circles offsets, colours for renderer: `paint`, `accent`).
- `src/physics/vehicleDynamics.js`: `createVehicleState(type, x, z, heading)` → `{type, x, z, heading, speed, vx, vz, steer, health, wrecked}`; `stepVehicle(v, input{throttle,-1..1, steer -1..1, handbrake bool}, dt)` arcade bicycle model; `vehicleCircles(v)` → `[{x,z,r}]`; `resolveVehicleVsBoxes(v, colliders) → impactSpeed`; `resolveVehicleVsVehicle(a, b) → impactSpeed`; `applyDamage(v, impact)`. Collider shape = `{x,z,hw,hd,rot}` (same as above). Heading convention: forward = (sin h, cos h) in (x,z).
- `src/gameplay/Wanted.js`: `class Wanted { constructor(bus); addHeat(n, copSees); update(dt, copHasLos); get stars; get heat; clear(); evadeProgress }` thresholds from §5.
- `src/gameplay/Economy.js`: `class Economy { constructor(bus, money=500); add(n, reason); spend(n) → bool; get money }` emits `money:change {money, delta, reason}`.
- `src/core/save.js`: `loadSave(storage=localStorage)`, `writeSave(data, storage)`, `defaultSave()`, `validateSave(obj)`; key `ctaBombay.save.v1`; all try/catch.
- `src/gameplay/fares.js`: `fareFor(routeDist, elapsed, damageTaken, streak)` → `{base, bonus, tipPenalty, total, multiplier}` per §6.

### Core/world/UI — owned by the M1 engineer
Everything else in M1 (`core/*` except save.js, `world/*` except landmarks/ and props.js, `physics/spatialGrid.js`, `physics/collision.js`, `entities/Player.js`, `render/*`, `ui/*`, tests harness). City builder calls `buildLandmarks()` from `src/world/landmarks/index.js`; until the landmarks branch merges, M1 ships a stub `index.js` returning empty arrays (the merge will take the landmarks version).
