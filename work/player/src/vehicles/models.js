// Low-poly vehicle models. Each type's geometry is built once and shared; per car we only make
// one paint material (cached per colour) and one lights material (per-car uniforms, shared program).
// Draw calls per car: paint + detail + glass + lights (+ shared instanced wheels / shadows / light pools).
// Model space: body centre at origin on the ground, facing +Z, +X = car's LEFT (right-hand drive: driver at -X).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- light groups (lights material) ----
export const LG = { HEAD: 0, TAIL: 1, BRAKE: 2, REVERSE: 3, SIREN_R: 4, SIREN_B: 5, SIGN: 6, AMBER: 7 };

// ---- text / decal atlas (shared by detail + lights materials). White texel at the top-right corner.
const ATLAS_W = 1024, ATLAS_H = 512;
const RECTS = {};
let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas'); c.width = ATLAS_W; c.height = ATLAS_H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS_W, ATLAS_H);
  let y = 0;
  const row = (name, h, w, draw) => { const r = { x: 0, y, w, h }; draw(g, r); RECTS[name] = r; y += h + 4; };
  const text = (r, str, fg, bg, font, opt = {}) => {
    g.fillStyle = bg; g.fillRect(r.x, r.y, r.w, r.h);
    if (opt.border) { g.strokeStyle = opt.border; g.lineWidth = opt.bw || 4; g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(str, r.x + r.w / 2, r.y + r.h / 2 + (opt.dy || 0));
  };
  row('taxi', 56, 220, (g, r) => text(r, 'TAXI', '#1a1a1a', '#ffd23a', 'bold 44px Arial', { border: '#1a1a1a' }));
  row('dest', 60, 700, (g, r) => text(r, '123  CHURCHGATE STN', '#ffb020', '#120a04', 'bold 42px "Courier New", monospace'));
  row('best', 70, 300, (g, r) => text(r, 'BEST', '#f3e6c4', '#b3161b', 'bold italic 62px Arial'));
  row('police', 56, 420, (g, r) => text(r, 'POLICE', '#1d3f9a', '#ffffff', 'bold 46px Arial'));
  row('mpolice', 50, 520, (g, r) => text(r, 'MUMBAI POLICE', '#1d3f9a', '#ffffff', 'bold 38px Arial'));
  row('plateW', 44, 230, (g, r) => text(r, 'MH 01 AB 4721', '#111', '#f4f4f4', 'bold 30px Arial', { border: '#222', bw: 2 }));
  row('plateY', 44, 230, (g, r) => text(r, 'MH 01 T 8813', '#111', '#f2cc2a', 'bold 30px Arial', { border: '#222', bw: 2 }));
  row('omni', 44, 260, (g, r) => text(r, 'MARUTI', '#c8c8c8', '#202020', 'bold 30px Arial'));
  g.fillStyle = '#ffffff'; g.fillRect(ATLAS_W - 8, 0, 8, 8);
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  return atlasTex;
}
const WU = (ATLAS_W - 4) / ATLAS_W, WV = 1 - 4 / ATLAS_H;
function rectUV(name) { atlas(); const r = RECTS[name]; return [r.x / ATLAS_W, 1 - (r.y + r.h) / ATLAS_H, (r.x + r.w) / ATLAS_W, 1 - r.y / ATLAS_H]; }

