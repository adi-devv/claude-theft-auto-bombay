// STUB — Vehicles agent owns the in-vehicle chase camera. Player agent calls it while driving.
import * as THREE from 'three';
export class DriveCamera {
  constructor(game) { this.game = game; this.pos = new THREE.Vector3(); this.init = false; }
  update(dt, vehicle) {
    const cam = this.game.camera, f = vehicle.forward;
    const target = new THREE.Vector3(vehicle.position.x - f.x * 9, 3.6, vehicle.position.z - f.z * 9);
    if (!this.init) { this.pos.copy(target); this.init = true; }
    this.pos.lerp(target, 1 - Math.exp(-6 * dt));
    cam.position.copy(this.pos); cam.lookAt(vehicle.position.x + f.x * 4, 1.2, vehicle.position.z + f.z * 4);
  }
  reset() { this.init = false; }
}
