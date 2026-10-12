// HUD stylesheet, injected once by createHUD (keeps style.css untouched).
export const HUD_CSS = `
:root {
  --cta-magenta: #ff2e88; --cta-pink: #ff6fae; --cta-amber: #ffb23f; --cta-gold: #ffd36b; --cta-cream: #fff3df;
  --cta-deep: #150b1d; --cta-ink: rgba(14, 8, 20, 0.78); --cta-sea: #3aa0d8; --cta-green: #5fd38a; --cta-red: #ff3b4a;
  --f-display: Impact, Haettenschweiler, 'Arial Narrow Bold', 'Franklin Gothic Heavy', sans-serif;
  --f-deco: Futura, 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif;
  --f-ui: 'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --f-serif: Didot, 'Bodoni 72', 'Bodoni MT', 'Playfair Display', Georgia, serif;
  --f-num: 'Avenir Next Condensed', 'DIN Condensed', 'Arial Narrow', 'Roboto Condensed', sans-serif;
}
#hud { font-family: var(--f-ui); color: var(--cta-cream); user-select: none; -webkit-user-select: none; }
.cta-root { position: absolute; inset: 0; pointer-events: none; }
.cta-root.cta-hidden .cta-game { opacity: 0; }
.cta-game { position: absolute; inset: 0; transition: opacity 0.6s ease; }
.cta-shadow { text-shadow: 0 2px 0 rgba(0,0,0,0.65), 0 0 10px rgba(0,0,0,0.45); }

/* ---------- desaturation for WASTED / BUSTED (filter on the WebGL canvas) ---------- */
#app canvas { transition: filter 1.4s ease; }
body.cta-wasted #app canvas { filter: grayscale(0.92) contrast(1.18) brightness(0.92); }
body.cta-busted #app canvas { filter: saturate(0.35) contrast(1.08) brightness(0.9); }

/* ---------- top-right: clock, wanted stars, health ---------- */
.cta-tr { position: absolute; top: 20px; right: 26px; display: flex; flex-direction: column; align-items: flex-end; gap: 7px; }
.cta-clock { font-family: var(--f-num); font-weight: 700; font-size: 30px; letter-spacing: 1px; color: var(--cta-cream); line-height: 1; font-variant-numeric: tabular-nums; }
.cta-clock small { font-size: 15px; color: var(--cta-amber); margin-left: 4px; letter-spacing: 1px; }
.cta-stars { display: flex; gap: 3px; height: 30px; }
.cta-star { width: 30px; height: 30px; transition: transform 0.25s cubic-bezier(.3,1.8,.5,1), opacity 0.2s; }
.cta-star path { fill: rgba(20,12,24,0.35); stroke: rgba(255,243,223,0.35); stroke-width: 1.6; stroke-linejoin: round; }
.cta-star.on path { fill: url(#ctaStarGrad); stroke: #3a1a00; stroke-width: 1.8; }
.cta-star.on { filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)) drop-shadow(0 0 6px rgba(255,180,60,0.35)); }
.cta-star.pop { transform: scale(1.45) rotate(-8deg); }
.cta-stars.flash .cta-star.on { animation: ctaStarFlash 0.5s steps(1) infinite; }
@keyframes ctaStarFlash { 0% { opacity: 1; } 50% { opacity: 0.25; } }
.cta-health { display: flex; align-items: center; gap: 8px; }
.cta-health .ico { width: 16px; height: 16px; }
.cta-bar { width: 190px; height: 11px; border-radius: 2px; background: rgba(10,6,14,0.72); box-shadow: 0 0 0 2px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4); overflow: hidden; position: relative; transform: skewX(-14deg); }
.cta-bar > i { position: absolute; inset: 0 auto 0 0; width: 100%; background: linear-gradient(180deg, #8ef0b0, #34b56a 60%, #23874d); transition: width 0.25s ease; }
.cta-bar > b { position: absolute; inset: 0 auto 0 0; width: 100%; background: rgba(255,255,255,0.55); transition: width 0.9s ease 0.25s; }
.cta-bar.low > i { background: linear-gradient(180deg, #ff8a8a, #e3283b 60%, #a3121f); animation: ctaPulse 0.8s ease-in-out infinite alternate; }
.cta-bar.stamina { width: 120px; height: 5px; }
.cta-bar.stamina > i { background: linear-gradient(90deg, #ffd36b, #ffb23f); }
.cta-stam { transition: opacity 0.5s; }
@keyframes ctaPulse { from { filter: brightness(0.8); } to { filter: brightness(1.3); } }

/* ---------- minimap ---------- */
.cta-mini { position: absolute; left: 26px; bottom: 26px; width: 212px; height: 212px; }
.cta-mini canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; }
.cta-mini .ring { position: absolute; inset: -5px; border-radius: 50%; box-shadow: 0 0 0 4px rgba(12,7,16,0.9), 0 0 0 5px rgba(255,178,63,0.55), 0 8px 24px rgba(0,0,0,0.55); pointer-events: none; }
.cta-mini .north { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #120a18; color: var(--cta-gold);
  font: 800 12px/22px var(--f-deco); text-align: center; box-shadow: 0 0 0 2px rgba(255,178,63,0.7); }

/* ---------- bottom-right: area / street / vehicle names + speedometer ---------- */
.cta-br { position: absolute; right: 30px; bottom: 26px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.cta-names { display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 6px; }
.cta-area { font-family: var(--f-serif); font-style: italic; font-weight: 700; font-size: 44px; line-height: 1.05; color: #fff; letter-spacing: 0.5px;
  text-shadow: 0 0 1px #000, 2px 3px 0 rgba(0,0,0,0.75), 0 0 18px rgba(255,46,136,0.35); opacity: 0; transform: translateY(8px); transition: opacity 0.6s, transform 0.6s; }
.cta-street { font-family: var(--f-deco); font-weight: 700; text-transform: uppercase; letter-spacing: 3px; font-size: 15px; color: var(--cta-gold);
  opacity: 0; transform: translateY(6px); transition: opacity 0.5s, transform 0.5s; }
.cta-vehname { font-family: var(--f-display); font-size: 30px; letter-spacing: 1px; color: #9ce7ff; opacity: 0; transform: translateX(16px); transition: opacity 0.4s, transform 0.4s;
  -webkit-text-stroke: 1px rgba(0,0,0,0.6); text-shadow: 2px 2px 0 rgba(0,0,0,0.7); }
.cta-area.show, .cta-street.show, .cta-vehname.show { opacity: 1; transform: none; }
.cta-speedo { width: 188px; height: 188px; opacity: 0; transform: translateY(20px) scale(0.92); transition: opacity 0.35s, transform 0.35s; }
.cta-speedo.show { opacity: 1; transform: none; }
.cta-speedo canvas { width: 100%; height: 100%; }

/* ---------- centre: subtitles, prompt, big text ---------- */
.cta-sub { position: absolute; left: 50%; bottom: 13%; transform: translateX(-50%); max-width: 62%; text-align: center; font-size: 21px; font-weight: 600; line-height: 1.35;
  padding: 7px 16px; border-radius: 4px; background: rgba(10,6,14,0.55); opacity: 0; transition: opacity 0.35s; }
.cta-sub.show { opacity: 1; }
.cta-prompt { position: absolute; left: 50%; bottom: 21%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 600;
  opacity: 0; transition: opacity 0.25s; }
.cta-prompt.show { opacity: 1; }
.cta-key { display: inline-block; min-width: 26px; height: 26px; padding: 0 6px; box-sizing: border-box; border-radius: 5px; background: var(--cta-cream); color: #1a0f1f;
  font: 800 14px/26px var(--f-ui); text-align: center; box-shadow: 0 3px 0 #9a7c55, 0 4px 8px rgba(0,0,0,0.5); }
.cta-big { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; height: 190px;
  opacity: 0; transition: opacity 0.8s ease; }
.cta-big.show { opacity: 1; }
.cta-big::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(0,0,0,0.55) 22%, rgba(0,0,0,0.55) 78%, transparent); }
.cta-big span { position: relative; font-family: var(--f-display); font-size: 132px; letter-spacing: 6px; line-height: 1; transform: scale(1.25); transition: transform 1.6s cubic-bezier(.15,.8,.25,1); }
.cta-big.show span { transform: scale(1); }
.cta-big.wasted span { color: #d0182f; -webkit-text-stroke: 3px #120006; text-shadow: 0 6px 0 rgba(0,0,0,0.55), 0 0 40px rgba(208,24,47,0.45); }
.cta-big.busted span { color: #5fb7ff; -webkit-text-stroke: 3px #04101e; text-shadow: 0 6px 0 rgba(0,0,0,0.55), 0 0 40px rgba(95,183,255,0.45); }
.cta-big.mission span { color: var(--cta-gold); -webkit-text-stroke: 3px #2a1200; text-shadow: 0 6px 0 rgba(0,0,0,0.55); }
.cta-fade { position: absolute; inset: 0; background: #000; opacity: 0; transition-property: opacity; transition-timing-function: ease; }
.cta-dmg { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, transparent 45%, rgba(200,0,20,0.55) 100%); transition: opacity 0.6s ease; }
.cta-dmg.hit { opacity: 1; transition: opacity 0.05s; }
.cta-dmg.low { opacity: 0.55; animation: ctaPulse 0.9s ease-in-out infinite alternate; }

/* ---------- top-left: help box + notifications ---------- */
.cta-tl { position: absolute; left: 24px; top: 20px; width: 370px; display: flex; flex-direction: column; gap: 8px; }
.cta-help { background: var(--cta-ink); border-radius: 4px; padding: 12px 15px; font-size: 15px; line-height: 1.45; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
  border-top: 3px solid var(--cta-amber); opacity: 0; transform: translateY(-8px); transition: opacity 0.45s, transform 0.45s; }
.cta-help.show { opacity: 1; transform: none; }
.cta-help .cta-key { min-width: 22px; height: 21px; font-size: 12px; line-height: 21px; margin: 0 2px; box-shadow: 0 2px 0 #9a7c55; }
.cta-toast { background: var(--cta-ink); border-left: 3px solid var(--cta-magenta); border-radius: 3px; padding: 8px 12px; font-size: 14px; line-height: 1.4;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35); animation: ctaToastIn 0.35s ease both; }
.cta-toast.radio { border-left-color: #4aa3ff; }
.cta-toast .tag { display: inline-block; font: 800 10px/1 var(--f-deco); letter-spacing: 2px; padding: 3px 5px; margin-right: 7px; border-radius: 2px; background: #4aa3ff; color: #06121f; vertical-align: 1px; }
.cta-toast b { color: var(--cta-gold); }
.cta-toast.out { animation: ctaToastOut 0.5s ease forwards; }
@keyframes ctaToastIn { from { opacity: 0; transform: translateX(-20px); } }
@keyframes ctaToastOut { to { opacity: 0; transform: translateX(-20px); } }

/* ---------- title screen ---------- */
.cta-title { position: absolute; inset: 0; pointer-events: auto; cursor: pointer; overflow: hidden; opacity: 1; transition: opacity 0.9s ease;
  background: linear-gradient(180deg, rgba(21,11,29,0.55) 0%, rgba(21,11,29,0) 30%, rgba(21,11,29,0) 55%, rgba(21,11,29,0.85) 100%),
              linear-gradient(90deg, rgba(21,11,29,0.82) 0%, rgba(21,11,29,0.35) 45%, rgba(21,11,29,0) 70%); }
.cta-title.gone { opacity: 0; pointer-events: none; }
.cta-logo { position: absolute; left: 7vw; top: 13vh; width: 600px; }
.cta-sun { position: absolute; left: 180px; top: -40px; width: 420px; height: 420px; border-radius: 50%; opacity: 0.9;
  background: repeating-conic-gradient(from 0deg, rgba(255,178,63,0.0) 0deg 5deg, rgba(255,120,80,0.22) 5deg 10deg);
  -webkit-mask: radial-gradient(circle, #000 0 28%, rgba(0,0,0,0.6) 45%, transparent 70%); mask: radial-gradient(circle, #000 0 28%, rgba(0,0,0,0.6) 45%, transparent 70%);
  animation: ctaSpin 120s linear infinite; }
.cta-sun::after { content: ''; position: absolute; left: 50%; top: 50%; width: 150px; height: 150px; margin: -75px; border-radius: 50%;
  background: linear-gradient(180deg, #ffd36b 0%, #ff8a3d 45%, #ff2e88 100%); box-shadow: 0 0 80px rgba(255,120,80,0.6);
  -webkit-mask: repeating-linear-gradient(180deg, #000 0 14px, transparent 14px 18px); mask: repeating-linear-gradient(180deg, #000 0 60%, transparent 60% 64%, #000 64% 72%, transparent 72% 77%, #000 77% 84%, transparent 84% 90%, #000 90%); }
@keyframes ctaSpin { to { transform: rotate(360deg); } }
.cta-logo .l1 { position: relative; font: 800 30px/1 var(--f-deco); letter-spacing: 18px; color: var(--cta-cream); text-shadow: 0 3px 0 rgba(0,0,0,0.6); margin-left: 6px; }
.cta-logo .l2 { position: relative; font: 400 118px/0.92 var(--f-display); letter-spacing: 1px; margin-top: 8px; font-style: italic;
  background: linear-gradient(180deg, #fff6d8 0%, #ffd36b 38%, #ff8a3d 62%, #ff2e88 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  -webkit-text-stroke: 2px #1a0716; filter: drop-shadow(0 6px 0 rgba(0,0,0,0.6)) drop-shadow(0 0 22px rgba(255,46,136,0.35)); }
.cta-deco { position: relative; display: flex; align-items: center; gap: 14px; margin: 14px 0 6px 4px; width: 540px; }
.cta-deco i { flex: 1; height: 0; border-top: 2px solid var(--cta-gold); border-bottom: 2px solid var(--cta-gold); padding-top: 3px; opacity: 0.85; }
.cta-deco b { width: 12px; height: 12px; background: var(--cta-gold); transform: rotate(45deg); box-shadow: 0 0 0 3px #150b1d, 0 0 0 5px var(--cta-gold); }
.cta-logo .l3 { position: relative; font: 900 92px/1 var(--f-deco); letter-spacing: 30px; color: transparent; margin-left: 4px;
  -webkit-text-stroke: 2.5px var(--cta-gold); text-shadow: 5px 5px 0 rgba(255,46,136,0.85), 9px 9px 0 rgba(0,0,0,0.45); }
.cta-logo .sub { position: relative; font: 600 18px/1 var(--f-deco); letter-spacing: 9px; text-transform: uppercase; color: var(--cta-pink); margin: 12px 0 0 8px; }
.cta-logo .sub em { font-style: normal; color: var(--cta-gold); padding: 0 6px; }
.cta-press { position: absolute; left: 7vw; bottom: 25vh; font: 800 20px/1 var(--f-deco); letter-spacing: 6px; color: var(--cta-cream);
  animation: ctaBlink 1.4s ease-in-out infinite; text-shadow: 0 2px 0 rgba(0,0,0,0.6); }
.cta-press .cta-key { margin: 0 6px; font-size: 13px; letter-spacing: 1px; }
@keyframes ctaBlink { 50% { opacity: 0.35; } }
.cta-controls { position: absolute; left: 7vw; right: 7vw; bottom: 5.5vh; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px 26px;
  font-size: 13.5px; color: rgba(255,243,223,0.88); padding-top: 14px; border-top: 1px solid rgba(255,211,107,0.3); }
.cta-controls div { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.cta-controls .cta-key { min-width: 22px; height: 21px; font-size: 11px; line-height: 21px; box-shadow: 0 2px 0 #9a7c55; padding: 0 5px; }
.cta-credit { position: absolute; right: 7vw; top: 5vh; font: 600 12px/1.6 var(--f-deco); letter-spacing: 3px; color: rgba(255,243,223,0.55); text-align: right; text-transform: uppercase; }

/* ---------- pause + big map overlays ---------- */
.cta-overlay { position: absolute; inset: 0; pointer-events: auto; display: none; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(21,11,29,0.72), rgba(8,4,12,0.92)); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.cta-overlay.show { display: flex; }
.cta-card { width: min(760px, 88vw); background: rgba(21,11,29,0.9); border: 1px solid rgba(255,211,107,0.35); border-radius: 6px; padding: 26px 34px 24px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 4px rgba(21,11,29,1), inset 0 0 0 5px rgba(255,211,107,0.25); }
.cta-card h2 { margin: 0; font: 400 64px/1 var(--f-display); letter-spacing: 3px; text-align: center; font-style: italic;
  background: linear-gradient(180deg, #fff6d8, #ffd36b 45%, #ff2e88); -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-stroke: 1.5px #1a0716; }
.cta-card .where { text-align: center; font: 600 13px/1 var(--f-deco); letter-spacing: 4px; text-transform: uppercase; color: var(--cta-pink); margin: 10px 0 18px; }
.cta-card .cta-controls { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid rgba(255,211,107,0.25); }
.cta-card .resume { margin-top: 18px; text-align: center; font: 700 14px/1 var(--f-deco); letter-spacing: 4px; color: var(--cta-cream); opacity: 0.85; }
.cta-bigmap { flex-direction: column; gap: 10px; }
.cta-bigmap .hdr { display: flex; align-items: baseline; gap: 18px; font: 400 40px/1 var(--f-display); font-style: italic; letter-spacing: 2px; color: var(--cta-gold); text-shadow: 0 3px 0 rgba(0,0,0,0.6); }
.cta-bigmap .hdr small { font: 600 12px/1 var(--f-deco); letter-spacing: 4px; color: var(--cta-pink); font-style: normal; text-transform: uppercase; }
.cta-bigmap canvas { border-radius: 6px; box-shadow: 0 20px 70px rgba(0,0,0,0.65), 0 0 0 2px rgba(255,211,107,0.35); }
.cta-bigmap .foot { font-size: 13px; color: rgba(255,243,223,0.75); display: flex; gap: 20px; align-items: center; }
.cta-bigmap .foot span { display: inline-flex; align-items: center; gap: 6px; }
.cta-bigmap .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
`;
