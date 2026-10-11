// Nariman Point: Air India tower (80 m), Trident tower and the NCPA drum.
import { Part, C } from './kit.js';
import { POS } from './coords.js';

export function buildNariman(out) {
  const [ax, az] = POS.AIR_INDIA;

  // Air India building: beige slab with tinted glass bands and a crown
  const a = new Part(out, ax, az, 0);
  const H = 80;
  a.box(34, 2, 26, 0x8d8576, 0, 0, 0);
  a.box(32, H, 24, 0xcdbd9a, 0, 0, 0);
  for (let y = 6; y < H - 4; y += 6) {
    for (const [dx, dz, w, d] of [[0, 12.1, 28, 0.4], [0, -12.1, 28, 0.4], [16.1, 0, 0.4, 20], [-16.1, 0, 0.4, 20]]) {
      a.box(w, 2.8, d, C.glass, dx, y, dz);
    }
  }
  a.box(33, 1.4, 25, C.white, 0, H, 0);
  a.box(26, 5, 18, 0xb9a983, 0, H + 1.4, 0);
  a.box(8, 3.2, 1.2, 0xc8302a, 0, H + 3.4, 9.7); // sign band
  a.cyl(0.15, 0.22, 7, 4, C.dark, 12, H + 6.4, -6);
  a.col(0, 0, 17, 13);
  a.fp('air_india', 0, 0, 17, 13);

  // Trident: a rounded dark-glass tower
  const t = new Part(out, ax - 88, az - 2, 0);
  const TH = 76;
  t.cyl(11, 12, 3, 12, 0x6c7480, 0, 0, 0);
  t.cyl(10, 10.4, TH, 12, 0x4f6f8a, 0, 0, 0);
  for (let y = 5; y < TH - 3; y += 5) t.cyl(10.4, 10.4, 0.6, 12, 0xe0e4e8, 0, y, 0);
  t.cyl(8, 10.4, 4, 12, 0x3a566e, 0, TH, 0);
  t.cyl(0.14, 0.2, 9, 4, C.dark, 0, TH + 4, 0);
  t.col(0, 0, 11, 11);
  t.fp('trident', 0, 0, 11, 11);

  // NCPA: low cream drum with a dark band
  const n = new Part(out, ax - 48, az + 14, 0);
  n.cyl(15, 16, 9, 14, 0xe9dcc2, 0, 0, 0);
  n.cyl(16.2, 16.2, 2, 14, C.darkBlue, 0, 3, 0);
  n.cyl(15, 15, 1, 14, C.white, 0, 9, 0);
  n.cyl(10, 10, 3, 14, 0xd8c8a6, 0, 10, 0);
  n.dome(6, 8, C.slate, 0, 13, 0);
  n.box(14, 0.3, 8, C.paving, 0, 0, 20);
  n.col(0, 0, 16, 16);
  n.fp('ncpa', 0, 0, 16, 16);

  out.pois.push({ id: 'nariman_point', name: 'Nariman Point', x: POS.J_NP[0], z: POS.J_NP[1] });
  out.pois.push({ id: 'air_india', name: 'Air India Building', x: ax - 10, z: az - 22 });
}
