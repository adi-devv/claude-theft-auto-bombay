// Sky dome, sun/moon light (the ONE shadow caster), hemisphere fill, fog and the time-of-day palette.
import * as THREE from 'three';

// Shared GLSL: sky radiance for a world direction. Used by the dome, the env-map scene and the sea.
export const SKY_GLSL = `
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunCol;
uniform float uNightK; uniform float uSkyTime; uniform sampler2D uSkyNoise; uniform vec3 uCityGlow; uniform vec3 uMoonDir;
float sHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 skyRadiance(vec3 d, bool withSun) {
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  if (y < 0.0) col = uHorizon * (1.0 + y * 0.6);
  float sd = max(dot(d, uSunDir), 0.0);
  float hz = 1.0 - smoothstep(0.0, 0.5, abs(y));
  col += uGlow * (pow(sd, 5.0) * 0.55 * (0.4 + 0.6 * hz) + pow(sd, 40.0) * 0.9);
  // city light pollution near the horizon at night
  col += uCityGlow * pow(1.0 - clamp(y, 0.0, 1.0), 6.0);
  // clouds: streaky stratus + puffs projected on a dome
  if (y > 0.0) {
    vec2 p = d.xz / (y + 0.12);
    float n = texture2D(uSkyNoise, p * 0.07 + vec2(uSkyTime * 0.002, 0.0)).g * 0.6 + texture2D(uSkyNoise, p * vec2(0.03, 0.11) + vec2(uSkyTime * 0.001, 0.3)).g * 0.6;
    float cl = smoothstep(0.62, 0.95, n) * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.35, 0.9, y));
    vec3 cc = mix(uHorizon * 0.9 + 0.05, uGlow * 1.4 + uSunCol * 0.2, pow(sd, 3.0)) * (1.0 - uNightK * 0.85) + uCityGlow * 1.8 * uNightK;
    col = mix(col, cc, cl * 0.75);
  }
  if (withSun) {
    col += uSunCol * smoothstep(0.99955, 0.9998, sd) * 18.0 * (1.0 - uNightK);
    // stars + moon
    if (uNightK > 0.01 && y > 0.0) {
      vec3 q = floor(d * 380.0);
      float s = sHash(q);
      col += vec3(0.9, 0.95, 1.0) * step(0.9975, s) * uNightK * smoothstep(0.05, 0.4, y) * (0.5 + 0.5 * sin(uSkyTime * 3.0 + s * 100.0)) * 1.4;
      float md = dot(d, uMoonDir);
      col += vec3(0.95, 0.93, 0.85) * smoothstep(0.99975, 0.9999, md) * 3.0 * uNightK + vec3(0.25, 0.3, 0.4) * pow(max(md, 0.0), 60.0) * 0.25 * uNightK;
    }
  }
  return col;
}`;

