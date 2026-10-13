// HUD (CONTRACT.md → HUD): title screen, minimap, wanted stars, health, clock, speedometer, area/street/vehicle
// name popups, subtitles, notifications, WASTED/BUSTED big text, fade, pause overlay, big map, help hints.
// DOM + canvas inside #hud; styles injected from ./hudStyles.js.
import { HUD_CSS } from './hudStyles.js';
import { renderMap, drawBadge, POIS, MAP_COLORS } from './mapRender.js';

export const VEHICLE_NAMES = {
  taxi: 'Premier Padmini Taxi', sedan: 'Hindustan Ambassador', hatch: 'Maruti 800', suv: 'Mahindra Scorpio',
  bus: 'BEST Double-Decker', police: 'Mumbai Police Scorpio', van: 'Maruti Omni',
};

const CONTROLS = [
  [['W', 'A', 'S', 'D'], 'Walk / drive'], [['Shift'], 'Sprint'], [['Space'], 'Jump / handbrake'], [['F'], 'Enter / exit / jack car'],
  [['J', 'Click'], 'Punch'], [['Mouse', 'Q', 'E'], 'Look around'], [['H'], 'Horn'], [['C'], 'Camera mode'],
  [['L'], 'Siren (police car)'], [['R'], 'Reset stuck car'], [['M'], 'Map'], [['T'], 'Time of day'], [['P', 'Esc'], 'Pause'],
];

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const keys = (arr) => arr.map((k) => `<span class="cta-key">${k}</span>`).join('');
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const now = () => performance.now() / 1000;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createHUD(game) {
  if (!document.getElementById('cta-hud-css')) { const s = document.createElement('style'); s.id = 'cta-hud-css'; s.textContent = HUD_CSS; document.head.appendChild(s); }
  const host = document.getElementById('hud');
  const root = el('div', 'cta-root', host);
  const gameUI = el('div', 'cta-game', root);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  el('div', null, root, `<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="ctaStarGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff2b0"/><stop offset="0.5" stop-color="#ffc23f"/><stop offset="1" stop-color="#e07a10"/></linearGradient></defs></svg>`);

  // ---------- top-right ----------
  const tr = el('div', 'cta-tr cta-shadow', gameUI);
  const clockEl = el('div', 'cta-clock', tr);
  const starsEl = el('div', 'cta-stars', tr);
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>';
  const stars = [];
  for (let i = 0; i < 5; i++) stars.push(el('div', 'cta-star', starsEl, STAR));
  stars.reverse(); // filled from the right, like GTA
  const healthRow = el('div', 'cta-health', tr, `<svg class="ico" viewBox="0 0 16 16"><path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z" fill="#ff5f6d" stroke="#2a0008" stroke-width="1"/></svg>`);
  const hbar = el('div', 'cta-bar', healthRow); const hlag = el('b', null, hbar); const hfill = el('i', null, hbar);
  const stamRow = el('div', 'cta-health cta-stam', tr);
  const sbar = el('div', 'cta-bar stamina', stamRow); const sfill = el('i', null, sbar);

  // ---------- minimap ----------
  const mini = el('div', 'cta-mini', gameUI);
  const MS = 212;
  const mc = el('canvas', null, mini); mc.width = MS * dpr; mc.height = MS * dpr;
  el('div', 'ring', mini);
  const northEl = el('div', 'north', mini, 'N');
  const mg = mc.getContext('2d');
  let map = null;
  const ensureMap = () => { if (!map) map = renderMap(game, 1.6); return map; };

  // ---------- bottom-right ----------
  const br = el('div', 'cta-br', gameUI);
  const names = el('div', 'cta-names', br);
  const vehEl = el('div', 'cta-vehname', names);
  const areaEl = el('div', 'cta-area', names);
  const streetEl = el('div', 'cta-street cta-shadow', names);
  const speedo = el('div', 'cta-speedo', br);
  const sc = el('canvas', null, speedo); sc.width = 188 * dpr; sc.height = 188 * dpr;
  const sg = sc.getContext('2d');

  // ---------- centre / top-left ----------
  const prompt = el('div', 'cta-prompt cta-shadow', gameUI);
  const sub = el('div', 'cta-sub cta-shadow', gameUI);
  const tl = el('div', 'cta-tl', gameUI);
  const help = el('div', 'cta-help', tl);
  const toasts = el('div', null, tl); toasts.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  const dmg = el('div', 'cta-dmg', root);
  const big = el('div', 'cta-big', root); const bigSpan = el('span', null, big);
  const fade = el('div', 'cta-fade', root);

  // ---------- title ----------
  const ctrlGrid = `<div class="cta-controls">${CONTROLS.map(([k, d]) => `<div>${keys(k)}<span>${d}</span></div>`).join('')}</div>`;
  const title = el('div', 'cta-title gone', root, `
    <div class="cta-credit">A Claude production<br/>South Bombay · Dusk</div>
    <div class="cta-logo">
      <div class="cta-sun"></div>
      <div class="l1">CLAUDE</div>
      <div class="l2">THEFT AUTO</div>
      <div class="cta-deco"><i></i><b></b><i></i></div>
      <div class="l3">BOMBAY</div>
      <div class="sub">Marine Drive <em>•</em> Fort</div>
    </div>
    <div class="cta-press">PRESS <span class="cta-key">ENTER</span> TO START</div>${ctrlGrid}`);
  title.addEventListener('mousedown', (e) => { e.stopPropagation(); start(); });
  const logo = title.querySelector('.cta-logo');
  const fitTitle = () => { logo.style.transform = `scale(${Math.min(1.15, window.innerHeight / 860, window.innerWidth / 1300).toFixed(3)})`; };
  fitTitle(); window.addEventListener('resize', fitTitle);

  // ---------- pause ----------
  const pause = el('div', 'cta-overlay', root, `<div class="cta-card"><h2>PAUSED</h2><div class="where"></div>${ctrlGrid}
    <div class="resume">PRESS <span class="cta-key">P</span> OR CLICK TO RESUME</div></div>`);
  const whereEl = pause.querySelector('.where');
  pause.addEventListener('mousedown', () => setPaused(false, true));

  // ---------- big map ----------
  const bigmap = el('div', 'cta-overlay cta-bigmap', root, `<div class="hdr">SOUTH BOMBAY <small>Marine Drive · Fort · Colaba</small></div>`);
  const bmc = el('canvas', null, bigmap);
  el('div', 'foot', bigmap, `<span><i class="dot" style="background:#fff;box-shadow:0 0 0 2px #ff2e88"></i>You</span>
    <span><i class="dot" style="background:#ff3b4a"></i>Police</span><span><i class="dot" style="background:#ffcf6b"></i>Queen's Necklace</span>
    <span><span class="cta-key">M</span> close</span>`);
  bigmap.addEventListener('mousedown', () => toggleBigMap(false));
  const bmg = bmc.getContext('2d');

  // ---------- state ----------
  let subT = 0, areaT = 0, streetT = 0, vehT = 0, helpT = 0, lastArea = null, lastStreet = null;
  let lastHealth = 100, lagHealth = 100, dmgT = 0, pausedByUs = false, bigOpen = false, lockedOnce = false;
  const helpQueue = [], helpShown = new Set();
  let starPop = 0, prevWanted = 0, miniZoom = 1.0, miniAcc = 1;

  const hud = {
    update, message, notify, bigText, showTitle, fadeTo, help: showHelp,
    get titleVisible() { return !title.classList.contains('gone'); },
    get paused() { return pausedByUs; }, get bigMapOpen() { return bigOpen; },
    toggleBigMap, setPaused, start, map: () => ensureMap(),
  };

  function message(text, secs = 3) {
    if (!text) { sub.classList.remove('show'); subT = 0; return; }
    sub.textContent = text; sub.classList.add('show'); subT = now() + secs;
  }
  function notify(text, opts = {}) {
    if (!text) return;
    const raw = String(text);
    const radio = opts.kind === 'radio' || /^(\[?radio\]?|control|dispatch|unit|police)\b/i.test(raw);
    const body = raw.replace(/^\[radio\]\s*/i, '');
    const m = /^([^:]{1,28}):\s*(.*)$/.exec(body);
    const t = el('div', 'cta-toast' + (radio ? ' radio' : ''), toasts);
    t.innerHTML = (radio ? '<span class="tag">RADIO</span>' : '') + (m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(body));
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 520); }, (opts.secs || 5.5) * 1000);
  }
  function bigText(text, style = 'mission') {
    if (!text) { big.classList.remove('show'); return; }
    big.className = 'cta-big ' + (style || 'mission');
    bigSpan.textContent = text;
    void big.offsetWidth; // restart the zoom-in transition
    big.classList.add('show');
  }
  function fadeTo(alpha, secs = 0.5) { fade.style.transitionDuration = secs + 's'; fade.style.opacity = String(alpha); }
  function showTitle() {
    game.started = false;
    title.classList.remove('gone');
    root.classList.add('cta-hidden');
    try { game.city?.setTimeOfDay?.(18.7); } catch (_) { /* city optional */ }
  }
  function start() {
    if (title.classList.contains('gone')) return;
    title.classList.add('gone');
    root.classList.remove('cta-hidden');
    game.started = true;
    try { game.audio?.ensure?.(); game.audio?.ctx?.resume?.(); } catch (_) { /* */ }
    queueIntroHelp();
  }
  function showHelp(html, secs = 6) { helpQueue.push({ html, secs }); }
  function helpOnce(key, html, secs) { if (helpShown.has(key)) return; helpShown.add(key); showHelp(html, secs); }
  function queueIntroHelp() {
    helpOnce('move', `${keys(['W', 'A', 'S', 'D'])} move, hold ${keys(['Shift'])} to sprint, ${keys(['Space'])} jump. Click to capture the mouse and look around, or use ${keys(['Q'])}${keys(['E'])}.`, 7);
    helpOnce('car', `Walk up to any car and press ${keys(['F'])} to get in. If somebody's driving it… they won't be for long.`, 6);
    helpOnce('map', `${keys(['J'])} or click to punch. ${keys(['M'])} opens the map, ${keys(['P'])} pauses. Welcome to Bombay.`, 5);
  }
  function setPaused(on, relock = false) {
    if (on === pausedByUs) return;
    pausedByUs = on;
    game.paused = on || bigOpen;
    pause.classList.toggle('show', on);
    if (on) {
      const p = game.player;
      if (p) { const r = game.roads.roadNameAt(p.position.x, p.position.z); whereEl.textContent = (r ? r + ' · ' : '') + game.roads.areaNameAt(p.position.x, p.position.z); }
      if (document.pointerLockElement) document.exitPointerLock?.();
    } else if (relock) {
      try { const r = game.renderer.domElement.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* */ }
    }
  }
  function toggleBigMap(on = !bigOpen) {
    if (!game.started) return;
    bigOpen = on;
    bigmap.classList.toggle('show', on);
    game.paused = on || pausedByUs;
    if (on) { if (document.pointerLockElement) document.exitPointerLock?.(); drawBigMap(); }
  }

  // Own key listeners: menus must work while the sim is paused (input edges are not polled then).
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (!title.classList.contains('gone')) { if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') start(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (bigOpen) toggleBigMap(false); else setPaused(!pausedByUs, true); return; }
    if (e.code === 'KeyM' && !pausedByUs) toggleBigMap();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { lockedOnce = true; return; }
    // losing pointer lock mid-game (Esc) pauses, like most PC games
    if (lockedOnce && game.started && !pausedByUs && !bigOpen && game.player?.state === 'normal') setPaused(true);
  });

  game.events.on('playerEnteredVehicle', ({ vehicle }) => {
    const n = vehicle?.displayName || VEHICLE_NAMES[vehicle?.type] || (vehicle?.type ? vehicle.type[0].toUpperCase() + vehicle.type.slice(1) : 'Vehicle');
    vehEl.textContent = n; vehEl.classList.add('show'); vehT = now() + 3.5;
    helpOnce('drive', `${keys(['W'])} accelerate, ${keys(['S'])} brake / reverse, ${keys(['A'])}${keys(['D'])} steer, ${keys(['Space'])} handbrake, ${keys(['H'])} horn, ${keys(['C'])} camera. ${keys(['F'])} gets out — even at speed.`, 7);
    if (vehicle?.isPolice) helpOnce('siren', `A police car! ${keys(['L'])} toggles the siren.`, 5);
  });
  game.events.on('respawn', () => { bigText(null); lastHealth = lagHealth = 100; });

  // ---------- per-frame ----------
  function update(dt) {
    const t = now();
    const p = game.player;
    if (!game.started) { if (title.classList.contains('gone')) showTitle(); return; }
    if (!title.classList.contains('gone')) { title.classList.add('gone'); root.classList.remove('cta-hidden'); }
    if (!p) return;
    const px = p.position.x, pz = p.position.z;

    // clock
    const tod = game.city?.timeOfDay;
    if (typeof tod === 'number') {
      const h = ((tod % 24) + 24) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      const txt = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (clockEl.textContent !== txt) clockEl.textContent = txt;
      clockEl.style.display = '';
    } else clockEl.style.display = 'none';

    // wanted stars
    const w = game.wanted, lvl = (w?.level | 0);
    if (lvl > prevWanted) {
      starPop = t + 0.35;
      helpOnce('wanted', 'The police are after you! Break line of sight and get out of the flashing search area on the minimap to lose them.', 7);
    }
    prevWanted = lvl;
    for (let i = 0; i < 5; i++) { stars[i].classList.toggle('on', i < lvl); stars[i].classList.toggle('pop', t < starPop && i === lvl - 1); }
    starsEl.classList.toggle('flash', !!w?.flashing);
    starsEl.style.opacity = lvl > 0 ? '1' : '0.5';

    // health / stamina
    const maxH = p.maxHealth || 100, hp = clamp(p.health / maxH, 0, 1);
    if (p.health < lastHealth - 0.5) { dmg.classList.add('hit'); dmgT = t + 0.12; }
    if (dmgT && t > dmgT) { dmg.classList.remove('hit'); dmgT = 0; }
    dmg.classList.toggle('low', hp < 0.25 && p.state === 'normal');
    lastHealth = p.health;
    hfill.style.width = (hp * 100).toFixed(1) + '%';
    lagHealth = Math.max(p.health, lagHealth - (dt || 0.016) * 30);
    hlag.style.width = (clamp(lagHealth / maxH, 0, 1) * 100).toFixed(1) + '%';
    hbar.classList.toggle('low', hp < 0.25);
    const st = p.stamina ?? 1;
    sfill.style.width = (st * 100).toFixed(1) + '%';
    stamRow.style.opacity = st < 0.99 && p.mode === 'foot' ? '1' : '0';

    // area / street popups
    const area = game.roads.areaNameAt(px, pz), street = game.roads.roadNameAt(px, pz);
    if (area !== lastArea) { areaEl.textContent = area; areaEl.classList.add('show'); areaT = t + 4.5; lastArea = area; }
    if (street !== lastStreet) { if (street) { streetEl.textContent = street; streetEl.classList.add('show'); streetT = t + 3.5; } else { streetEl.classList.remove('show'); streetT = 0; } lastStreet = street; }
    if (areaT && t > areaT) { areaEl.classList.remove('show'); areaT = 0; }
    if (streetT && t > streetT) { streetEl.classList.remove('show'); streetT = 0; }
    if (vehT && t > vehT) { vehEl.classList.remove('show'); vehT = 0; }
    if (subT && t > subT) { sub.classList.remove('show'); subT = 0; }

    // help box queue
    if (helpT && t > helpT) { help.classList.remove('show'); helpT = 0; }
    if (!helpT && helpQueue.length && !help.classList.contains('show')) {
      const h = helpQueue.shift(); help.innerHTML = h.html; help.classList.add('show'); helpT = t + h.secs + 0.6;
    }

    // contextual prompt
    const near = p.mode === 'foot' && p.state === 'normal' && p.action === 'none' ? p.nearVehicle : null;
    if (near) {
      const jack = near.driver && typeof near.driver === 'object';
      const html = `${keys(['F'])}<span>${jack ? 'Jack' : 'Enter'} ${VEHICLE_NAMES[near.type] || 'vehicle'}</span>`;
      if (prompt.innerHTML !== html) prompt.innerHTML = html;
    }
    prompt.classList.toggle('show', !!near);

    // speedometer
    const v = p.mode === 'vehicle' ? p.vehicle : null;
    speedo.classList.toggle('show', !!v);
    if (v) drawSpeedo(v);

    drawMinimap(t, dt);
    if (bigOpen) drawBigMap();
  }

  // ---------- minimap ----------
  function camYaw() {
    const e = game.camera.matrixWorld.elements; // camera looks along its local -Z
    return Math.atan2(-e[8], -e[10]);
  }
  function drawMinimap(t, dt) {
    const M = ensureMap();
    const p = game.player, g = mg, R = MS / 2;
    const sp = p.vehicle ? Math.abs(p.vehicle.speed || 0) : 0;
    const targetZoom = p.vehicle ? clamp(0.9 - sp * 0.014, 0.45, 0.9) : 1.15;
    miniZoom += (targetZoom - miniZoom) * (1 - Math.exp(-2 * (dt || 0.016)));
    const k = miniZoom; // CSS px per metre
    const yaw = camYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const px = p.position.x, pz = p.position.z;
    // world -> minimap px: sx = R + k(-cy·dx + sy·dz), sy = R + k(-sy·dx - cy·dz)   (camera forward = up)
    const W2S = (x, z) => { const dx = x - px, dz = z - pz; return [R + k * (-cy * dx + sy * dz), R + k * (-sy * dx - cy * dz)]; };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, MS, MS);
    g.save();
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = MAP_COLORS.sea0; g.fillRect(0, 0, MS, MS);
    const a = -k * cy / M.S, b = -k * sy / M.S, c = k * sy / M.S, d = -k * cy / M.S;
    const ex = R + k * (-cy * (M.minX - px) + sy * (M.minZ - pz)), ey = R + k * (-sy * (M.minX - px) - cy * (M.minZ - pz));
    g.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, ex * dpr, ey * dpr);
    g.imageSmoothingEnabled = true;
    g.drawImage(M.canvas, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // wanted search area
    const w = game.wanted;
    if (w && w.level > 0 && w.lastKnown && (w.flashing || !w.seen)) {
      const rr = (w.searchRadius || 60) * k;
      const [sx, syy] = W2S(w.lastKnown.x, w.lastKnown.z);
      const ph = Math.floor(t * 2.5) % 2;
      g.beginPath(); g.arc(sx, syy, rr, 0, 7);
      g.fillStyle = ph ? 'rgba(255,40,70,0.18)' : 'rgba(60,120,255,0.18)'; g.fill();
      g.strokeStyle = ph ? 'rgba(255,60,80,0.75)' : 'rgba(80,140,255,0.75)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
    }

    // POIs
    for (const poi of POIS) {
      let [sx, syy] = W2S(poi.x, poi.z);
      const dx = sx - R, dy = syy - R, dd = Math.hypot(dx, dy);
      if (dd > R - 10) { if (!poi.edge) continue; sx = R + dx / dd * (R - 10); syy = R + dy / dd * (R - 10); }
      drawBadge(g, sx, syy, 7, poi);
    }

    // police: cars (flashing, clamped to the rim) and foot cops
    const flash = Math.floor(t * 6) % 2;
    for (const v of game.vehicles) {
      if (!v.isPolice || v === p.vehicle || v.wrecked) continue;
      if (!(v.ai || v.sirenOn || (v.driver && v.driver !== 'player'))) continue;
      let [sx, syy] = W2S(v.position.x, v.position.z);
      const dx = sx - R, dy = syy - R, dd = Math.hypot(dx, dy);
      const edge = dd > R - 7; if (edge) { sx = R + dx / dd * (R - 7); syy = R + dy / dd * (R - 7); }
      g.beginPath(); g.arc(sx, syy, edge ? 4.5 : 5.5, 0, 7);
      g.fillStyle = flash ? '#ff3b4a' : '#3d7bff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#0a0610'; g.stroke();
    }
    for (const ped of game.peds || []) {
      if (!ped.isCop || ped.state === 'dead') continue;
      const [sx, syy] = W2S(ped.position.x, ped.position.z);
      if (Math.hypot(sx - R, syy - R) > R - 4) continue;
      g.beginPath(); g.arc(sx, syy, 2.6, 0, 7); g.fillStyle = flash ? '#ff6b78' : '#6c9bff'; g.fill();
    }

    // player arrow, rotated relative to the camera
    g.save(); g.translate(R, R); g.rotate(yaw - p.heading);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fillStyle = '#fff'; g.strokeStyle = '#ff2e88'; g.lineWidth = 2; g.lineJoin = 'round';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 4; g.fill(); g.shadowBlur = 0; g.stroke();
    g.restore();
    const rg = g.createRadialGradient(R, R, R * 0.7, R, R, R); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = rg; g.fillRect(0, 0, MS, MS);
    g.restore();

    // north marker: world -Z on the ring
    northEl.style.left = (R - sy * (R + 1)).toFixed(1) + 'px'; northEl.style.top = (R + cy * (R + 1)).toFixed(1) + 'px';
  }

  // ---------- speedometer ----------
  function drawSpeedo(v) {
    const g = sg, S = 188, c = S / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    const spd = (v.speed || 0) * 3.6, kmh = Math.abs(spd), MAX = 180;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = (x) => a0 + (a1 - a0) * clamp(x / MAX, 0, 1);
    g.beginPath(); g.arc(c, c, 84, 0, 7); g.fillStyle = 'rgba(14,8,20,0.78)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,211,107,0.35)'; g.stroke();
    g.lineCap = 'round';
    g.beginPath(); g.arc(c, c, 72, a0, a1); g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.08)'; g.stroke();
    const grad = g.createLinearGradient(0, S, S, 0); grad.addColorStop(0, '#ffd36b'); grad.addColorStop(0.6, '#ff8a3d'); grad.addColorStop(1, '#ff2e88');
    if (kmh > 0.5) { g.beginPath(); g.arc(c, c, 72, a0, ang(kmh)); g.strokeStyle = grad; g.stroke(); }
    g.lineCap = 'butt';
    g.font = '600 11px "Avenir Next Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let s = 0; s <= MAX; s += 10) {
      const a = ang(s), major = s % 20 === 0, r0 = major ? 58 : 62;
      g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * 66, c + Math.sin(a) * 66);
      g.lineWidth = major ? 2 : 1; g.strokeStyle = s >= 140 ? '#ff5f6d' : 'rgba(255,243,223,0.75)'; g.stroke();
      if (s % 40 === 0) { g.fillStyle = 'rgba(255,243,223,0.7)'; g.fillText(String(s), c + Math.cos(a) * 47, c + Math.sin(a) * 47); }
    }
    const a = ang(kmh);
    g.save(); g.translate(c, c); g.rotate(a);
    g.beginPath(); g.moveTo(-10, -2.5); g.lineTo(64, 0); g.lineTo(-10, 2.5); g.closePath();
    g.fillStyle = '#ff2e88'; g.shadowColor = 'rgba(255,46,136,0.7)'; g.shadowBlur = 8; g.fill();
    g.restore();
    g.beginPath(); g.arc(c, c, 7, 0, 7); g.fillStyle = '#1a0f1f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ff2e88'; g.stroke();
    g.fillStyle = '#fff3df'; g.font = '700 34px "Avenir Next Condensed", "DIN Condensed", "Arial Narrow", sans-serif';
    g.fillText(String(Math.round(kmh)), c, c + 36);
    g.fillStyle = 'rgba(255,211,107,0.85)'; g.font = '700 10px Futura, "Avenir Next", sans-serif'; g.fillText('KM/H', c, c + 57);
    // gear + rpm: prefer the vehicle's own gearbox, fall back to a fake one
    let gear = v.gear, rpm = typeof v.rpm === 'number' ? v.rpm : null;
    if (gear === undefined) { const gs = [0, 18, 35, 55, 80, 110]; gear = 1; for (let i = 0; i < gs.length; i++) if (kmh >= gs[i]) gear = i + 1; if (spd < -1) gear = 'R'; }
    const gtxt = gear === 'R' || spd < -1 ? 'R' : kmh < 1 && !(v.controls?.throttle > 0) ? 'N' : String(gear);
    g.fillStyle = gtxt === 'R' ? '#ff5f6d' : '#9ce7ff'; g.font = '800 15px Futura, "Avenir Next", sans-serif'; g.fillText(gtxt, c, c - 26);
    const rf = rpm == null ? clamp(0.15 + kmh / 200, 0.15, 1) : clamp(rpm > 50 ? rpm / 6500 : rpm, 0, 1);
    g.beginPath(); g.arc(c, c, 80, Math.PI * 1.25, Math.PI * 1.25 + Math.PI * 0.5 * rf); g.lineWidth = 3; g.strokeStyle = rf > 0.9 ? '#ff3b4a' : 'rgba(156,231,255,0.8)'; g.stroke();
    if (v.isPolice && v.sirenOn) { g.fillStyle = Math.floor(now() * 6) % 2 ? '#ff3b4a' : '#3d7bff'; g.beginPath(); g.arc(c, c - 46, 4, 0, 7); g.fill(); }
  }

  // ---------- big map ----------
  function drawBigMap() {
    const M = ensureMap();
    const vw = window.innerWidth, vh = window.innerHeight;
    const B = game.roads.bounds, m = 70;
    const x0 = B.minX - m, z0 = B.minZ - m, wm = B.maxX - B.minX + 2 * m, hm = B.maxZ - B.minZ + 2 * m;
    const scale = Math.min((vw * 0.92) / wm, (vh * 0.8) / hm); // CSS px per metre
    const cw = Math.round(wm * scale), ch = Math.round(hm * scale);
    if (bmc.width !== Math.round(cw * dpr)) { bmc.width = Math.round(cw * dpr); bmc.height = Math.round(ch * dpr); bmc.style.width = cw + 'px'; bmc.style.height = ch + 'px'; }
    const g = bmg;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(M.canvas, (x0 - M.minX) * M.S, (z0 - M.minZ) * M.S, wm * M.S, hm * M.S, 0, 0, cw, ch);
    const P = (x, z) => [(x - x0) * scale, (z - z0) * scale];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const areas = [['MARINE DRIVE', -585, -230], ['NARIMAN POINT', -330, 505], ['CHURCHGATE', -275, 0], ['AZAD MAIDAN', 25, -200],
      ['FORT', 185, -90], ['KALA GHODA', 150, 205], ['COLABA', 215, 520], ['APOLLO BUNDER', 330, 300], ['BACK BAY', -560, 220], ['HARBOUR', 450, -300]];
    g.font = `italic 700 ${Math.round(clamp(scale * 30, 12, 22))}px Didot, "Bodoni 72", Georgia, serif`;
    for (const [n, x, z] of areas) {
      const [sx, sy] = P(x, z);
      g.fillStyle = /BAY|HARBOUR/.test(n) ? 'rgba(150,210,240,0.55)' : 'rgba(255,243,223,0.45)';
      g.fillText(n, sx, sy);
    }
    g.font = `600 ${Math.round(clamp(scale * 14, 8, 11))}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    for (const r of game.roads.roads) {
      if (r.cum[r.cum.length - 1] < 300) continue;
      const i = Math.floor(r.pts.length * 0.42), a = r.pts[i], b = r.pts[Math.min(r.pts.length - 1, i + 2)];
      let an = Math.atan2(b.z - a.z, b.x - a.x); if (an > Math.PI / 2) an -= Math.PI; if (an < -Math.PI / 2) an += Math.PI;
      const [sx, sy] = P(a.x, a.z);
      g.save(); g.translate(sx, sy); g.rotate(an);
      g.lineWidth = 3; g.strokeStyle = 'rgba(14,8,20,0.85)'; g.strokeText(r.name, 0, 0); g.fillStyle = '#fff3df'; g.fillText(r.name, 0, 0);
      g.restore();
    }
    g.font = '700 11px "Avenir Next", system-ui, sans-serif'; g.textAlign = 'left';
    for (const poi of POIS) {
      const [sx, sy] = P(poi.x, poi.z);
      drawBadge(g, sx, sy, 8, poi);
      const right = sx > cw - 150, lx = right ? sx - 12 : sx + 12;
      g.textAlign = right ? 'right' : 'left';
      g.lineWidth = 3; g.strokeStyle = 'rgba(14,8,20,0.9)'; g.strokeText(poi.name, lx, sy); g.fillStyle = '#ffd36b'; g.fillText(poi.name, lx, sy);
    }
    const t = now(), flash = Math.floor(t * 5) % 2;
    for (const v of game.vehicles) {
      if (!v.isPolice || v.wrecked || v === game.player?.vehicle || !(v.ai || v.sirenOn)) continue;
      const [sx, sy] = P(v.position.x, v.position.z);
      g.beginPath(); g.arc(sx, sy, 5, 0, 7); g.fillStyle = flash ? '#ff3b4a' : '#3d7bff'; g.fill();
    }
    const p = game.player;
    if (p) {
      const [sx, sy] = P(p.position.x, p.position.z), ph = (t * 1.5) % 1;
      g.beginPath(); g.arc(sx, sy, 10 + 8 * ph, 0, 7); g.strokeStyle = `rgba(255,46,136,${1 - ph})`; g.lineWidth = 2; g.stroke();
      g.save(); g.translate(sx, sy); g.rotate(Math.PI - p.heading);
      g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
      g.fillStyle = '#fff'; g.strokeStyle = '#ff2e88'; g.lineWidth = 2; g.fill(); g.stroke(); g.restore();
    }
    g.font = '800 14px Futura, sans-serif'; g.fillStyle = '#ffd36b'; g.textAlign = 'center'; g.fillText('N ▲', cw - 34, 22);
  }

  if (!game.started) showTitle();
  else queueIntroHelp();
  return hud;
}
