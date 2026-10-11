// Title and pause menus (keyboard reachable: Tab/arrows move focus, Enter/Space activate).
import { CONFIG } from '../core/config.js';

const CONTROLS = [
  ['WASD / arrows', 'Move / drive'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake'],
  ['F / E', 'Enter / exit vehicle'],
  ['H', 'Horn'],
  ['Q', 'Radio'],
  ['C', 'Camera preset'],
  ['R', 'Reset vehicle'],
  ['T', 'Taxi job'],
  ['Tab', 'Phone'],
  ['M', 'Full map'],
  ['Esc', 'Pause'],
  ['N', 'Mute'],
  ['Mouse drag', 'Orbit camera'],
];

function controlsTable() {
  const half = Math.ceil(CONTROLS.length / 2);
  const mk = (rows) =>
    `<table class="controls">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  return `<div class="cols">${mk(CONTROLS.slice(0, half))}${mk(CONTROLS.slice(half))}</div>`;
}

export class Menus {
  constructor(root, game) {
    this.game = game;
    this.title = document.createElement('div');
    this.title.className = 'overlay';
    this.title.id = 'title';
    this.title.innerHTML = `
      <h1>${CONFIG.title}</h1>
      <h2>A low-poly taxi hustle through South Mumbai</h2>
      ${controlsTable()}
      <div class="row">
        <button id="btn-continue" class="secondary hidden">Continue</button>
        <button id="btn-new">New Game</button>
      </div>
      <div class="hint">Press <b>Enter</b> to start</div>`;
    this.pause = document.createElement('div');
    this.pause.className = 'overlay hidden';
    this.pause.id = 'pause';
    this.pause.innerHTML = `
      <h1>Paused</h1>
      <div class="row">
        <button id="btn-resume">Resume</button>
        <button id="btn-controls" class="secondary">Controls</button>
        <button id="btn-quit" class="secondary">Quit to Title</button>
      </div>
      <div id="pause-controls" class="hidden">${controlsTable()}</div>
      <div class="hint">Esc to resume</div>`;
    root.append(this.title, this.pause);
    const q = (id) => root.querySelector(id);
    q('#btn-new').addEventListener('click', () => game.startNewGame());
    q('#btn-continue').addEventListener('click', () => game.startNewGame());
    q('#btn-resume').addEventListener('click', () => game.resume());
    q('#btn-quit').addEventListener('click', () => game.quitToTitle());
    q('#btn-controls').addEventListener('click', () => q('#pause-controls').classList.toggle('hidden'));
    this.btnContinue = q('#btn-continue');
    // arrow-key focus navigation inside overlays
    for (const ov of [this.title, this.pause]) {
      ov.addEventListener('keydown', (e) => {
        if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight' && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
        const btns = [...ov.querySelectorAll('button:not(.hidden)')];
        const i = btns.indexOf(document.activeElement);
        const d = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
        btns[(i + d + btns.length) % btns.length]?.focus();
      });
    }
  }
  setState(state) {
    this.title.classList.toggle('hidden', state !== 'title');
    this.pause.classList.toggle('hidden', state !== 'paused');
    if (state === 'title') this.title.querySelector('#btn-new').focus({ preventScroll: true });
    if (state === 'paused') this.pause.querySelector('#btn-resume').focus({ preventScroll: true });
    if (state === 'playing' && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
}
