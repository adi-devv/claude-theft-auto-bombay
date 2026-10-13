// node montage.js out.png a.png b.png c.png d.png  → 2x2 grid at 960x540 (each tile 480x270)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...files] = process.argv.slice(2);
  const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, 'shots', f)).toString('base64'));
  const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:480px 480px;background:#000">${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:480px;height:270px;display:block"><span style="position:absolute;left:4px;top:2px;color:#ff0;font:12px sans-serif">${files[i]}</span></div>`).join('')}</body>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.resolve(__dirname, 'shots', out) }); await b.close();
})();
