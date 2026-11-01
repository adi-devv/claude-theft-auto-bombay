// Landmarks + roundabout monuments + Horniman Circle ring buildings + Kala Ghoda plaza.
// Everything merges into the shared 'facade' batch (procedural windows; flag 1 = warm floodlight at night,
// flag 2 = CST colour-cycling illumination). Must run BEFORE generateBuildings: it fills ctx.keepOut.
import * as THREE from 'three';
import { mat, PRIM, roundRectPoly } from './geom.js';
import { emitPrism, emitBox, emitSign, facadeVec } from './buildings.js';

// unit gable prism: base y=0 (x,z in -0.5..0.5), ridge along X at y=1
const GABLE = (() => {
  const g = new THREE.BufferGeometry();
  const A = [-0.5, 0, -0.5], B = [-0.5, 0, 0.5], C = [-0.5, 1, 0], D = [0.5, 0, -0.5], E = [0.5, 0, 0.5], F = [0.5, 1, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute([A, B, C, D, F, E, B, E, F, B, F, C, A, C, F, A, F, D].flat(), 3));
  g.computeVertexNormals();
  return g;
})();
const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);

const ROOF_SLATE = '#5f6266', ROOF_RED = '#9c4a32', WHITE = '#e9e5da';
const fRoof = (s = 0.3) => [3, 3, 7, s];
const fSmooth = (s = 0.2) => [3, 3, 9, s];
const fAsh = (s = 0.4, fl = 1) => facadeVec(3, 3, 6, s, fl);
const fGoth = (s = 0.5, fl = 1, fh = 5, bay = 3.4) => facadeVec(bay, fh, 2, s, fl);

class Frame {
  constructor(ctx, cx, cz, rot, tag) {
    this.ctx = ctx; this.cx = cx; this.cz = cz; this.rot = rot; this.c = Math.cos(rot); this.s = Math.sin(rot); this.tag = tag;
  }
  P(lx, lz) { return [this.cx + this.c * lx + this.s * lz, this.cz - this.s * lx + this.c * lz]; }
  L(x, z) { const dx = x - this.cx, dz = z - this.cz; return [this.c * dx - this.s * dz, this.s * dx + this.c * dz]; }
  box(lx, lz, w, d, y0, h, col, fac, ry = 0) { const [x, z] = this.P(lx, lz); emitBox(this.ctx.batch, x, y0 + h / 2, z, w, h, d, this.rot + ry, col, fac); }
  gable(lx, lz, w, d, y0, h, col, fac = fRoof(), ry = 0) { const [x, z] = this.P(lx, lz); this.ctx.batch.add('facade', GABLE, mat(x, y0, z, this.rot + ry, w, h, d), { color: col, facade: fac }); }
  pyr(lx, lz, w, d, y0, h, col, fac = fRoof()) { const [x, z] = this.P(lx, lz); this.ctx.batch.add('facade', PRIM.pyr4, mat(x, y0 + h / 2, z, this.rot, w, h, d), { color: col, facade: fac }); }
  cyl(geo, lx, lz, r, y0, h, col, fac = fSmooth(), rx = 0) { const [x, z] = this.P(lx, lz); this.ctx.batch.add('facade', geo, mat(x, y0 + h / 2, z, this.rot, r * 2, h, r * 2, rx), { color: col, facade: fac }); }
  cone(lx, lz, r, y0, h, col, fac = fSmooth(), geo = PRIM.cone8) { this.cyl(geo, lx, lz, r, y0, h, col, fac); }
  dome(geo, lx, lz, r, y0, h, col, fac = fSmooth()) {
    const [x, z] = this.P(lx, lz); const sy = geo === PRIM.dome ? h * 2 : geo === PRIM.sphere ? h : h;
    const yc = geo === PRIM.sphere ? y0 + h / 2 : y0;
    this.ctx.batch.add('facade', geo, mat(x, yc, z, this.rot, r * 2, sy, r * 2), { color: col, facade: fac });
  }
  col(lx, lz, w, d, h = 20, ry = 0) { const [x, z] = this.P(lx, lz); this.ctx.game.collision.addBox(x, z, w / 2, d / 2, this.rot + ry, { tag: 'landmark', id: this.tag, h }); }
  circ(lx, lz, r, h = 5) { const [x, z] = this.P(lx, lz); this.ctx.game.collision.addCircle(x, z, r, { tag: 'landmark', id: this.tag, h }); }
  keep(lx, lz, w, d) { const [x, z] = this.P(lx, lz); (this.ctx.keepOut ||= []).push({ cx: x, cz: z, hw: w / 2, hd: d / 2, rot: this.rot }); }
  sign(lx, lz, y, w, h, name, side = 0) {
    const sg = this.ctx.mats.signs; const i = sg.bigIndex[name]; if (i === undefined) return;
    const a = this.rot + side * Math.PI / 2; const [x, z] = this.P(lx, lz);
    emitSign(this.ctx.batch, x, y, z, w, h, Math.sin(a), Math.cos(a), sg.bigUV[i]);
  }
  glow(lx, y, lz, color, size = 3, kind = 2, minPx = 2) { const [x, z] = this.P(lx, lz); this.ctx.glows.add(x, y, z, color, size, kind, minPx); }
  lit(lx, y, lz, w, h, d, color) { const [x, z] = this.P(lx, lz); this.ctx.batch.add('glow', PRIM.box, mat(x, y, z, this.rot, w, h, d), { color }); }
}

