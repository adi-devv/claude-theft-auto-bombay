// STUB — Player agent owns this. Interface in CONTRACT.md.
import * as THREE from 'three';
import { SPAWN } from '../world/mapdata.js';
import { createHumanoid } from '../characters/humanoid.js';
import { DriveCamera } from '../vehicles/driveCamera.js';

export function createPlayer(game) {
  const model = createHumanoid({ shirt: 0xd04030 });
  game.scene.add(model.group);
  const driveCam = new DriveCamera(game);
  const p = {
    mode: 'foot', state: 'normal', position: new THREE.Vector3(SPAWN.x, 0, SPAWN.z), heading: SPAWN.heading,
    vehicle: null, health: 100, radius: 0.35,
    update(dt) {
      const inp = game.input;
      if (inp.pressed('KeyF') || inp.pressed('Enter')) {
        if (p.vehicle) p.exitVehicle(); else {
          const v = game.vehicles.find((v) => v.position.distanceTo(p.position) < 4);
          if (v) p.enterVehicle(v);
        }
      }
      if (p.vehicle) {
        p.vehicle.setControls({ throttle: inp.any('KeyW', 'ArrowUp') ? 1 : 0, brake: inp.any('KeyS', 'ArrowDown') ? 1 : 0, steer: inp.axis('KeyD', 'KeyA') || inp.axis('ArrowRight', 'ArrowLeft'), handbrake: inp.down('Space') });
        p.position.copy(p.vehicle.position); p.heading = p.vehicle.heading;
        return;
      }
      const fwd = inp.axis('KeyW', 'KeyS'), turn = inp.axis('KeyD', 'KeyA');
      p.heading -= turn * 2.5 * dt;
      const sp = fwd * (inp.down('ShiftLeft') ? 6 : 3);
      p.position.x += Math.sin(p.heading) * sp * dt; p.position.z += Math.cos(p.heading) * sp * dt;
      const r = game.collision.resolveCircle(p.position.x, p.position.z, p.radius); p.position.x = r.x; p.position.z = r.z;
    },
    updateCamera(dt) {
      model.group.visible = !p.vehicle;
      model.group.position.copy(p.position); model.group.rotation.y = p.heading;
      if (p.vehicle) { driveCam.update(dt, p.vehicle); return; }
      const cam = game.camera;
      cam.position.set(p.position.x - Math.sin(p.heading) * 5, 2.6, p.position.z - Math.cos(p.heading) * 5);
      cam.lookAt(p.position.x, 1.4, p.position.z);
    },
    enterVehicle(v) { p.vehicle = v; p.mode = 'vehicle'; v.driver = 'player'; driveCam.reset(); },
    exitVehicle() { const v = p.vehicle; if (!v) return; const d = v.driverDoor(); v.driver = null; v.setControls({ throttle: 0, brake: 0, steer: 0, handbrake: true }); p.vehicle = null; p.mode = 'foot'; p.position.set(d.x, 0, d.z); },
    teleport(x, z, h = 0) { if (p.vehicle) { p.vehicle.position.set(x, 0, z); p.vehicle.heading = h; p.vehicle.velocity.set(0, 0, 0); } p.position.set(x, 0, z); p.heading = h; },
    damage(n) { p.health = Math.max(0, p.health - n); },
    bust() { p.state = 'busted'; }, wasted() { p.state = 'wasted'; },
  };
  return p;
}
