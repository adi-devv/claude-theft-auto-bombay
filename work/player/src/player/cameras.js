// Player-owned cameras: the on-foot over-the-shoulder orbit camera, the title-screen attract camera,
// and a pose blender used to smooth hand-overs (foot <-> car, attract -> gameplay).
// Yaw convention: the camera looks along (sin yaw, cos yaw) in XZ (same as a heading).
import * as THREE from 'three';

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class FootCamera {
  constructor(game) {
    this.game = game;
    this.yaw = 0; this.pitch = 0.2;
    this.dist = 4.4; this.curDist = 4.4; this.shoulder = 0.42;
    this.pivot = new THREE.Vector3(); this.init = false;
    this.idle = 10; // seconds since the last manual look input
    this.fov = 60;
  }
  /** Point the camera from an existing camera position (keeps continuity when leaving a car). */
  alignTo(camPos, target) {
    this.yaw = Math.atan2(target.x - camPos.x, target.z - camPos.z);
    this.init = false; this.idle = 0;
  }
  reset(yaw) { if (yaw !== undefined) this.yaw = yaw; this.pitch = 0.2; this.init = false; this.idle = 10; }

  update(dt, player, look) {
    const game = this.game, cam = game.camera;
    // manual look
    if (look.dx || look.dy) { this.yaw -= look.dx * 0.0024; this.pitch = clamp(this.pitch + look.dy * 0.002, -0.55, 1.15); this.idle = 0; }
    if (look.orbit) { this.yaw += look.orbit * 2.4 * dt; this.idle = 0; }
    this.idle += dt;
    // gentle auto-recenter behind the player when running mostly away from the camera
    const sp = Math.hypot(player.velocity.x, player.velocity.z);
    if (this.idle > 1.6 && sp > 1.5 && player.action === 'none') {
      const diff = wrap(player.heading - this.yaw);
      if (Math.abs(diff) < 1.1) this.yaw += diff * (1 - Math.exp(-dt * 0.35 * sp / 4));
      this.pitch = damp(this.pitch, 0.18, 0.6, dt);
    }
    // pivot: chest/head height, lower when crouched / lying
    const act = player.action;
    const lowH = act === 'down' || act === 'tumble' || act === 'wasted' ? 0.75 : act === 'getup' ? 1.1 : act === 'enter' || act === 'exit' ? 1.25 : 1.58;
    const px = player.position.x, py = player.position.y + lowH, pz = player.position.z;
    if (!this.init) { this.pivot.set(px, py, pz); this.curDist = this.dist; this.init = true; }
    this.pivot.x = damp(this.pivot.x, px, 18, dt);
    this.pivot.z = damp(this.pivot.z, pz, 18, dt);
    this.pivot.y = damp(this.pivot.y, py, 7, dt);
    // a touch further away when sprinting, closer when punching
    const want = this.dist + (player.sprinting ? 0.7 : 0) - (player.guard ? 0.6 : 0) + (act === 'down' || act === 'wasted' ? 1.2 : 0);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    // camera collision against buildings: cast from the (shoulder-offset) pivot back towards the camera
    const sx = this.pivot.x + rx * this.shoulder, sz = this.pivot.z + rz * this.shoulder;
    let allowed = want;
    const col = game.collision;
    if (col) {
      const camY = this.pivot.y + spch * want;
      const hit = col.raycast(sx, sz, -fx, -fz, want * cp + 0.4, Math.max(1.6, camY - 0.2));
      if (hit) allowed = Math.max(0.7, (hit.dist - 0.35) / Math.max(0.25, cp));
      // the shoulder offset itself must not poke into a wall
      const side = col.raycast(this.pivot.x, this.pivot.z, rx, rz, this.shoulder + 0.25, 1.6);
      if (side) this.shoulderCur = Math.max(0, side.dist - 0.3); else this.shoulderCur = this.shoulder;
    }
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 3, dt);
    const sh = this.shoulderCur ?? this.shoulder;
    cam.position.set(this.pivot.x + rx * sh - fx * cp * this.curDist, Math.max(0.35, this.pivot.y + spch * this.curDist), this.pivot.z + rz * sh - fz * cp * this.curDist);
    // aim along yaw/pitch (slightly above the pivot so the player sits in the lower-middle third)
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-this.pitch * 0.92, this.yaw + Math.PI, 0);
    // FOV breathes with speed
    const tf = 60 + (player.sprinting ? 5 : 0);
    this.fov = damp(this.fov, tf, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = damp(cam.fov, this.fov, 6, dt); cam.updateProjectionMatrix(); }
  }
}

/** Slow cinematic drift along Marine Drive for the title screen. */
export class AttractCamera {
  constructor(game) {
    this.game = game; this.t = 0;
    const md = game.roads.roads.find((r) => r.name === 'Marine Drive');
    this.road = md;
  }
  sample(s) {
    const { pts, cum } = this.road; const L = cum[cum.length - 1];
    s = ((s % L) + L) % L;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo] || 1, w = (s - cum[lo]) / seg;
    return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w, tx: (b.x - a.x) / seg, tz: (b.z - a.z) / seg };
  }
  update(dt) {
    const cam = this.game.camera;
    this.t += dt;
    const L = this.road.cum[this.road.cum.length - 1];
    // ping-pong between Nariman Point and the northern curve, very slowly
    const u = 0.5 - 0.5 * Math.cos(this.t * 0.012 * Math.PI * 2 / 1.2 + 0.4);
    const s = 60 + u * (L * 0.62);
    const p = this.sample(s), ahead = this.sample(s + 140);
    // offset out over the sea (left of the south->north tangent = west)
    const lx = p.tz, lz = -p.tx;
    const off = 70 + 18 * Math.sin(this.t * 0.05);
    const h = 26 + 8 * Math.sin(this.t * 0.07 + 1);
    cam.position.set(p.x + lx * off, h, p.z + lz * off);
    // look at the curve of the Necklace ahead, slightly inland
    cam.lookAt(ahead.x - lx * 30, 6, ahead.z - lz * 30);
    if (Math.abs(cam.fov - 52) > 0.01) { cam.fov = 52; cam.updateProjectionMatrix(); }
  }
}

/** Smoothly blends the camera from a snapshot to whatever the active controller sets. */
export class CameraBlend {
  constructor(camera) { this.cam = camera; this.t = 1; this.dur = 0.4; this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.fov = 60; }
  start(dur = 0.4) { this.pos.copy(this.cam.position); this.quat.copy(this.cam.quaternion); this.fov = this.cam.fov; this.t = 0; this.dur = dur; }
  apply(dt) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    const k = this.t * this.t * (3 - 2 * this.t);
    this.cam.position.lerpVectors(this.pos, this.cam.position, k);
    this.cam.quaternion.slerpQuaternions(this.quat, this.cam.quaternion.clone(), k);
    const f = this.fov + (this.cam.fov - this.fov) * k;
    if (Math.abs(f - this.cam.fov) > 0.01) { this.cam.fov = f; this.cam.updateProjectionMatrix(); }
  }
}