/** Victorian-Gothic block: body, string course, steep gable roof, front dormer gables, corner pinnacles, collider. */
function gblock(F, lx, lz, w, d, h, o = {}) {
  const wall = o.wall || '#b8a07c', trim = o.trim || '#d8c8a4', roof = o.roof || ROOF_SLATE;
  F.box(lx, lz, w, d, 0, h, wall, o.fac || fGoth(o.seed ?? 0.3, o.flags ?? 1, o.fh || 5));
  F.box(lx, lz, w + 0.7, d + 0.7, h - 0.7, 0.7, trim, fAsh(0.2, o.flags ?? 1));
  if (o.band) F.box(lx, lz, w + 0.4, d + 0.4, o.band, 0.5, trim, fAsh(0.3, o.flags ?? 1));
  const rh = o.rh ?? Math.min(w, d) * 0.42;
  if (rh > 0) {
    if (o.hip) F.pyr(lx, lz, w, d, h, rh, roof);
    else if (w >= d) F.gable(lx, lz, w - 0.2, d, h, rh, roof);
    else F.gable(lx, lz, d - 0.2, w, h, rh, roof, fRoof(), Math.PI / 2);
  }
  const nd = o.dormers || 0;
  for (let i = 0; i < nd; i++) {
    const x = lx - w / 2 + (i + 0.5) * (w / nd);
    F.box(x, lz + d / 2 - 0.6, 4.4, 1.6, h - 0.7, 2.8, wall, fAsh(0.5, o.flags ?? 1));
    F.gable(x, lz + d / 2 - 1.8, 4.2, 4.6, h + 2.1, 3.2, roof, fRoof(), Math.PI / 2);
  }
  if (o.pinn) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.cone(lx + sx * (w / 2 - 0.3), lz + sz * (d / 2 - 0.3), 0.55, h, 3.2, trim, fSmooth(), PRIM.cone4);
  if (o.collide !== false) F.col(lx, lz, w, d, h);
}
/** Square tower with stages, optional pyramid/spire/dome top. */
function tower(F, lx, lz, s, y0, h, o = {}) {
  const wall = o.wall || '#b8a07c', trim = o.trim || '#d8c8a4';
  F.box(lx, lz, s, s, y0, h - y0, wall, o.fac || fGoth(o.seed ?? 0.6, o.flags ?? 1, o.fh || 5, s / 2));
  F.box(lx, lz, s + 0.8, s + 0.8, h - 0.8, 0.8, trim, fAsh(0.2, o.flags ?? 1));
  if (o.pinn !== false) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.cone(lx + sx * s / 2, lz + sz * s / 2, 0.6, h, 3.4, trim, fSmooth(), PRIM.cone4);
  if (o.top === 'pyr') F.pyr(lx, lz, s * 0.98, s * 0.98, h, o.th ?? s * 1.3, o.roof || ROOF_SLATE);
  if (o.top === 'dome') { F.cyl(PRIM.cyl8, lx, lz, s * 0.42, h, s * 0.35, wall, fAsh()); F.dome(PRIM.ribDome, lx, lz, s * 0.45, h + s * 0.35, o.th ?? s * 0.8, o.roof || '#9a8f78'); }
  if (o.top === 'onion') { F.cyl(PRIM.cyl8, lx, lz, s * 0.4, h, s * 0.4, wall, fAsh()); F.dome(PRIM.onion, lx, lz, s * 0.42, h + s * 0.4, o.th ?? s * 0.9, o.roof || '#9a8f78'); }
  if (o.collide !== false && y0 < 1) F.col(lx, lz, s, s, h);
}

