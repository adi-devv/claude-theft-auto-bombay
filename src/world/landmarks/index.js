// Landmarks contract (PLAN section 11): buildLandmarks(), landmarkFootprints(), LANDMARK_POIS.
// Collider / footprint rotation convention: `rot` is the mesh heading (rotation.y), so the local
// +X axis of the box is (cos rot, -sin rot) in (x, z). hw = half extent along local X, hd along Z.
import { newOut } from './kit.js';
import { defaultSeededFn } from './coords.js';
import { buildCSMT } from './csmt.js';
import { buildGateway } from './gateway.js';
import { buildTaj } from './taj.js';
import { buildRajabai } from './rajabai.js';
import { buildChurchgate } from './churchgate.js';
import { buildFlora } from './flora.js';
import { buildNariman } from './nariman.js';
import { buildArtDeco, buildSeaWall } from './artdeco.js';
import { buildMaidans, buildChowpatty, buildWankhede } from './maidans.js';
import { buildTetrapods, buildStreetlights, buildTrees } from '../props.js';

export function buildLandmarks(rng = defaultSeededFn()) {
  const out = newOut();
  buildCSMT(out);
  buildGateway(out, rng);
  buildTaj(out);
  buildRajabai(out);
  buildChurchgate(out);
  buildFlora(out);
  buildNariman(out);
  buildArtDeco(out);
  buildSeaWall(out);
  buildMaidans(out);
  buildChowpatty(out, rng);
  buildWankhede(out);

  const tetrapods = buildTetrapods(rng);
  const lights = buildStreetlights();
  const trees = buildTrees(rng);
  for (const c of trees.colliders) out.colliders.push(c);

  return {
    geoms: out.geoms,
    emissive: out.emissive,
    colliders: out.colliders,
    instanced: [tetrapods, lights.poles, lights.bulbs, trees.trunks, trees.crowns],
    streetlights: { material: lights.material, setNight: lights.setNight },
    footprints: out.footprints,
    pois: out.pois,
  };
}

let _footprints = null;
// Footprints never depend on the rng, so a throw-away default build gives the same answer.
export function landmarkFootprints() {
  if (!_footprints) _footprints = buildLandmarks().footprints.map((f) => ({ ...f }));
  return _footprints.map((f) => ({ ...f }));
}

// Reachable points (in front of each landmark, off the carriageway) for minimap / missions.
// A unit test checks these against the positions the builders compute.
export const LANDMARK_POIS = [
  { id: 'csmt', name: 'CSMT', x: 548.1, z: -794.1 },
  { id: 'gateway', name: 'Gateway of India', x: 648, z: 640 },
  { id: 'taj', name: 'Taj Mahal Palace', x: 588, z: 700 },
  { id: 'taj_tower', name: 'Taj Tower', x: 546, z: 775 },
  { id: 'rajabai', name: 'Rajabai Clock Tower', x: 35, z: 276 },
  { id: 'high_court', name: 'Bombay High Court', x: 72, z: 130 },
  { id: 'churchgate', name: 'Churchgate Station', x: -195, z: -145 },
  { id: 'flora', name: 'Flora Fountain (Hutatma Chowk)', x: 200, z: -160 },
  { id: 'nariman_point', name: 'Nariman Point', x: -300, z: 860 },
  { id: 'air_india', name: 'Air India Building', x: -260, z: 893 },
  { id: 'chowpatty', name: 'Chowpatty Beach', x: -740, z: -936 },
  { id: 'wankhede', name: 'Wankhede Stadium', x: -364, z: -380 },
];
