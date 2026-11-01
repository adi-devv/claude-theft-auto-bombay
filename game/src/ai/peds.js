import * as THREE from 'three';
import { createCrowd } from '../characters/crowd.js';
import { appearance } from '../characters/wardrobe.js';
import { buildPedPlaces, samplePath, projectPath, clamp, distance2 } from './pedsRoutes.js';

const TARGET = 220, CAPACITY = 512, CELL = 10;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const key = (x, z, size = CELL) => Math.floor(x / size) + ',' + Math.floor(z / size);

// Circle / vehicle OBB, with a relative-motion sweep for fast cars.
function carContact(p, box, vx, vz, dt, padding = 0) {
  const co = Math.cos(box.rot), si = Math.sin(box.rot), radius = p.radius + padding;
  const dx = p.position.x - box.cx, dz = p.position.z - box.cz;
  const x = dx * co - dz * si, z = dx * si + dz * co;
  const qx = clamp(x, -box.hw, box.hw), qz = clamp(z, -box.hd, box.hd);
  let nx = x - qx, nz = z - qz, d = Math.hypot(nx, nz), depth = radius - d;
  if (d < 1e-6 && Math.abs(x) <= box.hw && Math.abs(z) <= box.hd) {
    if (box.hw - Math.abs(x) < box.hd - Math.abs(z)) { nx = Math.sign(x) || 1; nz = 0; depth = box.hw - Math.abs(x) + radius; }
    else { nx = 0; nz = Math.sign(z) || 1; depth = box.hd - Math.abs(z) + radius; }
    d = 1;
  } else if (depth <= 0) {
    const rx = (vx - p.velocity.x) * dt, rz = (vz - p.velocity.z) * dt;
    if (Math.hypot(rx, rz) < .24) return null;
    const sx = x + rx * co - rz * si, sz = z + rx * si + rz * co;
    const ex = x - sx, ez = z - sz; let low = 0, high = 1, axis = 0;
    for (const [o, v, h, id] of [[sx, ex, box.hw + radius, 1], [sz, ez, box.hd + radius, 2]]) {
      if (Math.abs(v) < 1e-7) { if (Math.abs(o) > h) return null; continue; }
      let a = (-h - o) / v, b = (h - o) / v;
      if (a > b) [a, b] = [b, a];
      if (a > low) { low = a; axis = id * (v > 0 ? -1 : 1); }
      high = Math.min(high, b); if (low > high) return null;
    }
    if (low < 0 || low > 1) return null;
    nx = Math.abs(axis) === 1 ? Math.sign(axis) : 0; nz = Math.abs(axis) === 2 ? Math.sign(axis) : 0; d = 1; depth = .02;
  }
  return { nx: nx / d * co + nz / d * si, nz: -nx / d * si + nz / d * co, depth: Math.max(.005, depth) };
}

