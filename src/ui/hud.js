// DOM HUD. Updated at ~10 Hz, only touching the DOM when a value changed.
export class Hud {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.classList.add('hidden');
    this.el.innerHTML = `
      <div class="tr"><div class="money" data-k="money"></div><div class="stars" data-k="stars"></div><div class="clock" data-k="clock"></div></div>
      <div class="objective" data-k="objective"></div>
      <div class="bl"><canvas id="minimap" width="180" height="180"></canvas><div class="bar"><i data-k="health"></i></div></div>
      <div class="br"><div class="speed hidden" data-k="speed"></div><div data-k="vehicle" class="hidden"></div><div data-k="radio"></div></div>`;
    root.appendChild(this.el);
    this.refs = {};
    for (const n of this.el.querySelectorAll('[data-k]')) this.refs[n.dataset.k] = n;
    this.minimapCanvas = this.el.querySelector('#minimap');
    this.cache = {};
    this.acc = 0;
  }
  show(v) {
    this.el.classList.toggle('hidden', !v);
  }
  _set(k, v, apply) {
    if (this.cache[k] === v) return;
    this.cache[k] = v;
    apply(this.refs[k], v);
  }
  /** s: {money, stars, hour, health, speedKmh|null, objective} */
  update(dt, s) {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this._set('money', s.money, (e, v) => (e.textContent = `₹${v}`));
    this._set('stars', s.stars, (e, v) => {
      e.innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < v ? 'on' : ''}">★</span>`).join('');
    });
    const h = Math.floor(s.hour) % 24;
    const m = Math.floor((s.hour % 1) * 60);
    this._set('clock', `${h}:${String(m).padStart(2, '0')}`, (e, v) => (e.textContent = v));
    this._set('health', Math.round(s.health), (e, v) => (e.style.width = `${Math.max(0, Math.min(100, v))}%`));
    this._set('objective', s.objective || '', (e, v) => (e.textContent = v));
    this._set('speed', s.speedKmh, (e, v) => {
      e.classList.toggle('hidden', v === null);
      if (v !== null) e.innerHTML = `${v} <small>km/h</small>`;
    });
  }
}
