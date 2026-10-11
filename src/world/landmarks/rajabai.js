// Rajabai Clock Tower (85 m), University library hall and the Bombay High Court block.
import { Part, C } from './kit.js';
import { POS } from './coords.js';

const BUFF = 0xd3bf92;
const BUFF_D = 0xb59f70;
const HC = 0x9b9382; // High Court: darker grey-buff basalt

export function buildRajabai(out) {
  const [tx, tz] = POS.RAJABAI;
  const p = new Part(out, tx, tz, 0);
  const D = C.dark;

  // --- the tower ---
  p.box(14.4, 1.6, 14.4, BUFF_D, 0, 0, 0); // plinth
  p.box(13, 18, 13, BUFF, 0, 0, 0);
  p.box(14, 1, 14, C.sandLight, 0, 18, 0);
  // four corner turrets on the base block
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 6.5, z = sz * 6.5;
    p.cyl(1.3, 1.5, 24, 8, BUFF, x, 0, z);
    p.cone(1.9, 5, 8, C.verdigris, x, 24, z);
  }
  p.box(10.5, 28, 10.5, BUFF, 0, 19, 0); // shaft
  p.box(11.5, 1, 11.5, C.sandLight, 0, 47, 0);
  p.box(10, 14, 10, BUFF, 0, 48, 0); // clock stage
  p.box(11, 1, 11, C.sandLight, 0, 62, 0);
  p.cyl(4.2, 4.6, 10, 8, BUFF, 0, 63, 0, Math.PI / 8); // octagonal lantern
  p.cyl(5, 5, 0.8, 8, C.sandLight, 0, 73, 0, Math.PI / 8);
  p.cone(4.6, 11, 8, C.verdigris, 0, 73.8, 0);
  p.cyl(0.14, 0.2, 2.6, 4, C.dark, 0, 84.8, 0);
  p.cyl(0.6, 0.6, 0.6, 6, C.gold, 0, 83.6, 0);

  // pointed windows + ground arches on all four faces
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    const s = Math.sin(a), c = Math.cos(a);
    const at = (lx, y, d) => [lx * c + d * s, y, -lx * s + d * c]; // face-local -> tower-local
    const put = (fn) => fn(at);
    put((m) => {
      let [x, y, z] = m(0, 1.6, 6.5);
      p.gothic(4, 9, D, x, y, z, a);
      for (const o of [-3.8, 3.8]) {
        [x, y, z] = m(o, 22, 5.3);
        p.gothic(1.6, 7, D, x, y, z, a);
        [x, y, z] = m(o, 32, 5.3);
        p.gothic(1.6, 7, D, x, y, z, a);
      }
      [x, y, z] = m(0, 24, 5.3);
      p.gothic(2.2, 10, D, x, y, z, a);
      [x, y, z] = m(0, 64.5, 4.35);
      p.gothic(2, 7, D, x, y, z, a);
    });
    // clock faces (emissive) with dark rims and hands, on each face
    const [x, y, z] = at(0, 55, 5.25);
    p.box(6.8, 6.8, 0.5, D, x, y - 3.4, z, a);
    const [x2, y2, z2] = at(0, 55, 5.55);
    p.glowBox(5.6, 5.6, 0.3, 0xfff1c0, x2, y2 - 2.8, z2, a);
    const [x3, y3, z3] = at(0.0, 55, 5.8);
    p.box(0.3, 2.3, 0.2, D, x3, y3 - 0.1, z3, a);
    const [x4, y4, z4] = at(1.0, 55, 5.8);
    p.box(2.0, 0.3, 0.2, D, x4, y4 - 0.15, z4, a);
  }

  p.col(0, 0, 7.2, 7.2);
  p.fp('rajabai_tower', 0, 0, 7.2, 7.2);
  out.pois.push({ id: 'rajabai', name: 'Rajabai Clock Tower', x: tx - 5, z: tz + 26 });

  // --- University library hall attached on the west ---
  const lib = new Part(out, tx - 40, tz, 0);
  lib.box(56, 1.2, 26, BUFF_D, 0, 0, 0);
  lib.box(54, 13, 24, BUFF, 0, 0, 0);
  lib.box(56, 1, 26, C.sandLight, 0, 13, 0);
  lib.prism(24, 6, 54, C.terracotta, 0, 14, 0, Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6;
    lib.gothic(2.6, 7, D, x, 1.2, 12.2);
    lib.box(2, 3, 0.4, D, x, 8.5, 12.15);
  }
  for (const sx of [-1, 1]) {
    lib.cyl(1.6, 1.8, 17, 8, BUFF, sx * 27, 0, 12);
    lib.cone(2.2, 6, 8, C.verdigris, sx * 27, 17, 12);
  }
  lib.col(0, 0, 28, 13);
  lib.fp('rajabai_library', 0, 0, 28, 13);

  buildHighCourt(out);
}

function buildHighCourt(out) {
  // x[80,140] z[60,200]: long axis N-S, front (west) faces Mayo Rd.
  const p = new Part(out, 110, 130, -Math.PI / 2);
  const D = C.dark;
  p.box(142, 1.4, 62, 0x7d7566, 0, 0, 0);
  p.box(140, 20, 60, HC, 0, 0, 0);
  p.box(142, 1.2, 62, C.sandLight, 0, 20, 0);
  p.prism(52, 6, 138, C.slate, 0, 21.2, 0, Math.PI / 2);
  // front: central tower, two end octagonal towers, arcade
  p.box(18, 34, 14, HC, 0, 0, 24);
  p.box(20, 1.2, 16, C.sandLight, 0, 34, 24);
  p.prism(18, 7, 14, C.slate, 0, 35.2, 24); // gable
  p.cyl(4, 4.4, 8, 8, HC, 0, 42, 24);
  p.cone(4.6, 11, 8, C.verdigris, 0, 50, 24);
  p.cyl(0.14, 0.2, 3, 4, C.dark, 0, 61, 24);
  for (const sx of [-1, 1]) {
    p.cyl(4.4, 5, 30, 8, HC, sx * 66, 0, 26);
    p.cyl(5.4, 5.4, 1, 8, C.sandLight, sx * 66, 30, 26);
    p.cone(5.4, 12, 8, C.verdigris, sx * 66, 31, 26);
    p.cyl(3, 3.4, 26, 8, HC, sx * 66, 0, -26);
    p.cone(3.8, 9, 8, C.verdigris, sx * 66, 26, -26);
    // mid turrets
    p.cyl(2, 2.3, 24, 8, HC, sx * 34, 0, 28);
    p.cone(2.7, 6, 8, C.verdigris, sx * 34, 24, 28);
  }
  p.gothic(6, 14, D, 0, 1.4, 31.2);
  for (let i = 0; i < 17; i++) {
    const x = -48 + i * 6;
    if (Math.abs(x) < 10) continue;
    p.gothic(2.8, 7, D, x, 1.4, 30.2);
    p.box(2.2, 3.4, 0.4, D, x, 11, 30.15);
    p.box(2.2, 3.4, 0.4, D, x, 16, 30.15);
  }
  p.col(0, 0, 70, 30);
  p.fp('high_court', 0, 0, 70, 30);
  out.pois.push({ id: 'high_court', name: 'Bombay High Court', x: 72, z: 130 });
}
