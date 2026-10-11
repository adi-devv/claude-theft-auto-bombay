// Chhatrapati Shivaji Maharaj Terminus (Victoria Terminus): Victorian-Gothic, 180 x 70 m.
import { Part, C } from './kit.js';
import { POS } from './coords.js';

const DOME = 0x8e9fa2;

export function buildCSMT(out) {
  const [cx, cz] = POS.CSMT;
  // Front faces the Mahapalika/D.N. Rd junction (J_CSMT) to the west-south-west.
  const [jx, jz] = POS.J_CSMT;
  const ry = Math.atan2(jx - cx, jz - cz);
  const p = new Part(out, cx, cz, ry);

  const WH = 17; // wing height

  // plinth + wings
  for (const sx of [-1, 1]) {
    const wx = sx * 62.5;
    p.box(57, 1.6, 72, C.sandDark, wx, 0, 0);
    p.box(55, WH, 70, C.sand, wx, 0, 0);
    p.box(57, 1.2, 72, C.sandLight, wx, WH, 0); // cornice
    p.prism(64, 7, 55, C.slate, wx, WH + 1.2, 0, Math.PI / 2); // long gable roof (ridge along X)
    // end pavilion (taller block with gables)
    const ex = sx * 80;
    p.box(20, 24, 72, C.sand, ex, 0, 0);
    p.box(22, 1.4, 74, C.sandLight, ex, 24, 0);
    p.prism(22, 9, 74, C.slate, ex, 25.4, 0); // ridge along Z
    // accent bands (terracotta stripe)
    p.box(57.2, 1.2, 72.2, C.terracotta, wx, 11, 0);
    p.box(20.2, 1.2, 72.2, C.terracotta, ex, 15, 0);
  }

  // central block
  p.box(72, 1.6, 42, C.sandDark, 0, 0, -15);
  p.box(70, 27, 40, C.sand, 0, 0, -15);
  p.box(72, 1.2, 42, C.sandLight, 0, 27, -15);
  p.box(70.2, 1.2, 40.2, C.terracotta, 0, 12, -15);
  p.prism(30, 10, 38, C.slate, 0, 28.2, -15); // front gable pediment ridge along Z

  // octagonal drum + dome + lantern + statue spike
  p.cyl(15.5, 16, 15, 8, C.sand, 0, 28, -15, Math.PI / 8);
  p.cyl(16.8, 16.8, 1.2, 8, C.sandLight, 0, 42.2, -15, Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 15.6;
    // narrow dark windows around the drum
    p.box(2.2, 7, 0.6, C.dark, Math.sin(a) * r, 31, -15 + Math.cos(a) * r, a);
    // pinnacles on the ring
    const pr = 16.8;
    p.cone(0.9, 4.5, 6, C.sandLight, Math.sin(a + Math.PI / 8) * pr, 42.2, -15 + Math.cos(a + Math.PI / 8) * pr);
  }
  p.dome(15, 8, DOME, 0, 43.4, -15);
  p.cyl(2.4, 2.8, 5, 8, C.sandLight, 0, 58.4, -15);
  p.cone(2.7, 5, 8, DOME, 0, 63.4, -15);
  p.cyl(0.18, 0.3, 8, 5, C.dark, 0, 68.4, -15); // statue spike
  p.cyl(0.9, 0.9, 1.4, 6, C.gold, 0, 68.4, -15);

  // six spires / turrets
  const turret = (x, z, h) => {
    p.cyl(2.5, 2.9, h, 8, C.sand, x, 0, z);
    p.cyl(3.3, 3.3, 0.8, 8, C.sandLight, x, h - 0.8, z);
    p.cone(3.6, 9, 8, C.slate, x, h, z);
    p.cyl(0.15, 0.2, 3, 4, C.dark, x, h + 9, z);
  };
  turret(-88, 33.5, 30);
  turret(88, 33.5, 30);
  turret(-71.5, 33.5, 30);
  turret(71.5, 33.5, 30);
  turret(-34, 3.5, 34);
  turret(34, 3.5, 34);

  // arched ground-floor rhythm (dark insets) + upper windows
  const D = C.dark;
  // front of wings (z=35)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const x = sx * 62.5 + (i - 4.5) * 5.4;
      p.gothic(3, 6.4, D, x, 1.6, 35.2);
      p.box(2.2, 3.4, 0.4, D, x, 9, 35.15);
    }
    // courtyard-facing inner face of the wing
    for (let i = 0; i < 6; i++) {
      const z = 9.5 + i * 4.8;
      p.gothic(2.8, 6.2, D, sx * 35, 1.6, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      p.box(0.4, 3.2, 2.2, D, sx * 34.85, 9, z);
    }
    // outer end faces
    for (let i = 0; i < 8; i++) {
      const z = (i - 3.5) * 8;
      p.gothic(3, 6.4, D, sx * 90.2, 1.6, z, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.box(0.4, 3.6, 2.4, D, sx * 90.15, 12, z);
      p.box(0.4, 3.6, 2.4, D, sx * 90.15, 18, z);
    }
  }
  // end pavilion fronts: tall pointed windows
  for (const sx of [-1, 1]) {
    p.gothic(5, 12, D, sx * 80, 1.6, 35.2);
    p.gothic(3.6, 9, D, sx * 80, 14, 35.2);
  }
  // central block front (z=5): grand arch + arcade
  p.gothic(11, 17, D, 0, 1.6, 5.2);
  p.gothic(7, 12, C.sandLight, 0, 1.6, 5.35);
  p.gothic(5, 9, D, 0, 1.8, 5.5);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = sx * (13 + i * 5.4);
      p.gothic(3, 6.4, D, x, 1.6, 5.2);
      p.box(2.2, 3.6, 0.4, D, x, 11, 5.15);
      p.box(2.2, 3.6, 0.4, D, x, 18, 5.15);
    }
  }
  // rose window + clock disc over the entrance
  p.hcyl(3.2, 0.4, 10, C.sandLight, 0, 22, 5.3);
  p.hcyl(2.4, 0.5, 10, D, 0, 22, 5.35);

  // courtyard paving, steps and a little lamp row
  p.box(66, 0.25, 30, C.paving, 0, 0, 20);
  p.box(14, 0.5, 3, C.sandDark, 0, 0, 6.5);
  for (const lx of [-24, -12, 12, 24]) {
    p.cyl(0.12, 0.15, 4, 5, C.dark, lx, 0.25, 22);
    p.box(0.5, 0.5, 0.5, C.gold, lx, 4.2, 22);
  }
  // front gate posts
  for (const sx of [-1, 1]) p.box(1.6, 3.2, 1.6, C.sandLight, sx * 33, 0, 34);

  // footprint + colliders
  p.fp('csmt', 0, 0, 90, 35);
  p.col(-62.5, 0, 28.5, 36);
  p.col(62.5, 0, 28.5, 36);
  p.col(0, -15, 35, 20);

  // nice approach point: well in front of the courtyard
  out.pois.push({ id: 'csmt', name: 'CSMT', x: p.wx(0, 58), z: p.wz(0, 58) });
}
