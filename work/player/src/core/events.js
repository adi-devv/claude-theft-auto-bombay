// Tiny event bus. See CONTRACT.md for the event catalogue.
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { let a = this.map.get(name); if (!a) this.map.set(name, (a = [])); a.push(fn); return () => this.off(name, fn); }
  off(name, fn) { const a = this.map.get(name); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(name, payload) { const a = this.map.get(name); if (a) for (const fn of a.slice()) { try { fn(payload); } catch (e) { console.error('event handler error', name, e); } } }
}
