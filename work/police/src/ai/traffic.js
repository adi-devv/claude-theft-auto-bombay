// STUB — Traffic agent owns this.
export function createTraffic(game) {
  // a parked taxi near spawn so the stub game is drivable
  game.createVehicle({ type: 'taxi', x: -392, z: 140, heading: Math.PI });
  return { update() {} };
}
