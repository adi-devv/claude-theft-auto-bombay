import test from 'node:test';
import assert from 'node:assert/strict';

import { VEHICLE_TYPES, VEHICLE_TYPE_IDS } from '../../src/entities/vehicleTypes.js';
import {
  createVehicleState, stepVehicle, vehicleCircles, slipAngle, circleVsObb,
  resolveVehicleVsBoxes, resolveVehicleVsVehicle, applyDamage,
} from '../../src/physics/vehicleDynamics.js';
import { Wanted } from '../../src/gameplay/Wanted.js';
import { Economy } from '../../src/gameplay/Economy.js';
import { fareFor, parTime } from '../../src/gameplay/fares.js';
import { SAVE_KEY, defaultSave, validateSave, loadSave, writeSave } from '../../src/core/save.js';

const DT = 1 / 60;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

function makeBus() {
  const events = [];
  return { events, emit(name, payload) { events.push({ name, payload }); } };
}

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

function run(v, input, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) stepVehicle(v, typeof input === 'function' ? input(i) : input, DT);
}

// ---------- vehicle types ----------

test('vehicle table has every type with required fields', () => {
  assert.deepEqual([...VEHICLE_TYPE_IDS].sort(), ['auto', 'bike', 'bus', 'car', 'police', 'sports', 'taxi']);
  for (const id of VEHICLE_TYPE_IDS) {
    const t = VEHICLE_TYPES[id];
    for (const k of ['length', 'width', 'height', 'maxSpeed', 'accel', 'brake', 'steerMax', 'grip', 'mass',
      'health', 'wheelbase', 'revMax', 'dmgK', 'paint', 'accent', 'seats', 'playerCrashDamageFactor']) {
      assert.equal(typeof t[k], 'number', `${id}.${k}`);
    }
    assert.equal(typeof t.driverVisible, 'boolean');
    assert.ok(t.circles.length >= 2 && t.circles.length <= 4);
    near(t.wheelbase, 0.6 * t.length, 0.01);
  }
  assert.equal(VEHICLE_TYPES.bus.circles.length >= 3, true);
  assert.equal(VEHICLE_TYPES.auto.playerCrashDamageFactor, 0.3);
  assert.equal(VEHICLE_TYPES.bike.playerCrashDamageFactor, 0.6);
  assert.equal(VEHICLE_TYPES.taxi.dmgK, 2.0);
  assert.equal(VEHICLE_TYPES.bike.driverVisible && VEHICLE_TYPES.auto.driverVisible, true);
});

// ---------- dynamics ----------

test('taxi accelerates to near maxSpeed', () => {
  const v = createVehicleState('taxi', 0, 0, 0);
  run(v, { throttle: 1, steer: 0 }, 15);
  assert.ok(v.speed > 0.95 * VEHICLE_TYPES.taxi.maxSpeed, `speed ${v.speed}`);
  assert.ok(v.speed <= VEHICLE_TYPES.taxi.maxSpeed + 1e-9);
  assert.ok(v.z > 100, 'moved along +Z at heading 0');
  assert.ok(Math.abs(v.x) < 1e-6);
});

test('heading convention: forward = (sin h, cos h)', () => {
  const v = createVehicleState('car', 0, 0, Math.PI / 2);
  run(v, { throttle: 1 }, 3);
  assert.ok(v.x > 5);
  assert.ok(Math.abs(v.z) < 1e-6);
});

test('taxi stops under braking and never reverses from brake alone', () => {
  const v = createVehicleState('taxi', 0, 0, 0);
  run(v, { throttle: 1 }, 15);
  run(v, { throttle: -1 }, 5);
  assert.ok(v.speed <= 0.01 && v.speed > -VEHICLE_TYPES.taxi.revMax - 1e-9);
  // A second of pure braking from speed ends at zero, then reverse gear is capped.
  const w = createVehicleState('taxi', 0, 0, 0);
  w.speed = 10; w.vz = 10;
  run(w, { throttle: -1 }, 0.5);
  assert.ok(w.speed >= 0 && w.speed < 10 - 14 * 0.5 + 0.5, `braked speed ${w.speed}`);
  run(w, { throttle: -1 }, 20);
  assert.ok(w.speed >= -VEHICLE_TYPES.taxi.revMax - 1e-9);
  assert.ok(w.speed < 0);
});

