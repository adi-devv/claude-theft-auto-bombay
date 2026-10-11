// window.__game test hook (PLAN §8). Unbuilt features are stubbed with sane defaults.
import { POIS } from '../world/mapData.js';

export function installTestApi(game, webgl = true) {
  const api = {
    player: () => {
      const p = game.player;
      return p
        ? { x: p.x, z: p.z, inVehicle: p.inVehicle, vehicleType: p.vehicleType, speed: p.speed, health: p.health }
        : { x: 0, z: 0, inVehicle: false, vehicleType: null, speed: 0, health: 100 };
    },
    money: () => game.money,
    wanted: () => game.stars,
    mission: () => ({ id: null, step: null }),
    advance: (sec) => (game.loop ? game.advance(sec) : 0),
    debug: {
      teleport: (x, z) => {
        if (!game.player) return;
        game.player.teleport(x, z);
        game.cameraRig.snap(game.player);
        game.updateCamera(0);
      },
      spawnVehicle: () => null,
      startMission: () => false,
      trafficStats: () => ({ count: 0, stuck: 0, wrongSide: 0 }),
      addHeat: () => {},
      poi: (id) => POIS[id],
      game,
    },
  };
  Object.defineProperties(api, {
    ready: { get: () => !!game.ready, enumerable: true },
    webgl: { get: () => (game.webgl && webgl) === true, enumerable: true },
    frame: { get: () => game.frame, enumerable: true },
    state: { get: () => game.state, enumerable: true },
    seed: { get: () => game.seed, enumerable: true },
    drawCalls: { get: () => game.drawCalls, enumerable: true },
    fps: { get: () => game.fps, enumerable: true },
  });
  window.__game = api;
  return api;
}

/** Minimal API when WebGL init fails, so tests can assert webgl === false loudly. */
export function installFailedApi(seed) {
  window.__game = {
    ready: true, webgl: false, frame: 0, state: 'error', seed, drawCalls: 0, fps: 0,
    player: () => ({ x: 0, z: 0, inVehicle: false, vehicleType: null, speed: 0, health: 0 }),
    money: () => 0, wanted: () => 0, mission: () => ({ id: null, step: null }), advance: () => 0,
    debug: { teleport() {}, spawnVehicle: () => null, startMission: () => false, trafficStats: () => ({ count: 0, stuck: 0, wrongSide: 0 }), addHeat() {} },
  };
}
