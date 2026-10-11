// Procedural radio: two seeded generative stations driven by a lookahead step
// sequencer scheduled on the AudioContext clock. No audio files, no Math.random.
//
// createRadio(ac, out, noiseBuf) -> { setStation(i), station, names, dispose() }
// i: 0 = Off, 1 = Bombay Beats, 2 = Filmi FM.
// Nothing here touches AudioContext until createRadio() is called with one.

export const STATION_NAMES = ['Off', 'Bombay Beats', 'Filmi FM'];

const LOOKAHEAD_S = 0.12; // schedule this far ahead of the audio clock
const TICK_MS = 25;

// Tiny seeded PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createRadio(ac, out, noiseBuf) {
  let current = 0;
  let bus = null; // per-station gain node
  let timer = null;
  let nextT = 0;
  let step = 0;
  let rng = mulberry32(1);
  let st = null; // station state
  const ksCache = new Map();

  // ---------- voices ----------
  function done(node, ...more) {
    node.onended = () => {
      try { node.disconnect(); } catch (e) { /* ignore */ }
      for (const m of more) { try { m.disconnect(); } catch (e) { /* ignore */ } }
    };
  }

  // Oscillator with optional pitch drop and decay envelope.
  function tone(type, f0, f1, t, dur, vol, dest) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    done(o, g);
  }

  // Pitched/filtered noise hit (tabla-ish "na", shaker).
  function noiseHit(t, dur, vol, dest, type, freq, q) {
    if (!noiseBuf) return;
    const s = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, rng() * 1.5, dur + 0.05);
    done(s, f, g);
  }

  const kick = (t, vol, dest) => tone('sine', 165, 42, t, 0.28, vol, dest);
  const dhaGe = (t, vol, dest) => { // low dholak/bayan "ge"
    tone('sine', 120, 58, t, 0.3, vol, dest);
    noiseHit(t, 0.04, vol * 0.25, dest, 'lowpass', 400, 0.7);
  };
  const na = (t, vol, dest) => { // high rim hit
    noiseHit(t, 0.07, vol * 0.7, dest, 'bandpass', 2600, 4);
    tone('sine', 880, 780, t, 0.06, vol * 0.35, dest);
  };
  const tin = (t, vol, dest) => {
    tone('sine', 520, 470, t, 0.16, vol * 0.5, dest);
    noiseHit(t, 0.03, vol * 0.3, dest, 'bandpass', 3200, 3);
  };
  const shaker = (t, vol, dest) => noiseHit(t, 0.035, vol, dest, 'highpass', 7000, 0.5);

  // Karplus-Strong pluck, pre-rendered into a cached buffer per pitch.
  function ksBuffer(hz) {
    const key = Math.round(hz * 10);
    let buf = ksCache.get(key);
    if (buf) return buf;
    const sr = ac.sampleRate;
    const n = Math.max(2, Math.round(sr / hz));
    const len = Math.floor(sr * 1.5);
    buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const r = mulberry32(key);
    const ring = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) { // mellow excitation: smoothed noise
      prev = prev * 0.55 + (r() * 2 - 1) * 0.45;
      ring[i] = prev;
    }
    let idx = 0;
    const decay = 0.9965;
    for (let i = 0; i < len; i++) {
      const nxt = (idx + 1) % n;
      d[i] = ring[idx];
      ring[idx] = decay * 0.5 * (ring[idx] + ring[nxt]);
      idx = nxt;
    }
    const fade = Math.min(len, 3000);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    ksCache.set(key, buf);
    return buf;
  }

  function pluck(hz, t, dur, vol, dest) {
    const s = ac.createBufferSource();
    const g = ac.createGain();
    s.buffer = ksBuffer(hz);
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
    s.connect(g);
    g.connect(dest);
    s.start(t);
    s.stop(t + dur + 0.4);
    done(s, g);
  }

  function bassNote(hz, t, dur, vol, dest) {
    const o = ac.createOscillator();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.2);
    o.connect(f);
    f.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.25);
    done(o, f, g);
  }

  // ---------- Station 1: Bombay Beats (104 BPM) ----------
  function makeBeats() {
    const stepDur = 60 / 104 / 4;
    const D2 = 38; // midi
    const scale = [0, 1, 4, 5, 7, 8]; // phrygian-dominant-ish bass degrees
    const phrase = [0, 0, 3, 0, 4, 3, 1, 0]; // one degree per half bar
    let bar = null;
    function genBar(barNo) {
      const b = { kick: [0, 6, 10], dha: [], na: [4, 12], tin: [3, 11], bass: [] };
      if (rng() < 0.4) b.kick.push(14);
      if (barNo % 4 === 3 && rng() < 0.7) b.kick.push(15);
      if (rng() < 0.6) b.na.push(2);
      if (rng() < 0.5) b.na.push(8);
      if (rng() < 0.5) b.tin.push(7);
      if (rng() < 0.6) b.dha.push(13);
      for (let h = 0; h < 2; h++) {
        const deg = phrase[(barNo * 2 + h) % phrase.length];
        const root = D2 + scale[deg];
        const base = h * 8;
        b.bass.push({ s: base, m: root, d: 3 });
        if (rng() < 0.7) b.bass.push({ s: base + 3, m: root, d: 2 });
        if (rng() < 0.6) b.bass.push({ s: base + 6, m: root + (rng() < 0.4 ? 12 : 7), d: 1.5 });
        if (rng() < 0.3) b.bass.push({ s: base + 7, m: root + 1, d: 1 });
      }
      return b;
    }
    return {
      stepDur,
      tick(s, t) {
        const i = s % 16;
        if (i === 0) bar = genBar(Math.floor(s / 16));
        if (!bar) return;
        const acc = i % 4 === 0 ? 1 : 0.7;
        if (i % 2 === 0) shaker(t, 0.05 * acc, bus);
        if (bar.kick.includes(i)) kick(t, 0.9, bus);
        if (bar.dha.includes(i)) dhaGe(t, 0.55, bus);
        if (bar.na.includes(i)) na(t, 0.5, bus);
        if (bar.tin.includes(i)) tin(t, 0.45, bus);
        for (const n of bar.bass) {
          if (n.s === i) bassNote(midiHz(n.m), t, n.d * stepDur, 0.32, bus);
        }
      },
    };
  }

  // ---------- Station 2: Filmi FM (96 BPM) ----------
  function makeFilmi() {
    const stepDur = 60 / 96 / 4;
    const SA = 62; // D4
    const bhairav = [0, 1, 4, 5, 7, 8, 11]; // S r G m P d N
    const degHz = (k) => midiHz(SA + bhairav[((k % 7) + 7) % 7] + 12 * Math.floor(k / 7));
    let pos = 7; // start on upper Sa
    let phrase = null;
    function genPhrase(barNo) {
      const lastBar = barNo % 4 === 3;
      const slots = [];
      for (let k = 0; k < 8; k++) {
        const rest = rng() < (k === 0 ? 0.05 : 0.22);
        let move = Math.floor(rng() * 5) - 2; // -2..2
        if (pos > 10) move -= 1;
        if (pos < 2) move += 1;
        pos = Math.max(0, Math.min(13, pos + move));
        const final = lastBar && k === 7;
        if (final) pos = rng() < 0.6 ? 7 : 4; // resolve on Sa or Pa
        slots.push({ rest: rest && !final, deg: pos, grace: rng() < 0.18, long: rng() < 0.15 || final });
      }
      return slots;
    }
    return {
      stepDur,
      tick(s, t) {
        const i = s % 16;
        if (i === 0) phrase = genPhrase(Math.floor(s / 16));
        // tanpura-ish drone: Sa and Pa, low
        if (i === 0 || i === 8) {
          pluck(degHz(-7), t, 1.8, 0.22, bus);
          pluck(degHz(-3), t + 0.04, 1.6, 0.16, bus);
        }
        // melody on 8th notes
        if (i % 2 === 0 && phrase) {
          const slot = phrase[i / 2];
          if (slot && !slot.rest) {
            if (slot.grace) pluck(degHz(slot.deg + 1), t, 0.2, 0.08, bus);
            pluck(degHz(slot.deg), t + (slot.grace ? 0.05 : 0), slot.long ? 1.1 : 0.7, 0.32, bus);
          }
        }
        // keherwa: Dha Ge Na Ti | Na Ka Dhi Na (matra = 2 steps)
        if (i % 2 === 0) {
          const m = i / 2;
          if (m === 0) { dhaGe(t, 0.5, bus); na(t, 0.3, bus); }
          else if (m === 1) dhaGe(t, 0.25, bus);
          else if (m === 2) na(t, 0.35, bus);
          else if (m === 3) tin(t, 0.3, bus);
          else if (m === 4) na(t, 0.3, bus);
          else if (m === 5) na(t, 0.18, bus);
          else if (m === 6) { dhaGe(t, 0.35, bus); tin(t, 0.2, bus); }
          else na(t, 0.22, bus);
        }
        if (i % 4 === 2) shaker(t, 0.03, bus);
      },
    };
  }

  // ---------- sequencer ----------
  function schedule() {
    try {
      if (!st || !bus) return;
      const horizon = ac.currentTime + LOOKAHEAD_S;
      let guard = 0;
      while (nextT < horizon && guard++ < 64) {
        st.tick(step, nextT);
        nextT += st.stepDur;
        step++;
      }
    } catch (e) { /* never throw out of the timer */ }
  }

  function stopCurrent() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (bus) {
      const b = bus;
      try {
        b.gain.cancelScheduledValues(ac.currentTime);
        b.gain.setTargetAtTime(0, ac.currentTime, 0.03);
      } catch (e) { /* ignore */ }
      setTimeout(() => { try { b.disconnect(); } catch (e) { /* ignore */ } }, 400);
      bus = null;
    }
    st = null;
  }

  function setStation(i) {
    try {
      const idx = i === 1 || i === 2 ? i : 0;
      if (idx === current && (idx === 0 || timer !== null)) return;
      stopCurrent();
      current = idx;
      if (idx === 0) return;
      rng = mulberry32(idx === 1 ? 0xb0b0 : 0xf11f1);
      bus = ac.createGain();
      bus.gain.setValueAtTime(0.0001, ac.currentTime);
      bus.gain.linearRampToValueAtTime(1, ac.currentTime + 0.08);
      bus.connect(out);
      st = idx === 1 ? makeBeats() : makeFilmi();
      step = 0;
      nextT = ac.currentTime + 0.08;
      timer = setInterval(schedule, TICK_MS);
      schedule();
    } catch (e) { /* ignore */ }
  }

  return {
    setStation,
    get station() { return current; },
    names: STATION_NAMES,
    dispose() { try { stopCurrent(); current = 0; ksCache.clear(); } catch (e) { /* ignore */ } },
  };
}
