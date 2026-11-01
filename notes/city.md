# CITY critic-fix round - 2026-11-01 (current handoff)

Only edited work/city/src/world/{ambient,buildings,city,far,furniture,glows,landmarks,materials,props,sea,sky,textures}.js, tools/city/** and this note. game/, main.js, mapdata.js, roads.js and collision.js were not edited. This section supersedes historical known-issues/performance lists below.

## Changes

- Dusk: fog densities at 17.6 / 18.4 / 18.9 are 0.00065 / 0.00055 / 0.0007. Lamps fade in from 18:00, sharing the street factor with water reflections. Glows preserve distant pearl coverage with a stronger dusk ramp. Explicit western sun disc plus sea glitter. The aerial Necklace camera faces east/northeast, so the west sun is behind it; sunset-west_final.png checks the sea-facing sun. Night fog keyframes and reflection strengths retained.
- Horizon: sky horizon is the single fog-colour source. Three r169 applies fog after tone mapping/output conversion, so sky.js computes matching ACES horizon colour in that space. The dome's lowest six degrees converge to it, and water fades fully between 1400-2650 m, before the existing 3000 m far plane. Checked dawn, noon, sunset and night. No camera change needed.
- Gateway: three real extruded semicircular archways with deep soffits, four proportioned domed turrets, solid low central cap, stone surrounds, bracketed jharokha eaves and lattice bars. Quay steps descend to the water; low rails, lamps and bollards flank the plaza. New solids stay off roads.
- Flora: smaller paved/green island, octagonal base, water basins, peripheral carved figures, upright Flora figure, ornamental rims and falling-water strands/drops. Small ornaments use economical geometry.
- Horniman: 28 trees, lamp ring, paths, iron railing, two-tier fountain; curved arcaded perimeter buildings retained. Existing island collider covers garden trunks, avoiding redundant colliders across the road scanner.
- Kala Ghoda: rounded black horse with articulated legs, raised foreleg, ears, muzzle, tail, saddle, seated rider, helmet and reins. Plinth position (100.38, 206.62). Rajabai: four luminous round faces with hour marks and hands.
- Taj: ground arched colonnade, central entrance portico, balcony slabs/balusters and harbour-wing courses; existing arched upper windows and red domes retained.
- Colaba: dedicated smaller/lower shop lots, striped awnings, book/curio display tables and local signboards. One Leopold Cafe frontage with cups; removed conflicting generic shop signs. Blank wall behind COL_X replaced with staggered shops suggesting a continuing street beyond the traffic-safe Metro closure.
- Audio: crowd murmur/formant beds depend on nearby peds, promenade/Fort proximity and hour. Rush-hour distant honks, syllabic vendor/chai calls, layered train horns near Churchgate/CSMT, occasional Fort bells, crows and night crickets. Stronger close surf uses seawall-segment distance. AudioContext event clocks prevent debug.step bursts; transient nodes disconnect after playback. No external files.
- Night/surfaces: faint cool facade fill, more night hemisphere fill and occupied windows, neutral low ground emission and restrained warm asphalt pools. Removed uniform brown-orange wash. Lower-contrast rotated irregular repairs, 1024 px pavers/promenade, anisotropy and paving bump detail. Four smooth coherent lobes per street canopy at the same two instanced draws. BEST shelters have a ceiling tube, warm interior panel and small glow; reduced oversized blue advert halo.
- Deco: additional pastel courses, fins and eyebrows, plus consistent Deco frontage on the Oval's Maharshi Karve row.
- Nariman/Cuffe: southern parapet and tetrapods; grounded Cuffe shore with wall/rocks, brighter pavement and low waterfront buildings replacing the empty dark wedge. Foam texture includes the shore.

## Final validation

GAME_URL=http://localhost:8765/work/city/; Edge headless D3D11, 960x540 unless noted.

- tools/city/clear.js: 0 overlaps / 92,798 samples; errors []. Saved clear-results.txt.
- tools/city/traffic.js 120: collisions 0 and AI hits 0 in every ten-second sample. Final active 40, parked 21, average 16.6 km/h, waiting 7, stuck counter 1 (varied 0-3), 0.225 ms/step; errors []. Saved traffic-results.txt. Signal/wait counters are reported directly, not claimed zero.
- tools/city/calls.js now warms the live simulation, then checks four overview cameras at 12.5 / 18.4 / 21.5 with traffic running. Worst 530 calls and 1,475,684 triangles; 76 vehicles present. Static city: 863,055 triangles in 167 merged meshes. City construction: 1666 ms. Errors []. Saved calls-results.json. Counts include shadows and vehicles. Recheck after future fleet/population changes.
- tools/city/ambient-test.js: 61 real seconds across stations, Fort, seawall and late night; AudioContext running, errors []. Recorded 14 honks, 1 vendor call, 2 train horns, 1 bell sequence and 6 crow events. Near-train factor 1 at both stations. Seawall surf factor 0.919; ambient RMS about 0.0122 there vs 0.00168 late at night. Runtime/gain/analyser verification, not a listening pass. Saved ambient-results.json.
- Read and LOOKED at critic screenshots, fresh baseline shots and final shots. tools/city/review.js captures matched views against unchanged game/ (before) or sandbox (final). tools/city/sheets.js produces shots/review-sheet-1.png through review-sheet-3.png: before left / final right. All three sheets and important full-size close-ups inspected. Latest evidence: horse_final.png, cafe_final.png, gateway-steps_final.png, clock_final.png, flora-close_final.png, bus-stop_final.png, horizon-noon_final.png, horizon-dawn_final.png, sunset-west_final.png, plus aerial_necklace_after_18h4.png and aerial_necklace_after_21h5.png. Full review telemetry in review-final.json.

## Requests / limits

- Architect/index owner: existing favicon/static-icon 404 still appears in console. Add the missing icon or a data favicon in index.html. __game.errors remains empty; no world-code change needed.
- Integrator: copy only the 12 owned world files listed above. No far-plane change needed. Landmark water is stylized static geometry; monuments remain procedural approximations. Gateway tourists, seated garden crowds and fleet density remain with their owners.
- No git state-changing commands, integration or publication performed.

---
# CITY — status notes (work/city/src/world/)

Entry: `createCity(game)` in `city.js` → `{ update(dt), setTimeOfDay(h), timeOfDay, isNight, lightLevel, sunDir, promenadeSeats, benchSpots, roundaboutIslands, crossings, stats }`.
Build order: materials → sky → fields → ground → markings → landmarks (fills ctx.keepOut) → buildings → props → far → sea → batch merge → glows.

## Files (all new except city.js)
- `city.js` orchestration, T-key time cycle (18.4 → 21.5 → 7.2 → 12.5), slow clock (1 h = 8 min), `debug.extra.city`.
- `geom.js` Batch (merge per material key × 300 m chunk), prism, roundRectPoly, PRIM shapes.
- `field.js` SDF grids (carriageway, footpath, frontage, land, park) + marching-squares contour; roundabout islands.
- `streets.js` asphalt / paving / promenade / grass / kerbs (checker-painted) / sea wall faces; markings (lanes, zebras, stop lines).
- `materials.js` single procedural 'facade' material (windows, shops, arcades, ashlar, tiles, night lighting via uniforms).
- `textures.js` canvas textures + sign atlas (shop signs, deco names, big signs EROS/REGAL/AIR INDIA/...).
- `sky.js` sky dome, sun/moon, the ONE shadow-casting light (follows camera), fog/exposure keyframes, PMREM env.
- `sea.js` animated sea shader (foam, sky reflection, glitter), parapet sea wall (seats), instanced tetrapods, lamp reflections.
- `glows.js` one THREE.Points for every lamp/beacon (min pixel size → necklace pearls).
- `buildings.js` ~2950 procedural lots: deco / fort (arcades) / modern / towers / chawls; box colliders per lot.
- `props.js` MD necklace lamps (promenade row + median double-arm row, sodium glows + sea reflections), city streetlights (staggered, junction corners/SIGNALS kept clear), instanced trees (rain tree / gulmohar) on maidan edges + streets, maidan railings with gaps + cricket pitches, Metro-works barricades closing MD_NX/CST_X/SBS_NX/COL_X. Colliders: lamps (circle 0.25), trees (0.45), railings (segments), exit walls.
- `far.js` Chowpatty shore + Malabar Hill (low-poly hill, ~70 towers, hill lights) with the Necklace continuing round the bay (glows + sea reflections). Non-collidable, outside the map.
- `ambient.js` procedural ambience on bus 'ambient' (starts once game.audio.ready): sea swell + surf scaled by distance to coast, traffic hum (quieter at night), crow caws by day, crickets at night.
- `landmarks.js` all LANDMARKS + Flora/Wellington/Horniman monuments, island colliders, Horniman ring arcades, Kala Ghoda horse.
- Tools: `tools/city/shots.js` (named views), `tools/city/montage.js` (2×2 grid), `tools/city/tris.js` (tri breakdown), `tools/city/dbg.js`.

## Done
- Sky/time of day, sea, ground/streets/markings, roundabouts, buildings, landmarks (first pass), colliders for buildings, landmarks, islands, sea wall (land polyline).
- Shopfront blow-out at dusk fixed (uShop scaled by (1-0.75*lightLevel), emission ×0.35–0.6).

## Fix-up round (this round) — files: props.js, buildings.js, landmarks.js, textures.js, materials.js, far.js, city.js + NEW furniture.js, boats.js
- **Traffic request (P0) done.** props.js: lamps / maidan railings / trees are now culled wherever a 1 m piece falls on a carriageway or junction box (`onRoad()` = `roads.isOnRoad` + carriageway SDF), railings are rebuilt as merged runs of accepted 1 m pieces (gaps every 45 m kept); street trees off roads by 2 m, maidan trees 3 m; MD median lamps skipped near non-MD junction nodes (NP). buildings.js: Fort arcade piers never placed on a carriageway/junction. landmarks.js: University library wing shortened (no longer reaches Esplanade Lane).
  `tools/city/clear.js` scans every road edge (1.5 m steps x 1 m lateral, r 0.45 probe, MD median excluded) + every junction box for static colliders (ignores roundabout 'island', 'seawall', and the Metro barricades 'exit' which sit beyond the exit node): before = 23 overlaps (Hazarimal Somani Marg railings/trees, X1, KBP_VN, KBP_S pillar, NP lamp, Esplanade landmark); **after = 0 of ~92.8k samples**. Traffic's own `tools/traffic/t13.js` lane-piece + connector scan: 272 pieces / 608 connectors, 0 hits.
- **Taj** : forecourt keep-out (`F.keep(-13,39,62,28)` in B.taj) removes the filler blocks between the Gateway plaza and the Taj; facade + red domes read clearly (tools/city/shots taj_plaza / taj_air).
- **furniture.js** (merged into the shared batches, no new draw calls): 31 BEST bus stops (red/cream shelter, glazed back, bench, backlit advert, BEST flag sign; arterials + MD land side), 70 chai/paan kiosks (lit counter at night, awning, stools), 31 hand-carts (thelas with produce + umbrella), 359 bollards (zebra-crossing mouths + Gateway quay), small 'prop' colliders. Spots must be on the footpath field, off carriageways/junctions/parks and clear of all colliders (74 rejected). Rooftop hoardings (two-sided, 8 ad textures from the atlas, steel frame + lamp hood) on ~30% of low modern lots (buildings.js `rooftopHoarding`) — ground hoardings were dropped because Fort upper floors overhang the footpaths.
  List of placed pieces: `game.city.furniture` = [['bus'|'kiosk'|'cart'|'hoard', x, z, ...]].
- **boats.js**: 4 InstancedMeshes (6 ferries, 5 launches, 6 dhows, 2 far container ships) east of the Gateway; 3 ferries + 2 launches moored, the rest cruise/drift inside harbour zones (x 470-760, z 250-520), bob + roll; windows/nav lights glow at night (aGlow vertex attribute). No colliders (outside the land).
- **Cuffe Parade** (far.js): shoreline strip south of Nariman Point with 46 towers (45-155 m, lit windows, red aircraft beacons) + sodium shore lights reflected in the bay.
- **Palette**: asphalt base 92 -> 120 grey (+shader factor 0.82 -> 0.9); more Art Deco pastels (15), colonial stone/earth tones (18), modern (15) and chawl (11) colours.
- Check tools: `tools/city/clear.js` (carriageway clearance), `tools/city/traffic.js [secs]` (120 s debug.step, stuck/collisions every 10 s), `tools/city/fshots.js "bus,kiosk,cart,hoard" [hour] [n]` (furniture close-ups), `tools/city/calls.js` (draw-call split city vs vehicles), `tools/city/shots.js` now accepts ad-hoc views `x:y:z:tx:ty:tz`, `q.js x z r` lists colliders near a point.

## Left / known issues
- Street furniture: phone booths / bins not built (rest done). Furniture is simple boxes; bus stops are dark at night apart from the lit advert panel.
- Optional bloom (EffectComposer) not done — glows use additive points with min pixel size instead.
- Landmark detail is silhouette-level (Gateway, Rajabai, CST dome + BMC tower, Taj red domes, Flora, High Court, Town Hall portico, etc.). (Taj now clear of filler buildings.)

- Ground has a night sodium wash (emissive on asphalt/paving/promenade/kerb, scaled by uStreet).
- Shadow LOD: merged chunks >170 m from camera stop casting shadows (checked every 300 ms).

## Perf (headless, 960x540)
load ≈1.0 s; static merged tris ≈744k in 164 meshes + ~110k instanced (tetrapods, trees).
Worst views: overview_n 173 calls / 848k tris, aerial_necklace 156 / 780k; street views 70–110 calls, 450–620k; 56–60 fps. game.errors empty.

## Perf (fix-up round, headless 960x540, with traffic + vehicles integrated)
Load ~1.6 s; city static tris 784k (+70k vs before: furniture, hoardings, Cuffe, boats). City draw calls ~207 in the worst overview (sum incl. shadow pass); 81 vehicles x 4 meshes add ~324 more -> overview 475-531 total (<600), street views 130-330. Worst tris 1.07M (overview, whole game). fps 111-144 headless. game.errors empty.
Traffic 120 s debug.step (city sandbox): active 40, parked 27, stuck 0 at the end (0-3 transient red-light waits), collisions 0, AI-AI hits 0, msPerStep 0.15.

## Requests for other agents
- Peds: `game.city.promenadeSeats` / `benchSpots` = sea-wall parapet seats `{x,z,y,heading}`.
- Vehicles/traffic: `game.city.lightLevel` (0..1) and `isNight` are live; roundabout islands in `game.city.roundaboutIslands` `{id,x,z,r,rOut}` (island colliders tag 'island').
- Vehicles/Traffic: lots of cars (81 x 4 meshes) dominate draw calls in wide views; merging each car's 4 meshes or LOD-hiding distant cars would help. Previously blocked roads are free now: Hazarimal Somani Marg, X1 box, KBP_VN box, Esplanade Lane -> `net.obstructed` should be false everywhere.
- Collider tags used: 'seawall', 'building', 'landmark', 'island', 'lamp', 'tree', 'railing', 'exit', 'prop' (furniture), 'pillar' (arcade piers).

## How to check
`GAME_URL=http://localhost:8765/work/city/ node tools/city/shots.js "md_street,aerial_necklace" 21.5` → tools/city/shots/*.png (+ fps/calls/tris); `node tools/city/montage.js out.png a.png b.png c.png d.png` for a 2×2 grid; `node tools/city/tris.js` for a triangle breakdown.

