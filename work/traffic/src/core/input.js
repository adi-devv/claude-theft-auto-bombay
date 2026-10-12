// Keyboard / mouse input. Systems read it during the fixed-step update.
//   input.down('KeyW')        -> held right now
//   input.pressed('KeyF')     -> true ONCE per physical press (consumed on read, so each key should have one owner)
//   input.axis('KeyD','KeyA') -> -1..1
//   input.mouse.dx/dy         -> accumulated pointer-lock movement since last consumeMouse()
export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.edges = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, locked: false, clicked: false };
    this.enabled = true;
    target.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    target.addEventListener('blur', () => { this.keys.clear(); });
    target.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    target.addEventListener('mousedown', (e) => { this.mouse.buttons |= 1 << e.button; this.mouse.clicked = true; });
    target.addEventListener('mouseup', (e) => { this.mouse.buttons &= ~(1 << e.button); });
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = !!document.pointerLockElement; });
  }
  down(code) { return this.enabled && this.keys.has(code); }
  any(...codes) { return codes.some((c) => this.down(c)); }
  pressed(code) { if (this.enabled && this.edges.has(code)) { this.edges.delete(code); return true; } return false; }
  axis(pos, neg) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  consumeMouse() { const m = { dx: this.mouse.dx, dy: this.mouse.dy }; this.mouse.dx = 0; this.mouse.dy = 0; return m; }
  /** Called once per rendered frame by main.js; stale edges older than a frame are dropped. */
  endFrame() { this.edges.clear(); this.mouse.clicked = false; }
  /** Test hook: simulate key state without DOM events. */
  setKey(code, isDown) { if (isDown) { if (!this.keys.has(code)) this.edges.add(code); this.keys.add(code); } else this.keys.delete(code); }
}
