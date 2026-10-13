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

## Left / known issues
- Small street furniture not built yet: BEST bus stops, kiosks/chai stalls, hoardings, bollards, phone booths, handcarts.
- Optional bloom (EffectComposer) not done — glows use additive points with min pixel size instead.
- Cuffe Parade skyline south / harbour boats near Gateway not built.
- Landmark detail is silhouette-level (Gateway, Rajabai, CST dome + BMC tower, Taj red domes, Flora, High Court, Town Hall portico, etc.). Taj is partly hidden behind a filler building from the Gateway plaza view.
- Asphalt still dark-ish; building palette a bit uniform.

- Ground has a night sodium wash (emissive on asphalt/paving/promenade/kerb, scaled by uStreet).
- Shadow LOD: merged chunks >170 m from camera stop casting shadows (checked every 300 ms).

## Perf (headless, 960x540)
load ≈1.0 s; static merged tris ≈744k in 164 meshes + ~110k instanced (tetrapods, trees).
Worst views: overview_n 173 calls / 848k tris, aerial_necklace 156 / 780k; street views 70–110 calls, 450–620k; 56–60 fps. game.errors empty.

## Requests for other agents
- Peds: `game.city.promenadeSeats` / `benchSpots` = sea-wall parapet seats `{x,z,y,heading}`.
- Vehicles/traffic: `game.city.lightLevel` (0..1) and `isNight` are live; roundabout islands in `game.city.roundaboutIslands` `{id,x,z,r,rOut}` (island colliders tag 'island').
- Collider tags used: 'seawall', 'building', 'landmark', 'island', 'lamp', 'tree', 'railing', 'exit'.

## How to check
`GAME_URL=http://localhost:8765/work/city/ node tools/city/shots.js "md_street,aerial_necklace" 21.5` → tools/city/shots/*.png (+ fps/calls/tris); `node tools/city/montage.js out.png a.png b.png c.png d.png` for a 2×2 grid; `node tools/city/tris.js` for a triangle breakdown.
