// Canvas-generated textures (no external assets). All tileable unless noted.
import * as THREE from 'three';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Tileable fbm value noise → Float32Array size*size in [0,1]. */
export function tileNoise(size, basePeriod, octaves, seed, persistence = 0.5) {
  const out = new Float32Array(size * size);
  const rnd = mulberry(seed);
  let amp = 1, total = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(period * period); for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const cell = size / period;
    for (let y = 0; y < size; y++) {
      const fy = y / cell, y0 = Math.floor(fy) % period, y1 = (y0 + 1) % period; let ty = fy - Math.floor(fy); ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = x / cell, x0 = Math.floor(fx) % period, x1 = (x0 + 1) % period; let tx = fx - Math.floor(fx); tx = tx * tx * (3 - 2 * tx);
        const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
    total += amp; amp *= persistence; period = Math.min(size, period * 2);
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true, aniso = 8, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso; t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

/** RGBA noise: R fine grain, G blotches, B vertical streaks, A cellular-ish. Linear data. */
export function makeNoiseTexture() {
  const S = 256;
  const r = tileNoise(S, 32, 3, 11), g = tileNoise(S, 4, 4, 23, 0.55), b0 = tileNoise(S, 8, 3, 37), a = tileNoise(S, 16, 2, 41);
  const c = canvas(S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
  // streaks: stretch noise vertically by sampling a row-compressed copy
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const st = b0[((y >> 3) * S + x) % (S * S)] * 0.5 + b0[x] * 0.5;
    img.data[i * 4] = r[i] * 255; img.data[i * 4 + 1] = g[i] * 255; img.data[i * 4 + 2] = st * 255; img.data[i * 4 + 3] = a[i] * 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false, aniso: 4 });
}

/** Asphalt: dark, speckled, patched. World uv scale ~ 1/10 m. */
export function makeAsphalt() {
  const S = 512, c = canvas(S), ctx = c.getContext('2d');
  const n1 = tileNoise(S, 8, 5, 101, 0.6), n2 = tileNoise(S, 64, 2, 103);
  const img = ctx.createImageData(S, S); const rnd = mulberry(7);
  for (let i = 0; i < S * S; i++) {
    let v = 58 + (n1[i] - 0.5) * 34 + (n2[i] - 0.5) * 30 + (rnd() < 0.08 ? (rnd() - 0.5) * 50 : 0);
    img.data[i * 4] = v * 0.98; img.data[i * 4 + 1] = v * 0.97; img.data[i * 4 + 2] = v * 0.95; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // patches & oil stains
  for (let k = 0; k < 14; k++) {
    const x = rnd() * S, y = rnd() * S, w = 30 + rnd() * 110, h = 20 + rnd() * 70;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(25,25,28,0.35)' : 'rgba(95,92,88,0.22)';
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) ctx.fillRect(x + dx, y + dy, w, h);
  }
  for (let k = 0; k < 30; k++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 18;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,10,12,0.35)'); gr.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // cracks
  ctx.strokeStyle = 'rgba(15,15,15,0.55)'; ctx.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    let x = rnd() * S, y = rnd() * S; ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return tex(c, { aniso: 16 });
}

/** Footpath pavers (grey / buff interlocking blocks). World uv scale 1/4 m. */
export function makePaving() {
  const S = 512, c = canvas(S), ctx = c.getContext('2d'); const rnd = mulberry(77);
  ctx.fillStyle = '#7d776c'; ctx.fillRect(0, 0, S, S);
  const n = tileNoise(S, 16, 4, 79);
  // I-shaped / rectangular pavers in herringbone-ish rows: 8 rows x 16 cols
  const rows = 16, cols = 8, ph = S / rows, pw = S / cols;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const off = (r % 2) * pw / 2; const x = q * pw + off, y = r * ph;
    const t = rnd(); const base = t < 0.12 ? [150, 92, 78] : t < 0.25 ? [120, 116, 108] : [150, 144, 132];
    const v = 0.82 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`;
    for (const dx of [-S, 0, S]) ctx.fillRect(x + 1.5 + dx, y + 1.5, pw - 3, ph - 3);
  }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) { const k = 0.78 + n[i] * 0.4; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  ctx.putImageData(img, 0, 0);
  // stains (paan / grime)
  for (let k = 0; k < 40; k++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 14;
    ctx.fillStyle = rnd() < 0.2 ? 'rgba(120,30,25,0.25)' : 'rgba(30,28,24,0.18)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return tex(c, { aniso: 16 });
}

/** Promenade: large grey stone slabs. uv scale 1/6 m. */
export function makePromenade() {
  const S = 512, c = canvas(S), ctx = c.getContext('2d'); const rnd = mulberry(91);
  const n = tileNoise(S, 8, 5, 93);
  ctx.fillStyle = '#8f8a80'; ctx.fillRect(0, 0, S, S);
  const g = 4, w = S / g;
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) { const v = 0.85 + rnd() * 0.25; ctx.fillStyle = `rgb(${158 * v | 0},${152 * v | 0},${140 * v | 0})`; ctx.fillRect(i * w + 2, j * w + 2, w - 4, w - 4); }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) { const k = 0.8 + n[i] * 0.35; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  ctx.putImageData(img, 0, 0);
  return tex(c, { aniso: 16 });
}

/** Maidan grass: patchy, post-monsoon green with dry/worn areas. uv scale 1/12 m. */
export function makeGrass() {
  const S = 512, c = canvas(S), ctx = c.getContext('2d');
  const n1 = tileNoise(S, 4, 5, 201, 0.55), n2 = tileNoise(S, 64, 2, 203), rnd = mulberry(5);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const dry = Math.max(0, Math.min(1, (n1[i] - 0.52) * 4));
    const gr = 0.75 + n2[i] * 0.5 + (rnd() - 0.5) * 0.15;
    const R = (62 + dry * 70) * gr, G = (96 + dry * 30) * gr, B = (40 + dry * 25) * gr;
    img.data[i * 4] = R; img.data[i * 4 + 1] = G; img.data[i * 4 + 2] = B; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { aniso: 16 });
}

/** Bare dusty ground (back lots, compounds). uv 1/8 m. */
export function makeDirt() {
  const S = 256, c = canvas(S), ctx = c.getContext('2d');
  const n1 = tileNoise(S, 8, 5, 301, 0.6); const rnd = mulberry(9);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = 0.75 + n1[i] * 0.45 + (rnd() - 0.5) * 0.12; img.data[i * 4] = 128 * v; img.data[i * 4 + 1] = 112 * v; img.data[i * 4 + 2] = 92 * v; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return tex(c, { aniso: 8 });
}

/** Iron railing with alpha (u: 2 m per repeat, v: 0..1 full height). */
export function makeRailing() {
  const W = 128, H = 64, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1d1f1c';
  ctx.fillRect(0, 4, W, 5); ctx.fillRect(0, H - 14, W, 4);
  for (let x = 4; x < W; x += 12) { ctx.fillRect(x, 4, 3, H - 4); ctx.beginPath(); ctx.moveTo(x - 2, 6); ctx.lineTo(x + 1.5, 0); ctx.lineTo(x + 5, 6); ctx.fill(); }
  const t = tex(c, { aniso: 4 }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------------------------------------------------------------------------------------------
// Sign atlas: shop boards, cinema names, building names. 1024x1024, 4 columns x 32 rows of 256x32 cells.
const SHOPS = [
  ['IRANI CAFE & STORES', '#f4e9c8', '#7a1e12'], ['NEW EMPIRE OPTICIANS', '#0d3b66', '#fff3c4'], ['BOMBAY STATIONERY MART', '#c0392b', '#fff'],
  ['GANESH CHEMIST', '#1e7d3a', '#fff'], ['LAXMI JEWELLERS', '#7b1414', '#ffd76a'], ['FORT BOOK DEPOT', '#1f2a44', '#ffe9a8'],
  ['SARDAR PAV BHAJI', '#ffcc00', '#a01010'], ['NAVRANG TAILORS', '#4a148c', '#ffe082'], ['MEHTA ELECTRICALS', '#004d73', '#fff'],
  ['PARSI DAIRY FARM', '#ffffff', '#1a3e8c'], ['RAJ PHOTO STUDIO', '#222', '#ffcf40'], ['SHREE SAI XEROX', '#e65100', '#fff'],
  ['ASIATIC SPORTS', '#1b5e20', '#ffeb3b'], ['CHETANA RESTAURANT', '#b71c1c', '#fff8e1'], ['KAMAT HOTEL', '#fff176', '#c62828'],
  ['STRAND BOOK STALL', '#263238', '#ffcc80'], ['MODERN WATCH CO.', '#3e2723', '#ffd54f'], ['UNIVERSAL TRAVELS', '#01579b', '#fff'],
  ['ANAND STORES', '#33691e', '#fff'], ['VICTORIA CLOTH MART', '#880e4f', '#fff'], ['BHAGAT SWEETS', '#ff8f00', '#4e1500'],
  ['NEW INDIA ASSURANCE', '#0d47a1', '#fff'], ['ROYAL CHINA', '#c62828', '#ffd54f'], ['CAFE MONDEGAR', '#f1e3c6', '#1b4d2e'],
  ['STATE BANK OF BOMBAY', '#1565c0', '#fff'], ['PRAKASH MEDICAL', '#2e7d32', '#fff'], ['ALIBHAI & SONS', '#4e342e', '#ffe0b2'],
  ['VIJAY LAUNDRY', '#00838f', '#fff'], ['SHREE KRISHNA BHAVAN', '#fbc02d', '#880e4f'], ['NEW YORK BURGER', '#d32f2f', '#fff'],
  ['PANCHAM PURIWALA', '#ffeb3b', '#b71c1c'], ['ZODIAC MOBILE', '#212121', '#40c4ff'], ['LIBERTY HAIR SALON', '#6a1b9a', '#fff'],
  ['PEARL PRINTERS', '#37474f', '#fff'], ['GOLDEN TOBACCO', '#795548', '#ffecb3'], ['EXCELSIOR', '#1a237e', '#ffd740'],
];
const DECO_NAMES = ['SOONA MAHAL', 'KELI MAHAL', 'ZAVERI MANSION', 'SHIV SHANTI BHUVAN', 'OCEANA', 'GANGA VIHAR', 'BAKHTAVAR', 'SEA FACE COURT',
  'DUNHILL HOUSE', 'MARINE VIEW', 'EVEREST', 'SHRI NIKETAN', 'KRISHNA KUNJ', 'RAJ MAHAL', 'MOTI MAHAL', 'NIRMAL', 'BOMBAY HOUSE', 'COSMOPOLITAN',
  'CHATEAU MARINE', 'SURYA MAHAL', 'JAYANT MAHAL', 'GULISTAN', 'ROSE VILLA', 'PALM SPRINGS', 'DILKUSH', 'NAVJIVAN', 'PANORAMA', 'WESTERN COURT'];
const BIG = [['EROS', '#fff2d0', 'deco'], ['REGAL', '#ffe9a0', 'deco'], ['AIR INDIA', '#e21b23', 'sans'], ['TAJ', '#ffd98a', 'serif'],
  ['MUNICIPAL CORPORATION', '#ffe7b0', 'serif'], ['POLICE STATION', '#ffffff', 'sans'], ['CHURCHGATE', '#ffe7b0', 'serif'], ['MARINE PLAZA', '#f2f2ff', 'sans'],
  ['BEST', '#ffffff', 'sans'], ['CHAI', '#fff', 'sans'], ['JEHANGIR ART GALLERY', '#333', 'sans'], ['OBEROI', '#e8d9b0', 'serif'],
  ['METRO WORK IN PROGRESS', '#ffffff', 'sans'], ['EXPRESS TOWERS', '#e0e0ff', 'sans'], ['INOX', '#ffd54f', 'sans'], ['BOMBAY STOCK EXCHANGE', '#d0e4ff', 'sans']];

export const SIGN_ATLAS = { cols: 4, rows: 32, shops: SHOPS.length, deco: DECO_NAMES.length, big: BIG.length };

/** Returns { texture, shopUV(i), decoUV(i), bigUV(i) } where each UV is [u0,v0,u1,v1]. */
export function makeSignAtlas() {
  const W = 1024, H = 1024, c = canvas(W, H), ctx = c.getContext('2d');
  const cw = 256, ch = 32; const rnd = mulberry(55);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  let slot = 0;
  const cell = () => { const i = slot++; return [(i % 4) * cw, Math.floor(i / 4) * ch]; };
  const uvOf = (x, y, w, h) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
  const shopUV = [], decoUV = [], bigUV = [];
  for (const [name, bg, fg] of SHOPS) {
    const [x, y] = cell();
    ctx.fillStyle = bg; ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    ctx.strokeStyle = fg; ctx.lineWidth = 1.5; ctx.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
    ctx.fillStyle = fg; ctx.font = `bold ${name.length > 18 ? 15 : 18}px "Arial Narrow", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, x + cw / 2, y + ch / 2 + 1, cw - 14);
    shopUV.push(uvOf(x, y, cw, ch));
  }
  // deco names: cream relief letters on transparent-ish (dark) plaque
  for (const name of DECO_NAMES) {
    const [x, y] = cell();
    ctx.fillStyle = '#2a2622'; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = '#f3e6c4'; ctx.font = 'bold 20px "Futura", "Avenir Next Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';
    ctx.fillText(name, x + cw / 2, y + ch / 2 + 1, cw - 10);
    ctx.letterSpacing = '0px';
    decoUV.push(uvOf(x, y, cw, ch));
  }
  // big signs: two cells wide
  if (slot % 2) slot++;
  for (const [name, col, style] of BIG) {
    const [x, y] = cell(); slot++;
    const w = cw * 2;
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, ch);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = style === 'deco' ? 'bold 28px "Futura", "Avenir Next", sans-serif' : style === 'serif' ? 'bold 24px "Times New Roman", serif' : 'bold 24px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(name, x + w / 2, y + ch / 2 + 1, w - 10);
    bigUV.push(uvOf(x, y, w, ch));
  }
  // hoardings (billboards) area at the bottom: 4 per row, 256x128 each
  const hoardUV = [];
  const ads = [['CHAI THAT CARES', '#d84315', '#fff8e1'], ['MUMBAI METRO 3 • COMING SOON', '#0d47a1', '#fff'], ['BOLLYWOOD NIGHTS', '#4a148c', '#ffd54f'],
    ['KAALI-PEELI: SAFAR APNA', '#ffd600', '#111'], ['VADA PAV MAHOTSAV', '#ff6f00', '#fff'], ['SEA LINK TOLL FREE', '#00695c', '#fff'],
    ['DHOOM DHADAKA — IN CINEMAS', '#b71c1c', '#fff'], ['MONSOON SALE 50% OFF', '#1565c0', '#ffeb3b']];
  let hy = Math.ceil(slot / 4) * ch + 8;
  ads.forEach(([t, bg, fg], i) => {
    const x = (i % 4) * 256, y = hy + Math.floor(i / 4) * 128;
    const gr = ctx.createLinearGradient(x, y, x + 256, y + 128); gr.addColorStop(0, bg); gr.addColorStop(1, shade(bg, -40));
    ctx.fillStyle = gr; ctx.fillRect(x + 2, y + 2, 252, 124);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + rnd() * 256, y + rnd() * 128, 10 + rnd() * 40, 0, 7); ctx.fill(); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 26px "Helvetica Neue", Arial, sans-serif';
    const words = t.split(' '); const half = Math.ceil(words.length / 2);
    ctx.fillText(words.slice(0, half).join(' '), x + 128, y + 48, 236); ctx.fillText(words.slice(half).join(' '), x + 128, y + 84, 236);
    hoardUV.push(uvOf(x, y, 256, 128));
  });
  const t = tex(c, { repeat: false, aniso: 8 });
  return { texture: t, shopUV, decoUV, bigUV, hoardUV, bigIndex: Object.fromEntries(BIG.map((b, i) => [b[0], i])) };
}

function shade(hex, amt) {
  const c = new THREE.Color(hex); c.offsetHSL(0, 0, amt / 255); return '#' + c.getHexString();
}

/** Soft round glow (for sprites / points). */
export function makeGlow() {
  const S = 64, c = canvas(S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, srgb: false });
}
