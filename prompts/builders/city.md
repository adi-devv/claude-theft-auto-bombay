# CITY builder — owns src/world/city.js + any NEW src/world/* (not mapdata/roads/collision)
Export `async function createCity(game)` → `{ update(dt), setTimeOfDay(h), timeOfDay, isNight, lightLevel (0..1), sunDir }`.
1. Sky/light/time: default 18.4h sunset over the Arabian Sea (sun low in the WEST, -X), warm haze, long shadows.
   KeyT cycles sunset → night → morning → noon; time may advance slowly. Night = the "Queen's Necklace": continuous arc
   of warm sodium streetlights along Marine Drive, visible from afar, reflected in the bay. Lit windows at night
   (emissive textures), signs. Optional bloom via EffectComposer as `game.composer` (handle 'resize' event) if fast.
   ONE shadow-casting directional light following the camera.
2. Streets: asphalt + lane markings, MD median (planter/railing), zebra crossings near junctions, raised kerbs (visual)
   and footpaths per mapdata STREET (MD land side 5 m, sea side 10 m promenade). Clean junctions (no z-fighting).
   Roundabout islands + monuments at FLORA/HORN/REGAL (with colliders). Leave SIGNALS corners clear; NO traffic lights.
3. Marine Drive: promenade, low sea wall people sit on, instanced tetrapods into the water, animated sea with sunset
   reflections + foam; distant Malabar Hill skyline across the bay (NW, with night lights); Nariman Point towers south.
4. Buildings DENSE, continuous frontage, nothing on roads/parks/landmarks. Art Deco precinct (MD↔MK Rd, facing Oval):
   4–7 storeys, rounded corners, speed-line bands, eyebrow sunshades, curved balconies, fins/towers with names,
   pastels, weathered. Fort: Victorian Gothic/Indo-Saracenic stone, ground-floor arcades, wooden balconies, rooftop
   water tanks, AC boxes, shop signs, grime. Procedural archetypes + seeded variation, canvas textures, merged geometry.
5. Landmarks (mapdata LANDMARKS/MONUMENTS): Gateway of India, Taj Palace (red domes), Rajabai Clock Tower (~85 m),
   High Court, University, Old Secretariat, CST (dome + turrets), BMC, Churchgate, Eros & Regal (Art Deco), Prince of
   Wales Museum, David Sassoon Library, Elphinstone, Jehangir, Asiatic Society Town Hall, St Thomas Cathedral, Flora
   Fountain, Horniman Circle arcade ring, Kala Ghoda horse, Wellington Fountain, Air India bldg, Marine Plaza.
6. Maidans (grass, dirt cricket pitches, edge trees, railings); instanced trees, streetlights (MD curved lamps),
   bus stops, chai stalls, hoardings, bollards, handcarts.
7. Colliders for everything solid; sea wall along land boundary; invisible walls + visual closure at map exits.
8. Ambient audio (bus 'ambient', when game.audio.ready): waves, traffic hum, crows by day, crickets at night.
9. Optionally expose `game.city.promenadeSeats` [{x,z,heading}] for peds.
Budget: ≤ 250 draw calls, ≤ 900k tris for the city, load < 4 s, 60 fps.
