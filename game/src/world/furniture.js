// Street furniture, all merged into the shared static batches (no extra draw calls):
//   BEST bus stops (red / cream shelters with a flag sign), chai + paan kiosks, hand-carts (thelas), free-standing
//   hoardings (billboards), bollards (zebra crossings, Gateway quay). Everything sits on footpaths / medians only:
//   a spot is accepted only when it is on the footpath field, off every carriageway + junction box, off the maidans
//   and clear of every existing static collider. Solid pieces register small colliders (tag 'prop').
// Run AFTER buildProps (so lamps / trees / railings already exist) and BEFORE batch.build.
import { mat, PRIM } from './geom.js';
import { emitSign } from './buildings.js';
import { STREET } from './mapdata.js';

const CREAM = '#e6dcc0', BEST_RED = '#b0262c', DARK = '#33363a', WOOD = '#7a5a38', GLASS = '#5d7480';
const fP = (s = 0.5) => [3, 3, 9, s * 0.99 + 40];   // painted, smooth, no street glow wash
const fW = (s = 0.5) => [3, 3, 8, s * 0.99 + 40];   // rough weathered
const KIOSK_COL = ['#2e6b4a', '#2f5f8f', '#d2a52f', '#b5412f', '#2f8a86', '#8a3b6a'];
const AWN_COL = ['#d4572a', '#2a6fd4', '#e0b020', '#2f9a52', '#c43a7a'];
const PRODUCE = ['#e8c21a', '#e66a1a', '#c8281e', '#4f9a3a', '#8b5a2b', '#f2e6c8'];

