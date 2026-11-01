// node mont.js out.png a.png b.png ... [--cols=4] [--w=300] — grid montage of shots (rendered in Edge)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const [out, ...files] = args.filter((a) => !a.startsWith('--'));
  const cols = +(opt.cols || 4), w = +(opt.w || 300);
  const dir = path.join(__dirname, 'shots');
  const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'));
  const b = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chrome' });
  const p = await b.newPage({ viewport: { width: cols * w, height: 400 } });
  await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${w}px);background:#000">${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" style="width:${w}px;display:block"><span style="position:absolute;left:4px;top:2px;color:#ff0;font:12px sans-serif">${files[i].replace('.png', '')}</span></div>`).join('')}</body>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(dir, out), fullPage: true }); await b.close();
})();
