// Draw the traffic lane network (lanes, connectors, parking spots) for a region. node netview.mjs out.png [cx cz half]
import { RoadNetwork } from '../../work/traffic/src/world/roads.js';
import { TrafficNet } from '../../work/traffic/src/ai/trafficNet.js';
import { makeRng } from '../../work/traffic/src/core/rng.js';
import pw from 'playwright-core';
const R = new RoadNetwork();
const t0 = performance.now();
const N = new TrafficNet(R, makeRng(1));
console.log('net build ms', (performance.now() - t0).toFixed(1));
let nc = 0, ncf = 0; for (const n of N.nodeList) { nc += n.ai.conns.length; for (const c of n.ai.conns) ncf += c.conflicts.size; }
console.log('conns', nc, 'conflict pairs', ncf / 2, 'parking spots', N.parkingSpots.length, 'occupied', N.parkingSpots.filter(s => s.occupied).length);
const [cx, cz, half] = process.argv.slice(3).map(Number);
const b = cx !== undefined && !isNaN(cx) ? { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half } : R.bounds;
const W = 1100, S = W / (b.maxX - b.minX), H = Math.ceil((b.maxZ - b.minZ) * S);
const X = (x) => ((x - b.minX) * S).toFixed(1), Z = (z) => ((z - b.minZ) * S).toFixed(1);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#b8ad98;font:10px sans-serif">`;
for (const e of R.edges) svg += `<polyline points="${e.pts.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}" fill="none" stroke="#444" stroke-width="${e.width * S}" stroke-linecap="butt"/>`;
for (const n of R.nodes.values()) { if (n.roundabout) svg += `<circle cx="${X(n.x)}" cy="${Z(n.z)}" r="${n.radius * S}" fill="#444"/><circle cx="${X(n.x)}" cy="${Z(n.z)}" r="${n.roundabout * S}" fill="#4a7"/>`; else if (n.ai.kind==='junction') svg += `<circle cx="${X(n.x)}" cy="${Z(n.z)}" r="${n.radius * S}" fill="#444"/>`; }
const poly = (p, col, w) => { let s = ''; for (let i = 0; i < p.n; i++) s += X(p.pts[i * 2]) + ',' + Z(p.pts[i * 2 + 1]) + ' '; return `<polyline points="${s}" fill="none" stroke="${col}" stroke-width="${w}" opacity="0.9"/>`; };
for (const e of R.edges) for (const dir of [1, -1]) for (let l = 0; l < e.lanes; l++) { const p = N.lanePiece(e, dir, l); svg += poly(p, dir > 0 ? '#6cf' : '#fc6', 1.2);
  const i = Math.floor(p.n / 2); const x = p.pts[i * 2], z = p.pts[i * 2 + 1], x2 = p.pts[i * 2 + 2], z2 = p.pts[i * 2 + 3];
  const L = Math.hypot(x2 - x, z2 - z) || 1, ux = (x2 - x) / L, uz = (z2 - z) / L;
  svg += `<polygon points="${X(x + ux * 3)},${Z(z + uz * 3)} ${X(x - uz * 1.2)},${Z(z + ux * 1.2)} ${X(x + uz * 1.2)},${Z(z - ux * 1.2)}" fill="${dir > 0 ? '#6cf' : '#fc6'}"/>`; }
for (const n of N.nodeList) for (const c of n.ai.conns) svg += poly(c.piece, c.type === 'left' ? '#7f7' : c.type === 'right' ? '#f77' : c.type === 'ring' ? '#f7f' : c.type === 'uturn' ? '#fff' : '#ddd', c.legal ? 1 : 0.4);
for (const s of N.parkingSpots) { const fx = Math.sin(s.heading), fz = Math.cos(s.heading); svg += `<line x1="${X(s.x - fx * 2)}" y1="${Z(s.z - fz * 2)}" x2="${X(s.x + fx * 2)}" y2="${Z(s.z + fz * 2)}" stroke="${s.occupied ? '#e33' : '#888'}" stroke-width="${1.7 * S}"/>`; }
for (const n of R.nodes.values()) svg += `<text x="${X(n.x) * 1 + 3}" y="${Z(n.z) * 1 - 3}" fill="#00f" font-size="10">${n.id} ${n.ai.kind}</text>`;
svg += '</svg>';
const out = process.argv[2] || 'net.png';
const br = await pw.chromium.launch({ channel: 'chrome' });
const pg = await br.newPage({ viewport: { width: W, height: H } });
await pg.setContent(svg); await pg.screenshot({ path: out }); await br.close();
console.log('wrote', out);
