import './ui/ui.css';
import { Game } from './core/Game.js';
import { seedFromUrl } from './core/rng.js';
import { installTestApi, installFailedApi } from './core/testApi.js';

const params = new URLSearchParams(window.location.search);
const seed = seedFromUrl(window.location.search);
const test = params.get('test') === '1';
const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');

const game = new Game({ canvas, uiRoot, seed, test });
const ok = game.init();
if (!ok) {
  installFailedApi(seed);
  const panel = document.createElement('div');
  panel.id = 'webgl-error';
  panel.textContent = 'WebGL is unavailable in this browser, so Claude Theft Auto Bombay cannot start. Try enabling hardware acceleration or another browser.';
  uiRoot.appendChild(panel);
} else {
  installTestApi(game);
  game.start();
}
