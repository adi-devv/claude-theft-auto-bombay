// Vehicle audio: a tiny pool of synthesized engine voices (player + 2 nearest AI), one tyre-screech voice,
// one-shot crash/explosion sounds, horns (classic Indian dual-tone, deeper for buses) and the player's siren.
// Everything is created lazily once game.audio.ready (after a user gesture).
const ENGINE_VOICES = 3, MAX_HORNS = 5;

export class VehicleAudio {
  constructor(game) {
    this.game = game; this.ok = false; this.voices = []; this.horns = new Map(); this.lastCrash = 0; this.siren = null;
  }
  _init() {
    const A = this.game.audio;
    if (this.ok || !A || !A.ready) return this.ok;
    const ctx = A.ctx; this.ctx = ctx;
    this.engineBus = A.bus('engine'); this.sfxBus = A.bus('sfx'); this.sirenBus = A.bus('siren');
    this.noise = A.noiseBuffer();
    // engine voices
    for (let i = 0; i < ENGINE_VOICES; i++) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const nz = ctx.createBufferSource(); nz.buffer = this.noise; nz.loop = true;
      const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 1.2;
      const g1 = ctx.createGain(), g2 = ctx.createGain(), gn = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      const out = ctx.createGain(); out.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o1.connect(g1); o2.connect(g2); nz.connect(nbp); nbp.connect(gn);
      g1.connect(lp); g2.connect(lp); gn.connect(lp); lp.connect(out);
      if (pan) { out.connect(pan); pan.connect(this.engineBus); } else out.connect(this.engineBus);
      g1.gain.value = 0.5; g2.gain.value = 0.35; gn.gain.value = 0.25;
      o1.start(); o2.start(); nz.start();
      this.voices.push({ o1, o2, nbp, g1, g2, gn, lp, out, pan, car: null });
    }
    // tyre screech (shared)
    {
      const nz = ctx.createBufferSource(); nz.buffer = this.noise; nz.loop = true;
      const bp1 = ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 1900; bp1.Q.value = 9;
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 3100; bp2.Q.value = 12;
      const g = ctx.createGain(); g.gain.value = 0;
      nz.connect(bp1); nz.connect(bp2); bp1.connect(g); bp2.connect(g); g.connect(this.sfxBus); nz.start();
      this.screech = { g, bp1, bp2 };
    }
    // wall scrape (shared): grindy filtered noise
    {
      const nz = ctx.createBufferSource(); nz.buffer = this.noise; nz.loop = true; nz.playbackRate.value = 0.6;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0;
      nz.connect(bp); bp.connect(g); g.connect(this.sfxBus); nz.start();
      this.scrape = { g, bp };
    }
    this.ok = true;
    return true;
  }
  _listener() { return this.game.camera.position; }
  _dist(x, z) { const L = this._listener(); return Math.hypot(x - L.x, z - L.z); }
  _pan(x, z) {
    const cam = this.game.camera; const L = cam.position;
    // camera right vector in XZ
    const e = cam.matrixWorld.elements; const rx = e[0], rz = e[2];
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz) || 1;
    return Math.max(-0.8, Math.min(0.8, (dx * rx + dz * rz) / d));
  }

  /** Once per frame. */
  update(dt) {
    if (!this._init()) return;
    const t = this.ctx.currentTime, g = this.game;
    const player = g.player?.vehicle && !g.player.vehicle.wrecked ? g.player.vehicle : null;
    // choose engine cars: player + nearest running AI cars
    const want = [];
    if (player) want.push(player);
    const L = this._listener();
    const cand = [];
    for (const v of g.vehicles) {
      if (v === player || v.wrecked || !v.driver || v.ph?.lod) continue;
      const d = Math.hypot(v.position.x - L.x, v.position.z - L.z);
      if (d < 40) cand.push([d, v]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, v] of cand) { if (want.length >= ENGINE_VOICES) break; want.push(v); }
    // keep stable voice assignment
    for (const vo of this.voices) if (vo.car && !want.includes(vo.car)) vo.car = null;
    for (const v of want) if (!this.voices.some((vo) => vo.car === v)) { const free = this.voices.find((vo) => !vo.car); if (free) free.car = v; }
    for (const vo of this.voices) {
      const v = vo.car;
      if (!v) { vo.out.gain.setTargetAtTime(0, t, 0.08); continue; }
      const s = v.spec, ph = v.ph;
      const rpm = Math.max(s.idle * 0.9, ph.rpm);
      const fire = rpm / 60 * (s.cylinders / 2) * s.engineTone;
      const thr = Math.max(Math.abs(ph.drive), 0);
      const isP = v === player;
      vo.o1.frequency.setTargetAtTime(fire, t, 0.03);
      vo.o2.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
      vo.nbp.frequency.setTargetAtTime(200 + fire * 3, t, 0.05);
      const load = 0.35 + 0.65 * thr;
      vo.lp.frequency.setTargetAtTime(180 + fire * (2.2 + 3.5 * load), t, 0.04);
      vo.g2.gain.setTargetAtTime(s.type === 'bus' ? 0.6 : 0.35, t, 0.1);
      const d = this._dist(v.position.x, v.position.z);
      const base = isP ? 0.16 * (0.55 + 0.45 * load) : 0.07 * Math.max(0, 1 - d / 40) * (0.5 + 0.5 * load);
      vo.out.gain.setTargetAtTime(base, t, 0.05);
      if (vo.pan) vo.pan.pan.setTargetAtTime(isP ? 0 : this._pan(v.position.x, v.position.z), t, 0.1);
    }
    // screech: loudest skidding car near the listener
    let sk = 0, sc = 0;
    for (const v of g.vehicles) {
      if (!v.ph || v.ph.sleeping || v.ph.lod) continue;
      const d = this._dist(v.position.x, v.position.z); if (d > 60) continue;
      const att = v === player ? 1 : Math.max(0, 1 - d / 60) * 0.6;
      sk = Math.max(sk, (v.fxSkid || 0) * att);
      sc = Math.max(sc, (v.fxScrape || 0) * att);
    }
    this.screech.g.gain.setTargetAtTime(Math.min(0.22, sk * 0.22), t, 0.04);
    this.screech.bp1.frequency.setTargetAtTime(1700 + sk * 500, t, 0.1);
    this.scrape.g.gain.setTargetAtTime(Math.min(0.3, sc * 0.3), t, 0.03);
    // siren (only for a player-driven police car; Police AI owns its own sirens)
    const wantSiren = player && player.isPolice && player.sirenOn && player.sirenAudio !== false;
    if (wantSiren && !this.siren) this._startSiren();
    if (!wantSiren && this.siren) { this.siren.g.gain.setTargetAtTime(0, t, 0.05); const s = this.siren; setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch (e) {} }, 400); this.siren = null; }
    // horns follow their cars
    for (const [v, h] of this.horns) {
      const d = this._dist(v.position.x, v.position.z);
      const k = v === player ? 1 : Math.max(0, 1 - d / 90);
      h.g.gain.setTargetAtTime(h.on ? h.vol * k : 0, t, 0.015);
      if (!h.on && t > h.offAt + 0.2) { try { h.o1.stop(); h.o2.stop(); } catch (e) {} this.horns.delete(v); }
    }
  }
  _startSiren() {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth';
    const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.35;
    const lg = ctx.createGain(); lg.gain.value = 380; lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 980;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0; o.connect(bp); bp.connect(g); g.connect(this.sirenBus);
    o.start(); lfo.start(); g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.05);
    this.siren = { o, lfo, g };
  }

  /** Horn on/off for a vehicle. on=true holds, false releases; undefined = short toot. */
  horn(v, on) {
    if (!this._init()) return;
    const t = this.ctx.currentTime;
    let h = this.horns.get(v);
    if (on === false) { if (h) { h.on = false; h.offAt = t; } return; }
    if (!h) {
      if (this.horns.size >= MAX_HORNS) return;
      const d = this._dist(v.position.x, v.position.z);
      if (d > 90) return;
      const [f1, f2] = v.spec.hornF;
      const ctx = this.ctx;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'square'; o2.type = 'sawtooth';
      o1.frequency.value = f1 * (0.98 + Math.random() * 0.04); o2.frequency.value = f2 * (0.98 + Math.random() * 0.04);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = (f1 + f2) * 1.4; bp.Q.value = 0.9;
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o1.connect(bp); o2.connect(bp); bp.connect(g);
      if (pan) { pan.pan.value = v.driver === 'player' ? 0 : this._pan(v.position.x, v.position.z); g.connect(pan); pan.connect(this.sfxBus); } else g.connect(this.sfxBus);
      o1.start(); o2.start();
      h = { o1, o2, g, on: true, offAt: 0, vol: v.type === 'bus' ? 0.22 : 0.16 };
      this.horns.set(v, h);
    }
    h.on = true;
    if (on === undefined) { h.on = true; const self = this; clearTimeout(h.tm); h.tm = setTimeout(() => { if (self.horns.get(v) === h) { h.on = false; h.offAt = self.ctx.currentTime; } }, 320 + Math.random() * 120); }
  }

  /** One-shot crash thump scaled by impulse (velocity change, m/s). */
  crash(x, z, dv, metal = true) {
    if (!this._init()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastCrash < 0.07) return;
    this.lastCrash = t;
    const d = this._dist(x, z); if (d > 120) return;
    const vol = Math.min(1, dv / 14) * Math.max(0.05, 1 - d / 120);
    if (vol < 0.02) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.5 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + vol * 2200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6 * vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + vol * 0.35);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(lp); lp.connect(g);
    const outN = pan || this.sfxBus; if (pan) { pan.pan.value = this._pan(x, z); pan.connect(this.sfxBus); }
    g.connect(outN);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.7);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.7 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og); og.connect(outN); o.start(t); o.stop(t + 0.35);
    if (metal && vol > 0.15) {
      const m = ctx.createOscillator(); m.type = 'square'; m.frequency.value = 280 + Math.random() * 400;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(0.06 * vol, t); mg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
      m.connect(hp); hp.connect(mg); mg.connect(outN); m.start(t); m.stop(t + 0.2);
    }
  }
  explosion(x, z) {
    if (!this._init()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const d = this._dist(x, z); const vol = Math.max(0.08, 1 - d / 250);
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    src.connect(lp); lp.connect(g); g.connect(this.sfxBus); src.start(t); src.stop(t + 2.3);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(25, t + 1);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.9 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(og); og.connect(this.sfxBus); o.start(t); o.stop(t + 1.3);
  }
}

export function getAudio(game) {
  if (!game._vehicleAudio) game._vehicleAudio = new VehicleAudio(game);
  return game._vehicleAudio;
}