test('coasting: drag stops the vehicle and never flips its sign', () => {
  const v = createVehicleState('car', 0, 0, 0);
  v.speed = 15; v.vz = 15;
  run(v, {}, 60);
  assert.equal(v.speed, 0);
});

function steadyRadius(type, speed) {
  const v = createVehicleState(type, 0, 0, 0);
  const hold = () => { v.speed = speed; };
  for (let i = 0; i < 360; i++) { hold(); stepVehicle(v, { throttle: 0, steer: 1 }, DT); }
  const h0 = v.heading;
  for (let i = 0; i < 60; i++) { hold(); stepVehicle(v, { throttle: 0, steer: 1 }, DT); }
  const yawRate = (v.heading - h0) / 1;
  return speed / yawRate;
}

test('auto turns a tighter circle than the bus at the same speed', () => {
  const ra = steadyRadius('auto', 10);
  const rb = steadyRadius('bus', 10);
  assert.ok(ra > 0 && rb > 0);
  assert.ok(ra < rb * 0.5, `auto r=${ra.toFixed(1)} bus r=${rb.toFixed(1)}`);
});

test('positive steer turns left (heading increases)', () => {
  const v = createVehicleState('taxi', 0, 0, 0);
  v.speed = 10;
  run(v, { steer: 1 }, 1);
  assert.ok(v.heading > 0);
});

test('handbrake increases slip angle', () => {
  const maxSlip = hb => {
    const v = createVehicleState('taxi', 0, 0, 0);
    v.speed = 20; v.vz = 20;
    let m = 0;
    for (let i = 0; i < 90; i++) {
      stepVehicle(v, { throttle: 0.5, steer: 0.8, handbrake: hb }, DT);
      m = Math.max(m, slipAngle(v));
    }
    return m;
  };
  const plain = maxSlip(false);
  const drift = maxSlip(true);
  assert.ok(drift > plain * 1.5 && drift > 0.3, `plain ${plain.toFixed(2)} drift ${drift.toFixed(2)}`);
});

test('wrecked vehicles cannot accelerate or steer and coast to a stop', () => {
  const v = createVehicleState('taxi', 0, 0, 0);
  v.wrecked = true;
  run(v, { throttle: 1, steer: 1 }, 3);
  assert.equal(v.speed, 0);
  assert.equal(v.heading, 0);
  v.speed = 10; v.vz = 10;
  run(v, { throttle: 1 }, 10);
  assert.ok(v.speed < 10 && v.speed >= 0);
});

test('vehicleCircles follow heading', () => {
  const v = createVehicleState('bus', 10, 20, Math.PI / 2);
  const c = vehicleCircles(v);
  assert.equal(c.length, VEHICLE_TYPES.bus.circles.length);
  for (const ci of c) near(ci.z, 20, 1e-9);
  assert.ok(Math.max(...c.map(ci => ci.x)) > 10 + 3);
});

// ---------- collisions ----------

test('circleVsObb: axis-aligned box (rot=0)', () => {
  const box = { x: 0, z: 0, hw: 2, hd: 1, rot: 0 };
  let h = circleVsObb(3, 0, 1.5, box);
  assert.ok(h.hit); near(h.nx, 1); near(h.nz, 0); near(h.depth, 0.5);
  h = circleVsObb(0, -2, 1.5, box);
  assert.ok(h.hit); near(h.nx, 0); near(h.nz, -1); near(h.depth, 0.5);
  assert.equal(circleVsObb(5, 0, 1, box).hit, false);
  // centre inside: exits through nearest face
  h = circleVsObb(1.8, 0, 0.5, box);
  assert.ok(h.hit); near(h.nx, 1); near(h.depth, 0.7);
  // corner
  h = circleVsObb(3, 2, 2, box);
  assert.ok(h.hit); near(h.depth, 2 - Math.SQRT2); near(h.nx, Math.SQRT1_2); near(h.nz, Math.SQRT1_2);
});

