// STUB — Player/HUD agent owns this.
export function createHUD(game) {
  const el = document.getElementById('hud');
  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:12px;bottom:12px;font:14px monospace;text-shadow:0 1px 2px #000';
  el.appendChild(info);
  return {
    update() { const p = game.player; if (!p) return; info.textContent = `${game.roads.roadNameAt(p.position.x, p.position.z) || ''} ${p.vehicle ? Math.round(Math.abs(p.vehicle.speed) * 3.6) + ' km/h' : ''}`; },
    message() {}, bigText() {}, notify() {},
  };
}
