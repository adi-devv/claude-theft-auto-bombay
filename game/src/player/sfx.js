// Tiny synthesized player sound effects (punch whoosh/thud, footsteps, body fall). All lazy & optional.
export function createPlayerSfx(game) {
  const A = game.audio;
  const ok = () => A && A.ready && !A.muted;
  function noise(dur, { freq = 800, q = 1, type = 'bandpass', gain = 0.3, attack = 0.005, sweep = 0 } = {}) {
    if (!ok()) return;
    const ctx = A.ctx, bus = A.bus('sfx'); if (!bus) return;
    const src = ctx.createBufferSource(); src.buffer = A.noiseBuffer();
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  function thump(freq = 90, dur = 0.18, gain = 0.5) {
    if (!ok()) return;
    const ctx = A.ctx, bus = A.bus('sfx'); if (!bus) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.8, t); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    swing() { noise(0.16, { freq: 1400, q: 0.8, gain: 0.12, attack: 0.04, sweep: 0.4 }); },
    hit() { thump(110, 0.16, 0.55); noise(0.08, { freq: 1800, q: 0.7, gain: 0.25 }); },
    step(run) { noise(0.06, { freq: run ? 520 : 380, q: 1.2, gain: run ? 0.05 : 0.03, type: 'bandpass' }); },
    land() { thump(70, 0.12, 0.25); noise(0.08, { freq: 500, gain: 0.07 }); },
    fall() { thump(60, 0.3, 0.6); noise(0.2, { freq: 300, gain: 0.15, type: 'lowpass' }); },
    door() { thump(160, 0.09, 0.35); noise(0.05, { freq: 2400, gain: 0.08 }); },
  };
}