test('circleVsObb: rotated box (rot=pi/4)', () => {
  const box = { x: 0, z: 0, hw: 2, hd: 1, rot: Math.PI / 4 };
  const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4);
  // Local X axis = (cos, -sin); point just beyond +hw face along that axis.
  const px = c * 2.4, pz = -s * 2.4;
  let h = circleVsObb(px, pz, 0.5, box);
  assert.ok(h.hit);
  near(h.depth, 0.1, 1e-9);
  near(h.nx, c); near(h.nz, -s);
  // Local Z axis = (sin, cos); just beyond +hd face.
  h = circleVsObb(s * 1.3, c * 1.3, 0.5, box);
  assert.ok(h.hit); near(h.depth, 0.2, 1e-9); near(h.nx, s); near(h.nz, c);
  // A point that would be inside the unrotated AABB footprint corner but outside the OBB.
  assert.equal(circleVsObb(2, 1, 0.4, box).hit, false);
  // And one outside the unrotated box on the world axis but inside the OBB's reach.
  assert.equal(circleVsObb(1.8, -1.4, 0.3, box).hit, true);
});

test('resolveVehicleVsBoxes pushes out, bounces and returns impact speed', () => {
  const wall = { x: 0, z: 20, hw: 10, hd: 0.5, rot: 0 }; // wall face at z = 19.5
  const v = createVehicleState('car', 0, 18.2, 0);
  v.speed = 15; v.vx = 0; v.vz = 15;
  const impact = resolveVehicleVsBoxes(v, [wall]);
  assert.ok(impact > 10 && impact <= 15 + 1e-9, `impact ${impact}`);
  // pushed out: front circle no longer penetrating
  for (const c of vehicleCircles(v)) assert.equal(circleVsObb(c.x, c.z, c.r, wall).hit && circleVsObb(c.x, c.z, c.r, wall).depth > 1e-6, false);
  assert.ok(v.vz < 0 && v.vz > -0.3 * 15 - 1e-9, `vz ${v.vz}`);
  assert.ok(v.speed < 15 * 0.6 + 1e-9);
});

test('resolveVehicleVsBoxes against a rotated box and no-hit case', () => {
  const box = { x: 10, z: 0, hw: 3, hd: 1, rot: Math.PI / 4 };
  const far = createVehicleState('taxi', -20, 0, 0);
  assert.equal(resolveVehicleVsBoxes(far, [box]), 0);
  const v = createVehicleState('taxi', 7.2, 0, Math.PI / 2);
  v.speed = 10; v.vx = 10; v.vz = 0;
  const impact = resolveVehicleVsBoxes(v, [box]);
  assert.ok(impact > 0);
  for (const c of vehicleCircles(v)) assert.ok(circleVsObb(c.x, c.z, c.r, box).depth < 1e-6);
});

test('vehicle-vehicle: mass-weighted separation, impulse, impact speed', () => {
  const a = createVehicleState('car', 0, 0, 0);
  const b = createVehicleState('bus', 0, 4.0, 0);
  a.speed = 12; a.vz = 12;
  const ax0 = a.x, az0 = a.z, bz0 = b.z;
  const impact = resolveVehicleVsVehicle(a, b);
  assert.ok(impact > 5 && impact <= 12 + 1e-9, `impact ${impact}`);
  // separated
  const ca = vehicleCircles(a), cb = vehicleCircles(b);
  for (const p of ca) for (const q of cb) {
    assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= p.r + q.r - 1e-6);
  }
  // light car moves back more than the heavy bus moves forward
  const da = Math.abs(a.z - az0), db = Math.abs(b.z - bz0);
  assert.ok(da > db * 3, `da ${da} db ${db}`);
  assert.equal(a.x, ax0);
  // car rebounds, bus barely moves
  assert.ok(a.vz < 0 && b.vz > 0 && b.vz < 4);
  // momentum conserved (mass-weighted) in the velocity change
  const ma = VEHICLE_TYPES.car.mass, mb = VEHICLE_TYPES.bus.mass;
  near(ma * (a.vz - 12) + mb * b.vz, 0, 1e-9);
});

