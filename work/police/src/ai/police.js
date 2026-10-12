// Police AI (Mumbai Police "mobiles"): patrols, dispatch by wanted level, road-graph pursuit, ramming/PIT,
// boxing-in, roadblocks (nakabandi), foot cops with lathis, arrests, sirens + light bars.
// Owned by the Police agent. Interfaces: CONTRACT.md (Police, Wanted, Vehicle, Peds, Player).
// Driving goes ONLY through vehicle.setControls(); see policeNav.js for the controller.
import * as THREE from 'three';
import { planRoute, pathLookahead, pathSpeedLimit, remainingLength, driveCar, wrapAngle } from './policeNav.js';
import { attachLightBar, vehicleHasOwnLightBar, SirenAudio, makeCopMesh } from './policeFx.js';
import { obbOverlap } from '../world/collision.js';

// ---------------------------------------------------------------------------------------------
// Tuning per wanted level (index = stars). See notes/police.md for the reasoning.
export const TUNE = {
  patrolCars: 2,
  cars:          [0, 2, 3, 4, 6, 7],          // pursuit cars wanted on the map (excl. roadblocks)
  footCap:       [0, 3, 4, 6, 7, 8],
  spawnEvery:    [5, 3.2, 2.4, 2.0, 1.5, 1.1],// s between car spawns
  spawnMin:      [120, 120, 120, 125, 125, 120],
  spawnMax:      [220, 200, 210, 220, 220, 220],
  vmax:          [11, 17, 21, 25, 28, 31],    // m/s cap on target speed
  aLat:          [4.5, 5.5, 6.0, 6.5, 7.0, 7.5],
  rammers:       [0, 0, 0, 2, 3, 7],
  ramCooldown:   [0, 0, 0, 3.2, 2.0, 1.3],
  roadblocks:    [0, 0, 0, 1, 2, 2],
  roadblockEvery:[0, 0, 0, 28, 20, 15],
  baton:         [0, 0, 5, 7, 9, 11],         // damage per lathi hit (0 = arrest only)
  footSpeed:     [4.5, 4.9, 5.1, 5.3, 5.5, 5.7],// m/s (player sprint should be ~6+)
  followDist:    [12, 10, 9, 7, 6, 5],
  sight: 60, sightPursuit: 85, sightClose: 14,
};

const DESPAWN_FAR = 290;      // active units further than this and unseen get recycled
const MAX_POLICE_VEHICLES = 16;
const MAX_FOOT = 12;

