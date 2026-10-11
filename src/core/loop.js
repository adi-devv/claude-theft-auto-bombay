import { CONFIG } from './config.js';

/** Fixed-step loop. step(dt) is simulation, render(frameDt) draws once per RAF. */
export class FixedLoop {
  constructor(step, render, dt = CONFIG.dt) {
    this.step = step;
    this.render = render;
    this.dt = dt;
    this.acc = 0;
    this.last = null;
    this.running = false;
    this._raf = this._raf.bind(this);
    this.rafId = 0;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this._raf);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
  _raf(tMs) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._raf);
    const t = tMs / 1000;
    const frame = this.last === null ? 0 : Math.min(CONFIG.maxFrame, t - this.last);
    this.last = t;
    this.acc += frame;
    while (this.acc >= this.dt) {
      this.step(this.dt);
      this.acc -= this.dt;
    }
    this.render(frame);
  }
  /** Synchronous fixed steps (tests). */
  advance(sec) {
    const n = Math.max(0, Math.round(sec / this.dt));
    for (let i = 0; i < n; i++) this.step(this.dt);
    return n;
  }
}
