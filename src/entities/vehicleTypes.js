// Vehicle type table (PLAN.md section 4). Pure data, no `three` imports.
// Dimensions are metres. Local +Z is the vehicle's forward axis.

// Collision circles: n circles of radius width/2 spread along local Z so that
// together they cover the body length (first/last circle touch the ends).
function makeCircles(length, width, n) {
  const r = width / 2;
  const span = length / 2 - r;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    out.push({ z: +(t * span).toFixed(3), r });
  }
  return out;
}

function def(id, o) {
  const { nCircles, ...rest } = o;
  const wheelbase = +(0.6 * o.length).toFixed(3);
  return Object.freeze({
    id,
    ...rest,
    wheelbase,
    radius: o.width / 2,
    circles: Object.freeze(makeCircles(o.length, o.width, nCircles).map(Object.freeze)),
  });
}

export const VEHICLE_TYPES = Object.freeze({
  taxi: def('taxi', {
    name: 'Taxi', length: 3.9, width: 1.5, height: 1.45,
    maxSpeed: 28, accel: 5.5, brake: 14, steerMax: 0.60, grip: 0.90, mass: 1.0, health: 100,
    revMax: 7, dmgK: 2.0, nCircles: 3, paint: 0x1a1a1a, accent: 0xf5c518, seats: 3,
    driverVisible: false, playerCrashDamageFactor: 0.15, wheels: 4,
  }),
  auto: def('auto', {
    name: 'Auto Rickshaw', length: 2.6, width: 1.3, height: 1.7,
    maxSpeed: 15, accel: 4.5, brake: 10, steerMax: 0.80, grip: 0.75, mass: 0.5, health: 60,
    revMax: 4, dmgK: 2.5, nCircles: 2, paint: 0x2e8b3d, accent: 0xf5c518, seats: 3,
    driverVisible: true, playerCrashDamageFactor: 0.3, wheels: 3,
  }),
  car: def('car', {
    name: 'Car', length: 4.3, width: 1.7, height: 1.5,
    maxSpeed: 32, accel: 6.5, brake: 15, steerMax: 0.55, grip: 0.95, mass: 1.1, health: 110,
    revMax: 8, dmgK: 1.8, nCircles: 3, paint: 0x3a6ea5, accent: 0xdddddd, seats: 4,
    driverVisible: false, playerCrashDamageFactor: 0.15, wheels: 4,
  }),
  bus: def('bus', {
    name: 'BEST Bus', length: 10, width: 2.5, height: 4.4,
    maxSpeed: 16, accel: 2.2, brake: 8, steerMax: 0.42, grip: 1.0, mass: 4.0, health: 300,
    revMax: 4, dmgK: 0.8, nCircles: 4, paint: 0xc8102e, accent: 0xf2f2f2, seats: 40,
    driverVisible: false, playerCrashDamageFactor: 0.15, wheels: 4,
  }),
  police: def('police', {
    name: 'Police Car', length: 4.4, width: 1.8, height: 1.6,
    maxSpeed: 34, accel: 7.5, brake: 16, steerMax: 0.60, grip: 1.0, mass: 1.3, health: 150,
    revMax: 9, dmgK: 1.2, nCircles: 3, paint: 0xf4f4f4, accent: 0x1d4ed8, seats: 4,
    driverVisible: false, playerCrashDamageFactor: 0.15, wheels: 4,
  }),
  bike: def('bike', {
    name: 'Bullet Bike', length: 2.1, width: 0.7, height: 1.1,
    maxSpeed: 30, accel: 7.0, brake: 14, steerMax: 0.70, grip: 0.85, mass: 0.3, health: 40,
    revMax: 3, dmgK: 3, nCircles: 3, paint: 0x2b2b2b, accent: 0xb0b0b0, seats: 2,
    driverVisible: true, playerCrashDamageFactor: 0.6, wheels: 2,
  }),
  sports: def('sports', {
    name: 'Sports Car', length: 4.4, width: 1.9, height: 1.2,
    maxSpeed: 40, accel: 9, brake: 18, steerMax: 0.55, grip: 1.1, mass: 1.0, health: 90,
    revMax: 9, dmgK: 2, nCircles: 3, paint: 0xff6a1a, accent: 0x1a1a1a, seats: 2,
    driverVisible: false, playerCrashDamageFactor: 0.15, wheels: 4,
  }),
});

export const VEHICLE_TYPE_IDS = Object.freeze(Object.keys(VEHICLE_TYPES));

/** Look up a type by id (or pass through a type object). Throws on unknown id. */
export function getVehicleType(type) {
  if (type && typeof type === 'object') return type;
  const t = VEHICLE_TYPES[type];
  if (!t) throw new Error(`Unknown vehicle type: ${type}`);
  return t;
}
