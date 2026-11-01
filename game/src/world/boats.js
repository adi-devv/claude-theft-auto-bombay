// Harbour traffic east of the Gateway of India: ferries / launches / dhows bobbing and cruising, plus a far container ship.
// 4 InstancedMeshes (one per hull type, vertex-coloured, windows + nav lights glow at night) = 4 draw calls, no colliders
// (the harbour is outside the playable land). Call buildBoats(game, ctx) after buildSea; call .update(dt) every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const COL = new THREE.Color();

/** non-indexed tapered box: back face (w0 x h0) at z=0, front face (w1 x h1) at z=l; bottom at y=0 */
function taper(w0, h0, w1, h1, l, z0 = 0) {
  const v = (x, y, z) => [x, y, z];
  const b = [v(-w0 / 2, 0, z0), v(w0 / 2, 0, z0), v(w0 / 2, h0, z0), v(-w0 / 2, h0, z0)];
  const f = [v(-w1 / 2, 0, z0 + l), v(w1 / 2, 0, z0 + l), v(w1 / 2, h1, z0 + l), v(-w1 / 2, h1, z0 + l)];
  const quads = [[b[1], b[0], b[3], b[2]], [f[0], f[1], f[2], f[3]], [b[0], f[0], f[3], b[3]], [f[1], b[1], b[2], f[2]], [b[3], f[3], f[2], b[2]], [b[0], b[1], f[1], f[0]]];
  const pos = [];
  for (const [a, c, d, e] of quads) pos.push(...a, ...c, ...d, ...a, ...d, ...e);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return g;
}

class Parts {
  constructor() { this.list = []; }
  add(geo, x, y, z, sx, sy, sz, color, glow = 0, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
    const n = g.attributes.position.count, c = COL.set(color), col = new Float32Array(n * 3), gl = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    this.list.push(g); return this;
  }
  box(x, y, z, sx, sy, sz, color, glow = 0, ry = 0, rx = 0, rz = 0) { return this.add(BOX, x, y, z, sx, sy, sz, color, glow, ry, rx, rz); }
  cyl(x, y, z, r, h, color, glow = 0) { return this.add(CYL, x, y, z, r * 2, h, r * 2, color, glow); }
  geo() { const g = mergeGeometries(this.list.map((p) => (p.attributes.normal ? p : (p.computeVertexNormals(), p))), false); this.list.forEach((p) => p.dispose()); return g; }
}
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);

