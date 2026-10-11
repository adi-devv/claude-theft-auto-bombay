// Flora Fountain (on a round island) and the Hutatma Chowk flame memorial, beside junction J_FF.
import { Part, C } from './kit.js';
import { POS } from './coords.js';
import { cone } from '../../utils/geom.js';

export function buildFlora(out) {
  const [jx, jz] = POS.J_FF;
  // Placed in the south-west corner of the junction so the signalised crossing stays clear.
  const f = new Part(out, jx - 28, jz + 32, 0);
  const R = 7.5;
  f.cyl(R, R + 0.4, 0.5, 14, C.grass, 0, 0, 0);
  f.cyl(R + 0.5, R + 0.5, 0.35, 14, C.stone, 0, 0, 0); // kerb ring
  f.cyl(R - 0.3, R - 0.3, 0.55, 14, C.grassLight, 0, 0, 0);
  // basin
  f.cyl(4.6, 5, 1.1, 12, C.stone, 0, 0.5, 0);
  f.cyl(4.0, 4.0, 0.2, 12, 0x5c9fc0, 0, 1.45, 0); // water
  // tiers
  f.cyl(1.4, 1.8, 3.2, 8, C.white, 0, 1.6, 0);
  f.cyl(3.0, 2.0, 0.7, 10, C.stone, 0, 4.2, 0);
  f.cyl(2.8, 2.8, 0.15, 10, 0x5c9fc0, 0, 4.9, 0);
  f.cyl(0.8, 1.1, 2.6, 8, C.white, 0, 4.8, 0);
  f.cyl(1.8, 1.0, 0.5, 8, C.stone, 0, 7.2, 0);
  f.cyl(0.35, 0.5, 1.8, 6, C.sandDark, 0, 7.6, 0); // Flora statue
  f.cone(0.7, 1.1, 6, C.sandDark, 0, 8.9, 0);
  // four lamp standards around the basin
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    f.cyl(0.12, 0.15, 3.4, 5, C.dark, Math.cos(a) * 6.2, 0.5, Math.sin(a) * 6.2);
    f.box(0.45, 0.45, 0.45, C.gold, Math.cos(a) * 6.2, 3.9, Math.sin(a) * 6.2);
  }
  f.col(0, 0, R - 0.5, R - 0.5);
  f.fp('flora_fountain', 0, 0, R + 0.5, R + 0.5);

  // Hutatma Smarak: stone pillar with an eternal flame, on the opposite (south-east) corner
  const m = new Part(out, jx + 40, jz + 32, 0);
  m.cyl(4.2, 4.6, 0.45, 10, C.stone, 0, 0, 0);
  m.box(3.4, 0.8, 3.4, C.sandDark, 0, 0.45, 0);
  m.box(2.2, 4.6, 2.2, C.sandLight, 0, 1.25, 0);
  m.box(2.8, 0.5, 2.8, C.sandDark, 0, 5.85, 0);
  m.box(1.4, 0.9, 1.4, C.dark, 0, 6.35, 0);
  // flame (emissive)
  m.glow(cone(0.9, 2.6, 6, 0xff8a1f, 0, 7.25, 0));
  m.col(0, 0, 2.2, 2.2);
  m.fp('hutatma_chowk', 0, 0, 4.6, 4.6);

  out.pois.push({ id: 'flora', name: 'Flora Fountain (Hutatma Chowk)', x: jx, z: jz });
}
