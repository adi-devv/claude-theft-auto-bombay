// Synthesized game audio (WebAudio only, no files).
// The AudioContext is created ONLY inside unlock(); before that, and whenever
// WebAudio is unavailable, every method is a silent no-op. Nothing here throws
// or logs to console.error/warn.

import { createRadio, STATION_NAMES } from './radio.js';

const HORN_RANGE = 45; // metres

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Engine voice presets by vehicle class.
const ENGINES = {
  car: { wave: 'sawtooth', mult: 1.0, ratio2: 1.008, cutoff: 420, span: 1100, gain: 1.0, putt: 0 },
  auto: { wave: 'square', mult: 1.9, ratio2: 1.5, cutoff: 1100, span: 1800, gain: 0.7, putt: 1 },
  bus: { wave: 'sawtooth', mult: 0.7, ratio2: 0.5, cutoff: 220, span: 600, gain: 1.25, putt: 0 },
  bike: { wave: 'sawtooth', mult: 1.5, ratio2: 1.01, cutoff: 700, span: 1500, gain: 0.8, putt: 0 },
};

function engineClass(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('auto') || t.includes('rickshaw')) return 'auto';
  if (t.includes('bus')) return 'bus';
  if (t.includes('bike') || t.includes('scooter') || t.includes('moto')) return 'bike';
  return 'car';
}

