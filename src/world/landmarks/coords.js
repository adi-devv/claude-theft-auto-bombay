// Local copy of the PLAN section 2 coordinates the landmarks need (metres, +X east, +Z south).
// Kept here so the landmarks module has no hard dependency on mapData.js.
import * as THREE from 'three';

export const MD_PTS = [
  [-330, 880], [-360, 700], [-390, 500], [-420, 300], [-455, 100],
  [-500, -100], [-560, -300], [-630, -500], [-700, -700], [-780, -900],
];
export const MD_WIDTH = 23;
export const MD_HALF_BAND = MD_WIDTH / 2 + 3; // carriageway + 3 m footpath = 14.5
export const WALL_OFFSET = 22; // sea wall inner face, seaward of the centreline

export const POS = {
  J_NP: [-300, 860],
  J_MDVN: [-495, -90],
  J_CG: [-260, -120],
  J_FF: [200, -160],
  J_KG: [280, 250],
  J_REGAL: [330, 520],
  J_CSMT: [480, -760],
  J_METRO: [120, -880],
  CSMT: [600, -820],
  GATEWAY: [620, 640],
  TAJ: [530, 700],
  RAJABAI: [40, 250],
  CHURCHGATE: [-220, -175],
  AIR_INDIA: [-250, 915],
  WANKHEDE: [-430, -380],
  CHOWPATTY: [-760, -940],
  TAXI_STAND: [-240, -150],
};

export const MAIDANS = {
  oval: { x0: -230, x1: -40, z0: 40, z1: 440 },
  cross: { x0: -180, x1: -30, z0: -380, z1: -200 },
  azad: { x0: 180, x1: 420, z0: -640, z1: -420 },
};

// Approximate road centrelines (PLAN section 2) used for tree placement and clearance tests.
// half = half of carriageway + footpaths.
export const ROADS = [
  { id: 'marine_drive', half: MD_HALF_BAND, pts: MD_PTS },
  { id: 'karve', half: 11, pts: [[-300, 860], [-260, 500], [-250, 40], [-260, -120], [-330, -500], [-420, -900]] },
  { id: 'veer_nariman', half: 11, pts: [[-495, -90], [-260, -120], [-30, -140], [200, -160]] },
  { id: 'dn', half: 11, pts: [[200, -160], [300, -420], [400, -620], [480, -760]] },
  { id: 'mg', half: 11, pts: [[120, -880], [150, -500], [200, -160], [280, 250], [330, 520]] },
  { id: 'mahapalika', half: 11, pts: [[120, -880], [480, -760]] },
  { id: 'marine_lines_a', half: 11, pts: [[-420, -900], [-780, -900]] },
  { id: 'marine_lines_b', half: 11, pts: [[-420, -900], [120, -880]] },
  { id: 'madame_cama', half: 11, pts: [[-385, 520], [-40, 480], [330, 520]] },
  { id: 'colaba', half: 11, pts: [[330, 520], [340, 980]] },
  { id: 'apollo', half: 8, pts: [[330, 520], [480, 600], [600, 600], [600, 690]] },
  { id: 'cuffe', half: 11, pts: [[-300, 860], [-100, 900], [340, 890]] },
  { id: 'pdmello', half: 11, pts: [[480, -760], [700, -500], [700, 300], [620, 560]] },
  { id: 'mayo', half: 7.5, pts: [[60, -140], [60, 480]] },
  { id: 'fort_n450', half: 7.5, pts: [[200, -450], [700, -450]] },
  { id: 'fort_n80', half: 7.5, pts: [[200, 80], [700, 80]] },
  { id: 'fort_n300', half: 7.5, pts: [[200, 300], [700, 300]] },
  { id: 'fort_ns450', half: 7.5, pts: [[450, -620], [450, 300]] },
];

export function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

// Distance from (x, z) to the nearest road, minus that road's half band (<0 means on a road).
export function roadClearance(x, z, skip = null) {
  let best = Infinity;
  for (const r of ROADS) {
    if (skip && skip.includes(r.id)) continue;
    best = Math.min(best, distToPolyline(r.pts, x, z) - r.half);
  }
  return best;
}

let _md = null;
// Marine Drive as an arc-length parametrised Catmull-Rom curve (south -> north).
// at(s) -> { x, z, tx, tz, nx, nz, ex, ez } where (nx,nz) is the SEAWARD (west) unit normal
// and (ex,ez) the landward (east) one.
export function marineDrive() {
  if (_md) return _md;
  const curve = new THREE.CatmullRomCurve3(MD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const length = curve.getLength();
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const at = (s) => {
    const u = Math.max(0, Math.min(1, s / length));
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    const tx = t.x, tz = t.z;
    return { x: p.x, z: p.z, tx, tz, nx: tz, nz: -tx, ex: -tz, ez: tx };
  };
  // arc-length of the sample nearest to a point
  const sOf = (x, z) => {
    let best = 0, bd = Infinity;
    for (let s = 0; s <= length; s += 2) {
      const q = at(s);
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  _md = { curve, length, at, sOf };
  return _md;
}

// Seeded fallback rng (mulberry32) so buildLandmarks() works without arguments.
export function defaultSeededFn(seed = 1337) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
