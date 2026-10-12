// Vehicle: physics (./physics.js), damage, visuals (./models.js), effects (./effects.js), audio (./audio.js).
// Interface: see CONTRACT.md. `position` is the centre of mass (y = 0); the collision box (getOBB) is the body.
import * as THREE from 'three';
import { getSpec, TYPES, PALETTE, G } from './tuning.js';
import { makePhysState, stepVehicle, bodyBox } from './physics.js';
import { getModel, paintMaterial, sharedMaterials, makeLightsMaterial, LG } from './models.js';
import { getFX } from './effects.js';
import { getAudio } from './audio.js';

const LOD_DIST = 150;          // AI cars further than this from the camera use kinematic physics
const FIRE_TIME = 4.5;         // seconds a car burns at 0 health before it explodes
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function pickColor(type, game, opts) {
  if (opts.color != null) return typeof opts.color === 'string' ? new THREE.Color(opts.color).getHex() : opts.color;
  if (type === 'taxi') return 0x121212;
  if (type === 'police') return 0xf1f1ee;
  if (type === 'bus') return 0xb3161b;
  const r = game.rng ? game.rng() : Math.random();
  if (type === 'van') return [0xf4f4f0, 0xf4f4f0, 0xc9ccce, 0x7a1418, 0x3a5f8a, 0xe8e6df][Math.floor(r * 6)];
  return PALETTE[Math.floor(r * PALETTE.length) % PALETTE.length];
}