export function buildLandmarks(game, ctx) {
  const { roads, collision } = game;
  const { batch, fields, glows } = ctx;
  ctx.keepOut ||= [];
  const byId = Object.fromEntries(roads.landmarks.map((l) => [l.id, l]));
  // facing: toward nearest road, snapped to the cardinal axis
  function frameFor(l, forceRot) {
    let rot = forceRot;
    if (rot === undefined) {
      const n = roads.nearest(l.x, l.z, 160);
      const dx = n ? n.x - l.x : 0, dz = n ? n.z - l.z : 1;
      rot = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
    }
    const F = new Frame(ctx, l.x, l.z, rot, l.id);
    const side = Math.abs(Math.sin(rot)) > 0.5;
    F.W = side ? l.d : l.w; F.D = side ? l.w : l.d;
    return F;
  }
  const B = {};

  // ---------------- Gateway of India: yellow basalt triumphal arch facing the harbour (east)
  B.gateway = () => {
    const F = frameFor(byId.gateway, Math.PI / 2), C = '#c9a46a', T = '#d9bb84', fa = fAsh(0.7, 1);
    F.box(0, 0, 34, 24, 0, 0.35, '#a99a86', fAsh(0.1, 0));               // plinth
    for (const s of [-1, 1]) {
      F.box(s * 9.5, 0, 10, 16, 0, 19, C, fa);                              // piers / side halls
      F.box(s * 5.2, 0, 1.4, 17, 0, 18, T, fa);                              // arch jambs
      F.box(s * 9.5, 0, 10.6, 16.6, 18.4, 0.8, T, fa);                       // cornice
      F.col(s * 9.5, 0, 10, 16, 20); F.col(s * 5.2, 0, 1.4, 17, 20);
      // perforated jali screens + small arches on side halls (dark recess)
      F.box(s * 9.5, 8.01, 5, 0.2, 3, 9, '#5d4a33', fSmooth(0.1));
      F.box(s * 9.5, -8.01, 5, 0.2, 3, 9, '#5d4a33', fSmooth(0.1));
      // corner turrets with domed caps
      for (const zz of [-1, 1]) {
        F.cyl(PRIM.cyl8, s * 13.4, zz * 7.0, 1.6, 0, 23.5, T, fa);
        F.dome(PRIM.dome, s * 13.4, zz * 7.0, 1.9, 23.5, 1.9, T);
        F.cone(s * 13.4, zz * 7.0, 0.25, 25.3, 2, T);
      }
    }
    F.box(0, 0, 9.0, 16, 15.5, 5.5, C, fa);                                  // arch head
    F.box(0, 0, 21, 17, 21, 3.5, T, fa);                                     // attic over the arch
    F.box(0, 0, 29.5, 17.5, 24.3, 0.8, T, fa);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                    // four crowning turrets
      F.cyl(PRIM.cyl8, sx * 8.5, sz * 6.6, 1.9, 24.5, 6, C, fa);
      F.dome(PRIM.ribDome, sx * 8.5, sz * 6.6, 2.1, 30.5, 3.4, T);
      F.cone(sx * 8.5, sz * 6.6, 0.22, 33.6, 1.8, T);
    }
    F.dome(PRIM.dome, 0, 0, 7.5, 24.8, 3.2, T);                               // low central dome
    // arch soffit (curved) as half-cylinder across the passage
    for (const s of [-1, 1]) { const [x, z] = F.P(s * 4.5, 0); batch.add('facade', PRIM.box, mat(x, 15.5, z, F.rot, 3.2, 3.2, 16.2, 0, Math.PI / 4), { color: C, facade: fa }); }
    F.keep(-22, 0, 50, 64);                                                  // plaza (landward)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.glow(sx * 14, 1.2, sz * 11, '#ffd9a0', 2.6, 2);
  };

  // ---------------- Taj Mahal Palace: red domes, corner towers, central great dome
  B.taj = () => {
    const F = frameFor(byId.taj, Math.PI), W = F.W, D = F.D, S = '#cbb593', T = '#e2d4b4', R = '#a2482f';
    const fa = fGoth(0.45, 1, 4.6, 3.2);
    F.box(0, D / 2 - 9, W - 4, 17, 0, 30, S, fa); F.col(0, D / 2 - 9, W - 4, 17, 30);
    for (const s of [-1, 1]) { F.box(s * (W / 2 - 11), -6, 18, D - 18, 0, 28, S, fa); F.col(s * (W / 2 - 11), -6, 18, D - 18, 28); }
    F.box(0, -D / 2 + 7, W - 40, 12, 0, 22, S, fa); F.col(0, -D / 2 + 7, W - 40, 12, 22);
    F.box(0, D / 2 - 9, W - 3, 17.8, 29.2, 0.8, T, fAsh(0.2));
    for (const s of [-1, 1]) F.box(s * (W / 2 - 11), -6, 18.8, D - 17, 27.2, 0.8, T, fAsh(0.2));
    // hipped red roofs
    F.pyr(0, D / 2 - 9, W - 6, 15, 30, 5, R); for (const s of [-1, 1]) F.pyr(s * (W / 2 - 11), -6, 16, D - 20, 28, 5, R);
    // central dome on drum
    F.box(0, D / 2 - 9, 20, 18.5, 30, 6, S, fa);
    F.cyl(PRIM.cyl16, 0, D / 2 - 9, 8, 36, 4, T, fAsh(0.3));
    F.dome(PRIM.ribDome, 0, D / 2 - 9, 9, 40, 13, R);
    F.cyl(PRIM.cyl8, 0, D / 2 - 9, 1.2, 53, 2.5, T); F.cone(0, D / 2 - 9, 0.5, 55.5, 2.5, T);
    // corner towers
    const tw = [[-(W / 2 - 4), D / 2 - 4], [W / 2 - 4, D / 2 - 4], [-(W / 2 - 4), -D / 2 + 5], [W / 2 - 4, -D / 2 + 5], [-11, D / 2 - 2], [11, D / 2 - 2]];
    tw.forEach(([x, z], i) => {
      const h = i < 4 ? 35 : 32, s = i < 4 ? 8 : 6;
      F.box(x, z, s, s, 0, h, S, fa); F.box(x, z, s + 0.8, s + 0.8, h - 0.8, 0.8, T, fAsh(0.2));
      F.cyl(PRIM.cyl8, x, z, s * 0.4, h, 1.6, T, fAsh(0.3)); F.dome(PRIM.ribDome, x, z, s * 0.46, h + 1.6, s * 0.95, R);
      F.cone(x, z, 0.3, h + 1.6 + s * 0.95, 1.6, T); F.col(x, z, s, s, h);
    });
    // gables along the front roofline
    for (let i = -3; i <= 3; i++) if (Math.abs(i) > 0) F.gable(i * 9, D / 2 - 1.4, 3.2, 4.4, 30, 3, R, fRoof(), Math.PI / 2);
    F.sign(0, D / 2 + 0.05, 5, 6, 1.6, 'TAJ');
    F.lit(0, 2.2, D / 2 + 0.06, 8, 3.6, 0.1, '#ffcf8a');
  };

  // ---------------- Bombay High Court: long blue-grey basalt Gothic range, central tower
  B.highcourt = () => {
    const F = frameFor(byId.highcourt, -Math.PI / 2), W = F.W, D = F.D, o = { wall: '#8e8a7f', trim: '#cdb88f', dormers: 9, pinn: true, fh: 5.5, seed: 0.21 };
    gblock(F, 0, D / 2 - 12, W - 2, 22, 24, o);
    gblock(F, 0, -D / 2 + 10, W - 14, 18, 20, { ...o, dormers: 0, seed: 0.37 });
    for (const s of [-1, 1]) gblock(F, s * (W / 2 - 8), -2, 14, D - 26, 22, { ...o, dormers: 0, seed: 0.5 });
    tower(F, 0, D / 2 - 12, 13, 0, 44, { wall: '#8e8a7f', trim: '#cdb88f', top: 'pyr', th: 17 });
    for (const s of [-1, 1]) {
      F.cyl(PRIM.cyl8, s * 9, D / 2 - 0.5, 2.6, 0, 33, '#8e8a7f', fGoth(0.7, 1, 5.5, 2.5)); F.cone(s * 9, D / 2 - 0.5, 2.8, 33, 7, ROOF_SLATE); F.circ(s * 9, D / 2 - 0.5, 2.7, 30);
    }
  };

  // ---------------- University + Rajabai Clock Tower (~85 m)
  B.university = () => {
    const l = byId.university, F = frameFor(l, -Math.PI / 2), W = F.W, D = F.D;
    const o = { wall: '#c3a676', trim: '#e4d4ae', roof: '#6b6a64', pinn: true, seed: 0.62 };
    const [tx, tz] = F.L(l.tower.x, l.tower.z);
    gblock(F, tx + 22, tz, 34, 16, 18, { ...o, dormers: 5 });                // library wing
    gblock(F, tx - 20, tz, 26, 16, 18, { ...o, dormers: 3 });
    gblock(F, -W / 2 + 26, -D / 2 + 22, 20, 38, 21, { ...o, rh: 12 });       // convocation hall
    F.cyl(PRIM.cyl8, -W / 2 + 26, -D / 2 + 3, 5, 0, 18, o.wall, fGoth(0.4, 1, 6, 2.5)); F.cone(-W / 2 + 26, -D / 2 + 3, 5.2, 18, 9, o.roof);
    // tower stages
    const c = '#c8aa78', t = o.trim;
    F.box(tx, tz, 12, 12, 0, 30, c, fGoth(0.8, 1, 6, 3)); F.col(tx, tz, 12, 12, 85);
    F.box(tx, tz, 12.8, 12.8, 29, 1, t, fAsh(0.2));
    F.box(tx, tz, 10, 10, 30, 22, c, fGoth(0.9, 1, 7, 2.5));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      F.box(tx + sx * 5.6, tz + sz * 5.6, 1.6, 1.6, 0, 52, t, fAsh(0.5));
      F.cone(tx + sx * 5.6, tz + sz * 5.6, 0.9, 52, 5, t, fSmooth(), PRIM.cone4);
    }
    F.box(tx, tz, 11, 11, 51.5, 1, t, fAsh(0.2));
    F.cyl(PRIM.cyl8, tx, tz, 4.2, 52.5, 13, c, fGoth(0.3, 1, 6.5, 2));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; F.lit(tx + Math.sin(a) * 5.05, 46, tz + Math.cos(a) * 5.05, i % 2 ? 0.1 : 3.4, 3.4, i % 2 ? 3.4 : 0.1, '#f4ecd2'); }
    F.cyl(PRIM.cyl8, tx, tz, 4.6, 65.5, 1, t, fAsh(0.2));
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; F.cone(tx + Math.sin(a) * 4.3, tz + Math.cos(a) * 4.3, 0.4, 66.5, 3.5, t, fSmooth(), PRIM.cone4); }
    F.cyl(PRIM.cyl8, tx, tz, 2.6, 66.5, 6, c, fGoth(0.5, 1, 6, 1.5));
    F.cone(tx, tz, 2.9, 72.5, 12.5, '#8f8a7e', fRoof());
    F.glow(tx, 85.4, tz, '#ff3b2e', 1.6, 1, 1.5);
  };

  // ---------------- Old Secretariat: arcaded Gothic with tall central gable tower
  B.secretariat = () => {
    const F = frameFor(byId.secretariat, -Math.PI / 2), W = F.W, D = F.D;
    const o = { wall: '#b5a184', trim: '#ddd0b4', dormers: 6, pinn: true, fac: facadeVec(3.4, 5, 22, 0.13, 1), seed: 0.13 };
    gblock(F, 0, D / 2 - 11, W - 2, 20, 22, o);
    for (const s of [-1, 1]) gblock(F, s * (W / 2 - 8), -8, 14, D - 20, 20, { ...o, dormers: 0, fac: undefined });
    tower(F, 0, D / 2 - 11, 12, 0, 38, { wall: '#b5a184', trim: '#ddd0b4', top: 'pyr', th: 12 });
  };

  B.davidsassoon = () => {
    const F = frameFor(byId.davidsassoon), W = F.W, D = F.D, o = { wall: '#c9ab70', trim: '#eadab0', dormers: 4, pinn: true, seed: 0.33, fh: 5 };
    gblock(F, 0, D / 2 - 9, W - 2, 16, 16, o);
    gblock(F, 0, -D / 2 + 6, W - 10, 10, 13, { ...o, dormers: 0 });
    tower(F, 0, D / 2 - 7, 7.5, 0, 30, { wall: '#c9ab70', trim: '#eadab0', top: 'pyr', th: 8 });
    F.lit(0, 23.5, D / 2 - 3.2, 2.2, 2.2, 0.1, '#f4ecd2');
  };
  B.elphinstone = () => {
    const F = frameFor(byId.elphinstone), W = F.W, D = F.D, o = { wall: '#8d8e88', trim: '#d6c294', dormers: 5, pinn: true, seed: 0.44, fh: 5.5 };
    gblock(F, 0, D / 2 - 9, W - 2, 16, 20, o);
    for (const s of [-1, 1]) gblock(F, s * (W / 2 - 7), -8, 12, D - 18, 18, { ...o, dormers: 0 });
    tower(F, 0, D / 2 - 8, 9, 0, 33, { wall: '#8d8e88', trim: '#d6c294', top: 'pyr', th: 10 });
  };

  // ---------------- Prince of Wales Museum (CSMVS): Indo-Saracenic, great white dome
  B.csmvs = () => {
    const F = frameFor(byId.csmvs), W = F.W, D = F.D, S = '#b9b2a1', Y = '#d7c69e', Dm = '#e4e0d4';
    F.box(0, 0, W - 4, D - 6, 0, 15, S, fGoth(0.55, 1, 7.5, 3.6)); F.col(0, 0, W - 4, D - 6, 15);
    F.box(0, 0, W - 3, D - 5, 14.3, 0.8, Y, fAsh(0.2));
    F.box(0, 1.5, 20, D - 3, 0, 21, S, fGoth(0.65, 1, 7, 3.4)); F.box(0, 1.5, 21, D - 2, 20.3, 0.8, Y, fAsh());
    F.cyl(PRIM.cyl16, 0, 1.5, 8.2, 21, 4.5, Y, fGoth(0.2, 1, 4.5, 2));
    F.dome(PRIM.ribDome, 0, 1.5, 9.4, 25.5, 14, Dm);
    F.cyl(PRIM.cyl8, 0, 1.5, 0.9, 39.5, 1.6, Y); F.cone(0, 1.5, 0.5, 41, 2.6, Y);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * (W / 2 - 6), z = sz * (D / 2 - 6);
      F.box(x, z, 9, 9, 0, 18, S, fGoth(0.3, 1, 6, 3)); F.box(x, z, 9.8, 9.8, 17.3, 0.7, Y, fAsh());
      F.dome(PRIM.ribDome, x, z, 3.6, 18, 5, Dm); F.cone(x, z, 0.3, 23, 1.6, Y);
    }
    for (let i = -2; i <= 2; i++) if (i) F.dome(PRIM.dome, i * 9, D / 2 - 3.5, 1.4, 15, 1.4, Dm);
    F.keep(0, D / 2 + 10, W, 18); // front garden
  };
  B.jehangir = () => {
    const F = frameFor(byId.jehangir), W = F.W, D = F.D, C = '#a49c8e';
    F.box(0, 0, W - 2, D - 2, 0, 9, C, facadeVec(4, 4.5, 3, 0.2, 0)); F.col(0, 0, W - 2, D - 2, 9);
    F.box(0, 0, W - 1.2, D - 1.2, 8.6, 0.6, '#c9c2b4', fSmooth());
    F.box(4, -2, 12, 10, 9, 3, C, fSmooth());
    F.sign(0, D / 2 - 0.9, 6.6, 12, 1.2, 'JEHANGIR ART GALLERY');
  };
  // ---------------- Regal Cinema: Art Deco, stepped tower, REGAL sign
  B.regal = () => {
    const F = frameFor(byId.regal), W = F.W, D = F.D, C = '#e5cfb0', T = '#c46f52';
    F.box(0, 0, W - 2, D - 2, 0, 16, C, facadeVec(3.2, 4, 11, 0.25, 0)); F.col(0, 0, W - 2, D - 2, 16);
    F.box(0, 0, W - 1, D - 1, 0, 3.6, T, fSmooth(0.3));
    for (let i = 0; i < 3; i++) F.box(0, D / 2 - 5, 14 - i * 3.4, 8 - i * 1.5, 16 + i * 3.5, 3.5, C, fSmooth(0.4));
    F.box(0, D / 2 - 0.6, 0.9, 1.4, 16, 12, T, fSmooth());
    F.sign(0, D / 2 - 0.4, 12.6, 15, 3.6, 'REGAL');
    F.box(0, D / 2 + 0.6, W - 6, 2.2, 4.2, 0.35, '#3c3a38', fSmooth()); // marquee canopy
    F.lit(0, 4.05, D / 2 + 0.6, W - 7, 0.05, 2, '#ffe2a6');
  };

  // ---------------- CST: U-plan Gothic, great central dome with statue, forecourt
  B.cst = () => {
    const F = frameFor(byId.cst), W = F.W, D = F.D, S = '#c6a476', T = '#e6d2a8', Rf = '#6e7b72', Dm = '#a28a66';
    const fa = fGoth(0.71, 1 | 2, 6, 3.2), o = { wall: S, trim: T, roof: Rf, pinn: true, fac: fa, flags: 3 };
    const cz = -D / 2 + 14;
    gblock(F, 0, cz, 34, 26, 28, { ...o, dormers: 4 });
    for (const s of [-1, 1]) {
      gblock(F, s * (W / 2 - 22), cz - 2, 30, 20, 25, { ...o, dormers: 3 });
      gblock(F, s * (W / 2 - 8), 2, 16, D - 4, 25, { ...o, dormers: 0 });
      gblock(F, s * (W / 2 - 8), D / 2 - 6, 18, 10, 30, { ...o, dormers: 2, rh: 0 });
      F.cyl(PRIM.cyl8, s * (W / 2 - 8), D / 2 - 6, 3.6, 30, 3.5, S, fa); F.dome(PRIM.onion, s * (W / 2 - 8), D / 2 - 6, 3.8, 33.5, 8, Dm);
      for (const sx of [-1, 1]) { F.cyl(PRIM.cyl8, s * (W / 2 - 8) + sx * 8.5, D / 2 - 1.5, 1.3, 0, 33, T, fa); F.cone(s * (W / 2 - 8) + sx * 8.5, D / 2 - 1.5, 1.4, 33, 4, Rf); }
    }
    F.cyl(PRIM.cyl8, 0, cz, 9.5, 28, 9, S, fGoth(0.3, 3, 4.5, 2.5));
    F.cyl(PRIM.cyl8, 0, cz, 10.2, 36.5, 0.9, T, fAsh(0.2, 3));
    F.dome(PRIM.ribDome, 0, cz, 10.5, 37.4, 17, Dm, fSmooth(0.2));
    F.cyl(PRIM.cyl8, 0, cz, 1.2, 54.4, 2.5, T); F.cyl(PRIM.cyl8, 0, cz, 0.55, 56.9, 4, '#d9cfb8'); F.dome(PRIM.sphere, 0, cz, 0.7, 60.6, 1.3, '#d9cfb8');
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { F.cyl(PRIM.cyl8, sx * 16, cz + sz * 12, 1.6, 0, 34, T, fa); F.dome(PRIM.onion, sx * 16, cz + sz * 12, 1.9, 34, 4, Dm); }
    F.keep(0, D / 2 - 8, W - 34, 30); // forecourt
    F.glow(0, 61.5, cz, '#ffefc0', 3, 2);
  };

  // ---------------- BMC HQ: Gothic with 70 m central onion-domed tower
  B.bmc = () => {
    const F = frameFor(byId.bmc), W = F.W, D = F.D, S = '#b39a76', T = '#e0cfa6';
    const o = { wall: S, trim: T, roof: ROOF_SLATE, pinn: true, seed: 0.58 };
    gblock(F, 0, D / 2 - 10, W - 2, 18, 24, { ...o, dormers: 6 });
    for (const s of [-1, 1]) gblock(F, s * (W / 2 - 8), -6, 14, D - 22, 22, o);
    gblock(F, 0, -D / 2 + 8, W - 30, 14, 20, o);
    tower(F, 0, D / 2 - 10, 13, 0, 46, { wall: S, trim: T, pinn: true });
    F.cyl(PRIM.cyl8, 0, D / 2 - 10, 5.4, 46, 10, S, fGoth(0.4, 1, 5, 2));
    F.cyl(PRIM.cyl8, 0, D / 2 - 10, 5.9, 55.5, 0.8, T, fAsh());
    F.dome(PRIM.onion, 0, D / 2 - 10, 5.6, 56.3, 12, '#8f8270');
    F.cone(0, D / 2 - 10, 0.35, 68, 4, T);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.dome(PRIM.onion, sx * 5.8, D / 2 - 10 + sz * 5.8, 1.4, 46, 3.6, '#8f8270');
    F.sign(0, D / 2 - 0.9, 8.5, 22, 1.5, 'MUNICIPAL CORPORATION');
    F.glow(0, 72.2, D / 2 - 10, '#ff3b2e', 1.5, 1, 1.5);
  };
  B.policehq = () => {
    const F = frameFor(byId.policehq), W = F.W, D = F.D, o = { wall: '#8b867b', trim: '#cbb995', roof: ROOF_RED, dormers: 5, seed: 0.81, hip: true, rh: 7, flags: 0 };
    gblock(F, 0, D / 2 - 9, W - 2, 16, 17, o);
    for (const s of [-1, 1]) gblock(F, s * (W / 2 - 7), -7, 12, D - 18, 15, { ...o, dormers: 0 });
    F.sign(0, D / 2 - 0.9, 5, 12, 1.3, 'POLICE STATION');
  };
  // ---------------- Churchgate (Western Railway HQ): central domed tower, gables
  B.churchgate = () => {
    const F = frameFor(byId.churchgate), W = F.W, D = F.D, S = '#c1a984', T = '#e6d7b2';
    const o = { wall: S, trim: T, roof: '#6c6a62', pinn: true, dormers: 6, seed: 0.27 };
    gblock(F, 0, D / 2 - 11, W - 2, 20, 22, o);
    gblock(F, 0, -D / 2 + 9, W - 10, 16, 16, { ...o, dormers: 0 });
    tower(F, 0, D / 2 - 11, 12, 0, 34, { wall: S, trim: T, top: 'dome', th: 10, roof: '#8f8a7a' });
    F.cone(0, D / 2 - 11, 0.5, 48, 4, T);
    F.sign(0, D / 2 - 0.9, 6.2, 17, 2.2, 'CHURCHGATE');
  };
  // ---------------- Eros: Art Deco cinema, curved corner to the junction, cream + red sandstone
  B.eros = () => {
    const l = byId.eros, C = '#eadcc0', T = '#a65846';
    const n = roads.nodes.get('MK_VN'); const sx = Math.sign(n.x - l.x) || 1, sz = Math.sign(n.z - l.z) || -1;
    const ci = sx < 0 ? (sz < 0 ? 0 : 3) : (sz < 0 ? 1 : 2);
    const radii = [2, 2, 2, 2]; radii[ci] = 13;
    const poly = roundRectPoly(l.x, l.z, l.w / 2 - 1, l.d / 2 - 1, 0, radii, 8);
    emitPrism(batch, poly, 0, 20, C, facadeVec(3.4, 4, 11, 0.35, 0), { smoothAngle: 0.6 });
    emitPrism(batch, roundRectPoly(l.x, l.z, l.w / 2 - 0.6, l.d / 2 - 0.6, 0, radii, 8), 0, 4.2, T, fSmooth(0.5));
    emitPrism(batch, roundRectPoly(l.x, l.z, l.w / 2 - 0.5, l.d / 2 - 0.5, 0, radii, 8), 19.5, 20.4, '#f3ead6', fSmooth(0.1));
    const cx = l.x + sx * (l.w / 2 - 1 - 13 * 0.29), cz = l.z + sz * (l.d / 2 - 1 - 13 * 0.29);
    const F = new Frame(ctx, cx, cz, Math.atan2(sx, sz), 'eros');
    for (let i = 0; i < 3; i++) F.box(0, -4, 12 - i * 3, 7 - i * 1.5, 20 + i * 3.2, 3.2, C, fSmooth(0.3));
    F.box(0, 0.2, 1, 1.4, 20, 12, T, fSmooth());
    F.sign(0, 0.1, 15.5, 13, 4, 'EROS');
    collision.addBox(l.x, l.z, l.w / 2 - 1, l.d / 2 - 1, 0, { tag: 'landmark', id: 'eros', h: 20 });
  };
  // ---------------- Asiatic Society Town Hall: white neo-classical, Doric portico + grand steps facing Horniman
  B.townhall = () => {
    const F = frameFor(byId.townhall, -Math.PI / 2), W = F.W, D = F.D, Wt = '#e7e2d6';
    F.box(0, -6, W - 4, D - 14, 0, 18, Wt, facadeVec(4.5, 6, 2, 0.9, 1)); F.col(0, -6, W - 4, D - 14, 18);
    F.box(0, -6, W - 3, D - 13, 17.2, 1, '#f2eee6', fAsh(0.2));
    F.pyr(0, -6, W - 5, D - 15, 18.2, 3, '#8e8e88');
    for (let i = 0; i < 4; i++) F.box(0, D / 2 - 9 + i * 1.6 - 3.2, 40 - i * 0.6, 4, 0, 4 - i, '#d9d3c4', fAsh(0.3, 0));
    F.col(0, D / 2 - 8, 40, 8, 3);
    for (let i = 0; i < 8; i++) { const x = -16.8 + i * 4.8; F.cyl(PRIM.cyl12, x, D / 2 - 9.5, 0.95, 4, 11, Wt, fSmooth(0.1)); F.circ(x, D / 2 - 9.5, 1, 15); }
    F.box(0, D / 2 - 10, 38, 5, 15, 2.2, Wt, fAsh(0.1));
    F.gable(0, D / 2 - 10, 5, 38.5, 17.2, 4.5, Wt, fSmooth(0.1), Math.PI / 2);
  };
  // ---------------- St. Thomas Cathedral: white, gothic nave + clock tower with lantern
  B.cathedral = () => {
    const F = frameFor(byId.cathedral, Math.PI), W = F.W, D = F.D, Wt = '#ddd4c0';
    F.box(0, -3, 12, D - 12, 0, 12, Wt, fGoth(0.2, 1, 12, 3.5)); F.col(0, -3, 12, D - 12, 12);
    F.gable(0, -3, D - 12, 12.4, 12, 7, ROOF_SLATE, fRoof(), Math.PI / 2);
    for (const s of [-1, 1]) { F.box(s * 8, -3, 4.5, D - 16, 0, 7, Wt, fGoth(0.4, 1, 7, 3.5)); F.col(s * 8, -3, 4.5, D - 16, 7); }
    tower(F, 0, D / 2 - 5, 8, 0, 25, { wall: Wt, trim: '#efe8d8', pinn: true });
    F.cyl(PRIM.cyl8, 0, D / 2 - 5, 2.6, 25, 5, Wt, fGoth(0.6, 1, 5, 1.5)); F.dome(PRIM.dome, 0, D / 2 - 5, 2.8, 30, 2.4, '#6e706c');
    F.cone(0, D / 2 - 5, 0.3, 32.2, 3, '#bfb8a6');
    F.lit(0, 20, D / 2 - 0.95, 2.2, 2.2, 0.1, '#f4ecd2');
  };
  // ---------------- Air India Building (Nariman Point): tall slab, red sign
  B.airindia = () => {
    const F = frameFor(byId.airindia), W = F.W, D = F.D, C = '#d4cfc3';
    F.box(0, 0, W - 4, D - 12, 0, 78, C, facadeVec(2.4, 3.4, 3, 0.31, 0)); F.col(0, 0, W - 4, D - 12, 78);
    F.box(0, 0, W - 2, D - 4, 0, 7, '#bfb8aa', facadeVec(4, 3.5, 4, 0.2, 0)); F.col(0, 0, W - 2, D - 4, 7);
    F.box(0, 0, W - 8, D - 14, 78, 4, C, fSmooth());
    F.sign(0, D / 2 - 5.9, 74.5, 22, 4.2, 'AIR INDIA');
    F.sign(0, -D / 2 + 5.9, 74.5, 22, 4.2, 'AIR INDIA', 2);
    F.glow(W / 2 - 6, 82.3, 0, '#ff3b2e', 1.5, 1, 1.5); F.glow(-W / 2 + 6, 82.3, 0, '#ff3b2e', 1.5, 1, 1.5);
  };
  // ---------------- Hotel Marine Plaza: white curved modern hotel on Marine Drive
  B.trident = () => {
    const l = byId.trident, F = frameFor(l), W = F.W, D = F.D;
    const [ax, az] = F.P(0, 0);
    const poly = roundRectPoly(ax, az, W / 2 - 1.5, D / 2 - 2, F.rot, [2, 2, 8, 8], 6);
    emitPrism(batch, poly, 0, 33, '#ecebe5', facadeVec(2.6, 3.3, 13, 0.52, 0), { smoothAngle: 0.6 });
    emitPrism(batch, roundRectPoly(ax, az, W / 2 - 1, D / 2 - 1.5, F.rot, [2, 2, 8.5, 8.5], 6), 0, 4, '#5f7f96', facadeVec(3, 4, 4, 0.1, 0));
    F.box(0, -2, W - 10, D - 12, 33, 4, '#ecebe5', fSmooth());
    F.sign(0, D / 2 - 2.05, 35, 14, 2.4, 'MARINE PLAZA');
    F.col(0, 0, W - 3, D - 4, 33);
  };

  for (const id of Object.keys(B)) if (byId[id]) B[id]();

  // ---------------- roundabout islands + monuments
  const isl = Object.fromEntries(fields.islands.map((i) => [i.id, i]));
  const grassDisc = (x, z, r) => batch.add('grass', DISC, mat(x, 0.2, z, 0, r, 1, r), { color: '#ffffff' });
  for (const i of fields.islands) collision.addCircle(i.x, i.z, i.r - 0.3, { tag: 'island', id: i.id, h: 1 });
  if (isl.FLORA) { // Flora Fountain: ornate stone fountain, painted white figure
    const I = isl.FLORA, F = new Frame(ctx, I.x, I.z, 0, 'flora'), St = '#cfc6b2', Wt = '#f0eee6';
    F.cyl(PRIM.cyl16, 0, 0, I.r - 0.6, 0, 0.9, St, fAsh(0.3, 1));
    batch.add('facade', DISC, mat(I.x, 0.75, I.z, 0, I.r - 1.2, 1, I.r - 1.2), { color: '#3e5a60', facade: fSmooth(0.9) });
    F.cyl(PRIM.cyl8, 0, 0, 2.6, 0, 3.6, St, fAsh(0.5, 1));
    F.cyl(PRIM.cyl16, 0, 0, 3.4, 3.6, 0.6, Wt);
    F.cyl(PRIM.cyl8, 0, 0, 1.2, 4.2, 3.4, St, fAsh(0.6, 1));
    F.cyl(PRIM.cyl12, 0, 0, 1.9, 7.6, 0.45, Wt);
    F.cyl(PRIM.cyl8, 0, 0, 0.55, 8.0, 2.0, Wt); F.dome(PRIM.sphere, 0, 0, 0.36, 9.95, 0.72, Wt);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; F.cyl(PRIM.cyl8, Math.sin(a) * 2.9, Math.cos(a) * 2.9, 0.6, 0.9, 1.4, St); F.cyl(PRIM.cyl8, Math.sin(a) * 2.9, Math.cos(a) * 2.9, 0.38, 2.3, 1.7, Wt); }
    F.glow(0, 0.5, 0, '#ffe8b0', 3, 2);
  }
  if (isl.REGAL) { // Wellington Fountain: domed stone canopy in a garden
    const I = isl.REGAL, F = new Frame(ctx, I.x, I.z, 0, 'wellington'), St = '#d6cdb8';
    grassDisc(I.x, I.z, I.r - 1.6);
    F.cyl(PRIM.cyl8, 0, 0, 4.4, 0, 0.7, St, fAsh(0.2, 1));
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; F.cyl(PRIM.cyl8, Math.sin(a) * 3.4, Math.cos(a) * 3.4, 0.32, 0.7, 4, St); }
    F.cyl(PRIM.cyl8, 0, 0, 3.9, 4.7, 0.9, St, fAsh(0.4, 1));
    F.dome(PRIM.ribDome, 0, 0, 3.7, 5.6, 3.2, '#c9bfa8'); F.cone(0, 0, 0.25, 8.8, 1.6, St);
    F.cyl(PRIM.cyl12, 0, 0, 1.4, 0.7, 0.8, '#4c6b70');
    F.glow(0, 0.6, 0, '#ffe8b0', 3, 2);
  }
  if (isl.HORN) { // Horniman Circle Garden: lawn, railing, central fountain
    const I = isl.HORN, F = new Frame(ctx, I.x, I.z, 0, 'horniman');
    grassDisc(I.x, I.z, I.r - 1.5);
    railRing(ctx, I.x, I.z, I.r - 1.0, 1.25, 4);
    F.cyl(PRIM.cyl16, 0, 0, 3.4, 0, 0.7, '#cfc6b2', fAsh(0.4, 1)); F.cyl(PRIM.cyl8, 0, 0, 0.7, 0.7, 2.6, '#cfc6b2'); F.cyl(PRIM.cyl12, 0, 0, 1.5, 3.2, 0.4, '#cfc6b2');
    // paths to the gates (paving strips)
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; batch.add('paving', PRIM.box, mat(I.x + Math.sin(a) * (I.r / 2), 0.2, I.z + Math.cos(a) * (I.r / 2), a, 2.4, 0.04, I.r - 2)); }
    hornimanRing(game, ctx, I);
  }
  kalaGhoda(game, ctx);
}

