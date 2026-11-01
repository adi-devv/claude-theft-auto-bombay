// Traffic signals (Traffic-owned): phase logic for the junctions listed in mapdata SIGNALS + instanced signal heads.
//   const sig = createSignals(game, net);  sig.update(dt);  sig.state(node, approachKey) -> {s: 0 green|1 amber|2 red, t: secs to change}
// Approaches are grouped by axis (opposite directions share a phase). Visuals: one InstancedMesh for all dark parts
// (poles, mast arms, head housings, back-plates), one for the lamps (per-instance colour) and one additive Points for the glow.
import { SIGNALS } from '../world/mapdata.js';
import { TrafficNet, KIND_RANK } from './trafficNet.js';

const AMBER = 3.0, ALL_RED = 1.8;
export const GREEN = 0, YELLOW = 1, RED = 2;

const LAMP_ON = [[1.0, 0.16, 0.1], [1.0, 0.72, 0.1], [0.25, 1.0, 0.45]];   // red, amber, green (lit)
const LAMP_OFF = [[0.16, 0.03, 0.03], [0.17, 0.11, 0.02], [0.03, 0.12, 0.06]];

function glowTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createSignals(game, net) {
  const { THREE } = game;
  const rng = game.rng;
  const ctrl = [];                // controllers
  const byNode = new Map();       // node.id -> ctrl
  const roads = game.roads;

  for (const id of SIGNALS) {
    const node = roads.nodes.get(id);
    if (!node || node.ai.kind !== 'junction') continue;
    // approaches (arrival direction of travel)
    const apps = [];
    for (const [key, list] of node.ai.byApproach) {
      if (!list.length) continue;
      const mv = list[0];
      const inEdge = mv.in.edge, inDir = mv.in.dir;
      const p = net.lanePiece(inEdge, inDir, 0);
      const h = net._endHeading(p);
      apps.push({ key, edge: inEdge, dir: inDir, hx: h.x, hz: h.z, axis: Math.atan2(h.x, h.z) % Math.PI, rank: KIND_RANK[inEdge.kind] || 0, lanes: inEdge.lanes });
    }
    // cluster by axis (parallel / anti-parallel approaches share a phase)
    const groups = [];
    for (const a of apps) {
      let g = groups.find((gg) => { let d = Math.abs(gg.axis - a.axis) % Math.PI; d = Math.min(d, Math.PI - d); return d < 0.62; });
      if (!g) { g = { axis: a.axis, apps: [], keys: new Set(), score: 0 }; groups.push(g); }
      g.apps.push(a); g.keys.add(a.key); g.score = Math.max(g.score, a.rank * 4 + a.lanes);
    }
    groups.sort((x, y) => y.score - x.score);
    for (const g of groups) g.green = 9 + g.score * 1.6;
    const cycle = groups.reduce((s, g) => s + g.green + AMBER + ALL_RED, 0);
    const c = { node, groups, cycle, t: rng() * cycle, state: new Map(), heads: [] };
    ctrl.push(c); byNode.set(node.id, c);
  }

  // ---------------------------------------------------------------- logic
  function evaluate(c) {
    let t = c.t % c.cycle;
    for (const g of c.groups) { g.st = RED; g.left = 1; }
    for (const g of c.groups) {
      const span = g.green + AMBER + ALL_RED;
      if (t < span) {
        if (t < g.green) { g.st = GREEN; g.left = g.green - t; }
        else if (t < g.green + AMBER) { g.st = YELLOW; g.left = g.green + AMBER - t; }
        break;
      }
      t -= span;
    }
    for (const g of c.groups) for (const k of g.keys) {
      let o = c.state.get(k); if (!o) c.state.set(k, (o = { s: RED, t: 0 }));
      o.s = g.st; o.t = g.left;
    }
  }
  for (const c of ctrl) evaluate(c);

  // ---------------------------------------------------------------- visuals
  const heads = [];   // {x,y,z, rot(yaw facing traffic), c, group, lampIdx}
  const darkParts = []; // {x,y,z, sx,sy,sz, rot}
  for (const c of ctrl) {
    for (const g of c.groups) for (const a of g.apps) {
      const e = a.edge, n = c.node;
      const margin = net.stopMargin(e, a.dir);
      const s = a.dir > 0 ? e.ai.sB - margin : e.ai.sA + margin;
      const leftOff = (e.width / 2 + 0.75) * (a.dir > 0 ? 1 : -1);
      const P = net.offPoint(e, s - a.dir * 0.4, leftOff);
      const yaw = Math.atan2(-a.hx, -a.hz);                 // head faces back towards approaching traffic
      const hxr = -a.hz, hzr = a.hx;                        // unit vector pointing to the RIGHT of travel (towards the road)
      // pole
      darkParts.push({ x: P.x, y: 1.9, z: P.z, sx: 0.16, sy: 3.8, sz: 0.16, rot: yaw });
      const mast = e.kind === 'arterial' || e.kind === 'boulevard';
      const addHead = (x, z, y) => {
        darkParts.push({ x, y, z, sx: 0.44, sy: 1.1, sz: 0.3, rot: yaw });
        darkParts.push({ x: x - Math.sin(yaw) * 0.1, y, z: z - Math.cos(yaw) * 0.1, sx: 0.84, sy: 1.46, sz: 0.04, rot: yaw }); // back-plate border
        heads.push({ x, z, y, yaw, c, g });
      };
      addHead(P.x, P.z, 3.05);
      if (mast) {
        const L = Math.min(e.width / 2 - 1.2, 5.2);
        const ex = P.x + hxr * L, ez = P.z + hzr * L;
        darkParts.push({ x: (P.x + ex) / 2, y: 3.75, z: (P.z + ez) / 2, sx: 0.1, sy: 0.1, sz: L, rot: Math.atan2(hxr, hzr) });
        addHead(ex, ez, 3.15);
      }
    }
  }

  const group = new THREE.Group(); group.name = 'signals';
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7, metalness: 0.4 });
  const dark = new THREE.InstancedMesh(box, darkMat, Math.max(1, darkParts.length));
  const dummy = new THREE.Object3D();
  darkParts.forEach((p, i) => { dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.set(p.sx, p.sy, p.sz); dummy.updateMatrix(); dark.setMatrixAt(i, dummy.matrix); });
  dark.count = darkParts.length; dark.castShadow = false; dark.frustumCulled = false; group.add(dark);

  const lampGeo = new THREE.CircleGeometry(0.135, 10);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, Math.max(1, heads.length * 3));
  lamps.frustumCulled = false;
  const glowPos = new Float32Array(Math.max(1, heads.length * 3) * 3), glowCol = new Float32Array(Math.max(1, heads.length * 3) * 3);
  heads.forEach((h, i) => {
    for (let k = 0; k < 3; k++) {
      const y = h.y + 0.34 - k * 0.34, sx = Math.sin(h.yaw), cz = Math.cos(h.yaw);
      dummy.position.set(h.x + sx * 0.16, y, h.z + cz * 0.16);
      dummy.rotation.set(0, h.yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      lamps.setMatrixAt(i * 3 + k, dummy.matrix);
      glowPos.set([h.x + sx * 0.3, y, h.z + cz * 0.3], (i * 3 + k) * 3);
    }
  });
  lamps.count = heads.length * 3;
  lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, heads.length * 3) * 3), 3);
  group.add(lamps);

  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
  glowGeo.setDrawRange(0, heads.length * 3);
  glowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);
  const glowMat = new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: true, map: glowTexture(THREE), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; glow.renderOrder = 5;
  group.add(glow);
  game.scene.add(group);

  function paint() {
    const ic = lamps.instanceColor.array;
    heads.forEach((h, i) => {
      const st = h.g.st;
      for (let k = 0; k < 3; k++) {
        const lit = k === st;
        const col = lit ? LAMP_ON[k] : LAMP_OFF[k];
        ic.set(col, (i * 3 + k) * 3);
        glowCol.set(lit ? [LAMP_ON[k][0] * 0.9, LAMP_ON[k][1] * 0.9, LAMP_ON[k][2] * 0.9] : [0, 0, 0], (i * 3 + k) * 3);
      }
    });
    lamps.instanceColor.needsUpdate = true;
    glowGeo.attributes.color.needsUpdate = true;
  }
  paint();

  let lastSig = '', visT = 0;
  function update(dt) {
    let changed = false;
    for (const c of ctrl) {
      c.t += dt;
      const before = c.groups.map((g) => g.st).join('');
      evaluate(c);
      if (before !== c.groups.map((g) => g.st).join('')) changed = true;
    }
    if (changed) paint();
    visT += dt;
    if (visT > 0.5) {
      visT = 0;
      const ll = game.city && game.city.lightLevel != null ? game.city.lightLevel : 1;
      glowMat.opacity = 0.35 + 0.65 * (1 - ll);
      glowMat.size = 1.6 + 1.6 * (1 - ll);
    }
  }

  return {
    update,
    has: (node) => byNode.has(node.id),
    state(node, key) { const c = byNode.get(node.id); return c ? c.state.get(key) || null : null; },
    ctrl, heads, group,
    /** Test helper: force a group index green at a node. */
    debugSet(nodeId, gi) { const c = byNode.get(nodeId); if (!c) return; let t = 0; for (let i = 0; i < gi; i++) t += c.groups[i].green + AMBER + ALL_RED; c.t = t; evaluate(c); paint(); },
  };
}
