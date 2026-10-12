// STUB — to be replaced by the City agent. Must keep: export async function createCity(game) -> { update(dt), setTimeOfDay(h) }
import * as THREE from 'three';

export async function createCity(game) {
  const { scene, roads, collision } = game;
  scene.background = new THREE.Color(0x87a8c8);
  scene.fog = new THREE.Fog(0x87a8c8, 200, 1200);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.2));
  const sun = new THREE.DirectionalLight(0xffeedd, 2); sun.position.set(-200, 300, 100); scene.add(sun);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x2a5a78 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = game.roads.coast.seaLevel; scene.add(sea);

  const shape = new THREE.Shape(roads.land.map(([x, z]) => new THREE.Vector2(x, -z)));
  const land = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x8a8578 }));
  land.rotation.x = -Math.PI / 2; scene.add(land);

  const pos = [];
  for (const e of roads.edges) {
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = dz / L * e.width / 2, nz = -dx / L * e.width / 2;
      const p = [a.x + nx, a.z + nz, a.x - nx, a.z - nz, b.x - nx, b.z - nz, b.x + nx, b.z + nz];
      pos.push(p[0], 0.03, p[1], p[2], 0.03, p[3], p[4], 0.03, p[5], p[0], 0.03, p[1], p[4], 0.03, p[5], p[6], 0.03, p[7]);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x333338, side: THREE.DoubleSide })));

  collision.addPolyline(roads.land, { tag: 'seawall', h: 1.2 }, true, 0.5);
  return { update() {}, setTimeOfDay() {} };
}
