// Police visual + audio effects: fallback light bars (when the Vehicle model has none) and siren voices.
import * as THREE from 'three';

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let mats = null;
function materials() {
  if (mats) return mats;
  const sp = (color) => new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  mats = {
    red: sp(0xff2a2a), blue: sp(0x2a5cff),
    barRedOn: new THREE.MeshBasicMaterial({ color: 0xff3030 }), barBlueOn: new THREE.MeshBasicMaterial({ color: 0x3060ff }),
    barOff: new THREE.MeshStandardMaterial({ color: 0x404048, roughness: 0.4 }),
    barGeo: new THREE.BoxGeometry(0.42, 0.12, 0.24),
  };
  return mats;
}

/** True if the Vehicles agent's model flashes its own light bar. */
export function vehicleHasOwnLightBar(v) {
  return !!(v.hasLightBar || v.lightBar || v.mesh?.getObjectByName?.('lightbar'));
}

/** Attach a fallback light bar to a police vehicle mesh. Returns a handle with update(t, on, lightLevel) and dispose(). */
export function attachLightBar(v) {
  const m = materials();
  const group = new THREE.Group(); group.name = 'police-fx-lightbar';
  // roof height from the mesh bounds (mesh may be offset upward like the stub)
  const box = new THREE.Box3().setFromObject(v.mesh);
  const roofY = (isFinite(box.max.y) ? box.max.y : 1.5) - v.mesh.position.y + 0.06;
  group.position.set(0, roofY, -0.1);
  const L = new THREE.Mesh(m.barGeo, m.barOff), R = new THREE.Mesh(m.barGeo, m.barOff);
  // driver on the right (RHD) -> red on the right-hand side of the bar, blue on the left (Mumbai Police)
  L.position.x = 0.22; R.position.x = -0.22;
  const sL = new THREE.Sprite(m.blue), sR = new THREE.Sprite(m.red);
  sL.position.set(0.3, 0.12, 0); sR.position.set(-0.3, 0.12, 0);
  sL.renderOrder = sR.renderOrder = 10;
  group.add(L, R, sL, sR);
  v.mesh.add(group);
  const phase = Math.random() * 2;
  return {
    group,
    update(t, on, lightLevel = 1) {
      if (!on) { L.material = R.material = m.barOff; sL.visible = sR.visible = false; return; }
      // Indian-style pattern: alternate red/blue at ~2.5 Hz with a double strobe on each side.
      const u = ((t + phase) * 2.5) % 1;
      const left = u < 0.5, strobe = (u % 0.5) < 0.12 || ((u % 0.5) > 0.2 && (u % 0.5) < 0.32);
      const a = left && strobe, b = !left && strobe;
      L.material = a ? m.barBlueOn : m.barOff; R.material = b ? m.barRedOn : m.barOff;
      const size = 1.3 + (1 - lightLevel) * 2.2; // bigger bloom at night
      sL.visible = a; sR.visible = b;
      sL.scale.setScalar(size); sR.scale.setScalar(size);
    },
    dispose() { v.mesh.remove(group); },
  };
}

/**
 * Siren voices: Indian police "wail" (slow rise ~0.9 s, short hold, ~1.6 s fall, 650..1350 Hz),
 * two voices assigned to the nearest two cars with sirenOn, distance falloff + doppler + stereo pan.
 */
