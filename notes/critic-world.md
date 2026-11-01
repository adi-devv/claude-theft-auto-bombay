# Critic report: DENSITY & WORLD + ATMOSPHERE (integrated build, game/, ?test=1)

Method: Edge headless D3D11, 960x540, player teleported to each spot and sim stepped 6 s so the ped/traffic rings populate, then camera frozen by hand. ~75 screenshots in `tools/critic-world/shots/` (all viewed). Scripts: `tools/critic-world/shots.js "name=px:py:pz:tx:ty:tz@hour,..."`, `closeups.js` (vehicle/ped close-ups), `pick.js` (raycast a screen pixel to a mesh), `net404.js`. `game.errors` empty in every run; the only console noise is one 404 on load (no favicon, harmless, P2).

## Scores
- **Density & World: 6 / 10.** Layout, block massing and the aerial read as South Bombay; Fort and the Art Deco row are dense and varied from above. At street level the world is a convincing stage with the wrong population: the road is nearly empty, there are no two-wheelers, landmarks are silhouette-only, and the plazas are bare.
- **Atmosphere: 6.5 / 10.** Night aerial of the Necklace and the sunset promenade walk are the strongest things in the build. Weakest: the sunset aerial (flat salmon haze, Necklace invisible), a visible horizon seam, black crowd silhouettes at night, and a very thin soundscape.

## Perf (headless, 960x540, `__game.debug.state().render`)
| View | fps | calls | tris |
|---|---|---|---|
| street (MD, Fort, Kala Ghoda, Gateway) | 103-144 | 38-318 | 0.14-0.93 M |
| aerial_md 21.5 / 12.5 | 98-102 | 376-379 | 1.11 M |
| overview (900 m up) | 102 | 460 | 1.26 M |
| aerial_necklace | 138-144 | 234-270 | 0.86-0.88 M |
No perf problem. There is headroom to spend on more cars and peds near the player.

Density measured near the camera (peds within 60 m / cars incl. parked within 80 m): promenade 66-114 peds / 6-10 cars; MD carriageway 67-76 / 6-11; Fort and Colaba 22-56 / 1-10; Jamshedji Tata Rd 13 / 14; Gateway plaza 41-46 / 2-3. 220 peds and 40 moving cars globally.

## Ranked defects

### P1 (hurts immersion clearly)

1. **Night crowd is solid black silhouettes.** Every ped (and the player) is a pure black cut-out at 21.5, even under a sodium lamp, while shopfronts glow. Reads like paper dolls and kills the night promenade.
   - Evidence: `shots/prom_s_21h5.png`, `kalaghoda_21h5.png`, `flora_21h5.png`, `colaba_21h5.png`, `jt_street_21h5.png` (compare day `prom_s_18h4.png`).
   - Repro: teleport (-428,-60), cam (-428,1.8,-60)->(-415,3,250), hour 21.5.
   - Owner: peds. `game/src/characters/crowd.js` line 6: `MeshStandardMaterial` with emissive 0x29231e x 0.16 and no night term (the lamps are glow sprites, not lights).
   - Fix: inject a night fill in the crowd shader keyed to `city.lightLevel`: warm sodium ambient of about 0.35-0.45 of albedo plus a faint rim, reusing the `uStreet` uniform the ground uses. Bump emissive by (1 - lightLevel). Add per-instance brightness variation so it does not look flat.

2. **Traffic on Marine Drive is far too thin for Mumbai.** A 6-lane, 24 m boulevard at 18.4 shows one bus and 3-4 cars in view. Real MD at dusk is bumper-to-bumper taxis and buses.
   - Evidence: `md_road_18h4.png`, `md_road_12h5.png`, `marinedr_traffic_18h4.png`, `md_road_7h2.png` (empty carriageway at 07:11), `aerial_md_12h5.png` (dots on a big road).
   - Repro: cam (-398,2.5,240)->(-403,3,90), any hour.
   - Owner: traffic. `game/src/ai/traffic.js` (population targets: 40 moving + 10 far, 22-27 parked, max 4 buses).
   - Fix: scale target by road kind and time (MD and arterials x2, evening 17-21 x1.5, buses up to 8-10). Spawn the extra cars as a slow "jam" cluster at signals. Draw calls allow it (street views run at 130-320 calls). Merge each car's 4 meshes (city.md already flags this) if calls climb.

