// STUB (M1). The landmarks engineer's version replaces this file on merge.
import { LANDMARKS } from '../mapData.js';

export const LANDMARK_POIS = LANDMARKS.map(({ id, name, x, z }) => ({ id, name, x, z }));

export function landmarkFootprints() {
  return [];
}

export function buildLandmarks() {
  return {
    geoms: [],
    emissive: [],
    colliders: [],
    instanced: [],
    streetlights: { material: null, setNight() {} },
  };
}
