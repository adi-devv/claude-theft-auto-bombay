const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('console', (m) => console.log('[' + m.type() + ']', m.text().slice(0, 600)));
  p.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.slice(0, 500)));
  await p.goto((process.env.GAME_URL || 'http://localhost:8765/work/city/') + '?test=1');
  await p.waitForTimeout(Number(process.argv[2] || 15000));
  console.log(await p.evaluate(() => JSON.stringify({ errs: window.__game?.errors, loading: document.querySelector('#loading')?.textContent })));
  await b.close();
})();
