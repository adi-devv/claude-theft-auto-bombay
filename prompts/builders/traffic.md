# TRAFFIC builder — owns src/ai/traffic.js, src/ai/traffic*.js, src/ai/signals.js
Drive cars ONLY via vehicle.setControls (real tyre physics differs from the stub — closed-loop, robust).
`createTraffic(game)` → `{ update(dt), ... }`:
1. ~35–45 moving vehicles within ~250 m, spawn out of view (>150 m, outside frustum), despawn behind. Mix: ~40% taxis,
   hatch/sedan/suv/van, BEST buses on arterials/MD. No autos, no police (police agent). ~25 parked cars on kerbs
   (driverless, stealable), same spawn ring.
2. Pure-pursuit lane following (LEFT-hand traffic), speed PID (MD 55–70 km/h, arterials ~40, lanes ~25), slow for curves,
   occasional lane changes.
3. Junctions: route choice (no U-turn unless dead end; exits despawn; GATE = turn around), Bezier turn paths, gap
   acceptance; SIGNALS junctions with phases + stop lines + signal-head visuals (instanced); roundabouts FLORA/HORN/REGAL
   circulate CLOCKWISE, yield to circulating traffic.
4. Following: OBB look-ahead vs all vehicles + peds, 2 s gaps, emergency brake; blocked >3 s → honk, then pass via
   opposite lane if clear or reverse; deadlock detection/resolution.
5. Reactions: rammed → honk/flee/stop; siren behind within 40 m → pull over left. Driver object
   `{kind:'traffic', eject()}`: release AI, driver=null, spawn fleeing ped at driverDoor() via pedSystem.spawnPed
   ({kind:'driver'}) (guarded). Wrecks abandoned.
6. Recovery: pushed off-lane → rejoin nearest lane or recycle off-screen.
7. Debug: `game.debug.extra.traffic = () => ({active, parked, stuck, avgSpeedKmh, collisionsLastMin})`.
Perf: 45 cars < 1.5 ms/frame. Verify with 5-min debug.step runs (≈0 AI-AI collisions, no gridlock) + aerial shots.
