// Oval, Cross and Azad maidans (grass + cricket pitches), Chowpatty beach with stalls, Wankhede stadium.
import { box, flatPoly } from '../../utils/geom.js';
import { Part, C, disc } from './kit.js';
import { MAIDANS, POS, roadClearance } from './coords.js';

function grass(out, name, m, pitches) {
  const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
  const w = m.x1 - m.x0, d = m.z1 - m.z0;
  // base + mown bands (alternating light stripes) lying just above the ground, below the roads
  const bands = Math.max(4, Math.round(w / 26));
  for (let i = 0; i < bands; i++) {
    const x0 = m.x0 + (i / bands) * w, x1 = m.x0 + ((i + 1) / bands) * w;
    out.geoms.push(flatPoly([[x0, m.z0], [x1, m.z0], [x1, m.z1], [x0, m.z1]], i % 2 ? C.grass : C.grassLight, 0.012));
  }
  // cricket pitches (clay strips 3 x 22 with creases)
  for (const [px, pz, rot] of pitches) {
    const p = new Part(out, px, pz, rot || 0);
    p.box(3.2, 0.06, 22, 0xcdb27a, 0, 0.02, 0);
    p.box(3.4, 0.07, 0.15, C.white, 0, 0.02, -9.2);
    p.box(3.4, 0.07, 0.15, C.white, 0, 0.02, 9.2);
    p.box(0.5, 0.7, 0.1, C.wood, 0, 0.02, -10.5);
    p.box(0.5, 0.7, 0.1, C.wood, 0, 0.02, 10.5);
  }
  out.footprints.push({ id: 'maidan_' + name, x: cx, z: cz, hw: w / 2, hd: d / 2, rot: 0 });
}

export function buildMaidans(out) {
  const o = MAIDANS.oval;
  const oc = [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2];
  const ovalPitches = [];
  for (const dx of [-55, 0, 55]) for (const dz of [-120, 0, 120]) ovalPitches.push([oc[0] + dx, oc[1] + dz, 0]);
  grass(out, 'oval', o, ovalPitches);
  // boundary rope hint: thin lighter outline
  const ring = (m, inset, color) => {
    const x0 = m.x0 + inset, x1 = m.x1 - inset, z0 = m.z0 + inset, z1 = m.z1 - inset, t = 0.6;
    out.geoms.push(box(x1 - x0, 0.05, t, color, (x0 + x1) / 2, 0.02, z0));
    out.geoms.push(box(x1 - x0, 0.05, t, color, (x0 + x1) / 2, 0.02, z1));
    out.geoms.push(box(t, 0.05, z1 - z0, color, x0, 0.02, (z0 + z1) / 2));
    out.geoms.push(box(t, 0.05, z1 - z0, color, x1, 0.02, (z0 + z1) / 2));
  };
  ring(o, 14, C.white);

  const c = MAIDANS.cross;
  grass(out, 'cross', c, [[-130, -300, 0], [-80, -300, 0], [-105, -260, Math.PI / 2], [-130, -230, 0]]);
  const a = MAIDANS.azad;
  // D.N. Rd and a Fort-grid street cross Azad Maidan; keep the pitches on the quiet north-west part
  grass(out, 'azad', a, [[215, -560, 0], [245, -570, 0], [275, -560, 0], [225, -510, Math.PI / 2]]);
  void roadClearance;
}