test('vehicle-vehicle: distant vehicles do nothing; equal masses split push', () => {
  const a = createVehicleState('taxi', 0, 0, 0);
  const b = createVehicleState('taxi', 50, 0, 0);
  assert.equal(resolveVehicleVsVehicle(a, b), 0);
  const c = createVehicleState('taxi', 0, 0, 0);
  const d = createVehicleState('taxi', 0, 2.0, 0);
  resolveVehicleVsVehicle(c, d);
  near(c.z, -(d.z - 2.0), 1e-9);
  assert.ok(c.z < 0 && d.z > 2.0);
});

// ---------- damage ----------

test('damage below threshold is ignored; above is (impact-5)*dmgK', () => {
  const v = createVehicleState('taxi', 0, 0, 0);
  assert.equal(applyDamage(v, 4.9), 0);
  assert.equal(v.health, 100);
  const d = applyDamage(v, 10);
  near(d, 10);
  near(v.health, 90);
  assert.equal(v.wrecked, false);
  near(applyDamage(v, 10, 0.5), 5);
});

test('enough damage wrecks the vehicle (health 0)', () => {
  const v = createVehicleState('auto', 0, 0, 0); // 60 hp, dmgK 2.5
  applyDamage(v, 20); // 37.5
  assert.equal(v.wrecked, false);
  applyDamage(v, 20);
  assert.equal(v.health, 0);
  assert.equal(v.wrecked, true);
  // bus is sturdier
  const bus = createVehicleState('bus', 0, 0, 0);
  applyDamage(bus, 20);
  assert.ok(!bus.wrecked && bus.health > 280);
});

// ---------- wanted ----------

test('each wanted threshold gives the right stars and emits on change', () => {
  const bus = makeBus();
  const w = new Wanted(bus);
  assert.equal(w.stars, 0);
  const thresholds = [[20, 1], [60, 2], [120, 3], [220, 4], [350, 5]];
  for (const [heat, stars] of thresholds) {
    w.clear();
    w.addHeat(heat - 1);
    assert.equal(w.stars, stars - 1, `${heat - 1} heat`);
    w.addHeat(1);
    assert.equal(w.stars, stars, `${heat} heat`);
  }
  const changes = bus.events.filter(e => e.name === 'wanted:change').map(e => e.payload.stars);
  assert.ok(changes.includes(1) && changes.includes(5) && changes.includes(0));
  // no duplicate emits when stars unchanged
  const before = bus.events.length;
  w.addHeat(1);
  assert.equal(bus.events.length, before);
});

test('cop line of sight doubles heat', () => {
  const w = new Wanted(makeBus());
  w.addHeat(10, true);
  assert.equal(w.heat, 20);
  assert.equal(w.stars, 1);
  w.clear();
  w.addHeat(10, false);
  assert.equal(w.heat, 10);
  assert.equal(w.stars, 0);
});

test('heat decays 1/s only while at 0 stars', () => {
  const w = new Wanted(makeBus());
  w.addHeat(10);
  w.update(4, false);
  near(w.heat, 6);
  w.update(100, false);
  assert.equal(w.heat, 0);
  w.addHeat(30);
  assert.equal(w.stars, 1);
  w.update(1, true);
  assert.equal(w.heat, 30);
});