// ---- geometry builder ---------------------------------------------------------------------
const _c = new THREE.Color();
class Builder {
  constructor() { this.parts = { paint: [], detail: [], glass: [], lights: [] }; }
  add(key, geom, o = {}) {
    let g = geom.index ? geom.toNonIndexed() : geom;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    _c.set(o.color ?? 0xffffff);
    const col = new Float32Array(n * 3), lg = new Float32Array(n).fill(o.lg ?? 0);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('lgroup', new THREE.BufferAttribute(lg, 1));
    const uv = new Float32Array(n * 2);
    const src = g.attributes.uv;
    if (o.uv && src) { const [u0, v0, u1, v1] = rectUV(o.uv); for (let i = 0; i < n; i++) { uv[i * 2] = u0 + src.getX(i) * (u1 - u0); uv[i * 2 + 1] = v0 + src.getY(i) * (v1 - v0); } }
    else for (let i = 0; i < n; i++) { uv[i * 2] = WU; uv[i * 2 + 1] = WV; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.parts[key].push(g);
    return g;
  }
  box(key, w, h, d, x, y, z, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.rx) g.rotateX(o.rx); if (o.ry) g.rotateY(o.ry); if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    return this.add(key, g, o);
  }
  cyl(key, r, len, x, y, z, o = {}) { // axis along Z (facing forward)
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg ?? 12);
    g.rotateX(Math.PI / 2);
    if (o.ry) g.rotateY(o.ry); if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    return this.add(key, g, o);
  }
  /** Plane with atlas text, facing: 'L' (+X), 'R' (-X), 'F' (+Z), 'B' (-Z). */
  decal(key, w, h, x, y, z, face, uv, o = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    if (face === 'L') g.rotateY(Math.PI / 2); else if (face === 'R') g.rotateY(-Math.PI / 2); else if (face === 'B') g.rotateY(Math.PI);
    g.translate(x, y, z);
    return this.add(key, g, { ...o, uv });
  }
  /** Side-profile extrusion: pts are [z, y], extruded across the car width (X), centred on x. */
  extrude(key, pts, width, x = 0, o = {}) {
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const bev = o.bevel ?? 0.035;
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: o.bevelSeg ?? 2, curveSegments: 6 });
    g.rotateY(-Math.PI / 2);
    g.translate(x + (width - 2 * bev) / 2, 0, 0);
    return this.add(key, g, o);
  }
  build() {
    const out = {};
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) { out[k] = null; continue; }
      const m = mergeGeometries(list, false);
      m.computeBoundingSphere(); m.computeBoundingBox();
      out[k] = m;
      for (const g of list) g.dispose();
    }
    return out;
  }
}

