// Deterministic RNG (mulberry32). Never use Math.random in simulation.
export class RNG {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.s = this.seed;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Independent child stream so subsystems don't perturb each other. */
  fork(salt = 0) {
    return new RNG((this.seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  }
}

export function mulberry32(seed) {
  const r = new RNG(seed);
  return () => r.next();
}

export function seedFromUrl(search = '') {
  const p = new URLSearchParams(search);
  const v = parseInt(p.get('seed') ?? '', 10);
  return Number.isFinite(v) ? v >>> 0 : 1337;
}