export function createAudio(bus) {
  let ac = null;
  let built = false;
  let master = null;
  let sfx = null;
  let noiseBuf = null;
  let radio = null;
  let volume = 0.8;
  let muted = false;
  let stationIdx = 0;
  let listener = null;
  let engCls = 'car';
  let lastCrash = -1;
  let eng = null; // persistent engine nodes
  let sirenNodes = null; // persistent siren nodes
  let sirenOn = false;

  const now = () => ac.currentTime;

  function done(node, ...more) {
    node.onended = () => {
      try { node.disconnect(); } catch (e) { /* ignore */ }
      for (const m of more) { try { m.disconnect(); } catch (e) { /* ignore */ } }
    };
  }

  // One-shot oscillator note with attack/decay envelope.
  function note(type, f0, f1, t, dur, vol, attack = 0.008) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    done(o, g);
  }

  function build() {
    master = ac.createGain();
    master.gain.value = muted ? 0 : volume;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ac.destination);

    sfx = ac.createGain();
    sfx.gain.value = 1;
    sfx.connect(master);
    const radioBus = ac.createGain();
    radioBus.gain.value = 0.3; // radio sits under SFX
    radioBus.connect(master);

    // 2 s of white noise shared by crash + radio percussion
    const len = Math.floor(ac.sampleRate * 2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < len; i++) { // inline LCG: deterministic, no Math.random
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 2147483648) - 1;
    }

    // Persistent engine: osc pair -> lowpass -> putt-putt amp -> level -> sfx
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const amp = ac.createGain();
    const level = ac.createGain();
    const lfo = ac.createOscillator();
    const lfoDepth = ac.createGain();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.value = 45;
    o2.frequency.value = 45;
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 2;
    amp.gain.value = 1;
    level.gain.value = 0;
    lfo.type = 'sine';
    lfo.frequency.value = 8;
    lfoDepth.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(amp);
    amp.connect(level);
    level.connect(sfx);
    lfo.connect(lfoDepth);
    lfoDepth.connect(amp.gain);
    o1.start();
    o2.start();
    lfo.start();
    eng = { o1, o2, lp, amp, level, lfo, lfoDepth, active: false };

    // Persistent siren: sine swept 650-1300 Hz by a slow LFO
    const so = ac.createOscillator();
    const sg = ac.createGain();
    const sl = ac.createOscillator();
    const sd = ac.createGain();
    so.type = 'sine';
    so.frequency.value = 975;
    sl.type = 'sine';
    sl.frequency.value = 1.1;
    sd.gain.value = 325;
    sg.gain.value = 0;
    sl.connect(sd);
    sd.connect(so.frequency);
    so.connect(sg);
    sg.connect(sfx);
    so.start();
    sl.start();
    sirenNodes = { sg };

    radio = createRadio(ac, radioBus, noiseBuf);
    built = true;
    if (sirenOn) sg.gain.setTargetAtTime(0.07, now(), 0.05);
    if (stationIdx) radio.setStation(stationIdx);
  }

  function resume() {
    if (ac && ac.state === 'suspended') {
      const p = ac.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function unlock() {
    try {
      if (!ac) {
        const AC = typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext);
        if (!AC) return;
        ac = new AC();
        try {
          build();
        } catch (e) {
          built = false;
          const dead = ac;
          ac = null;
          try { dead.close(); } catch (e2) { /* ignore */ }
          return;
        }
      }
      resume();
    } catch (e) { /* ignore */ }
  }

  // ---------- sounds ----------
  function hornVoice(cls, vol) {
    const t = now();
    if (cls === 'auto') { // higher "paa-paa" double beep
      for (let k = 0; k < 2; k++) {
        const s = t + k * 0.2;
        note('square', 520, 500, s, 0.14, vol * 0.18, 0.01);
        note('square', 660, 640, s, 0.14, vol * 0.14, 0.01);
      }
    } else {
      const lo = cls === 'bus' ? 320 : 400;
      const hi = cls === 'bus' ? 400 : 500;
      note('square', lo, lo, t, 0.35, vol * 0.16, 0.015);
      note('square', hi, hi, t, 0.35, vol * 0.13, 0.015);
    }
  }

  // Play a horn. Player horns always sound; others only within HORN_RANGE of the listener.
  function hornAt(pos, source) {
    try {
      if (!built) return;
      const mine = source === 'player';
      let vol = 1;
      if (pos && !mine) {
        if (!listener) return;
        const d = Math.hypot((pos.x || 0) - listener.x, (pos.z || 0) - listener.z);
        if (!(d <= HORN_RANGE)) return;
        vol = 1 - 0.75 * (d / HORN_RANGE);
      }
      hornVoice(mine ? engCls : 'car', vol);
    } catch (e) { /* ignore */ }
  }

  function crash(intensity) {
    try {
      if (!built) return;
      const k = clamp(Number(intensity) || 0, 0, 1);
      if (k < 0.03) return;
      const t = now();
      if (t - lastCrash < 0.08) return; // avoid node spam on repeated impacts
      lastCrash = t;
      const s = ac.createBufferSource();
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      s.buffer = noiseBuf;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900 + 3500 * k, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 0.25 + 0.5 * k);
      const dur = 0.2 + 0.6 * k;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15 + 0.6 * k, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(sfx);
      s.start(t, 0, dur + 0.05);
      done(s, f, g);
      note('sine', 110, 40, t, 0.25 + 0.2 * k, 0.2 + 0.5 * k, 0.004); // thump
    } catch (e) { /* ignore */ }
  }

  function jingle(freqs, type, vol, spacing, len) {
    const t = now() + 0.01;
    freqs.forEach((f, i) => {
      note(type, f, f, t + i * spacing, len, vol, 0.01);
      note('sine', f * 2, f * 2, t + i * spacing, len * 0.7, vol * 0.35, 0.01);
    });
  }

  const api = {
    unlock,

    update(dt, l) {
      try {
        if (l && typeof l.x === 'number' && typeof l.z === 'number') listener = { x: l.x, z: l.z };
        resume();
      } catch (e) { /* ignore */ }
    },

    engine(vehicleType, speed, throttle) {
      try {
        if (!built || !eng) return;
        const t = now();
        if (vehicleType == null) {
          if (eng.active) {
            eng.level.gain.setTargetAtTime(0, t, 0.12);
            eng.lfoDepth.gain.setTargetAtTime(0, t, 0.12);
            eng.active = false;
          }
          return;
        }
        const cls = engineClass(vehicleType);
        const p = ENGINES[cls];
        if (cls !== engCls || !eng.active) {
          eng.o1.type = p.wave;
          eng.o2.type = p.wave;
        }
        engCls = cls;
        const sp = Math.abs(Number(speed) || 0);
        const th = clamp(Number(throttle) || 0, 0, 1);
        const f = (45 + sp * 4) * p.mult;
        eng.o1.frequency.setTargetAtTime(f, t, 0.05);
        eng.o2.frequency.setTargetAtTime(f * p.ratio2, t, 0.05);
        eng.lp.frequency.setTargetAtTime(p.cutoff + th * p.span * 0.6 + Math.min(sp, 40) * (p.span / 120), t, 0.08);
        eng.level.gain.setTargetAtTime((0.04 + th * 0.1 + Math.min(sp, 40) * 0.0008) * p.gain, t, 0.08);
        // auto: putt-putt amplitude modulation
        eng.lfo.frequency.setTargetAtTime(7 + sp * 0.5, t, 0.1);
        eng.amp.gain.setTargetAtTime(p.putt ? 0.55 : 1, t, 0.1);
        eng.lfoDepth.gain.setTargetAtTime(p.putt ? 0.45 : 0, t, 0.1);
        eng.active = true;
      } catch (e) { /* ignore */ }
    },

    // horn() with no pos = the player's own horn; with pos, range-checked.
    horn(pos) { hornAt(pos, pos ? undefined : 'player'); },

    siren(on) {
      try {
        sirenOn = !!on;
        if (!built || !sirenNodes) return;
        sirenNodes.sg.gain.setTargetAtTime(sirenOn ? 0.07 : 0, now(), 0.06);
      } catch (e) { /* ignore */ }
    },

    crash,

    coin() { // rising two-note chime
      try {
        if (!built) return;
        jingle([hz(88), hz(95)], 'triangle', 0.16, 0.09, 0.45);
      } catch (e) { /* ignore */ }
    },

    success() { // filmi-style ascending phrase (Bhairav: S G m P d P S')
      try {
        if (!built) return;
        const sa = 72;
        jingle([0, 4, 5, 7, 8, 7, 12].map((x) => hz(sa + x)), 'triangle', 0.14, 0.12, 0.5);
        const t = now() + 0.01 + 6 * 0.12;
        note('sine', hz(sa + 12), hz(sa + 12), t, 0.9, 0.12, 0.02);
        note('sine', hz(sa + 7), hz(sa + 7), t, 0.9, 0.08, 0.02);
      } catch (e) { /* ignore */ }
    },

    fail() { // descending phrase
      try {
        if (!built) return;
        jingle([76, 73, 70, 66].map(hz), 'sawtooth', 0.07, 0.17, 0.4);
      } catch (e) { /* ignore */ }
    },

    radioNext() {
      stationIdx = (stationIdx + 1) % STATION_NAMES.length;
      try { if (built && radio) radio.setStation(stationIdx); } catch (e) { /* ignore */ }
      return STATION_NAMES[stationIdx];
    },

    setVolume(v) {
      try {
        volume = clamp(Number(v) || 0, 0, 1);
        if (built && master) master.gain.setTargetAtTime(muted ? 0 : volume, now(), 0.02);
      } catch (e) { /* ignore */ }
    },

    toggleMute() {
      muted = !muted;
      try {
        if (built && master) master.gain.setTargetAtTime(muted ? 0 : volume, now(), 0.02);
      } catch (e) { /* ignore */ }
      return muted;
    },

    get ready() { return built && !!ac; },
  };

  // Bus subscriptions (no AudioContext needed to subscribe)
  try {
    if (bus && typeof bus.on === 'function') {
      bus.on('horn', (p) => hornAt(p && p.pos, p && p.source));
      bus.on('vehicle:damaged', (p) => crash(p && p.impact));
      bus.on('money:change', (p) => { if (p && p.delta > 0) api.coin(); });
      bus.on('mission:complete', () => api.success());
      bus.on('mission:fail', () => api.fail());
    }
  } catch (e) { /* ignore */ }

  return api;
}