let nextId = 1;
export class Vehicle {
  constructor(game, opts = {}) {
    this.game = game;
    this.id = nextId++;
    this.type = TYPES[opts.type] ? opts.type : 'sedan';
    const s = this.spec = getSpec(this.type);
    this.isPolice = this.type === 'police';
    this.length = s.length; this.width = s.width; this.height = s.height; this.mass = s.mass;
    this.position = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.velocity = new THREE.Vector3();
    this.yawRate = 0;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: !!opts.parked };
    this.health = s.healthMax; this.wrecked = false; this.onFire = false; this.burnT = 0;
    this.driver = null; this.ai = null; this.sirenOn = false; this.parked = !!opts.parked;
    this.ph = makePhysState();
    if (opts.parked) this.ph.sleeping = true;
    this.shake = 0;               // camera shake request (0..1), consumed by DriveCamera
    this.fxSkid = 0; this.fxScrape = 0;
    this.lastImpact = null;       // { dv, x, z, time, other }
    this.color = pickColor(this.type, game, opts);
    this._hit = { dv: 0, x: 0, z: 0, nx: 0, nz: 0, vt: 0, other: null, scrape: 0 };
    this._skidPrev = [null, null, null, null];
    this._vis = { pitch: 0, pv: 0, roll: 0, rv: 0, bounce: 0, bv: 0, hopY: 0, hopV: 0, spin: [0, 0, 0, 0], smokeAcc: 0, skidAcc: 0, tilt: 0 };
    this._env = { collision: game.collision, onContact: (v, c) => v._contact(c) };
    this._buildMesh();
    game.scene.add(this.mesh);
    game.vehicles.push(this);
    this.fx = getFX(game);
    this.audio = getAudio(game);
    this.frameUpdate(0);
  }

  // ---------------------------------------------------------------- model
  _buildMesh() {
    const s = this.spec, model = this.model = getModel(this.type, s), M = sharedMaterials();
    this.mesh = new THREE.Group(); this.mesh.name = 'vehicle-' + this.type;
    this.body = new THREE.Group(); this.mesh.add(this.body);
    const shell = this.shell = new THREE.Group(); shell.position.z = s.bodyOffset; this.body.add(shell);
    this.paintMat = paintMaterial(this.color);
    this.lightsMat = makeLightsMaterial();
    const add = (geo, mat, shadow) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = !!shadow; m.receiveShadow = false; m.matrixAutoUpdate = false; shell.add(m); return m; };
    this.meshes = {
      paint: add(model.geo.paint, this.paintMat, true),
      detail: add(model.geo.detail, M.detail, false),
      glass: add(model.geo.glass, M.glass, false),
      lights: add(model.geo.lights, this.lightsMat, false),
    };
    for (const m of Object.values(this.meshes)) if (m) m.updateMatrix();
    this.mesh.userData.vehicle = this;
  }

  // ---------------------------------------------------------------- contract API
  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  get right() { return { x: -Math.cos(this.heading), z: Math.sin(this.heading) }; }
  get speed() { return this.velocity.x * Math.sin(this.heading) + this.velocity.z * Math.cos(this.heading); }
  get kmh() { return Math.abs(this.speed) * 3.6; }
  get rpm() { return this.ph.rpm; }
  get gear() { return this.ph.reversing ? 'R' : this.ph.gear + 1; }
  get sleeping() { return this.ph.sleeping; }
  setControls(c) {
    if (!c) return;
    if (c.throttle !== undefined) this.controls.throttle = c.throttle;
    if (c.brake !== undefined) this.controls.brake = c.brake;
    if (c.steer !== undefined) this.controls.steer = c.steer;
    if (c.handbrake !== undefined) this.controls.handbrake = !!c.handbrake;
  }
  getOBB() { return bodyBox(this, {}); }
  wake() { this._wake = true; if (this.ph.sleeping) { this.ph.sleeping = false; this.ph.sleepT = 0; } }
  applyImpulse(ix, iz, px, pz) {
    const s = this.spec;
    this.velocity.x += ix / s.mass; this.velocity.z += iz / s.mass;
    if (px !== undefined && pz !== undefined) {
      const rx = px - this.position.x, rz = pz - this.position.z;
      this.yawRate = clamp(this.yawRate + (ix * rz - iz * rx) / s.inertia, -6, 6);
    }
    this.wake();
  }
  driverDoor() {
    const f = this.forward, r = this.right, s = this.spec;
    const along = this.type === 'bus' ? s.length / 2 - 1.3 - s.bodyOffset : 0.15;
    const out = s.width / 2 + 0.7;
    return { x: this.position.x + r.x * out + f.x * along, z: this.position.z + r.z * out + f.z * along };
  }
  horn(on) { this.honking = on !== false; this.audio.horn(this, on); }
  /** Damage in health points (0..1000 scale). at = {x,z} optional. */
  damage(amount, at) {
    if (this.wrecked || !(amount > 0)) return;
    this.health = Math.max(0, this.health - amount / this.spec.durability);
    if (at) this.lastImpact = { dv: 0, x: at.x, z: at.z, time: this.game.time };
    if (this.health <= 0 && !this.onFire) { this.onFire = true; this.burnT = FIRE_TIME; }
  }
  repair() { this.health = this.spec.healthMax; this.onFire = false; }
  destroy() {
    if (this._removed) return; this._removed = true;
    this.audio.horn(this, false);
    this.game.scene.remove(this.mesh);
    this.lightsMat.dispose();
    const i = this.game.vehicles.indexOf(this); if (i >= 0) this.game.vehicles.splice(i, 1);
  }

  // ---------------------------------------------------------------- simulation
  update(dt) {
    if (this._removed) return;
    const g = this.game, ph = this.ph;
    this._env.collision = g.collision;
    const cam = g.camera.position;
    const dx = this.position.x - cam.x, dz = this.position.z - cam.z;
    const lod = this.driver !== 'player' && !this.alwaysFullPhysics && dx * dx + dz * dz > LOD_DIST * LOD_DIST;
    this._hit.dv = 0; this._hit.scrape = 0; this._hit.other = null;
    stepVehicle(this, dt, this._env, lod);
    if (this.heading > Math.PI) this.heading -= 2 * Math.PI; else if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    this._processHits();
    if (this.onFire && !this.wrecked) {
      this.burnT -= dt;
      if (this.burnT <= 0) this.explode();
    }
    if (this.wrecked) this.wreckT = (this.wreckT || 0) + dt;
  }

  /** Static contact callback from physics (several per substep possible). */
  _contact(c) {
    // corner hits transfer little linear impulse (most goes into spin) -> also count approach speed
    const dv = Math.max(c.jn / this.spec.mass, c.vn * 0.7);
    const h = this._hit;
    if (dv > h.dv) { h.dv = dv; h.x = c.px; h.z = c.pz; h.nx = c.nx; h.nz = c.nz; }
    if (c.vt > 2.5 && dv < 6) { h.scrape = Math.max(h.scrape, c.vt); h.x = c.px; h.z = c.pz; h.nx = c.nx; h.nz = c.nz; }
  }
  /** Vehicle-vehicle hit callback (from collisions.js). */
  _vehicleHit(dv, x, z, nx, nz, other, vt = 0) {
    const h = this._hit;
    if (dv > h.dv) { h.dv = dv; h.x = x; h.z = z; h.nx = nx; h.nz = nz; h.other = other; }
    if (vt > 3 && dv < 5) { h.scrape = Math.max(h.scrape, vt); h.x = x; h.z = z; h.nx = nx; h.nz = nz; }
    this._processHits(true);
  }
  _processHits(fromVehicle = false) {
    const h = this._hit, g = this.game;
    if (h.dv > 1.2) {
      const dv = h.dv;
      const dmg = Math.max(0, dv - 4) * 20;
      if (dmg > 0) this.damage(dmg);
      this.lastImpact = { dv, x: h.x, z: h.z, time: g.time, other: h.other };
      this.shake = Math.min(1, this.shake + dv / 14);
      this.audio.crash(h.x, h.z, dv);
      if (dv > 4) this.fx.sparkBurst(h.x, 0.5, h.z, h.nx, h.nz, this.velocity.x, this.velocity.z, Math.min(20, 3 + dv | 0));
      if (!fromVehicle && dv > 2.5) g.events.emit('vehicleHitStatic', { vehicle: this, impulse: dv * this.spec.mass, x: h.x, z: h.z });
      if (dv > 9) g.events.emit('panic', { x: h.x, z: h.z, radius: 20 });
      h.dv = 0;
    }
    if (h.scrape > 0) {
      this._scrapeT = 0.12;
      this.fxScrape = Math.min(1, h.scrape / 14);
      if (!fromVehicle) this.damage(h.scrape * 0.02);
      if (Math.random() < 0.8) this.fx.sparkBurst(h.x, 0.45, h.z, h.nx * 0.3, h.nz * 0.3, this.velocity.x, this.velocity.z, 2);
      this.shake = Math.min(1, this.shake + 0.02);
      h.scrape = 0;
    }
  }

  explode() {
    if (this.wrecked) return;
    const g = this.game, x = this.position.x, z = this.position.z;
    this.wrecked = true; this.onFire = false; this.health = 0; this.wreckT = 0;
    this.controls.throttle = 0; this.controls.brake = 0; this.controls.handbrake = true;
    this.fx.explosion(x, z, this.type === 'bus' ? 1.5 : 1);
    this.audio.explosion(x, z);
    this.audio.horn(this, false);
    this.sirenOn = false;
    // charred shell
    const M = sharedMaterials();
    this.meshes.paint.material = M.charred;
    if (this.meshes.detail) this.meshes.detail.material = M.charred;
    if (this.meshes.glass) this.meshes.glass.material = M.charredGlass;
    this._vis.hopV = 4.5; this._vis.tilt = (Math.random() - 0.5) * 0.25;
    this.yawRate += (Math.random() - 0.5) * 2;
    this.velocity.x += (Math.random() - 0.5) * 2; this.velocity.z += (Math.random() - 0.5) * 2;
    this.shake = 1;
    // blast pushes and damages nearby cars (chain reactions!)
    const R = 9;
    for (const v of g.vehicles) {
      if (v === this) continue;
      const dx = v.position.x - x, dz = v.position.z - z, d = Math.hypot(dx, dz);
      if (d > R || d < 0.01) continue;
      const k = 1 - d / R;
      v.applyImpulse(dx / d * k * 7 * v.mass, dz / d * k * 7 * v.mass, v.position.x - dx / d, v.position.z - dz / d);
      v.damage(k * 650, { x, z });
      v.shake = Math.min(1, v.shake + k);
    }
    g.events.emit('explosion', { x, z, radius: R, vehicle: this });
    g.events.emit('panic', { x, z, radius: 45 });
    this.wake();
  }

  // ---------------------------------------------------------------- visuals (once per rendered frame)
  frameUpdate(dt) {
    if (this._removed) return;
    const g = this.game, s = this.spec, ph = this.ph, vis = this._vis, fx = this.fx;
    if (fx.begin(dt)) { this.audio.update(dt); fx.updatePlayerLight?.(g); }
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const u = this.velocity.x * sh + this.velocity.z * ch;
    const night = !!(g.city && (g.city.isNight || (g.city.lightLevel != null && g.city.lightLevel < 0.35)));

    // --- body dynamics (spring-damper towards accel-driven pitch/roll)
    const step = Math.min(dt, 0.05);
    const tp = clamp(-(ph.axF / G) * s.pitchK * 2.2, -0.07, 0.07);
    const tr = clamp(-(ph.ayF / G) * s.rollK * 1.4, -0.11, 0.11);
    const wn = 11 / s.suspension, z = 0.45;
    vis.pv += ((tp - vis.pitch) * wn * wn - 2 * z * wn * vis.pv) * step; vis.pitch += vis.pv * step;
    vis.rv += ((tr - vis.roll) * wn * wn - 2 * z * wn * vis.rv) * step; vis.roll += vis.rv * step;
    if (this.shake > 0.3 && vis.bv === 0) vis.bv = -0.4 * this.shake;
    vis.bv += (-vis.bounce * 160 - vis.bv * 9) * step; vis.bounce += vis.bv * step;
    if (Math.abs(vis.bounce) < 1e-4 && Math.abs(vis.bv) < 1e-3) { vis.bounce = 0; vis.bv = 0; }
    // explosion hop
    if (vis.hopV !== 0 || vis.hopY > 0) {
      vis.hopV -= 9.8 * step; vis.hopY += vis.hopV * step;
      if (vis.hopY <= 0) { vis.hopY = 0; vis.hopV = Math.abs(vis.hopV) > 1.5 ? -vis.hopV * 0.3 : 0; }
    }
    this.mesh.position.set(this.position.x, vis.hopY, this.position.z);
    this.mesh.rotation.set(0, this.heading, 0);
    this.body.position.y = vis.bounce + (this.wrecked ? -0.08 : 0);
    this.body.rotation.set(vis.pitch, 0, vis.roll + (this.wrecked ? vis.tilt : 0));
    this.mesh.updateMatrixWorld(true);

    // --- wheels (shared instanced mesh)
    const W = this.model.wheels;
    const off = s.bodyOffset;
    const lx = ch, lz = -sh; // model +X (car's left) in world
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      let spin = u / w.r;
      if (!w.front && ph.hb) spin = 0;
      else if (ph.spin > 0.05 && ((s.drive === 'rwd' && !w.front) || (s.drive === 'fwd' && w.front) || s.drive === 'awd')) spin += Math.sign(ph.driveF || 1) * 25 * Math.min(1, ph.spin);
      vis.spin[i] = (vis.spin[i] + spin * dt) % (Math.PI * 2);
      const wy = w.r + (this.wrecked ? -w.r * 0.25 : 0) + vis.hopY;
      const wzLocal = w.z + off;
      const wx = this.position.x + sh * wzLocal + lx * w.x, wz = this.position.z + ch * wzLocal + lz * w.x;
      _e.set(vis.spin[i], this.heading + (w.front ? -ph.steerAngle : 0), 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_v.set(wx, wy, wz), _q, _s.set(w.w, w.r, w.r));
      fx.addWheel(_m);
      // skid marks + tyre smoke
      this._wheelFX(i, w, wx, wz, u, dt);
    }
    this.fxSkid *= Math.exp(-dt * 6);
    if (this._scrapeT > 0) this._scrapeT -= dt; else this.fxScrape *= Math.exp(-dt * 12);

    // --- blob shadow
    const cx = this.position.x + sh * off, cz = this.position.z + ch * off;
    fx.addShadow(cx, cz, this.heading, s.width * 1.3, s.length * 1.12);

    // --- lights
    const L = this.lightsMat.userData.uL.value, t = g.time;
    const braking = ph.brakeIn > 0.05 || (this.driver && this.controls.brake > 0.05 && u > 0.5);
    const occupied = !!this.driver;
    if (this.wrecked) L.fill(0.03);
    else {
      L[LG.HEAD] = occupied || !this.parked ? (night ? 3.2 : 1.05) : 0.75;
      L[LG.TAIL] = night && (occupied || !this.parked) ? 1.6 : 0.45;
      L[LG.BRAKE] = braking ? 3.2 : (night && occupied ? 1.1 : 0.4);
      L[LG.REVERSE] = ph.reversing && occupied ? 2.6 : 0.12;
      L[LG.SIGN] = night ? 2.2 : 0.95;
      const hazard = this.health < 250 || (this.onFire);
      L[LG.AMBER] = hazard ? ((t * 2.2) % 1 < 0.5 ? 2.8 : 0.2) : 0.35;
      if (this.sirenOn) {
        const ph2 = (t * 2.6) % 1, strobe = Math.sin(t * 46) > 0 ? 1 : 0.25;
        L[LG.SIREN_R] = ph2 < 0.5 ? 5 * strobe : 0.15;
        L[LG.SIREN_B] = ph2 >= 0.5 ? 5 * strobe : 0.15;
      } else { L[LG.SIREN_R] = 0.35; L[LG.SIREN_B] = 0.35; }
    }

    // --- night light pools (fake headlight cones + tail glow), only near the camera
    const cam = g.camera.position;
    const dcam2 = (this.position.x - cam.x) ** 2 + (this.position.z - cam.z) ** 2;
    if (night && !this.wrecked && (occupied || !this.parked) && dcam2 < 140 * 140) {
      const fl = s.length / 2 + off;
      const k = this.driver === 'player' ? 0.6 : 0.85;
      fx.addPool(this.position.x + sh * (fl + 5.5), this.position.z + ch * (fl + 5.5), this.heading, s.width * 2.6, 11.5, 0.55 * k, 0.5 * k, 0.38 * k);
      const rl = -s.length / 2 + off;
      const red = braking ? 0.42 : 0.14;
      fx.addPool(this.position.x + sh * (rl - 0.9), this.position.z + ch * (rl - 0.9), this.heading, s.width * 1.6, 2.6, red, 0.02, 0.01);
      if (this.sirenOn) {
        const b = (t * 2.6) % 1 < 0.5;
        fx.addPool(this.position.x, this.position.z, this.heading, 9, 9, b ? 0.5 : 0.03, 0.02, b ? 0.03 : 0.6);
      }
    }

    // --- damage smoke / fire
    if (!this.wrecked || this.wreckT < 25) this._damageFX(dt, night);
    this.shake *= Math.exp(-dt * 2);
  }

  _wheelFX(i, w, wx, wz, u, dt) {
    const s = this.spec, ph = this.ph, fx = this.fx;
    if (ph.lod || ph.sleeping || this.wrecked) { this._skidPrev[i] = null; return; }
    const spd = Math.hypot(this.velocity.x, this.velocity.z);
    let k = 0;
    const pk = s.peakSlip;
    if (w.front) {
      const a = Math.abs(ph.slipF);
      if (a > pk * 1.6 && spd > 4) k = Math.min(1, (a - pk * 1.6) / (pk * 2));
      if (ph.brakeIn > 0.9 && spd > 6) k = Math.max(k, 0.25);
      if (s.drive !== 'rwd' && ph.spin > 0.15) k = Math.max(k, Math.min(1, ph.spin));
    } else {
      const a = Math.abs(ph.slipR);
      if (ph.hb && spd > 2.5) k = 1;
      else if (a > pk * 1.4 && spd > 4) k = Math.min(1, (a - pk * 1.4) / (pk * 1.8));
      if (s.drive !== 'fwd' && ph.spin > 0.15) k = Math.max(k, Math.min(1, ph.spin));
    }
    if (ph.drift) k = Math.max(k, w.front ? 0.2 : 0.9);
    if (k > 0.12) {
      this.fxSkid = Math.max(this.fxSkid, k);
      const p = this._skidPrev[i];
      if (p) {
        const d = Math.hypot(wx - p.x, wz - p.z);
        if (d > 0.35) { fx.skids.add(p.x, p.z, wx, wz, w.w * 0.9, p.a, Math.min(0.85, 0.3 + k * 0.55)); p.x = wx; p.z = wz; p.a = Math.min(0.85, 0.3 + k * 0.55); }
        if (d > 3) this._skidPrev[i] = { x: wx, z: wz, a: 0.3 };
      } else this._skidPrev[i] = { x: wx, z: wz, a: 0.2 };
      // tyre smoke
      const rate = k * (8 + spd * 0.8) * (this.driver === 'player' ? 1 : 0.5);
      this._smokeAcc = (this._smokeAcc || 0) + rate * dt * 0.5;
      while (this._smokeAcc > 1) {
        this._smokeAcc -= 1;
        const gry = 0.78 + Math.random() * 0.12;
        fx.smoke.emit(wx + (Math.random() - 0.5) * 0.3, 0.25, wz + (Math.random() - 0.5) * 0.3,
          this.velocity.x * 0.15 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, this.velocity.z * 0.15 + (Math.random() - 0.5) * 1.5,
          1.4 + Math.random() * 1.2, 0.9, 4.2 + k * 2, 0.32 * Math.min(1, k + 0.2), [gry, gry, gry], [gry * 0.95, gry * 0.95, gry * 0.95], 1.6, -0.15);
      }
    } else this._skidPrev[i] = null;
  }

  _damageFX(dt, night) {
    const s = this.spec, fx = this.fx;
    const hp = this.health / s.healthMax;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const b = this.model.bonnet, off = s.bodyOffset;
    const bx = this.position.x + sh * (b.z + off) + ch * b.x, bz = this.position.z + ch * (b.z + off) - sh * b.x;
    const by = b.y + this._vis.hopY;
    const cam = this.game.camera.position;
    if ((this.position.x - cam.x) ** 2 + (this.position.z - cam.z) ** 2 > 200 * 200) return;
    let rate = 0, dark = 0;
    if (this.wrecked) { rate = 10 * Math.max(0.15, 1 - this.wreckT / 25); dark = 1; }
    else if (this.onFire) { rate = 16; dark = 1; }
    else if (hp < 0.45) { rate = (0.45 - hp) / 0.45 * 14 + 2; dark = hp < 0.22 ? 0.8 : 0.1; }
    this._dmgAcc = (this._dmgAcc || 0) + rate * dt;
    while (this._dmgAcc > 1) {
      this._dmgAcc -= 1;
      const c = dark > 0.5 ? 0.07 + Math.random() * 0.06 : 0.55 + Math.random() * 0.15;
      fx.smoke.emit(bx + (Math.random() - 0.5) * 0.5, by, bz + (Math.random() - 0.5) * 0.5,
        this.velocity.x * 0.3 + (Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 1.2, this.velocity.z * 0.3 + (Math.random() - 0.5) * 0.6,
        1.6 + Math.random() * 1.6, 0.7, 3.6 + dark * 2.5, 0.42 + dark * 0.3, [c, c, c], [c * 1.3, c * 1.3, c * 1.3], 0.8, -0.8);
    }
    const fire = this.onFire || (this.wrecked && this.wreckT < 12);
    if (fire) {
      this._fireAcc = (this._fireAcc || 0) + (this.onFire ? 40 : 30 * (1 - this.wreckT / 12)) * dt;
      const big = this.wrecked ? 1.3 : 1;
      while (this._fireAcc > 1) {
        this._fireAcc -= 1;
        const spread = this.wrecked ? s.width * 0.8 : 0.6;
        const along = this.wrecked ? (Math.random() - 0.5) * s.length * 0.7 : 0;
        fx.fire.emit(bx + (Math.random() - 0.5) * spread + sh * along, by + Math.random() * 0.2, bz + (Math.random() - 0.5) * spread + ch * along,
          this.velocity.x * 0.5 + (Math.random() - 0.5) * 0.5, 1.5 + Math.random() * 1.8, this.velocity.z * 0.5 + (Math.random() - 0.5) * 0.5,
          0.45 + Math.random() * 0.4, 1.3 * big, 0.5, 0.85, [1.0, 0.72, 0.25], [0.9, 0.18, 0.03], 1.0, -2.5);
      }
    }
  }
}

export function createVehicle(game, opts) { return new Vehicle(game, opts); }
