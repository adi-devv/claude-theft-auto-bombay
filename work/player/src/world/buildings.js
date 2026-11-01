// Procedural buildings: lots are laid along every street frontage (continuous street walls), then block interiors
// are back-filled. Archetypes: Art Deco (Marine Drive / Oval / Churchgate), Fort Victorian-Gothic & Indo-Saracenic
// stone with arcades, 60s-80s modern slabs, Nariman Point towers, low tiled-roof chawls.
// Everything merges into the single 'facade' material (windows etc. are procedural, see materials.js).
import * as THREE from 'three';
import { prism, rectPoly, roundRectPoly, offsetPoly, mat, PRIM } from './geom.js';
import { mulberry } from './textures.js';
import { STREET, SIGNALS } from './mapdata.js';

const DECO_COLS = ['#e9dfc4', '#e8b9a0', '#bcd8c2', '#efe0a6', '#e7c4c0', '#bfd2dc', '#ece6da', '#e2c48e', '#d9cbb8', '#f0d2b4', '#c9dccd'];
const FORT_COLS = ['#c9b48a', '#d8c8a2', '#9a9184', '#c49a5c', '#a87458', '#b8bcb6', '#cdb894', '#d1bf9a', '#b39a72', '#c8a679'];
const MODERN_COLS = ['#b9b5aa', '#cfc8b8', '#a9aba6', '#d8d0bf', '#c2b8a6', '#9fa7ab'];
const TOWER_COLS = ['#8fa3b0', '#a8b4ba', '#c7c3b8', '#7d8f9c', '#b5aa98'];

// ---- obstacle index (oriented boxes) -----------------------------------------------------------
class OBBIndex {
  constructor() { this.cell = 40; this.map = new Map(); this.list = []; }
  _keys(o) {
    const ex = Math.abs(Math.cos(o.rot)) * o.hw + Math.abs(Math.sin(o.rot)) * o.hd, ez = Math.abs(Math.sin(o.rot)) * o.hw + Math.abs(Math.cos(o.rot)) * o.hd;
    const ks = [];
    for (let gx = Math.floor((o.cx - ex) / this.cell); gx <= Math.floor((o.cx + ex) / this.cell); gx++)
      for (let gz = Math.floor((o.cz - ez) / this.cell); gz <= Math.floor((o.cz + ez) / this.cell); gz++) ks.push(gx + ',' + gz);
    return ks;
  }
  add(o) { o.ax = [Math.cos(o.rot), -Math.sin(o.rot)]; o.az = [Math.sin(o.rot), Math.cos(o.rot)]; this.list.push(o); for (const k of this._keys(o)) { let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(o); } }
  overlaps(o, shrink = 0.25) {
    const A = { ...o, hw: o.hw - shrink, hd: o.hd - shrink, ax: [Math.cos(o.rot), -Math.sin(o.rot)], az: [Math.sin(o.rot), Math.cos(o.rot)] };
    const seen = new Set();
    for (const k of this._keys(o)) {
      const arr = this.map.get(k); if (!arr) continue;
      for (const B of arr) { if (seen.has(B)) continue; seen.add(B); if (sat(A, B)) return B; }
    }
    return null;
  }
}
function sat(A, B) {
  const dx = A.cx - B.cx, dz = A.cz - B.cz;
  for (const ax of [A.ax, A.az, B.ax, B.az]) {
    const rA = A.hw * Math.abs(A.ax[0] * ax[0] + A.ax[1] * ax[1]) + A.hd * Math.abs(A.az[0] * ax[0] + A.az[1] * ax[1]);
    const rB = B.hw * Math.abs(B.ax[0] * ax[0] + B.ax[1] * ax[1]) + B.hd * Math.abs(B.az[0] * ax[0] + B.az[1] * ax[1]);
    if (Math.abs(dx * ax[0] + dz * ax[1]) >= rA + rB) return false;
  }
  return true;
}

// ---- helpers to emit geometry ------------------------------------------------------------------------
const facadeVec = (bay, fh, style, seed, flags = 0) => [bay, fh, style, (seed % 1) * 0.999 + flags * 10];