test('evasion clears wanted after 8+4*stars seconds without LOS; LOS resets it', () => {
  for (const stars of [1, 3, 5]) {
    const bus = makeBus();
    const w = new Wanted(bus);
    w.setStars(stars);
    assert.equal(w.stars, stars);
    const need = 8 + 4 * stars;
    for (let t = 0; t < need - 0.5; t += 0.5) w.update(0.5, false);
    assert.equal(w.stars, stars, 'still wanted just before the timer');
    assert.ok(w.evadeProgress > 0.9 && w.evadeProgress < 1);
    w.update(0.5, false);
    assert.equal(w.stars, 0);
    assert.equal(w.heat, 0);
    assert.equal(w.evadeProgress, 0);
    assert.equal(bus.events.at(-1).name, 'wanted:change');
    assert.equal(bus.events.at(-1).payload.stars, 0);
  }
  const w = new Wanted(makeBus());
  w.setStars(1);
  w.update(10, false);
  assert.ok(w.evadeProgress > 0.8);
  w.update(0.1, true);
  assert.equal(w.evadeProgress, 0);
  w.update(11, false);
  assert.equal(w.stars, 1);
  w.update(1.5, false);
  assert.equal(w.stars, 0);
});

// ---------- economy ----------

test('economy: integer money, never negative, events', () => {
  const bus = makeBus();
  const e = new Economy(bus);
  assert.equal(e.money, 500);
  e.add(250.6, 'fare');
  assert.equal(e.money, 751);
  assert.deepEqual(bus.events.at(-1), { name: 'money:change', payload: { money: 751, delta: 251, reason: 'fare' } });
  assert.equal(e.spend(1000), false);
  assert.equal(e.money, 751);
  assert.equal(e.spend(751), true);
  assert.equal(e.money, 0);
  assert.equal(e.spend(1), false);
  e.add(-50, 'oops');
  assert.equal(e.money, 0);
  e.add(NaN);
  assert.equal(e.money, 0);
  assert.equal(new Economy(null, -5).money, 0);
  assert.equal(Number.isInteger(new Economy(null, 12.7).money), true);
});

test('economy penalty loses a percentage and stays an integer', () => {
  const bus = makeBus();
  const e = new Economy(bus, 1234);
  const lost = e.penalty(0.1, 'busted');
  assert.equal(lost, 123);
  assert.equal(e.money, 1111);
  assert.equal(bus.events.at(-1).payload.delta, -123);
  assert.equal(bus.events.at(-1).payload.reason, 'busted');
  const z = new Economy(bus, 0);
  assert.equal(z.penalty(0.5), 0);
  assert.equal(z.money, 0);
  e.penalty(5);
  assert.equal(e.money, 0);
});

// ---------- fares ----------

test('fare base, par time, bonus bounds', () => {
  assert.equal(parTime(1400), 100);
  const dist = 1400, par = 100;
  const slow = fareFor(dist, par + 30, 0, 0);
  near(slow.base, 40 + 0.15 * dist);
  assert.equal(slow.bonus, 0);
  assert.equal(slow.multiplier, 1);
  assert.equal(slow.total, Math.round(40 + 0.15 * dist));
  const fast = fareFor(dist, par * 0.5, 0, 0);
  near(fast.bonus, fast.base);
  assert.equal(fast.total, Math.round(fast.base * 2));
  const faster = fareFor(dist, 1, 0, 0);
  near(faster.bonus, faster.base);
  const mid = fareFor(dist, par * 0.75, 0, 0);
  near(mid.bonus, mid.base * 0.5);
  assert.equal(fareFor(dist, par, 0, 0).bonus, 0);
});

test('fare tip penalty from damage is capped by the bonus', () => {
  const dist = 1400;
  const f = fareFor(dist, 50, 20, 0); // bonus = base, penalty = 30
  near(f.tipPenalty, 30);
  assert.equal(f.total, Math.round(f.base + f.bonus - 30));
  const wrecked = fareFor(dist, 50, 10000, 0);
  near(wrecked.tipPenalty, wrecked.bonus);
  assert.equal(wrecked.total, Math.round(wrecked.base));
  const noBonus = fareFor(dist, 500, 50, 0);
  assert.equal(noBonus.tipPenalty, 0);
});