// Time-of-day keyframes: [hour, zenith, horizon, glow, sunCol, sunInt, hemiSky, hemiGround, hemiInt, fog, fogDensity, envInt, exposure, cityGlow]
const KEYS = [
  [0.0, '#03060d', '#141826', '#000000', '#000000', 0.0, '#24304a', '#100c0c', 0.35, '#121520', 0.0016, 0.25, 1.05, '#2a1a12'],
  [5.0, '#05080f', '#1a1c28', '#000000', '#000000', 0.0, '#24304a', '#100c0c', 0.35, '#141724', 0.0016, 0.25, 1.05, '#24160f'],
  [5.9, '#1d2a48', '#7a6070', '#ff7a40', '#ff6a30', 0.2, '#4a5a80', '#2a2018', 0.45, '#6a5a66', 0.0016, 0.4, 1.0, '#1a100a'],
  [6.6, '#3c5c8e', '#e3a77f', '#ffa060', '#ff9a50', 1.2, '#8090b0', '#4a3a2a', 0.55, '#c4a090', 0.0014, 0.6, 0.95, '#000000'],
  [8.0, '#5a86c2', '#d8d6cc', '#ffd8a0', '#ffe2b8', 2.6, '#a8c0de', '#6a5a44', 0.6, '#c2c6c4', 0.0011, 0.8, 0.9, '#000000'],
  [12.5, '#4a7fc4', '#c6d6e4', '#fff4dc', '#fff6e8', 3.2, '#b0cbe8', '#7a6a50', 0.65, '#bccad6', 0.0010, 0.9, 0.85, '#000000'],
  [16.0, '#4f80bf', '#d4d4cc', '#ffe0b0', '#ffe8c8', 2.9, '#acc4e0', '#7a6650', 0.6, '#c8c8c0', 0.0011, 0.85, 0.88, '#000000'],
  [17.6, '#47689c', '#e8c098', '#ffb070', '#ffc078', 2.4, '#98a8c8', '#6a5038', 0.55, '#d0b090', 0.0012, 0.75, 0.92, '#000000'],
  [18.4, '#2e4a7c', '#f2a466', '#ff8a3c', '#ff9040', 2.3, '#7c88b0', '#5a3c2c', 0.5, '#c28a74', 0.0013, 0.65, 1.0, '#000000'],
  [18.9, '#1e2a52', '#b0605a', '#ff5a30', '#ff5a28', 0.6, '#5a6088', '#3a2a24', 0.45, '#7a5262', 0.0014, 0.45, 1.05, '#100806'],
  [19.6, '#0c1430', '#40304a', '#802818', '#000000', 0.0, '#384468', '#1a1410', 0.4, '#2e2638', 0.0015, 0.3, 1.1, '#2a1810'],
  [21.0, '#050913', '#1c1a28', '#000000', '#000000', 0.0, '#26324e', '#140e0c', 0.36, '#161824', 0.0016, 0.25, 1.1, '#2e1c12'],
  [24.0, '#03060d', '#141826', '#000000', '#000000', 0.0, '#24304a', '#100c0c', 0.35, '#121520', 0.0016, 0.25, 1.05, '#2a1a12'],
];
const KC = KEYS.map((k) => k.map((v) => (typeof v === 'string' ? new THREE.Color(v) : v)));

export function sunDirection(h, out = new THREE.Vector3()) {
  // sunrise ~6.4h, sunset ~18.8h; azimuth east → south → west (Mumbai ~19°N: sun passes to the south)
  const t = (h - 6.4) / 12.4;
  const el = Math.sin(Math.PI * t) * 1.15; // radians-ish max ~66°
  const az = Math.PI * t; // 0 = east (+X), PI = west (-X)
  const ce = Math.cos(el);
  out.set(Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce * 0.35 + 0.12 * ce);
  return out.normalize();
}

