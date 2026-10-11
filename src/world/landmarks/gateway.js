// Gateway of India: basalt-yellow arch facing east (harbour), plaza, steps and moored boats.
import * as THREE from 'three';
import { Part, C, wedge } from './kit.js';
import { colorize, place } from '../../utils/geom.js';
import { POS } from './coords.js';

// Arch body: 28 wide x 22 high x 12 deep, with a pointed-round opening 12 wide x 19 high.
function archBody(color) {
  const s = new THREE.Shape();
  s.moveTo(-14, 0);
  s.lineTo(-6, 0);
  s.lineTo(-6, 12);
  s.absarc(0, 12, 6, Math.PI, 0, true);
  s.lineTo(6, 0);
  s.lineTo(14, 0);
  s.lineTo(14, 22);
  s.lineTo(-14, 22);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 12, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -6);
  return colorize(g, color);
}

export function buildGateway(out, rng) {
  const [gx, gz] = POS.GATEWAY;
  const p = new Part(out, gx, gz, Math.PI / 2); // local +Z = east = harbour
  const B = C.basalt, BD = C.basaltDark;

  // plinth + the arch itself
  p.box(32, 1.4, 16, BD, 0, 0, 0);
  p.add(place(archBody(B), 0, 1.4, 0));
  p.box(29, 1.0, 13, C.sandLight, 0, 23.4, 0); // cornice

  // flanking half-arches (the real arch has side rooms with smaller arched recesses)
  for (const sx of [-1, 1]) {
    p.box(5.4, 12, 0.6, BD, sx * 10, 3, 6.1);
    p.box(3.4, 9, 0.7, C.dark, sx * 10, 3, 6.15);
    p.box(5.4, 12, 0.6, BD, sx * 10, 3, -6.1);
    p.box(3.4, 9, 0.7, C.dark, sx * 10, 3, -6.15);
  }
  // fretwork row along the top
  for (let i = 0; i < 9; i++) {
    const x = -12 + i * 3;
    p.box(1.6, 1.8, 0.5, C.dark, x, 20.4, 6.15);
    p.box(1.6, 1.8, 0.5, C.dark, x, 20.4, -6.15);
  }
  // crenellated parapet
  for (let i = 0; i < 8; i++) p.box(2.2, 1.2, 1.2, B, -12.3 + i * 3.5, 24.4, 5.4);
  for (let i = 0; i < 8; i++) p.box(2.2, 1.2, 1.2, B, -12.3 + i * 3.5, 24.4, -5.4);

  // central dome hint: octagonal drum + dome + finial
  p.cyl(5.2, 5.6, 4, 8, B, 0, 24.4, 0, Math.PI / 8);
  p.dome(5, 8, BD, 0, 28.4, 0);
  p.cyl(0.2, 0.3, 3.2, 5, C.dark, 0, 33.2, 0);
  p.cyl(0.55, 0.55, 0.8, 6, C.gold, 0, 33.2, 0);

  // four corner turrets with small domes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 12.6, z = sz * 4.8;
    p.cyl(1.5, 1.7, 7, 8, B, x, 24.4, z);
    p.cyl(1.9, 1.9, 0.5, 8, C.sandLight, x, 30.9, z);
    p.dome(1.8, 8, BD, x, 31.4, z);
    p.cyl(0.1, 0.12, 1.8, 4, C.dark, x, 33.2, z);
  }

  // steps down toward the harbour (east) and a paved approach
  for (let i = 0; i < 4; i++) p.box(26 - i * 0.4, 0.28 * (4 - i), 3 - 0.0, C.stone, 0, 0, 8 + i * 2.6);
  p.box(80, 0.22, 60, C.paving, 0, 0, 40); // plaza 80 x 60, from arch outward to the water
  // darker border + centre strip
  p.box(80, 0.26, 1.6, C.sandDark, 0, 0, 40 - 29.2);
  p.box(80, 0.26, 1.6, C.sandDark, 0, 0, 40 + 29.2);
  p.box(80, 0.3, 4, C.stone, 0, 0, 40);
  // bollards along the quay edge
  for (let i = 0; i < 14; i++) {
    const x = -28 + i * 4.3;
    p.cyl(0.25, 0.3, 0.9, 6, C.dark, x, 0.2, 70.6);
  }
  p.box(60, 0.3, 0.35, C.sandDark, 0, 0.7, 70.6);

  // colliders: two piers, arch stays walkable between them
  p.col(-10, 0, 4, 6);
  p.col(10, 0, 4, 6);
  p.fp('gateway', 0, 0, 16, 8);
  p.fp('gateway_plaza', 0, 40, 40, 30);

  out.pois.push({ id: 'gateway', name: 'Gateway of India', x: p.wx(0, 28), z: p.wz(0, 28) });

  boats(out, rng, gx, gz);
}

function hull(out, x, z, ry, len, w, color, trim) {
  const p = new Part(out, x, z, ry);
  const y0 = -0.95;
  p.box(w, 1.3, len * 0.7, color, 0, y0, -len * 0.15);
  p.add(wedge(w, 1.3, len * 0.3, color, 0, y0, len * 0.2));
  p.box(w + 0.12, 0.18, len * 0.7, trim, 0, y0 + 1.3, -len * 0.15);
  return p;
}

function boats(out, rng, gx, gz) {
  const kinds = [
    [0xf4f0e6, 0x2a6fb0], [0x3a8f9c, 0xf4f0e6], [0xe0b04a, 0x9c3b2e], [0xd4503c, 0xf4f0e6],
    [0xf4f0e6, 0x2a6fb0], [0x6a4a30, 0xe0b04a],
  ];
  const slots = [
    [722, 585], [740, 600], [758, 592], [730, 618], [750, 626], [772, 612],
    [725, 650], [745, 660], [768, 650], [735, 690], [758, 700], [726, 718],
    [782, 676], [790, 640],
  ];
  slots.forEach(([x, z], i) => {
    const [body, trim] = kinds[i % kinds.length];
    const big = i % 5 === 0;
    const len = big ? 13 : 7 + rng() * 3;
    const w = big ? 3.6 : 2.3;
    const ry = Math.PI / 2 + (rng() - 0.5) * 0.7; // bows roughly toward the quay/wind
    const q = hull(out, x + (rng() - 0.5) * 4, z + (rng() - 0.5) * 4, ry, len, w, body, trim);
    // cabin + mast
    q.box(w * 0.7, 1.2, len * 0.28, trim, 0, 0.5, -len * 0.18);
    q.cyl(0.07, 0.1, big ? 7 : 4.5, 5, C.dark, 0, 0.35, len * 0.12);
    if (!big) q.box(0.08, 3.2, 0.08, C.dark, 0, 0.3, 0.1);
    if (big) q.box(w * 0.5, 1.0, len * 0.2, C.white, 0, 1.7, -len * 0.18);
  });
  // one ferry tied alongside
  const f = new Part(out, 706, 600, 0);
  f.box(5, 1.6, 24, 0xf3efe2, 0, -1.0, 0);
  f.box(4.2, 1.8, 14, 0x2a6fb0, 0, 0.5, -2);
  f.box(3.4, 1.2, 6, 0xf3efe2, 0, 2.3, -2);
}