3. **No two-wheelers, handcarts or cycles in the fleet.** The vehicle set is taxi / hatch / sedan / suv / van / bus / police only. Mumbai's street texture is scooters, bikes, cycles, thelas and tempos, so the road looks like a generic Western city with a yellow-top taxi.
   - Evidence: fleet count printed by `closeups.js`: taxi 16, hatch 12, sedan 16, van 6, suv 6, bus 4, police 2. Every street shot.
   - Owner: vehicles + traffic. `game/src/vehicles/models.js`, `ai/traffic.js` spawn table.
   - Fix: add a light 'bike'/'scooter' type (two instanced boxes + rider from the ped geometry) at 15-20% of traffic, filtering between lanes at low speed. Optionally a parked/pushed thela on the kerb. (No autorickshaws is correct and authentic.)

4. **Sunset aerial is a flat pink haze; the Queen's Necklace does not read at 18.4.** At the hour the whole pitch is built around, the classic MD aerial shows no lit pearls, no sun disc, and little contrast. It turns spectacular only at 21.5.
   - Evidence: `aerial_necklace_18h4.png`, `np_aerial_18h4.png` vs `aerial_necklace_21h5.png`, `aerial_md_21h5.png`.
   - Repro: cam (-760,160,380)->(-420,0,-80), hour 18.4.
   - Owner: city. `game/src/world/sky.js` keyframes (fogDensity at 18-19), `glows.js` (lamp `kind` thresholds).
   - Fix: at 18.0-19.0 lower fog density (haze eats the lamps and the sun glow), add a visible sun disc and a stronger low-sun band/glitter on the sea, switch the Necklace on from lightLevel < 0.7 (pearls plus sea reflections), and raise sunset saturation. Make 18.4 the hero keyframe.

5. **Horizon seam.** The sea plane (9000 m) is clipped by camera far = 3000 and the fog colour does not match the sky-dome horizon colour, so a hard straight line separates sea from sky: yellow-orange band against grey haze at 18.4, dark band against black at 21.5, and a visible edge at noon.
   - Evidence: `aerial_necklace_18h4.png` (y~167), `aerial_necklace_21h5.png`, `np_aerial_18h4.png`.
   - Owner: city. `game/src/world/sky.js` (fog colour vs `hor` colour per keyframe), `world/sea.js:89`, `game/src/main.js:45` (far 3000).
   - Fix: make the fog colour equal the sky shader's horizon colour at every keyframe, fade the sky dome to fog colour in the lowest ~6 degrees, and fog the sea so it reaches the fog colour before z-far (or extend far, or alpha-fade the sea at the edge).

6. **Soundscape is thin.** Implemented: sea swell/surf, a lowpass-noise traffic hum (gain 0.05), crows by day (gain 0.025), crickets at night (gain 0.006, effectively inaudible), per-car engines (40 m radius), dual-tone horns, player footsteps/punch, a rare ped scream. Missing: crowd murmur/chatter on the promenade, vendor calls, temple bells/azaan, train horns near Churchgate/CST, distant music or radio, traffic jam honking as ambience, footsteps for peds, no distinct day/night beds beyond crickets. Headless cannot hear it, so this is a judgement from the code only.
   - Owner: city (`game/src/world/ambient.js`, 45 lines), peds (`game/src/ai/peds.js`), traffic (honk timing).
   - Fix: add a crowd-murmur bed (bandpassed noise with formant wobble) scaled by `peds within 30 m`, a periodic distant train horn at CST/Churchgate, 2-3 vendor-call stingers, and raise cricket gain to audible (~0.03). Make ambient honking density follow nearby car count and a rush-hour multiplier.

