// Third-person camera. No pointer lock: drag the mouse to orbit temporarily.
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { angleDiff, clamp, damp } from '../utils/math.js';
import { segmentHit } from '../physics/collision.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // direction the camera looks (forward = (sin yaw, cos yaw))
    this.pitchOffset = 0;
    this.dist = CONFIG.camera.footDist;
    this.dragTimer = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.preset = 0;
    this._d = { dx: 0, dy: 0 };
    this.titleAngle = 0;
  }

  /** target: {x,y,z,heading,speed,inVehicle} */
  update(dt, target, input, grid) {
    const C = CONFIG.camera;
    const d = input.consumeDrag(this._d);
    if (d.dx || d.dy) {
      this.yaw -= d.dx * 0.006;
      this.pitchOffset = clamp(this.pitchOffset + d.dy * 0.004, -0.5, 0.8);
      this.dragTimer = C.dragHold;
    }
    if (this.dragTimer > 0) this.dragTimer -= dt;
    else {
      if (target.speed > 0.4) this.yaw += angleDiff(this.yaw, target.heading) * damp(C.followRate, dt);
      this.pitchOffset *= 1 - damp(1.5, dt);
    }
    const dist = this.dist;
    const height = C.footHeight + this.pitchOffset * 5;
    const hx = target.x;
    const hz = target.z;
    const hy = target.y + 1.4;
    let cx = hx - Math.sin(this.yaw) * dist;
    let cz = hz - Math.cos(this.yaw) * dist;
    // pull in if a building is in the way
    const t = segmentHit(grid, hx, hz, cx, cz);
    if (t >= 0) {
      const f = Math.max(0.2, t - 0.08);
      cx = hx + (cx - hx) * f;
      cz = hz + (cz - hz) * f;
    }
    this.pos.set(cx, target.y + height, cz);
    this.look.set(hx + Math.sin(this.yaw) * 2, hy, hz + Math.cos(this.yaw) * 2);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  snap(target) {
    this.yaw = target.heading;
    this.dragTimer = 0;
  }

  /** Slow flyover for the title screen. */
  titleOrbit(dt) {
    this.titleAngle += dt * 0.05;
    const a = this.titleAngle;
    const cx = -200;
    const cz = -120;
    this.camera.position.set(cx + Math.cos(a) * 360, 140, cz + Math.sin(a) * 360);
    this.camera.lookAt(cx, 10, cz);
  }
}
