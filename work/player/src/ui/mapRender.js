// Pre-renders the whole of Marine Drive + Fort into one offscreen canvas (sea, land, maidans, building footprints,
// roads, the Queen's Necklace) for the minimap / big map, plus small map-icon glyphs.
import { LANDMARKS } from '../world/mapdata.js';

export const MAP_COLORS = {
  sea0: '#0d2f47', sea1: '#14476a', land: '#2c2833', park: '#2f5a37', parkEdge: '#4f8a52', bldg: '#3b3644', landmark: '#5b4636',
  roadCase: '#17141c', road: '#8e8a9b', roadMajor: '#b5aebf', boulevard: '#d8c49a', necklace: '#ffcf6b',
};

/** Points of interest shown as icons. glyph: 'arch' | 'train' | 'tower' | 'fountain' | 'cross' | 'star' | 'dome' | 'col' | letter */
export const POIS = [
  { id: 'gateway', name: 'Gateway of India', glyph: 'arch', color: '#ffb23f' },
  { id: 'taj', name: 'Taj Mahal Palace', glyph: 'dome', color: '#ffb23f' },
  { id: 'cst', name: 'CST', glyph: 'train', color: '#ff6fae' },
  { id: 'churchgate', name: 'Churchgate', glyph: 'train', color: '#ff6fae' },
  { id: 'university', name: 'Rajabai Clock Tower', glyph: 'tower', color: '#ffb23f', at: (l) => l.tower },
  { id: 'highcourt', name: 'High Court', glyph: 'col', color: '#c9b6ff' },
  { id: 'policehq', name: 'Azad Maidan Police Stn', glyph: 'star', color: '#2d6cdf', edge: true },
  { id: 'regal', name: 'Regal Cinema', glyph: 'R', color: '#c9b6ff' },
  { id: 'trident', name: 'Hotel Marine Plaza', glyph: 'H', color: '#c9b6ff' },
  { id: 'hospital', name: "St. George's Hospital", glyph: 'cross', color: '#ffffff', x: 236, z: -478, edge: true },
  { id: 'flora', name: 'Flora Fountain', glyph: 'fountain', color: '#5fd3e8', x: 60, z: 55 },
  { id: 'kalaghoda', name: 'Kala Ghoda', glyph: 'K', color: '#c9b6ff', x: 82, z: 225 },
].map((p) => {
  const l = LANDMARKS.find((q) => q.id === p.id);
  const at = p.at && l ? p.at(l) : null;
  return { ...p, x: p.x ?? at?.x ?? l?.x ?? 0, z: p.z ?? at?.z ?? l?.z ?? 0 };
});

export function renderMap(game, S = 2) {
  const roads = game.roads;
  const b = roads.bounds, pad = 140;
  const minX = b.minX - pad, minZ = b.minZ - pad, maxX = b.maxX + pad, maxZ = b.maxZ + pad;
  const W = Math.ceil((maxX - minX) * S), H = Math.ceil((maxZ - minZ) * S);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const X = (x) => (x - minX) * S, Z = (z) => (z - minZ) * S;
  const C = MAP_COLORS;

  // sea with a subtle depth gradient + ripples
  const sg = g.createLinearGradient(0, 0, W, H); sg.addColorStop(0, C.sea0); sg.addColorStop(1, C.sea1);
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,190,230,0.05)'; g.lineWidth = 1;
  for (let y = 0; y < H; y += 9) { g.beginPath(); for (let x = 0; x <= W; x += 24) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 2); g.stroke(); }

  // land
  const poly = (pts, fill, stroke, lw = 1) => {
    g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  };
  g.save(); g.shadowColor = 'rgba(90,180,230,0.55)'; g.shadowBlur = 10 * S;
  poly(roads.land, C.land, 'rgba(170,215,240,0.55)', 1.5 * S);
  g.restore();

  // maidans
  for (const p of roads.parks) {
    poly(p.poly, C.park, C.parkEdge, 1 * S);
    // cricket pitches: a few light rectangles
    const cx = p.poly.reduce((a, q) => a + q[0], 0) / p.poly.length, cz = p.poly.reduce((a, q) => a + q[1], 0) / p.poly.length;
    g.fillStyle = 'rgba(210,200,150,0.25)';
    for (let i = -1; i <= 1; i++) g.fillRect(X(cx + i * 30) - 1.5 * S, Z(cz - 10), 3 * S, 20 * S);
  }

  // building footprints from the static collision world (city colliders), if any
  const col = game.collision;
  if (col && col.shapes) {
    g.fillStyle = C.bldg;
    for (const s of col.shapes) {
      if (s.type !== 'box' || (s.h ?? 0) < 4 || s.data?.tag === 'seawall') continue;
      if (s.hw < 1.5 && s.hd < 1.5) continue;
      g.save(); g.translate(X(s.cx), Z(s.cz)); g.rotate(-s.rot); g.fillRect(-s.hw * S, -s.hd * S, s.hw * 2 * S, s.hd * 2 * S); g.restore();
    }
  }
  // landmark footprints
  for (const l of LANDMARKS) {
    g.save(); g.translate(X(l.x), Z(l.z)); g.rotate(-(l.rot || 0));
    g.fillStyle = C.landmark; g.fillRect(-l.w / 2 * S, -l.d / 2 * S, l.w * S, l.d * S);
    g.strokeStyle = 'rgba(255,190,110,0.35)'; g.lineWidth = 1; g.strokeRect(-l.w / 2 * S, -l.d / 2 * S, l.w * S, l.d * S);
    g.restore();
  }

  // roads: casing then surface, major roads brighter, Marine Drive warm
  const stroke = (pts, w, color) => {
    g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z))));
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  };
  for (const e of roads.edges) stroke(e.pts, (e.width + 3) * S, C.roadCase);
  for (const n of roads.nodes.values()) if (n.roundabout) { g.fillStyle = C.roadCase; g.beginPath(); g.arc(X(n.x), Z(n.z), (n.roundabout + 8) * S, 0, 7); g.fill(); }
  for (const e of roads.edges) {
    const color = e.kind === 'boulevard' ? C.boulevard : e.kind === 'arterial' ? C.roadMajor : C.road;
    stroke(e.pts, e.width * S, color);
  }
  for (const n of roads.nodes.values()) if (n.roundabout) {
    g.fillStyle = C.roadMajor; g.beginPath(); g.arc(X(n.x), Z(n.z), (n.roundabout + 6.5) * S, 0, 7); g.fill();
    g.fillStyle = C.park; g.beginPath(); g.arc(X(n.x), Z(n.z), (n.roundabout - 1) * S, 0, 7); g.fill();
  }
  // Marine Drive median
  for (const e of roads.edges) if (e.median > 0) stroke(e.pts, e.median * S * 0.6, 'rgba(60,80,50,0.9)');

  // the Queen's Necklace: streetlights along the promenade
  const se = roads.seaEdge;
  let acc = 0;
  g.fillStyle = C.necklace; g.shadowColor = 'rgba(255,200,90,0.9)'; g.shadowBlur = 6;
  for (let i = 1; i < se.length; i++) {
    const [x0, z0] = se[i - 1], [x1, z1] = se[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = (14 - acc) % 14; s < L; s += 14) {
      const t = s / L, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      g.beginPath(); g.arc(X(x), Z(z), 1.6 * S, 0, 7); g.fill();
    }
    acc = (acc + L) % 14;
  }
  g.shadowBlur = 0;
  return { canvas: cv, S, minX, minZ, maxX, maxZ, W, H, X, Z };
}