7. **Gateway of India does not convince from the front.** Side arches are flat black rectangles (read as holes, not arches), the central arch is a boxy tunnel, domes are four stubby orange stacks, and the plaza in front of it is a bare brick void with one car. The aerial silhouette is fine.
   - Evidence: `gateway_18h4.png`, `gateway_21h5.png` (night: the front face is a glowing slab), `gateway_air_18h4.png`.
   - Repro: cam (350,3,395)->(398,12,390).
   - Owner: city. `game/src/world/landmarks.js` (gateway), keep-out in `buildings.js`.
   - Fix: model the real layout: large central semicircular arch with a hexagonal-domed top and four turrets, shallow arched niches (recessed, lit) on the side bays, basalt/yellow texture with jali panels, stairs down to the quay. Populate the plaza (pigeons, hawkers, tourists in clusters, boats at the steps) and light the plaza.

8. **Horniman Circle and Flora/Kala Ghoda monuments are placeholders.** Horniman's garden is an empty dark lawn with a "mushroom table" fountain (reads as nothing); Flora Fountain is a plain grey tiered cylinder with no figures or ornament and sits in a huge empty roundabout; Kala Ghoda/Wellington is a white dome gazebo. The Fort district's identity lives in these.
   - Evidence: `horniman_18h4.png`, `horniman_21h5.png`, `flora_close_12h5.png`, `flora_12h5.png`, `kalaghoda_21h5.png`.
   - Owner: city. `game/src/world/landmarks.js` (Flora / Horniman / Wellington / Kala Ghoda).
   - Fix: Flora: octagonal base, 3 stacked basins, ornate centrepiece with a figure on top, water particles. Horniman: scatter 25-40 trees plus gravel paths and lamps; planted beds. Add real people on benches. Reduce the roundabout's empty paved radius or add planting.

9. **Colaba Causeway is a road to nowhere.** The Causeway is just a straight Fort-style street ending in a flat dark barrier at the map edge; no hint of Colaba (Leopold, Cusrow Baug, Causeway stalls, tourists).
   - Evidence: `colaba_21h5.png`, `colaba2_18h4.png`. Repro: cam (118,2,420)->(120,4,540).
   - Owner: city. `buildings.js` frontage (give Causeway its own pavement-stall rows and signage), `props.js` barricades.
   - Fix: line the Causeway with striped awnings, hawker stalls, "LEOPOLD CAFE"-type signs; dress the map-edge barricade as a Metro-works hoarding with lights/trucks so it reads as intent, not a void.

10. **Off-promenade streets feel empty.** Promenade is genuinely crowded (66-114 peds within 60 m). Fort lanes and Jamshedji Tata Rd are 13-30 peds within 60 m, nobody sits at bus stops/kiosks, vendors are sparse. Walking from MD into Fort the city drains of life.
   - Evidence: `jt_street_21h5.png` (13 peds), `flora_12h5.png`, `churchgate_stn_12h5.png` (one lone ped at Churchgate), `highcourt_12h5.png` (empty Oval Maidan, no cricketers seen).
   - Owner: peds. `game/src/ai/peds.js` / `pedsRoutes.js` (ring of 220, weights).
   - Fix: make weights follow footfall: Fort and Churchgate/CST forecourts x2, bus-stop queues, kiosk customers, cricket teams guaranteed visible on Oval Maidan. Lift the ring from 220 to ~320 (draw calls are capped at 17 for the crowd).

### P2 (polish)

11. **Night facades and trees collapse to black voids at street level.** Facade shadow sides and upper floors go pure black with only scattered lit windows; trees are black cut-outs with unlit undersides (also in daytime shadows). No moon/sky-glow on walls. Evidence: `kalaghoda_21h5.png`, `flora_21h5.png`, `jt_street_21h5.png`, `rajabai` pre-fix camera under a tree. Owner: city `materials.js` (facade shader `uShop`/night lighting), `sky.js` hemisphere at night. Fix: keep a minimum blue-grey hemi term on facades (about 0.08), lift tree material ambient, add a faint warm bounce near lamps.

12. **Sodium wash tints all ground chocolate-brown/red at night.** Roads read as brown-red rather than orange-lit asphalt, flattening contrast. Evidence: `md_road_21h5.png`, `colaba_21h5.png`. Owner: city `streets.js`/`materials.js` emissive on asphalt. Fix: desaturate the emissive and pool it under each lamp (radial falloff) instead of uniform.