/** Bottom edge with wheel arches, from front (zFront) to rear (zRear). */
function archBottom(zFront, zRear, y, wheels, clearance = 0.06) {
  const pts = [[zFront, y]];
  const ws = [...wheels.filter((w) => w.x > 0)].sort((a, b) => b.z - a.z);
  for (const w of ws) {
    const R = w.r + clearance, cy = w.r;
    if (y >= cy + R) continue;
    const dy = y - cy, half = Math.sqrt(Math.max(0, R * R - dy * dy));
    const a0 = Math.atan2(dy, half), a1 = Math.PI - a0;
    const N = 9;
    for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * (i / N); pts.push([w.z + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  }
  pts.push([zRear, y]);
  return pts;
}

/** Painted greenhouse + glass (side windows split at pillars, windscreen, rear glass). */
function cabin(b, c) {
  b.extrude('paint', [[c.zrB, c.yB], [c.zfB, c.yB], [c.zfT, c.yT], [c.zrT, c.yT]], c.w, 0, { bevel: 0.05 });
  const ins = 0.08, yb = c.yB + 0.07, yt = c.yT - 0.08;
  const zAt = (zb, zt, y) => zb + (zt - zb) * ((y - c.yB) / (c.yT - c.yB));
  const zr0 = zAt(c.zrB, c.zrT, yb) + ins, zr1 = zAt(c.zrB, c.zrT, yt) + ins;
  const zf0 = zAt(c.zfB, c.zfT, yb) - ins, zf1 = zAt(c.zfB, c.zfT, yt) - ins;
  const cuts = [...(c.pillars || [])].sort((a, b) => a - b);
  const pw = 0.06;
  let prev = null;
  for (const cut of [...cuts, null]) {
    const lo = prev, hi = cut; prev = cut;
    const b0 = lo == null ? zr0 : lo + pw, t0 = lo == null ? zr1 : lo + pw;
    const b1 = hi == null ? zf0 : hi - pw, t1 = hi == null ? zf1 : hi - pw;
    if (b1 - b0 < 0.12 || t1 - t0 < 0.05) continue;
    b.extrude('glass', [[b0, yb], [b1, yb], [t1, yt], [t0, yt]], c.w + 0.03, 0, { bevel: 0 });
  }
  // windscreen + rear glass: thin slabs lying on the sloped faces (half thickness pokes out)
  const slab = (z0, y0, z1, y1) => {
    const L = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0);
    const g = new THREE.BoxGeometry(c.w - 0.16, 0.035, Math.max(0.1, L - 0.14));
    g.rotateX(-ang); g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
    b.add('glass', g);
  };
  slab(c.zfB, c.yB, c.zfT, c.yT);
  slab(c.zrB, c.yB, c.zrT, c.yT);
  if (c.roofColor != null) b.box('detail', c.w + 0.04, 0.11, Math.abs(c.zfT - c.zrT) + 0.08, 0, c.yT + 0.01, (c.zfT + c.zrT) / 2, { color: c.roofColor });
}

function wheelSet(spec, opts = {}) {
  const L = spec.length, zf = L / 2 - spec.overF, zr = -L / 2 + spec.overR, tx = spec.track / 2, r = spec.wheelR;
  const tw = opts.tyreW ?? Math.max(0.16, r * 0.62);
  const rw = opts.rearW ?? tw;
  return [
    { x: tx, z: zf, r, w: tw, front: true }, { x: -tx, z: zf, r, w: tw, front: true },
    { x: tx, z: zr, r, w: rw, front: false }, { x: -tx, z: zr, r, w: rw, front: false },
  ];
}

const CHROME = 0xd9dcdf, RUBBER = 0x1b1b1b, GRILLE = 0x0d0d0d, AMBER = 0xff9a1a;

function lampsFront(b, xs, y, z, r, round = true) {
  for (const x of xs) {
    if (round) { b.cyl('lights', r, 0.06, x, y, z, { lg: LG.HEAD, color: 0xfff6e0, seg: 14 }); b.cyl('detail', r + 0.03, 0.04, x, y, z - 0.02, { color: CHROME, seg: 14 }); }
    else b.box('lights', r * 2.4, r * 1.1, 0.06, x, y, z, { lg: LG.HEAD, color: 0xfff6e0 });
  }
}
function lampsRear(b, xs, y, z, w, h, opts = {}) {
  for (const x of xs) {
    b.box('lights', w, h * 0.55, 0.06, x, y + h * 0.22, z, { lg: LG.TAIL, color: 0xff2a1a });
    b.box('lights', w, h * 0.45, 0.06, x, y - h * 0.28, z, { lg: LG.BRAKE, color: 0xff1a10 });
    if (opts.indicator !== false) b.box('lights', w * 0.5, h * 0.3, 0.05, x + Math.sign(x) * (w * 0.75), y, z, { lg: LG.AMBER, color: AMBER });
  }
  b.box('lights', 0.12, 0.06, 0.05, xs[0] * 0.55, y - h * 0.1, z, { lg: LG.REVERSE, color: 0xffffff });
}
function plate(b, y, z, back, yellow) {
  b.decal('detail', 0.42, 0.1, 0, y, z + (back ? -0.006 : 0.006), back ? 'B' : 'F', yellow ? 'plateY' : 'plateW');
}
function mirrors(b, x, y, z, color) {
  for (const s of [1, -1]) b.box('detail', 0.14, 0.09, 0.05, s * (x + 0.07), y, z, { color });
}
const profile = (bottom, top) => [...bottom, ...top];

// ------------------------------------------------------------------------------------------
// Every builder returns { wheels, bonnet, exhaust, roofY, head, tail } in body-centre coordinates.
const BUILDERS = {
  taxi(b, s) {
    const L = s.length, W = s.width, h = L / 2;
    const wheels = wheelSet(s, { tyreW: 0.17 });
    // rounded 60s Fiat 1100 silhouette: sloping bonnet, rounded boot (top edge listed front -> rear)
    const bottom = archBottom(h - 0.12, -h + 0.12, 0.24, wheels, 0.07);
    const top = [[-h + 0.03, 0.38], [-h, 0.58], [-h + 0.08, 0.8], [-h + 0.4, 0.9], [-1.3, 0.93], [0.55, 0.94], [1.2, 0.9], [1.7, 0.84], [h - 0.06, 0.76], [h, 0.6], [h - 0.03, 0.38]];
    b.extrude('paint', profile(bottom, top), W, 0, { bevel: 0.08, bevelSeg: 3 });
    cabin(b, { zrB: -1.3, zrT: -0.98, zfT: 0.12, zfB: 0.55, yB: 0.92, yT: 1.44, w: W - 0.2, pillars: [-0.42], roofColor: 0xf2c200 });
    // roof carrier
    for (const x of [-0.55, 0.55]) b.box('detail', 0.04, 0.04, 1.1, x, 1.56, -0.43, { color: 0x5a5a5a });
    for (const z of [-0.95, -0.43, 0.08]) b.box('detail', 1.14, 0.03, 0.04, 0, 1.58, z, { color: 0x5a5a5a });
    for (const [x, z] of [[-0.55, -0.95], [0.55, -0.95], [-0.55, 0.08], [0.55, 0.08]]) b.box('detail', 0.04, 0.12, 0.04, x, 1.51, z, { color: 0x5a5a5a });
    // TAXI sign on the carrier
    b.box('lights', 0.46, 0.15, 0.06, 0, 1.68, 0.1, { lg: LG.SIGN, color: 0xffd23a });
    b.decal('lights', 0.44, 0.13, 0, 1.68, 0.132, 'F', 'taxi', { lg: LG.SIGN });
    b.decal('lights', 0.44, 0.13, 0, 1.68, 0.068, 'B', 'taxi', { lg: LG.SIGN });
    // chrome bumpers with overriders, chrome grille, round headlamps
    b.box('detail', W + 0.04, 0.1, 0.1, 0, 0.36, h + 0.02, { color: CHROME });
    b.box('detail', W + 0.04, 0.1, 0.1, 0, 0.38, -h - 0.02, { color: CHROME });
    for (const x of [-0.42, 0.42]) b.box('detail', 0.07, 0.18, 0.08, x, 0.45, h + 0.03, { color: CHROME });
    b.box('detail', 0.78, 0.22, 0.05, 0, 0.6, h - 0.01, { color: CHROME });
    for (let i = 0; i < 4; i++) b.box('detail', 0.72, 0.025, 0.02, 0, 0.52 + i * 0.05, h + 0.02, { color: GRILLE });
    lampsFront(b, [-0.6, 0.6], 0.64, h - 0.02, 0.095, true);
    for (const x of [-0.6, 0.6]) b.box('lights', 0.08, 0.05, 0.04, x, 0.47, h + 0.0, { lg: LG.AMBER, color: AMBER });
    lampsRear(b, [-0.62, 0.62], 0.66, -h + 0.0, 0.13, 0.2, { indicator: false });
    plate(b, 0.36, h + 0.075, false, true); plate(b, 0.55, -h - 0.0, true, true);
    mirrors(b, W / 2 - 0.05, 0.98, 0.7, CHROME);
    for (const sx of [1, -1]) b.box('detail', 0.012, 0.03, L - 0.7, sx * (W / 2 + 0.002), 0.72, 0, { color: CHROME });
    b.box('detail', W - 0.1, 0.12, L - 0.5, 0, 0.2, 0, { color: 0x101010 });
    return { wheels, bonnet: { x: 0, y: 0.95, z: 1.4 }, exhaust: { x: 0.45, y: 0.25, z: -h }, roofY: 1.5, head: [[-0.6, 0.64, h], [0.6, 0.64, h]], tail: [[-0.62, 0.66, -h], [0.62, 0.66, -h]] };
  },

  hatch(b, s) {
    const L = s.length, W = s.width, h = L / 2;
    const wheels = wheelSet(s, { tyreW: 0.16 });
    const bottom = archBottom(h - 0.1, -h + 0.06, 0.22, wheels, 0.06);
    const top = [[-h, 0.32], [-h - 0.01, 0.88], [-1.55, 0.9], [0.9, 0.88], [1.35, 0.8], [h - 0.03, 0.72], [h, 0.5], [h - 0.02, 0.32]];
    b.extrude('paint', profile(bottom, top), W, 0, { bevel: 0.06 });
    cabin(b, { zrB: -1.6, zrT: -1.48, zfT: 0.22, zfB: 0.9, yB: 0.87, yT: 1.38, w: W - 0.14, pillars: [-0.55] });
    b.box('detail', W + 0.02, 0.16, 0.12, 0, 0.36, h, { color: 0x2a2a2a });
    b.box('detail', W + 0.02, 0.16, 0.12, 0, 0.36, -h, { color: 0x2a2a2a });
    b.box('detail', 0.5, 0.12, 0.04, 0, 0.6, h - 0.01, { color: GRILLE });
    lampsFront(b, [-0.5, 0.5], 0.62, h + 0.03, 0.08, false);
    lampsRear(b, [-0.58, 0.58], 0.68, -h - 0.04, 0.12, 0.22);
    plate(b, 0.36, h + 0.065, false, false); plate(b, 0.58, -h - 0.015, true, false);
    mirrors(b, W / 2 - 0.05, 0.95, 0.75, 0x222222);
    b.box('detail', W - 0.1, 0.12, L - 0.5, 0, 0.18, 0, { color: 0x101010 });
    return { wheels, bonnet: { x: 0, y: 0.9, z: 1.25 }, exhaust: { x: 0.4, y: 0.22, z: -h }, roofY: 1.4, head: [[-0.5, 0.62, h], [0.5, 0.62, h]], tail: [[-0.58, 0.68, -h], [0.58, 0.68, -h]] };
  },

  sedan(b, s) {
    const L = s.length, W = s.width, h = L / 2;
    const wheels = wheelSet(s, { tyreW: 0.2 });
    const bottom = archBottom(h - 0.12, -h + 0.1, 0.24, wheels, 0.06);
    const top = [[-h + 0.02, 0.36], [-h, 0.62], [-h + 0.06, 0.94], [-1.5, 0.99], [0.75, 0.95], [1.4, 0.86], [h - 0.1, 0.78], [h, 0.6], [h - 0.04, 0.34]];
    b.extrude('paint', profile(bottom, top), W, 0, { bevel: 0.07, bevelSeg: 3 });
    cabin(b, { zrB: -1.5, zrT: -0.95, zfT: -0.05, zfB: 0.78, yB: 0.95, yT: 1.4, w: W - 0.2, pillars: [-0.5] });
    b.box('detail', 0.9, 0.14, 0.04, 0, 0.56, h - 0.03, { color: GRILLE });
    b.box('detail', 0.9, 0.02, 0.045, 0, 0.64, h - 0.03, { color: CHROME });
    lampsFront(b, [-0.62, 0.62], 0.7, h + 0.0, 0.1, false);
    lampsRear(b, [-0.66, 0.66], 0.82, -h + 0.0, 0.26, 0.16, { indicator: false });
    b.box('detail', 1.0, 0.03, 0.03, 0, 0.73, -h + 0.03, { color: CHROME });
    plate(b, 0.4, h - 0.02, false, false); plate(b, 0.62, -h + 0.0, true, false);
    mirrors(b, W / 2 - 0.05, 0.98, 0.72, 0x222222);
    b.box('detail', W - 0.1, 0.12, L - 0.6, 0, 0.2, 0, { color: 0x101010 });
    for (const sx of [1, -1]) for (const z of [0.15, -0.75]) b.box('detail', 0.012, 0.02, 0.12, sx * (W / 2 + 0.002), 0.86, z, { color: CHROME });
    return { wheels, bonnet: { x: 0, y: 0.9, z: 1.5 }, exhaust: { x: 0.5, y: 0.25, z: -h }, roofY: 1.42, head: [[-0.62, 0.7, h], [0.62, 0.7, h]], tail: [[-0.66, 0.82, -h], [0.66, 0.82, -h]] };
  },

  suv(b, s, police = false) {
    const L = s.length, W = s.width, h = L / 2;
    const wheels = wheelSet(s, { tyreW: 0.24 });
    const bottom = archBottom(h - 0.15, -h + 0.08, 0.4, wheels, 0.08);
    const top = [[-h, 0.48], [-h - 0.01, 1.12], [1.0, 1.12], [1.5, 1.08], [h - 0.06, 1.02], [h, 0.8], [h - 0.06, 0.5]];
    b.extrude('paint', profile(bottom, top), W, 0, { bevel: 0.06 });
    cabin(b, { zrB: -h + 0.02, zrT: -h + 0.08, zfT: 0.4, zfB: 1.05, yB: 1.1, yT: 1.78, w: W - 0.1, pillars: [-0.25, -1.3] });
    for (const sx of [1, -1]) b.box('detail', 0.03, 0.18, L - 1.3, sx * (W / 2 + 0.01), 0.5, -0.05, { color: 0x222222 });
    b.box('detail', W + 0.04, 0.22, 0.16, 0, 0.5, h + 0.02, { color: 0x252525 });
    b.box('detail', W + 0.04, 0.22, 0.14, 0, 0.5, -h - 0.02, { color: 0x252525 });
    b.box('detail', 1.0, 0.24, 0.04, 0, 0.86, h - 0.01, { color: 0x111111 });
    for (let i = 0; i < 5; i++) b.box('detail', 0.03, 0.22, 0.05, -0.36 + i * 0.18, 0.86, h, { color: CHROME });
    lampsFront(b, [-0.66, 0.66], 0.88, h + 0.02, 0.11, false);
    lampsRear(b, [-0.8, 0.8], 1.0, -h - 0.04, 0.12, 0.3);
    plate(b, 0.5, h + 0.105, false, false); plate(b, 0.75, -h - 0.025, true, false);
    mirrors(b, W / 2 - 0.03, 1.2, 0.85, 0x222222);
    for (const x of [-0.68, 0.68]) b.box('detail', 0.05, 0.06, 2.2, x, 1.83, -0.75, { color: 0x2a2a2a });
    b.box('detail', W - 0.1, 0.16, L - 0.6, 0, 0.36, 0, { color: 0x101010 });
    if (!police) {
      b.cyl('detail', 0.34, 0.2, 0, 0.95, -h - 0.12, { color: RUBBER, seg: 14 }); // spare wheel on the tailgate
      b.cyl('detail', 0.2, 0.22, 0, 0.95, -h - 0.12, { color: 0x6a6a6a, seg: 10 });
    } else {
      // Mumbai Police: blue + khaki side stripes, POLICE on doors, push bar, light bar
      for (const sx of [1, -1]) {
        b.box('detail', 0.02, 0.16, L - 0.9, sx * (W / 2 + 0.012), 0.8, 0.05, { color: 0x1d3f9a });
        b.box('detail', 0.02, 0.05, L - 0.9, sx * (W / 2 + 0.014), 0.69, 0.05, { color: 0xc9a85a });
        b.decal('detail', 0.95, 0.13, sx * (W / 2 + 0.03), 1.0, 0.1, sx > 0 ? 'L' : 'R', 'police');
      }
      b.decal('detail', 0.9, 0.09, 0, 1.0, -h - 0.025, 'B', 'mpolice');
      b.box('detail', 1.3, 0.06, 0.06, 0, 0.62, h + 0.18, { color: 0x111111 });
      for (const x of [-0.5, 0, 0.5]) b.box('detail', 0.06, 0.4, 0.06, x, 0.7, h + 0.16, { color: 0x111111 });
      b.box('detail', 1.3, 0.06, 0.06, 0, 0.88, h + 0.15, { color: 0x111111 });
      b.box('detail', 1.3, 0.06, 0.32, 0, 1.84, -0.1, { color: 0x202020 });
      b.box('lights', 0.6, 0.12, 0.28, 0.32, 1.93, -0.1, { lg: LG.SIREN_R, color: 0xff2020 });
      b.box('lights', 0.6, 0.12, 0.28, -0.32, 1.93, -0.1, { lg: LG.SIREN_B, color: 0x2a5cff });
    }
    return { wheels, bonnet: { x: 0, y: 1.15, z: 1.6 }, exhaust: { x: 0.5, y: 0.35, z: -h }, roofY: 1.85, head: [[-0.66, 0.88, h], [0.66, 0.88, h]], tail: [[-0.8, 1.0, -h], [0.8, 1.0, -h]] };
  },

  police(b, s) { return BUILDERS.suv(b, s, true); },

  van(b, s) {
    const L = s.length, W = s.width, h = L / 2;
    const wheels = wheelSet(s, { tyreW: 0.15 });
    const bottom = archBottom(h - 0.06, -h + 0.04, 0.22, wheels, 0.06);
    const top = [[-h, 0.3], [-h - 0.01, 1.0], [1.5, 1.0], [h - 0.02, 0.92], [h, 0.4]];
    b.extrude('paint', profile(bottom, top), W, 0, { bevel: 0.05 });
    cabin(b, { zrB: -h + 0.01, zrT: -h + 0.04, zfT: 1.05, zfB: 1.6, yB: 0.98, yT: 1.82, w: W - 0.04, pillars: [0.75, -0.4] });
    b.box('detail', W + 0.02, 0.14, 0.1, 0, 0.34, h, { color: 0x2a2a2a });
    b.box('detail', W + 0.02, 0.14, 0.1, 0, 0.34, -h, { color: 0x2a2a2a });
    b.box('detail', 0.6, 0.14, 0.03, 0, 0.62, h - 0.01, { color: GRILLE });
    b.decal('detail', 0.36, 0.06, 0, 0.8, h + 0.0, 'F', 'omni');
    lampsFront(b, [-0.5, 0.5], 0.7, h + 0.03, 0.085, false);
    lampsRear(b, [-0.58, 0.58], 0.7, -h - 0.04, 0.1, 0.24);
    plate(b, 0.36, h + 0.055, false, false); plate(b, 0.55, -h - 0.02, true, false);
    mirrors(b, W / 2 - 0.02, 1.12, 1.35, 0x222222);
    for (const sx of [1, -1]) b.box('detail', 0.012, 0.85, 0.02, sx * (W / 2 + 0.002), 0.95, 0.72, { color: 0x333333 });
    b.box('detail', 0.012, 0.03, 0.9, -(W / 2 + 0.002), 0.98, 0.15, { color: 0x333333 });
    b.box('detail', W - 0.1, 0.12, L - 0.5, 0, 0.18, 0, { color: 0x101010 });
    return { wheels, bonnet: { x: 0, y: 0.6, z: 1.4 }, exhaust: { x: 0.45, y: 0.22, z: -h }, roofY: 1.85, head: [[-0.5, 0.7, h], [0.5, 0.7, h]], tail: [[-0.58, 0.7, -h], [0.58, 0.7, -h]] };
  },

  bus(b, s) {
    const L = s.length, W = s.width, h = L / 2;
    const wheels = wheelSet(s, { tyreW: 0.3, rearW: 0.52 });
    const e = h - 0.075; // bevel grows the outline by ~0.07, keep the outer skin at +-h
    const bottom = archBottom(e - 0.06, -e + 0.06, 0.38, wheels, 0.08);
    const top = [[-e, 0.45], [-e, 4.1], [-e + 0.25, 4.25], [e - 0.35, 4.25], [e - 0.06, 4.1], [e - 0.03, 2.3], [e, 0.45]];
    b.extrude('paint', profile(bottom, top), W, 0, { bevel: 0.09, bevelSeg: 3 });
    const CREAM = 0xeadfb8;
    for (const sx of [1, -1]) {
      b.box('detail', 0.03, 0.32, L - 0.2, sx * (W / 2 + 0.02), 2.38, 0, { color: CREAM });
      b.box('detail', 0.03, 0.12, L - 0.3, sx * (W / 2 + 0.02), 1.12, 0, { color: CREAM });
      b.box('detail', 0.03, 0.26, L - 0.3, sx * (W / 2 + 0.02), 0.5, 0, { color: 0x1a1a1a });
      b.box('glass', 0.03, 0.82, L - 2.2, sx * (W / 2 + 0.015), 1.7, -0.55);
      b.box('glass', 0.03, 0.9, L - 0.9, sx * (W / 2 + 0.015), 3.12, -0.05);
      for (let z = -h + 0.6; z < h - 1.5; z += 1.12) b.box('paint', 0.05, 0.84, 0.12, sx * (W / 2 + 0.025), 1.7, z);
      for (let z = -h + 0.55; z < h - 0.3; z += 1.12) b.box('paint', 0.05, 0.92, 0.12, sx * (W / 2 + 0.025), 3.12, z);
      b.decal('detail', 1.3, 0.3, sx * (W / 2 + 0.04), 2.38, -1.0, sx > 0 ? 'L' : 'R', 'best');
    }
    b.box('detail', W + 0.04, 0.32, 0.03, 0, 2.38, h + 0.02, { color: CREAM });
    b.box('detail', W + 0.04, 0.32, 0.03, 0, 2.38, -h - 0.03, { color: CREAM });
    b.box('glass', W - 0.3, 1.0, 0.04, 0, 1.68, h + 0.01);
    b.box('glass', W - 0.3, 0.8, 0.04, 0, 3.15, h - 0.02);
    b.box('paint', 0.08, 0.82, 0.05, 0, 3.15, h - 0.01);
    b.box('lights', W - 0.5, 0.28, 0.04, 0, 3.72, h - 0.04, { lg: LG.SIGN, color: 0x221408 });
    b.decal('lights', W - 0.55, 0.24, 0, 3.72, h - 0.015, 'F', 'dest', { lg: LG.SIGN });
    b.box('glass', W - 0.4, 0.8, 0.04, 0, 3.15, -h - 0.04);
    b.box('detail', W + 0.06, 0.28, 0.16, 0, 0.5, h + 0.06, { color: 0x1a1a1a });
    b.box('detail', W + 0.06, 0.28, 0.14, 0, 0.5, -h - 0.04, { color: 0x1a1a1a });
    b.box('detail', 0.03, 1.75, 0.9, W / 2 + 0.025, 1.38, h - 1.0, { color: 0x3a3430 }); // front-left door
    lampsFront(b, [-0.95, 0.95], 0.85, h + 0.1, 0.13, true);
    lampsRear(b, [-1.05, 1.05], 0.9, -h - 0.1, 0.16, 0.3);
    plate(b, 0.5, h + 0.145, false, true); plate(b, 0.9, -h - 0.045, true, true);
    mirrors(b, W / 2 + 0.05, 2.0, h - 0.2, 0x1a1a1a);
    b.box('detail', W - 0.2, 0.2, L - 0.8, 0, 0.32, 0, { color: 0x101010 });
    return { wheels, bonnet: { x: 0.6, y: 0.9, z: -h + 0.4 }, exhaust: { x: 0.9, y: 0.35, z: -h }, roofY: 4.35, head: [[-0.95, 0.85, h], [0.95, 0.85, h]], tail: [[-1.05, 0.9, -h], [1.05, 0.9, -h]] };
  },
};

// ---- caches -------------------------------------------------------------------------------
const geoCache = new Map();
export function getModel(type, spec) {
  if (geoCache.has(type)) return geoCache.get(type);
  const b = new Builder();
  const info = (BUILDERS[type] || BUILDERS.sedan)(b, spec);
  const m = { geo: b.build(), ...info };
  geoCache.set(type, m);
  return m;
}

const mats = {};
const paintCache = new Map();
let envTex = null, envK = 1;
export function paintMaterial(color) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.35, envMap: envTex, envMapIntensity: envK });
    paintCache.set(color, m);
  }
  return m;
}
/** Simple sky-gradient reflection map for car paint/glass (city lighting stays in charge of everything else). */
export function setVehicleEnv(tex) {
  envTex = tex;
  for (const m of paintCache.values()) { m.envMap = tex; m.needsUpdate = true; }
  const M = sharedMaterials();
  for (const k of ['detail', 'glass']) { M[k].envMap = tex; M[k].needsUpdate = true; }
}
/** Scale reflections with ambient light (dark at night). */
export function setVehicleEnvIntensity(k) {
  if (Math.abs(k - envK) < 0.01) return;
  envK = k;
  for (const m of paintCache.values()) m.envMapIntensity = k;
  const M = sharedMaterials();
  M.detail.envMapIntensity = k * 0.8; M.glass.envMapIntensity = k * 1.4;
}
export function sharedMaterials() {
  if (mats.detail) return mats;
  const map = atlas();
  mats.detail = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.5, metalness: 0.35 });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x2c3a46, roughness: 0.12, metalness: 0.55 });
  mats.charred = new THREE.MeshStandardMaterial({ color: 0x151311, roughness: 0.95, metalness: 0.1 });
  mats.charredGlass = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 1, metalness: 0 });
  return mats;
}

