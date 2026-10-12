# PLAYER & HUD builder — owns src/player/**, src/ui/** (style.css only if necessary)
A) player.js per CONTRACT:
 1. Own protagonist model + procedural anims in src/player/playerModel.js (Bombay style: open printed shirt over vest,
    jeans, chappals/sneakers): idle, walk, run, sprint, jump, punch, enter/exit, fall/get-up, busted hands-up, wasted.
 2. On foot: camera-relative WASD, smooth accel/turn, Shift sprint, Space jump, resolveCircle + push out of vehicle OBBs,
    knocked down/damaged by moving cars, punch (J/click) → ped.knockDown + 'crime' punch (copAssault if isCop).
 3. Vehicles: F/Enter within ~6 m → auto-walk to driver door (RIGHT side, RHD) → get in; occupied → driver.eject()
    = carjack ('crime' carjack, 'playerEnteredVehicle' jacked). Driving: W/S throttle/brake, A/D steer (+1 right),
    Space handbrake, H horn, L siren (police), R reset/flip when slow, F exit (bail out & tumble > 30 km/h).
 4. Cameras: on-foot over-shoulder orbit (pointer-lock mouse, Q/E fallback), auto-recentre, raycast pull-in; in car
    DriveCamera(update(dt, v, {yaw,pitch,active}), cycleMode on C, reset on enter); ~0.4 s blend foot↔car.
 5. damage/wasted (slow-mo, desaturate, WASTED → respawn St George's Hospital ~x230,z-470 on a free footpath) and
    bust (BUSTED, hands up → respawn at policehq); wanted cleared; emit 'wasted'/'busted' then 'respawn'; input off.
 6. Attract mode while game.started === false: cinematic camera drift along Marine Drive at dusk.
B) hud.js: title screen (CLAUDE THEFT AUTO — BOMBAY, Art Deco/sunset style, Enter to start, controls) → game.started;
   rotating minimap (pre-rendered map canvas: sea, parks, roads; player arrow, flashing police blips, search circle,
   landmark icons, north); wanted stars (flashing), health, speedometer; GTA-style area/street name popups + vehicle
   names; message/notify/bigText/showTitle; pause (P/Esc) with controls; big map (M); fading start hints.
   Polished look, magenta/amber sunset accents, readable at 1280×720.
