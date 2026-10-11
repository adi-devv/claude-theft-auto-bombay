// Wanted level: heat -> stars, evasion timer. Pure logic (bus = {emit(name, payload)}).
export const WANTED_THRESHOLDS = Object.freeze([20, 60, 120, 220, 350]);
const MAX_HEAT = 500;

export function starsForHeat(heat) {
  let s = 0;
  for (let i = 0; i < WANTED_THRESHOLDS.length; i++) if (heat >= WANTED_THRESHOLDS[i]) s = i + 1;
  return s;
}

export class Wanted {
  constructor(bus) {
    this.bus = bus || null;
    this._heat = 0;
    this._stars = 0;
    this._evade = 0; // seconds without cop LOS
  }

  get stars() { return this._stars; }
  get heat() { return this._heat; }
  /** Seconds of required evasion at the current star level (0 when no stars). */
  get evadeTime() { return this._stars > 0 ? 8 + 4 * this._stars : 0; }
  /** 0..1 progress towards losing the cops. */
  get evadeProgress() {
    const t = this.evadeTime;
    return t > 0 ? Math.min(1, this._evade / t) : 0;
  }

  addHeat(n, copSees = false) {
    if (!(n > 0)) return;
    this._heat = Math.min(MAX_HEAT, this._heat + (copSees ? n * 2 : n));
    this._refresh();
  }

  /** Force a minimum star level (e.g. story missions). */
  setStars(stars) {
    const s = Math.max(0, Math.min(5, Math.floor(stars) || 0));
    const need = s === 0 ? 0 : WANTED_THRESHOLDS[s - 1];
    if (this._heat < need) this._heat = need;
    this._refresh();
  }

  update(dt, copHasLos = false) {
    if (!(dt > 0)) return;
    if (this._stars === 0) {
      this._evade = 0;
      if (this._heat > 0) this._heat = Math.max(0, this._heat - dt);
      return;
    }
    if (copHasLos) { this._evade = 0; return; }
    this._evade += dt;
    if (this._evade >= this.evadeTime) this.clear();
  }

  clear() {
    this._heat = 0;
    this._evade = 0;
    this._refresh();
  }

  _refresh() {
    const s = starsForHeat(this._heat);
    if (s !== this._stars) {
      const up = s > this._stars;
      this._stars = s;
      if (up) this._evade = 0; // new threat level restarts the evasion clock
      if (s === 0) this._evade = 0;
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('wanted:change', { stars: s });
    }
  }
}