export function emitPrism(batch, poly, y0, y1, color, facade, opts = {}) {
  const m = prism(poly, y0, y1, opts);
  batch.addRaw('facade', m.pos, m.nrm, m.uv, m.idx, { color, facade });
  return m;
}
export function emitBox(batch, cx, cy, cz, w, h, d, rot, color, facade = [3, 3, 0, 0], rx = 0, rz = 0) {
  batch.add('facade', PRIM.box, mat(cx, cy, cz, rot, w, h, d, rx, rz), { color, facade });
}
export function emitCyl(batch, geo, cx, cy, cz, r, h, color, facade = [3, 3, 9, 0], rot = 0) {
  batch.add('facade', geo, mat(cx, cy, cz, rot, r * 2, h, r * 2), { color, facade });
}
/** Sign quad facing (fx,fz). uvr = [u0,v0,u1,v1] in the sign atlas. */
export function emitSign(batch, x, y, z, w, h, fx, fz, uvr, color = 0xffffff) {
  const rx = fz, rz = -fx;
  const A = [x - rx * w / 2, y - h / 2, z - rz * w / 2], B = [x + rx * w / 2, y - h / 2, z + rz * w / 2];
  const C = [B[0], y + h / 2, B[2]], D = [A[0], y + h / 2, A[2]];
  batch.addRaw('signs', [...A, ...B, ...C, ...D], [fx, 0, fz, fx, 0, fz, fx, 0, fz, fx, 0, fz], [uvr[0], uvr[1], uvr[2], uvr[1], uvr[2], uvr[3], uvr[0], uvr[3]], [0, 1, 2, 0, 2, 3], { color });
}

