/** Centre-top toasts. Timing uses setTimeout (UI only, not simulation). */
export class Toasts {
  constructor(root, bus) {
    this.el = document.createElement('div');
    this.el.id = 'toasts';
    root.appendChild(this.el);
    bus.on('ui:toast', (t) => this.show(typeof t === 'string' ? t : t.text, t.ms));
  }
  show(text, ms = 3000) {
    const d = document.createElement('div');
    d.textContent = text;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }
}