// ---------------------------------------------------------------- hull models (bow toward +z, keel at y = 0)
function ferry() {
  const p = new Parts(), W = '#ece8dc', N = '#1b3a5c', Y = '#d9a526', WIN = '#1a2430', LIT = '#ffdba0';
  p.add(taper(3.9, 1.5, 3.9, 1.5, 9, -5), 0, 0, 0, 1, 1, 1, N);                 // hull body (lower, navy)
  p.add(taper(3.9, 1.5, 0.5, 1.5, 4.5, 4), 0, 0, 0, 1, 1, 1, N);                  // bow taper
  p.box(0, 1.5, -0.6, 4.0, 0.22, 11.6, Y); p.add(taper(4.0, 0.22, 0.6, 0.22, 4.5, 4), 0, 1.5, 0, 1, 1, 1, Y); // gunwale stripe
  p.box(0, 1.9, -0.8, 3.6, 0.9, 9.0, W);                                          // main cabin (lower deck)
  p.box(0, 2.0, -0.8, 3.7, 0.4, 8.6, WIN, 0.7);                                   // window band (lit at night)
  p.box(0, 2.8, -1.0, 3.5, 0.12, 8.6, '#d8d4c6');                                 // upper deck roof / floor
  p.box(0, 3.35, -1.8, 3.0, 0.95, 5.2, W); p.box(0, 3.4, -1.8, 3.1, 0.38, 4.8, WIN, 0.7);   // wheelhouse / upper cabin
  p.box(0, 4.0, -1.8, 3.2, 0.1, 5.6, '#2c5a86');                                  // canopy
  p.cyl(0, 4.5, -3.6, 0.45, 1.4, '#c9382a'); p.cyl(0, 5.2, -3.6, 0.48, 0.18, '#202020');         // funnel
  p.box(0, 4.9, 0.6, 0.08, 1.8, 0.08, '#9a9a9a'); p.box(0, 5.9, 0.6, 0.2, 0.2, 0.2, '#ffffff', 1.0); // mast + white light
  p.box(-1.95, 1.9, 3.3, 0.12, 0.12, 0.2, '#ff3030', 1.0); p.box(1.95, 1.9, 3.3, 0.12, 0.12, 0.2, '#30ff60', 1.0); // port / starboard
  for (const s of [-1, 1]) p.box(s * 1.85, 0.5, -2.5, 0.2, 0.5, 1.2, '#222');     // rubbing fenders
  return p.geo();
}
function launch() {
  const p = new Parts(), W = '#f1efe8', B = '#2a5d8f';
  p.add(taper(2.3, 0.9, 2.3, 0.9, 4.2, -3.2), 0, 0, 0, 1, 1, 1, W);
  p.add(taper(2.3, 0.9, 0.3, 0.9, 2.6, 1.0), 0, 0, 0, 1, 1, 1, W);
  p.box(0, 0.12, 0, 2.35, 0.22, 7.2, B);
  p.box(0, 1.35, -0.8, 1.8, 0.7, 2.8, W); p.box(0, 1.45, -0.8, 1.88, 0.3, 2.4, '#1a2430', 0.6);
  p.box(0, 1.8, -0.8, 2.0, 0.08, 3.0, B);
  p.box(0, 2.5, -1.6, 0.06, 1.3, 0.06, '#9a9a9a'); p.box(0, 3.2, -1.6, 0.16, 0.16, 0.16, '#fff', 1.0);
  p.box(-1.0, 1.0, 1.2, 0.1, 0.1, 0.16, '#ff3030', 1.0); p.box(1.0, 1.0, 1.2, 0.1, 0.1, 0.16, '#30ff60', 1.0);
  return p.geo();
}
function dhow() {
  const p = new Parts(), H = '#6b4a2d', H2 = '#8a6238';
  p.add(taper(2.4, 0.9, 2.4, 0.9, 5.5, -3.5), 0, 0, 0, 1, 1, 1, H);
  p.add(taper(2.4, 0.9, 0.35, 1.5, 3.2, 2.0), 0, 0, 0, 1, 1, 1, H);
  p.add(taper(2.4, 0.9, 1.4, 1.5, 1.6, -5.1), 0, 0, 0, 1, 1, 1, H);               // raised stern
  p.box(0, 0.95, -0.2, 2.5, 0.12, 5.6, H2);
  p.box(0, 0.75, 0.0, 0.1, 0.1, 6.5, '#d8c8a0');
  p.box(0, 4.4, 0.4, 0.14, 7.2, 0.14, '#5b4228');                                 // mast
  p.box(0, 4.7, -0.4, 0.07, 0.07, 6.4, '#5b4228', 0, 0, 0.42);                    // yard
  // lateen sail: thin triangle
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.0, 2.9, 0, 1.0, -2.9, 0, 6.6, -0.5, 0, 1.0, -2.9, 0, 1.0, 2.9, 0, 6.6, -0.5], 3));
  sail.computeVertexNormals(); sail.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
  p.add(sail, 0, 0, 0.3, 1, 1, 1, '#e8dcc0', 0.0);
  p.box(0, 1.5, -3.6, 0.1, 0.1, 0.1, '#ffe2a0', 1.0);                              // stern lantern
  return p.geo();
}
function cargoShip() {
  const p = new Parts();
  p.add(taper(26, 12, 26, 12, 150, -90), 0, 0, 0, 1, 1, 1, '#7a2e22');             // hull
  p.add(taper(26, 12, 4, 12, 50, 60), 0, 0, 0, 1, 1, 1, '#7a2e22');
  p.box(0, 12.3, -10, 26.6, 0.6, 180, '#3c3f43');
  const cs = ['#c0392b', '#2e6fb0', '#e0a21a', '#4a8a4a', '#8f8f8f', '#d46a1a', '#2f6f6f'];
  let k = 0; for (let z = -80; z < 56; z += 12.4) for (let s = -1; s <= 1; s++) for (let l = 0; l < 3; l++) { if (((z + 7) | 0) % 5 === 0 && l === 2) continue; p.box(s * 8, 13.4 + l * 2.7, z, 7.4, 2.6, 12, cs[(k++ * 7 + l) % cs.length]); }
  p.box(0, 24, -88, 22, 24, 10, '#e8e4d8'); p.box(0, 24, -88, 22.4, 3.4, 9, '#1a2430', 0.7); p.box(0, 37, -88, 12, 3, 8, '#e8e4d8');
  p.box(7, 40, -88, 3, 6, 3, '#202020');
  p.box(0, 50, 55, 0.4, 16, 0.4, '#aaa'); p.box(0, 58.5, 55, 0.9, 0.9, 0.9, '#fff', 1.0);
  return p.geo();
}