// ---- lot generation ----------------------------------------------------------------------------------
export function generateBuildings(game, ctx) {
  const { roads, collision } = game;
  const { fields, batch, mats } = ctx;
  const signs = mats.signs;
  const rnd = mulberry(1937);
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const obs = new OBBIndex();
  ctx.obstacles = obs;
  // reserved: landmarks (+margin), and extra keep-outs registered by landmarks/props
  for (const l of roads.landmarks) obs.add({ cx: l.x, cz: l.z, hw: l.w / 2 + 3, hd: l.d / 2 + 3, rot: l.rot || 0, reserved: true });
  for (const k of ctx.keepOut || []) obs.add({ ...k, reserved: true });

  const lots = [];
  const roadOrder = [...roads.roads].sort((a, b) => rank(a) - rank(b));
  function rank(r) { return r.name === 'Marine Drive' ? 0 : r.kind === 'arterial' ? 1 : r.kind === 'street' ? 2 : 3; }

  function valid(o, minLand = 2) {
    // sample interior points (inset 0.3) against clearance fields
    const nx = Math.max(2, Math.ceil(o.hw * 2 / 2.5)), nz = Math.max(2, Math.ceil(o.hd * 2 / 2.5));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const lx = -o.hw + 0.3 + (2 * o.hw - 0.6) * (i / nx), lz = -o.hd + 0.3 + (2 * o.hd - 0.6) * (j / nz);
      const x = o.cx + Math.cos(o.rot) * lx + Math.sin(o.rot) * lz, z = o.cz - Math.sin(o.rot) * lx + Math.cos(o.rot) * lz;
      if (fields.sample(fields.F, x, z) < -0.15) return false;
      if (fields.sample(fields.land, x, z) < minLand) return false;
      if (fields.sample(fields.park, x, z) > -1) return false;
    }
    // map edge: gameplay land boundary for collidable buildings (visual-only beyond)
    if (obs.overlaps(o)) return false;
    return true;
  }

  function regionOf(x, z) {
    if (z > 380 && x < -250) return 'np';
    if (z < -565 || z > 565) return 'outer';
    if (x < -226) return z < -130 ? 'marinelines' : 'deco';
    if (x < -60) return z < -130 ? 'marinelines' : 'fortw';
    return 'fort';
  }

  for (const road of roadOrder) {
    const isMD = road.name === 'Marine Drive';
    for (const e of road.edges) {
      for (const side of [1, -1]) {
        if (isMD && side === 1) continue; // sea side
        const fp = isMD ? STREET.mdLandFootpath : STREET.footpath;
        const off0 = e.width / 2 + fp + STREET.setback + 0.05;
        let s = 1;
        while (s < e.length - 3) {
          const p0 = roads.sample(e, s);
          const reg = regionOf(p0.x, p0.z);
          const spec = lotSpec(reg, road, rnd, R);
          let placed = false;
          for (const fd of [1, 0.75, 0.55]) {
            for (const fw of [1, 0.7, 0.5]) {
              const W = spec.w * fw, D = Math.max(8, spec.d * fd);
              if (W < 7) continue;
              if (s + W > e.length + 2) continue;
              const pc = roads.sample(e, s + W / 2);
              const nx = side * pc.tz, nz = -side * pc.tx; // normal away from road into the block
              const o = { cx: pc.x + nx * (off0 + D / 2), cz: pc.z + nz * (off0 + D / 2), hw: W / 2, hd: D / 2, rot: Math.atan2(nx, nz) };
              if (!valid(o)) continue;
              o.region = reg; o.road = road; o.edge = e; o.front = [-nx, -nz]; o.spec = spec; o.frontage = true;
              obs.add(o); lots.push(o); placed = true;
              s += W + (rnd() < 0.15 ? R(0.5, 2.5) : 0.02);
              break;
            }
            if (placed) break;
          }
          if (!placed) s += 2;
        }
      }
    }
  }
  // back-fill block interiors
  for (let x = -640; x < 420; x += 9) for (let z = -740; z < 740; z += 9) {
    const xx = x + R(-3, 3), zz = z + R(-3, 3);
    if (fields.sample(fields.F, xx, zz) < 6 || fields.sample(fields.land, xx, zz) < 4) continue;
    const n = roads.nearest(xx, zz, 120);
    const rot = n ? Math.atan2(n.tx, n.tz) : 0;
    const reg = regionOf(xx, zz);
    for (const f of [1, 0.7, 0.5]) {
      const o = { cx: xx, cz: zz, hw: R(6, 12) * f, hd: R(6, 11) * f, rot };
      if (o.hw < 3.5 || o.hd < 3.5) continue;
      if (!valid(o, 3)) continue;
      o.region = reg; o.frontage = false; o.front = [Math.sin(rot), Math.cos(rot)];
      o.spec = lotSpec(reg, null, rnd, R, true);
      obs.add(o); lots.push(o); break;
    }
  }

  // ---- emit buildings
  let nColl = 0;
  const stats = { deco: 0, fort: 0, modern: 0, tower: 0, chawl: 0 };
  for (const o of lots) {
    const outer = o.cz < -563 || o.cz > 563 || !roads.isLand(o.cx, o.cz);
    const kind = o.spec.kind;
    stats[kind]++;
    const info = BUILD[kind](batch, o, rnd, R, pick, ctx, signs, fields);
    if (!outer) {
      const hw = info?.collHw ?? o.hw, hd = info?.collHd ?? o.hd, cx = info?.collCx ?? o.cx, cz = info?.collCz ?? o.cz;
      collision.addBox(cx, cz, hw, hd, o.rot, { h: o.H || 12, tag: 'building' });
      nColl++;
    }
  }
  return { lots, stats, colliders: nColl };
}

