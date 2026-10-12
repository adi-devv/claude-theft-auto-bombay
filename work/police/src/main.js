// Claude Theft Auto: Bombay — bootstrap + main loop. OWNED BY THE ARCHITECT. Do not edit from a system agent;
// put what you need behind your own module's create*/update functions (see CONTRACT.md).
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { Audio } from './core/audio.js';
import { makeRng } from './core/rng.js';
import { RoadNetwork } from './world/roads.js';
import { StaticCollision } from './world/collision.js';
import { SPAWN } from './world/mapdata.js';
import { createCity } from './world/city.js';
import { resolveVehicleCollisions } from './vehicles/collisions.js';
import { createVehicle } from './vehicles/vehicle.js';
import { createPlayer } from './player/player.js';
import { createTraffic } from './ai/traffic.js';
import { createPeds } from './ai/peds.js';
import { createPolice } from './ai/police.js';
import { createWanted } from './systems/wanted.js';
import { createHUD } from './ui/hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);

const loading = document.getElementById('loading');
const setLoading = (t) => { if (loading) loading.querySelector('.msg').textContent = t; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && (e.reason.stack || e.reason))));

async function boot() {
  const container = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, params.has('lowres') ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 3000);
  camera.position.set(SPAWN.x + 10, 8, SPAWN.z + 10);
  camera.lookAt(SPAWN.x, 1, SPAWN.z);

  const game = {
    THREE, renderer, scene, camera, params,
    input: new Input(window), events: new Events(), audio: new Audio(),
    rng: makeRng(Number(params.get('seed')) || 20261012),
    roads: null, collision: null,
    vehicles: [], peds: [],
    city: null, player: null, traffic: null, pedSystem: null, police: null, wanted: null, hud: null,
    time: 0, frame: 0, fps: 60, paused: false, timeScale: 1,
    started: params.has('test'),          // title screen dismissed (HUD sets this)
    testMode: params.has('test'),
    composer: null,                       // city may set an EffectComposer; main renders through it if present
    debug: { extra: {} },
    errors,
    createVehicle: (opts) => createVehicle(game, opts),
  };
  window.__game = game;

  setLoading('Laying out the Queen’s Necklace…'); await nextFrame();
  game.roads = new RoadNetwork();
  game.collision = new StaticCollision(16);

  setLoading('Building Marine Drive and Fort…'); await nextFrame();
  game.city = await createCity(game);

  setLoading('Waking up the city…'); await nextFrame();
  game.wanted = createWanted(game);
  game.hud = createHUD(game);
  game.pedSystem = createPeds(game);
  game.traffic = createTraffic(game);
  game.police = createPolice(game);
  game.player = createPlayer(game);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    game.composer?.setSize?.(window.innerWidth, window.innerHeight);
    game.events.emit('resize', {});
  });

  installDebug(game);
  if (loading) loading.remove();
  game.events.emit('ready', {});

  const call = (sys, fn, dt) => { if (sys && sys[fn]) { try { sys[fn](dt); } catch (e) { reportOnce(game, sys, fn, e); } } };

  function fixedUpdate(dt) {
    game.time += dt;
    call(game.player, 'update', dt);
    call(game.traffic, 'update', dt);
    call(game.police, 'update', dt);
    for (let i = game.vehicles.length - 1; i >= 0; i--) { const v = game.vehicles[i]; if (v) call(v, 'update', dt); }
    try { resolveVehicleCollisions(game, dt); } catch (e) { reportOnce(game, { name: 'collisions' }, 'resolve', e); }
    call(game.pedSystem, 'update', dt);
    call(game.wanted, 'update', dt);
  }

  function frameUpdate(dt) {
    call(game.player, 'updateCamera', dt);
    call(game.city, 'update', dt);
    for (const v of game.vehicles) call(v, 'frameUpdate', dt);
    call(game.pedSystem, 'frameUpdate', dt);
    call(game.police, 'frameUpdate', dt);
    call(game.hud, 'update', dt);
  }

  let last = performance.now(), acc = 0, fpsAcc = 0, fpsFrames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    fpsAcc += dtReal; fpsFrames++;
    if (fpsAcc > 0.5) { game.fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
    let steps = 0;
    if (!game.paused) {
      acc += dtReal * game.timeScale;
      while (acc >= STEP && steps < 6) { fixedUpdate(STEP); acc -= STEP; steps++; }
      if (steps === 6) acc = 0;
    }
    if (steps > 0 || game.paused) game.input.endFrame();
    frameUpdate(game.paused ? 0 : dtReal * game.timeScale);
    if (game.composer) game.composer.render(dtReal); else renderer.render(scene, camera);
    game.frame++;
  }
  requestAnimationFrame(frame);

  // Deterministic stepping for tests: __game.debug.step(seconds) advances the simulation without rendering.
  game.debug.step = (seconds) => { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) fixedUpdate(STEP); frameUpdate(STEP); };
}

const reported = new Set();
function reportOnce(game, sys, fn, e) {
  const key = (sys?.constructor?.name || sys?.name || '?') + '.' + fn + ':' + e.message;
  if (reported.has(key)) return; reported.add(key);
  console.error('[system error]', key, e);
  errors.push(key + '\n' + (e.stack || ''));
}

function installDebug(game) {
  const d = game.debug;
  d.state = () => {
    const p = game.player;
    const v = p?.vehicle;
    const pos = p?.position || { x: 0, z: 0 };
    const out = {
      fps: Math.round(game.fps), time: +game.time.toFixed(2),
      player: p ? { mode: p.mode, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), heading: +(p.heading ?? 0).toFixed(3), health: p.health, state: p.state } : null,
      vehicle: v ? { type: v.type, speed: +(v.speed ?? 0).toFixed(2), kmh: Math.round(Math.abs(v.speed ?? 0) * 3.6), heading: +v.heading.toFixed(3), x: +v.position.x.toFixed(2), z: +v.position.z.toFixed(2), health: v.health } : null,
      wanted: game.wanted ? { level: game.wanted.level, seen: !!game.wanted.seen } : null,
      counts: { vehicles: game.vehicles.length, peds: game.peds.length },
      road: game.roads?.roadNameAt(pos.x, pos.z), area: game.roads?.areaNameAt(pos.x, pos.z),
      render: { calls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles, geometries: game.renderer.info.memory.geometries, textures: game.renderer.info.memory.textures },
      errors: game.errors.slice(-5),
    };
    for (const [k, fn] of Object.entries(d.extra)) { try { out[k] = fn(); } catch (e) { out[k] = 'err: ' + e.message; } }
    return out;
  };
  d.teleport = (x, z, heading = 0) => game.player?.teleport?.(x, z, heading);
  d.spawnCar = (type = 'taxi') => {
    const p = game.player; if (!p) return null;
    if (p.vehicle) p.exitVehicle?.(true);
    const h = p.heading ?? 0;
    const v = game.createVehicle({ type, x: p.position.x + Math.sin(h) * 4, z: p.position.z + Math.cos(h) * 4, heading: h });
    p.enterVehicle?.(v, { instant: true });
    return v;
  };
  d.setTime = (h) => game.city?.setTimeOfDay?.(h);
  d.setWanted = (n) => game.wanted?.setLevel?.(n);
}

boot().catch((e) => {
  console.error(e);
  errors.push(String(e.stack || e));
  const l = document.getElementById('loading');
  if (l) l.querySelector('.msg').textContent = 'Failed to start: ' + e.message;
});
