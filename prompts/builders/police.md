# POLICE builder — owns src/ai/police.js, src/ai/police*.js, src/systems/**
Drive police cars ONLY via vehicle.setControls (robust to real tyre physics).
A) wanted.js `createWanted(game)`: level 0..5, heat, seen, lastKnown, searchRadius, flashing, update, addCrime,
   reportSighting, setLevel, clear. Listens to 'crime' (pedHit, pedKilled, carjack, vehicleRam, copAssault, punch,
   policeRam); escalation needs witnesses (cop within ~60 m w/ LOS; civilians lower weight). Seen → lastKnown follows;
   unseen → flashing stars + growing search circle; stay out of it unseen for 10 s (1★) … 35 s (5★) to clear.
   Cop assault min 2★. Emit 'wantedChanged'. Radio flavour via game.hud?.notify?.() using road/area names + vehicle type.
B) police.js `createPolice(game)` → { update, frameUpdate, units, clearAll }:
   0★ 1–2 patrols (witness crimes); 1★ 1–2 cars, 2★ 3, 3★ 4 + roadblocks + foot cops, 4★ 5–6 aggressive, 5★ 7.
   Spawn 120–220 m away out of view, ahead of travel. A* over the road graph to lastKnown, pure-pursuit lanes; within
   ~60 m with LOS direct pursuit: predictive intercept, ram/PIT at 3★+, box-in when slow; raycast feelers, stuck →
   reverse + repath, wrecked → abandon. Foot cops via pedSystem.spawnPed({kind:'cop', controller}) (fallback own mesh):
   chase, baton (player.damage), ARREST: on foot within ~1.3 m for ~1 s, or car stopped with cop at door ~1.5 s →
   player.bust(), emit 'busted'. Siren audio (Indian wail, nearest 2 audible) + light bars (vehicle.sirenOn).
   On bust/wasted/clear: units disengage and despawn out of view. Debug extra 'police'.
Tests: crime → dispatch; MD chase (tense but escapable, rams at 3★); hide → clear; on-foot bust; 10-min 5★ soak.