function lotSpec(reg, road, rnd, R, back = false) {
  const r = rnd();
  const isMD = road && road.name === 'Marine Drive';
  const major = road && (road.kind === 'arterial' || road.kind === 'boulevard');
  if (reg === 'np') return { kind: r < 0.75 ? 'tower' : 'modern', w: R(24, 36), d: R(22, 32), floors: Math.round(R(16, 28)) };
  if (reg === 'deco') {
    if (back) return { kind: r < 0.6 ? 'deco' : 'modern', w: 0, d: 0, floors: Math.round(R(3, 6)) };
    if (r < (isMD ? 0.9 : 0.75)) return { kind: 'deco', w: R(18, 28), d: R(18, 26), floors: Math.round(isMD ? R(5, 8) : R(4, 7)) };
    return { kind: 'modern', w: R(16, 26), d: R(16, 24), floors: Math.round(R(7, 12)) };
  }
  if (reg === 'marinelines') {
    if (r < (isMD ? 0.8 : 0.45)) return { kind: 'deco', w: R(16, 26), d: R(16, 24), floors: Math.round(R(4, 7)) };
    if (r < 0.8) return { kind: 'modern', w: R(16, 26), d: R(14, 22), floors: Math.round(R(6, 12)) };
    return { kind: 'chawl', w: R(12, 20), d: R(10, 16), floors: Math.round(R(3, 4)) };
  }
  if (reg === 'outer') return { kind: r < 0.5 ? 'chawl' : r < 0.85 ? 'modern' : 'fort', w: R(14, 24), d: R(12, 20), floors: Math.round(R(4, 9)) };
  // fort / fortw
  if (back) return { kind: r < 0.55 ? 'fort' : r < 0.8 ? 'chawl' : 'modern', w: 0, d: 0, floors: Math.round(R(3, 6)) };
  if (r < 0.68) return { kind: 'fort', w: R(14, 26), d: R(14, 24), floors: Math.round(R(3, 6)), arcade: major && rnd() < 0.7 };
  if (r < 0.82) return { kind: 'deco', w: R(14, 24), d: R(14, 22), floors: Math.round(R(4, 6)) };
  if (r < 0.95) return { kind: 'modern', w: R(14, 24), d: R(14, 22), floors: Math.round(R(6, 11)) };
  return { kind: 'chawl', w: R(10, 16), d: R(10, 14), floors: Math.round(R(2, 4)) };
}

// local→world helpers for a lot
function L2W(o, lx, lz) { const c = Math.cos(o.rot), s = Math.sin(o.rot); return [o.cx + c * lx + s * lz, o.cz - s * lx + c * lz]; }

function cornerFlags(o, fields) {
  // is the lot at a street corner? check beyond each side of the front
  const res = [false, false];
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const [x, z] = L2W(o, sx * (o.hw + 4), -o.hd + 2);
    if (fields.sample(fields.G, x, z) < 0.5) res[i] = true;
  }
  return res;
}

function roofClutter(batch, o, H, rnd, R, pick, color) {
  // stair/lift room, black Sintex tanks, concrete tank
  const [x1, z1] = L2W(o, R(-o.hw * 0.5, o.hw * 0.5), R(-o.hd * 0.3, o.hd * 0.5));
  emitBox(batch, x1, H + 1.5, z1, R(2.6, 4), 3, R(2.6, 4), o.rot, color, facadeVec(3, 3, 0, rnd()));
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const [x, z] = L2W(o, R(-o.hw + 1.5, o.hw - 1.5), R(-o.hd + 1.5, o.hd - 1.5));
    const big = rnd() < 0.3;
    if (big) emitBox(batch, x, H + 1.2, z, 3, 2.4, 2.2, o.rot, '#8d8a84', facadeVec(3, 3, 8, rnd()));
    else { emitBox(batch, x, H + 0.4, z, 1.6, 0.8, 1.6, o.rot, '#555', facadeVec(3, 3, 9, 0)); emitCyl(batch, PRIM.cyl8, x, H + 1.6, z, 0.85, 1.6, '#1c1c1e', facadeVec(3, 3, 9, 0)); }
  }
}

function acBoxes(batch, o, H, fh, rnd, R, n) {
  for (let i = 0; i < n; i++) {
    const lx = R(-o.hw + 1, o.hw - 1), y = fh * (1 + Math.floor(rnd() * Math.max(1, Math.floor(H / fh) - 1))) + fh * 0.2;
    const [x, z] = L2W(o, lx, -o.hd - 0.3);
    emitBox(batch, x, y, z, 0.9, 0.6, 0.55, o.rot, '#d6d4cc', facadeVec(3, 3, 9, 0));
  }
}

function parapetAndRoof(batch, poly, H, ph, roofCol, wallCol, seed) {
  // roof slab + inner parapet face
  const roof = prism(poly, H - 0.1, H, { top: true, bottom: false });
  batch.addRaw('facade', roof.pos.slice(roof.pos.length - poly.length * 3), roof.nrm.slice(roof.nrm.length - poly.length * 3), roof.uv.slice(roof.uv.length - poly.length * 2), roof.idx.slice(poly.length * 6).map((i) => i - poly.length * 4), { color: roofCol, facade: facadeVec(3, 3, 8, seed) });
  if (ph > 0) emitPrism(batch, offsetPoly(poly, -0.25), H, H + ph, wallCol, facadeVec(3, 3, 0, seed), { top: false, inward: true });
}

