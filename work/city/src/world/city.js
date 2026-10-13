// City builder for Claude Theft Auto: Bombay — Marine Drive + Fort at dusk.
// Exports createCity(game) → { update(dt), setTimeOfDay(h), timeOfDay, isNight, lightLevel, sunDir, ... }
import * as THREE from 'three';
import { Batch } from './geom.js';
import { Fields } from './field.js';
import { createMaterials } from './materials.js';
import { createSky } from './sky.js';
import { buildGround, buildMarkings } from './streets.js';
import { buildSea } from './sea.js';
import { Glows } from './glows.js';
import { generateBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildProps } from './props.js';
import { createAmbient } from './ambient.js';
import { buildFar } from './far.js';

const TIME_CYCLE = [18.4, 21.5, 7.2, 12.5];

export async function createCity(game) {
  const t0 = performance.now();
  const { scene, roads, collision } = game;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const mats = createMaterials();
  const sky = createSky(game, mats);
  const fields = new Fields(roads);
  const batch = new Batch(300, { x: -2000, z: -2000 });
  const glows = new Glows();
  const ctx = { game, mats, sky, fields, batch, glows, reflectLights: [], farLandPolys: [] };
  const timings = {};
  const T = (name, t) => { timings[name] = Math.round(performance.now() - t); };

  let t = performance.now();
  buildGround(game, fields, mats, batch); T('ground', t);
  t = performance.now(); const mk = buildMarkings(game, batch); T('markings', t);
  await tick();

  t = performance.now(); buildLandmarks(game, ctx); T('landmarks', t);
  t = performance.now(); const bld = generateBuildings(game, ctx); T('buildings', t);
  console.log('[city] lots', bld.lots.length, JSON.stringify(bld.stats));
  await tick();
  t = performance.now(); const props = buildProps(game, ctx); T('props', t);
  console.log('[city] props', JSON.stringify(props));
  t = performance.now(); buildFar(game, ctx); T('far', t);
  t = performance.now(); const sea = buildSea(game, ctx); T('sea', t);

  // ---- merge static geometry
  t = performance.now();
  const built = batch.build(scene, {
    asphalt: { material: mats.asphalt, castShadow: false, facade: false },
    paving: { material: mats.paving, castShadow: false, facade: false },
    promenade: { material: mats.promenade, castShadow: false, facade: false },
    grass: { material: mats.grass, castShadow: false, facade: false },
    kerb: { material: mats.kerb, castShadow: false, facade: false },
    markings: { material: mats.markings, castShadow: false, facade: false },
    facade: { material: mats.facade },
    signs: { material: mats.signMat, castShadow: false, facade: false },
    glow: { material: mats.glowMat, castShadow: false, facade: false },
    dirt: { material: mats.dirt, castShadow: false, facade: false },
    railing: { material: mats.railing, castShadow: false, facade: false },
  });
  T('merge', t);
  glows.build(scene, mats.U);
  // shadow LOD: only chunks near the camera cast shadows; ground picks up a faint sodium wash at night
  const casters = built.meshes.filter((m) => m.castShadow);
  for (const m of casters) if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  let shadowT = 0;
  const groundMats = [mats.asphalt, mats.paving, mats.promenade, mats.kerb].filter(Boolean);
  for (const m of groundMats) { if (m.map) m.emissiveMap = m.map; m.emissive = new THREE.Color(0); m.needsUpdate = true; }
  const sodium = new THREE.Color('#ff9d4a');

  // ---- colliders: land boundary (sea wall + map edges)
  collision.addPolyline(roads.land, { tag: 'seawall', h: 1.2 }, true, 0.5);

  // ---- time of day
  const ambient = createAmbient(game, fields);
  let hour = 18.4, cycleIdx = 0, prevT = false;
  const city = {
    timeOfDay: hour, isNight: false, lightLevel: 1, sunDir: sky.state.sunDir,
    promenadeSeats: sea.seats, benchSpots: sea.seats,
    roundaboutIslands: fields.islands, crossings: mk.crossings,
    timeScale: 1 / 480, // game hours per real second (1 h = 8 min)
    stats: { tris: built.tris, meshes: built.meshes.length, timings },
    setTimeOfDay(h) { hour = ((h % 24) + 24) % 24; sky.apply(hour); sync(); },
    update(dt) {
      const d = game.input.down('KeyT');
      if ((d && !prevT) || game.input.pressed('KeyT')) { cycleIdx = (cycleIdx + 1) % TIME_CYCLE.length; city.setTimeOfDay(TIME_CYCLE[cycleIdx]); }
      prevT = d;
      if (dt > 0) { hour = (hour + dt * city.timeScale) % 24; sky.apply(hour); sync(); }
      mats.U.uTime.value += dt;
      if (performance.now() - shadowT > 300) {
        shadowT = performance.now(); const cp = game.camera.position;
        for (const m of casters) { const bs = m.geometry.boundingSphere; m.castShadow = bs.center.distanceTo(cp) - bs.radius < 170; }
      }
      const st = mats.U.uStreet.value;
      for (const m of groundMats) m.emissive.copy(sodium).multiplyScalar(0.16 * st);
      sky.update(dt, game.camera);
      sea.update(dt, sky.state);
      glows.update(game.camera, game.renderer, scene.fog.density);
      ambient.update(dt, city);
    },
  };
  function sync() {
    city.timeOfDay = hour; city.isNight = sky.state.isNight; city.lightLevel = sky.state.lightLevel; city.sunDir = sky.state.sunDir;
  }
  sky.apply(hour); sync();
  timings.total = Math.round(performance.now() - t0);
  game.debug.extra.city = () => ({ hour: +hour.toFixed(2), light: +city.lightLevel.toFixed(2), night: city.isNight, tris: built.tris, meshes: built.meshes.length, load: timings.total });
  console.log('[city] built', JSON.stringify(timings), 'tris', built.tris, 'meshes', built.meshes.length);
  return city;
}
