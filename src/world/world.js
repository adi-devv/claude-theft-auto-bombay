// Assembles the static world: coast/sea/ground, roads, landmarks, buildings, colliders.
import * as THREE from 'three';
import { getGraph } from './roadGraph.js';
import { Chunks } from './chunks.js';
import { buildCoast } from './coast.js';
import { buildRoads } from './roadMesh.js';
import { buildCity } from './cityBuilder.js';
import { buildLandmarks } from './landmarks/index.js';
import { SpatialGrid } from '../physics/spatialGrid.js';
import { merge } from '../utils/geom.js';

export function buildWorld({ scene, rng }) {
  const graph = getGraph();
  const chunks = new Chunks();
  const grid = new SpatialGrid(16);
  const colliders = [];

  const coast = buildCoast(graph, chunks);
  scene.add(coast.group);
  colliders.push(...coast.colliders);

  buildRoads(graph, chunks);

  const lm = buildLandmarks();
  chunks.addGeoms(lm.geoms);
  colliders.push(...lm.colliders);
  let emissiveMat = null;
  if (lm.emissive.length) {
    emissiveMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const eg = merge(lm.emissive);
    if (eg) {
      const m = new THREE.Mesh(eg, emissiveMat);
      m.name = 'emissive';
      scene.add(m);
    }
  }
  for (const o of lm.instanced) scene.add(o);

  const city = buildCity({ graph, rng, chunks, poly: coast.poly });
  colliders.push(...city.colliders);

  scene.add(chunks.build());
  grid.insertAll(colliders);

  return {
    graph,
    grid,
    colliders,
    landPoly: coast.poly,
    buildingCount: city.count,
    landmarks: lm,
    /** t: 0 = day, 1 = night. */
    setNight(t) {
      if (emissiveMat) emissiveMat.color.setScalar(0.55 + 0.45 * t);
      lm.streetlights?.setNight?.(t);
    },
  };
}
