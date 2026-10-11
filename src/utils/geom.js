// Shared low-poly geometry helpers. Every geometry returned here is indexed,
// has position + normal + color attributes and no uv, so any mix of them can be
// passed to merge() without mergeGeometries returning null.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function colorize(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  if (!geo.index) {
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    geo.setIndex(idx);
  }
  return geo;
}

// Apply translation (x, y, z) and rotation (rx, ry, rz) in radians.
export function place(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

// Box whose BASE sits at y (so a building at y=0 rests on the ground).
export function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  colorize(g, color);
  return place(g, x, y, z, ry);
}

// Cylinder whose BASE sits at y.
export function cyl(rTop, rBot, h, seg, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(0, h / 2, 0);
  colorize(g, color);
  return place(g, x, y, z, ry);
}

// Cone whose BASE sits at y.
export function cone(r, h, seg, color, x = 0, y = 0, z = 0, ry = 0) {
  return cyl(0, r, h, seg, color, x, y, z, ry);
}

// Low-poly dome (upper hemisphere) whose base circle sits at y.
export function dome(r, seg, color, x = 0, y = 0, z = 0) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(3, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2);
  colorize(g, color);
  return place(g, x, y, z);
}

// Flat horizontal polygon at height y from [[x, z], ...] points.
export function flatPoly(points, color, y = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); // shape (x, -z) in XY plane -> XZ plane with +Z south
  g.translate(0, y, 0);
  return colorize(g, color);
}

// Merge a list of geometries from the helpers above. Disposes the inputs.
export function merge(list) {
  const valid = list.filter(Boolean);
  if (valid.length === 0) return null;
  const out = mergeGeometries(valid, false);
  for (const g of valid) g.dispose();
  return out;
}

// Shared material for all static vertex-coloured geometry.
let _staticMat = null;
export function staticMaterial() {
  if (!_staticMat) _staticMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return _staticMat;
}
