// Renders a top-down plan of the road network / land / parks / landmarks to PNG. Usage: node mapview.mjs out.png
import { RoadNetwork } from '../game/src/world/roads.js';
import pw from 'playwright-core';
const R = new RoadNetwork();
const b = R.bounds, pad = 40, S = 1.0;
const W = (b.maxX - b.minX + 2 * pad) * S, H = (b.maxZ - b.minZ + 2 * pad) * S;
const X = (x) => ((x - b.minX + pad) * S).toFixed(1), Z = (z) => ((z - b.minZ + pad) * S).toFixed(1);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#1d4e6e;font:10px sans-serif">`;
svg += `<polygon points="${R.land.map(([x, z]) => X(x) + ',' + Z(z)).join(' ')}" fill="#b8ad98"/>`;
for (const p of R.parks) svg += `<polygon points="${p.poly.map(([x, z]) => X(x) + ',' + Z(z)).join(' ')}" fill="#7da35a"/><text x="${X(p.poly[0][0]) * 1 + 10}" y="${Z(p.poly[0][1]) * 1 + 30}" fill="#234">${p.name}</text>`;
for (const e of R.edges) svg += `<polyline points="${e.pts.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}" fill="none" stroke="#333" stroke-width="${e.width * S}" stroke-linecap="round"/>`;
for (const e of R.edges) svg += `<polyline points="${e.pts.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}" fill="none" stroke="#fd0" stroke-width="0.6" stroke-dasharray="3 3"/>`;
for (const l of R.landmarks) svg += `<rect x="${X(l.x - l.w / 2)}" y="${Z(l.z - l.d / 2)}" width="${l.w * S}" height="${l.d * S}" fill="#c0573f" opacity="0.85"/><text x="${X(l.x - l.w / 2)}" y="${Z(l.z) }" fill="#fff">${l.name}</text>`;
for (const n of R.nodes.values()) { if (n.roundabout) svg += `<circle cx="${X(n.x)}" cy="${Z(n.z)}" r="${n.roundabout * S}" fill="#4a7" stroke="#222"/>`; svg += `<text x="${X(n.x) * 1 + 3}" y="${Z(n.z) * 1 - 3}" fill="#9cf" font-size="8">${n.id}</text>`; }
for (const r of R.roads) { const m = r.pts[Math.floor(r.pts.length / 2)]; svg += `<text x="${X(m.x)}" y="${Z(m.z)}" fill="#ff8" font-size="9">${r.name}</text>`; }
svg += '</svg>';
const out = process.argv[2] || 'map.png';
const br = await pw.chromium.launch({ channel: 'chrome' });
const pg = await br.newPage({ viewport: { width: Math.ceil(W), height: Math.ceil(H) } });
await pg.setContent(svg); await pg.screenshot({ path: out }); await br.close();
console.log('wrote', out, Math.ceil(W), 'x', Math.ceil(H));
