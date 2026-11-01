// Distant visuals (non-collidable, beyond the playable map): Chowpatty shore + Malabar Hill across Back Bay to the NW
// with residential towers (lit windows at night) and the Necklace continuing round the bay. Run BEFORE buildSea.
import * as THREE from 'three';
import { mat, PRIM } from './geom.js';
import { facadeVec } from './buildings.js';
import { pointInPoly } from './roads.js';

export function buildFar(game, ctx) {
  const { batch, glows } = ctx;
  const rnd = mulb(99);
  // Chowpatty / Girgaum shoreline from the MD exit, curving west to the foot of Malabar Hill
  const shore = [];
  const C = [[-600, -545], [-660, -600], [-740, -648], [-830, -678], [-920, -690], [-1000, -688], [-1060, -672]];
  for (let i = 0; i < C.length - 1; i++) for (let t = 0; t < 1; t += 0.25) shore.push([C[i][0] + (C[i + 1][0] - C[i][0]) * t, C[i][1] + (C[i + 1][1] - C[i][1]) * t]);
  shore.push(C[C.length - 1]);
  const land = [...shore, [-1500, -760], [-1500, -1800], [-560, -1800], [-560, -560]];
  ctx.farLandPolys.push(land);
  const shape = new THREE.Shape(land.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  batch.add('paving', g, null, { color: '#6d6a64', at: { x: -900, z: -900 } });
  // Malabar Hill: low-poly ellipsoid rising from the sea
  const H = { x: -1240, z: -820, rx: 330, rz: 260, ry: 115, y0: -25 };
  batch.add('facade', new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), mat(H.x, H.y0, H.z, 0.3, H.rx, H.ry, H.rz), { color: '#33452e', facade: [3, 3, 9, 0.5 + 40] });
  const hillY = (x, z) => { const d = 1 - ((x - H.x) / H.rx) ** 2 - ((z - H.z) / H.rz) ** 2; return d > 0 ? H.y0 + H.ry * Math.sqrt(d) : -1e9; };
  const cols = ['#c9c4b8', '#b8b2a6', '#d8d2c6', '#a9aba6', '#e2ddd2'];
  let n = 0;
  for (let k = 0; k < 400 && n < 70; k++) {
    const x = H.x + (rnd() - 0.5) * H.rx * 1.7, z = H.z + (rnd() - 0.5) * H.rz * 1.7;
    let y = hillY(x, z);
    const onShore = y < 3;
    if (onShore) { // or along the Chowpatty / Walkeshwar shore strip
      const s = shore[Math.floor(rnd() * shore.length)]; const bx = s[0] + (rnd() - 0.2) * 30, bz = s[1] - 30 - rnd() * 120;
      if (bx > -560) continue;
      addTower(bx, bz, 0, 22 + rnd() * 40);
    } else addTower(x, z, y - 3, 30 + rnd() * 70);
  }
  function addTower(x, z, y, h) {
    const w = 14 + rnd() * 12, d = 12 + rnd() * 10, st = rnd() < 0.3 ? 4 : 3;
    batch.add('facade', PRIM.box, mat(x, y + h / 2, z, rnd() * 0.6, w, h, d), { color: cols[n % cols.length], facade: facadeVec(3, 3.2, st, rnd(), 4), at: { x: -1000, z: -800 } });
    if (h > 60) glows.add(x, y + h + 0.5, z, '#ff3b2e', 2.5, 1, 1.6);
    n++;
  }
  // Necklace continuing round the bay
  for (let i = 0; i < shore.length; i++) {
    const [x, z] = shore[i];
    const nx = i < shore.length - 1 ? shore[i + 1][0] - x : 1, nz = i < shore.length - 1 ? shore[i + 1][1] - z : 0, L = Math.hypot(nx, nz) || 1;
    for (const t of [0, 0.5]) {
      const px = x + nx * t, pz = z + nz * t, ox = (nz / L) * 3, oz = (-nx / L) * 3;
      if (i === shore.length - 1 && t) continue;
      glows.add(px + ox, 9, pz + oz, '#ffb45c', 4.5, 0, 2.4);
      ctx.reflectLights.push({ x: px + ox, y: 9, z: pz + oz, i: 0.8 });
    }
  }
  // scattered warm lights on the hill (bungalows, street lamps)
  for (let k = 0; k < 120; k++) {
    const x = H.x + (rnd() - 0.5) * H.rx * 1.8, z = H.z + (rnd() - 0.5) * H.rz * 1.8, y = hillY(x, z);
    if (y < 2) continue;
    glows.add(x, y + 2, z, rnd() < 0.7 ? '#ffc070' : '#fff2d8', 3, 0, 1.4);
  }
  // ---- Cuffe Parade across the water to the south: a shoreline strip with a cluster of high-rises + lights
  const cp = [[-110, 470], [-170, 540], [-260, 612], [-380, 654], [-520, 672], [-700, 700], [-700, 960], [-110, 960]];
  ctx.farLandPolys.push(cp);
  const cshape = new THREE.Shape(cp.map(([x, z]) => new THREE.Vector2(x, -z)));
  batch.add('facade', new THREE.ShapeGeometry(cshape).rotateX(-Math.PI / 2), null, { color: '#c4b79b', facade: [3,3,9,10.5], at: { x: -400, z: 800 } });
  const ccols = ['#d9d3c4', '#b9bcbe', '#e3d6bd', '#9eaab2', '#cdb9a3', '#e8e2d6'];
  let nc = 0;
  for (let k = 0; k < 900 && nc < 46; k++) {
    const x = -560 + rnd() * 450, z = 640 + rnd() * 240;
    if (!pointInPoly(x, z, cp) || !pointInPoly(x, z - 34, cp) || !pointInPoly(x - 20, z - 20, cp)) continue;
    const behind = Math.min(1, Math.max(0, (z - 650) / 220)), h = 45 + rnd() * 70 + behind * 40, w = 18 + rnd() * 12, d = 16 + rnd() * 10;
    batch.add('facade', PRIM.box, mat(x, h / 2, z, rnd() * 0.5 - 0.25, w, h, d), { color: ccols[nc % ccols.length], facade: facadeVec(3, 3.2, nc % 3 ? 3 : 4, rnd(), 4), at: { x: -400, z: 800 } });
    if (h > 70) glows.add(x, h + 0.5, z, '#ff3b2e', 2.5, 1, 1.6);
    nc++;
  }
  for(let i=1;i<6;i++) {
    const [ax,az]=cp[i-1],[bx,bz]=cp[i];
    for(let k=0;k<4;k++) {
      const t=(k+.5)/4,x=ax+(bx-ax)*t,z=az+(bz-az)*t+20;
      if(!pointInPoly(x-8,z-8,cp)||!pointInPoly(x+8,z+8,cp)) continue;
      const h=8+(k%3)*4;
      batch.add('facade',PRIM.box,mat(x,h/2,z,0,14,h,12),{color:['#c6b4a0','#b9c4b5','#ded0b7'][k%3],facade:facadeVec(2.8,3,15,.1+k*.17,1),at:{x:-400,z:800}});
    }
  }
  // shore lights along Cuffe Parade (reflected in the bay at night)
  for (let i = 0; i < cp.length - 4; i++) {
    const [ax, az] = cp[i], [bx, bz] = cp[i + 1];
    for (let t = 0; t < 1; t += 0.2) { const px = ax + (bx - ax) * t, pz = az + (bz - az) * t + 6; glows.add(px, 8, pz, '#ffb45c', 4.2, 0, 2.2); ctx.reflectLights.push({ x: px, y: 8, z: pz, i: 0.7 }); }
  }
  return { towers: n, cuffe: nc };
}

function mulb(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