const BUILD = {
  deco(batch, o, rnd, R, pick, ctx, signs, fields) {
    const floors = o.spec.floors || Math.round(R(4, 6));
    const fh = 3.25, H = floors * fh + 0.6; o.H = H;
    const col = pick(DECO_COLS), trim = new THREE.Color(col).lerp(new THREE.Color('#fbf6ea'), 0.6).getStyle();
    const corners = o.frontage ? cornerFlags(o, fields) : [false, false];
    const rc = R(3.5, 6.5);
    const radii = [corners[0] ? rc : 0.4, corners[1] ? rc : 0.4, 0.3, 0.3];
    const poly = roundRectPoly(o.cx, o.cz, o.hw, o.hd, o.rot, radii, 6);
    const shops = o.frontage && (o.road?.kind === 'arterial' || rnd() < 0.3);
    const seed = rnd();
    emitPrism(batch, poly, 0, H + 1.0, col, facadeVec(R(2.8, 3.4), fh, shops ? 11 : 1, seed), { top: false, bay: 3.1 });
    parapetAndRoof(batch, poly, H, 1.0, '#8a857c', col, seed);
    // plinth band, speed lines, cornice
    emitPrism(batch, offsetPoly(poly, 0.06), 0, 0.9, new THREE.Color(col).multiplyScalar(0.7).getStyle(), facadeVec(3, 3, 0, seed), { top: false });
    const lines = rnd() < 0.7;
    if (lines) for (let k = 0; k < 3; k++) emitPrism(batch, offsetPoly(poly, 0.1), H - 1.6 + k * 0.45, H - 1.45 + k * 0.45, trim, facadeVec(3, 3, 0, seed), { top: false, bottom: true });
    emitPrism(batch, offsetPoly(poly, 0.3), H + 0.75, H + 1.05, trim, facadeVec(3, 3, 0, seed), { top: true, bottom: true });
    // eyebrow chajjas along the front (and the corner side)
    const frontW = 2 * o.hw - (corners[0] ? rc : 0) - (corners[1] ? rc : 0);
    const fcx = ((corners[0] ? rc : 0) - (corners[1] ? rc : 0)) / 2;
    for (let f = 1; f < floors; f++) {
      const y = f * fh + fh * 0.78;
      const [x, z] = L2W(o, fcx, -o.hd - 0.3);
      emitBox(batch, x, y, z, frontW - 0.4, 0.1, 0.6, o.rot, trim, facadeVec(3, 3, 0, seed));
    }
    // curved balconies wrapping rounded corners
    for (const ci of [0, 1]) {
      if (!corners[ci] || rnd() < 0.25) continue;
      const sx = ci === 0 ? -1 : 1;
      const ocx = sx * (o.hw - rc), ocz = -o.hd + rc;
      const a0 = ci === 0 ? Math.PI : 1.5 * Math.PI, a1 = a0 + Math.PI / 2;
      const ring = [];
      for (let k = 0; k <= 8; k++) { const a = a0 + (a1 - a0) * k / 8; ring.push(L2W(o, ocx + Math.cos(a) * (rc + 1.3), ocz + Math.sin(a) * (rc + 1.3))); }
      for (let k = 8; k >= 0; k--) { const a = a0 + (a1 - a0) * k / 8; ring.push(L2W(o, ocx + Math.cos(a) * (rc - 0.2), ocz + Math.sin(a) * (rc - 0.2))); }
      for (let f = 1; f < floors; f++) emitPrism(batch, ring, f * fh - 0.15, f * fh + 1.0, trim, facadeVec(3, 3, 0, seed), { top: true, bottom: true, smoothAngle: 0.6 });
    }
    // central vertical fin + name plaque
    if (o.frontage && rnd() < 0.75 && frontW > 10) {
      const [x, z] = L2W(o, fcx, -o.hd - 0.35);
      emitBox(batch, x, (fh + H + 3.2) / 2, z, 1.3, H + 3.2 - fh, 0.9, o.rot, trim, facadeVec(3, 3, 0, seed));
      const [sx2, sz2] = L2W(o, fcx, -o.hd - 0.83);
      const uv = signs.decoUV[Math.floor(rnd() * signs.decoUV.length)];
      emitSign(batch, sx2, fh * 0.92, sz2, 4.6, 0.58, o.front[0], o.front[1], uv, 0xffffff);
      // stepped crown on the fin
      emitBox(batch, x, H + 3.5, z, 0.8, 0.6, 0.6, o.rot, trim, facadeVec(3, 3, 0, seed));
    }
    if (shops) shopSigns(batch, o, fh * 0.92, rnd, R, signs, fcx, frontW);
    roofClutter(batch, o, H, rnd, R, pick, trim);
    acBoxes(batch, o, H, fh, rnd, R, Math.floor(rnd() * 4));
  },

  fort(batch, o, rnd, R, pick, ctx, signs) {
    const floors = o.spec.floors || Math.round(R(3, 5));
    const fh0 = 4.4, fh = 3.9, H = fh0 + (floors - 1) * fh; o.H = H;
    const col = pick(FORT_COLS), trim = new THREE.Color(col).lerp(new THREE.Color('#efe4cc'), 0.45).getStyle();
    const seed = rnd();
    const arcade = o.spec.arcade && o.frontage;
    const gothic = rnd() < 0.65;
    const style = gothic ? 2 : 5;
    const poly = rectPoly(o.cx, o.cz, o.hw, o.hd, o.rot);
    if (arcade) {
      // upper floors overhang the footpath by STREET.fortArcade; ground floor recessed behind piers
      const A = STREET.fortArcade;
      const up = rectPoly(...L2W(o, 0, -A / 2), o.hw, o.hd + A / 2, o.rot);
      emitPrism(batch, poly, 0, fh0, new THREE.Color(col).multiplyScalar(0.85).getStyle(), facadeVec(3.4, fh0, 10 + style, seed), { top: false, bay: 3.4 });
      emitPrism(batch, up, fh0, H + 1.0, col, facadeVec(3.4, fh, style, seed), { top: false, bottom: true, bay: 3.4 });
      parapetAndRoof(batch, up, H, 1.0, '#7d776c', col, seed);
      // piers along the arcade front
      const n = Math.max(2, Math.round((2 * o.hw) / 3.4));
      for (let k = 0; k <= n; k++) {
        const lx = -o.hw + 0.35 + (2 * o.hw - 0.7) * (k / n);
        const [x, z] = L2W(o, lx, -o.hd - A + 0.35);
        emitBox(batch, x, fh0 / 2, z, 0.7, fh0, 0.7, o.rot, trim, facadeVec(3, 3, 6, seed));
        ctx.game.collision.addCircle(x, z, 0.4, { h: fh0, tag: 'pillar' });
      }
      // arcade beam with signs
      const [bx, bz] = L2W(o, 0, -o.hd - A + 0.3);
      emitBox(batch, bx, fh0 - 0.5, bz, 2 * o.hw, 1.0, 0.6, o.rot, trim, facadeVec(3, 3, 6, seed));
      const ns = Math.floor((2 * o.hw) / 7);
      for (let k = 0; k < ns; k++) {
        const lx = -o.hw + (2 * o.hw) * ((k + 0.5) / ns);
        const [x, z] = L2W(o, lx, -o.hd - A - 0.05);
        emitSign(batch, x, fh0 - 0.5, z, Math.min(5.5, (2 * o.hw) / ns - 0.6), 0.75, o.front[0], o.front[1], signs.shopUV[Math.floor(rnd() * signs.shopUV.length)]);
      }
      // warm lit soffit strip under the overhang
      const [gx, gz] = L2W(o, 0, -o.hd - A / 2);
      batch.add('glow', PRIM.box, mat(gx, fh0 - 0.02, gz, o.rot, 2 * o.hw - 0.4, 0.03, A - 0.8), { color: '#ffc27a' });
      o.collHd = o.hd; // ground floor box only
    } else {
      const shops = o.frontage && rnd() < 0.85;
      emitPrism(batch, poly, 0, H + 1.0, col, facadeVec(gothic ? 3.2 : 2.6, fh, (shops ? 10 : 0) + style, seed), { top: false, bay: gothic ? 3.2 : 2.6 });
      if (shops) shopSigns(batch, o, fh * 0.85, rnd, R, signs, 0, 2 * o.hw);
      const hip = rnd() < 0.45;
      if (hip) hipRoof(batch, o, poly, H, rnd() < 0.6 ? '#9a5236' : '#6e6a64', seed);
      else parapetAndRoof(batch, poly, H, 1.0, '#7d776c', col, seed);
      // wooden balconies
      if (o.frontage && rnd() < 0.55) {
        const bw = 2 * o.hw * R(0.4, 0.8);
        for (let f = 1; f < floors; f++) {
          if (rnd() < 0.3) continue;
          const lx = R(-0.2, 0.2) * o.hw;
          const [x, z] = L2W(o, lx, -o.hd - 0.6);
          const y = fh0 + (f - 1) * fh;
          emitBox(batch, x, y + 0.1, z, bw, 0.2, 1.2, o.rot, '#4a3a2c', facadeVec(3, 3, 9, 0));
          const [rx, rz] = L2W(o, lx, -o.hd - 1.15);
          emitBox(batch, rx, y + 0.65, rz, bw, 0.9, 0.08, o.rot, '#5b4330', facadeVec(3, 3, 9, 0));
        }
      }
      // cornice & string course
      emitPrism(batch, offsetPoly(poly, 0.35), H - 0.35, H, trim, facadeVec(3, 3, 6, seed), { top: true, bottom: true });
      emitPrism(batch, offsetPoly(poly, 0.15), fh0 - 0.2, fh0, trim, facadeVec(3, 3, 6, seed), { top: false, bottom: true });
      if (!hip) roofClutter(batch, o, H, rnd, R, pick, '#b8b0a0');
    }
    acBoxes(batch, o, H, fh, rnd, R, 1 + Math.floor(rnd() * 5));
    return { collHd: o.hd };
  },

  modern(batch, o, rnd, R, pick, ctx, signs) {
    const floors = o.spec.floors || Math.round(R(6, 11));
    const fh = 3.1, H = floors * fh + 0.4; o.H = H;
    const col = pick(MODERN_COLS);
    const seed = rnd();
    const poly = rectPoly(o.cx, o.cz, o.hw, o.hd, o.rot);
    const ribbon = rnd() < 0.55;
    const shops = o.frontage && rnd() < 0.6;
    emitPrism(batch, poly, 0, H + 1.0, col, facadeVec(ribbon ? 3 : 2.4, fh, (shops ? 10 : 0) + (ribbon ? 3 : 5), seed), { top: false, bay: 3 });
    parapetAndRoof(batch, poly, H, 1.0, '#76726a', col, seed);
    // floor slab edges (balcony bands) every floor
    if (rnd() < 0.6) for (let f = 1; f < floors; f += 1) emitPrism(batch, offsetPoly(poly, 0.45), f * fh - 0.12, f * fh + 0.08, new THREE.Color(col).multiplyScalar(1.08).getStyle(), facadeVec(3, 3, 0, seed), { top: true, bottom: true, smoothAngle: 0 });
    if (shops) shopSigns(batch, o, fh * 0.9, rnd, R, signs, 0, 2 * o.hw);
    roofClutter(batch, o, H, rnd, R, pick, '#a8a49a');
    acBoxes(batch, o, H, fh, rnd, R, 2 + Math.floor(rnd() * 5));
  },

  tower(batch, o, rnd, R, pick, ctx) {
    const floors = o.spec.floors || 20;
    const fh = 3.4, H = floors * fh; o.H = H;
    const col = pick(TOWER_COLS), seed = rnd();
    const hw = Math.min(o.hw, 15), hd = Math.min(o.hd, 15);
    const poly = rectPoly(o.cx, o.cz, hw, hd, o.rot);
    const glass = rnd() < 0.55;
    // podium
    emitPrism(batch, rectPoly(o.cx, o.cz, o.hw, o.hd, o.rot), 0, 7, '#9c958a', facadeVec(4, 3.5, 13, seed), { top: true, bay: 4 });
    emitPrism(batch, poly, 7, H, col, facadeVec(glass ? 1.5 : 2.6, fh, glass ? 4 : 3, seed), { top: false, bay: 3 });
    parapetAndRoof(batch, poly, H, 1.6, '#555', col, seed);
    emitBox(batch, o.cx, H + 3, o.cz, hw * 0.9, 6, hd * 0.9, o.rot, col, facadeVec(3, 3, 0, seed));
    ctx.glows.add(o.cx, H + 6.5, o.cz, '#ff2a1a', 1.2, 1, 2.5);
  },

  chawl(batch, o, rnd, R, pick, ctx, signs) {
    const floors = o.spec.floors || 3;
    const fh = 3.0, H = floors * fh; o.H = H;
    const col = pick(['#c8b89a', '#b6a891', '#cbb08a', '#9fb0a8', '#c49c84', '#d0c4ac']);
    const seed = rnd();
    const poly = rectPoly(o.cx, o.cz, o.hw, o.hd, o.rot);
    emitPrism(batch, poly, 0, H, col, facadeVec(2.2, fh, (o.frontage ? 10 : 0) + 5, seed), { top: false, bay: 2.2 });
    hipRoof(batch, o, poly, H, rnd() < 0.7 ? '#8e4a32' : '#5d5a55', seed);
    // long verandah band
    emitPrism(batch, offsetPoly(poly, 0.6), fh - 0.1, fh + 0.1, '#7a6a58', facadeVec(3, 3, 0, seed), { top: true, bottom: true, smoothAngle: 0 });
    if (o.frontage) shopSigns(batch, o, fh * 0.85, rnd, R, signs, 0, 2 * o.hw);
  },
};

