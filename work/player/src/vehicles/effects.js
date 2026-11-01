// Shared, game-wide vehicle effects. Everything here is a handful of draw calls total regardless of car count:
//   wheels (InstancedMesh), blob shadows (InstancedMesh), night light pools (InstancedMesh, additive),
//   skid marks (ring-buffer mesh), smoke (Points), fire + sparks (additive Points), explosion flash.
import * as THREE from 'three';
import { getWheelGeometry, sharedMaterials, setVehicleEnv, setVehicleEnvIntensity } from './models.js';

const MAX_WHEELS = 480, MAX_SHADOWS = 120, MAX_POOLS = 160, MAX_SKID = 2400;
const MAX_SMOKE = 700, MAX_FIRE = 500, MAX_SPARK = 300;

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const PARTICLE_VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
uniform float uScale; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(512.0, size * uScale / max(0.1, -mv.z));
  vA = alpha; vC = pcolor;
}`;
const PARTICLE_FS = `
varying float vA; varying vec3 vC; uniform float uSoft;
void main() {
  vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
  if (d > 1.0) discard;
  float a = vA * pow(1.0 - d, uSoft);
  gl_FragColor = vec4(vC, a);
  #include <colorspace_fragment>
}`;

class ParticlePool {
  constructor(scene, max, { additive = false, soft = 1.2 } = {}) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.col = new Float32Array(max * 3); this.col1 = new Float32Array(max * 3);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr); geo.setAttribute('size', this.sizeAttr);
    geo.setAttribute('alpha', this.alphaAttr); geo.setAttribute('pcolor', this.colAttr);
    geo.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 400 }, uSoft: { value: soft } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
  }
  /** spawn: c0 = start colour [r,g,b] (linear 0..1), c1 = end colour */
  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, c0, c1 = c0, drag = 1.5, grav = 0) {
    let i = this.n;
    if (i >= this.max) { i = (Math.random() * this.max) | 0; } else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.size0[i] = s0; this.size1[i] = s1; this.a0[i] = a0;
    this.col[i * 3] = c0[0]; this.col[i * 3 + 1] = c0[1]; this.col[i * 3 + 2] = c0[2];
    this.col1[i * 3] = c1[0]; this.col1[i * 3 + 1] = c1[1]; this.col1[i * 3 + 2] = c1[2];
    this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt, scale) {
    this.uniforms.uScale.value = scale;
    const P = this.posAttr.array, S = this.sizeAttr.array, A = this.alphaAttr.array, C = this.colAttr.array;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { // swap-remove
        const j = --this.n;
        if (i !== j) this._copy(j, i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < 0.02) { this.p[i * 3 + 1] = 0.02; this.v[i * 3 + 1] *= -0.3; }
      const t = this.age[i] / this.life[i];
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      S[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      A[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      for (let c = 0; c < 3; c++) C[i * 3 + c] = this.col[i * 3 + c] + (this.col1[i * 3 + c] - this.col[i * 3 + c]) * t;
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.posAttr.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = this.colAttr.needsUpdate = true;
  }
  _copy(j, i) {
    for (let c = 0; c < 3; c++) { this.p[i * 3 + c] = this.p[j * 3 + c]; this.v[i * 3 + c] = this.v[j * 3 + c]; this.col[i * 3 + c] = this.col[j * 3 + c]; this.col1[i * 3 + c] = this.col1[j * 3 + c]; }
    this.life[i] = this.life[j]; this.age[i] = this.age[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j];
    this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
}

class SkidMarks {
  constructor(scene) {
    this.max = MAX_SKID; this.head = 0;
    const pos = new Float32Array(this.max * 6 * 3), col = new Float32Array(this.max * 6 * 4);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos); geo.setAttribute('color', this.col);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    mat.color.setRGB(0.03, 0.03, 0.03);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.dirty = false;
  }
  /** One quad from (x0,z0) to (x1,z1), width w, alpha a0->a1. */
  add(x0, z0, x1, z1, w, a0, a1) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 1e-3) return;
    const nx = -dz / L * w / 2, nz = dx / L * w / 2, y = 0.045;
    const i = this.head; this.head = (this.head + 1) % this.max;
    const P = this.pos.array, C = this.col.array, o = i * 18, oc = i * 24;
    const v = [x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz];
    for (let k = 0; k < 18; k++) P[o + k] = v[k];
    const al = [a0, a0, a1, a0, a1, a1];
    for (let k = 0; k < 6; k++) { C[oc + k * 4] = 1; C[oc + k * 4 + 1] = 1; C[oc + k * 4 + 2] = 1; C[oc + k * 4 + 3] = al[k]; }
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.pos.needsUpdate = true; this.col.needsUpdate = true; this.dirty = false;
    this.mesh.geometry.setDrawRange(0, this.max * 6);
  }
}

function makeEnv(renderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 24, 16);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x6f93c4), hor = new THREE.Color(0xe9ddc6), bot = new THREE.Color(0x3a3733), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(bot, Math.min(1, -y * 4));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.04);
  pm.dispose(); geo.dispose();
  return rt.texture;
}

export class VehicleFX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const m4 = new THREE.Matrix4();
    // wheels
    const wm = sharedMaterials().detail;
    this.wheels = new THREE.InstancedMesh(getWheelGeometry(), wm, MAX_WHEELS);
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheels.frustumCulled = false; this.wheels.count = 0; this.wheels.castShadow = false;
    scene.add(this.wheels);
    // blob shadows
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    const smat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.shadows = new THREE.InstancedMesh(sg, smat, MAX_SHADOWS);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false; this.shadows.count = 0; this.shadows.renderOrder = 2;
    scene.add(this.shadows);
    // night light pools (additive, tinted per instance)
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const pmat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.pools = new THREE.InstancedMesh(pg, pmat, MAX_POOLS);
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.setColorAt(0, new THREE.Color(1, 1, 1));
    this.pools.frustumCulled = false; this.pools.count = 0; this.pools.renderOrder = 3;
    scene.add(this.pools);
    this.skids = new SkidMarks(scene);
    this.smoke = new ParticlePool(scene, MAX_SMOKE, { soft: 1.4 });
    this.fire = new ParticlePool(scene, MAX_FIRE, { additive: true, soft: 1.6 });
    this.sparks = new ParticlePool(scene, MAX_SPARK, { additive: true, soft: 0.6 });
    // explosion flash sprite
    const fmat = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,230,170,1)', 'rgba(255,120,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flashes = [];
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(fmat.clone()); s.visible = false; scene.add(s); this.flashes.push({ s, t: 1, life: 0.6, size: 12 }); }
    // the player's car gets the only real light (headlight spot); always in the scene so toggling never recompiles shaders
    this.spot = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.55, 1.3);
    this.spot.castShadow = false;
    scene.add(this.spot); scene.add(this.spot.target);
    this.frame = -1; this._m4 = m4; this._c = new THREE.Color();
    try { setVehicleEnv(makeEnv(game.renderer)); } catch (e) { /* headless / no renderer */ }
    this.pools.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  /** Called by the first vehicle that renders each frame. */
  begin(dt) {
    const g = this.game;
    if (this.frame === g.frame) return false;
    this.frame = g.frame;
    this.wheels.count = 0; this.shadows.count = 0; this.pools.count = 0;
    const cam = g.camera, h = g.renderer.domElement.height || 720;
    const scale = h / 2 / Math.tan((cam.fov * Math.PI / 180) / 2);
    this.smoke.update(dt, scale); this.fire.update(dt, scale); this.sparks.update(dt, scale);
    for (const f of this.flashes) {
      if (f.t >= 1) { f.s.visible = false; continue; }
      f.t += dt / f.life; const k = Math.min(1, f.t);
      f.s.visible = k < 1; f.s.scale.setScalar(f.size * (0.4 + k * 1.2)); f.s.material.opacity = (1 - k) * (1 - k);
    }
    this.skids.flush();
    const city = g.city;
    let light = city?.lightLevel != null ? city.lightLevel : (city?.isNight ? 0.15 : 1);
    setVehicleEnvIntensity(0.12 + 0.88 * Math.max(0, Math.min(1, light)));
    this.wheels.instanceMatrix.needsUpdate = true; this.shadows.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true; if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    return true;
  }
  updatePlayerLight(game) {
    const v = game.player?.vehicle;
    const c = game.city;
    const night = !!(c && (c.isNight || (c.lightLevel != null && c.lightLevel < 0.35)));
    if (!v || v.wrecked || !night || !v.spec) { this.spot.intensity = 0; return; }
    const sh = Math.sin(v.heading), ch = Math.cos(v.heading), f = v.spec.length / 2 + v.spec.bodyOffset;
    this.spot.position.set(v.position.x + sh * (f - 0.3), 0.9, v.position.z + ch * (f - 0.3));
    this.spot.target.position.set(v.position.x + sh * (f + 22), 0, v.position.z + ch * (f + 22));
    this.spot.target.updateMatrixWorld();
    this.spot.intensity = 260;
  }
  addWheel(matrix) { if (this.wheels.count < MAX_WHEELS) this.wheels.setMatrixAt(this.wheels.count++, matrix); }
  addShadow(x, z, rot, w, l, opacity = 1) {
    if (this.shadows.count >= MAX_SHADOWS) return;
    const m = this._m4.makeRotationY(rot); m.scale(new THREE.Vector3(w, 1, l)); m.setPosition(x, 0.035, z);
    this.shadows.setMatrixAt(this.shadows.count++, m);
  }
  addPool(x, z, rot, w, l, r, gC, b) {
    if (this.pools.count >= MAX_POOLS) return;
    const m = this._m4.makeRotationY(rot); m.scale(new THREE.Vector3(w, 1, l)); m.setPosition(x, 0.05, z);
    this.pools.setMatrixAt(this.pools.count, m);
    this.pools.setColorAt(this.pools.count++, this._c.setRGB(r, gC, b));
  }
  flash(x, y, z, size = 14, life = 0.7) {
    const f = this.flashes.find((f) => f.t >= 1) || this.flashes[0];
    f.s.position.set(x, y, z); f.t = 0; f.life = life; f.size = size; f.s.visible = true;
  }
  explosion(x, z, scale = 1) {
    this.flash(x, 1.5, z, 16 * scale, 0.8);
    for (let i = 0; i < 70 * scale; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9, up = 2 + Math.random() * 8;
      this.fire.emit(x + Math.cos(a) * 0.8, 0.8 + Math.random(), z + Math.sin(a) * 0.8, Math.cos(a) * sp, up, Math.sin(a) * sp,
        0.6 + Math.random() * 0.7, 2.2, 4.5, 0.9, [1.0, 0.75, 0.3], [0.8, 0.15, 0.02], 2.2, -1);
    }
    for (let i = 0; i < 45 * scale; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
      this.smoke.emit(x, 1 + Math.random() * 2, z, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp,
        2.5 + Math.random() * 2.5, 3, 9, 0.75, [0.08, 0.07, 0.06], [0.2, 0.19, 0.18], 0.9, -0.6);
    }
    for (let i = 0; i < 60 * scale; i++) {
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 14;
      this.sparks.emit(x, 1, z, Math.cos(a) * sp, 3 + Math.random() * 10, Math.sin(a) * sp, 0.5 + Math.random() * 0.8, 0.25, 0.1, 1, [1, 0.8, 0.4], [1, 0.3, 0.05], 0.6, 9.8);
    }
  }
  sparkBurst(x, y, z, nx, nz, vx, vz, n = 6) {
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 6;
      this.sparks.emit(x, y, z, nx * sp + vx * 0.4 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, nz * sp + vz * 0.4 + (Math.random() - 0.5) * 4,
        0.25 + Math.random() * 0.35, 0.18, 0.06, 1, [1, 0.9, 0.55], [1, 0.4, 0.08], 1.2, 9.8);
    }
  }
}

export function getFX(game) {
  if (!game._vehicleFX) game._vehicleFX = new VehicleFX(game);
  return game._vehicleFX;
}
