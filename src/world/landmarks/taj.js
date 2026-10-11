// Taj Mahal Palace hotel (90 x 60, cream, red domes) and the Taj Tower beside it.
import { Part, C } from './kit.js';
import { POS } from './coords.js';

const CREAM = 0xf0e4c6;
const CREAM2 = 0xe6d6b0;
const RED = 0xb8352b;
const RED_DARK = 0x8f2a22;

export function buildTaj(out) {
  const [tx, tz] = POS.TAJ;
  const p = new Part(out, tx, tz, Math.PI / 2); // faces east (harbour / Gateway)

  // main block + plinth
  p.box(92, 1.2, 62, C.sandDark, 0, 0, 0);
  p.box(90, 24, 60, CREAM, 0, 0, 0);
  p.box(92, 1.2, 62, C.white, 0, 24, 0); // cornice
  // raised central block
  p.box(34, 7, 40, CREAM2, 0, 25.2, -4);
  p.box(36, 1, 42, C.white, 0, 32.2, -4);

  // central dome on an octagonal drum
  p.cyl(8.5, 9, 4, 8, CREAM2, 0, 33.2, -4, Math.PI / 8);
  p.dome(9.5, 10, RED, 0, 37.2, -4);
  p.cyl(1.4, 1.8, 3, 6, CREAM2, 0, 46.2, -4);
  p.cone(1.5, 3.2, 6, RED_DARK, 0, 49.2, -4);
  p.cyl(0.12, 0.16, 3, 4, C.dark, 0, 52.4, -4);

  // four corner towers with red domes + front pair of smaller domes
  const cornerDome = (x, z, h, r) => {
    p.box(r * 2.4, h, r * 2.4, CREAM, x, 0, z);
    p.box(r * 2.7, 0.9, r * 2.7, C.white, x, h, z);
    p.cyl(r * 0.85, r * 0.9, 2, 8, CREAM2, x, h + 0.9, z, Math.PI / 8);
    p.dome(r, 8, RED, x, h + 2.9, z);
    p.cone(0.5, 1.8, 5, RED_DARK, x, h + 2.9 + r, z);
  };
  cornerDome(-38.5, 25, 29, 4.6);
  cornerDome(38.5, 25, 29, 4.6);
  cornerDome(-38.5, -25, 29, 4.6);
  cornerDome(38.5, -25, 29, 4.6);
  for (const sx of [-1, 1]) cornerDome(sx * 17.5, 26, 27, 3.2);

  // facade: arcaded ground floor (rounded arches), balcony slabs, window strips
  const D = C.dark;
  for (let i = 0; i < 13; i++) {
    const x = -39.6 + i * 6.6;
    p.roundArch(3.6, 6.4, D, x, 1.2, 30.2);
    p.box(3.4, 3.2, 0.4, D, x, 9.5, 30.15);
    p.box(3.4, 3.2, 0.4, D, x, 15, 30.15);
    p.box(3.4, 3.2, 0.4, D, x, 20, 30.15);
  }
  for (let y of [7.8, 13, 18.2]) {
    p.box(90.4, 0.5, 2.0, C.white, 0, y, 30.6); // balcony / eyebrow slabs
  }
  // grand entrance porch
  p.box(14, 9, 5, CREAM2, 0, 0, 32.5);
  p.box(15, 0.8, 6, C.white, 0, 9, 32.5);
  p.roundArch(8, 8, D, 0, 1.2, 35.1);
  // long sides (north / south faces of the block), local x = +-45
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = -24.5 + i * 7;
      p.roundArch(3, 5.6, D, sx * 45.1, 1.2, z, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.box(0.4, 3, 3, D, sx * 45.05, 10, z);
      p.box(0.4, 3, 3, D, sx * 45.05, 16, z);
    }
  }
  // back face windows
  for (let i = 0; i < 13; i++) {
    const x = -39.6 + i * 6.6;
    p.box(3.4, 3.2, 0.4, D, x, 9.5, -30.15);
    p.box(3.4, 3.2, 0.4, D, x, 16, -30.15);
  }

  // forecourt lawn and drive
  p.box(52, 0.18, 24, 0x7fae5a, 0, 0, 42);
  p.box(8, 0.22, 24, C.paving, 0, 0, 42);

  // Taj Tower: a tall modern block south of the palace (local frame is its own)
  buildTajTower(out);

  p.col(0, 0, 45, 30);
  p.fp('taj', 0, 0, 45, 30);
  out.pois.push({ id: 'taj', name: 'Taj Mahal Palace', x: p.wx(0, 58), z: p.wz(0, 58) });
}

function buildTajTower(out) {
  const [tx, tz] = POS.TAJ;
  const q = new Part(out, tx - 12, tz + 75, Math.PI / 2);
  const H = 78;
  q.box(30, H, 30, 0xd9c9a2, 0, 0, 0);
  q.box(32, 1.5, 32, C.white, 0, H, 0);
  q.box(20, 6, 20, 0xc9b88e, 0, H + 1.5, 0);
  q.box(22, 1, 22, C.white, 0, H + 7.5, 0);
  q.dome(6, 8, RED, 0, H + 8.5, 0);
  // window bands on all four faces
  for (let y = 6; y < H - 4; y += 6.5) {
    for (const [dx, dz, w, d] of [[0, 15.1, 26, 0.4], [0, -15.1, 26, 0.4], [15.1, 0, 0.4, 26], [-15.1, 0, 0.4, 26]]) {
      q.box(w, 2.6, d, C.glass, dx, y, dz);
    }
  }
  // vertical piers over the bands
  for (const x of [-9, -3, 3, 9]) {
    q.box(0.8, H - 4, 0.8, C.white, x, 3, 15.2);
    q.box(0.8, H - 4, 0.8, C.white, x, 3, -15.2);
  }
  q.box(34, 3.5, 34, 0xb9a77c, 0, 0, 0); // podium
  q.col(0, 0, 17, 17);
  q.fp('taj_tower', 0, 0, 17, 17);
  out.pois.push({ id: 'taj_tower', name: 'Taj Tower', x: q.wx(0, 28), z: q.wz(0, 28) });
}
