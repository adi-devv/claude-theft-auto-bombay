import { prepare } from './collision.js';

/** Uniform grid over static colliders ({x,z,hw,hd,rot} boxes or {x,z,r} circles). */
export class SpatialGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
    this.stamp = 0;
    this.count = 0;
  }
  _key(ix, iz) {
    return ix * 100003 + iz;
  }
  insert(col) {
    prepare(col);
    col._stamp = 0;
    const rad = col._rad;
    const c = this.cell;
    const x0 = Math.floor((col.x - rad) / c);
    const x1 = Math.floor((col.x + rad) / c);
    const z0 = Math.floor((col.z - rad) / c);
    const z1 = Math.floor((col.z + rad) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let l = this.map.get(k);
        if (!l) this.map.set(k, (l = []));
        l.push(col);
      }
    }
    this.count++;
  }
  insertAll(list) {
    for (const c of list) this.insert(c);
  }
  /** Append colliders near (x,z) within radius r to out. Returns out. */
  query(x, z, r, out = []) {
    const c = this.cell;
    const st = ++this.stamp;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const l = this.map.get(this._key(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const col = l[i];
          if (col._stamp !== st) {
            col._stamp = st;
            out.push(col);
          }
        }
      }
    }
    return out;
  }
}
