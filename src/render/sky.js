import * as THREE from 'three';

/** Gradient sky dome that follows the camera. Returns {mesh, update(camera)}. */
export function createSky() {
  const geo = new THREE.SphereGeometry(1000, 16, 10);
  const top = new THREE.Color(0x5d9fe0);
  const hor = new THREE.Color(0xe9d9b8);
  const col = [];
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 1000);
    c.copy(hor).lerp(top, Math.pow(t, 0.7));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    update(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
