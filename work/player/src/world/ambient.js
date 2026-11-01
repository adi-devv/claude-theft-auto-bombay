// Subtle procedural ambience on the 'ambient' bus: sea swell near the coast, distant traffic hum,
// crows by day, crickets at night. Starts lazily once game.audio.ready (after a user gesture).
export function createAmbient(game, fields) {
  let A = null, t = 0, nextCaw = 3;
  function init() {
    const au = game.audio, ac = au.ensure ? au.ensure() : au.ctx, out = au.bus('ambient');
    const noise = () => { const s = ac.createBufferSource(); s.buffer = au.noiseBuffer(); s.loop = true; s.start(); return s; };
    const chain = (src, type, f, q = 0.7) => { const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; src.connect(fl).connect(g).connect(out); return g; };
    const sea = chain(noise(), 'lowpass', 520), surf = chain(noise(), 'bandpass', 1400, 0.5), hum = chain(noise(), 'lowpass', 160);
    // crickets: 4.6 kHz tone gated by an 22 Hz pulse train, slow on/off chirping
    const osc = ac.createOscillator(); osc.frequency.value = 4600; const gate = ac.createGain(); gate.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 22; const depth = ac.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth).connect(gate.gain); osc.connect(gate); const cr = ac.createGain(); cr.gain.value = 0; gate.connect(cr).connect(out);
    osc.start(); lfo.start();
    A = { ac, out, sea, surf, hum, cr };
  }
  function caw(vol) {
    const { ac, out } = A; let at = ac.currentTime + 0.05; const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; const f = 520 + Math.random() * 120;
      o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.72, at + 0.22);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2.5;
      const g = ac.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, at + 0.26);
      o.connect(bp).connect(g).connect(out); o.start(at); o.stop(at + 0.3); at += 0.32 + Math.random() * 0.12;
    }
  }
  return {
    update(dt, city) {
      if (!game.audio || !game.audio.ready) return;
      if (!A) { try { init(); } catch (e) { return; } }
      t += dt;
      const cam = game.camera.position, now = A.ac.currentTime;
      const land = fields.sample(fields.land, cam.x, cam.z);
      const coast = Math.max(0, Math.min(1, 1 - (land - 8) / 90));
      const swell = 0.6 + 0.4 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1);
      const day = city.lightLevel, night = 1 - day;
      A.sea.gain.setTargetAtTime(0.11 * coast * swell, now, 0.3);
      A.surf.gain.setTargetAtTime(0.03 * coast * Math.max(0, swell - 0.55) * 2, now, 0.2);
      A.hum.gain.setTargetAtTime(0.05 * (0.45 + 0.55 * day) * (1 - 0.5 * coast), now, 0.5);
      A.cr.gain.setTargetAtTime(night > 0.6 ? 0.006 * (0.5 + 0.5 * Math.sin(t * 0.9)) * (1 - coast * 0.6) : 0, now, 0.4);
      nextCaw -= dt;
      if (nextCaw <= 0) { nextCaw = 5 + Math.random() * 10; if (day > 0.5) caw(0.025 * (1 - coast * 0.5)); }
    },
  };
}
