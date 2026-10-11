// Game: state machine + wiring. Systems are plugged into the fixed-step loop with
// game.addSystem(name, {update(dt, ctx)}, order). Order: input 0, player 10, traffic 20,
// peds 30, police 40, collisions 50, gameplay 60, camera 90.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { EventBus } from './events.js';
import { RNG } from './rng.js';
import { Input } from './input.js';
import { FixedLoop } from './loop.js';
import { buildWorld } from '../world/world.js';
import { POIS } from '../world/mapData.js';
import { Player } from '../entities/Player.js';
import { CameraRig } from '../render/CameraRig.js';
import { createSky } from '../render/sky.js';
import { Hud } from '../ui/hud.js';
import { Minimap } from '../ui/minimap.js';
import { Menus } from '../ui/menus.js';
import { Toasts } from '../ui/toast.js';

export class Game {
  constructor({ canvas, uiRoot, seed, test }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.seed = seed;
    this.test = test;
    this.webgl = false;
    this.ready = false;
    this.frame = 0;
    this.drawCalls = 0;
    this.fps = 0;
    this.state = 'title';
    this.systems = [];
    this.money = CONFIG.startMoney;
    this.stars = 0;
    this.objective = '';
    this.hour = 17.5;
    this.simTime = 0;
  }

  /** Returns false (after console.error) if WebGL is unavailable. */
  init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.test, powerPreference: 'high-performance' });
      const gl = this.renderer.getContext();
      if (!gl || gl.isContextLost()) throw new Error('no WebGL context');
    } catch (err) {
      console.error('WebGL init failed', err && err.message);
      this.webgl = false;
      return false;
    }
    this.webgl = true;
    const r = this.renderer;
    r.setPixelRatio(this.test ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    r.setSize(window.innerWidth, window.innerHeight, false);

    this.bus = new EventBus();
    this.rng = new RNG(this.seed);
    this.input = new Input(window);
    this.input.blockDefaults = () => this.state === 'playing';

    this.scene = new THREE.Scene();
    const horizon = 0xe9d9b8;
    this.scene.background = new THREE.Color(horizon);
    this.scene.fog = new THREE.Fog(horizon, CONFIG.fog.near, CONFIG.fog.far);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, CONFIG.camera.near, CONFIG.camera.far);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x8a7a60, 1.0));
    const sun = new THREE.DirectionalLight(0xffe6bf, 1.25);
    sun.position.set(-250, 400, 180);
    this.scene.add(sun);
    this.sky = createSky();
    this.scene.add(this.sky.mesh);

    this.world = buildWorld({ scene: this.scene, rng: this.rng });
    this.graph = this.world.graph;
    this.grid = this.world.grid;
    if (this.test) this.world.setNight(0);

    this.cameraRig = new CameraRig(this.camera);

    // ctx shared with all systems
    this.ctx = {
      game: this, scene: this.scene, renderer: r, camera: this.cameraRig, threeCamera: this.camera,
      graph: this.graph, grid: this.grid, rng: this.rng, bus: this.bus, input: this.input,
      world: this.world, config: CONFIG, test: this.test,
      player: null, traffic: null, peds: null, police: null, economy: null, wanted: null,
      missions: null, audio: null, time: { t: 0, dt: CONFIG.dt, hour: this.hour },
    };
    this.player = new Player(this.ctx);
    this.ctx.player = this.player;
    this.spawnPlayer();

    // UI
    this.hud = new Hud(this.uiRoot);
    this.minimap = new Minimap(this.hud.minimapCanvas, this.world);
    this.menus = new Menus(this.uiRoot, this);
    this.toasts = new Toasts(this.uiRoot, this.bus);

    this.addSystem('player', { update: (dt, ctx) => this.player.update(dt, ctx) }, 10);
    this.addSystem('time', {
      update: (dt) => {
        this.simTime += dt;
        if (!this.test) this.hour = (this.hour + dt / 30) % 24; // 12 real min per day
        this.ctx.time.t = this.simTime;
        this.ctx.time.hour = this.hour;
      },
    }, 5);
    this.addSystem('camera', { update: (dt) => this.updateCamera(dt) }, 90);

    this.input.onKey((code) => this.onKey(code));
    window.addEventListener('resize', () => this.onResize());
    this.loop = new FixedLoop((dt) => this.step(dt), (dt) => this.render(dt));
    this.setState('title');
    this.updateCamera(0);
    return true;
  }

  addSystem(name, sys, order = 50) {
    this.systems.push({ name, sys, order });
    this.systems.sort((a, b) => a.order - b.order);
    this.ctx[name] = this.ctx[name] ?? sys;
  }

  spawnPlayer() {
    this.player.teleport(POIS.SPAWN.x, POIS.SPAWN.z, Math.PI / 2);
    this.cameraRig.snap(this.player);
  }

  cameraTarget() {
    return this.player;
  }
  updateCamera(dt) {
    this.cameraRig.update(dt, this.cameraTarget(), this.input, this.grid);
  }

  setState(s) {
    this.state = s;
    this.menus.setState(s);
    this.hud.show(s !== 'title');
    this.bus.emit('state', s);
  }
  startNewGame() {
    if (this.state !== 'title') return;
    this.input.clear();
    this.money = CONFIG.startMoney;
    this.spawnPlayer();
    this.setState('playing');
    this.bus.emit('game:start', {});
  }
  resume() {
    if (this.state === 'paused') {
      this.input.clear();
      this.setState('playing');
    }
  }
  quitToTitle() {
    if (this.state === 'paused') this.setState('title');
  }
  onKey(code) {
    this.bus.emit('gesture', code);
    if (code === 'Enter') {
      if (this.state === 'title') this.startNewGame();
    } else if (code === 'Escape') {
      if (this.state === 'playing') this.setState('paused');
      else if (this.state === 'paused') this.resume();
    }
  }
  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  step(dt) {
    if (this.state === 'playing') {
      for (const s of this.systems) s.sys.update(dt, this.ctx);
    }
    this.input.endStep();
  }

  render(frameDt) {
    if (this.state === 'title') this.cameraRig.titleOrbit(frameDt);
    this.sky.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.frame++;
    if (frameDt > 0) this.fps += (1 / frameDt - this.fps) * 0.1;
    if (this.state !== 'title') {
      const p = this.player;
      this.hud.update(frameDt, {
        money: this.money, stars: this.stars, hour: this.hour, health: p.health,
        speedKmh: p.inVehicle ? Math.round(p.speed * 3.6) : null, objective: this.objective,
      });
      this.minimap.draw(frameDt, p.x, p.z, this.cameraRig.yaw);
    }
    if (!this.ready) this.ready = true;
  }

  start() {
    this.loop.start();
  }
  advance(sec) {
    return this.loop.advance(sec);
  }
}