export class SirenAudio {
  constructor(game) { this.game = game; this.voices = null; }
  _init() {
    const a = this.game.audio;
    if (!a || !a.ready) return false;
    const ctx = a.ctx, bus = a.bus('siren');
    if (!ctx || !bus) return false;
    this.voices = [];
    for (let i = 0; i < 2; i++) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.7;
      const shp = ctx.createBiquadFilter(); shp.type = 'peaking'; shp.frequency.value = 1100; shp.gain.value = 6; shp.Q.value = 1;
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const m2 = ctx.createGain(); m2.gain.value = 0.35;
      o1.connect(f); o2.connect(m2); m2.connect(f); f.connect(shp); shp.connect(g);
      if (pan) { g.connect(pan); pan.connect(bus); } else g.connect(bus);
      o1.start(); o2.start();
      this.voices.push({ o1, o2, f, g, pan, car: null, phase: i * 1.3 });
    }
    return true;
  }
  /** cars: array of vehicles; listener: {x,z, vx, vz, rightX, rightZ} */
  update(dt, cars, listener) {
    if (!this.voices && !this._init()) return;
    const ctx = this.game.audio.ctx, now = ctx.currentTime;
    const cand = [];
    for (const v of cars) {
      if (!v.sirenOn || v.wrecked) continue;
      const d = Math.hypot(v.position.x - listener.x, v.position.z - listener.z);
      if (d < 260) cand.push({ v, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const chosen = cand.slice(0, 2);
    // keep voices sticky to their car to avoid phase jumps
    for (const voice of this.voices) if (voice.car && !chosen.find((c) => c.v === voice.car)) voice.car = null;
    for (const c of chosen) {
      if (this.voices.find((vo) => vo.car === c.v)) continue;
      const free = this.voices.find((vo) => !vo.car); if (free) free.car = c.v;
    }
    for (const voice of this.voices) {
      const v = voice.car;
      if (!v) { voice.g.gain.setTargetAtTime(0, now, 0.15); continue; }
      voice.phase += dt;
      const dx = v.position.x - listener.x, dz = v.position.z - listener.z, d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d;
      // doppler: positive when source approaches listener
      const vs = -((v.velocity?.x || 0) * ux + (v.velocity?.z || 0) * uz);
      const vl = (listener.vx || 0) * ux + (listener.vz || 0) * uz;
      const dop = Math.max(0.82, Math.min(1.22, (343 + vl) / (343 - vs)));
      const T = 3.2, u = (voice.phase % T) / T;
      let w; // 0..1 wail envelope
      if (u < 0.28) w = Math.sin((u / 0.28) * Math.PI / 2);
      else if (u < 0.4) w = 1;
      else w = Math.cos(((u - 0.4) / 0.6) * Math.PI / 2);
      const f = (650 + 700 * w) * dop;
      voice.o1.frequency.setTargetAtTime(f, now, 0.03);
      voice.o2.frequency.setTargetAtTime(f * 1.005, now, 0.03);
      const gain = 0.16 / (1 + Math.pow(d / 28, 1.7));
      voice.g.gain.setTargetAtTime(gain, now, 0.08);
      voice.f.frequency.setTargetAtTime(1200 + 2400 / (1 + d / 60), now, 0.1);
      if (voice.pan) voice.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, ux * listener.rightX + uz * listener.rightZ)), now, 0.08);
    }
  }
  silence() {
    if (!this.voices) return;
    const now = this.game.audio.ctx.currentTime;
    for (const v of this.voices) { v.car = null; v.g.gain.setTargetAtTime(0, now, 0.1); }
  }
}

// ---------- fallback foot-cop mesh (khaki Mumbai Police uniform, dark blue beret) ----------
let copGeo = null;
export function makeCopMesh() {
  if (!copGeo) {
    copGeo = {
      body: new THREE.CapsuleGeometry(0.26, 0.75, 3, 8), legs: new THREE.CapsuleGeometry(0.2, 0.55, 3, 6),
      head: new THREE.SphereGeometry(0.17, 10, 8), cap: new THREE.CylinderGeometry(0.19, 0.19, 0.08, 10),
      stick: new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5),
      khaki: new THREE.MeshStandardMaterial({ color: 0xb59a62, roughness: 0.9 }),
      trousers: new THREE.MeshStandardMaterial({ color: 0xa08955, roughness: 0.9 }),
      skin: new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.8 }),
      beret: new THREE.MeshStandardMaterial({ color: 0x1d2a5a, roughness: 0.8 }),
      lathi: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 }),
    };
  }
  const G = copGeo;
  const g = new THREE.Group();
  const legs = new THREE.Mesh(G.legs, G.trousers); legs.position.y = 0.5;
  const body = new THREE.Mesh(G.body, G.khaki); body.position.y = 1.15;
  const head = new THREE.Mesh(G.head, G.skin); head.position.y = 1.72;
  const cap = new THREE.Mesh(G.cap, G.beret); cap.position.y = 1.86; cap.rotation.z = 0.15;
  const stick = new THREE.Mesh(G.stick, G.lathi); stick.position.set(-0.33, 1.0, 0.1); stick.rotation.x = 0.4;
  g.add(legs, body, head, cap, stick);
  for (const c of g.children) c.castShadow = true;
  g.userData.parts = { legs, body, stick };
  return g;
}