export function createPeds(game) {
  const rng = game.rng || Math.random, nav = buildPedPlaces(game), crowd = createCrowd(game.scene, CAPACITY);
  const peds = game.peds || (game.peds = []), occupied = new Map(), carGrid = new Map(), pedGrid = new Map();
  let serial = 0, clock = 0, frame = 0, ringTimer = 0, candidateCentre = { x: Infinity, z: Infinity };
  let candidates = [], candidateTotal = 0, lastScream = -10, companions = [];
  const stats = { hits: 0, fatal: 0, recovered: 0, crossings: 0, dodges: 0, screams: 0, respawned: 0, updateMs: 0, frameMs: 0 };
  const focus = () => game.player?.position || nav.spawn;
  function nearestPath(x, z) {
    let best = null, d = Infinity;
    for (const path of nav.paths) {
      if (path.crossing) continue;
      const mid = path.points[Math.floor(path.points.length / 2)];
      if (Math.hypot(x - mid.x, z - mid.z) > path.length / 2 + Math.sqrt(d)) continue;
      const projection = projectPath(path, x, z);
      if (projection.dist2 < d) { best = { path, s: projection.s }; d = projection.dist2; }
    }
    return best;
  }
  function scream(p, force = false) {
    if (!game.audio?.ready || clock - lastScream < 2.8 || distance2(p.position, focus()) > 70 ** 2 || (!force && rng() > .28)) return;
    const ctx = game.audio.ctx, bus = game.audio.bus?.('sfx'); if (!ctx || !bus) return;
    lastScream = clock; stats.screams++;
    const oscillator = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    const t = ctx.currentTime, pitch = p.appearance.female ? 490 : 300;
    oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(pitch, t); oscillator.frequency.exponentialRampToValueAtTime(pitch * 1.6, t + .08); oscillator.frequency.exponentialRampToValueAtTime(pitch * .7, t + .48);
    filter.type = 'bandpass'; filter.frequency.value = 1300; filter.Q.value = 1.7;
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.045 / (1 + Math.sqrt(distance2(p.position, focus())) / 15), t + .03); gain.gain.exponentialRampToValueAtTime(.0001, t + .5);
    oscillator.connect(filter); filter.connect(gain); gain.connect(bus); oscillator.start(t); oscillator.stop(t + .52);
    oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  function releasePlace(p) { if (p.place && occupied.get(p.place.id) === p) occupied.delete(p.place.id); p.place = null; }
  function assign(p, place) {
    releasePlace(p); p.place = place; occupied.set(place.id, p);
    p.position.set(place.x, 0, place.z); p.velocity.set(0, 0, 0); p.path = place.path || null; p.s = place.s || 0;
    if (place.activity !== 'sit') { const resolved = game.collision?.resolveCircle(p.position.x, p.position.z, p.radius); if (resolved) { p.position.x = resolved.x; p.position.z = resolved.z; } }
    p.activity = place.activity; p.role = place.role || ''; p.match = place.match; p.matchPhase = place.match?.phase || 0;
    p.seatY = place.seatY || .85; p.heading = place.heading ?? Math.atan2(place.tx || 0, place.tz || 1);
    p.dir = place.activity === 'cross' ? p.s > 0 ? -1 : 1 : rng() < .5 ? -1 : 1;
    p.heading += p.dir < 0 && place.activity === 'walk' ? Math.PI : 0;
    p.state = place.activity === 'walk' ? 'walk' : 'idle'; p.wait = place.activity === 'cross' ? 1 + rng() * 2.5 : rng() * 5;
    p.waiting = place.activity === 'cross'; p.crossing = false; p.panicTime = 0; p.dodgeTime = 0; p.dodgeTarget = null; p.health = 100; p.airY = 0; p.downTime = 0; p._pose = null;
    p.appearance = appearance(rng, p.kind, place.activity);
    p.pace = place.family != null ? 1.05 : place.path?.edge?.name === 'Marine Drive' && rng() < .12 ? 2.65 : 1 + rng() * .55;
    if (place.family != null) {
      p.dir = place.family % 2 ? 1 : -1;
      const member = Math.floor(place.s / 2.7) % 3;
      p.appearance.variant = member === 0 ? 'school' : member === 1 ? 'sari' : 'casual';
      p.appearance.female = member === 1;
      if (member === 0) { p.appearance.scale = .75; p.appearance.shirt = 0xc8d8e3; p.appearance.trousers = 0x293854; p.appearance.moustache = false; }
    }
  }
  function rebuildCandidates() {
    const centre = focus(); candidateCentre = { x: centre.x, z: centre.z }; candidates = []; candidateTotal = 0; companions = [];
    for (const place of nav.places) {
      const d = Math.sqrt(distance2(place, centre)); if (d > 255) continue;
      const weight = place.weight * Math.exp(-d / 100);
      candidateTotal += weight; candidates.push({ place, cumulative: candidateTotal });
    }
  }
  function choosePlace() {
    if (!candidates.length) rebuildCandidates();
    while (companions.length) { const place = companions.shift(); if (!occupied.has(place.id)) return place; }
    for (let k = 0; k < 120; k++) {
      const n = rng() * candidateTotal;
      let lo = 0, hi = candidates.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (candidates[m].cumulative < n) lo = m + 1; else hi = m; }
      const place = candidates[lo]?.place;
      if (place && !occupied.has(place.id)) {
        if (place.match || place.stop || place.family != null) companions = candidates.filter(c => c.place !== place && !occupied.has(c.place.id) && (place.match ? c.place.match === place.match : place.stop ? c.place.stop === place.stop : c.place.path === place.path && c.place.family === place.family)).map(c => c.place);
        return place;
      }
    }
    return candidates.find(c => !occupied.has(c.place.id))?.place;
  }
  function panic(p, x, z) {
    if (p.removed || p.state === 'down' || p.state === 'dead' || p.isCop) return;
    if (!p.path || p.path.crossing) Object.assign(p, nearestPath(p.position.x, p.position.z));
    const tangent = p.path ? samplePath(p.path, p.s) : { tx: Math.sin(p.heading), tz: Math.cos(p.heading) };
    p.dir = (p.position.x - x) * tangent.tx + (p.position.z - z) * tangent.tz >= 0 ? 1 : -1;
    if (p.panicTime <= 0) scream(p);
    p.panicTime = Math.max(p.panicTime, 5 + rng() * 5); p.state = 'flee'; p.activity = 'walk'; p.waiting = false; p.crossing = false; p.wait = 0;
  }
  function knockDown(p, vx, vz, source) {
    if (p.removed || p.state === 'dead' || clock < p.hitUntil) return;
    vx = Number.isFinite(vx) ? vx : 0; vz = Number.isFinite(vz) ? vz : 0;
    const speed = Math.hypot(vx, vz), car = source && typeof source === 'object' && source.position;
    const fatal = !!car && speed > 8;
    p.health = fatal ? 0 : Math.max(1, p.health - Math.min(65, speed * 7));
    p.state = fatal ? 'dead' : 'down'; p.downTime = 0; p.hitUntil = clock + 1.15; p.getUp = 1;
    p.velocity.set(vx * .65, 0, vz * .65); p.airY = .01; p.vy = Math.min(5.5, 1.2 + speed * .19);
    p.fallSign = -1; p.heading = Math.atan2(vx, vz) + Math.PI; p.spinRate = (rng() - .5) * Math.min(5, speed * .24); p.spin = 0;
    p.activity = 'walk'; p.waiting = false; p.crossing = false; p._pose = null;
    if (fatal) stats.fatal++;
    panicAround(p.position.x, p.position.z, 14); scream(p, true);
  }
  function spawnPed(opts = {}) {
    if (peds.length >= CAPACITY) return null;
    const p = { id: ++serial, kind: opts.kind || 'civ', managed: !!opts.managed, controller: typeof opts.controller === 'function' ? opts.controller : null,
      position: new THREE.Vector3(opts.x ?? focus().x, 0, opts.z ?? focus().z), velocity: new THREE.Vector3(), heading: opts.heading ?? 0,
      radius: .29, state: opts.kind === 'driver' ? 'driver' : 'idle', health: 100, isCop: opts.kind === 'cop', removed: false,
      appearance: appearance(rng, opts.kind), phase: rng() * Math.PI * 2, seed: rng() * 30, activity: '', pace: 1.25,
      dir: 1, s: 0, wait: 0, hitUntil: -1, downTime: 0, panicTime: 0, aiTime: 0, age: 0,
      knockDown(vx, vz, source) { knockDown(p, vx, vz, source); }, panic(x, z) { panic(p, x, z); },
      remove() { if (p.removed) return; p.removed = true; releasePlace(p); const i = peds.indexOf(p); if (i !== -1) peds.splice(i, 1); } };
    peds.push(p);
    if (!p.managed && !p.controller) Object.assign(p, nearestPath(p.position.x, p.position.z));
    if (opts.kind === 'driver') { p.panicTime = 9; p.state = 'flee'; p.activity = 'walk'; if (p.path) { const t = samplePath(p.path, p.s); p.dir = Math.sin(p.heading) * t.tx + Math.cos(p.heading) * t.tz >= 0 ? 1 : -1; } }
    return p;
  }
  function nearest(x, z, radius = 2, filter) {
    let best = null, d = radius * radius;
    for (const p of peds) { if (p.removed || (filter && !filter(p))) continue; const ds = (x - p.position.x) ** 2 + (z - p.position.z) ** 2; if (ds <= d) { d = ds; best = p; } }
    return best;
  }
  function panicAround(x, z, radius = 20) { for (const p of peds) if (distance2(p.position, { x, z }) < radius * radius) panic(p, x, z); }
  function fillRing() {
    const centre = focus();
    const relocated = distance2(centre, candidateCentre) > 75 ** 2;
    if (distance2(centre, candidateCentre) > 20 ** 2) rebuildCandidates();
    for (const p of [...peds]) {
      if (p.managed && p.state !== 'down' && p.state !== 'dead' && distance2(p.position, centre) > (relocated ? 125 : 245) ** 2) {
        const place = choosePlace(); if (place) { assign(p, place); stats.respawned++; }
      } else if (!p.managed && !p.isCop && !p.controller && p.age > 50 && distance2(p.position, centre) > 320 ** 2) p.remove();
    }
    let n = peds.reduce((sum, p) => sum + Number(p.managed), 0);
    while (n < TARGET && peds.length < CAPACITY) { const place = choosePlace(); if (!place) break; const p = spawnPed({ managed: true }); assign(p, place); n++; }
  }
  function hashCars(dt) {
    carGrid.clear();
    for (const vehicle of game.vehicles || []) {
      if (!vehicle?.position || !vehicle.getOBB) continue;
      const b = vehicle.getOBB(); if (!b || !Number.isFinite(b.cx + b.cz + b.rot)) continue;
      const vx = vehicle.velocity?.x || 0, vz = vehicle.velocity?.z || 0, r = Math.hypot(b.hw, b.hd) + 1.6;
      const item = { vehicle, box: b, vx, vz };
      const x0 = Math.floor((b.cx - r - Math.max(0, vx * dt) + Math.min(0, vx * .5)) / CELL), x1 = Math.floor((b.cx + r - Math.min(0, vx * dt) + Math.max(0, vx * .5)) / CELL);
      const z0 = Math.floor((b.cz - r - Math.max(0, vz * dt) + Math.min(0, vz * .5)) / CELL), z1 = Math.floor((b.cz + r - Math.min(0, vz * dt) + Math.max(0, vz * .5)) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; let a = carGrid.get(k); if (!a) carGrid.set(k, a = []); a.push(item); }
    }
  }
  function safeCrossing(p) {
    const c = p.path.crossing;
    for (const v of game.vehicles || []) {
      if (!v.position) continue;
      const vx = v.velocity?.x || 0, vz = v.velocity?.z || 0, speed = Math.hypot(vx, vz);
      const dx = v.position.x - c.x, dz = v.position.z - c.z;
      const along = dx * c.tx + dz * c.tz, across = dx * c.tz - dz * c.tx;
      const projected = vx * c.tx + vz * c.tz;
      if (Math.abs(across) < c.width / 2 + 1.8 && Math.abs(along) < (v.length || 4) / 2 + 2.7) return false;
      if (speed > 1 && along * projected < 0 && Math.abs(along) / Math.max(1, Math.abs(projected)) < p.path.length / 1.65 + 1.2 && Math.abs(across) < c.width / 2 + 2) return false;
    }
    return true;
  }
  function think(p, dt) {
    if (p.panicTime > 0) { p.panicTime -= dt; if (p.panicTime <= 0) { p.state = 'walk'; p.kind === 'driver' && (p.kind = 'civ'); } }
    if (p.dodgeTime > 0 && p.dodgeTarget) {
      p.dodgeTime -= dt;
      const dx = p.dodgeTarget.x - p.position.x, dz = p.dodgeTarget.z - p.position.z, d = Math.hypot(dx, dz);
      p.velocity.set(dx / (d || 1) * Math.min(4.6, d * 10), 0, dz / (d || 1) * Math.min(4.6, d * 10));
      p.state = 'flee'; return;
    }
    if (p.activity === 'sit' || p.activity === 'vendor' || p.activity === 'busStop') { p.velocity.set(0, 0, 0); p.state = 'idle'; return; }
    if (p.activity === 'cricket') {
      const m = p.match, t = (clock + m.phase) % 14;
      const along = p.place.along + (p.role === 'bowler' ? -Math.min(10, Math.max(0, t - 3) * 2.4) : p.role === 'fielder' && t > 8 && t < 11 ? Math.sin(t * 1.8 + p.seed) * 2 : 0);
      const x = m.x + Math.cos(m.angle) * p.place.lateral + Math.sin(m.angle) * along, z = m.z - Math.sin(m.angle) * p.place.lateral + Math.cos(m.angle) * along;
      const dx = x - p.position.x, dz = z - p.position.z, d = Math.hypot(dx, dz), speed = Math.min(p.role === 'bowler' ? 2.8 : 1.6, d * 4);
      p.velocity.set(dx / (d || 1) * speed, 0, dz / (d || 1) * speed); p.state = speed > .15 ? 'walk' : 'idle'; return;
    }
    if (!p.path) Object.assign(p, nearestPath(p.position.x, p.position.z));
    if (!p.path) { p.velocity.set(0, 0, 0); return; }
    if (p.wait > 0) {
      p.wait -= dt; p.velocity.set(0, 0, 0); p.state = p.panicTime > 0 ? 'flee' : 'idle';
      if (p.waiting) p.heading += Math.sin(clock * 3 + p.seed) * .045;
      return;
    }
    if (p.waiting) {
      if (!safeCrossing(p)) { p.wait = .35; return; }
      p.waiting = false; p.crossing = true;
    }
    const proj = projectPath(p.path, p.position.x, p.position.z); p.s = proj.s;
    if ((p.s < .25 && p.dir < 0) || (p.s > p.path.length - .25 && p.dir > 0)) {
      p.dir *= -1;
      if (p.activity === 'cross') { stats.crossings++; p.crossing = false; p.waiting = true; p.wait = 3 + rng() * 6; }
      else if (p.panicTime <= 0) p.wait = .6 + rng() * 3;
    }
    const speed = p.panicTime > 0 ? 3.4 + (p.seed % .6) : p.crossing ? 1.65 : p.pace;
    const target = samplePath(p.path, clamp(p.s + p.dir * 1.2, 0, p.path.length));
    const dx = target.x - p.position.x, dz = target.z - p.position.z, d = Math.hypot(dx, dz) || 1;
    p.velocity.set(dx / d * speed, 0, dz / d * speed); p.state = p.panicTime > 0 ? 'flee' : 'walk';
  }
  function separate(p, dt) {
    if (p.activity !== 'walk' && p.activity !== 'cross' && !p.controller) return;
    const gx = Math.floor(p.position.x / 1.2), gz = Math.floor(p.position.z / 1.2);
    let dx = 0, dz = 0;
    for (let x = gx - 1; x <= gx + 1; x++) for (let z = gz - 1; z <= gz + 1; z++) {
      for (const q of pedGrid.get(x + ',' + z) || []) {
        if (q === p || q.state === 'dead' || q.state === 'down') continue;
        let ox = p.position.x - q.position.x, oz = p.position.z - q.position.z, d = Math.hypot(ox, oz);
        if (d < .01) { ox = (p.id % 2 ? 1 : -1) * .01; oz = .005; d = .012; }
        const limit = p.radius + q.radius + .16;
        if (d < limit) { dx += ox / d * (limit - d) * 3; dz += oz / d * (limit - d) * 3; }
      }
    }
    p.position.x += dx * dt; p.position.z += dz * dt;
  }
  function impact(p, dt) {
    if (p.state === 'dead' || p.state === 'down') return;
    for (const c of carGrid.get(key(p.position.x, p.position.z)) || []) {
      const hit = carContact(p, c.box, c.vx, c.vz, dt);
      const rvx = c.vx - p.velocity.x, rvz = c.vz - p.velocity.z, speed = Math.hypot(rvx, rvz);
      if (hit) {
        p.position.x += hit.nx * Math.min(hit.depth, 1); p.position.z += hit.nz * Math.min(hit.depth, 1);
        if (speed > 2 && clock >= p.hitUntil && Math.hypot(c.vx, c.vz) > 1.1) {
          const nx = speed > .01 ? rvx / speed : hit.nx, nz = speed > .01 ? rvz / speed : hit.nz;
          knockDown(p, nx * speed, nz * speed, c.vehicle); stats.hits++;
          c.vehicle.applyImpulse?.(-nx * Math.min(1100, speed * 38), -nz * Math.min(1100, speed * 38), p.position.x, p.position.z);
          game.events?.emit('pedHit', { ped: p, vehicle: c.vehicle, speed });
          if (c.vehicle.driver === 'player') game.events?.emit('crime', { type: p.state === 'dead' ? 'pedKilled' : 'pedHit', x: p.position.x, z: p.position.z, victim: p });
          break;
        }
      } else if (Math.hypot(c.vx, c.vz) > 2) {
        const future = { ...c.box, cx: c.box.cx + c.vx * .45, cz: c.box.cz + c.vz * .45 };
        const threat = carContact(p, future, 0, 0, 0, .65);
        if (threat && clock > (p.dodgeUntil || 0) && !p.controller) {
          panic(p, c.box.cx, c.box.cz); p.dodgeUntil = clock + 2;
          const length = Math.hypot(c.vx, c.vz), sideX = c.vz / length, sideZ = -c.vx / length;
          for (const side of [p.id % 2 ? 1 : -1, p.id % 2 ? -1 : 1]) {
            const x = p.position.x + sideX * side * 1.8, z = p.position.z + sideZ * side * 1.8;
            if (nav.safe(x, z)) { p.dodgeTarget = { x, z }; p.dodgeTime = 1.25; p.aiTime = .2; stats.dodges++; break; }
          }
        }
      }
    }
  }
  function fall(p, dt) {
    p.downTime += dt; p.vy -= 13 * dt; p.airY += p.vy * dt;
    if (p.airY < 0) { p.airY = 0; if (p.vy < -1.7) p.vy *= -.23; else p.vy = 0; }
    const damping = Math.exp(-(p.airY > .03 ? .6 : 5.5) * dt);
    p.velocity.multiplyScalar(damping); p.position.x += p.velocity.x * dt; p.position.z += p.velocity.z * dt;
    p.heading += p.spinRate * dt * Math.exp(-p.downTime * 1.4); p.spin = Math.sin(p.downTime * 5) * .18 * Math.exp(-p.downTime);
    if (p.state === 'dead' && p.downTime > 31) { p.remove(); return; }
    if (p.state === 'down' && p.downTime > 2.2) {
      p.getUp = 1 - clamp((p.downTime - 2.2) / 1.1, 0, 1);
      if (p.downTime > 3.3) { p.state = 'flee'; p.activity = 'walk'; p.panicTime = 4; p.velocity.set(0, 0, 0); Object.assign(p, nearestPath(p.position.x, p.position.z)); stats.recovered++; }
    }
  }
  function update(dt) {
    const start = performance.now(); clock += dt; frame++; ringTimer -= dt;
    if (ringTimer <= 0) { fillRing(); ringTimer = .8; }
    hashCars(dt); pedGrid.clear();
    const putNeighbour = p => { const k = key(p.position.x, p.position.z, 1.2); let arr = pedGrid.get(k); if (!arr) pedGrid.set(k, arr = []); arr.push(p); };
    for (const p of peds) {
      putNeighbour(p);
      if (p.activity === 'vendor' && p.state === 'idle') {
        const cart = p._cartProxy || (p._cartProxy = { id: -p.id, position: { x: 0, z: 0 }, radius: .6, state: 'idle' });
        cart.position.x = p.position.x + Math.sin(p.heading) * .85 * p.appearance.scale;
        cart.position.z = p.position.z + Math.cos(p.heading) * .85 * p.appearance.scale;
        putNeighbour(cart);
      }
    }
    const centre = focus();
    for (const p of [...peds]) {
      p.age += dt; const ox = p.position.x, oz = p.position.z;
      const fallen = p.state === 'down' || p.state === 'dead';
      if (fallen) fall(p, dt);
      else {
        if (p.controller) {
          // Controllers set world velocity + heading/state. If they move position themselves,
          // do not integrate it a second time. Static collision and impacts still apply.
          p.controller(p, dt);
          if (p.removed) continue;
        } else {
          p.aiTime += dt;
          const interval = distance2(p.position, centre) > 170 ** 2 ? .18 : .075;
          if (p.aiTime >= interval) { think(p, p.aiTime); p.aiTime = 0; }
        }
        if (p.position.x === ox && p.position.z === oz) { p.position.x += p.velocity.x * dt; p.position.z += p.velocity.z * dt; }
        separate(p, dt);
        const speed = Math.hypot(p.velocity.x, p.velocity.z);
        if (speed > .15 && !p.controller) p.heading += wrap(Math.atan2(p.velocity.x, p.velocity.z) - p.heading) * Math.min(1, dt * 10);
        p.phase += speed * dt * (speed > 2.2 ? 3.8 : 5.2);
      }
      if (p.removed) continue;
      const moved = Math.abs(p.position.x - ox) + Math.abs(p.position.z - oz) > .00001;
      if (moved) {
        const result = game.collision?.resolveCircle(p.position.x, p.position.z, p.radius);
        if (result) { p.position.x = result.x; p.position.z = result.z; }
        const onRoad = !fallen && !p.controller && !p.crossing && game.roads.isOnRoad(p.position.x, p.position.z, .15) && !game.roads.isOnRoad(ox, oz, .15);
        if ((!game.roads.isLand(p.position.x, p.position.z) || onRoad) && !fallen) {
          p.position.x = ox; p.position.z = oz;
          if (!p.controller && p.path && !p.path.crossing) { const target = samplePath(p.path, p.s); const dx = target.x - ox, dz = target.z - oz, d = Math.hypot(dx, dz) || 1; p.velocity.set(dx / d, 0, dz / d); }
        } else if (!game.roads.isLand(p.position.x, p.position.z)) { p.position.x = ox; p.position.z = oz; p.velocity.multiplyScalar(-.1); }
      }
      impact(p, dt);
    }
    stats.updateMs = stats.updateMs * .97 + (performance.now() - start) * .03;
  }
  function frameUpdate() { const start = performance.now(); crowd.update(peds, game.camera, clock); stats.frameMs = stats.frameMs * .97 + (performance.now() - start) * .03; }
  const eventPanic = e => { if (Number.isFinite(e?.x + e?.z)) panicAround(e.x, e.z, e.radius ?? 24); };
  game.events?.on('panic', eventPanic);
  game.events?.on('crime', e => eventPanic({ ...e, radius: e?.type === 'pedKilled' ? 35 : 16 }));
  game.events?.on('explosion', e => {
    if (!Number.isFinite(e?.x + e?.z)) return;
    eventPanic({ ...e, radius: (e?.radius || 9) * 4 });
    for (const p of peds) { const d = Math.sqrt(distance2(p.position, e)); if (d < (e.radius || 9)) { const force = (1 - d / (e.radius || 9)) * 13; knockDown(p, (p.position.x - e.x) / (d || 1) * force, (p.position.z - e.z) / (d || 1) * force, e.vehicle || 'explosion'); } }
  });
  game.events?.on('vehicleCollision', e => { if ((e?.impulse || 0) > 1700 || (e?.relSpeed || 0) > 4) eventPanic({ ...e, radius: 28 }); });
  rebuildCandidates(); fillRing();
  game.debug.extra.peds = () => {
    const byState = {}, byActivity = {};
    for (const p of peds) { byState[p.state] = (byState[p.state] || 0) + 1; byActivity[p.activity || p.kind] = (byActivity[p.activity || p.kind] || 0) + 1; }
    return { active: peds.length, visible: crowd.visible, byState, byActivity, drawCalls: crowd.drawCalls, paths: nav.paths.length, places: nav.places.length, ...stats, updateMs: +stats.updateMs.toFixed(3), frameMs: +stats.frameMs.toFixed(3) };
  };
  return { update, frameUpdate, spawnPed, nearest, panicAround };
}
