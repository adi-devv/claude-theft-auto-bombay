// Tiny event bus. Core events: vehicle:enter/exit, crime, ped:hit, vehicle:damaged,
// player:wasted/busted/respawn, money:change, mission:*, collect, horn, ui:toast, state.
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    let l = this.map.get(type);
    if (!l) this.map.set(type, (l = []));
    l.push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const l = this.map.get(type);
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  emit(type, data) {
    const l = this.map.get(type);
    if (!l) return;
    for (const fn of l.slice()) fn(data);
  }
}
