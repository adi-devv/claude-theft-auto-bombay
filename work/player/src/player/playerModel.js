// The protagonist: a single low-poly Bombay lad — open short-sleeve printed shirt over a white banian (vest),
// rolled jeans, kolhapuri-brown sneakers, side-parted black hair and a moustache. Built facing +Z.
// All animation is procedural: animate(dt, params) rebuilds the pose every frame from a neutral rest pose.
//
// Joint conventions (rotation about local X): NEGATIVE = limb swings FORWARD (+Z), positive = backward.
// Knees bend with positive X, elbows bend (forearm forward/up) with negative X.
// The character's LEFT side is +X (model faces +Z).
import * as THREE from 'three';

const SKIN = 0x8a5638, SKIN_DARK = 0x6e4029, HAIR = 0x15100e, JEANS = 0x2c4a6f, JEANS_LIGHT = 0x5b7aa0;
const VEST = 0xece6da, SOLE = 0xefe9dc, SHOE = 0x6b3f22;

function shirtTexture({ base = '#13706f', band = true } = {}) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 128);
  // deterministic little floral print: hibiscus-ish five-petal flowers + leaves
  let s = 1337; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = r() * 256, y = r() * 128, k = 3 + r() * 4;
    g.save(); g.translate(x, y); g.rotate(r() * 6.28);
    g.fillStyle = '#2f9a6a';
    g.beginPath(); g.ellipse(k * 1.6, 0, k * 1.4, k * 0.55, 0.4, 0, 6.28); g.fill();
    g.fillStyle = r() < 0.5 ? '#f3c95c' : '#f07a5a';
    for (let p = 0; p < 5; p++) { g.rotate(1.2566); g.beginPath(); g.ellipse(k * 0.75, 0, k * 0.75, k * 0.45, 0, 0, 6.28); g.fill(); }
    g.fillStyle = '#fff1cf'; g.beginPath(); g.arc(0, 0, k * 0.35, 0, 6.28); g.fill();
    g.restore();
  }
  if (band) {
    // the open front: white vest showing through (u ~ 0 and ~1 is the cylinder's front), dark placket edge
    const w = 18;
    g.fillStyle = '#ece6da'; g.fillRect(0, 0, w, 128); g.fillRect(256 - w, 0, w, 128);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(w, 0, 3, 128); g.fillRect(256 - w - 3, 0, 3, 128);
    // buttons on the placket
    g.fillStyle = '#f6efe0';
    for (let y = 22; y < 128; y += 26) { g.beginPath(); g.arc(w + 7, y, 2.2, 0, 6.28); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function createPlayerModel() {
  const mats = [];
  const M = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra }); mats.push(m); return m; };
  const skin = M(SKIN, { roughness: 0.65 }), skinDark = M(SKIN_DARK), hair = M(HAIR, { roughness: 0.55 });
  const jeans = M(JEANS, { roughness: 0.9 }), jeansLight = M(JEANS_LIGHT, { roughness: 0.9 });
  const shoe = M(SHOE, { roughness: 0.7 }), sole = M(SOLE), dark = M(0x0c0a0a, { roughness: 0.4 }), white = M(0xf4efe6, { roughness: 0.4 });
  const shirtTex = shirtTexture();
  const shirt = M(0xffffff, { map: shirtTex, roughness: 0.85 });
  const capTex = shirtTex.clone(); capTex.offset.x = -0.25; capTex.needsUpdate = true; // sphere u=0.25 is the front
  const shirtCap = M(0xffffff, { map: capTex, roughness: 0.85 });
  const sleeveTex = shirtTexture({ band: false });
  const sleeve = M(0xffffff, { map: sleeveTex, roughness: 0.85 });
  const belt = M(0x2a1a10, { roughness: 0.5 });

  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(G(geo), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = false; parent.add(m); return m;
  };
  const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  // cylinder hanging DOWN from its group's origin
  const limb = (rTop, rBot, len, mat, parent, seg = 8) => { const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1); g.translate(0, -len / 2, 0); return mesh(g, mat, parent); };

  const root = new THREE.Group(); root.name = 'player';
  const body = grp(root);                 // whole-body tilt (falls), pivot at the feet
  const HIP_Y = 0.94;
  const hips = grp(body, 0, HIP_Y, 0);
  // pelvis + belt
  mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.2, 10), jeans, hips, 0, -0.04, 0).scale.z = 0.72;
  mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.035, 10), belt, hips, 0, 0.055, 0).scale.z = 0.72;

  const spine = grp(hips, 0, 0.07, 0);
  // torso: printed shirt cylinder (open front shows the vest), slightly tapered to the waist
  const torso = mesh(new THREE.CylinderGeometry(0.19, 0.165, 0.5, 12, 1, true), shirt, spine, 0, 0.2, 0);
  torso.scale.z = 0.64;
  // shirt tail hanging a little over the jeans
  mesh(new THREE.CylinderGeometry(0.166, 0.172, 0.09, 12, 1, true), shirt, spine, 0, -0.085, 0).scale.z = 0.66;
  // shoulders / upper chest cap
  const cap = mesh(new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), shirtCap, spine, 0, 0.445, 0);
  cap.scale.set(1.08, 0.42, 0.66);
  // inner side of the shirt (so the open-ended cylinder never shows a hole from below)
  const inner = new THREE.MeshStandardMaterial({ color: 0x0f4f4e, side: THREE.BackSide, roughness: 1 }); mats.push(inner);
  mesh(new THREE.CylinderGeometry(0.188, 0.163, 0.58, 10, 1, true), inner, spine, 0, 0.16, 0).scale.z = 0.63;
  // collar points
  for (const s of [1, -1]) {
    const col = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.06), sleeve, spine, s * 0.06, 0.49, 0.085);
    col.rotation.set(0.5, 0, s * -0.5);
  }

  const neck = grp(spine, 0, 0.49, 0.005);
  mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.1, 8), skin, neck, 0, 0.03, 0);
  const head = grp(neck, 0, 0.09, 0.005);
  const skull = mesh(new THREE.SphereGeometry(0.108, 14, 10), skin, head, 0, 0.1, 0.0); skull.scale.set(0.9, 1.12, 1.0);
  const jaw = mesh(new THREE.SphereGeometry(0.085, 10, 8), skin, head, 0, 0.045, 0.022); jaw.scale.set(0.95, 0.8, 0.95);
  // hair: crown + back, side parting fringe
  const crown = mesh(new THREE.SphereGeometry(0.116, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, head, 0, 0.12, -0.008); crown.scale.set(0.93, 1.05, 1.06);
  const back = mesh(new THREE.SphereGeometry(0.105, 10, 8), hair, head, 0, 0.09, -0.03); back.scale.set(0.92, 1.0, 0.85);
  const fringe = mesh(new THREE.BoxGeometry(0.15, 0.035, 0.05), hair, head, 0.012, 0.19, 0.075); fringe.rotation.set(0.35, 0, -0.12);
  for (const s of [1, -1]) mesh(new THREE.BoxGeometry(0.02, 0.06, 0.05), hair, head, s * 0.094, 0.11, 0.0); // sideburns
  // face
  for (const s of [1, -1]) {
    mesh(new THREE.SphereGeometry(0.012, 6, 4), white, head, s * 0.036, 0.115, 0.093);
    mesh(new THREE.SphereGeometry(0.0075, 6, 4), dark, head, s * 0.036, 0.115, 0.103);
    const brow = mesh(new THREE.BoxGeometry(0.036, 0.009, 0.012), hair, head, s * 0.037, 0.138, 0.098); brow.rotation.z = s * 0.12;
    mesh(new THREE.SphereGeometry(0.022, 6, 5), skin, head, s * 0.1, 0.1, 0.0).scale.set(0.45, 1, 0.8); // ears
  }
  const nose = mesh(new THREE.ConeGeometry(0.016, 0.04, 5), skinDark, head, 0, 0.09, 0.11); nose.rotation.x = Math.PI / 2 + 0.3;
  const mous = mesh(new THREE.BoxGeometry(0.068, 0.016, 0.022), hair, head, 0, 0.06, 0.1); mous.rotation.x = -0.15;
  for (const s of [1, -1]) { const tip = mesh(new THREE.BoxGeometry(0.016, 0.024, 0.016), hair, head, s * 0.036, 0.05, 0.094); tip.rotation.z = s * 0.3; }
  mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), skinDark, head, 0, 0.038, 0.1); // mouth

  // arms
  const arm = (s) => {
    const shoulder = grp(spine, s * 0.215, 0.43, -0.005);
    mesh(new THREE.SphereGeometry(0.068, 10, 8), sleeve, shoulder, 0, -0.005, 0);
    limb(0.05, 0.044, 0.29, skin, shoulder);
    limb(0.068, 0.062, 0.17, sleeve, shoulder, 10);           // short sleeve over the upper arm
    const elbow = grp(shoulder, 0, -0.29, 0);
    mesh(new THREE.SphereGeometry(0.044, 8, 6), skin, elbow);
    limb(0.043, 0.036, 0.25, skin, elbow);
    const wrist = grp(elbow, 0, -0.25, 0);
    const hand = mesh(new THREE.BoxGeometry(0.06, 0.09, 0.075), skinDark, wrist, 0, -0.045, 0.004);
    hand.geometry.translate(0, 0, 0);
    mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), skinDark, wrist, -s * 0.03, -0.035, 0.03); // thumb
    return { shoulder, elbow, wrist, s };
  };
  const armL = arm(1), armR = arm(-1);

  // legs
  const leg = (s) => {
    const hip = grp(hips, s * 0.088, -0.03, 0);
    limb(0.078, 0.06, 0.42, jeans, hip, 10);
    const knee = grp(hip, 0, -0.42, 0);
    mesh(new THREE.SphereGeometry(0.06, 8, 6), jeans, knee);
    limb(0.058, 0.05, 0.4, jeans, knee, 10);
    mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 10), jeansLight, knee, 0, -0.36, 0); // rolled cuff
    const ankle = grp(knee, 0, -0.41, 0);
    mesh(new THREE.BoxGeometry(0.095, 0.075, 0.245), shoe, ankle, 0, -0.045, 0.05);
    mesh(new THREE.BoxGeometry(0.1, 0.03, 0.255), sole, ankle, 0, -0.085, 0.05);
    return { hip, knee, ankle, s };
  };
  const legL = leg(1), legR = leg(-1);

  // ---- animation state ----
  const st = { phase: 0, t: 0, move: 0, run: 0, sprint: 0, air: 0, guard: 0, lean: 0, bank: 0, look: 0, crouch: 0 };

  function resetPose() {
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
    hips.position.set(0, HIP_Y, 0); hips.rotation.set(0, 0, 0);
    spine.rotation.set(0, 0, 0); neck.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    for (const a of [armL, armR]) { a.shoulder.rotation.set(0, 0, a.s * 0.09); a.elbow.rotation.set(-0.12, 0, 0); a.wrist.rotation.set(0, 0, 0); }
    for (const l of [legL, legR]) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); l.ankle.rotation.set(0, 0, 0); }
  }

  /**
   * params: { speed, sprint (0/1), airborne, vy, turn (rad/s), action, actionT, punchIdx, guard (0/1) }
   * action: 'none' | 'punch' | 'enter' | 'exit' | 'pull' | 'down' | 'getup' | 'tumble' | 'busted' | 'wasted' | 'hit'
   */
  function animate(dt, P) {
    st.t += dt;
    const speed = P.speed || 0;
    st.move = damp(st.move, clamp(speed / 1.2, 0, 1), 10, dt);
    st.run = damp(st.run, clamp((speed - 2.2) / 2.6, 0, 1), 6, dt);
    st.sprint = damp(st.sprint, P.sprint && speed > 5 ? 1 : 0, 5, dt);
    st.air = damp(st.air, P.airborne ? 1 : 0, P.airborne ? 14 : 20, dt);
    st.guard = damp(st.guard, P.guard ? 1 : 0, 10, dt);
    st.bank = damp(st.bank, clamp(-(P.turn || 0) * speed * 0.018, -0.22, 0.22), 6, dt);
    st.lean = damp(st.lean, 0.04 + st.run * 0.12 + st.sprint * 0.14 + clamp(P.accel || 0, -6, 8) * 0.012, 5, dt);
    const stride = lerp(1.35, 2.5, st.run) + st.sprint * 0.5;
    st.phase += dt * speed / stride * Math.PI * 2;
    resetPose();

    const ph = st.phase, m = st.move, run = st.run, t = st.t;
    // --- idle: breathing, weight shift, glance around ---
    const breath = Math.sin(t * 1.7);
    const idle = 1 - m;
    spine.rotation.x += 0.025 * breath * idle;
    hips.position.x += Math.sin(t * 0.55) * 0.012 * idle;
    hips.rotation.z += Math.sin(t * 0.55) * 0.025 * idle;
    neck.rotation.y += (Math.sin(t * 0.37) * 0.35 + Math.sin(t * 0.91) * 0.1) * idle;
    for (const a of [armL, armR]) {
      a.shoulder.rotation.z += a.s * (0.02 + 0.015 * breath) * idle;
      a.shoulder.rotation.x += 0.03 * Math.sin(t * 0.8 + a.s) * idle;
    }

    // --- locomotion ---
    const legAmp = lerp(0.42, 0.82, run) + st.sprint * 0.18;
    const kneeAmp = lerp(0.65, 1.55, run) + st.sprint * 0.25;
    for (const l of [legL, legR]) {
      const p = ph + (l.s > 0 ? 0 : Math.PI);
      const swing = -legAmp * Math.sin(p);
      const knee = kneeAmp * Math.max(0, Math.cos(p)) + 0.1 * run + 0.06;
      l.hip.rotation.x += swing * m;
      l.knee.rotation.x += knee * m;
      l.ankle.rotation.x += (-(swing + knee) * 0.45 + 0.25 * Math.max(0, -Math.cos(p)) * run) * m;
    }
    const armAmp = lerp(0.38, 0.75, run) + st.sprint * 0.2;
    for (const a of [armL, armR]) {
      const p = ph + (a.s > 0 ? Math.PI : 0);
      a.shoulder.rotation.x += -armAmp * Math.sin(p) * m - 0.08 * run * m;
      a.elbow.rotation.x += -(lerp(0.2, 1.35, run) + 0.25 * Math.max(0, -Math.sin(p)) * run) * m;
      a.shoulder.rotation.z += a.s * 0.05 * run * m;
    }
    const bob = lerp(0.025, 0.06, run) * m;
    hips.position.y += -bob * (0.5 + 0.5 * Math.cos(2 * ph + (run > 0.5 ? Math.PI : 0)));
    hips.rotation.y += 0.16 * Math.sin(ph) * m;
    spine.rotation.y += -0.24 * Math.sin(ph) * m;
    spine.rotation.x += st.lean * m;
    neck.rotation.x -= st.lean * 0.6 * m;
    body.rotation.z += st.bank;

    // --- jump / airborne ---
    const air = st.air;
    if (air > 0.01) {
      const up = clamp((P.vy || 0) / 4, -1, 1);
      legL.hip.rotation.x = lerp(legL.hip.rotation.x, -0.75, air); legL.knee.rotation.x = lerp(legL.knee.rotation.x, 1.25, air);
      legR.hip.rotation.x = lerp(legR.hip.rotation.x, 0.15 - 0.25 * up, air); legR.knee.rotation.x = lerp(legR.knee.rotation.x, 0.55, air);
      for (const a of [armL, armR]) {
        a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -0.5 - 0.5 * up, air);
        a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, a.s * 0.55, air);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.6, air);
      }
      spine.rotation.x = lerp(spine.rotation.x, 0.12, air);
    }

    // --- fists up / punch combo ---
    const g = st.guard;
    if (g > 0.01) {
      for (const a of [armL, armR]) {
        a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -0.75, g);
        a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, a.s * 0.3, g);
        a.shoulder.rotation.y = lerp(0, -a.s * 0.35, g);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -1.95, g);
      }
      spine.rotation.x = lerp(spine.rotation.x, 0.1, g);
    }
    if (P.action === 'punch') {
      const dur = P.punchDur || 0.34, u = (P.actionT || 0) / dur;
      const e = u < 0.32 ? smooth(u / 0.32) : 1 - smooth((u - 0.32) / 0.68);
      const idx = (P.punchIdx || 0) % 3;
      const a = idx === 1 ? armL : armR, o = idx === 1 ? armR : armL;
      if (idx < 2) { // straight jab
        a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -1.55, e);
        a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, a.s * 0.05, e);
        a.shoulder.rotation.y = lerp(a.shoulder.rotation.y, -a.s * 0.15, e);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.08, e);
      } else { // hook
        a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -1.45, e);
        a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, a.s * 0.9, e);
        a.shoulder.rotation.y = lerp(a.shoulder.rotation.y, -a.s * 0.9, e);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -1.3, e);
      }
      o.elbow.rotation.x = lerp(o.elbow.rotation.x, -2.1, e);
      spine.rotation.y += -a.s * (idx === 2 ? 0.6 : 0.38) * e;
      hips.rotation.y += -a.s * 0.12 * e;
      spine.rotation.x += 0.08 * e;
      legL.hip.rotation.x += -0.25 * e * (a === armR ? 1 : 0.3); legL.knee.rotation.x += 0.25 * e;
      legR.hip.rotation.x += 0.2 * e; legR.knee.rotation.x += 0.15 * e;
      hips.position.y -= 0.04 * e;
    }

    // --- full-body actions ---
    const A = P.action, T = P.actionT || 0;
    if (A === 'enter' || A === 'exit') {
      // duck into / out of the car: crouch, lean in, lead with one leg
      const u = clamp(T / (P.actionDur || 0.6), 0, 1);
      const c = A === 'enter' ? Math.sin(u * Math.PI) * 0.6 + smooth(u) * 0.5 : Math.sin(u * Math.PI) * 0.6 + (1 - smooth(u)) * 0.5;
      hips.position.y -= 0.32 * c;
      for (const l of [legL, legR]) { l.hip.rotation.x = -1.0 * c; l.knee.rotation.x = 1.5 * c; l.ankle.rotation.x = -0.4 * c; }
      legR.hip.rotation.x -= 0.4 * c;
      spine.rotation.x += 0.55 * c; neck.rotation.x -= 0.4 * c;
      armR.shoulder.rotation.x = -1.0 * c; armR.elbow.rotation.x = -0.5 * c;
      armL.shoulder.rotation.x = -0.4 * c;
    } else if (A === 'pull') {
      // yank the driver out: reach in, grab, haul back
      const u = clamp(T / (P.actionDur || 0.7), 0, 1);
      const reach = u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.55) * 0.6;
      const haul = smooth((u - 0.45) / 0.4);
      for (const a of [armL, armR]) { a.shoulder.rotation.x = -1.35 * reach + 0.3 * haul; a.elbow.rotation.x = -0.25 - 1.2 * haul; a.shoulder.rotation.z = a.s * 0.12; }
      spine.rotation.x += 0.35 * reach - 0.35 * haul;
      legL.hip.rotation.x = -0.5 * reach; legL.knee.rotation.x = 0.4 * reach + 0.3 * haul;
      legR.hip.rotation.x = 0.3 * haul; legR.knee.rotation.x = 0.2 + 0.3 * haul;
      hips.position.y -= 0.06 + 0.06 * haul;
    } else if (A === 'hit') {
      // small flinch
      const e = Math.sin(clamp(T / 0.35, 0, 1) * Math.PI);
      spine.rotation.x -= 0.35 * e; neck.rotation.x -= 0.3 * e;
      for (const a of [armL, armR]) { a.shoulder.rotation.x -= 0.6 * e; a.elbow.rotation.x -= 1.2 * e; }
    } else if (A === 'down' || A === 'tumble' || A === 'getup' || A === 'wasted') {
      fallPose(A, T, P);
    } else if (A === 'busted') {
      const u = smooth(T / 0.5);
      for (const a of [armL, armR]) {
        a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -2.75, u);
        a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, a.s * 0.45, u);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.7, u);
        a.wrist.rotation.x = -0.4 * u;
      }
      // after a beat, sink to the knees
      const k = smooth((T - 1.1) / 0.6);
      hips.position.y -= 0.42 * k;
      for (const l of [legL, legR]) { l.hip.rotation.x = lerp(l.hip.rotation.x, 0.15, k); l.knee.rotation.x = lerp(l.knee.rotation.x, 1.75, k); l.ankle.rotation.x = 0.6 * k; }
      neck.rotation.x = 0.3 * u; spine.rotation.x = -0.05 * u;
    }
    st.crouch = 0;
  }

  // lie on the back (pivot at the feet); used by knock-downs, bail-out tumbles and getting up
  function lying(e) {
    body.rotation.x = -Math.PI / 2 * e;
    body.position.y = 0.11 * e;
    body.position.z = 0.0;
    for (const a of [armL, armR]) { a.shoulder.rotation.z = lerp(a.shoulder.rotation.z, a.s * 1.25, e); a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -0.2, e); a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.5, e); }
    legL.hip.rotation.z = 0.15 * e; legR.hip.rotation.z = -0.1 * e;
    legL.knee.rotation.x = 0.5 * e; legL.hip.rotation.x = -0.35 * e; legR.knee.rotation.x = 0.1 * e;
    neck.rotation.x = -0.25 * e; neck.rotation.y = 0.4 * e;
  }

  function fallPose(A, T, P) {
    if (A === 'down') {
      // knocked back: fly / fall over in ~0.35 s, then lie there
      const e = smooth(T / 0.35);
      lying(e);
      spine.rotation.x -= 0.4 * Math.sin(clamp(T / 0.35, 0, 1) * Math.PI);
    } else if (A === 'tumble') {
      // roll along the ground after bailing out of a moving car
      const dur = P.actionDur || 0.9, u = clamp(T / dur, 0, 1);
      lying(1);
      body.rotation.x = -Math.PI / 2 - Math.PI * 2 * 1.0 * smooth(u) ;
      body.position.y = 0.11 + 0.35 * Math.abs(Math.sin(u * Math.PI * 2)) * (1 - u);
      for (const l of [legL, legR]) { l.hip.rotation.x = -1.2 * (1 - u); l.knee.rotation.x = 1.6 * (1 - u) + 0.3; }
      for (const a of [armL, armR]) { a.shoulder.rotation.x = -1.4 * (1 - u); a.elbow.rotation.x = -1.6 * (1 - u); a.shoulder.rotation.z = a.s * 0.3; }
    } else if (A === 'getup') {
      const dur = P.actionDur || 0.9, u = clamp(T / dur, 0, 1);
      // sit up, tuck the legs, stand
      const sit = smooth(u / 0.45), stand = smooth((u - 0.4) / 0.6);
      lying(1 - sit);
      body.position.y = 0.11 * (1 - sit);
      const crouch = sit * (1 - stand);
      hips.position.y -= 0.55 * crouch;
      for (const l of [legL, legR]) { l.hip.rotation.x = -1.6 * crouch; l.knee.rotation.x = 2.2 * crouch; l.ankle.rotation.x = -0.6 * crouch; }
      spine.rotation.x += 0.6 * crouch;
      for (const a of [armL, armR]) { a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, -0.5, crouch); a.shoulder.rotation.z = a.s * 0.4 * crouch + a.s * 0.09; }
    } else if (A === 'wasted') {
      // knees buckle, then a heavy fall face-first
      const buckle = smooth(T / 0.45), fall = smooth((T - 0.35) / 0.45);
      hips.position.y -= 0.38 * buckle * (1 - fall);
      for (const l of [legL, legR]) { l.hip.rotation.x = -0.9 * buckle * (1 - fall) + 0.05 * fall; l.knee.rotation.x = 1.5 * buckle * (1 - fall) + 0.25 * fall; }
      body.rotation.x = Math.PI / 2 * fall;
      body.position.y = 0.12 * fall;
      spine.rotation.x += 0.4 * buckle * (1 - fall);
      for (const a of [armL, armR]) { a.shoulder.rotation.x = lerp(-0.2, -2.6, fall); a.shoulder.rotation.z = a.s * (0.2 + 0.6 * fall); a.elbow.rotation.x = -0.4 * fall; }
      neck.rotation.y = 0.9 * fall; neck.rotation.x = -0.3 * fall;
      legR.hip.rotation.z = -0.2 * fall; legL.knee.rotation.x += 0.5 * fall;
    }
  }

  resetPose();
  return {
    group: root,
    animate,
    resetPhase() { st.phase = 0; },
    /** Hand position (world) of the punching hand, handy for effects. */
    joints: { root, body, hips, spine, neck, head, armL, armR, legL, legR },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) { m.map?.dispose(); m.dispose(); } },
  };
}