export function buildBoats(game, ctx) {
  const { scene } = game, U = ctx.mats.U, seaY = game.roads.coast.seaLevel;
  const mk = (geo, n) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide, flatShading: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNightB = U.uStreet;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n attribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n varying float vGlow; uniform float uNightB;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vGlow * (0.15 + 2.6 * uNightB);');
    };
    m.customProgramCacheKey = () => 'cityBoats1';
    const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    scene.add(im); return im;
  };
  const rnd = mulberry(2468);
  const types = { ferry: mk(ferry(), 6), launch: mk(launch(), 5), dhow: mk(dhow(), 6), ship: mk(cargoShip(), 2) };
  const boats = [];
  const add = (type, x, z, h, speed, zone, extra = {}) => boats.push({ type, i: boats.filter((b) => b.type === type).length, x, z, h, speed, zone, ph: rnd() * 6.28, ph2: rnd() * 6.28, turn: 0, ...extra });
  // moored ferries near the Gateway steps (headings roughly into the swell, i.e. all pointing about east)
  add('ferry', 452, 352, 1.35, 0, null); add('ferry', 456, 414, 1.9, 0, null); add('ferry', 470, 442, 1.6, 0, null);
  // cruising ferries: slow loops in the harbour
  add('ferry', 540, 300, 0.2, 2.6, { x0: 480, x1: 700, z0: 250, z1: 520 }); add('ferry', 640, 470, 3.4, 2.2, { x0: 480, x1: 700, z0: 250, z1: 520 });
  add('ferry', 600, 380, 1.1, 2.4, { x0: 480, x1: 720, z0: 250, z1: 520 });
  // launches: quick and small
  add('launch', 500, 330, 0.9, 6.5, { x0: 470, x1: 620, z0: 300, z1: 470 }); add('launch', 560, 430, 4.0, 5.5, { x0: 470, x1: 620, z0: 300, z1: 470 });
  add('launch', 445, 372, 5.2, 0, null); add('launch', 447, 402, 5.0, 0, null); add('launch', 612, 350, 2.2, 7, { x0: 470, x1: 700, z0: 280, z1: 500 });
  // dhows / fishing boats at anchor and drifting
  for (let k = 0; k < 6; k++) add('dhow', 480 + rnd() * 240, 280 + rnd() * 240, rnd() * 6.28, k < 3 ? 0 : 0.7, k < 3 ? null : { x0: 480, x1: 760, z0: 260, z1: 520 });
  // far container ships (silhouettes on the horizon)
  add('ship', 1050, 150, 1.2, 0, null); add('ship', 1250, 520, 1.8, 0, null);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  let t = 0;
  const place = (b) => {
    const bob = b.type === 'ship' ? 0.03 : 0.07, roll = b.type === 'ship' ? 0.004 : 0.03 * (b.speed > 3 ? 0.5 : 1);
    p.set(b.x, seaY - (b.type === 'ship' ? 5.5 : b.type === 'ferry' ? 0.55 : 0.4) + bob * Math.sin(t * 1.3 + b.ph), b.z);
    e.set(0.02 * Math.sin(t * 1.1 + b.ph2), b.h, roll * Math.sin(t * 0.9 + b.ph), 'YXZ'); q.setFromEuler(e);
    m4.compose(p, q, s1); types[b.type].setMatrixAt(b.i, m4);
  };
  const update = (dt) => {
    t += dt;
    for (const b of boats) {
      if (b.speed > 0 && b.zone) {
        const z = b.zone, fx = Math.sin(b.h), fz = Math.cos(b.h);
        b.x += fx * b.speed * dt; b.z += fz * b.speed * dt;
        // steer back into the zone when near its edge (rate-limited turn toward the zone centre)
        const out = b.x < z.x0 || b.x > z.x1 || b.z < z.z0 || b.z > z.z1;
        if (out || b.turn > 0) {
          const target = Math.atan2((z.x0 + z.x1) / 2 - b.x, (z.z0 + z.z1) / 2 - b.z);
          let d = target - b.h; d = Math.atan2(Math.sin(d), Math.cos(d));
          b.h += Math.sign(d) * Math.min(Math.abs(d), 0.25 * dt * (b.speed > 4 ? 2 : 1));
          b.turn = out ? 4 : b.turn - dt;
        }
      }
      place(b);
    }
    for (const k in types) types[k].instanceMatrix.needsUpdate = true;
  };
  update(0);
  ctx.boatStats = { boats: boats.length };
  return { update, boats };
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
