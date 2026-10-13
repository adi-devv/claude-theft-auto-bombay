// Chase camera for driving. Weighty lagged follow, swings towards the direction of travel in slides,
// leads into turns, speed-based FOV/distance, pulls in to avoid buildings, springs back after orbit look,
// stays behind the car when reversing, handles teleports and car switches. Modes: near / far / bonnet.
import * as THREE from 'three';

const MODES = ['near', 'far', 'bonnet'];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class DriveCamera {
  constructor(game) {
    this.game = game;
    this.modeIndex = 0;
    this.init = false;
    this.yaw = 0; this.yawVel = 0;
    this.offset = new THREE.Vector3();    // smoothed camera offset from the car (world)
    this.lookYaw = 0; this.lookPitch = 0;
    this.pull = 1;                          // collision pull-in factor (0..1 of desired distance)
    this.fov = 62; this.trauma = 0; this.t = 0;
    this.lastCar = null; this.lastPos = new THREE.Vector3();
    this.accLag = 0;
    this._target = new THREE.Vector3(); this._pos = new THREE.Vector3(); this._look = new THREE.Vector3();
    game.events?.on?.('explosion', (e) => {
      const c = game.camera.position; const d = Math.hypot(e.x - c.x, e.z - c.z);
      this.trauma = Math.min(1, this.trauma + Math.max(0, 1 - d / 60));
    });
  }
  get mode() { return MODES[this.modeIndex]; }
  set mode(m) { const i = MODES.indexOf(m); if (i >= 0) this.modeIndex = i; }
  cycleMode() { this.modeIndex = (this.modeIndex + 1) % MODES.length; this.init = false; return this.mode; }
  reset() { this.init = false; }
  /** Call when leaving the car: restores the default FOV. */
  release(fov = 62) { const cam = this.game.camera; this.fov = fov; cam.fov = fov; cam.updateProjectionMatrix(); this.init = false; }

  update(dt, v, look = { yaw: 0, pitch: 0, active: false }) {
    if (!v) return;
    const g = this.game, cam = g.camera, s = v.spec || { length: v.length || 4.4, height: 1.5, bodyOffset: 0 };
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const px = v.position.x, pz = v.position.z;
    // teleport / car switch -> snap
    if (!this.init || v !== this.lastCar || Math.hypot(px - this.lastPos.x, pz - this.lastPos.z) > 25) {
      this.yaw = v.heading; this.yawVel = 0; this.lookYaw = 0; this.lookPitch = 0; this.pull = 1; this.accLag = 0;
      this.init = false;
    }
    this.lastCar = v; this.lastPos.set(px, 0, pz);
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const vx = v.velocity.x, vz = v.velocity.z, spd = Math.hypot(vx, vz);
    const u = vx * fx + vz * fz;
    const L = s.length, H = s.height || 1.5;
    const mode = this.mode;

    // ---- yaw target: heading, swung towards the velocity direction in slides (forward motion only)
    let target = v.heading;
    if (u > 3) {
      const velYaw = Math.atan2(vx, vz);
      const slip = wrap(velYaw - v.heading);
      target = v.heading + slip * clamp((u - 3) / 10, 0, 1) * 0.55;
    }
    // lead into turns
    target += clamp((v.yawRate || 0) * 0.16, -0.28, 0.28) * clamp(spd / 8, 0, 1);
    if (mode === 'bonnet') target = v.heading;
    // critically-damped spring on yaw (weighty but never loses the car)
    const k = mode === 'bonnet' ? 30 : 5 + clamp(spd, 0, 40) * 0.12;
    const err = wrap(target - this.yaw);
    this.yawVel += (err * k * k - 2 * k * this.yawVel) * dt;
    this.yawVel = clamp(this.yawVel, -8, 8);
    this.yaw = wrap(this.yaw + this.yawVel * dt);
    if (Math.abs(wrap(this.yaw - v.heading)) > 1.4 && mode !== 'bonnet') this.yaw = wrap(v.heading + Math.sign(wrap(this.yaw - v.heading)) * 1.4);

    // ---- mouse / QE orbit, springs back when released
    if (look && look.active) { this.lookYaw = look.yaw || 0; this.lookPitch = look.pitch || 0; }
    else { const r = 1 - Math.exp(-4 * dt); this.lookYaw += (0 - this.lookYaw) * r; this.lookPitch += (0 - this.lookPitch) * r; }

    // ---- framing
    const sp = clamp(spd / 45, 0, 1);
    let dist, height, lookAhead, lookH, fovT;
    if (mode === 'bonnet') {
      dist = -(L / 2 - 0.9 + (s.bodyOffset || 0)); height = Math.max(1.05, H * 0.82); lookAhead = 20; lookH = height - 0.1; fovT = 70 + sp * 10;
    } else {
      const far = mode === 'far';
      dist = (3.6 + L * 0.62) * (far ? 1.45 : 1) + sp * (far ? 2.6 : 1.9);
      height = (1.25 + H * 0.6) * (far ? 1.5 : 1) - sp * 0.25;
      lookAhead = 2.5 + sp * 9; lookH = H * 0.55 + (far ? 0.3 : 0.1);
      fovT = 62 + sp * 14;
    }
    // acceleration lag: camera drops back under acceleration, closes in on braking (spring)
    const ax = v.ph?.axF || 0;
    this.accLag += (clamp(ax * 0.09, -0.9, 0.9) - this.accLag) * (1 - Math.exp(-3 * dt));
    if (mode !== 'bonnet') dist += this.accLag;
    height += this.lookPitch * dist * 0.6;
    height = Math.max(0.6, height);

    const cy = this.yaw + this.lookYaw;
    const dirX = Math.sin(cy), dirZ = Math.cos(cy);
    // ---- building avoidance: raycast from the car towards the desired camera spot
    let want = 1;
    if (mode !== 'bonnet' && g.collision?.raycast) {
      const ox = px, oz = pz;
      const hit = g.collision.raycast(ox, oz, -dirX, -dirZ, dist + 0.6, Math.max(3.5, height + 1.5));
      if (hit && !(hit.shape?.type === 'circle' && hit.shape.r < 1)) want = clamp((hit.dist - 0.6) / dist, 0.15, 1);
    }
    this.pull += (want - this.pull) * (want < this.pull ? 1 - Math.exp(-25 * dt) : 1 - Math.exp(-2.5 * dt));
    const d = dist * this.pull;
    const h = mode === 'bonnet' ? height : height + (1 - this.pull) * 1.2;

    // desired camera offset relative to the car; smoothed in car space so high speed never lags
    const ox = -dirX * d, oz = -dirZ * d;
    if (!this.init) { this.offset.set(ox, h, oz); this.init = true; }
    const r = mode === 'bonnet' ? 1 : 1 - Math.exp(-14 * dt);
    this.offset.x += (ox - this.offset.x) * r; this.offset.z += (oz - this.offset.z) * r; this.offset.y += (h - this.offset.y) * r;

    // ---- shake: impacts (vehicle.shake) + explosions
    this.trauma = Math.max(this.trauma, (v.shake || 0) * 0.8);
    const tr = this.trauma * this.trauma;
    const shx = tr * 0.35 * (Math.sin(this.t * 41) + Math.sin(this.t * 23.7) * 0.5);
    const shy = tr * 0.25 * Math.sin(this.t * 37.3 + 1.3);
    const rumble = (mode === 'bonnet' ? 0.012 : 0.006) * sp * Math.sin(this.t * 53);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);

    const pos = this._pos.set(px + this.offset.x + shx, this.offset.y + shy + rumble, pz + this.offset.z + shx * 0.5);
    let lookX, lookZ;
    if (mode === 'bonnet') {
      // sit on the bonnet, inherit some body pitch/roll
      const pitch = v._vis?.pitch || 0;
      lookX = pos.x + fx * lookAhead; lookZ = pos.z + fz * lookAhead;
      this._look.set(lookX, lookH - pitch * lookAhead * 0.8, lookZ);
    } else {
      const lf = lookAhead;
      lookX = px + Math.sin(cy) * lf; lookZ = pz + Math.cos(cy) * lf;
      this._look.set(lookX, lookH, lookZ);
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._look);
    if (mode === 'bonnet') cam.rotateZ(-(v._vis?.roll || 0) * 0.6);
    // FOV
    this.fov += (fovT - this.fov) * (1 - Math.exp(-2.5 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