function shopSigns(batch, o, y, rnd, R, signs, cx, width) {
  const n = Math.max(1, Math.floor(width / 7));
  for (let k = 0; k < n; k++) {
    if (rnd() < 0.2) continue;
    const lx = cx - width / 2 + width * ((k + 0.5) / n);
    const [x, z] = L2W(o, lx, -o.hd - 0.12);
    emitSign(batch, x, y, z, Math.min(5.5, width / n - 0.8), 0.8, o.front[0], o.front[1], signs.shopUV[Math.floor(rnd() * signs.shopUV.length)]);
  }
}

function hipRoof(batch, o, poly, H, color, seed) {
  // ridge along the long axis, pitch ~30°
  const long = o.hw >= o.hd;
  const a = long ? o.hw : o.hd, b = long ? o.hd : o.hw;
  const rise = Math.min(b * 0.6, 4.5);
  const ov = 0.5;
  const A = a + ov, B = b + ov;
  const ridge = Math.max(0.1, A - B);
  const P = (u, v, y) => { const lx = long ? u : v, lz = long ? v : u; const [x, z] = L2W(o, lx, lz); return [x, y, z]; };
  const c = [P(-A, -B, H), P(A, -B, H), P(A, B, H), P(-A, B, H)];
  const r0 = P(-ridge, 0, H + rise), r1 = P(ridge, 0, H + rise);
  const tris = [[c[0], c[1], r1, r0], [c[1], c[2], r1], [c[2], c[3], r0, r1], [c[3], c[0], r0]];
  const pos = [], nrm = [], uv = [], idx = [];
  for (const f of tris) {
    const b0 = pos.length / 3;
    const v1 = new THREE.Vector3(...f[1]).sub(new THREE.Vector3(...f[0])), v2 = new THREE.Vector3(...f[2]).sub(new THREE.Vector3(...f[0]));
    const n = new THREE.Vector3().crossVectors(v1, v2).normalize();
    let flip = n.y < 0; if (flip) n.negate();
    const tx = -n.z, tz = n.x, tl = Math.hypot(tx, tz) || 1;
    for (const p of f) { pos.push(...p); nrm.push(n.x, n.y, n.z); uv.push((p[0] * tx + p[2] * tz) / tl, p[1] * 2.0 + (p[0] * n.x + p[2] * n.z) * 1.0); }
    const q = f.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (let i = 0; i < q.length; i += 3) { if (flip) idx.push(b0 + q[i], b0 + q[i + 2], b0 + q[i + 1]); else idx.push(b0 + q[i], b0 + q[i + 1], b0 + q[i + 2]); }
  }
  batch.addRaw('facade', pos, nrm, uv, idx, { color, facade: facadeVec(3, 3, 7, seed) });
}

export { facadeVec, L2W };