test('fare streak multiplier 1.0 -> 2.0, capped at 4', () => {
  const mults = [0, 1, 2, 3, 4, 5, 20].map(s => fareFor(1000, 1000, 0, s).multiplier);
  assert.deepEqual(mults, [1, 1.25, 1.5, 1.75, 2, 2, 2]);
  const f = fareFor(1000, 1000, 0, 4);
  assert.equal(f.total, Math.round((40 + 150) * 2));
  assert.equal(Number.isInteger(f.total), true);
  assert.equal(Number.isInteger(fareFor(333, 10, 3, 1).total), true);
  // degenerate inputs
  assert.equal(Number.isInteger(fareFor(0, 0, 0, 0).total), true);
  assert.ok(fareFor(NaN, NaN, NaN, NaN).total >= 0);
});

// ---------- save ----------

test('save round-trip through fake storage', () => {
  const st = fakeStorage();
  assert.equal(loadSave(st), null);
  const data = defaultSave();
  data.money = 1234;
  data.story = 3;
  data.done = { pehlaDin: true, race: 98.5 };
  data.chai = [1, 5, 9];
  data.bestRace = 101.2;
  data.fares = 7;
  data.owned = ['sports'];
  data.stats = { crashes: 4 };
  data.settings = { volume: 0.5 };
  assert.equal(writeSave(data, st), true);
  assert.ok(st.getItem(SAVE_KEY));
  assert.deepEqual(loadSave(st), data);
});

test('default save validates and corrupt/missing saves return null without throwing', () => {
  assert.deepEqual(validateSave(defaultSave()), defaultSave());
  assert.equal(defaultSave().money, 500);
  assert.equal(loadSave(fakeStorage({ [SAVE_KEY]: '{not json' })), null);
  assert.equal(loadSave(fakeStorage({ [SAVE_KEY]: 'null' })), null);
  assert.equal(loadSave(fakeStorage({ [SAVE_KEY]: '[1,2]' })), null);
  assert.equal(loadSave(fakeStorage({ [SAVE_KEY]: JSON.stringify({ v: 2, money: 5 }) })), null);
  assert.equal(loadSave(fakeStorage({ [SAVE_KEY]: JSON.stringify({ v: 1, money: 'rich' }) })), null);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(loadSave(throwing), null);
  assert.equal(writeSave(defaultSave(), throwing), false);
  assert.equal(writeSave({ junk: true }, fakeStorage()), false);
  assert.equal(validateSave(undefined), null);
  assert.equal(validateSave('x'), null);
});

test('validateSave sanitizes bad fields and fills defaults', () => {
  const s = validateSave({
    v: 1, money: -40.6, story: -2, done: 'nope', chai: [1, {}, 'a', null], bestRace: -1, fares: 'x',
    owned: ['bike', 3], stats: { a: 1, __proto__: { evil: 1 } }, extra: 'dropped',
  });
  assert.equal(s.money, 0);
  assert.equal(s.story, 0);
  assert.deepEqual(s.done, {});
  assert.deepEqual(s.chai, [1, 'a']);
  assert.equal(s.bestRace, null);
  assert.equal(s.fares, 0);
  assert.deepEqual(s.owned, ['bike']);
  assert.equal(s.stats.a, 1);
  assert.equal(s.extra, undefined);
  assert.deepEqual(s.settings, {});
  assert.equal(({}).evil, undefined);
  // partial save with only the required fields
  assert.equal(validateSave({ v: 1, money: 10 }).money, 10);
});

test('save works without any storage available', () => {
  assert.equal(loadSave(), null);
  assert.equal(writeSave(defaultSave()), false);
});
