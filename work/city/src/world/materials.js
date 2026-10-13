// Shared materials for the static city. One 'facade' material renders every building / landmark surface:
// windows, shopfronts, stone coursing, roof tiles and grime are procedural, driven by the aFacade attribute:
//   aFacade = (bayWidth m, floorHeight m, style, seed + 10*flags)
//   style % 10: 0 plain stucco · 1 Art Deco windows · 2 Gothic arched windows (+ashlar) · 3 ribbon windows
//               4 glass curtain wall · 5 small shuttered windows · 6 ashlar stone (no windows) · 7 clay tile roof
//               8 flat roof concrete · 9 smooth painted (metal / plastic)
//   style >= 10: ground floor has shopfronts. style >= 20: ground floor is an open arcade (dark recess).
//   flags: 1 warm floodlit at night · 2 colour-changing floodlight (CST) · 4 no street-glow
import * as THREE from 'three';
import { makeNoiseTexture, makeAsphalt, makePaving, makeGrass, makeDirt, makeRailing, makeSignAtlas, makePromenade } from './textures.js';

export function createMaterials() {
  const U = {
    uNoise: { value: makeNoiseTexture() },
    uNight: { value: 0 },        // 0 day .. 1 full night (window emission strength)
    uLit: { value: 0.4 },        // fraction of windows lit
    uShop: { value: 0.8 },       // fraction of shops lit/open
    uStreet: { value: 0 },       // sodium street-glow on lower facades
    uTime: { value: 0 },
    uSodium: { value: new THREE.Color(1.0, 0.55, 0.2) },
  };

  const facade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 });
  facade.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFacade; varying vec4 vFacade; varying vec2 vUvM; varying vec3 vWPos; varying vec3 vWNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFacade = aFacade; vUvM = uv; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise; uniform float uNight, uLit, uShop, uStreet, uTime; uniform vec3 uSodium;
        varying vec4 vFacade; varying vec2 vUvM; varying vec3 vWPos; varying vec3 vWNrm;
        float fhash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float box1(float x, float a, float b, float aa) { return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x)); }
        vec3 fEmis = vec3(0.0); float fRough = 0.9; float fMetal = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float st = vFacade.z; float style = mod(st, 10.0); float gf = floor(st / 10.0);
        float flags = floor(vFacade.w / 10.0); float seed = fract(vFacade.w / 10.0) * 10.0;
        vec2 uvm = vUvM;
        float wall = 1.0 - abs(vWNrm.y);
        vec4 nA = texture2D(uNoise, uvm * 0.09 + seed * 7.13);
        vec4 nB = texture2D(uNoise, uvm * 0.021 + seed * 3.1);
        float streak = texture2D(uNoise, vec2(uvm.x * 0.13 + seed, uvm.y * 0.012)).b;
        float grime = (nA.g - 0.5) * 0.3 + (nB.g - 0.5) * 0.35 - smoothstep(0.5, 0.85, streak) * 0.28 * wall;
        vec3 base = diffuseColor.rgb;
        // ground dirt / damp at the base of walls
        base *= mix(0.62, 1.0, smoothstep(0.0, 1.6, vWPos.y) * wall + (1.0 - wall));
        base *= 1.0 + grime;
        fRough = 0.88 + nA.r * 0.1;
        float bay = max(vFacade.x, 0.5), fh = max(vFacade.y, 0.5);
        if (style > 5.5 && style < 6.5 || style > 1.5 && style < 2.5) {
          // ashlar coursing
          float cy = uvm.y / 0.62; float row = floor(cy);
          float cxx = uvm.x / 1.25 + 0.5 * mod(row, 2.0);
          float jy = smoothstep(0.0, 0.05, fract(cy)) * smoothstep(0.0, 0.05, 1.0 - fract(cy));
          float jx = smoothstep(0.0, 0.025, fract(cxx)) * smoothstep(0.0, 0.025, 1.0 - fract(cxx));
          base *= mix(0.8, 1.0, jy * jx) * (0.93 + 0.14 * fhash(vec2(floor(cxx), row) + seed));
        }
        if (style > 6.5 && style < 7.5) {
          // clay tiles: rows + random tile tone
          float r = uvm.y * 3.2; float c = uvm.x * 4.0 + 0.5 * mod(floor(r), 2.0);
          float sh = 0.7 + 0.3 * smoothstep(0.0, 0.8, fract(r));
          base *= sh * (0.85 + 0.3 * fhash(floor(vec2(c, r)) + seed)) * (0.8 + nB.g * 0.4);
          fRough = 0.75;
        }
        if (style > 7.5 && style < 8.5) { base *= 0.75 + nA.g * 0.35 + nB.r * 0.2; fRough = 0.95; }
        if (style > 8.5) { fRough = 0.45; base = diffuseColor.rgb * (0.9 + nA.r * 0.15); }
        bool windows = (style > 0.5 && style < 5.5) && wall > 0.6;
        if (windows) {
          vec2 cf = vec2(uvm.x / bay, uvm.y / fh);
          vec2 cell = floor(cf); vec2 f = fract(cf);
          float h1 = fhash(cell + seed * 17.3);
          float h2 = fhash(cell.yx * 1.37 + seed * 5.1 + 3.7);
          float colBlank = step(fhash(vec2(cell.x, seed * 9.1)), 0.07);
          float ww = 0.5, wh = 0.44, wy = 0.3;
          if (style < 1.5) { ww = 0.56; wh = 0.42; wy = 0.3; }
          else if (style < 2.5) { ww = 0.36; wh = 0.6; wy = 0.18; }
          else if (style < 3.5) { ww = 0.96; wh = 0.4; wy = 0.32; colBlank = 0.0; }
          else if (style < 4.5) { ww = 0.94; wh = 0.84; wy = 0.08; colBlank = 0.0; }
          else { ww = 0.34; wh = 0.46; wy = 0.28; }
          bool ground = cell.y < 0.5;
          float shop = 0.0, arcade = 0.0;
          if (ground) {
            if (gf > 1.5) { arcade = 1.0; ww = 0.8; wh = 0.82; wy = 0.0; }
            else if (gf > 0.5) { shop = 1.0; ww = 0.86; wh = 0.7; wy = 0.0; }
            else if (style < 3.5 || style > 4.5) { ww = 0.32; wh = 0.42; wy = 0.34; }
            colBlank = 0.0;
          }
          vec2 aa = fwidth(cf) * 0.8;
          float inX = box1(f.x, 0.5 - ww * 0.5, 0.5 + ww * 0.5, aa.x);
          float top = wy + wh;
          float inY = box1(f.y, wy, top, aa.y);
          if (style > 1.5 && style < 2.5 && !ground) {
            // pointed (gothic) arch head
            float archH = wh * 0.32; float ty = (f.y - (top - archH)) / archH;
            float halfW = ww * 0.5 * sqrt(clamp(1.0 - ty, 0.0, 1.0));
            if (ty > 0.0) inX = box1(f.x, 0.5 - halfW, 0.5 + halfW, aa.x);
          }
          if (style < 1.5 && !ground) {
            // deco: a slim vertical port-hole/fin rhythm every 3rd bay replaces the window
            if (mod(cell.x + floor(seed * 3.0), 5.0) < 0.5) { inX = box1(f.x, 0.42, 0.58, aa.x); }
          }
          float win = inX * inY * (1.0 - colBlank);
          // frame / reveal (darker ring) and sill
          float frame = box1(f.x, 0.5 - ww * 0.5 - 0.05, 0.5 + ww * 0.5 + 0.05, aa.x) * box1(f.y, wy - 0.04, top + 0.03, aa.y) * (1.0 - colBlank) - win;
          base *= 1.0 - 0.35 * clamp(frame, 0.0, 1.0);
          // eyebrow shade shadow just above deco windows
          if (style < 1.5 && !ground) base *= 1.0 - 0.3 * box1(f.y, top + 0.02, top + 0.09, aa.y) * inX;
          if (win > 0.001) {
            // mullions / glazing bars
            float mull = 0.0;
            if (style < 1.5) mull = max(box1(fract(f.x * 3.0 / ww), 0.0, 0.06, 0.02), box1(f.y, wy + wh * 0.62, wy + wh * 0.66, aa.y));
            else if (style < 2.5) mull = box1(f.x, 0.49, 0.51, aa.x);
            else if (style < 3.5) mull = box1(fract(uvm.x / 1.2), 0.0, 0.04, 0.02);
            else if (style < 4.5) mull = max(box1(fract(uvm.x / 1.5), 0.0, 0.03, 0.01), box1(f.y, 0.0, 0.05, aa.y));
            else mull = box1(f.x, 0.49, 0.51, aa.x);
            vec3 glass = mix(vec3(0.035, 0.045, 0.055), vec3(0.09, 0.1, 0.11), h2);
            float curtain = step(0.62, h2) * (1.0 - shop) * (1.0 - arcade);
            vec3 curtCol = mix(vec3(0.55, 0.45, 0.32), vec3(0.4, 0.5, 0.55), fhash(cell + 7.0));
            vec3 wc = mix(glass, curtCol * 0.6, curtain * 0.7);
            if (style > 4.5) wc = mix(wc, vec3(0.25, 0.16, 0.1), step(0.45, h1)); // wooden shutters closed
            if (shop > 0.5) {
              // rolling shutter or open shop
              float open = step(h1, 0.7);
              vec3 shutter = vec3(0.32, 0.33, 0.33) * (0.75 + 0.25 * step(0.5, fract(f.y * 22.0)));
              wc = mix(shutter, vec3(0.07, 0.06, 0.05), open);
            }
            if (arcade > 0.5) wc = vec3(0.06, 0.055, 0.05);
            base = mix(base, wc, win);
            base = mix(base, base * 0.5 + 0.05, mull * win);
            fRough = mix(fRough, 0.08, win * (1.0 - curtain) * (1.0 - shop));
            // --- night: lit windows
            float litP = uLit * (0.55 + 0.9 * fract(seed * 13.7));
            float lit = step(h1, litP) * (1.0 - step(4.5, style) * step(h1, 0.45) * 0.0);
            vec3 pal = h2 < 0.45 ? vec3(1.0, 0.72, 0.38) : h2 < 0.75 ? vec3(1.0, 0.86, 0.62) : h2 < 0.92 ? vec3(0.78, 0.9, 1.0) : vec3(0.5, 0.65, 1.0);
            float inner = 0.75 + 0.25 * f.y + 0.2 * (fhash(cell + 3.3) - 0.5);
            float e = lit * uNight * inner * (1.0 - mull * 0.8) * (curtain > 0.5 ? 0.7 : 1.0);
            if (shop > 0.5) { e = step(h1, 0.7) * uShop * (0.35 + 0.25 * step(0.5, fract(f.y * 5.0 + h2))) * (0.6 + 0.4 * f.y); pal = mix(vec3(1.0, 0.72, 0.42), vec3(0.8, 0.95, 0.85), step(0.65, h2)); }
            if (arcade > 0.5) { e = uShop * 0.5 * smoothstep(0.2, 0.9, f.y); pal = vec3(1.0, 0.75, 0.45); }
            fEmis += pal * e * win * 1.6;
          }
        }
        diffuseColor.rgb = base;
        // street-level sodium glow on lower facades at night
        if (flags < 3.5) fEmis += base * uSodium * uStreet * (1.0 - smoothstep(0.0, 11.0, vWPos.y)) * 0.55 * wall;
        // floodlighting (landmarks)
        float fl = mod(flags, 4.0);
        if (fl > 0.5) {
          float up = exp(-max(vWPos.y, 0.0) * 0.025) * 0.8 + 0.25;
          vec3 fc = vec3(1.0, 0.78, 0.5);
          if (fl > 1.5) fc = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vWPos.x * 0.004 + uTime * 0.05));
          fEmis += base * fc * up * uNight * 1.5;
        }
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fEmis;');
  };
  facade.customProgramCacheKey = () => 'cityFacade1';

  const signs = makeSignAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: signs.texture, emissiveMap: signs.texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6, vertexColors: true });

  // glow-ish unlit material for lamp heads, clock faces, neon (colour * intensity by night)
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, toneMapped: true });

  const tAsphalt = makeAsphalt();
  const asphalt = new THREE.MeshStandardMaterial({ map: tAsphalt, roughness: 0.92, metalness: 0, color: 0xffffff });
  asphalt.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n uniform sampler2D uNoise;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec4 n1 = texture2D(uNoise, vMapUv * 0.06); vec4 n2 = texture2D(uNoise, vMapUv * 0.013);
          diffuseColor.rgb *= 0.82 + n1.g * 0.25 + (n2.g - 0.5) * 0.3; }`);
  };
  const paving = new THREE.MeshStandardMaterial({ map: makePaving(), vertexColors: true, roughness: 0.95 });
  const promenade = new THREE.MeshStandardMaterial({ map: makePromenade(), vertexColors: true, roughness: 0.9 });
  const grass = new THREE.MeshStandardMaterial({ map: makeGrass(), vertexColors: true, roughness: 1.0 });
  grass.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n uniform sampler2D uNoise;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec4 n2 = texture2D(uNoise, vMapUv * 0.02); diffuseColor.rgb *= 0.8 + n2.g * 0.45; }`);
  };
  const dirt = new THREE.MeshStandardMaterial({ map: makeDirt(), vertexColors: true, roughness: 1.0 });
  const markings = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  markings.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n uniform sampler2D uNoise; varying vec3 vWP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec4 n = texture2D(uNoise, vWP.xz * 0.15); float wear = smoothstep(0.35, 0.75, n.r * 0.6 + n.g * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22), wear * 0.55); }`);
  };
  const railing = new THREE.MeshStandardMaterial({ map: makeRailing(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3, color: 0xffffff });

  // kerb: painted black/yellow checker (world xz) on top, checker along the face
  const kerb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  kerb.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n uniform sampler2D uNoise; varying vec3 vWP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float c = mod(floor(vWP.x * 0.8) + floor(vWP.z * 0.8), 2.0);
          vec4 n = texture2D(uNoise, vWP.xz * 0.2 + vWP.y);
          vec3 paint = mix(vec3(0.05, 0.05, 0.05), vec3(0.75, 0.6, 0.12), c);
          vec3 stone = vec3(0.5, 0.48, 0.44);
          float worn = smoothstep(0.45, 0.8, n.g + n.r * 0.3);
          diffuseColor.rgb *= mix(paint, stone, worn * 0.7) * (0.85 + n.r * 0.3); }`);
  };

  return { U, facade, signMat, signs, glowMat, asphalt, paving, promenade, grass, dirt, markings, railing, kerb };
}