/** Draw a round map badge with a glyph at (x,y). r = radius in px. */
export function drawBadge(g, x, y, r, poi) {
  g.save();
  g.translate(x, y);
  g.beginPath(); g.arc(0, 0, r + 1.5, 0, 7); g.fillStyle = 'rgba(10,6,14,0.9)'; g.fill();
  g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = poi.color; g.fill();
  const ink = poi.glyph === 'cross' ? '#e3283b' : poi.glyph === 'star' ? '#ffffff' : '#1a0f1f';
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = Math.max(1, r * 0.18);
  const k = r / 7;
  switch (poi.glyph) {
    case 'arch':
      g.fillRect(-4.5 * k, -3 * k, 9 * k, 7 * k); g.fillStyle = poi.color;
      g.beginPath(); g.moveTo(-2 * k, 4 * k); g.lineTo(-2 * k, 0); g.arc(0, 0, 2 * k, Math.PI, 0); g.lineTo(2 * k, 4 * k); g.fill();
      g.fillStyle = ink; g.fillRect(-5 * k, -4.2 * k, 10 * k, 1.4 * k); break;
    case 'dome':
      g.beginPath(); g.arc(0, 0.5 * k, 3.6 * k, Math.PI, 0); g.fill(); g.fillRect(-4.5 * k, 0.5 * k, 9 * k, 3.5 * k); g.fillRect(-0.5 * k, -5 * k, 1 * k, 2.5 * k); break;
    case 'train':
      g.beginPath(); g.roundRect ? g.roundRect(-3.6 * k, -4.5 * k, 7.2 * k, 7.5 * k, 1.5 * k) : g.rect(-3.6 * k, -4.5 * k, 7.2 * k, 7.5 * k); g.fill();
      g.fillStyle = poi.color; g.fillRect(-2.6 * k, -3.4 * k, 5.2 * k, 2.6 * k);
      g.beginPath(); g.arc(-1.8 * k, 1.3 * k, 0.9 * k, 0, 7); g.arc(1.8 * k, 1.3 * k, 0.9 * k, 0, 7); g.fill();
      g.fillStyle = ink; g.fillRect(-3.5 * k, 3.6 * k, 1.3 * k, 1.4 * k); g.fillRect(2.2 * k, 3.6 * k, 1.3 * k, 1.4 * k); break;
    case 'tower':
      g.fillRect(-1.8 * k, -2 * k, 3.6 * k, 6.5 * k); g.beginPath(); g.moveTo(-2.4 * k, -2 * k); g.lineTo(0, -5.8 * k); g.lineTo(2.4 * k, -2 * k); g.fill();
      g.fillStyle = poi.color; g.beginPath(); g.arc(0, 0, 1 * k, 0, 7); g.fill(); break;
    case 'fountain':
      g.beginPath(); g.ellipse(0, 2.5 * k, 4.5 * k, 1.6 * k, 0, 0, 7); g.fill(); g.fillRect(-0.7 * k, -2 * k, 1.4 * k, 4.5 * k);
      g.beginPath(); g.arc(0, -2.5 * k, 2.2 * k, Math.PI, 0); g.stroke(); break;
    case 'cross':
      g.fillRect(-1.3 * k, -4.4 * k, 2.6 * k, 8.8 * k); g.fillRect(-4.4 * k, -1.3 * k, 8.8 * k, 2.6 * k); break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 2.1 : 4.8) * k; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill(); break;
    }
    case 'col':
      g.fillRect(-4.5 * k, -4 * k, 9 * k, 1.5 * k); g.fillRect(-4.5 * k, 3 * k, 9 * k, 1.5 * k);
      for (const cx of [-3, 0, 3]) g.fillRect((cx - 0.6) * k, -2.5 * k, 1.2 * k, 5.5 * k); break;
    default:
      g.font = `800 ${Math.round(r * 1.25)}px Futura, 'Avenir Next', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(poi.glyph, 0, 0.5);
  }
  g.restore();
}