export function createPolice(game) {
  const { roads, collision, events } = game;
  const units = [];
  const bars = new Map();          // vehicle -> fallback light bar
  const siren = new SirenAudio(game);
  const frustum = new THREE.Frustum(), projM = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(), 3);
  let idSeq = 1, t = 0, spawnT = 2, roadblockT = 8, sightT = 0, frustumT = 0, boxT = 0;
  let standDown = false, busting = false, lastLevel = 0;
  const pvel = { x: 0, z: 0, lx: null, lz: null };
  let slowT = 0;
  const stats = { spawned: 0, despawned: 0, rams: 0, busts: 0, roadblocks: 0, stuck: 0, recycled: 0, footSpawned: 0 };
  const rng = () => (game.rng ? game.rng() : Math.random());

  // spawn candidates: every 12 m along every edge (centreline); lanes picked at spawn time
  const spawnPts = [];
  for (const e of roads.edges) {
    const na = roads.nodes.get(e.a), nb = roads.nodes.get(e.b);
    for (let s = Math.max(10, na.radius + 6); s < e.length - Math.max(10, nb.radius + 6); s += 12) {
      const p = roads.sample(e, s);
      spawnPts.push({ e, s, x: p.x, z: p.z, tx: p.tx, tz: p.tz });
    }
  }

  // ------------------------------------------------------------------ helpers
  const lvl = () => (standDown ? 0 : (game.wanted?.level || 0));
  const player = () => game.player;
  const playerActive = () => { const p = player(); return !!p && (!p.state || p.state === 'normal'); };
  const ppos = () => { const p = player(); return p.vehicle ? p.vehicle.position : p.position; };
  function pfwd() {
    const p = player();
    const h = p.vehicle ? p.vehicle.heading : (p.heading || 0);
    return { x: Math.sin(h), z: Math.cos(h) };
  }
  function isVisible(x, z, r = 3) {
    const c = game.camera.position;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > 380) return false;
    sphere.center.set(x, 1.2, z); sphere.radius = r;
    if (!frustum.intersectsSphere(sphere)) return false;
    if (d < 25) return true;
    return collision.lineOfSight(c.x, c.z, x, z, 6);
  }
  function refreshFrustum() {
    const cam = game.camera; cam.updateMatrixWorld();
    projM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projM);
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const carUnits = () => units.filter((u) => u.kind === 'car');
  const footUnits = () => units.filter((u) => u.kind === 'foot');
  function activePursuers() { return units.filter((u) => u.kind === 'car' && !['leave', 'wrecked', 'roadblock'].includes(u.mode)); }
  function isFlipped(v) {
    if (v.flipped) return true;
    const q = v.mesh?.quaternion; if (!q) return false;
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z); // y of the mesh's local up in world space
    return upY < 0.35;
  }
  function radio(text, minGap = 5) {
    if (t - (radio.last ?? -99) < minGap) return;
    radio.last = t; game.hud?.notify?.(text);
  }

  // ------------------------------------------------------------------ spawning
  function pickSpawn(minR, maxR, preferAhead, anchor) {
    const P = anchor || ppos();
    const sp = Math.hypot(pvel.x, pvel.z);
    const mvx = sp > 4 ? pvel.x / sp : 0, mvz = sp > 4 ? pvel.z / sp : 0;
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < spawnPts.length; k++) {
      const c = spawnPts[k];
      const dx = c.x - P.x, dz = c.z - P.z, d2 = dx * dx + dz * dz;
      if (d2 < minR * minR || d2 > maxR * maxR) continue;
      const d = Math.sqrt(d2);
      let score = rng() * 0.8;
      if (preferAhead && sp > 4) score += ((dx * mvx + dz * mvz) / d) * 1.2;
      if (score <= bestScore) continue;
      if (isVisible(c.x, c.z, 4)) continue;
      let clear = true;
      for (const v of game.vehicles) { if ((v.position.x - c.x) ** 2 + (v.position.z - c.z) ** 2 < 14 * 14) { clear = false; break; } }
      if (!clear) continue;
      best = c; bestScore = score;
    }
    return best;
  }

  function spawnCar(mode, opts = {}) {
    if (carUnits().length >= MAX_POLICE_VEHICLES) return null;
    const L = lvl();
    let c = pickSpawn(opts.minR ?? TUNE.spawnMin[L], opts.maxR ?? TUNE.spawnMax[L], opts.ahead, opts.anchor);
    if (!c) c = pickSpawn(90, 300, false, opts.anchor); // widen the band if nothing fits
    if (!c) return null;
    const P = ppos();
    let dir = (c.tx * (P.x - c.x) + c.tz * (P.z - c.z)) >= 0 ? 1 : -1; // head towards the player
    if (mode === 'patrol' && rng() < 0.4) dir = -dir;
    const lane = Math.max(0, c.e.lanes - 1);
    const lp = roads.lanePoint(c.e, c.s, dir, lane);
    const v = game.createVehicle({ type: 'police', x: lp.x, z: lp.z, heading: Math.atan2(lp.hx, lp.hz) });
    const u = newCarUnit(v, mode);
    stats.spawned++;
    return u;
  }

  function newCarUnit(v, mode) {
    const u = {
      id: idSeq++, kind: 'car', vehicle: v, position: v.position, mode, crew: 2, crewOut: [],
      path: null, pathT: 0, ctl: {}, ramCD: 0, sees: false, seeT: -99, bornT: t, modeT: t, waitT: 0,
      slot: null, rammer: false, searchPt: null, vis: false, visT: 0,
    };
    v.ai = u;
    v.driver = { kind: 'police', isCop: true, unit: u, eject: () => ejectCrew(u, true) };
    v.sirenOn = mode !== 'patrol';
    if (!vehicleHasOwnLightBar(v) && !bars.has(v)) { try { bars.set(v, attachLightBar(v)); } catch (e) { /* mesh-less vehicle */ } }
    units.push(u);
    return u;
  }

  function spawnFoot(x, z, heading, mode, car) {
    const u = {
      id: idSeq++, kind: 'foot', mode, car: car || null, position: null, heading, vel: { x: 0, z: 0 },
      stun: 0, swingT: 0, ped: null, mesh: null, post: { x, z }, anim: rng() * 10, dead: false, bornT: t,
    };
    let ped = null;
    try { ped = game.pedSystem?.spawnPed?.({ x, z, heading, kind: 'cop', controller: (pd, dt) => stepFoot(u, dt) }); } catch (e) { ped = null; }
    if (ped && ped.position) {
      u.ped = ped; u.position = ped.position; ped.isCop = true;
    } else {
      u.position = new THREE.Vector3(x, 0, z);
      u.mesh = makeCopMesh(); u.mesh.position.copy(u.position); u.mesh.rotation.y = heading;
      game.scene.add(u.mesh);
    }
    stats.footSpawned++;
    units.push(u);
    return u;
  }

  /** Crew leaves the car. jacked: the player is taking it (driver.eject()); orphan: car is useless (wreck). */
  function ejectCrew(u, jacked, orphan) {
    const v = u.vehicle;
    const n = u.crew; u.crew = 0;
    const door = v.driverDoor ? v.driverDoor() : { x: v.position.x, z: v.position.z };
    const r = v.right || { x: -Math.cos(v.heading), z: Math.sin(v.heading) };
    for (let i = 0; i < n; i++) {
      if (footUnits().length >= MAX_FOOT) break;
      const x = i === 0 ? door.x : v.position.x - r.x * 1.6, z = i === 0 ? door.z : v.position.z - r.z * 1.6;
      const f = spawnFoot(x, z, v.heading, 'chase', jacked || orphan ? null : u);
      if (!jacked && !orphan) u.crewOut.push(f);
    }
    if (jacked) { // the player took the car: it is no longer a police unit
      u.mode = 'jacked'; v.ai = null; v.sirenOn = false;
      removeUnit(u, false);
    }
  }

  function removeUnit(u, destroy = true) {
    const i = units.indexOf(u); if (i >= 0) units.splice(i, 1);
    if (u.kind === 'car') {
      for (const f of u.crewOut) if (f.car === u) f.car = null;
      u.crewOut = [];
      if (destroy) {
        const b = bars.get(u.vehicle); if (b) { b.dispose(); bars.delete(u.vehicle); }
        if (u.vehicle.driver && u.vehicle.driver.unit === u) u.vehicle.driver = null;
        u.vehicle.ai = null;
        if (game.player?.vehicle !== u.vehicle) u.vehicle.destroy?.();
        stats.despawned++;
      }
    } else {
      if (u.ped) { try { if (u.ped.state !== 'dead') u.ped.remove?.(); } catch (e) { /* ped system owns it */ } }
      if (u.mesh) { game.scene.remove(u.mesh); u.mesh = null; }
      if (u.car) { const k = u.car.crewOut.indexOf(u); if (k >= 0) u.car.crewOut.splice(k, 1); }
    }
  }

  // ------------------------------------------------------------------ sight / witnesses
  function unitCanSee(u, x, z, range) {
    if (u.kind === 'car') {
      if (u.mode === 'wrecked' || u.mode === 'leave' || u.mode === 'jacked') return false;
      if (u.crew <= 0 && u.mode !== 'roadblock' && u.mode !== 'deployed') return false;
    } else if (u.stun > 0 || u.dead || u.mode === 'leave' || (u.ped && (u.ped.state === 'down' || u.ped.state === 'dead'))) return false;
    const d = Math.hypot(u.position.x - x, u.position.z - z);
    if (d < TUNE.sightClose) return true;
    if (d > (u.kind === 'foot' ? Math.min(range, 45) : range)) return false;
    return collision.lineOfSight(u.position.x, u.position.z, x, z, 2);
  }

  /** Used by Wanted: is a crime at (x,z) witnessed by police? Returns the witnessing unit or null. */
  function witness(x, z) {
    for (const u of units) if (unitCanSee(u, x, z, TUNE.sight)) { u.seeT = t; return u; }
    return null;
  }

  // ------------------------------------------------------------------ roadblocks (nakabandi)
  const roadblocks = [];
  function placeRoadblock() {
    const P = ppos(); const sp = Math.hypot(pvel.x, pvel.z);
    if (sp < 7) return false;
    const n = roads.nearest(P.x, P.z, 25); if (!n) return false;
    let edge = n.edge, s = n.s, dir = (pvel.x * n.tx + pvel.z * n.tz) >= 0 ? 1 : -1;
    let remaining = 150 + rng() * 60, sPlace = null;
    for (let k = 0; k < 10; k++) { // follow the most likely (straightest) route ahead
      const avail = dir > 0 ? edge.length - s : s;
      if (avail >= remaining) { sPlace = s + dir * remaining; break; }
      remaining -= avail;
      const node = roads.nodes.get(dir > 0 ? edge.b : edge.a);
      if (node.exit) return false;
      const end = roads.sample(edge, dir > 0 ? edge.length : 0);
      const inx = end.tx * dir, inz = end.tz * dir;
      let best = null, bestDot = -2;
      for (const o of node.edges) {
        if (o.edge === edge) continue;
        const st = roads.sample(o.edge, o.dir > 0 ? 0 : o.edge.length);
        const d = (st.tx * o.dir) * inx + (st.tz * o.dir) * inz;
        if (d > bestDot) { bestDot = d; best = o; }
      }
      if (!best) return false;
      edge = best.edge; dir = best.dir; s = dir > 0 ? 0 : edge.length;
    }
    if (sPlace == null) return false;
    const na = roads.nodes.get(edge.a), nb = roads.nodes.get(edge.b);
    const lo = na.radius + 14, hi = edge.length - nb.radius - 14;
    if (hi <= lo) return false;
    sPlace = Math.max(lo, Math.min(hi, sPlace));
    const c = roads.sample(edge, sPlace);
    const dP = Math.hypot(c.x - P.x, c.z - P.z);
    if (dP < 110) return false;
    if (dP < 150 && isVisible(c.x, c.z, 4)) return false;
    for (const rb of roadblocks) if (Math.hypot(rb.x - c.x, rb.z - c.z) < 60) return false;
    const tdx = c.tx * dir, tdz = c.tz * dir;           // player's travel direction
    const lx = tdz, lz = -tdx;                          // left of travel = the player's carriageway (LHT)
    const half = edge.width / 2, inner = edge.median / 2;
    const span = half - inner;
    // Two cars across the suspect's carriageway; the oncoming side stays open (escape = swerve into oncoming traffic).
    const placements = span >= 9
      ? [{ lat: inner + 2.6, along: 0, ang: 1.35 }, { lat: half - 2.6, along: 2.5, ang: -1.35 }]
      : span >= 6
        ? [{ lat: inner + 1.8, along: 0, ang: 1.2 }, { lat: half - 1.6, along: 3, ang: -1.2 }]
        : [{ lat: inner + span / 2, along: 0, ang: 1.25 }, { lat: -inner - span * 0.25, along: 8, ang: -1.1 }];
    const ht = Math.atan2(tdx, tdz);
    const cars = [];
    for (const pl of placements) {
      const x = c.x + lx * pl.lat + tdx * pl.along, z = c.z + lz * pl.lat + tdz * pl.along;
      const h = ht + pl.ang;
      if (collision.queryOBB(x, z, 0.95, 2.2, h).some((hh) => hh.depth > 0.6)) continue;
      const v = game.createVehicle({ type: 'police', x, z, heading: h });
      const u = newCarUnit(v, 'roadblock');
      u.crew = 0; v.sirenOn = true;
      cars.push(u);
    }
    if (!cars.length) return false;
    const cops = [];
    for (let i = 0; i < 2; i++) {
      const lat = half + 1.2, x = c.x + lx * lat + tdx * (-3 + i * 6), z = c.z + lz * lat + tdz * (-3 + i * 6);
      const f = spawnFoot(x, z, ht + Math.PI, 'guard', null);
      f.post = { x, z }; cops.push(f);
    }
    roadblocks.push({ x: c.x, z: c.z, cars, cops, t, edge: edge.name });
    stats.roadblocks++;
    radio(`Control: nakabandi set up on ${edge.name}. All mobiles, push him into it.`, 2);
    return true;
  }

  function updateRoadblocks() {
    const P = ppos();
    for (let i = roadblocks.length - 1; i >= 0; i--) {
      const rb = roadblocks[i];
      rb.cars = rb.cars.filter((u) => units.includes(u) && u.mode === 'roadblock');
      rb.cops = rb.cops.filter((u) => units.includes(u));
      const d = Math.hypot(rb.x - P.x, rb.z - P.z);
      const visible = isVisible(rb.x, rb.z, 8);
      // at 4-5 stars, a roadblock the suspect got past joins the chase
      if (lvl() >= 4 && d < 45 && !rb.joined) {
        const toP = { x: P.x - rb.x, z: P.z - rb.z };
        if (toP.x * pvel.x + toP.z * pvel.z > 0 && Math.hypot(pvel.x, pvel.z) > 6) {
          rb.joined = true;
          for (const u of rb.cars) { u.crew = 1; setMode(u, 'respond'); }
        }
      }
      if ((!rb.cars.length && !rb.cops.length) || (!visible && (d > 230 || t - rb.t > 80 || lvl() === 0))) {
        for (const u of rb.cars) removeUnit(u);
        for (const f of rb.cops) if (f.mode === 'guard') removeUnit(f);
        roadblocks.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ car AI
  function setMode(u, m) { if (u.mode !== m) { u.mode = m; u.modeT = t; u.path = null; u.slot = null; u.searchPt = null; } }

  function followPath(u, dt, tx, tz, vCap, replanEvery = 2.5) {
    const v = u.vehicle;
    const needPlan = !u.path || t - u.pathT > replanEvery || Math.hypot(u.path.tx - tx, u.path.tz - tz) > 25 || u.ctl.justReversed;
    if (needPlan) {
      u.ctl.justReversed = false;
      const r = planRoute(roads, v.position.x, v.position.z, v.heading, tx, tz);
      u.pathT = t;
      u.path = r || { pts: [{ x: v.position.x, z: v.position.z, k: 0 }, { x: tx, z: tz, k: 0 }], tx, tz, idx: 0, length: 0 };
    }
    const sp = Math.abs(v.speed || 0);
    const la = pathLookahead(u.path, v.position.x, v.position.z, 6 + sp * 0.55);
    const L = lvl();
    let vT = Math.min(vCap, pathSpeedLimit(u.path, sp, TUNE.aLat[L], 5.5));
    const rem = remainingLength(u.path) + (u.path.offDist || 0);
    if (la.end) vT = Math.min(vT, Math.max(0, rem - 3) * 0.9);
    if (u.path.offDist > 10) vT = Math.min(vT, 10); // way off the path (after a spin / shove): rejoin gently
    const res = driveCar(v, u.ctl, dt, la, vT, { game, aggressive: L >= 3 });
    if (res.stuck) { stats.stuck++; u.path = null; }
    return rem;
  }

  function driveDirect(u, dt, aim, vT, ignore) {
    const v = u.vehicle;
    // straight line blocked by buildings -> use the road graph instead
    if (!collision.lineOfSight(v.position.x, v.position.z, aim.x, aim.z, 1.0)) return followPath(u, dt, aim.x, aim.z, vT, 1.2);
    const res = driveCar(v, u.ctl, dt, aim, vT, { game, ignore, aggressive: lvl() >= 3 });
    if (res.stuck) stats.stuck++;
    return 0;
  }

  function pursuitTarget(u) {
    const p = player(), P = ppos(), v = u.vehicle, L = lvl();
    const pf = pfwd(), pr = { x: -pf.z, z: pf.x };
    const pSp = Math.hypot(pvel.x, pvel.z);
    const d = dist(v.position, P);
    const mySp = Math.abs(v.speed || 0);
    const vmax = TUNE.vmax[L];
    if (p.mode !== 'vehicle' || !p.vehicle) {
      // suspect on foot: pull up ~9 m away and stop; the crew gets out
      return { aim: P, vT: d > 30 ? vmax : Math.max(0, (d - 9) * 0.9), ignore: null };
    }
    if (u.slot) { // boxing in a slow/stopped suspect
      const ds = dist(v.position, u.slot);
      return { aim: u.slot, vT: ds < 2.5 ? 0 : Math.min(14, ds * 0.9), ignore: p.vehicle };
    }
    const relx = v.position.x - P.x, relz = v.position.z - P.z;
    const lz = relx * pf.x + relz * pf.z; // + = cop ahead of the suspect
    const myF = v.forward;
    const headOn = lz > 4 && (myF.x * pf.x + myF.z * pf.z) < -0.3;
    if (u.rammer && u.ramCD <= 0 && L >= 3) {
      // predictive intercept on the rear quarter: a PIT when alongside, a T-bone when crossing
      const tt = Math.min(1.6, d / Math.max(6, mySp + 2));
      const side = (relx * pr.x + relz * pr.z) > 0 ? 1 : -1;
      const aim = { x: P.x + pvel.x * tt - pf.x * 1.3 + pr.x * side * 0.4, z: P.z + pvel.z * tt - pf.z * 1.3 + pr.z * side * 0.4 };
      return { aim, vT: vmax, ignore: p.vehicle };
    }
    if (headOn) { // in front, facing the suspect: block his lane
      const aim = { x: P.x + pvel.x * 0.9, z: P.z + pvel.z * 0.9 };
      return { aim, vT: L >= 2 ? Math.min(12, vmax) : 7, ignore: L >= 3 ? p.vehicle : null };
    }
    const fd = u.ramCD > 0 ? 14 : TUNE.followDist[L];
    if (L >= 3 && !u.rammer && pSp > 6) { // flankers get alongside (sets up the box)
      const side = (u.id % 2) ? 1 : -1;
      const aim = { x: P.x + pvel.x * 0.8 + pr.x * side * 4.5, z: P.z + pvel.z * 0.8 + pr.z * side * 4.5 };
      return { aim, vT: Math.min(vmax, pSp + Math.min(10, dist(v.position, aim) * 0.5)), ignore: null };
    }
    // tail: sit followDist behind, matching speed
    const behind = { x: P.x - pf.x * fd + pvel.x * 0.6, z: P.z - pf.z * fd + pvel.z * 0.6 };
    let aim = behind;
    if (lz > -fd + 2) aim = { x: P.x + pvel.x * 0.5, z: P.z + pvel.z * 0.5 };
    const gapErr = lz < -fd ? dist(v.position, behind) : -(lz + fd);
    const vT = Math.min(vmax, Math.max(0, pSp + Math.max(-6, Math.min(12, gapErr * 0.6))));
    return { aim, vT, ignore: null };
  }

  function updateCar(u, dt, ctx) {
    const v = u.vehicle;
    if (!game.vehicles.includes(v)) { removeUnit(u, false); return; }
    if (player().vehicle === v) { v.ai = null; removeUnit(u, false); return; } // stolen
    if (u.mode !== 'wrecked' && (v.wrecked || isFlipped(v) || (v.health != null && v.health <= 0))) {
      setMode(u, 'wrecked'); v.sirenOn = false;
      v.setControls({ throttle: 0, brake: 0, steer: 0, handbrake: true });
      if (u.crew > 0 && ctx.L > 0 && ctx.dP(u) < 70) ejectCrew(u, false, true);
      u.crew = 0;
    }
    u.ramCD -= dt;
    const L = ctx.L, P = ctx.P, d = ctx.dP(u);
    if ((u.visT -= dt) <= 0) { u.visT = 0.3; u.vis = isVisible(v.position.x, v.position.z); }
    const visible = u.vis;

    // ---------------- lifecycle
    if (u.mode === 'wrecked') { if (!visible && d > 60) removeUnit(u); return; }
    if (u.mode === 'leave') {
      if ((!visible && d > 90) || (t - u.modeT > 45 && !visible)) { removeUnit(u); return; }
    } else if (u.mode !== 'roadblock' && u.mode !== 'deployed') {
      if (!visible && d > DESPAWN_FAR) { stats.recycled++; removeUnit(u); return; }
      if ((u.ctl.stuckCount || 0) >= 4 && !visible && d > 40) { stats.recycled++; removeUnit(u); return; }
      if (u.ctl.lastStuck && t - u.ctl.lastStuck > 25) u.ctl.stuckCount = 0;
    }

    // ---------------- mode selection
    if (u.mode !== 'leave' && u.mode !== 'roadblock') {
      if (L === 0) {
        if (u.crewOut.length) setMode(u, 'deployed');
        else if (u.crew > 0 && ctx.patrolSlots > 0) { ctx.patrolSlots--; setMode(u, 'patrol'); }
        else setMode(u, 'leave');
      } else if (u.crewOut.length || u.crew === 0) {
        setMode(u, 'deployed');
      } else if (game.wanted.seen && u.sees && d < TUNE.sightPursuit) {
        setMode(u, 'pursue');
      } else if (u.mode === 'pursue' && game.wanted.seen && t - u.seeT < 1.5) {
        // keep chasing for a moment around corners
      } else if (game.wanted.seen) {
        setMode(u, 'respond');
      } else {
        setMode(u, 'search');
      }
    }
    v.sirenOn = !['patrol', 'leave', 'wrecked'].includes(u.mode);

    // ---------------- behaviour
    const vmax = TUNE.vmax[L];
    switch (u.mode) {
      case 'patrol': {
        if (!u.searchPt || (u.path && remainingLength(u.path) < 12) || t - u.modeT > 60) {
          const c = pickSpawn(50, 240, false) || spawnPts[(rng() * spawnPts.length) | 0];
          u.searchPt = { x: c.x, z: c.z }; u.path = null; u.modeT = t;
        }
        followPath(u, dt, u.searchPt.x, u.searchPt.z, TUNE.vmax[0], 30);
        break;
      }
      case 'leave': {
        if (!u.searchPt) { // drive away from the suspect
          let best = spawnPts[0], bd = -1;
          for (let k = 0; k < 40; k++) { const c = spawnPts[(rng() * spawnPts.length) | 0]; const dd = dist(c, P); if (dd > bd && dd < 500) { bd = dd; best = c; } }
          u.searchPt = { x: best.x, z: best.z }; u.path = null;
        }
        followPath(u, dt, u.searchPt.x, u.searchPt.z, 12, 30);
        break;
      }
      case 'roadblock':
        v.setControls({ throttle: 0, brake: 0, steer: 0, handbrake: true });
        break;
      case 'respond': {
        const ahead = Math.min(2.5, d / 25);
        followPath(u, dt, P.x + pvel.x * ahead, P.z + pvel.z * ahead, vmax, 1.8);
        break;
      }
      case 'search': {
        const W = game.wanted, R = Math.max(30, W.searchRadius * 0.8);
        if (!u.searchPt || Math.hypot(u.searchPt.x - W.lastKnown.x, u.searchPt.z - W.lastKnown.z) > R + 20 ||
            (u.path && remainingLength(u.path) < 12) || t - u.modeT > 25) {
          const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
          const n = roads.nearest(W.lastKnown.x + Math.cos(a) * r, W.lastKnown.z + Math.sin(a) * r, 120);
          u.searchPt = n ? { x: n.x, z: n.z } : { x: W.lastKnown.x, z: W.lastKnown.z };
          u.path = null; u.modeT = t;
        }
        followPath(u, dt, u.searchPt.x, u.searchPt.z, vmax * 0.65, 30);
        break;
      }
      case 'pursue': {
        const tg = pursuitTarget(u);
        driveDirect(u, dt, tg.aim, tg.vT, tg.ignore);
        // contact bookkeeping (rams); Vehicles resolves the physics
        const pv = player().vehicle;
        if (pv && u.ramCD <= 0 && d < 6) {
          if (obbOverlap(v.getOBB(), pv.getOBB()) || d < 3.0) {
            u.ramCD = u.rammer && L >= 3 ? TUNE.ramCooldown[L] : 2.5;
            stats.rams++;
            if (u.rammer) radio(`Mobile ${u.id}: contact! Ramming the suspect.`, 12);
          }
        }
        break;
      }
      case 'deployed': {
        // parked with crew out: hold still, wait for them; leave if they're gone too long
        if (Math.abs(v.speed || 0) > 0.6) v.setControls({ throttle: 0, brake: 1, steer: 0, handbrake: false });
        else v.setControls({ throttle: 0, brake: 0, steer: 0, handbrake: true });
        u.crewOut = u.crewOut.filter((f) => units.includes(f));
        if (!u.crewOut.length) { setMode(u, u.crew === 0 ? 'leave' : L ? 'respond' : 'patrol'); break; }
        u.waitT += dt;
        const pAway = d > 45 && player().mode === 'vehicle';
        if (pAway || L === 0) for (const f of u.crewOut) if (f.mode === 'chase' || f.mode === 'idle') f.mode = 'return';
        if (u.waitT > 14 && (pAway || L === 0)) {
          for (const f of u.crewOut) { f.car = null; if (f.mode === 'return') f.mode = L ? 'chase' : 'leave'; }
          u.crewOut = []; setMode(u, u.crew > 0 && L ? 'respond' : 'leave');
        }
        break;
      }
    }

    // ---------------- deploy the crew when the suspect is on foot nearby, or stopped next to us
    if (L > 0 && u.crew > 0 && (u.mode === 'pursue' || u.mode === 'respond') && Math.abs(v.speed || 0) < 1.5) {
      const onFoot = player().mode !== 'vehicle';
      const footN = footUnits().length;
      if (footN < TUNE.footCap[L] && ((onFoot && d < 30) || (!onFoot && ctx.slowT > 0.8 && d < 20))) {
        const n = L >= 2 ? Math.min(u.crew, TUNE.footCap[L] - footN) : 1;
        const door = v.driverDoor ? v.driverDoor() : v.position;
        const r = v.right || { x: -Math.cos(v.heading), z: Math.sin(v.heading) };
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? door.x : v.position.x - r.x * 1.6, z = i === 0 ? door.z : v.position.z - r.z * 1.6;
          u.crewOut.push(spawnFoot(x, z, v.heading, 'chase', u));
        }
        u.crew -= n; u.waitT = 0;
        setMode(u, 'deployed');
        radio(onFoot ? `Mobile ${u.id}: suspect on foot, going after him.` : `Mobile ${u.id}: suspect has stopped. Approaching the vehicle.`, 8);
      }
    }
  }

  // ------------------------------------------------------------------ foot cops
  function stepFoot(u, dt) {
    if (u.dead) return;
    if (u.ped && (u.ped.state === 'down' || u.ped.state === 'dead')) { if (u.ped.state === 'dead') u.dead = true; return; }
    const pos = u.position;
    if (u.stun > 0) { u.stun -= dt; u.vel.x = u.vel.z = 0; return; }
    const p = player(); if (!p) return;
    const L = lvl();
    let tx = pos.x, tz = pos.z, spd = 0, stopAt = 0.9;
    if (u.mode === 'chase') {
      if (p.mode === 'vehicle' && p.vehicle) { const dd = p.vehicle.driverDoor ? p.vehicle.driverDoor() : p.vehicle.position; tx = dd.x; tz = dd.z; stopAt = 0.5; }
      else { tx = p.position.x; tz = p.position.z; stopAt = 0.85; }
      spd = TUNE.footSpeed[Math.max(1, L)];
    } else if (u.mode === 'return') {
      if (!u.car || !units.includes(u.car)) { u.car = null; u.mode = L ? 'chase' : 'leave'; return; }
      const cv = u.car.vehicle; tx = cv.position.x; tz = cv.position.z; spd = 4.2; stopAt = 2.2;
      if (Math.hypot(tx - pos.x, tz - pos.z) < 2.6) { u.car.crew++; removeUnit(u); return; }
    } else if (u.mode === 'guard') {
      tx = u.post.x; tz = u.post.z; spd = 1.4; stopAt = 0.5;
    } else if (u.mode === 'leave') {
      const P = ppos(); const ax = pos.x - P.x, az = pos.z - P.z, al = Math.hypot(ax, az) || 1;
      tx = pos.x + ax / al * 10; tz = pos.z + az / al * 10; spd = 1.5;
    }
    let dx = tx - pos.x, dz = tz - pos.z; const dd = Math.hypot(dx, dz);
    if (dd < stopAt) spd = 0;
    else if (u.mode === 'chase' && dd < 2.5) spd = Math.min(spd, 2.5 + dd);
    let mx = 0, mz = 0;
    if (spd > 0) {
      dx /= dd; dz /= dd;
      // cheap obstacle steering: direct line, then +/-35, +/-70, +/-110 degrees
      let ok = false;
      for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
        const c = Math.cos(a), s = Math.sin(a);
        const rx = dx * c + dz * s, rz = -dx * s + dz * c;
        if (!collision.raycast(pos.x, pos.z, rx, rz, 1.4, 0.3)) { mx = rx; mz = rz; ok = true; break; }
      }
      if (!ok) { mx = dx; mz = dz; }
      u.heading += wrapAngle(Math.atan2(mx, mz) - u.heading) * Math.min(1, dt * 10);
    } else if (u.mode === 'chase' || u.mode === 'guard') {
      const F = u.mode === 'guard' ? ppos() : { x: tx, z: tz };
      if (Math.hypot(F.x - pos.x, F.z - pos.z) > 0.05) u.heading += wrapAngle(Math.atan2(F.x - pos.x, F.z - pos.z) - u.heading) * Math.min(1, dt * 6);
    }
    const k = Math.min(1, dt * 6);
    u.vel.x += (mx * spd - u.vel.x) * k; u.vel.z += (mz * spd - u.vel.z) * k;
    pos.x += u.vel.x * dt; pos.z += u.vel.z * dt;
    const r = collision.resolveCircle(pos.x, pos.z, 0.35); pos.x = r.x; pos.z = r.z;
    if (!u.ped) pushOutOfVehicles(u);
    else { u.ped.heading = u.heading; if (u.ped.velocity) { u.ped.velocity.x = u.vel.x; u.ped.velocity.z = u.vel.z; } }
  }

  // Fallback (mesh) cops only: keep out of cars, and get run over by the player.
  function pushOutOfVehicles(u) {
    const pos = u.position;
    for (const v of game.vehicles) {
      const dx = pos.x - v.position.x, dz = pos.z - v.position.z;
      if (dx * dx + dz * dz > 16) continue;
      const f = v.forward, r = v.right;
      const lz = dx * f.x + dz * f.z, lx = dx * r.x + dz * r.z;
      const hw = v.width / 2 + 0.35, hd = v.length / 2 + 0.35;
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) continue;
      const sp = Math.abs(v.speed || 0);
      if (v === player()?.vehicle && sp > 4 && u.stun <= 0) {
        if (sp > 13) { u.dead = true; u.mode = 'dead'; u.deadT = t; } else u.stun = 3;
        events.emit('crime', { type: sp > 13 ? 'pedKilled' : 'pedHit', x: pos.x, z: pos.z, victim: { isCop: true } });
      }
      const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
      if (px < pz) { const s = Math.sign(lx) || 1; pos.x += r.x * px * s; pos.z += r.z * px * s; }
      else { const s = Math.sign(lz) || 1; pos.x += f.x * pz * s; pos.z += f.z * pz * s; }
    }
  }

  function updateFoot(u, dt, ctx) {
    const P = ppos(), p = player();
    const d = dist(u.position, P);
    if (u.dead) { if (u.ped || (t - u.deadT > 10 && !isVisible(u.position.x, u.position.z))) removeUnit(u); return; }
    if (u.ped && game.peds && !game.peds.includes(u.ped)) { u.ped = null; removeUnit(u); return; }
    if ((u.visT = (u.visT || 0) - dt) <= 0) { u.visT = 0.3; u.vis = isVisible(u.position.x, u.position.z, 1.5); }
    const visible = u.vis;
    if (!visible && d > (u.mode === 'guard' ? 260 : 110)) { removeUnit(u); return; }
    if (ctx.L === 0 && !['return', 'leave', 'guard'].includes(u.mode)) u.mode = u.car ? 'return' : 'leave';
    if (u.mode === 'leave' && !visible && d > 40) { removeUnit(u); return; }
    const pSp = Math.hypot(pvel.x, pvel.z);
    if (u.mode === 'guard' && ctx.L > 0) {
      if ((p.mode !== 'vehicle' && d < 35) || (p.mode === 'vehicle' && ctx.slowT > 0.6 && d < 25)) u.mode = 'chase';
    }
    if (u.mode === 'chase' && p.mode === 'vehicle' && d > 35 && pSp > 7) u.mode = u.car ? 'return' : 'idle';
    if (u.mode === 'idle' && ctx.L > 0 && (p.mode !== 'vehicle' ? d < 40 : (ctx.slowT > 0.6 && d < 25))) u.mode = 'chase';
    if (!u.ped) stepFoot(u, dt); // real peds are moved by their controller callback (pedSystem.update)
  }

  // ------------------------------------------------------------------ arrests
  const arrest = { foot: 0, car: 0, batonCD: 0 };
  function updateArrest(dt, ctx) {
    const p = player();
    arrest.batonCD -= dt;
    if (ctx.L === 0 || !playerActive() || busting) { arrest.foot = arrest.car = 0; return; }
    let nearFoot = false, atDoor = false, adjacent = null;
    const onFoot = p.mode !== 'vehicle' || !p.vehicle;
    const door = !onFoot && p.vehicle.driverDoor ? p.vehicle.driverDoor() : null;
    for (const u of units) {
      if (u.kind !== 'foot' || u.dead || u.stun > 0 || u.mode !== 'chase') continue;
      if (u.ped && (u.ped.state === 'down' || u.ped.state === 'dead')) continue;
      if (onFoot) {
        const d = dist(u.position, p.position);
        if (d < 1.6) adjacent = u;
        if (d < 1.3) {
          // "not sprinting away": the suspect's speed directly away from this cop
          const ax = p.position.x - u.position.x, az = p.position.z - u.position.z, al = Math.hypot(ax, az) || 1;
          if ((pvel.x * ax + pvel.z * az) / al < 3.2) nearFoot = true;
        }
      } else if (door && dist(u.position, door) < 1.6 && Math.abs(p.vehicle.speed || 0) < 1) atDoor = true;
    }
    arrest.foot = nearFoot ? arrest.foot + dt : Math.max(0, arrest.foot - dt * 2);
    arrest.car = atDoor ? arrest.car + dt : Math.max(0, arrest.car - dt * 2);
    if (adjacent && TUNE.baton[ctx.L] > 0 && arrest.batonCD <= 0) {
      arrest.batonCD = 1.3;
      p.damage?.(TUNE.baton[ctx.L], { kind: 'cop', x: adjacent.position.x, z: adjacent.position.z });
      adjacent.swingT = 0.35;
    }
    if (arrest.foot >= 1.0 || arrest.car >= 1.5) doBust();
  }

  function doBust() {
    if (busting) return;
    busting = true; stats.busts++;
    let got = false;
    const off = events.on('busted', () => { got = true; });
    try { player().bust?.(); } catch (e) { /* player-owned */ }
    off();
    if (!got) events.emit('busted', {});
    radio('Control: suspect in custody. Bring him to Azad Maidan police station.', 0);
  }

  function standDownAll() {
    for (const u of units) {
      if (u.kind === 'car') {
        if (!['wrecked', 'roadblock'].includes(u.mode)) setMode(u, u.crewOut.length ? 'deployed' : 'leave');
        u.vehicle.sirenOn = false;
      } else if (u.mode !== 'dead') u.mode = u.car ? 'return' : 'leave';
    }
    arrest.foot = arrest.car = 0;
  }

  // ------------------------------------------------------------------ events
  events.on('busted', () => { standDown = true; standDownAll(); siren.silence(); });
  events.on('wasted', () => { standDown = true; standDownAll(); siren.silence(); });
  events.on('respawn', () => { police.clearAll(); });
  events.on('wantedChanged', (e) => {
    if (e.level > e.prev) {
      spawnT = Math.min(spawnT, 0.3);
      if (e.level >= 3 && e.prev < 3) roadblockT = Math.min(roadblockT, 6);
    }
  });
  // punches landing on fallback (mesh) cops = assault on an officer (real peds report victim.isCop themselves)
  events.on('crime', (e) => {
    if (!e || e.type !== 'punch' || e.victim) return;
    for (const u of units) {
      if (u.kind !== 'foot' || u.ped || u.dead) continue;
      if (Math.hypot(u.position.x - e.x, u.position.z - e.z) < 2.0) {
        u.stun = 1.6; game.wanted?.addCrime?.('copAssault', e.x, e.z, { isCop: true });
        if (u.mode === 'guard' || u.mode === 'idle') u.mode = 'chase';
        break;
      }
    }
  });

  // ------------------------------------------------------------------ main update
  const police = {
    units, roadblocks, stats, TUNE,
    witness,
    isVisible: (x, z) => isVisible(x, z),
    update(dt) {
      const p = player(); if (!p) return;
      t += dt;
      if ((standDown || busting) && playerActive() && !game.wanted?.level) { standDown = false; busting = false; }
      const P = ppos();
      // suspect velocity (cars: physics; on foot: smoothed position delta)
      if (p.vehicle && p.vehicle.velocity) { pvel.x = p.vehicle.velocity.x; pvel.z = p.vehicle.velocity.z; }
      else if (p.velocity && (p.velocity.x || p.velocity.z)) { pvel.x = p.velocity.x; pvel.z = p.velocity.z; }
      else if (pvel.lx != null) {
        const k = Math.min(1, dt * 8);
        const ix = (P.x - pvel.lx) / dt, iz = (P.z - pvel.lz) / dt;
        if (Math.abs(ix) > 60 || Math.abs(iz) > 60) { pvel.x = pvel.z = 0; } // teleport
        else { pvel.x += (ix - pvel.x) * k; pvel.z += (iz - pvel.z) * k; }
      }
      pvel.lx = P.x; pvel.lz = P.z;
      const pSp = Math.hypot(pvel.x, pvel.z);
      slowT = p.mode === 'vehicle' && pSp < 2 ? slowT + dt : 0;

      if ((frustumT -= dt) <= 0) { frustumT = 0.1; refreshFrustum(); }
      const L = playerActive() ? lvl() : 0;
      if (L !== lastLevel) {
        if (L > 0 && lastLevel === 0) for (const u of units) if (u.kind === 'car' && u.mode === 'patrol') setMode(u, 'respond');
        lastLevel = L;
      }

      // ---- sightings (every 0.1 s)
      if ((sightT -= dt) <= 0) {
        sightT = 0.1;
        let any = false;
        for (const u of units) {
          u.sees = L > 0 && unitCanSee(u, P.x, P.z, u.mode === 'pursue' ? TUNE.sightPursuit : TUNE.sight);
          if (u.sees) { u.seeT = t; any = true; }
        }
        if (any) game.wanted?.reportSighting?.(P.x, P.z, true);
      }

      // ---- dispatch
      spawnT -= dt; roadblockT -= dt;
      const pursuers = activePursuers();
      const want = !playerActive() || standDown ? 0 : L > 0 ? TUNE.cars[L] : TUNE.patrolCars;
      if (pursuers.length < want && spawnT <= 0) {
        const u = spawnCar(L > 0 ? (game.wanted.seen ? 'respond' : 'search') : 'patrol', { ahead: L > 0 });
        spawnT = u ? TUNE.spawnEvery[L] : 0.7;
        if (u && L > 0 && pursuers.length === 0) radio(`Mobile ${u.id} responding.`, 4);
      } else if (pursuers.length > want + 1) {
        let far = null, fd = -1; // too many (level dropped): the farthest one leaves
        for (const u of pursuers) { const d = dist(u.position, P); if (d > fd && !u.crewOut.length) { fd = d; far = u; } }
        if (far) setMode(far, 'leave');
      }
      if (L >= 3 && playerActive() && roadblockT <= 0 && roadblocks.length < TUNE.roadblocks[L]) {
        roadblockT = placeRoadblock() ? TUNE.roadblockEvery[L] : 2;
      }
      updateRoadblocks();

      // ---- rammer / box-slot assignment (every 0.5 s)
      if ((boxT -= dt) <= 0) {
        boxT = 0.5;
        const chasers = units.filter((u) => u.kind === 'car' && (u.mode === 'pursue' || u.mode === 'respond'))
          .sort((a, b) => dist(a.position, P) - dist(b.position, P));
        chasers.forEach((u, i) => { u.rammer = i < TUNE.rammers[L]; u.slot = null; });
        if (L > 0 && p.mode === 'vehicle' && p.vehicle && pSp < 4) {
          const f = pfwd(), lf = { x: f.z, z: -f.x };
          const slots = [
            { x: P.x + f.x * 7, z: P.z + f.z * 7 },       // front
            { x: P.x - f.x * 7.5, z: P.z - f.z * 7.5 },   // rear
            { x: P.x + lf.x * 3.8, z: P.z + lf.z * 3.8 }, // passenger side (driver door stays clear for the arrest)
          ];
          const free = chasers.filter((u) => dist(u.position, P) < 60);
          for (const s of slots) {
            let best = null, bd = 1e9;
            for (const u of free) { if (u.slot) continue; const d = dist(u.position, s); if (d < bd) { bd = d; best = u; } }
            if (best) best.slot = s;
          }
        }
      }

      // ---- per-unit AI
      const ctx = { L, P, slowT, patrolSlots: TUNE.patrolCars, dP: (u) => dist(u.position, P) };
      for (const u of units.slice()) {
        if (!units.includes(u)) continue;
        if (u.kind === 'car') updateCar(u, dt, ctx); else updateFoot(u, dt, ctx);
      }

      updateArrest(dt, ctx);

      // ---- hard caps (never unbounded)
      const cars = carUnits();
      if (cars.length > MAX_POLICE_VEHICLES) {
        cars.sort((a, b) => dist(b.position, P) - dist(a.position, P));
        let n = cars.length;
        for (const u of cars) { if (n <= MAX_POLICE_VEHICLES) break; if (!isVisible(u.position.x, u.position.z)) { removeUnit(u); n--; } }
      }
      const foots = footUnits();
      if (foots.length > MAX_FOOT) { foots.sort((a, b) => dist(b.position, P) - dist(a.position, P)); for (let i = 0; i < foots.length - MAX_FOOT; i++) removeUnit(foots[i]); }
    },

    frameUpdate(dt) {
      const ll = game.city?.lightLevel ?? 1;
      const now = game.time;
      for (const [v, b] of bars) { // our fallback bars, including police cars the player stole
        if (!game.vehicles.includes(v)) { bars.delete(v); continue; }
        b.update(now, !!v.sirenOn && !v.wrecked, ll);
      }
      for (const u of units) {
        if (u.kind !== 'foot' || !u.mesh) continue;
        const m = u.mesh, parts = m.userData.parts;
        m.position.set(u.position.x, 0, u.position.z);
        m.rotation.y = u.heading;
        const sp = Math.hypot(u.vel.x, u.vel.z);
        u.anim += dt * (2 + sp * 1.6);
        if (u.dead || u.stun > 0) { m.rotation.x = -Math.PI / 2 * (u.dead ? 1 : 0.92); m.position.y = 0.25; }
        else {
          m.rotation.x = 0;
          m.position.y = sp > 0.5 ? Math.abs(Math.sin(u.anim)) * 0.06 : 0;
          parts.legs.rotation.x = Math.sin(u.anim) * Math.min(0.5, sp * 0.1);
          parts.body.rotation.x = Math.min(0.25, sp * 0.04);
          if (u.swingT > 0) { u.swingT -= dt; parts.stick.rotation.x = -1.2 + u.swingT * 4; } else parts.stick.rotation.x = 0.4;
        }
      }
      if (game.audio?.ready) {
        const cam = game.camera, e = cam.matrixWorld.elements;
        const cars = [];
        for (const v of game.vehicles) if (v.isPolice && v.sirenOn && v !== game.player?.vehicle) cars.push(v);
        siren.update(dt, cars, { x: cam.position.x, z: cam.position.z, vx: pvel.x, vz: pvel.z, rightX: e[0], rightZ: e[2] });
      }
    },

    clearAll() {
      for (const u of units.slice()) removeUnit(u);
      units.length = 0; roadblocks.length = 0;
      standDown = false; busting = false; spawnT = 2; roadblockT = 8; lastLevel = 0;
      arrest.foot = arrest.car = 0;
      siren.silence();
    },
  };

  // ------------------------------------------------------------------ debug
  game.debug.extra.police = () => ({
    level: game.wanted?.level || 0, seen: !!game.wanted?.seen, flashing: !!game.wanted?.flashing,
    searchRadius: Math.round(game.wanted?.searchRadius || 0),
    lastKnown: game.wanted ? { x: Math.round(game.wanted.lastKnown.x), z: Math.round(game.wanted.lastKnown.z) } : null,
    escape: +(game.wanted?.escapeProgress || 0).toFixed(2),
    cars: carUnits().length, foot: footUnits().length, roadblocks: roadblocks.length,
    units: units.map((u) => `${u.kind === 'car' ? 'M' : 'F'}${u.id}:${u.mode}${u.rammer ? '*' : ''}${u.sees ? '!' : ''}@${Math.round(dist(u.position, ppos()))}`),
    arrest: { foot: +arrest.foot.toFixed(2), car: +arrest.car.toFixed(2) },
    stats: { ...stats },
  });
  game.debug.police = {
    api: police,
    spawnPatrolAt(x, z, heading = 0) { const v = game.createVehicle({ type: 'police', x, z, heading }); return newCarUnit(v, 'patrol').id; },
    spawnFootAt(x, z) { return spawnFoot(x, z, 0, 'chase', null).id; },
    roadblock: () => placeRoadblock(),
    unitInfo: () => units.map((u) => ({ id: u.id, kind: u.kind, mode: u.mode, x: +u.position.x.toFixed(1), z: +u.position.z.toFixed(1),
      h: u.vehicle ? +u.vehicle.heading.toFixed(2) : +u.heading.toFixed(2),
      speed: u.vehicle ? +(u.vehicle.speed || 0).toFixed(1) : +Math.hypot(u.vel.x, u.vel.z).toFixed(1),
      sees: u.sees, rammer: u.rammer, stuck: u.ctl?.stuckCount || 0, off: u.path ? +(u.path.offDist || 0).toFixed(1) : null })),
  };
  return police;
}
