// Shared WebAudio context. Systems create their own nodes and connect them to audio.bus(name).
// The context is created lazily and resumed on the first user gesture (browsers block autoplay).
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.buses = {}; this.muted = false;
    const unlock = () => { this.ensure(); if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); };
    window.addEventListener('keydown', unlock); window.addEventListener('mousedown', unlock);
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    return this.ctx;
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  /** Named mix bus: 'sfx', 'engine', 'ambient', 'siren', 'ui'. */
  bus(name) {
    if (!this.ensure()) return null;
    if (!this.buses[name]) { const g = this.ctx.createGain(); g.gain.value = 1; g.connect(this.master); this.buses[name] = g; }
    return this.buses[name];
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  /** Simple noise buffer helper (1 s white noise), cached. */
  noiseBuffer() {
    if (!this.ensure()) return null;
    if (!this._noise) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this._noise = b; }
    return this._noise;
  }
}
