// Window-level keyboard/mouse input. Cleared on blur.
const BLOCK = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(target = window) {
    this.target = target;
    this.down = new Set();
    this.pressed = new Set(); // edges since last consume()
    this.listeners = [];
    this.drag = { active: false, dx: 0, dy: 0 };
    this.blockDefaults = () => true; // Game overrides (Tab free in menus)
    this._onKeyDown = (e) => {
      if (e.repeat) {
        if (this._shouldBlock(e)) e.preventDefault();
        return;
      }
      if (this._shouldBlock(e)) e.preventDefault();
      this.down.add(e.code);
      this.pressed.add(e.code);
      for (const fn of this.listeners) fn(e.code, e);
    };
    this._onKeyUp = (e) => {
      if (this._shouldBlock(e)) e.preventDefault();
      this.down.delete(e.code);
    };
    this._onBlur = () => {
      this.down.clear();
      this.pressed.clear();
      this.drag.active = false;
    };
    this._onMouseDown = (e) => {
      if (e.target && e.target.id === 'game') this.drag.active = true;
    };
    this._onMouseUp = () => {
      this.drag.active = false;
    };
    this._onMouseMove = (e) => {
      if (this.drag.active) {
        this.drag.dx += e.movementX || 0;
        this.drag.dy += e.movementY || 0;
      }
    };
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    target.addEventListener('mousedown', this._onMouseDown);
    target.addEventListener('mouseup', this._onMouseUp);
    target.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._onBlur();
    });
  }
  _shouldBlock(e) {
    if (!BLOCK.has(e.code)) return false;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return false;
    return this.blockDefaults(e.code);
  }
  onKey(fn) {
    this.listeners.push(fn);
  }
  isDown(...codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  wasPressed(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }
  /** Call at the end of each sim step. */
  endStep() {
    this.pressed.clear();
  }
  consumeDrag(out = { dx: 0, dy: 0 }) {
    out.dx = this.drag.dx;
    out.dy = this.drag.dy;
    this.drag.dx = 0;
    this.drag.dy = 0;
    return out;
  }
  clear() {
    this._onBlur();
  }
}

// Logical actions.
export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  use: ['KeyF', 'KeyE'],
  horn: ['KeyH'],
  radio: ['KeyQ'],
  camera: ['KeyC'],
  reset: ['KeyR'],
  taxi: ['KeyT'],
  phone: ['Tab'],
  map: ['KeyM'],
  pause: ['Escape'],
  mute: ['KeyN'],
};
