// Player controller (CONTRACT.md → Player). Owns on-foot movement, punching, entering/exiting/jacking vehicles,
// driving input, cameras (foot orbit cam + DriveCamera delegation + title attract cam), health, WASTED / BUSTED
// and respawns at St. George's Hospital / Azad Maidan Police Station.
import * as THREE from 'three';
import { SPAWN, LANDMARKS } from '../world/mapdata.js';
import { DriveCamera } from '../vehicles/driveCamera.js';
import { createPlayerModel } from './playerModel.js';
import { FootCamera, AttractCamera, CameraBlend } from './cameras.js';
import { createPlayerSfx } from './sfx.js';

const WALK = 1.75, RUN = 4.6, SPRINT = 7.6;
const JUMP_V = 4.8, GRAVITY = 15.5;
const ENTER_RANGE = 6, MAX_BOARD_SPEED = 3.5, BAIL_TUMBLE = 30 / 3.6;
const HIT_MIN_CLOSING = 3.0;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Circle vs oriented box ({cx,cz,hw,hd,rot}). Returns null or {nx,nz,depth,lx,lz} with n pushing the circle out. */
export function circleVsOBB(x, z, r, o) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const dx = x - o.cx, dz = z - o.cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = clamp(lx, -o.hw, o.hw), qz = clamp(lz, -o.hd, o.hd);
  let nlx = lx - qx, nlz = lz - qz, d = Math.hypot(nlx, nlz), pen;
  if (d > 1e-6) { pen = r - d; nlx /= d; nlz /= d; }
  else {
    const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz + r; }
  }
  if (pen <= 0) return null;
  return { nx: nlx * c + nlz * s, nz: -nlx * s + nlz * c, depth: pen, lx, lz };
}

