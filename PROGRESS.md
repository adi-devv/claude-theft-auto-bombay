# Progress log

_Last updated: 2026-10-12 by the lead (Opus) session._

## Milestones (PLAN.md §9)
- [x] **M1** Foundations and city (done on `main`: 25 unit + 3 e2e tests green, 19 draw calls)
- [ ] **M2** Wheels
- [ ] **M3** Living city
- [ ] **M4** Hustle
- [ ] **M5** Heat
- [ ] **M6** Queen's Necklace
- [ ] **M7** Polish, balance, done

## Wave 1: done
M1, `wip/audio`, `wip/sim` merged into main (64 unit + 3 e2e green). `wip/landmarks` still building; merge it when pushed (take its `src/world/landmarks/index.js` over the stub).

## Wave 2: parallel builders (see PLAN.md §12 for contracts)
| Work | Branch | Status |
|---|---|---|
| Driving (M2) | `wip/driving` | building |
| Traffic (M3) | `wip/traffic` | building |
| Peds (M3) | `wip/peds` | building |
| Missions (M4) | `wip/missions` | building |

Lead merges each into main when green; conflicts expected only in Game.js/testApi.js marked blocks.

## Next steps
1. ~~Finish M1 on `main`~~ done.
2. Merge `wip/landmarks`, `wip/audio`, `wip/sim` into `main`; wire landmarks into the city builder and audio into Game; `npm test`; push.
3. Wave 2 (parallel, disjoint files): (a) vehicle renderer + enter/exit + driving integration (M2); (b) traffic AI + signals + roundabout (M3); (c) peds (M3); (d) mission framework + taxi fares + Dabba Rush + phone + HUD (M4).
4. Wave 3: police/wanted integration, story missions, race, collectibles, day/night (M5–M6).
5. M7 polish, README, then `<promise>DONE</promise>`.

## Known issues
- M1: `debug.teleport` does not resolve collisions, so teleporting into a building leaves the player inside it.
- M1: landmarks are a stub (`src/world/landmarks/index.js`); landmark footprints are not yet collision/building-exclusion inputs.
- M1: JS bundle is ~600 kB (three.js unsplit); fine for now.

## M1 built (for later engineers)
- `src/core/`: config, events bus, seeded rng (`?seed=`), fixed 1/60 loop with `__game.advance(sec)`, input, `Game` (ordered systems list, shared `ctx`), `testApi`.
- `src/world/`: `mapData` (pure data), `roadGraph` (left-hand lanes: `lanePoint`, `nearestLane`, connectors, footpaths, `routeTo`), coast/sea/ground, road + marking + footpath meshes, procedural buildings with rejection rules, maidans, per-300 m chunk merging.
- `src/physics/`: `collision` (circle/OBB/segment/SAT) and `spatialGrid`; colliders are `{x,z,hw,hd,rot}`.
- `src/entities/Player.js`, `src/render/CameraRig.js`, UI (title, pause, HUD shell, minimap).
- Add a system: `game.addSystem(name, sys, order)`; it gets `update(dt, ctx)` each fixed step while `playing`.

## Integration notes from builders
- **audio**: call `audio.unlock()` in the first keydown/pointerdown; each frame `audio.update(dt,{x,z})` and `audio.engine(type|null, speed, throttle)`. Emit `horn {pos, source}` on the bus; `horn()` with no args = player horn.
- **sim**: positive `steer` = turn LEFT (heading increases) → map A to +1. `resolveVehicleVs*` return impact speed but do NOT apply damage; caller does `applyDamage(v, impact, isPlayer ? type.playerCrashDamageFactor : 1)`. Taxi 0–100 km/h 8.8 s; full-lock turn radius @10 m/s: auto 2.8 m, taxi 4.5 m, bus 21 m.
