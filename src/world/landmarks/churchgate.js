// Churchgate station (140 x 40) with a central gable tower and clock.
import { Part, C } from './kit.js';
import { POS } from './coords.js';

const WALL = 0xe8d6a6;
const WALL_D = 0xcdb985;

export function buildChurchgate(out) {
  // PLAN puts it at (-220,-175); shifted 45 m east so it clears Maharshi Karve Rd.
  const cx = POS.CHURCHGATE[0] + 45, cz = POS.CHURCHGATE[1];
  const p = new Part(out, cx, cz, 0);
  const D = C.dark;

  p.box(142, 1, 42, WALL_D, 0, 0, 0);
  p.box(140, 11, 40, WALL, 0, 0, 0);
  p.box(142, 0.9, 42, C.white, 0, 11, 0);
  // two long pitched wing roofs (ridge along X)
  for (const sx of [-1, 1]) p.prism(38, 5.5, 52, C.terracotta, sx * 44, 11.9, 0, Math.PI / 2);

  // central gable tower
  p.box(30, 20, 22, WALL, 0, 0, 5);
  p.box(32, 1, 24, C.white, 0, 20, 5);
  p.prism(30, 9, 22, C.terracotta, 0, 21, 5); // front gable (ridge along Z)
  p.box(8, 6, 8, WALL, 0, 30, 5); // lantern cube
  p.prism(8, 4, 8, C.terracotta, 0, 36, 5);
  // clock in the gable
  p.box(6.4, 6.4, 0.5, D, 0, 22.8, 16.1);
  p.glowBox(5.2, 5.2, 0.3, 0xfff1c0, 0, 23.4, 16.4);
  p.box(0.3, 2.2, 0.2, D, 0, 25.3, 16.65);
  p.box(1.8, 0.3, 0.2, D, 0.7, 25.2, 16.65);

  // ground floor arcade
  for (let i = 0; i < 21; i++) {
    const x = -60 + i * 6;
    if (Math.abs(x) < 15) continue;
    p.roundArch(3, 5.6, D, x, 0.5, 20.2);
    p.box(2.2, 2.6, 0.4, D, x, 7, 20.15);
  }
  p.roundArch(6, 8, D, 0, 0.5, 16.2);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    p.box(2.4, 4, 0.4, D, i * 5.6, 8, 16.15);
  }
  // porte-cochere canopy on posts
  p.box(34, 0.5, 6, C.grey, 0, 6.5, 19);
  for (const x of [-15, -5, 5, 15]) p.box(0.5, 6.5, 0.5, C.dark, x, 0, 21.6);

  // long platform canopy at the back
  p.box(120, 0.5, 12, 0x8e9aa0, 0, 8.5, -26);
  for (let i = 0; i < 13; i++) p.box(0.4, 8.5, 0.4, C.dark, -60 + i * 10, 0, -31);

  // taxi-stand forecourt
  p.box(140, 0.2, 9, C.paving, 0, 0, 28.5);

  p.col(0, 0, 70, 20);
  p.fp('churchgate', 0, 0, 70, 20);
  out.pois.push({ id: 'churchgate', name: 'Churchgate Station', x: cx - 20, z: cz + 30 });
}