export function createSky(game, mats) {
  const { scene, renderer } = game;
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(-1, 0.1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uNightK: { value: 0 }, uSkyTime: { value: 0 },
    uSkyNoise: { value: mats.U.uNoise.value }, uCityGlow: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0.4, 0.55, 0.5).normalize() },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${SKY_GLSL}
      varying vec3 vDir;
      void main() { vec3 d = normalize(vDir); gl_FragColor = vec4(skyRadiance(d, true), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  scene.add(dome);

  // env-map scene (for glass / sea reflections and image based fill)
  const envScene = new THREE.Scene();
  const envMat = skyMat.clone(); envMat.uniforms = uniforms;
  envMat.fragmentShader = `${SKY_GLSL}
      varying vec3 vDir;
      void main() { vec3 d = normalize(vDir); gl_FragColor = vec4(skyRadiance(d, false), 1.0); }`;
  envMat.vertexShader = `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat);
  envScene.add(envDome);
  // a dark ground disc in the env so reflections below the horizon are not sky-bright
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
  envGround.position.y = -2; envScene.add(envGround);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 110;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 900 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);

  scene.fog = new THREE.FogExp2(0xbbbbbb, 0.0012);
  scene.background = null;

  const state = { hour: 18.4, sunDir: new THREE.Vector3(), lightLevel: 1, isNight: false, nightK: 0, envHour: -99 };
  const tmp = new THREE.Color();

  function lerpKey(h) {
    let i = 0; while (i < KC.length - 2 && KC[i + 1][0] <= h) i++;
    const a = KC[i], b = KC[i + 1];
    const t = (h - a[0]) / (b[0] - a[0] || 1);
    return a.map((v, k) => (k === 0 ? h : v.isColor ? v.clone().lerp(b[k], t) : v + (b[k] - v) * t));
  }

  function apply(h) {
    h = ((h % 24) + 24) % 24;
    state.hour = h;
    const k = lerpKey(h);
    const [, zen, hor, glow, sunCol, sunInt, hSky, hGround, hInt, fog, fogD, envInt, expo, cityGlow] = k;
    sunDirection(h, state.sunDir);
    const el = state.sunDir.y;
    state.lightLevel = THREE.MathUtils.clamp((el + 0.06) / 0.3, 0, 1);
    state.nightK = THREE.MathUtils.clamp((0.05 - el) / 0.17, 0, 1);
    state.isNight = state.lightLevel < 0.5;
    uniforms.uSunDir.value.copy(state.sunDir);
    uniforms.uZenith.value.copy(zen); uniforms.uHorizon.value.copy(hor); uniforms.uGlow.value.copy(glow);
    uniforms.uSunCol.value.copy(sunCol); uniforms.uNightK.value = state.nightK; uniforms.uCityGlow.value.copy(cityGlow);
    // light: sun above the horizon, else moon
    const moon = state.sunDir.y < -0.02;
    if (moon) {
      sun.color.set(0x8fa6d8); sun.intensity = 0.32;
      state.lightDir = uniforms.uMoonDir.value.clone();
    } else {
      sun.color.copy(sunCol); sun.intensity = sunInt;
      state.lightDir = state.sunDir.clone(); if (state.lightDir.y < 0.05) state.lightDir.y = 0.05; state.lightDir.normalize();
    }
    hemi.color.copy(hSky); hemi.groundColor.copy(hGround); hemi.intensity = hInt;
    scene.fog.color.copy(fog); scene.fog.density = fogD;
    scene.environmentIntensity = envInt;
    renderer.toneMappingExposure = expo;
    state.fogColor = fog;
    // night factors for city materials
    const lateNight = h < 5 ? 0.35 : h < 6.5 ? 0.25 : h > 22.5 ? 0.45 : h > 18 ? 0.62 : 0.25;
    mats.U.uNight.value = Math.max(state.nightK, 0.25 * (1 - state.lightLevel));
    mats.U.uLit.value = lateNight;
    mats.U.uShop.value = ((h > 9.5 && h < 23.3) ? 1.0 : 0.1) * (1 - 0.75 * state.lightLevel);
    mats.U.uStreet.value = THREE.MathUtils.clamp((0.65 - state.lightLevel) / 0.5, 0, 1);
    if (Math.abs(state.envHour - h) > 0.08) updateEnv();
  }

  function updateEnv() {
    state.envHour = state.hour;
    const old = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 200);
    scene.environment = envRT.texture;
    if (old) old.dispose();
  }

  const _t = new THREE.Vector3(), _f = new THREE.Vector3();
  function update(dt, cam) {
    uniforms.uSkyTime.value += dt;
    // shadow camera follows the active camera: centre on a point ahead of it, snapped to texels
    cam.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1); _f.normalize();
    _t.copy(cam.position).addScaledVector(_f, S * 0.55); _t.y = 0;
    const texel = (2 * S) / sun.shadow.mapSize.x;
    // snap in light space
    const ld = state.lightDir || state.sunDir;
    const right = new THREE.Vector3().crossVectors(ld, new THREE.Vector3(0, 1, 0)).normalize();
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(right, ld).normalize();
    const rx = Math.round(_t.dot(right) / texel) * texel - _t.dot(right), uy = Math.round(_t.dot(up) / texel) * texel - _t.dot(up);
    _t.addScaledVector(right, rx).addScaledVector(up, uy);
    sun.target.position.copy(_t);
    sun.position.copy(_t).addScaledVector(ld, 450);
    sun.target.updateMatrixWorld();
  }

  return { state, apply, update, uniforms, sun, hemi, dome, updateEnv };
}