// Chowpatty beach with food stalls and umbrellas
export function buildChowpatty(out, rng) {
  const [bx, bz] = POS.CHOWPATTY;
  out.geoms.push(flatPoly([[bx - 20, bz - 58], [bx + 105, bz - 58], [bx + 105, bz + 24], [bx - 40, bz + 24]], C.sandBeach, 0.02));
  out.geoms.push(flatPoly([[bx - 20, bz - 58], [bx + 105, bz - 58], [bx + 105, bz - 54], [bx - 24, bz - 54]], C.sandWet, 0.03));
  out.footprints.push({ id: 'chowpatty_beach', x: bx + 32, z: bz - 17, hw: 72, hd: 41, rot: 0 });

  const colors = [0xd4503c, 0x2a8fb0, 0xe0b04a, 0x6aa84f, 0xc060a0, 0xf08a3a];
  for (let i = 0; i < 8; i++) {
    const x = bx - 10 + i * 12 + rng() * 3;
    const z = bz + 6 + (i % 2) * 5;
    const col = colors[i % colors.length];
    const s = new Part(out, x, z, (rng() - 0.5) * 0.3);
    s.box(3.4, 1.2, 1.8, C.wood, 0, 0, 0);
    s.box(3.6, 0.2, 2.0, C.white, 0, 1.2, 0);
    for (const px of [-1.6, 1.6]) s.box(0.12, 2.5, 0.12, C.dark, px, 0, 0.8);
    s.prism(3.9, 0.9, 2.6, col, 0, 2.5, 0.2, 0); // striped awning ridge
    s.box(1.2, 0.5, 0.6, 0xe7c15a, 0.8, 1.4, 0);
    s.col(0, 0, 1.8, 1.0);
  }
  for (let i = 0; i < 12; i++) {
    const x = bx + 10 + (i % 6) * 14 + rng() * 5;
    const z = bz - 30 + Math.floor(i / 6) * 16 + rng() * 5;
    const u = new Part(out, x, z, 0);
    u.cyl(0.07, 0.07, 2.4, 5, C.dark, 0, 0, 0);
    u.cone(1.9, 0.9, 8, colors[(i * 2) % colors.length], 0, 2.2, 0);
    u.box(1.6, 0.1, 0.5, 0xe6e0d0, 1.6, 0.05, 1.4); // towel
  }
  out.pois.push({ id: 'chowpatty', name: 'Chowpatty Beach', x: bx + 20, z: bz + 4 });
}

// Wankhede: a stylised stadium ring
export function buildWankhede(out) {
  const [wx, wz] = POS.WANKHEDE;
  const p = new Part(out, wx, wz, 0);
  const N = 18;
  const tiers = [[34, 8, 5, 0x9ea4aa, 0x2f6db3], [42, 8, 9, 0xaeb3b8, 0xe28a2e], [50, 8, 14, 0x9ea4aa, 0x2f6db3]];
  tiers.forEach(([r0, th, h, wall, seat], ti) => {
    const rm = r0 + th / 2;
    const len = 2 * rm * Math.tan(Math.PI / N) + 1.2;
    for (let i = 0; i < N; i++) {
      const th2 = (i / N) * Math.PI * 2;
      const ry = -(th2 + Math.PI / 2);
      const x = Math.cos(th2) * rm, z = Math.sin(th2) * rm;
      p.box(len, h, th, wall, x, 0, z, ry);
      p.box(len, 0.3, th - 0.8, seat, x, h, z, ry);
    }
  });
  // roofed pavilion on the west stand (one blue canopy arc)
  for (let i = 0; i < 6; i++) {
    const th2 = Math.PI + (i - 2.5) * ((Math.PI * 2) / N);
    const rm = 50 + 6;
    const len = 2 * rm * Math.tan(Math.PI / N) + 1.2;
    p.box(len, 0.8, 18, 0xdadde0, Math.cos(th2) * (rm - 6), 17, Math.sin(th2) * (rm - 6), -(th2 + Math.PI / 2));
  }
  // pitch
  p.add(disc(33, 24, 0x5f9f48, 0.05));
  p.add(disc(24, 20, 0x72b052, 0.07));
  p.box(3.2, 0.08, 22, 0xcdb27a, 0, 0.1, 0);
  // floodlight towers
  for (const [fx, fz] of [[-52, -52], [52, -52], [-52, 52], [52, 52]]) {
    p.cyl(0.5, 0.8, 40, 6, 0x707880, fx, 0, fz);
    p.box(7, 3, 1.4, 0xdcdcdc, fx, 38.5, fz, Math.atan2(fx, fz));
    p.glowBox(6, 2, 0.4, 0xfff4cc, fx - Math.sign(fx) * 0.6, 39, fz - Math.sign(fz) * 0.6, Math.atan2(fx, fz));
  }
  for (let i = 0; i < 12; i++) {
    const th2 = (i / 12) * Math.PI * 2 + Math.PI / 12;
    p.col(Math.cos(th2) * 46, Math.sin(th2) * 46, 14.3, 12, -(th2 + Math.PI / 2));
  }
  p.fp('wankhede', 0, 0, 58, 58);
  out.pois.push({ id: 'wankhede', name: 'Wankhede Stadium', x: wx + 66, z: wz });
}
