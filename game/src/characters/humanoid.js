// STUB — Peds agent owns character models. createHumanoid(opts) -> { group, update(dt, speed) }
import * as THREE from 'three';
export function createHumanoid(opts = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: opts.shirt ?? 0x3366cc }));
  body.position.y = 0.85; group.add(body);
  return { group, update() {} };
}
