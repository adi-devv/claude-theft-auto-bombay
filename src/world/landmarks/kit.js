// Local-frame builder for landmarks. Author geometry in a local frame (+Z = front, base at y=0),
// the Part transforms it to world with a heading `ry` (same convention as mesh.rotation.y).
import * as THREE from 'three';
import { box, cyl, cone, dome, place, colorize, flatPoly } from '../../utils/geom.js';

export const C = {
  sand: 0xd9c08f, sandDark: 0xb99c68, sandLight: 0xeadfbd, cream: 0xf2e7c9, stone: 0xcfc3a5,
  dark: 0x3b2f2c, darkBlue: 0x33404d, glass: 0x4f6b82, glassLight: 0x86a6bd,
  red: 0xb8382c, terracotta: 0xb8633b, slate: 0x6f7b83, verdigris: 0x7fa595,
  basalt: 0xc9a24b, basaltDark: 0x9e7c30, white: 0xf5f2ea, grey: 0x9a9a96,
  grass: 0x6fa650, grassLight: 0x82b95c, sandBeach: 0xe6d29a, sandWet: 0xcdb680,
  paving: 0xcfc2a2, concrete: 0xa7a7a2, wood: 0x7a5636, gold: 0xf1c85a,
};

export function newOut() {
  return { geoms: [], emissive: [], colliders: [], footprints: [], pois: [] };
}

// Triangular prism: base width w (X), height h (Y), extruded length d (Z); base at y.
export function prism(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3);
  g.rotateX(-Math.PI / 2);
  const k = h / 1.5;
  g.scale(w / 1.7320508, k, d);
  g.translate(0, 0.5 * k, 0);
  colorize(g, color);
  return place(g, x, y, z, ry);
}

// Triangular wedge in plan view (bow of a boat): base width w across X at z, apex at z+l, height h.
export function wedge(w, h, l, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3);
  g.scale(w / 1.7320508, h, l / 1.5);
  g.translate(0, h / 2, l / 3);
  colorize(g, color);
  return place(g, x, y, z, ry);
}

// Cylinder with its axis along local Z, centred at (x, y, z).
export function hcyl(r, len, seg, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  colorize(g, color);
  return place(g, x, y, z, ry);
}

export function disc(r, seg, color, y = 0, x = 0, z = 0) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return flatPoly(pts, color, y);
}

// Ribbon along sample list [{x,z,nx,nz}] between offsets offA..offB (along n) at height y.
export function ribbon(samples, offA, offB, y, color) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    pos.set([s.x + s.nx * offA, y, s.z + s.nz * offA], i * 6);
    pos.set([s.x + s.nx * offB, y, s.z + s.nz * offB], i * 6 + 3);
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return colorize(g, color);
}

export class Part {
  constructor(out, x, z, ry = 0) {
    this.out = out; this.x = x; this.z = z; this.ry = ry;
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  // local -> world position
  wx(lx, lz) { return this.x + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.z - lx * this.s + lz * this.c; }
  _w(g, emissive = false) {
    place(g, this.x, 0, this.z, this.ry);
    (emissive ? this.out.emissive : this.out.geoms).push(g);
    return g;
  }
  add(g) { return this._w(g); }
  glow(g) { return this._w(g, true); }
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(box(w, h, d, color, x, y, z, ry)); }
  glowBox(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(box(w, h, d, color, x, y, z, ry), true); }
  cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(cyl(rt, rb, h, seg, color, x, y, z, ry)); }
  cone(r, h, seg, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(cone(r, h, seg, color, x, y, z, ry)); }
  dome(r, seg, color, x = 0, y = 0, z = 0) { return this._w(dome(r, seg, color, x, y, z)); }
  prism(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(prism(w, h, d, color, x, y, z, ry)); }
  hcyl(r, len, seg, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(hcyl(r, len, seg, color, x, y, z, ry)); }
  glowHcyl(r, len, seg, color, x = 0, y = 0, z = 0, ry = 0) { return this._w(hcyl(r, len, seg, color, x, y, z, ry), true); }
  disc(r, seg, color, y = 0.05, x = 0, z = 0) { return this._w(disc(r, seg, color, y, x, z)); }
  poly(pts, color, y = 0.05) { return this._w(flatPoly(pts, color, y)); }

  // Pointed (Gothic) arch inset on a +Z-facing face at (x, y, z); `ry` turns it to other faces.
  gothic(w, h, color, x, y, z, ry = 0) {
    const bh = h - w * 0.7;
    const a = box(w, bh, 0.5, color, 0, 0, 0);
    const b = prism(w, w * 0.7, 0.5, color, 0, bh, 0);
    for (const g of [a, b]) { place(g, x, y, z, ry); this._w(g); }
  }
  // Round arch inset (box + half cylinder)
  roundArch(w, h, color, x, y, z, ry = 0) {
    const bh = h - w / 2;
    const a = box(w, bh, 0.5, color, 0, 0, 0);
    const b = hcyl(w / 2, 0.5, 8, color, 0, bh, 0);
    for (const g of [a, b]) { place(g, x, y, z, ry); this._w(g); }
  }

  col(lx, lz, hw, hd, lrot = 0) {
    this.out.colliders.push({ x: this.wx(lx, lz), z: this.wz(lx, lz), hw, hd, rot: this.ry + lrot });
  }
  fp(id, lx, lz, hw, hd, lrot = 0) {
    this.out.footprints.push({ id, x: this.wx(lx, lz), z: this.wz(lx, lz), hw, hd, rot: this.ry + lrot });
  }
}
