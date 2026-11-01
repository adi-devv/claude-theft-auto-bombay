import { STREET, SPAWN } from '../world/mapdata.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export function makePath(points, extra = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { points, cum, length: cum[cum.length - 1], ...extra };
}

export function samplePath(path, s) {
  s = clamp(s, 0, path.length);
  let lo = 0, hi = path.points.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.cum[m] <= s) lo = m; else hi = m; }
  const a = path.points[lo], b = path.points[hi], len = path.cum[hi] - path.cum[lo] || 1;
  const t = (s - path.cum[lo]) / len;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / len, tz: (b.z - a.z) / len };
}

export function projectPath(path, x, z) {
  let best = { s: 0, dist2: Infinity };
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d < best.dist2) best = { s: path.cum[i - 1] + (path.cum[i] - path.cum[i - 1]) * t, dist2: d };
  }
  return best;
}

export function buildPedPlaces(game) {
  const { roads, collision } = game, paths = [], places = [], usedStops = new Set(), usedVendors = new Set();
  const safe = (x, z) => roads.isLand(x, z) && !roads.isOnRoad(x, z, .35) && !collision?.queryCircle(x, z, .38).length;
  const addPath = (points, edge, side, band) => {
    if (points.length < 3) return;
    const path = makePath(points, { edge, side, band, id: paths.length });
    if (path.length < 6) return;
    paths.push(path);
    const md = edge.name === 'Marine Drive', station = edge.a === 'MK_VN' || edge.b === 'MK_VN' || edge.a === 'CST' || edge.b === 'CST';
    const spacing = md || station ? 2.7 : 4.5;
    for (let s = .8; s < path.length - .4; s += spacing) {
      const p = samplePath(path, s);
      places.push({ ...p, path, s, activity: 'walk', weight: md ? 3 : station ? 2.6 : 1, family: md && band === 1 ? Math.floor(s / 9) : null });
    }
    const vendorKey = edge.id + ':' + side;
    if (path.length > 16 && !usedVendors.has(vendorKey) && ((md && side === 1 && band === 0) || station || (edge.name === 'Dadabhai Naoroji Rd' && side === -1))) {
      usedVendors.add(vendorKey);
      const s = path.length * .51, p = samplePath(path, s);
      places.push({ ...p, path, s, activity: 'vendor', role: ['chai', 'chana', 'bhutta'][paths.length % 3], weight: md ? 6 : 3 });
    }
    if (band === 0 && path.length > 18 && !usedStops.has(edge.id) && (station || ['Mahatma Gandhi Rd', 'Shahid Bhagat Singh Rd', 'Maharshi Karve Rd'].includes(edge.name))) {
      usedStops.add(edge.id);
      const stop = { path, s: path.length * .38 };
      for (let k = 0; k < 5; k++) {
        const s = clamp(path.length * .38 + k * .9, .5, path.length - .5), p = samplePath(path, s);
        places.push({ ...p, path, s, stop, stopLeader: k === 0, activity: 'busStop', weight: 1.4 });
      }
    }
  };
  for (const edge of roads.edges) {
    const a = roads.nodes.get(edge.a), b = roads.nodes.get(edge.b), md = edge.name === 'Marine Drive';
    const s0 = Math.max(3, a.radius + 2), s1 = edge.length - Math.max(3, b.radius + 2);
    for (const side of [-1, 1]) for (let band = 0; band < (md && side === 1 ? 3 : 2); band++) {
      const off = side * (edge.width / 2 + (md ? side === 1 ? 2.1 + band * 2.7 : 1.3 + band * (STREET.mdLandFootpath - 2.6) : 1.05 + band * (STREET.footpath - 2.1)));
      let points = [];
      for (let s = s0; s <= s1; s += 2) {
        const p = roads.sample(edge, s), x = p.x + p.tz * off, z = p.z - p.tx * off;
        if (safe(x, z)) points.push({ x, z });
        else { addPath(points, edge, side, band); points = []; }
      }
      addPath(points, edge, side, band);
    }
  }
  // Seated people use the city's actual parapet height and sea-facing normal.
  for (const seat of game.city?.promenadeSeats || game.city?.benchSpots || []) {
    if (!roads.isLand(seat.x - Math.sin(seat.heading) * .4, seat.z - Math.cos(seat.heading) * .4)) continue;
    if (seat.z < -500 || seat.z > 430) continue;
    places.push({ ...seat, activity: 'sit', seatY: seat.y, weight: 7 });
  }
  // Crossing routes use the centre of the actual zebra stripes, never an invented shortcut.
  for (const c of game.city?.crossings || []) {
    const off = c.width / 2 + 1.45;
    const a = { x: c.x + c.tz * off, z: c.z - c.tx * off }, b = { x: c.x - c.tz * off, z: c.z + c.tx * off };
    if (!safe(a.x, a.z) || !safe(b.x, b.z)) continue;
    const path = makePath([a, b], { crossing: c, id: paths.length }); paths.push(path);
    places.push({ ...a, path, s: 0, activity: 'cross', weight: 1.5 });
    places.push({ ...b, path, s: path.length, activity: 'cross', weight: 1.5 });
  }
  // Cricket teams line up on the very same three pitch strips as City.
  for (const park of roads.parks || []) {
    let cx = 0, cz = 0, longest = 0, angle = 0;
    for (let i = 0; i < park.poly.length; i++) {
      const a = park.poly[i], b = park.poly[(i + 1) % park.poly.length]; cx += a[0]; cz += a[1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len > longest) { longest = len; angle = Math.atan2(b[0] - a[0], b[1] - a[1]); }
    }
    cx /= park.poly.length; cz /= park.poly.length;
    for (let k = -1; k <= 1; k++) {
      const x = cx + Math.cos(angle) * k * 34, z = cz - Math.sin(angle) * k * 34;
      const match = { x, z, angle, phase: (k + 1) * 3.4 };
      const team = [['batsman', 0, -8], ['bowler', 0, 18], ['keeper', 0, -12], ['fielder', -11, -19], ['fielder', 10, -22], ['fielder', -12, 15], ['fielder', 11, 23]];
      for (const [role, lateral, along] of team) {
        const px = x + Math.cos(angle) * lateral + Math.sin(angle) * along, pz = z - Math.sin(angle) * lateral + Math.cos(angle) * along;
        places.push({ x: px, z: pz, heading: role === 'keeper' || role === 'batsman' ? angle : role === 'bowler' ? angle + Math.PI : Math.atan2(x - px, z - pz), activity: 'cricket', role, match, lateral, along, weight: 10 });
      }
    }
  }
  for (let i = 0; i < places.length; i++) places[i].id = i;
  return { paths, places, safe, spawn: SPAWN };
}
