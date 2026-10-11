// Art-deco row east of Marine Drive (pastel blocks, rounded corners, eyebrow slabs),
// plus the Marine Drive promenade surface and the sea wall.
import { box } from '../../utils/geom.js';
import { Part, C, ribbon } from './kit.js';
import { marineDrive, POS, MD_HALF_BAND, WALL_OFFSET, defaultSeededFn } from './coords.js';

const PASTELS = [0xf3e6c4, 0xf0b9b0, 0xb9e0cc, 0xf6cfa0, 0xcfc0e6, 0xb9d6ec, 0xf4eaa0, 0xf7d3d8];
const ACCENTS = [0xd0736a, 0x4d9e86, 0xd9904a, 0x7f6cb5, 0x4f86b5, 0xc9b24a];
const GAP = 2.5;
const FLOOR = 3.4;
const SETBACK = MD_HALF_BAND + 2; // keep road + 3 m footpath + 2 m clear

// Deterministic layout (independent of the caller's rng so footprints are stable).
export function artdecoLayout() {
  const md = marineDrive();
  const h = defaultSeededFn(4711);
  let s0 = md.sOf(POS.J_MDVN[0], POS.J_MDVN[1]) + 34;
  let s1 = s0;
  while (s1 < md.length && md.at(s1).z > -835) s1 += 2;
  const n = 30;
  const pitch = (s1 - s0) / n;
  const list = [];
  for (let i = 0; i < n; i++) {
    const q = md.at(s0 + (i + 0.5) * pitch);
    const w = pitch - GAP;
    const d = 22 + Math.floor(h() * 5);
    const ry = Math.atan2(q.nx, q.nz); // front (+Z) faces the sea
    const off = SETBACK + d / 2;
    list.push({
      i, w, d, ry,
      x: q.x + q.ex * off, z: q.z + q.ez * off,
      floors: 5 + Math.floor(h() * 4),
      body: PASTELS[Math.floor(h() * PASTELS.length)],
      accent: ACCENTS[Math.floor(h() * ACCENTS.length)],
      round: h() < 0.5 ? -1 : 1,
      tank: h() < 0.6,
    });
  }
  return list;
}

export function buildArtDeco(out) {
  for (const b of artdecoLayout()) {
    const p = new Part(out, b.x, b.z, b.ry);
    const { w, d, floors, body, accent } = b;
    const H = floors * FLOOR;
    const R = 4.5;
    const sx = b.round; // which front corner is rounded
    const cxr = sx * (w / 2 - R), czr = d / 2 - R;
    // body (L-shaped boxes + corner cylinder)
    p.box(w - R, H, d, body, -sx * R / 2, 0, 0);
    p.box(R, H, d - R, body, sx * (w / 2 - R / 2), 0, -R / 2);
    p.cyl(R, R, H, 8, body, cxr, 0, czr);
    // roof slab + parapet + stair head / water tank
    p.box(w + 0.3, 0.5, d + 0.3, C.white, 0, H, 0);
    p.box(w - R - 1, 0.6, 0.3, accent, -sx * R / 2, H + 0.5, d / 2 - 0.2);
    p.box(5, 2.6, 5, body, -sx * (w / 4), H + 0.5, -d / 4);
    if (b.tank) p.cyl(1.6, 1.6, 2.2, 6, C.grey, sx * (w / 5), H + 0.5, -d / 4);
    // ground floor: shopfront band + awning
    p.box(w - R - 2, 2.6, 0.3, C.darkBlue, -sx * R / 2, 0.2, d / 2 + 0.05);
    p.box(w - R - 1, 0.25, 1.5, accent, -sx * R / 2, 3.0, d / 2 + 0.7);
    // eyebrow slabs + window bands per floor
    for (let f = 1; f < floors; f++) {
      const y = f * FLOOR;
      p.box(w - R + 0.3, 0.3, 1.6, C.white, -sx * R / 2, y, d / 2 + 0.7);
      p.cyl(R + 0.9, R + 0.9, 0.3, 8, C.white, cxr, y, czr);
      p.box(w - R - 1.5, 1.3, 0.25, 0x6f8ea6, -sx * R / 2, y + 1.0, d / 2 + 0.05);
      p.box(0.25, 1.3, d - R - 2, 0x6f8ea6, sx * (w / 2) , y + 1.0, -R / 2);
    }
    // vertical fin on the far end
    p.box(1.1, H + 2.4, 1.6, accent, -sx * (w / 2 - 0.6), 0, d / 2 + 0.5);
    // side windows on the rounded corner
    for (let f = 1; f < floors; f++) {
      p.cyl(R + 0.05, R + 0.05, 1.3, 8, 0x6f8ea6, cxr, f * FLOOR + 1.0, czr);
    }
    p.col(0, 0, w / 2, d / 2);
    p.fp('artdeco_' + b.i, 0, 0, w / 2, d / 2);
  }
}

// Promenade surface and sea wall along Marine Drive
export function buildSeaWall(out) {
  const md = marineDrive();
  const samples = [];
  for (let s = 0; s <= md.length; s += 6) samples.push(md.at(s));
  samples.push(md.at(md.length));
  out.geoms.push(ribbon(samples, MD_HALF_BAND, WALL_OFFSET, 0.17, 0xd8cdb4));
  // kerb stripe between footpath and promenade
  out.geoms.push(ribbon(samples, MD_HALF_BAND, MD_HALF_BAND + 0.5, 0.19, 0xbdb299));

  const SEG = 8;
  const n = Math.ceil(md.length / SEG);
  for (let i = 0; i < n; i++) {
    const s = Math.min(md.length, (i + 0.5) * SEG);
    const q = md.at(s);
    const ry = Math.atan2(-q.tz, q.tx); // local X along the tangent
    const c = WALL_OFFSET + 0.6;
    out.geoms.push(box(SEG + 0.7, 1.1, 1.2, 0xe0d8c4, q.x + q.nx * c, 0.17, q.z + q.nz * c, ry));
    if (i % 3 === 0) out.geoms.push(box(1.0, 1.7, 1.5, 0xc9bfa4, q.x + q.nx * c, 0.17, q.z + q.nz * c, ry));
    out.colliders.push({ x: q.x + q.nx * (WALL_OFFSET + 1.0), z: q.z + q.nz * (WALL_OFFSET + 1.0), hw: SEG / 2 + 0.4, hd: 1.5, rot: ry });
  }
}
