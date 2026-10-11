// Static geometry is merged per 300 m chunk (one draw call each).
import * as THREE from 'three';
import { merge, staticMaterial } from '../utils/geom.js';
import { RawBuilder } from './rawGeo.js';
import { CONFIG } from '../core/config.js';

export class Chunks {
  constructor(size = CONFIG.chunkSize) {
    this.size = size;
    this.map = new Map();
  }
  _chunk(x, z) {
    const cx = Math.floor((x - CONFIG.bounds.minX) / this.size);
    const cz = Math.floor((z - CONFIG.bounds.minZ) / this.size);
    const k = `${cx},${cz}`;
    let c = this.map.get(k);
    if (!c) this.map.set(k, (c = { raw: new RawBuilder(), geoms: [] }));
    return c;
  }
  /** RawBuilder of the chunk containing (x,z). */
  rawAt(x, z) {
    return this._chunk(x, z).raw;
  }
  /** Add a world-positioned BufferGeometry; assigned by bounding-box centre. */
  addGeom(geo) {
    if (!geo) return;
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    this._chunk((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2).geoms.push(geo);
  }
  addGeoms(list) {
    for (const g of list) this.addGeom(g);
  }
  build(material = staticMaterial()) {
    const group = new THREE.Group();
    group.name = 'chunks';
    for (const [key, c] of this.map) {
      const raw = c.raw.build();
      const list = raw ? [raw, ...c.geoms] : c.geoms;
      const geo = merge(list);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `chunk_${key}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.map.clear();
    return group;
  }
}
