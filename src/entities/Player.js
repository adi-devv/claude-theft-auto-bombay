// Player on foot (§4): capsule r 0.4, camera-relative movement, sprint, jump, damped facing.
import * as THREE from 'three';
import { box } from '../utils/geom.js';
import { merge, staticMaterial } from '../utils/geom.js';
import { CONFIG } from '../core/config.js';
import { KEYS } from '../core/input.js';
import { angleDiff, clamp, damp } from '../utils/math.js';
import { resolveCircle } from '../physics/collision.js';

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.heading = 0;
    this.speed = 0;
    this.health = CONFIG.player.maxHealth;
    this.inVehicle = false;
    this.vehicleType = null;
    this.onGround = true;
    this.radius = CONFIG.player.radius;
    this.walkT = 0;
    this._pos = { x: 0, z: 0 };

    // model: 3 meshes (upper body, two legs)
    const mat = staticMaterial();
    const upper = merge([
      box(0.55, 0.65, 0.3, 0xc0392b, 0, 0.8, 0),
      box(0.3, 0.3, 0.3, 0xd9a273, 0, 1.45, 0),
      box(0.34, 0.12, 0.34, 0x2b2b2b, 0, 1.73, 0),
      box(0.14, 0.6, 0.16, 0xc0392b, -0.37, 0.8, 0),
      box(0.14, 0.6, 0.16, 0xc0392b, 0.37, 0.8, 0),
    ]);
    const leg = () => box(0.2, 0.8, 0.22, 0x2e3f5c, 0, -0.8, 0);
    this.group = new THREE.Group();
    this.group.name = 'player';
    this.upper = new THREE.Mesh(upper, mat);
    this.legL = new THREE.Mesh(leg(), mat);
    this.legR = new THREE.Mesh(leg(), mat);
    this.legL.position.set(-0.15, 0.8, 0);
    this.legR.position.set(0.15, 0.8, 0);
    this.group.add(this.upper, this.legL, this.legR);
    ctx.scene.add(this.group);
    this._sync();
  }

  teleport(x, z, heading = this.heading) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.heading = heading;
    this._sync();
  }

  update(dt, ctx) {
    const input = ctx.input;
    const P = CONFIG.player;
    // camera-relative intent
    const fwdIn = (input.isDown(...KEYS.forward) ? 1 : 0) - (input.isDown(...KEYS.back) ? 1 : 0);
    const rightIn = (input.isDown(...KEYS.right) ? 1 : 0) - (input.isDown(...KEYS.left) ? 1 : 0);
    const yaw = ctx.camera.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // right = (-cos, sin)
    let ix = fx * fwdIn - Math.cos(yaw) * rightIn;
    let iz = fz * fwdIn + Math.sin(yaw) * rightIn;
    const il = Math.hypot(ix, iz);
    if (il > 0) {
      ix /= il;
      iz /= il;
    }
    const top = input.isDown(...KEYS.sprint) ? P.sprint : P.walk;
    const tx = ix * top;
    const tz = iz * top;
    const a = 1 - Math.exp(-P.accel * dt * 0.25);
    this.vx += (tx - this.vx) * Math.min(1, a * 4);
    this.vz += (tz - this.vz) * Math.min(1, a * 4);

    if (il > 0) {
      const want = Math.atan2(ix, iz);
      this.heading += angleDiff(this.heading, want) * damp(P.turnRate, dt);
    }

    // jump / gravity
    if (this.onGround && input.isDown(...KEYS.jump)) {
      this.vy = P.jumpV;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= P.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }

    // integrate with collision (substep to avoid tunnelling)
    const mv = Math.hypot(this.vx, this.vz) * dt;
    const steps = Math.max(1, Math.ceil(mv / 0.25));
    const p = this._pos;
    p.x = this.x;
    p.z = this.z;
    for (let i = 0; i < steps; i++) {
      p.x += (this.vx * dt) / steps;
      p.z += (this.vz * dt) / steps;
      const res = resolveCircle(ctx.grid, p, this.radius);
      if (res.hit) {
        // remove velocity into the surface
        const vn = this.vx * res.nx + this.vz * res.nz;
        if (vn < 0) {
          this.vx -= vn * res.nx;
          this.vz -= vn * res.nz;
        }
      }
    }
    const b = CONFIG.bounds;
    this.x = clamp(p.x, b.minX + 1, b.maxX - 1);
    this.z = clamp(p.z, b.minZ + 1, b.maxZ - 1);
    this.speed = Math.hypot(this.vx, this.vz);

    // animation
    this.walkT += this.speed * dt * 2.2;
    this._sync();
  }

  _sync() {
    const sw = Math.sin(this.walkT) * Math.min(1, this.speed / 4) * 0.7;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    this.group.visible = !this.inVehicle;
  }
}