/** Per-car lights material (MeshBasic + per-vertex light-group intensity uniform array). */
export function makeLightsMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, map: atlas() });
  const uL = { value: [1, 0.4, 0.35, 0.1, 0.25, 0.25, 0.8, 0.35] };
  m.userData.uL = uL;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uL = uL;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float lgroup;\nvarying float vLG;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLG = lgroup;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uL[8];\nvarying float vLG;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= uL[int(vLG + 0.5)];');
  };
  m.customProgramCacheKey = () => 'ctaVehLights1';
  return m;
}

// ---- shared wheel geometry (instanced; unit radius, unit width, axle along X) ---------------
let wheelGeo = null;
export function getWheelGeometry() {
  if (wheelGeo) return wheelGeo;
  const b = new Builder();
  const tyre = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false); tyre.rotateZ(Math.PI / 2);
  b.add('detail', tyre, { color: 0x1c1c1c });
  for (const sx of [1, -1]) {
    const hub = new THREE.CylinderGeometry(0.62, 0.62, 0.04, 14); hub.rotateZ(Math.PI / 2); hub.translate(sx * 0.5, 0, 0);
    b.add('detail', hub, { color: 0x9a9da0 });
    const cap = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8); cap.rotateZ(Math.PI / 2); cap.translate(sx * 0.53, 0, 0);
    b.add('detail', cap, { color: 0xd5d8da });
    for (let i = 0; i < 5; i++) { // spokes so rotation reads
      const sp = new THREE.BoxGeometry(0.03, 0.1, 0.38); sp.translate(sx * 0.53, 0, 0.36); sp.rotateX(i / 5 * Math.PI * 2);
      b.add('detail', sp, { color: 0x2e2e2e });
    }
  }
  wheelGeo = b.build().detail;
  return wheelGeo;
}
