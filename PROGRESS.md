# Progress log

_Last updated: 2026-10-12 by the lead (Opus) session._

## Milestones (PLAN.md §9)
- [ ] **M1** Foundations and city: in progress on `main` (core, world, roads, buildings, player, camera, UI shell, minimap, test harness)
- [ ] **M2** Wheels
- [ ] **M3** Living city
- [ ] **M4** Hustle
- [ ] **M5** Heat
- [ ] **M6** Queen's Necklace
- [ ] **M7** Polish, balance, done

## Wave 1: parallel builders (running)
| Work | Branch | Owns | Status |
|---|---|---|---|
| M1 core + city | `main` | everything in M1 not listed below | building |
| Landmarks + props | `wip/landmarks` | `src/world/landmarks/*`, `src/world/props.js` | building |
| Audio | `wip/audio` | `src/audio/*` | done, pushed, unmerged (8 unit tests) |
| Pure sim logic | `wip/sim` | `vehicleTypes`, `vehicleDynamics`, `Wanted`, `Economy`, `fares`, `save` | done, pushed, unmerged (31 unit tests) |

If a branch above is pushed but unmerged, merge it into `main` (they own disjoint files; the only expected conflict is `src/world/landmarks/index.js`, where you take the landmarks version). Then run `npm test`, fix, and push.

## Next steps
1. Finish M1 on `main` (npm test green), then push.
2. Merge `wip/landmarks`, `wip/audio`, `wip/sim` into `main`; wire landmarks into the city builder and audio into Game; `npm test`; push.
3. Wave 2 (parallel, disjoint files): (a) vehicle renderer + enter/exit + driving integration (M2); (b) traffic AI + signals + roundabout (M3); (c) peds (M3); (d) mission framework + taxi fares + Dabba Rush + phone + HUD (M4).
4. Wave 3: police/wanted integration, story missions, race, collectibles, day/night (M5–M6).
5. M7 polish, README, then `<promise>DONE</promise>`.

## Known issues
- (none yet)

## Integration notes from builders
- **audio**: call `audio.unlock()` in the first keydown/pointerdown; each frame `audio.update(dt,{x,z})` and `audio.engine(type|null, speed, throttle)`. Emit `horn {pos, source}` on the bus; `horn()` with no args = player horn.
- **sim**: positive `steer` = turn LEFT (heading increases) → map A to +1. `resolveVehicleVs*` return impact speed but do NOT apply damage; caller does `applyDamage(v, impact, isPlayer ? type.playerCrashDamageFactor : 1)`. Taxi 0–100 km/h 8.8 s; full-lock turn radius @10 m/s: auto 2.8 m, taxi 4.5 m, bus 21 m.
