# PEDS builder — owns src/ai/peds.js, src/ai/peds*.js, src/characters/**
`createPeds(game)` → pedSystem per CONTRACT (update, frameUpdate, spawnPed(opts), nearest, panicAround), fills game.peds.
1. INSTANCED crowds (≤ 25 draw calls total, 200 visible at 60 fps): body-part InstancedMeshes (head, hair, torso,
   arms, legs + sari/kurta/dupatta/school-uniform/office/salwar variants), procedural per-instance animation (walk,
   idle, run, sit, lie), vivid Mumbai palette, varied skin tones. Distance culling + update LOD.
2. Placement: footpaths both sides of streets (STREET offsets), crowded MD promenade at dusk (strollers, joggers,
   families, people SITTING on the sea wall facing the sea, chana/bhutta/chai vendors), busy Fort arcades, crowds at
   Churchgate/CST, cricket matches on the maidans (batsman, bowler run-up, fielders), bus stops. 150–250 active in a ring.
3. Behaviour: follow footpath polylines, cross at zebra crossings (look/wait), separation, resolveCircle vs statics,
   stay off carriageway. Panic on 'panic'/'explosion'/'crime'/big 'vehicleCollision' → flee then calm. Dodge cars on footpaths.
4. Impacts vs vehicle OBBs (spatial hash): rel speed > ~2 m/s → ragdoll-lite knockdown (fling, spin, bounce, lie; get
   up if slow, else 'dead' and fade ~30 s). Emit 'pedHit'; if vehicle.driver === 'player' emit 'crime' pedHit/pedKilled
   (>8 m/s). Small applyImpulse on car. Slow cars push peds aside. `ped.knockDown(vx,vz,source)` for punches.
5. spawnPed kinds: 'cop' (khaki Mumbai Police uniform + cap; police passes controller(ped, dt)), 'driver' (flees).
   Document the controller contract.
6. createHumanoid(opts) single non-instanced character (optional use).
7. Sparse synth screams. Debug: `game.debug.extra.peds = () => ({active, visible, byState, drawCalls})`.
