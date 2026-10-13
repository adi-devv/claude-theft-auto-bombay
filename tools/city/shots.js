// City screenshots from named viewpoints. Usage:
//   GAME_URL=http://localhost:8765/work/city/ node tools/city/shots.js "view1,view2" [hour] [suffix]
const H = require('../harness');
const path = require('path');

const VIEWS = {
  gateway_plaza: { p: [350, 3, 395], t: [398, 12, 390] },
  cst_far: { p: [70, 30, -330], t: [198, 25, -440] },
  horniman_air: { p: [180, 60, 20], t: [250, 0, 105] },
  kalaghoda2: { p: [60, 3, 210], t: [90, 3, 240] },
  md_street: { p: [-388, 1.7, 150], t: [-412, 4, -40] },
  md_prom: { p: [-420, 1.8, 90], t: [-470, 2, -120] },
  md_prom_s: { p: [-430, 1.8, -60], t: [-410, 3, 250] },
  md_car: { p: [-400, 3.2, 200], t: [-404, 2.2, 150] },
  np_necklace: { p: [-445, 22, 470], t: [-470, 0, 0] },
  aerial_necklace: { p: [-760, 160, 380], t: [-420, 0, -80] },
  aerial_md: { p: [-560, 90, 140], t: [-330, 0, 40] },
  malabar: { p: [-470, 3, 300], t: [-1100, 30, -700] },
  deco_row: { p: [-370, 1.7, 30], t: [-372, 8, 120] },
  churchgate: { p: [-245, 1.7, 75], t: [-275, 8, 55] },
  oval: { p: [-175, 1.7, 300], t: [-66, 45, 262] },
  oval_deco: { p: [-140, 1.7, 220], t: [-240, 10, 220] },
  fort_dn: { p: [80, 1.7, -60], t: [100, 6, -200] },
  fort_vn: { p: [130, 1.7, 75], t: [240, 6, 100] },
  flora: { p: [18, 4, 65], t: [60, 6, 55] },
  horniman: { p: [238, 2, 112], t: [320, 10, 100] },
  townhall: { p: [270, 3, 105], t: [325, 10, 105] },
  gateway: { p: [445, 5, 372], t: [398, 13, 390] },
  taj: { p: [372, 4, 390], t: [318, 18, 440] },
  cst: { p: [126, 3.5, -372], t: [198, 22, -440] },
  bmc: { p: [150, 4, -360], t: [75, 25, -438] },
  regal: { p: [90, 4, 330], t: [140, 10, 370] },
  kalaghoda: { p: [60, 3, 210], t: [110, 5, 250] },
  museum: { p: [60, 4, 300], t: [20, 15, 335] },
  highcourt: { p: [-150, 3, 150], t: [-50, 20, 150] },
  azad: { p: [10, 3, -150], t: [20, 5, -300] },
  overview: { p: [-150, 1100, 60], t: [-150, 0, 0], up: [0, 0, -1] },
  overview_n: { p: [-100, 500, 650], t: [-100, 0, -50] },
  exit_n: { p: [130, 2, -500], t: [140, 4, -560] },
  exit_md: { p: [-560, 2, -470], t: [-600, 4, -520] },
};

(async () => {
  const names = (process.argv[2] || 'md_street').split(',');
  const hour = process.argv[3] !== undefined ? Number(process.argv[3]) : 18.4;
  const suffix = process.argv[4] || '';
  const g = await H.launch({ out: path.join(__dirname, "shots"), width: 960, height: 540 });
  const logs = await g.eval(() => (window.__cityLog || null));
  await g.wait(0.5);
  await g.eval((h) => { const G = window.__game; G.city.setTimeOfDay(h); G.city.timeScale = 0; G.paused = true; G.player.updateCamera = () => {}; }, hour);
  for (const n of names) {
    const v = VIEWS[n]; if (!v) { console.log('no view', n); continue; }
    await g.eval((v) => {
      const G = window.__game, c = G.camera;
      c.position.set(...v.p); c.up.set(...(v.up || [0, 1, 0])); c.lookAt(...v.t); c.updateMatrixWorld();
    }, v);
    await g.wait(0.6);
    const st = await g.state();
    const p = await g.shot(`${n}${suffix}_${String(hour).replace('.', 'h')}`);
    console.log(n, 'fps', st.fps, 'calls', st.render.calls, 'tris', st.render.triangles, '→', path.basename(p));
  }
  const st = await g.state();
  console.log('city', JSON.stringify(st.city), 'errors', JSON.stringify(st.errors));
  await g.close();
})().catch((e) => { console.error(e); process.exit(1); });