export function createPlayer(game) {
  const { THREE: _T, input } = game;
  const model = createPlayerModel();
  game.scene.add(model.group);
  const sfx = createPlayerSfx(game);
  const driveCam = new DriveCamera(game);
  const footCam = new FootCamera(game);
  const attract = new AttractCamera(game);
  const blend = new CameraBlend(game.camera);

  const p = {
    mode: 'foot', state: 'normal',
    position: new THREE.Vector3(SPAWN.x, 0, SPAWN.z), heading: SPAWN.heading,
    velocity: new THREE.Vector3(), vehicle: null,
    health: 100, maxHealth: 100, radius: 0.35,
    // extras (read by the HUD / tests)
    action: 'none', actionT: 0, actionDur: 0, stamina: 1, sprinting: false, guard: false,
    nearVehicle: null, airborne: false, lastDamageTime: -99, model, footCam, driveCam,
    update, updateCamera, enterVehicle, exitVehicle, teleport, damage, bust, wasted,
  };
  footCam.reset(p.heading);

  // ---- internal state ----
  let vy = 0, punchIdx = 0, punchQueued = false, punchHitDone = false, lastPunchEnd = -9, guardUntil = -9;
  let approach = null;          // { v, t }
  let pendingVehicle = null;    // vehicle being entered (pull / enter actions)
  let jacked = false;
  let ignoreVehicle = null, ignoreUntil = 0;
  let lastHitTime = -9, seq = null; // death / arrest sequence
  let steer = 0, hornOn = false, lastReset = -9;
  let carLook = { yaw: 0, pitch: 0, idle: 9 };
  let clickPunch = false, wasStarted = !!game.started, stepAcc = 0, prevHeading = p.heading, turnRate = 0, prevSpeed = 0, accel = 0;
  let sinceDamage = 99, downTime = 0;
  let spots = null;

  // ---- pointer lock & click-to-punch ----
  const canvas = game.renderer.domElement;
  canvas.addEventListener('mousedown', (e) => {
    if (!game.started || game.paused) return;
    if (!document.pointerLockElement) {
      try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* headless */ }
      return;
    }
    if (e.button === 0) clickPunch = true;
  });

  // heavy crash while driving hurts a little
  game.events.on('vehicleCollision', (e) => {
    if (!p.vehicle || (e.a !== p.vehicle && e.b !== p.vehicle)) return;
    const dv = (e.impulse || 0) / (p.vehicle.mass || 1200);
    if (dv > 9) damage((dv - 9) * 2.2, 'crash');
  });
  game.events.on('explosion', (e) => {
    if (e.vehicle && e.vehicle === p.vehicle && p.state === 'normal') { wasted(); return; }
    const d = Math.hypot(p.position.x - e.x, p.position.z - e.z), r = e.radius || 8;
    if (d > r * 1.6) return;
    const k = 1 - d / (r * 1.6);
    if (p.mode === 'foot' && p.state === 'normal') {
      const nx = (p.position.x - e.x) / (d || 1), nz = (p.position.z - e.z) / (d || 1);
      knockDown(nx * 8 * k, nz * 8 * k, 6 * k, 1.8);
    }
    damage(k * 110, 'explosion');
  });

  // ------------------------------------------------------------------------------------------------
  function setAction(name, dur = 0) { p.action = name; p.actionT = 0; p.actionDur = dur; }
  const controlsLocked = () => !['none', 'punch'].includes(p.action);

  function camYaw() { return footCam.yaw; }

  function readMove() {
    const f = input.axis('KeyW', 'KeyS') || input.axis('ArrowUp', 'ArrowDown');
    const r = input.axis('KeyD', 'KeyA') || input.axis('ArrowRight', 'ArrowLeft');
    return { f, r };
  }

  // ------------------------------------------------------------------------------------------------
  function update(dt) {
    p.actionT += dt;
    sinceDamage += dt;
    if (!game.started) { wasStarted = false; return; }
    if (!wasStarted) { wasStarted = true; for (const k of ['Enter', 'KeyF', 'Space', 'KeyJ']) input.pressed(k); clickPunch = false; }
    if (seq) { updateSequence(dt); }
    if (p.mode === 'vehicle' && p.vehicle) updateDriving(dt);
    else updateFoot(dt);
    // slow health regen up to 50 when out of danger
    if (p.state === 'normal' && sinceDamage > 8 && p.health < 50 && !(game.wanted?.level > 0)) p.health = Math.min(50, p.health + 2 * dt);
  }

  // ---------------------------------------------------------------- on foot
  function updateFoot(dt) {
    const alive = p.state === 'normal';
    let wantX = 0, wantZ = 0, wantSpeed = 0, faceTo = null;
    const yaw = camYaw();
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;

    // --- action timeline ---
    advanceAction(dt);

    const canControl = alive && !controlsLocked() && p.action !== 'approach';
    if (alive && (input.pressed('KeyF') || input.pressed('Enter'))) {
      if (approach) cancelApproach();
      else if (!controlsLocked() && !p.airborne) tryEnterNearest();
    }

    // --- movement intent ---
    p.sprinting = false;
    if (canControl) {
      const m = readMove();
      const len = Math.hypot(m.f, m.r);
      if (len > 0) {
        wantX = (fx * m.f + rx * m.r) / len; wantZ = (fz * m.f + rz * m.r) / len;
        const sprintKey = input.down('ShiftLeft') || input.down('ShiftRight');
        const walkKey = input.down('AltLeft') || input.down('AltRight');
        if (sprintKey && p.stamina > 0.05 && !p.guard) { wantSpeed = SPRINT; p.sprinting = true; }
        else wantSpeed = walkKey ? WALK : RUN;
        if (p.action === 'punch') wantSpeed = Math.min(wantSpeed, 1.2);
      }
      if (input.pressed('Space') && !p.airborne && p.action === 'none') { vy = JUMP_V; p.airborne = true; p.position.y = 0.01; }
      if ((input.pressed('KeyJ') || clickPunch)) startPunch();
      clickPunch = false;
    } else if (approach) {
      const t = approachTarget();
      if (t) {
        const dx = t.x - p.position.x, dz = t.z - p.position.z, d = Math.hypot(dx, dz);
        wantX = dx / (d || 1); wantZ = dz / (d || 1);
        wantSpeed = Math.min(RUN, 1.2 + d * 3);
        const m = readMove();
        if ((m.f || m.r) && approach.t > 0.25) cancelApproach();
      }
    } else clickPunch = false;

    // stamina
    if (p.sprinting && Math.hypot(p.velocity.x, p.velocity.z) > 4) p.stamina = Math.max(0, p.stamina - dt / 9);
    else p.stamina = Math.min(1, p.stamina + dt / (p.sprinting ? 99 : 5));

    // --- velocity ---
    const ground = !p.airborne;
    const lying = ['down', 'tumble', 'getup', 'wasted'].includes(p.action);
    if (lying) {
      const fr = p.action === 'tumble' ? 1.6 : 4.5;
      if (!p.airborne) { p.velocity.x = damp(p.velocity.x, 0, fr, dt); p.velocity.z = damp(p.velocity.z, 0, fr, dt); }
    } else if (['pull', 'enter', 'exit', 'busted', 'hit'].includes(p.action) || !alive) {
      p.velocity.x = damp(p.velocity.x, 0, 12, dt); p.velocity.z = damp(p.velocity.z, 0, 12, dt);
    } else {
      const tx = wantX * wantSpeed, tz = wantZ * wantSpeed;
      const speedingUp = tx * tx + tz * tz > p.velocity.x ** 2 + p.velocity.z ** 2;
      const rate = ground ? (speedingUp ? 7.5 : 11) : 1.2;
      p.velocity.x = damp(p.velocity.x, tx, rate, dt);
      p.velocity.z = damp(p.velocity.z, tz, rate, dt);
      if (wantSpeed > 0.1 && p.action !== 'punch') faceTo = Math.atan2(wantX, wantZ);
    }
    if (faceTo !== null) {
      const diff = wrap(faceTo - p.heading);
      const maxTurn = (p.airborne ? 4 : 13) * dt;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(Math.abs(diff) * (1 - Math.exp(-14 * dt)), 3 * dt));
      p.heading = wrap(p.heading + clamp(step, -maxTurn, maxTurn));
    }

    // vertical
    if (p.airborne) {
      vy -= GRAVITY * dt;
      p.position.y += vy * dt;
      if (p.position.y <= 0) {
        p.position.y = 0; p.airborne = false;
        if (vy < -3) sfx.land();
        if (p.action === 'down' && vy < -4) sfx.fall();
        vy = 0;
      }
    }

    // integrate + collide
    const ox = p.position.x, oz = p.position.z;
    p.position.x += p.velocity.x * dt; p.position.z += p.velocity.z * dt;
    collideVehicles(dt);
    const col = game.collision;
    if (col) {
      const r = col.resolveCircle(p.position.x, p.position.z, p.radius);
      if (r.hit) {
        p.position.x = r.x; p.position.z = r.z;
        const vn = p.velocity.x * r.nx + p.velocity.z * r.nz;
        if (vn < 0) { p.velocity.x -= r.nx * vn; p.velocity.z -= r.nz * vn; }
      }
    }
    if (game.roads && !game.roads.isLand(p.position.x, p.position.z)) { p.position.x = ox; p.position.z = oz; p.velocity.x *= -0.2; p.velocity.z *= -0.2; }

    // footsteps
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    if (!p.airborne && !lying && sp > 0.8) { stepAcc += sp * dt; const stepLen = sp > 3 ? 1.15 : 0.7; if (stepAcc > stepLen) { stepAcc = 0; sfx.step(sp > 3); } }

    // nearby vehicle prompt
    p.nearVehicle = alive && p.action === 'none' ? findEnterable() : null;
  }

  function advanceAction(dt) {
    const a = p.action, t = p.actionT;
    if (a === 'punch') {
      const dur = punchDur();
      if (!punchHitDone && t >= dur * 0.3) { punchHitDone = true; resolvePunch(); }
      if (t >= dur) {
        lastPunchEnd = game.time;
        if (punchQueued) { punchQueued = false; punchIdx = (punchIdx + 1) % 3; beginPunch(); }
        else setAction('none');
      }
    } else if (a === 'down') {
      downTime += dt;
      if (t >= p.actionDur && !p.airborne) { if (p.state === 'normal') { setAction('getup', 0.95); } }
    } else if (a === 'tumble') {
      if (t >= p.actionDur) setAction('down', 0.55);
    } else if (a === 'getup' || a === 'hit') {
      if (t >= p.actionDur) setAction('none');
    } else if (a === 'pull') {
      const v = pendingVehicle;
      if (v && !p._ejected && t >= 0.22) {
        p._ejected = true;
        const drv = v.driver;
        if (drv && typeof drv === 'object') {
          try { drv.eject?.(); } catch (e) { console.warn(e); }
          game.events.emit('crime', { type: 'carjack', x: v.position.x, z: v.position.z, victim: drv });
          game.pedSystem?.panicAround?.(v.position.x, v.position.z, 15);
        }
        v.driver = 'player';
      }
      if (v) snapToDoor(v, dt);
      if (t >= p.actionDur) beginEnter(v);
    } else if (a === 'enter') {
      const v = pendingVehicle;
      if (!v || v.wrecked && v.health <= 0) { setAction('none'); pendingVehicle = null; return; }
      // slide from the door into the seat
      const d = v.driverDoor(), u = clamp(t / p.actionDur, 0, 1);
      const k = u * u * (3 - 2 * u) * 0.7;
      p.position.x = d.x + (v.position.x - d.x) * k; p.position.z = d.z + (v.position.z - d.z) * k;
      p.heading = v.heading;
      p.velocity.set(0, 0, 0);
      if (t >= p.actionDur) finishEnter(v);
    } else if (a === 'exit') {
      if (t >= p.actionDur) setAction('none');
    } else if (a === 'approach') {
      if (!approach) { setAction('none'); return; }
      approach.t += dt;
      const v = approach.v;
      if (!game.vehicles.includes(v) || v.wrecked || approach.t > 5) { cancelApproach(); return; }
      const d = v.driverDoor();
      const dist = Math.hypot(d.x - p.position.x, d.z - p.position.z);
      if (dist < 0.45 || (dist < 0.9 && approach.t > 2.5)) {
        if (Math.abs(v.speed) > MAX_BOARD_SPEED) return; // keep chasing
        const vv = v; approach = null;
        boardVehicle(vv);
      }
    }
  }

  // ---------------------------------------------------------------- punching
  const punchDur = () => (punchIdx === 2 ? 0.44 : 0.34);
  function startPunch() {
    if (p.airborne) return;
    if (p.action === 'punch') { if (p.actionT > punchDur() * 0.35) punchQueued = true; return; }
    if (p.action !== 'none') return;
    if (game.time - lastPunchEnd > 0.6) punchIdx = 0; else punchIdx = (punchIdx + 1) % 3;
    // soft lock-on: turn towards the closest ped in front
    const t = findPunchTarget(2.6, 1.3);
    if (t) p.heading = Math.atan2(t.position.x - p.position.x, t.position.z - p.position.z);
    else if (Math.hypot(p.velocity.x, p.velocity.z) < 0.5) p.heading = camYaw(); // punch where you look
    beginPunch();
  }
  function beginPunch() { setAction('punch', punchDur()); punchHitDone = false; guardUntil = game.time + 2.2; sfx.swing(); }

  function pedFilter(ped) { return ped && ped.state !== 'down' && ped.state !== 'dead' && ped.state !== 'driver' && !ped.removed; }

  function findPunchTarget(range, cone) {
    const ps = game.pedSystem;
    let best = null, bestD = range;
    const cands = [];
    if (ps?.nearest) { const n = ps.nearest(p.position.x, p.position.z, range, pedFilter); const ped = n?.ped || n; if (ped?.position) cands.push(ped); }
    for (const ped of game.peds || []) { if (!pedFilter(ped)) continue; if (Math.abs(ped.position.x - p.position.x) < range && Math.abs(ped.position.z - p.position.z) < range) cands.push(ped); }
    for (const ped of cands) {
      const dx = ped.position.x - p.position.x, dz = ped.position.z - p.position.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.abs(wrap(Math.atan2(dx, dz) - p.heading));
      if (ang > cone) continue;
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  function resolvePunch() {
    const ped = findPunchTarget(1.55, 1.0);
    if (!ped) return;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const force = punchIdx === 2 ? 6.5 : 4;
    try { ped.knockDown?.(fx * force, fz * force, 'player'); } catch (e) { console.warn(e); }
    sfx.hit();
    game.events.emit('crime', { type: ped.isCop ? 'copAssault' : 'punch', x: ped.position.x, z: ped.position.z, victim: ped });
    game.pedSystem?.panicAround?.(ped.position.x, ped.position.z, 12);
  }

  // ---------------------------------------------------------------- vehicles (on foot)
  function collideVehicles(dt) {
    for (const v of game.vehicles) {
      if (!v || v === pendingVehicle && (p.action === 'enter' || p.action === 'pull')) continue;
      const dx = v.position.x - p.position.x, dz = v.position.z - p.position.z;
      const reach = (v.length || 5) * 0.5 + 1.5;
      if (dx * dx + dz * dz > reach * reach) continue;
      const o = v.getOBB?.(); if (!o) continue;
      const c = circleVsOBB(p.position.x, p.position.z, p.radius, o);
      if (!c) continue;
      // relative closing speed of the car into the player
      const vx = v.velocity?.x || 0, vz = v.velocity?.z || 0;
      // include rotation (yawRate × r) at the contact point
      const yr = v.yawRate || 0, cx = p.position.x - v.position.x, cz = p.position.z - v.position.z;
      const cvx = vx + yr * cz, cvz = vz - yr * cx;
      const closing = (cvx - p.velocity.x) * c.nx + (cvz - p.velocity.z) * c.nz;
      const ignored = v === ignoreVehicle && game.time < ignoreUntil;
      if (!ignored && closing > HIT_MIN_CLOSING && game.time - lastHitTime > 0.6 && p.state === 'normal' && p.action !== 'tumble') {
        lastHitTime = game.time;
        const dmg = (closing - HIT_MIN_CLOSING) * 4.6;
        // tangential part of the car's motion carries us along
        const tx = cvx - c.nx * (cvx * c.nx + cvz * c.nz), tz = cvz - c.nz * (cvx * c.nx + cvz * c.nz);
        const out = closing * 0.75 + 1.5;
        p.heading = Math.atan2(-c.nx, -c.nz); // face the car, fall backwards away from it
        knockDown(c.nx * out + tx * 0.35, c.nz * out + tz * 0.35, Math.min(6.5, 1.5 + closing * 0.28), 1.3 + Math.min(1.5, closing * 0.06));
        try { v.applyImpulse?.(-c.nx * 60 * closing, -c.nz * 60 * closing, p.position.x, p.position.z); } catch (_) { /* optional */ }
        game.events.emit('playerHit', { vehicle: v, speed: closing });
        damage(dmg, v);
      }
      p.position.x += c.nx * c.depth; p.position.z += c.nz * c.depth;
      const vn = (p.velocity.x - cvx) * c.nx + (p.velocity.z - cvz) * c.nz;
      if (vn < 0 && !(p.action === 'down' && p.airborne)) { p.velocity.x -= c.nx * vn; p.velocity.z -= c.nz * vn; }
    }
  }

  function knockDown(vx, vz, up, lieTime = 1.4) {
    if (p.mode !== 'foot') return;
    approach = null; pendingVehicle = null;
    p.velocity.x = vx; p.velocity.z = vz;
    if (up > 0.5) { vy = up; p.airborne = true; p.position.y = Math.max(p.position.y, 0.02); }
    setAction('down', lieTime); downTime = 0;
    sfx.fall();
  }

  function findEnterable(range = ENTER_RANGE) {
    let best = null, bestD = range;
    for (const v of game.vehicles) {
      if (!v || v.wrecked || v.driver === 'player') continue;
      const d = v.driverDoor?.(); if (!d) continue;
      const dc = Math.hypot(v.position.x - p.position.x, v.position.z - p.position.z) - Math.max(v.width || 1.8, 1) * 0.5;
      const dd = Math.hypot(d.x - p.position.x, d.z - p.position.z);
      const dist = Math.min(dd, Math.max(0, dc) + 0.8);
      if (dist < bestD) { bestD = dist; best = v; }
    }
    return best;
  }

  function tryEnterNearest() {
    const v = findEnterable();
    if (v) enterVehicle(v);
  }

  function approachTarget() {
    if (!approach) return null;
    const v = approach.v, d = v.driverDoor();
    const o = v.getOBB();
    // driver side is the car's RIGHT = local -X. If we're on the far side, walk round the nearest end first.
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const dx = p.position.x - o.cx, dz = p.position.z - o.cz;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (lx > -o.hw - 0.2 && Math.abs(lz) < o.hd + 0.5) {
      const ex = -(o.hw + 0.75), ez = (lz >= 0 ? 1 : -1) * (o.hd + 0.75);
      // local -> world: x = lx*c + lz*s, z = -lx*s + lz*c
      return { x: o.cx + ex * c + ez * s, z: o.cz - ex * s + ez * c };
    }
    return d;
  }

  function cancelApproach() { approach = null; if (p.action === 'approach') setAction('none'); }

  function snapToDoor(v, dt) {
    const d = v.driverDoor();
    p.position.x = damp(p.position.x, d.x, 14, dt); p.position.z = damp(p.position.z, d.z, 14, dt);
    // face the car's side (towards its centre)
    p.heading = Math.atan2(v.position.x - d.x, v.position.z - d.z);
  }

  function boardVehicle(v) {
    pendingVehicle = v;
    jacked = !!(v.driver && typeof v.driver === 'object');
    p._ejected = false;
    if (jacked) { setAction('pull', 0.75); sfx.door(); }
    else { v.driver = 'player'; beginEnter(v); }
  }
  function beginEnter(v) {
    if (!v) { setAction('none'); return; }
    v.driver = 'player';
    pendingVehicle = v;
    setAction('enter', 0.5);
    sfx.door();
  }
  function finishEnter(v) {
    pendingVehicle = null;
    setAction('none');
    p.mode = 'vehicle'; p.vehicle = v; v.driver = 'player';
    v.setControls?.({ throttle: 0, brake: 0, steer: 0, handbrake: false });
    steer = 0; carLook = { yaw: 0, pitch: 0, idle: 9 };
    driveCam.reset?.();
    blend.start(0.5);
    p.position.set(v.position.x, 0, v.position.z);
    game.events.emit('playerEnteredVehicle', { vehicle: v, jacked });
  }

  function enterVehicle(v, opts = {}) {
    if (!v || p.state !== 'normal') return false;
    if (p.vehicle === v) return true;
    if (p.vehicle) exitVehicle(true);
    if (opts.instant) {
      jacked = !!(v.driver && typeof v.driver === 'object');
      if (jacked) {
        const drv = v.driver;
        try { drv.eject?.(); } catch (e) { console.warn(e); }
        game.events.emit('crime', { type: 'carjack', x: v.position.x, z: v.position.z, victim: drv });
      }
      approach = null; setAction('none');
      p.position.y = 0; p.airborne = false; vy = 0;
      finishEnter(v);
      return true;
    }
    approach = { v, t: 0 };
    setAction('approach');
    return true;
  }

  // ---------------------------------------------------------------- driving
  function updateDriving(dt) {
    const v = p.vehicle;
    if (!game.vehicles.includes(v)) { exitVehicle(true); return; }
    const alive = p.state === 'normal';
    p.position.set(v.position.x, 0, v.position.z);
    p.heading = v.heading;
    p.velocity.copy(v.velocity);
    p.nearVehicle = null;
    if (!alive) return;
    if (input.pressed('KeyF') || input.pressed('Enter')) { exitVehicle(); return; }
    const thr = input.down('KeyW') || input.down('ArrowUp') ? 1 : 0;
    const brk = input.down('KeyS') || input.down('ArrowDown') ? 1 : 0;
    const st = input.axis('KeyD', 'KeyA') || input.axis('ArrowRight', 'ArrowLeft');
    // keyboard steering ramp (faster return to centre than turn-in)
    const rate = st === 0 ? 9 : Math.sign(st) !== Math.sign(steer) && steer !== 0 ? 12 : 6.5;
    steer += clamp(st - steer, -rate * dt, rate * dt);
    v.setControls({ throttle: thr, brake: brk, steer, handbrake: input.down('Space') });
    const h = input.down('KeyH');
    if (h !== hornOn) { hornOn = h; try { v.horn?.(h); } catch (_) { /* optional */ } }
    if (input.pressed('KeyL') && v.isPolice) { v.sirenOn = !v.sirenOn; game.hud?.message?.(v.sirenOn ? 'Siren ON' : 'Siren off', 1.2); }
    if (input.pressed('KeyC')) driveCam.cycleMode?.();
    if (input.pressed('KeyR')) resetVehicle(v);
  }

  function resetVehicle(v) {
    if (Math.abs(v.speed || 0) > 3 || game.time - lastReset < 1.5) return;
    lastReset = game.time;
    let x = v.position.x, z = v.position.z, h = v.heading;
    const n = game.roads?.nearest(x, z, 40);
    if (n) {
      const f = { x: Math.sin(h), z: Math.cos(h) };
      const dir = n.tx * f.x + n.tz * f.z >= 0 ? 1 : -1;
      const lane = Math.min(1, n.edge.lanes - 1);
      const lp = game.roads.lanePoint(n.edge, n.s, dir, lane);
      const stuck = game.collision?.queryOBB(x, z, (v.width || 1.8) / 2, (v.length || 4.2) / 2, h).length > 0;
      if (stuck || n.dist > n.edge.width / 2 - 1) { x = lp.x; z = lp.z; }
      h = Math.atan2(lp.hx, lp.hz);
    }
    v.position.set(x, 0, z); v.heading = h;
    v.velocity.set(0, 0, 0); v.yawRate = 0;
    if ('roll' in v) v.roll = 0; if ('pitch' in v) v.pitch = 0; if ('flipped' in v) v.flipped = false;
    if (v.mesh) { v.mesh.rotation.x = 0; v.mesh.rotation.z = 0; }
    try { v.reset?.(); } catch (_) { /* optional */ }
    game.hud?.message?.('Vehicle reset', 1.2);
  }

  function exitSpot(v) {
    const d = v.driverDoor();
    const c = { x: v.position.x, z: v.position.z }, f = v.forward || { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    const L = (v.length || 4.2) / 2 + 0.9;
    const cands = [d, { x: 2 * c.x - d.x, z: 2 * c.z - d.z }, { x: c.x - f.x * L, z: c.z - f.z * L }, { x: c.x + f.x * L, z: c.z + f.z * L }];
    for (const q of cands) {
      if (game.collision?.queryCircle(q.x, q.z, p.radius + 0.05).length) continue;
      if (game.roads && !game.roads.isLand(q.x, q.z)) continue;
      let blocked = false;
      for (const o of game.vehicles) { if (o !== v && circleVsOBB(q.x, q.z, p.radius, o.getOBB())) { blocked = true; break; } }
      if (!blocked) return q;
    }
    return d;
  }

  function exitVehicle(instant = false) {
    const v = p.vehicle;
    if (!v) return;
    const sp = Math.abs(v.speed || 0);
    const q = exitSpot(v);
    try { if (hornOn) v.horn?.(false); } catch (_) { /* */ }
    hornOn = false;
    v.driver = null;
    const slow = sp < 1.5;
    v.setControls?.({ throttle: 0, brake: 0, steer: 0, handbrake: slow });
    p.vehicle = null; p.mode = 'foot';
    p.position.set(q.x, 0, q.z);
    p.airborne = false; vy = 0;
    ignoreVehicle = v; ignoreUntil = game.time + 0.8;
    try { driveCam.release?.(); } catch (_) { /* optional */ }
    footCam.alignTo(game.camera.position, p.position);
    blend.start(0.45);
    const right = { x: -Math.cos(v.heading), z: Math.sin(v.heading) };
    if (!instant && sp > BAIL_TUMBLE) {
      // GTA bail-out: tumble along the road
      p.velocity.set(v.velocity.x * 0.75 + right.x * 2, 0, v.velocity.z * 0.75 + right.z * 2);
      p.heading = v.heading + Math.PI;  // roll backwards relative to travel
      setAction('tumble', 0.9);
      sfx.fall();
      damage(Math.min(45, (sp * 3.6 - 30) * 0.45), 'bail');
    } else if (!instant && !slow) {
      p.velocity.set(v.velocity.x * 0.6 + right.x, 0, v.velocity.z * 0.6 + right.z);
      p.heading = v.heading; setAction('exit', 0.3);
    } else {
      p.velocity.set(0, 0, 0);
      p.heading = v.heading;
      if (!instant) { setAction('exit', 0.45); sfx.door(); } else setAction('none');
    }
    game.events.emit('playerExitedVehicle', { vehicle: v });
  }

  // ---------------------------------------------------------------- health, death, arrest
  function damage(n, source) {
    if (!(n > 0) || p.state !== 'normal') return;
    p.health = Math.max(0, p.health - n);
    p.lastDamageTime = game.time; sinceDamage = 0;
    if (p.health <= 0) { wasted(); return; }
    if (p.mode === 'foot' && p.action === 'none' && n < 25 && source !== 'bail') setAction('hit', 0.35);
  }

  function wasted() {
    if (p.state === 'wasted' || p.state === 'respawning') return;
    p.health = 0;
    if (p.vehicle) exitVehicle(true);
    approach = null; pendingVehicle = null;
    p.state = 'wasted';
    setAction('wasted', 99);
    game.timeScale = 0.3;
    seq = { kind: 'wasted', t: 0, shown: false, faded: false };
    game.events.emit('wasted', {});
    document.body.classList.add('cta-wasted');
  }

  function bust() {
    if (p.state !== 'normal') return;
    if (p.vehicle) {
      const v = p.vehicle;
      exitVehicle(true);
      v.setControls?.({ throttle: 0, brake: 0, steer: 0, handbrake: true });
    }
    approach = null; pendingVehicle = null;
    p.state = 'busted';
    p.airborne = false; p.position.y = 0; vy = 0;
    setAction('busted', 99);
    game.timeScale = 0.6;
    seq = { kind: 'busted', t: 0, shown: false, faded: false };
    game.events.emit('busted', {});
    document.body.classList.add('cta-busted');
  }

  function updateSequence(dt) {
    const real = dt / Math.max(0.05, game.timeScale);
    seq.t += real;
    const hud = game.hud;
    if (!seq.shown && seq.t > (seq.kind === 'wasted' ? 0.7 : 0.5)) { seq.shown = true; hud?.bigText?.(seq.kind === 'wasted' ? 'WASTED' : 'BUSTED', seq.kind); }
    if (seq.t > 2.6 && game.timeScale < 1) game.timeScale = Math.min(1, game.timeScale + real * 0.8);
    if (!seq.faded && seq.t > 4.0) { seq.faded = true; hud?.fadeTo?.(1, 0.7); }
    if (seq.t > 4.8 && p.state !== 'respawning') respawn();
    if (p.state === 'respawning' && seq.t > 5.6) { p.state = 'normal'; setAction('none'); seq = null; }
  }

  function respawn() {
    const kind = seq.kind;
    const s = getSpots()[kind === 'wasted' ? 'hospital' : 'police'];
    teleport(s.x, s.z, s.h);
    p.health = p.maxHealth; p.stamina = 1;
    p.state = 'respawning';
    setAction('none');
    game.timeScale = 1;
    game.wanted?.clear?.();
    game.hud?.bigText?.(null);
    game.hud?.fadeTo?.(0, 0.9);
    game.hud?.message?.(kind === 'wasted' ? "St. George's Hospital — ₹ bill waived, this time." : 'Released from Azad Maidan Police Station. Keep your nose clean.', 4);
    document.body.classList.remove('cta-wasted', 'cta-busted');
    footCam.reset(s.h); blend.t = 1;
    game.events.emit('respawn', { x: s.x, z: s.z });
  }

  /** Find a free footpath spot near (x0,z0): on land, off the carriageway, within a few metres of a road, no colliders. */
  function findFootpathSpot(x0, z0, maxR = 90) {
    const roads = game.roads, col = game.collision;
    for (let r = 0; r <= maxR; r += 2) {
      const n = Math.max(1, Math.round(r * 0.8));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r * 0.37;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (!roads.isLand(x, z)) continue;
        if (roads.isOnRoad(x, z, 0.8)) continue;
        const nr = roads.nearest(x, z, 30);
        if (!nr || nr.dist > nr.edge.width / 2 + 4) continue;
        if (col && col.queryCircle(x, z, 0.9).length) continue;
        if (game.vehicles.some((v) => circleVsOBB(x, z, 1.2, v.getOBB()))) continue;
        return { x, z, h: Math.atan2(nr.x - x, nr.z - z) };
      }
    }
    return { x: x0, z: z0, h: 0 };
  }
  function getSpots() {
    // recompute each time (cheap) so newly-registered colliders / parked cars are respected
    const hq = LANDMARKS.find((l) => l.id === 'policehq') || { x: -20, z: -432, d: 50 };
    spots = {
      hospital: findFootpathSpot(232, -470),
      police: findFootpathSpot(hq.x, hq.z + (hq.d || 50) / 2 + 6),
    };
    return spots;
  }

  function teleport(x, z, h = p.heading) {
    if (p.vehicle) {
      const v = p.vehicle;
      v.position.set(x, 0, z); v.heading = h; v.velocity.set(0, 0, 0); v.yawRate = 0;
    } else {
      approach = null; pendingVehicle = null;
      if (p.state === 'normal') setAction('none');
      p.velocity.set(0, 0, 0); p.airborne = false; vy = 0;
    }
    p.position.set(x, 0, z); p.heading = h;
    footCam.reset(h);
    driveCam.reset?.();
  }

  // ------------------------------------------------------------------------------------------------
  // per-frame: cameras + model
  let started = !!game.started;
  function updateCamera(dt) {
    const cam = game.camera;
    const look = document.pointerLockElement ? input.consumeMouse() : (input.consumeMouse(), { dx: 0, dy: 0 });
    if (!game.started) {
      attract.update(dt || 1 / 60);
      animateModel(dt);
      started = false;
      return;
    }
    if (!started) { started = true; footCam.reset(p.heading); blend.start(1.8); }
    const orbit = (input.down('KeyQ') ? 1 : 0) - (input.down('KeyE') ? 1 : 0);
    if (p.mode === 'vehicle' && p.vehicle) {
      if (look.dx || look.dy) { carLook.yaw = clamp(carLook.yaw - look.dx * 0.0025, -Math.PI, Math.PI); carLook.pitch = clamp(carLook.pitch + look.dy * 0.002, -0.4, 0.8); carLook.idle = 0; }
      carLook.idle += dt;
      let active = carLook.idle < 1.4;
      if (orbit) {
        const both = input.down('KeyQ') && input.down('KeyE');
        carLook.yaw = damp(carLook.yaw, both ? Math.PI : orbit * 1.5, 10, dt); active = true; carLook.idle = 0.5;
      } else if (input.down('KeyQ') && input.down('KeyE')) { carLook.yaw = damp(carLook.yaw, Math.PI, 10, dt); active = true; }
      if (!active) { carLook.yaw = damp(carLook.yaw, 0, 3, dt); carLook.pitch = damp(carLook.pitch, 0, 3, dt); }
      driveCam.update(dt, p.vehicle, { yaw: carLook.yaw, pitch: carLook.pitch, active });
    } else {
      if (p.state === 'wasted') footCam.yaw += dt * 0.5; // slow orbit around the body
      footCam.update(dt, p, { dx: look.dx, dy: look.dy, orbit: p.state === 'normal' ? orbit : 0 });
    }
    blend.apply(dt);
    animateModel(dt);
  }

  function animateModel(dt) {
    const g = model.group;
    const inCar = p.mode === 'vehicle' && p.vehicle;
    const seat = inCar && p.vehicle.driverSeat;
    if (inCar && !seat) { g.visible = false; return; }
    g.visible = true;
    if (seat) {
      // optional: the vehicle exposes driverSeat (Vector3 in its mesh-local space) → show us seated
      const m = p.vehicle.mesh; m.updateMatrixWorld();
      g.position.copy(seat).applyMatrix4(m.matrixWorld);
      m.getWorldQuaternion(g.quaternion);
      model.animate(dt, { speed: 0, action: 'sit' });
      return;
    }
    g.position.copy(p.position);
    g.rotation.set(0, p.heading, 0);
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    if (dt > 0) {
      turnRate = damp(turnRate, wrap(p.heading - prevHeading) / dt, 10, dt);
      accel = damp(accel, (sp - prevSpeed) / dt, 6, dt);
    }
    prevHeading = p.heading; prevSpeed = sp;
    p.guard = game.time < guardUntil && p.action !== 'approach' && sp < 3 && p.state === 'normal' && !controlsLocked();
    const act = p.action === 'approach' ? 'none' : p.action;
    model.animate(dt, {
      speed: ['down', 'tumble', 'getup', 'wasted', 'busted', 'enter', 'pull'].includes(act) ? 0 : sp,
      sprint: p.sprinting, airborne: p.airborne && !['down', 'tumble'].includes(act), vy, turn: turnRate, accel,
      action: act, actionT: p.actionT, actionDur: p.actionDur, punchIdx, punchDur: punchDur(), guard: p.guard,
    });
  }

  // ---- debug hooks for tests ----
  game.debug.extra = game.debug.extra || {};
  game.debug.extra.pl = () => ({
    action: p.action, camYaw: +footCam.yaw.toFixed(3), y: +p.position.y.toFixed(2), stamina: +p.stamina.toFixed(2),
    speed: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2), near: p.nearVehicle?.type || null, timeScale: game.timeScale,
    approach: !!approach,
  });
  game.debug.playerSpots = () => getSpots();

  return p;
}
