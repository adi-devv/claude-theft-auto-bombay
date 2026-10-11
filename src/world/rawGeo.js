// Raw triangle accumulator for flat things (road ribbons, markings, window strips).
// Produces indexed geometry with position + normal + color and no uv, so it merges
// cleanly with geom.js output.
import * as THREE from 'three';

const _cache = new Map();
const _c = new THREE.Color();
export function colorRGB(hex) {
  let v = _cache.get(hex);
  if (!v) {
    _c.set(hex);
    v = [_c.r, _c.g, _c.b];
    _cache.set(hex, v);
  }
  return v;
}

export class RawBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }
  get empty() {
    return this.idx.length === 0;
  }
  _vert(x, y, z, nx, ny, nz, c) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c[0], c[1], c[2]);
    return i;
  }
  /** Horizontal quad (4 corners [x,z]) at height y, always facing up. */
  quadH(a, b, c, d, y, color) {
    const col = colorRGB(color);
    // orientation: y-component of (b-a) x (c-a) in (x,z): uz*vx - ux*vz
    const ux = b[0] - a[0];
    const uz = b[1] - a[1];
    const vx = c[0] - a[0];
    const vz = c[1] - a[1];
    const up = uz * vx - ux * vz > 0;
    const i0 = this._vert(a[0], y, a[1], 0, 1, 0, col);
    const i1 = this._vert(b[0], y, b[1], 0, 1, 0, col);
    const i2 = this._vert(c[0], y, c[1], 0, 1, 0, col);
    const i3 = this._vert(d[0], y, d[1], 0, 1, 0, col);
    if (up) this.idx.push(i0, i1, i2, i0, i2, i3);
    else this.idx.push(i0, i2, i1, i0, i3, i2);
  }
  /** Triangle fan disc/polygon (convex) centred at (cx,cz). */
  disc(cx, cz, r, seg, y, color, r2 = r) {
    const col = colorRGB(color);
    const c0 = this._vert(cx, y, cz, 0, 1, 0, col);
    const first = this.pos.length / 3;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      this._vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r2, 0, 1, 0, col);
    }
    for (let i = 0; i < seg; i++) {
      const a = first + i;
      const b = first + ((i + 1) % seg);
      // angle increases x->z; with +z south and y up this winding faces up
      this.idx.push(c0, b, a);
    }
  }
  /** Vertical quad between (x0,z0) and (x1,z1), from y0 to y1; double sided optional. */
  vquad(x0, z0, x1, z1, y0, y1, color, both = false) {
    const col = colorRGB(color);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const i0 = this._vert(x0, y0, z0, nx, 0, nz, col);
    const i1 = this._vert(x1, y0, z1, nx, 0, nz, col);
    const i2 = this._vert(x1, y1, z1, nx, 0, nz, col);
    const i3 = this._vert(x0, y1, z0, nx, 0, nz, col);
    this.idx.push(i0, i1, i2, i0, i2, i3);
    if (both) {
      const j0 = this._vert(x0, y0, z0, -nx, 0, -nz, col);
      const j1 = this._vert(x1, y0, z1, -nx, 0, -nz, col);
      const j2 = this._vert(x1, y1, z1, -nx, 0, -nz, col);
      const j3 = this._vert(x0, y1, z0, -nx, 0, -nz, col);
      this.idx.push(j0, j2, j1, j0, j3, j2);
    }
  }
  build() {
    if (this.empty) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}
