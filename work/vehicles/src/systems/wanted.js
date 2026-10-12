// STUB — Police agent owns this.
export function createWanted(game) {
  const w = { level: 0, seen: false, update() {}, setLevel(n) { w.level = n; }, clear() { w.level = 0; } };
  return w;
}