/** Iron railing ring with `gaps` gates. */
export function railRing(ctx, cx, cz, r, h, gaps = 0, gapW = 3) {
  const n = Math.max(24, Math.round(r * 2)), pos = [], nrm = [], uv = [], idx = [];
  const gapA = gapW / r;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    if (gaps) { const g = am / (Math.PI * 2 / gaps); if (Math.abs(g - Math.round(g)) * (Math.PI * 2 / gaps) < gapA / 2) continue; }
    const p0 = [cx + Math.sin(a0) * r, cz + Math.cos(a0) * r], p1 = [cx + Math.sin(a1) * r, cz + Math.cos(a1) * r];
    const b = pos.length / 3, u0 = a0 * r / 2, u1 = a1 * r / 2;
    pos.push(p0[0], 0.15, p0[1], p1[0], 0.15, p1[1], p1[0], 0.15 + h, p1[1], p0[0], 0.15 + h, p0[1]);
    for (let j = 0; j < 4; j++) nrm.push(Math.sin(am), 0, Math.cos(am));
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  ctx.batch.addRaw('railing', pos, nrm, uv, idx, { at: { x: cx, z: cz } });
}

/** Curved arcaded stone buildings ringing Horniman Circle (outside the ring road, gaps at the road arms). */
function hornimanRing(game, ctx, I) {
  const { fields, batch } = ctx, col = game.collision;
  const R0 = I.rOut + 4.8, Dp = 14, ARC = 3, step = (4 * Math.PI) / 180;
  const lms = game.roads.landmarks;
  const inLm = (x, z) => lms.some((l) => Math.abs(x - l.x) < l.w / 2 + 3 && Math.abs(z - l.z) < l.d / 2 + 3);
  const ok = (x, z) => fields.sample(fields.F, x, z) >= 0.2 && fields.sample(fields.land, x, z) > 2 && fields.sample(fields.park, x, z) < -1 && !inLm(x, z);
  const N = Math.round((Math.PI * 2) / step), good = [];
  for (let k = 0; k < N; k++) {
    let g = true;
    for (const t of [0, 0.5, 1]) for (const rr of [R0 + 0.3, R0 + Dp / 2, R0 + Dp - 0.3]) {
      const a = (k + t) * step; if (!ok(I.x + Math.sin(a) * rr, I.z + Math.cos(a) * rr)) g = false;
    }
    good.push(g);
  }
  // runs (handle wrap)
  let start = good.indexOf(false); if (start < 0) start = 0;
  const runs = []; let cur = null;
  for (let j = 1; j <= N; j++) {
    const k = (start + j) % N;
    if (good[k]) { if (!cur) runs.push((cur = [])); cur.push(k); if (cur.length >= 6) cur = null; } else cur = null;
  }
  const arc = (r, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); p.push([I.x + Math.sin(a) * r, I.z + Math.cos(a) * r]); } return p; };
  const COLS = ['#cdbb98', '#c6b28c', '#d4c4a2', '#bfa984'];
  runs.forEach((run, ri) => {
    const a0 = run[0] * step, a1 = (run[run.length - 1] + 1) * step, n = run.length * 2;
    const H = 17 + (ri % 2) * 2, c = COLS[ri % COLS.length], seed = 0.1 + ri * 0.07;
    const up = [...arc(R0, a0, a1, n), ...arc(R0 + Dp, a1, a0, n)];
    const gnd = [...arc(R0 + ARC, a0, a1, n), ...arc(R0 + Dp, a1, a0, n)];
    emitPrism(batch, up, 4.6, H, c, facadeVec(3.3, 4.2, 2, seed, 1), { smoothAngle: 0.4 });
    emitPrism(batch, gnd, 0, 4.6, c, facadeVec(3.3, 4.6, 12, seed, 1), { smoothAngle: 0.4, top: false });
    emitPrism(batch, [...arc(R0 - 0.4, a0, a1, n), ...arc(R0 + Dp + 0.3, a1, a0, n)], H - 0.8, H, '#e2d6bb', fAsh(0.2, 1), { smoothAngle: 0.4 });
    emitPrism(batch, [...arc(R0 - 0.2, a0, a1, n), ...arc(R0 + 0.6, a1, a0, n)], 4.3, 4.9, '#e2d6bb', fAsh(0.2, 1), { smoothAngle: 0.4 });
    // arcade piers + soffit glow
    const L = (a1 - a0) * R0, np = Math.max(2, Math.round(L / 4));
    for (let i = 0; i <= np; i++) {
      const a = a0 + (a1 - a0) * (i / np), x = I.x + Math.sin(a) * (R0 + 0.45), z = I.z + Math.cos(a) * (R0 + 0.45);
      emitBox(batch, x, 2.3, z, 0.8, 4.6, 0.8, a, c, fAsh(seed, 1));
      col.addCircle(x, z, 0.5, { tag: 'building', h: 4.6 });
    }
    for (const p of arc(R0 + 1.5, a0 + 0.01, a1 - 0.01, run.length)) ctx.glows.add(p[0], 4.2, p[1], '#ffc98a', 1.6, 0, 1.2);
    col.addPolyline(gnd, { tag: 'building', h: H }, true, 0.3);
    for (const k of run) {
      const am = (k + 0.5) * step, rm = R0 + Dp / 2;
      ctx.keepOut.push({ cx: I.x + Math.sin(am) * rm, cz: I.z + Math.cos(am) * rm, hw: (step * (R0 + Dp)) / 2 + 0.5, hd: Dp / 2 + 0.5, rot: am });
    }
  });
  ctx.hornimanRuns = runs.length;
}

