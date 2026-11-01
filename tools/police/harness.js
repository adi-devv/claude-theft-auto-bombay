// Headless play-test harness for Claude Theft Auto: Bombay.
// Usage in a scenario script (CommonJS):
//   const H = require('./harness');
//   (async () => {
//     const g = await H.launch({ out: '/path/to/screens', width: 1280, height: 720 });
//     await g.wait(2);                         // real seconds, game runs live
//     await g.hold(['KeyW'], 3);              // hold W for 3 s
//     await g.hold(['KeyW', 'KeyA'], 1.5);    // accelerate + steer left
//     await g.tap('KeyF');                    // press once
//     console.log(await g.state());           // __game.debug.state()
//     await g.shot('after-drive');            // PNG to out dir; returns the path
//     await g.eval(() => __game.debug.teleport(-400, 100, Math.PI));
//     await g.close();                        // prints console errors
//   })();
// The server must be running: http://localhost:8765 serves the game/ folder.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.GAME_URL || 'http://localhost:8765/game/';

async function launch(opts = {}) {
  const { width = 1280, height = 720, out = path.join(__dirname, 'shots'), query = 'test=1', headless = true, timeout = 60000 } = opts;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome', headless,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(BASE + '?' + query, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__game && window.__game.player && !document.getElementById('loading'), null, { timeout });
  await page.mouse.click(width / 2, height / 2).catch(() => {}); // focus + unlock audio
  const g = {
    page, browser, logs, out,
    async wait(sec) { await page.waitForTimeout(sec * 1000); },
    async hold(keys, sec) {
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(sec * 1000);
      for (const k of keys) await page.keyboard.up(k);
    },
    async down(k) { await page.keyboard.down(k); },
    async up(k) { await page.keyboard.up(k); },
    async tap(k) { await page.keyboard.down(k); await page.waitForTimeout(80); await page.keyboard.up(k); await page.waitForTimeout(50); },
    async state() { return page.evaluate(() => window.__game.debug.state()); },
    async eval(fn, arg) { return page.evaluate(fn, arg); },
    async shot(name) { const p = path.join(out, name.replace(/[^\w.-]/g, '_') + '.png'); await page.screenshot({ path: p }); return p; },
    /** Sample state every `every` seconds for `sec` seconds while keys are held. Returns array of states. */
    async record(keys, sec, every = 0.25, pick = (s) => s) {
      const samples = [];
      for (const k of keys) await page.keyboard.down(k);
      const n = Math.round(sec / every);
      for (let i = 0; i < n; i++) { await page.waitForTimeout(every * 1000); samples.push(pick(await g.state())); }
      for (const k of keys) await page.keyboard.up(k);
      return samples;
    },
    async close() {
      const errs = await page.evaluate(() => (window.__game && window.__game.errors) || []).catch(() => []);
      if (errs.length) console.log('GAME ERRORS:\n' + errs.join('\n'));
      if (logs.length) console.log('CONSOLE:\n' + logs.slice(0, 40).join('\n'));
      await browser.close();
    },
  };
  return g;
}

module.exports = { launch, BASE };
