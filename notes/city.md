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