13. **Trees are crude.** Faceted low-poly umbrella canopies (red gulmohar and green rain tree) with thick tapering trunks dominate foregrounds on the maidans and Churchgate road. Evidence: `churchgate2_12h5.png`, `oval_18h4.png`, `highcourt_12h5.png`. Owner: city `props.js`. Fix: 2-3 variants with several blob lobes and vertex-colour variation; some taller palms on the promenade.

14. **Road and pavement textures are low-res / decal-like.** Asphalt has big dark axis-aligned rectangular "patch" decals and cracks that read as floating squares; close-up pavers are pixelated mush (`ped_close0_12h5.png`, `slab_d_12h5.png`, `flora_close_12h5.png`). Owner: city `textures.js`, `streets.js`. Fix: lower patch contrast and rotate/jitter them, raise paver texture resolution and add anisotropic filtering and a normal-ish detail layer.

15. **Facade repetition at street level.** From above the mix is good (`aerial_md_12h5.png`, `overview_12h5.png`), but on foot the Fort blocks (`flora_12h5.png`, `kalaghoda_21h5.png`) share one arched-window/ashlar pattern with the same shutters, and the MD Deco row (`deco_md_18h4.png`, `md_prom_12h5.png`) is plain slabs with identical black balcony strips and generic signs (BOMBAY STATIONERY MART). Missing Art Deco vocabulary: rounded corner bays, stepped parapets, cantilever chajjas, pastel banding, vertical fins. Owner: city `buildings.js`, `materials.js`. Fix: add 4-5 deco lot templates with those features and vary window grids and colours.

16. **Taj Mahal Palace facade is a bland grey cliff.** Red domes read well (`taj_12h5.png`, `gateway_air_18h4.png`) but the front is an unarticulated window grid with no entrance, porte-cochere or arches at ground level. Owner: city `landmarks.js`. Fix: central entrance portico, arched arcade at ground, balcony rhythm.

17. **Rajabai Tower clock face is a blank white square**, and the University's other elevations are flat. Evidence: `rajabai_12h5.png`. Owner: city `landmarks.js`/`textures.js`. Fix: paint a clock face texture, lit at night.

18. **Duplicate area label.** HUD shows "Marine Drive" in big serif and "MARINE DRIVE" below when area name equals road name (`md_road_21h5.png`). Owner: player/HUD `game/src/ui/hud.js`. Fix: hide the sub-label when identical. HUD style otherwise good: GTA-like clock, stars, health bar, round minimap.

19. **Nariman Point coast.** The land edge near NP shows as a flat dark wedge/ramp against the sea with Cuffe Parade towers floating behind it (`np_aerial_18h4.png`). Owner: city `far.js`/`sea.js` edge. Fix: add a sea-wall + tetrapod strip and shoreline foam along the whole edge, and ground the Cuffe towers on a shore.

20. **Street furniture at night.** BEST bus stops are dark (only the advert lit), roundabout asphalt is huge and empty (`flora_12h5.png`), bollards/cart sparse. Owner: city `furniture.js`. Fix: lit stop interior and glow, a few parked vehicles/carts on the roundabout approach.

21. **Console 404 on every load** (static file missing; most likely favicon). Owner: game/index.html. Fix: add a favicon or `<link rel="icon" href="data:,">`.

## What I checked and did NOT find broken
- Buildings or props on roads: none seen in any of the street views (city's `clear.js` claim holds visually). No visible z-fighting. No floating geometry apart from camera-inside-building artefacts that were my own positions (e.g. the curved balcony slabs hanging in `regal_12h5.png` were seen from inside the lot at (118,2,300)). Taxis (black body, yellow top), BEST double-decker with route board, police SUV all read correctly.
- Landmarks that read at a glance: CSMT with dome and BMC tower (`cst2_12h5.png`), Rajabai Tower and University (`oval_18h4.png`), High Court (`highcourt_12h5.png`), Taj domes.