export function buildFurniture(game, ctx) {
  const { roads, collision } = game;
  const { batch, glows, fields, mats } = ctx;
  const sg = mats.signs;
  const rnd = mulberry(777);
  const stats = { busStops: 0, kiosks: 0, carts: 0, bollards: 0, rejected: 0 };
  const list = (ctx.furnList ||= []);
  const nodeList = [...roads.nodes.values()];
  const md = roads.roads.find((r) => r.name === 'Marine Drive');

  const nearJunction = (x, z, extra) => nodeList.some((n) => (n.edges.length >= 3 || n.roundabout) && Math.hypot(x - n.x, z - n.z) < n.radius + extra);
  // local frame: front (+z local) points along (nx,nz); local +x = (nz,-nx)
  const frame = (cx, cz, nx, nz) => {
    const rot = Math.atan2(nx, nz), c = Math.cos(rot), s = Math.sin(rot);
    return { cx, cz, rot, P: (lx, lz) => [cx + c * lx + s * lz, cz - s * lx + c * lz] };
  };
  const B = (F, key, prim, lx, y, lz, w, h, d, color, fac, ry = 0, rx = 0, rz = 0) => {
    const [x, z] = F.P(lx, lz);
    batch.add(key, prim, mat(x, y, z, F.rot + ry, w, h, d, rx, rz), { color, facade: fac });
  };
  const box = (F, lx, y, lz, w, h, d, color, fac = fP(), ry = 0, rx = 0, rz = 0) => B(F, 'facade', PRIM.box, lx, y, lz, w, h, d, color, fac, ry, rx, rz);
  const cyl = (F, lx, y, lz, w, h, d, color, fac = fP(), rx = 0, rz = 0) => B(F, 'facade', PRIM.cyl8, lx, y, lz, w, h, d, color, fac, 0, rx, rz);
  const lit = (F, lx, y, lz, w, h, d, color) => B(F, 'glow', PRIM.box, lx, y, lz, w, h, d, color, undefined);
  // sign decal (atlas rect, optionally cropped to its centre fraction) facing local +z (side=1) or -z (side=-1) or +-x
  const decal = (F, lx, y, lz, w, h, uv, crop, ang) => {
    let [u0, v0, u1, v1] = uv;
    if (crop) { const mu = (u0 + u1) / 2, hw = (u1 - u0) * crop / 2; u0 = mu - hw; u1 = mu + hw; }
    const a = F.rot + ang, [x, z] = F.P(lx, lz);
    emitSign(batch, x, y, z, w, h, Math.sin(a), Math.cos(a), [u0, v0, u1, v1]);
  };

  // ---- placement test: footpath only, clear of everything solid
  const free = (cx, cz, hw, hd, rot, o = {}) => {
    const m = o.margin ?? 0.35;
    for (const [dx, dz] of [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const x = cx + c * dx + s * dz, z = cz - s * dx + c * dz;
      if (roads.isOnRoad(x, z, 0.1) || fields.sample(fields.dC, x, z) < 0.1) return false;
      if (!o.anyGround && fields.sample(fields.G, x, z) > -0.05) return false; // must be on a footpath
      if (fields.sample(fields.land, x, z) < 1.5 || fields.sample(fields.park, x, z) > -1.5) return false;
    }
    return collision.queryOBB(cx, cz, hw + m, hd + m, rot).length === 0;
  };
  const solid = (cx, cz, hw, hd, rot, h) => collision.addBox(cx, cz, hw, hd, rot, { tag: 'prop', h });
  const taken = []; // furniture centres, for spacing between pieces
  const spaced = (x, z, d) => !taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < d);

  // road-edge walker: calls fn(edge, s, p, side, nx, nz) where (nx,nz) is the outward (road-facing) normal at kerb side `side`
  function walk(filter, step, jitter, fn) {
    for (const r of roads.roads) {
      if (!filter(r)) continue;
      for (const e of r.edges) {
        for (let s = 10 + rnd() * step * 0.5; s < e.length - 10; s += step * (1 + (rnd() - 0.5) * jitter)) {
          const p = roads.sample(e, s);
          for (const side of [1, -1]) fn(r, e, s, p, side);
        }
      }
    }
  }
  const sideNormal = (p, side) => ({ nx: side * p.tz, nz: -side * p.tx }); // pointing away from the centreline toward `side`

  // ---------------------------------------------------------------- BEST bus stops
  const bestUV = sg.bigUV[sg.bigIndex['BEST']];
  function busStop(x, z, nx, nz) {
    const F = frame(x, z, -nx, -nz); // front faces the road
    // shelter: back wall (red lower / glazed upper), roof, side panels, bench
    box(F, 0, 0.45, -0.5, 3.0, 0.9, 0.08, BEST_RED);
    box(F, 0, 1.6, -0.5, 3.0, 1.4, 0.05, GLASS, fP(0.2));
    for (const sx of [-1.5, -0.5, 0.5, 1.5]) box(F, sx, 1.25, -0.5, 0.07, 2.5, 0.1, CREAM);
    for (const sx of [-1.5, 1.5]) { box(F, sx, 1.2, 0.5, 0.07, 2.4, 0.07, CREAM); box(F, sx, 0.9, 0, 0.05, 1.8, 1.0, BEST_RED); }
    box(F, 0, 2.5, 0, 3.3, 0.1, 1.5, BEST_RED);
    box(F, 0, 2.42, 0.72, 3.3, 0.14, 0.06, CREAM);
    box(F, 0, 0.5, -0.28, 2.3, 0.07, 0.4, WOOD, fW(0.3));
    box(F, -0.9, 0.25, -0.28, 0.06, 0.5, 0.35, DARK); box(F, 0.9, 0.25, -0.28, 0.06, 0.5, 0.35, DARK);
    // flag sign on a pole at the kerb end of the shelter, readable from both ways along the road
    box(F, 1.95, 1.5, 0.6, 0.07, 3.0, 0.07, '#8b8f94', fP(0.9));
    box(F, 1.95, 3.05, 0.6, 0.06, 0.58, 0.98, BEST_RED);
    for (const a of [Math.PI / 2, -Math.PI / 2]) decal(F, 1.95 + Math.sign(a) * 0.04, 3.1, 0.6, 0.86, 0.36, bestUV, 0.16, a);
    box(F, 1.95, 2.72, 0.6, 0.05, 0.25, 0.5, CREAM);
    lit(F, 0.55, 1.6, -0.42, 1.3, 1.45, 0.03, '#6f8aa0');                                // backlit advert panel
    { const [gx, gz] = F.P(0.55, 0.1); glows.add(gx, 2.0, gz, '#bcd8f0', 1.1, 0, 1.2); }
    solid(...F.P(0, -0.1), 1.6, 0.65, F.rot, 2.6);
    stats.busStops++; list.push(['bus', x, z]);
  }
  const lastStop = new Map();
  walk((r) => r.kind === 'arterial' || r.kind === 'boulevard', 78, 0.5, (r, e, s, p, side) => {
    if (r === md && side === 1) return; // MD: land side only (+1 = sea side promenade)
    const { nx, nz } = sideNormal(p, side);
    const off = e.width / 2 + 0.95;
    const x = p.x + nx * off, z = p.z + nz * off;
    const key = r.name + side;
    const prev = lastStop.get(key); if (prev && Math.hypot(prev[0] - x, prev[1] - z) < 150) return;
    if (nearJunction(x, z, 16) || !spaced(x, z, 16) || rnd() < 0.18) return;
    const F = frame(x, z, -nx, -nz), [cx, cz] = F.P(0, -0.1);
    if (!free(cx, cz, 1.6, 0.65, F.rot, { margin: 0.5 })) { stats.rejected++; return; }
    busStop(x, z, nx, nz); lastStop.set(key, [x, z]); taken.push([x, z]);
  });

  // ---------------------------------------------------------------- chai / paan kiosks
  const chaiUV = sg.bigUV[sg.bigIndex['CHAI']];
  function kiosk(x, z, nx, nz, variant) {
    const F = frame(x, z, nx, nz); // front toward the road
    const col = KIOSK_COL[Math.floor(rnd() * KIOSK_COL.length)], awn = AWN_COL[Math.floor(rnd() * AWN_COL.length)];
    box(F, 0, 1.05, -0.05, 1.5, 2.1, 1.3, col, fW(rnd()));
    box(F, 0, 2.12, -0.05, 1.6, 0.08, 1.4, '#555a5e', fW(0.4));
    lit(F, 0, 1.42, 0.62, 1.1, 0.62, 0.04, variant ? '#ffcf80' : '#ffe2a8');           // lit counter window
    box(F, 0, 1.06, 0.78, 1.4, 0.07, 0.34, WOOD, fW(0.7));                              // counter ledge
    box(F, 0, 0.5, 0.62, 1.3, 1.0, 0.06, col, fW(0.2));                                // apron under the counter
    for (let k = 0; k < 5; k++) box(F, -0.4 + k * 0.2, 1.72, 0.68, 0.14, 0.2, 0.05, PRODUCE[(k + Math.floor(rnd() * 3)) % PRODUCE.length], fP(rnd()));
    box(F, 0, 2.22, 0.55, 1.9, 0.05, 1.1, awn, fP(rnd()), 0, 0.28);                      // sloped canvas awning
    box(F, 0, 2.05, 1.12, 1.9, 0.18, 0.04, CREAM, fP(0.3));                              // awning valance
    // sign
    box(F, 0, 2.5, 0.0, 1.55, 0.42, 0.1, '#222', fP(0.2));
    if (variant) decal(F, 0, 2.5, 0.06, 1.0, 0.36, chaiUV, 0.18, 0);
    else { const i = Math.floor(rnd() * sg.shopUV.length); decal(F, 0, 2.5, 0.06, 1.45, 0.2, sg.shopUV[i], 0, 0); }
    // plastic stools + a gas cylinder
    for (const [sx, sz, c] of [[-0.8, 1.15, '#c0392b'], [-0.35, 1.45, '#2e6fb0'], [0.9, 1.2, '#c0392b']]) cyl(F, sx, 0.19, sz, 0.32, 0.38, 0.32, c, fP(rnd()));
    cyl(F, 0.9, 0.3, -0.2, 0.3, 0.6, 0.3, '#8f2a22', fP(0.4));
    solid(...F.P(0, 0), 0.8, 0.7, F.rot, 2.4);
    { const [gx, gz] = F.P(0, 0.9); glows.add(gx, 1.7, gz, '#ffc880', 2.0, 0, 1.6); }
    stats.kiosks++; list.push(['kiosk', x, z]);
  }
  let nk = 0;
  walk((r) => r.kind !== 'boulevard', 36, 1.0, (r, e, s, p, side) => {
    if (nk > 70 || rnd() < 0.72) return;
    const { nx, nz } = sideNormal(p, side);
    const fp = STREET.footpath;
    const off = e.width / 2 + fp - 1.7;                  // near the building side of the footpath
    const x = p.x + nx * off, z = p.z + nz * off;
    if (nearJunction(x, z, 9) || !spaced(x, z, 14)) return;
    const F = frame(x, z, -nx, -nz);
    // kiosk faces the road => front normal = toward centreline (-n); frame() takes the facing vector
    if (!free(x, z, 0.8, 0.8, F.rot, { margin: 0.3 })) { stats.rejected++; return; }
    nk++; taken.push([x, z]);
    kiosk(x, z, -nx, -nz, rnd() < 0.55);
  });
  // Marine Drive land footpath: a few chai stalls facing the road
  for (const e of md.edges) for (let s = 40; s < e.length - 20; s += 95 + rnd() * 60) {
    const p = roads.sample(e, s), nx = -p.tz, nz = p.tx;      // land side normal (opposite of the sea side)
    const off = e.width / 2 + STREET.mdLandFootpath - 2.0, x = p.x + nx * off, z = p.z + nz * off;
    if (nearJunction(x, z, 12) || !spaced(x, z, 14)) continue;
    const F = frame(x, z, -nx, -nz);
    if (!free(x, z, 0.8, 0.8, F.rot, { margin: 0.3 })) { stats.rejected++; continue; }
    taken.push([x, z]); kiosk(x, z, -nx, -nz, rnd() < 0.6);
  }

  // ---------------------------------------------------------------- hand-carts (thelas)
  function cart(x, z, nx, nz, produce) {
    const F = frame(x, z, nx, nz); // local x runs along the road
    box(F, 0, 0.82, 0, 2.1, 0.1, 1.05, WOOD, fW(rnd()));
    box(F, 0, 0.92, 0.55, 2.1, 0.12, 0.05, '#5b4228', fW(0.5)); box(F, 0, 0.92, -0.55, 2.1, 0.12, 0.05, '#5b4228', fW(0.5));
    for (const sz of [-1, 1]) cyl(F, 0.15, 0.42, sz * 0.62, 0.84, 0.07, 0.84, DARK, fP(0.2), Math.PI / 2);
    box(F, -1.55, 0.78, 0.4, 1.3, 0.05, 0.05, '#5b4228', fW(0.3), 0, 0, 0.12); box(F, -1.55, 0.78, -0.4, 1.3, 0.05, 0.05, '#5b4228', fW(0.3), 0, 0, 0.12);
    box(F, 1.0, 0.4, 0, 0.06, 0.8, 0.7, '#5b4228', fW(0.5));                              // prop leg
    if (produce < 0.55) { // fruit / veg piles
      for (let k = 0; k < 4; k++) box(F, -0.7 + k * 0.5, 1.02 + rnd() * 0.05, (rnd() - 0.5) * 0.4, 0.4, 0.18 + rnd() * 0.08, 0.4, PRODUCE[Math.floor(rnd() * PRODUCE.length)], fP(rnd()));
    } else if (produce < 0.8) { // bananas
      for (let k = 0; k < 5; k++) box(F, -0.7 + k * 0.35, 1.05, (rnd() - 0.5) * 0.3, 0.12, 0.12, 0.7, '#e8c21a', fP(rnd()), (rnd() - 0.5) * 0.7, 0.5);
    } else { // coconuts
      for (let k = 0; k < 6; k++) B(F, 'facade', PRIM.sphere, -0.8 + (k % 3) * 0.55, 1.05 + Math.floor(k / 3) * 0.2, (k % 2 ? 1 : -1) * 0.2, 0.34, 0.34, 0.34, '#5a8a3a', fP(rnd()));
    }
    // umbrella
    cyl(F, -0.3, 1.6, 0, 0.04, 1.4, 0.04, '#8b8f94', fP(0.9));
    B(F, 'facade', PRIM.cone8, -0.3, 2.35, 0, 2.2, 0.35, 2.2, AWN_COL[Math.floor(rnd() * AWN_COL.length)], fP(rnd()));
    solid(...F.P(-0.2, 0), 1.15, 0.65, F.rot, 1.2);
    stats.carts++; list.push(['cart', x, z]);
  }
  let nc = 0;
  walk((r) => r.kind !== 'boulevard', 34, 1.0, (r, e, s, p, side) => {
    if (nc > 40 || rnd() < 0.85) return;
    const { nx, nz } = sideNormal(p, side);
    const off = e.width / 2 + STREET.footpath - 1.5;
    const x = p.x + nx * off, z = p.z + nz * off;
    if (nearJunction(x, z, 8) || !spaced(x, z, 10)) return;
    // cart long axis parallel to the road: frame front = toward road centreline
    const F = frame(x, z, -nx, -nz);
    if (!free(x, z, 1.15, 0.62, F.rot, { margin: 0.3 })) { stats.rejected++; return; }
    nc++; taken.push([x, z]); cart(x, z, -nx, -nz, rnd());
  });

  // (billboards are rooftop hoardings, built with the lots in buildings.js: footpaths are covered by upper-floor overhangs)

  // ---------------------------------------------------------------- bollards
  function bollard(x, z, c1 = CREAM) {
    batch.add('facade', PRIM.cyl8, mat(x, 0.42, z, 0, 0.2, 0.84, 0.2), { color: c1, facade: fP(0.3) });
    batch.add('facade', PRIM.box, mat(x, 0.7, z, 0.4, 0.3, 0.14, 0.3), { color: '#c9a21a', facade: fP(0.5) });
    collision.addCircle(x, z, 0.16, { tag: 'prop', h: 0.9 });
    stats.bollards++;
  }
  // zebra crossing mouths: four bollards flank each crossing at the kerb
  for (const c of ctx.crossings || []) {
    const nx = c.tz, nz = -c.tx;
    for (const side of [1, -1]) for (const o of [-2.4, 2.4]) {
      const off = c.width / 2 + 0.55, x = c.x + nx * side * off + c.tx * o, z = c.z + nz * side * off + c.tz * o;
      if (!free(x, z, 0.2, 0.2, 0, { margin: 0.25 })) continue;
      bollard(x, z);
    }
  }
  // Gateway quay: a chain of bollards along the harbour edge in front of the arch
  for (let z = 340; z <= 450; z += 5.5) {
    const x = 414.5;
    if (Math.abs(z - 390) < 11) continue;                    // leave the steps in front of the arch open
    if (fields.sample(fields.land, x, z) < 1.0 || collision.queryCircle(x, z, 0.6, []).length) continue;
    bollard(x, z, '#dcd6c4');
  }

  ctx.furnStats = stats;
  return stats;
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