/** Kala Ghoda: black horse on a stone plinth in a small paved plaza off the junction (corners stay clear). */
function kalaGhoda(game, ctx) {
  const n = game.roads.nodes.get('KG'); if (!n) return;
  const { fields } = ctx;
  let best = null;
  for (let r = 18; r <= 40; r += 2) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, x = n.x + Math.sin(a) * r, z = n.z + Math.cos(a) * r;
    let m = Infinity;
    for (let j = 0; j < 8; j++) { const b = (j / 8) * Math.PI * 2; m = Math.min(m, fields.sample(fields.G, x + Math.sin(b) * 4.5, z + Math.cos(b) * 4.5)); }
    if (m < 0.5 || fields.sample(fields.park, x, z) > -1) continue;
    if (game.roads.landmarks.some((l) => Math.abs(x - l.x) < l.w / 2 + 6 && Math.abs(z - l.z) < l.d / 2 + 6)) continue;
    const score = -Math.abs(r - 24) * 0.5 + Math.min(m, 6);
    if (!best || score > best.score) best = { x, z, score, a };
  }
  if (!best) return;
  const nr = game.roads.nearest(best.x, best.z, 60);
  const rot = nr ? Math.atan2(nr.tx, nr.tz) : 0;
  const F = new Frame(ctx, best.x, best.z, rot, 'kalaghoda'), K = '#17181a', St = '#8f8b84';
  ctx.keepOut.push({ cx: best.x, cz: best.z, hw: 8, hd: 8, rot });
  ctx.batch.add('paving', DISC, mat(best.x, 0.17, best.z, 0, 7.5, 1, 7.5));
  F.box(0, 0, 2.6, 5.4, 0, 2.2, St, fAsh(0.3, 1)); F.box(0, 0, 3, 5.8, 2.2, 0.25, '#a8a399', fSmooth());
  const y = 2.45, s = 1.5; // horse (scaled ~1.5x life size)
  F.box(0, 0, 0.75 * s, 0.85 * s, y + 1.25 * s, 1.0 * s, K, fSmooth(0.95), 0);                     // body (along local z)
  F.box(0, 0, 0.75 * s, 2.0 * s, y + 1.3 * s, 0.8 * s, K, fSmooth(0.95));
  { const [x, z] = F.P(0, 1.15 * s); ctx.batch.add('facade', PRIM.box, mat(x, y + 2.0 * s, z, rot, 0.45 * s, 1.1 * s, 0.5 * s, -0.55), { color: K, facade: fSmooth(0.95) }); }
  { const [x, z] = F.P(0, 1.6 * s); ctx.batch.add('facade', PRIM.box, mat(x, y + 2.45 * s, z, rot, 0.36 * s, 0.38 * s, 0.85 * s, 0.35), { color: K, facade: fSmooth(0.95) }); }
  for (const [lx, lz, rx] of [[-0.25, 0.75, -0.5], [0.25, 0.8, 0], [-0.25, -0.75, 0], [0.25, -0.75, 0.15]]) {
    const [x, z] = F.P(lx * s, lz * s); ctx.batch.add('facade', PRIM.box, mat(x, y + 0.5 * s + (rx < 0 ? 0.25 * s : 0), z, rot, 0.17 * s, (rx < 0 ? 0.7 : 1.0) * s, 0.17 * s, rx), { color: K, facade: fSmooth(0.95) });
  }
  { const [x, z] = F.P(0, -1.05 * s); ctx.batch.add('facade', PRIM.box, mat(x, y + 1.0 * s, z, rot, 0.12 * s, 0.9 * s, 0.14 * s, 0.4), { color: K, facade: fSmooth(0.95) }); }
  F.col(0, 0, 3, 5.8, 3);
  F.glow(-1.8, 0.3, 0, '#ffe2b0', 2.2, 2); F.glow(1.8, 0.3, 0, '#ffe2b0', 2.2, 2);
  ctx.kalaGhoda = { x: best.x, z: best.z };
}
