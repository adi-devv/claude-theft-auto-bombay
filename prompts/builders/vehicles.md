# VEHICLES builder — owns src/vehicles/** (vehicle.js, collisions.js, driveCamera.js, models, audio, fx)
Driving feel is the most important thing in the game. Keep the CONTRACT Vehicle interface exactly.
1. Physics: arcade-sim hybrid for keyboard — slip angles with smooth saturating tyre curve, weight transfer, torque
   curve + auto gears, drag/rolling resistance, speed-sensitive steering with smooth input ramping, handbrake drifts/180s,
   gentle stability assist/counter-steer help, brake-to-reverse. Types: taxi (Padmini ~110 km/h, floaty), hatch,
   sedan (~160, the fun one), suv, police (~170, grippy), van (Omni), bus (BEST double-decker, heavy).
   Sedan targets: 0–100 ≈ 6–7 s, 100–0 ≈ 35–40 m, 90° city turn at ~45 km/h with steering only, reliable handbrake turn.
   Write telemetry tests and tune to hit them.
2. Collisions: static via collision.queryOBB (positional correction + impulse, restitution/friction, angular impulse —
   glancing hits scrape and redirect, head-ons stop). Vehicle↔vehicle in collisions.js via obbOverlap, mass-correct,
   emit 'vehicleCollision'. Sleep at rest, cheap LOD far away (>150 m), no tunnelling at 170 km/h.
3. Damage: smoke at low health, fire → explosion at 0 ('explosion' + 'panic' events), wrecked shell.
4. Models ≤ 6 draw calls each: Padmini kaali-peeli taxi, Mumbai Police SUV with flashing red/blue bar when sirenOn,
   BEST double-decker (red, cream band), hatch/sedan/suv/van in Indian colours. Steering/spinning wheels, body roll/pitch,
   head/tail/brake lights (emissive; night light-pool sprites; only the player's car may get a real SpotLight).
5. FX: skid marks (ring buffer), tyre smoke, sparks, camera shake on impact.
6. Audio (when game.audio.ready): RPM engine synth with gear shifts (player car; AI quiet), screech, crash thumps,
   `horn()` — sharp dual-tone Indian horn (bus deeper).
7. DriveCamera: weighty lagged chase cam, look-into-turn, speed FOV, never clips buildings (raycast pull-in),
   modes near/far/bonnet via cycleMode(), `look` offset springs back, stays behind when reversing, reset() on teleport.
Perf: 40 vehicles < 2 ms/frame physics.
