// Road surface, lane markings, footpaths, kerbs, junction patches. All geometry goes
// into per-chunk RawBuilders.
import { LANE_W, MEDIAN_W } from './roadGraph.js';
import { CONFIG } from '../core/config.js';
import { REGAL } from './mapData.js';

const ASPHALT = 0x3b3e43;
const ASPHALT_MD = 0x35383d;
const FOOT = 0x9a978d;
const PROM = 0xb1aa97;
const KERB = 0xb6b3aa;
const MEDIAN = 0x7a8570;
const WHITE = 0xe8e8e0;
const YELLOW = 0xe2b93b;

/** Walk an edge from s0 to s1; call fn(pa, pb) with centre points+tangent for each sub-segment. */
function walk(graph, e, s0, s1, fn) {
  if (s1 - s0 < 0.05) return;
  let prev = graph.edgePoint(e, s0, {});
  const pts = [s0];
  for (let i = 0; i < e.cum.length; i++) if (e.cum[i] > s0 + 0.3 && e.cum[i] < s1 - 0.3) pts.push(e.cum[i]);
  pts.push(s1);
  for (let i = 1; i < pts.length; i++) {
    const cur = graph.edgePoint(e, pts[i], {});
    fn(prev, cur);
    prev = cur;
  }
}

function strip(graph, chunks, e, s0, s1, o0, o1, y, color) {
  walk(graph, e, s0, s1, (a, b) => {
    const raw = chunks.rawAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    raw.quadH(
      [a.x + a.tz * o0, a.z - a.tx * o0],
      [a.x + a.tz * o1, a.z - a.tx * o1],
      [b.x + b.tz * o1, b.z - b.tx * o1],
      [b.x + b.tz * o0, b.z - b.tx * o0],
      y, color,
    );
  });
}

function kerb(graph, chunks, e, s0, s1, off, y0, y1, color) {
  walk(graph, e, s0, s1, (a, b) => {
    const raw = chunks.rawAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    raw.vquad(a.x + a.tz * off, a.z - a.tx * off, b.x + b.tz * off, b.z - b.tx * off, y0, y1, color, true);
  });
}

function dashed(graph, chunks, e, s0, s1, off, width, on, off2, y, color) {
  for (let s = s0 + 1; s + on < s1; s += on + off2) {
    strip(graph, chunks, e, s, s + on, off - width / 2, off + width / 2, y, color);
  }
}

export function buildRoads(graph, chunks) {
  const { roadY, junctionY, markingY, footpathY } = CONFIG;

  for (const e of graph.edges) {
    const hw = e.width / 2;
    const col = e.roadId === 'marine_drive' ? ASPHALT_MD : ASPHALT;
    strip(graph, chunks, e, 0, e.len, -hw, hw, roadY, col);

    // markings
    const m0 = 0.5;
    const m1 = e.len - 0.5;
    if (!e.oneway) {
      if (e.median) {
        strip(graph, chunks, e, 0, e.len, -MEDIAN_W / 2, MEDIAN_W / 2, footpathY + 0.01, MEDIAN);
        kerb(graph, chunks, e, 0, e.len, MEDIAN_W / 2, roadY, footpathY + 0.01, KERB);
        kerb(graph, chunks, e, 0, e.len, -MEDIAN_W / 2, roadY, footpathY + 0.01, KERB);
      } else if (e.lanes >= 1) {
        // solid centre line (two thin yellow lines)
        strip(graph, chunks, e, m0 + e.trimA * 0.6, m1 - e.trimB * 0.6, -0.28, -0.1, markingY, YELLOW);
        strip(graph, chunks, e, m0 + e.trimA * 0.6, m1 - e.trimB * 0.6, 0.1, 0.28, markingY, YELLOW);
      }
      const base = e.median ? MEDIAN_W / 2 : 0;
      for (let k = 1; k < e.lanes; k++) {
        for (const side of [1, -1]) {
          dashed(graph, chunks, e, e.trimA, e.len - e.trimB, side * (base + LANE_W * k), 0.15, 3, 6, markingY, WHITE);
        }
      }
      // stop lines on arriving lanes
      for (const end of ['a', 'b']) {
        const node = graph.nodes.get(end === 'a' ? e.a : e.b);
        if (!node.junction || node.deg < 3) continue;
        const trim = end === 'a' ? e.trimA : e.trimB;
        const s = end === 'a' ? trim : e.len - trim;
        const sd = end === 'a' ? -1 : 1; // side holding the arriving lanes in +1 frame
        const s0 = Math.min(s, s + (end === 'a' ? 0.7 : -0.7));
        const s1 = Math.max(s, s + (end === 'a' ? 0.7 : -0.7));
        const base = e.median ? MEDIAN_W / 2 : 0.4;
        strip(graph, chunks, e, s0, s1, sd > 0 ? base : -(hw - 0.2), sd > 0 ? hw - 0.2 : -base, markingY, WHITE);
      }
    }

    // footpath + kerb handled below from graph.footpaths
  }

  for (const f of graph.footpaths) {
    const e = f.edge;
    const sd = f.side;
    strip(graph, chunks, e, f.s0, f.s1, sd * f.inner, sd * f.outer, footpathY, f.promenade ? PROM : FOOT);
    kerb(graph, chunks, e, f.s0, f.s1, sd * f.inner, roadY, footpathY, KERB);
  }

  // junction patches
  for (const n of graph.nodes.values()) {
    if (!n.junction || n.ring) continue;
    const r = n.deg === 1 ? n.clear : n.clear * 1.35;
    chunks.rawAt(n.x, n.z).disc(n.x, n.z, r, 14, junctionY, ASPHALT);
  }
  // regal circle: asphalt apron under the ring and a green island
  const raw = chunks.rawAt(REGAL.x, REGAL.z);
  raw.disc(REGAL.x, REGAL.z, REGAL.r + 4, 24, junctionY, ASPHALT);
  raw.disc(REGAL.x, REGAL.z, REGAL.r - 4.5, 20, footpathY, 0x6a9a58);
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2;
    const a1 = ((i + 1) / 20) * Math.PI * 2;
    const r = REGAL.r - 4.5;
    raw.vquad(
      REGAL.x + Math.cos(a1) * r, REGAL.z + Math.sin(a1) * r,
      REGAL.x + Math.cos(a0) * r, REGAL.z + Math.sin(a0) * r,
      roadY, footpathY, KERB, true,
    );
  }
}
