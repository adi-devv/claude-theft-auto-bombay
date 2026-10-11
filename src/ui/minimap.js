// Minimap: roads/coast/maidans/landmarks pre-rendered once, then rotated per frame.
import { CONFIG } from '../core/config.js';
import { LANDMARKS, MAIDANS, SAND, POIS, REGAL } from '../world/mapData.js';

const LM_COLORS = {
  csmt: '#d96a4a', gateway: '#e0b040', taj: '#b03a3a', rajabai: '#8a6fc9', highcourt: '#9a8f78',
  churchgate: '#d96a4a', flora: '#4aa3d9', air_india: '#c94a4a', ncpa: '#9a8f78', trident: '#9a8f78',
  hosp: '#ffffff', cops: '#3a6fd9', garage: '#e08a30',
};

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.ppm = CONFIG.minimap.pxPerM;
    this.radius = CONFIG.minimap.radius;
    this.blips = []; // {x,z,color,clamp,flash}
    this.route = null; // [{x,z}]
    this.pre = this._prerender(world);
    this.t = 0;
  }

  _prerender({ graph, landPoly }) {
    const b = CONFIG.bounds;
    const k = this.ppm;
    const c = document.createElement('canvas');
    c.width = Math.ceil((b.maxX - b.minX) * k);
    c.height = Math.ceil((b.maxZ - b.minZ) * k);
    const g = c.getContext('2d');
    const X = (x) => (x - b.minX) * k;
    const Z = (z) => (z - b.minZ) * k;
    g.fillStyle = '#2c6f93';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#d9d3bd';
    g.beginPath();
    landPoly.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
    g.closePath();
    g.fill();
    g.fillStyle = '#9cc58a';
    for (const m of MAIDANS) g.fillRect(X(m.x0), Z(m.z0), (m.x1 - m.x0) * k, (m.z1 - m.z0) * k);
    g.fillStyle = '#e9dba8';
    g.fillRect(X(SAND.x0), Z(SAND.z0), (SAND.x1 - SAND.x0) * k, (SAND.z1 - SAND.z0) * k);
    // roads: dark casing then light fill
    const stroke = (style, extra) => {
      g.strokeStyle = style;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const e of graph.edges) {
        g.lineWidth = Math.max(2, e.width * k * 0.9) + extra;
        g.beginPath();
        e.px.forEach((x, i) => (i ? g.lineTo(X(x), Z(e.pz[i])) : g.moveTo(X(x), Z(e.pz[i]))));
        g.stroke();
      }
    };
    stroke('#5a5f66', 2);
    stroke('#f4f1e6', 0);
    // landmarks
    for (const l of LANDMARKS) {
      g.fillStyle = LM_COLORS[l.id] || '#999';
      const w = Math.max(l.w * k, 6);
      const d = Math.max(l.d * k, 6);
      g.fillRect(X(l.x) - w / 2, Z(l.z) - d / 2, w, d);
      g.strokeStyle = '#222';
      g.lineWidth = 1;
      g.strokeRect(X(l.x) - w / 2, Z(l.z) - d / 2, w, d);
    }
    // regal circle island
    g.fillStyle = '#9cc58a';
    g.beginPath();
    g.arc(X(REGAL.x), Z(REGAL.z), (REGAL.r - 5) * k, 0, Math.PI * 2);
    g.fill();
    for (const [id, p] of Object.entries(POIS)) {
      g.fillStyle = id === 'SPAWN' ? '#f2b705' : '#222';
      g.beginPath();
      g.arc(X(p.x), Z(p.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  draw(dt, px, pz, heading) {
    this.t += dt;
    const g = this.ctx;
    const S = this.size;
    const half = S / 2;
    const b = CONFIG.bounds;
    const scale = half / this.radius / this.ppm; // prerender px -> screen px
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(half, half, half - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2c6f93';
    g.fillRect(0, 0, S, S);
    g.translate(half, half);
    g.rotate(heading + Math.PI);
    g.scale(scale, scale);
    g.drawImage(this.pre, -(px - b.minX) * this.ppm, -(pz - b.minZ) * this.ppm);
    // route
    if (this.route && this.route.length > 1) {
      g.strokeStyle = '#ffd23a';
      g.lineWidth = 3 / scale;
      g.beginPath();
      this.route.forEach((p, i) => {
        const x = (p.x - px) * this.ppm;
        const z = (p.z - pz) * this.ppm;
        i ? g.lineTo(x, z) : g.moveTo(x, z);
      });
      g.stroke();
    }
    g.restore();
    // blips (screen space)
    const cosT = Math.cos(heading + Math.PI);
    const sinT = Math.sin(heading + Math.PI);
    for (const bl of this.blips) {
      if (bl.flash && Math.floor(this.t * 4) % 2) continue;
      let dx = (bl.x - px) * (half / this.radius);
      let dz = (bl.z - pz) * (half / this.radius);
      let sx = dx * cosT - dz * sinT;
      let sy = dx * sinT + dz * cosT;
      const d = Math.hypot(sx, sy);
      const lim = half - 8;
      if (d > lim) {
        if (!bl.clamp) continue;
        sx = (sx / d) * lim;
        sy = (sy / d) * lim;
      }
      g.fillStyle = bl.color || '#ff3b3b';
      g.beginPath();
      g.arc(half + sx, half + sy, 4, 0, Math.PI * 2);
      g.fill();
    }
    // player arrow (always up)
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(half, half - 9);
    g.lineTo(half + 6, half + 7);
    g.lineTo(half, half + 3);
    g.lineTo(half - 6, half + 7);
    g.closePath();
    g.fill();
    g.stroke();
    // north marker
    const nx = Math.sin(heading + Math.PI); // screen direction of north
    const ny = -Math.cos(heading + Math.PI);
    g.fillStyle = '#fff';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', half + nx * (half - 11), half + ny * (half - 11));
  }
}
