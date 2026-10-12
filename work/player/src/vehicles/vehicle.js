// STUB — to be replaced by the Vehicles agent. Interface documented in CONTRACT.md.
import * as THREE from 'three';

export class Vehicle {
  constructor(game, opts = {}) {
    this.game = game;
    this.type = opts.type || 'taxi';
    this.isPolice = this.type === 'police';
    this.length = 4.0; this.width = 1.7; this.mass = 1000;
    this.position = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.velocity = new THREE.Vector3();
    this.yawRate = 0;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.health = 1000; this.wrecked = false;
    this.driver = null; this.sirenOn = false;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(this.width, 1.4, this.length), new THREE.MeshStandardMaterial({ color: this.isPolice ? 0xffffff : 0xf2c200 }));
    this.mesh.position.y = 0.7;
    game.scene.add(this.mesh);
    game.vehicles.push(this);
    this.frameUpdate();
  }
  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  get right() { return { x: -Math.cos(this.heading), z: Math.sin(this.heading) }; }
  getOBB() { return { cx: this.position.x, cz: this.position.z, hw: this.width / 2, hd: this.length / 2, rot: this.heading }; }
  damage(n) { this.health = Math.max(0, this.health - n); if (!this.health) this.wrecked = true; }
  horn() {}
  get speed() { const f = this.forward; return this.velocity.x * f.x + this.velocity.z * f.z; }
  setControls(c) { Object.assign(this.controls, c); }
  applyImpulse(ix, iz) { this.velocity.x += ix / this.mass; this.velocity.z += iz / this.mass; }
  driverDoor() { const r = { x: -Math.cos(this.heading), z: Math.sin(this.heading) }; return { x: this.position.x + r.x * 1.6, z: this.position.z + r.z * 1.6 }; }
  update(dt) {
    const c = this.controls, sp = this.speed;
    let acc = c.throttle * 6 - (sp > 0.5 ? c.brake * 10 : c.brake * 4);
    const ns = Math.max(-8, Math.min(40, sp + acc * dt - sp * 0.3 * dt));
    this.heading -= c.steer * 1.4 * dt * Math.max(-1, Math.min(1, ns / 6));
    const f = this.forward; this.velocity.set(f.x * ns, 0, f.z * ns);
    this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt;
    const r = this.game.collision.resolveCircle(this.position.x, this.position.z, 1.2);
    if (r.hit) { this.position.x = r.x; this.position.z = r.z; this.velocity.multiplyScalar(0.3); }
  }
  frameUpdate() { this.mesh.position.x = this.position.x; this.mesh.position.z = this.position.z; this.mesh.rotation.y = this.heading; }
  destroy() { this.game.scene.remove(this.mesh); const i = this.game.vehicles.indexOf(this); if (i >= 0) this.game.vehicles.splice(i, 1); }
}

export function createVehicle(game, opts) { return new Vehicle(game, opts); }
