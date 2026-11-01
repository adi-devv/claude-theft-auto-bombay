// The Arabian Sea / Back Bay / harbour: animated water shader with sky reflections, sun glitter, shore foam,
// streaks of the Queen's Necklace reflected at night; the sea-wall parapet people sit on; tetrapods.
import * as THREE from 'three';
import { SKY_GLSL } from './sky.js';
import { mulberry } from './textures.js';
import { KERB_H } from './streets.js';

const SHORE = { x0: -2100, z0: -2000, size: 3600, res: 1024 };

function makeShoreTexture(polys) {
  const R = SHORE.res, c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, R, R);
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = '#fff';
  for (const poly of polys) {
    ctx.beginPath();
    poly.forEach(([x, z], i) => { const px = (x - SHORE.x0) / SHORE.size * R, pz = (z - SHORE.z0) / SHORE.size * R; if (i) ctx.lineTo(px, pz); else ctx.moveTo(px, pz); });
    ctx.closePath(); ctx.fill();
  }
  ctx.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function buildSea(game, ctx) {
  const { scene, roads } = game;
  const { mats, sky, fields, batch } = ctx;
  const seaY = roads.coast.seaLevel;
  const shoreTex = makeShoreTexture([fields.landPoly, ...(ctx.farLandPolys || [])]);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uNoise: { value: null }, uShore: { value: null }, uShoreBox: { value: new THREE.Vector3(SHORE.x0, SHORE.z0, SHORE.size) },
    uLight: { value: 1 }, uNightW: { value: 0 },
  }]);
  uniforms.uNoise.value = mats.U.uNoise.value; uniforms.uShore.value = shoreTex;
  Object.assign(uniforms, sky.uniforms); // shared sky uniforms (same objects → auto-updated)
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      ${SKY_GLSL}
      uniform float uTime; uniform sampler2D uNoise; uniform sampler2D uShore; uniform vec3 uShoreBox; uniform float uLight; uniform float uNightW;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float H(vec2 q) { return texture2D(uNoise, q).g; }
      void main() {
        vec2 p = vW.xz; float t = uTime;
        vec2 q1 = p * 0.008 + vec2(t * 0.0035, t * 0.002);
        vec2 q2 = p * 0.031 + vec2(-t * 0.009, t * 0.006);
        vec2 q3 = p * 0.11 + vec2(t * 0.02, -t * 0.017);
        float e = 1.0 / 256.0;
        float dist = length(cameraPosition - vW);
        float detail = 1.0 - smoothstep(60.0, 400.0, dist);
        float dx = (H(q1 + vec2(e, 0)) - H(q1 - vec2(e, 0))) * 1.0 + (H(q2 + vec2(e, 0)) - H(q2 - vec2(e, 0))) * 0.7 + (H(q3 + vec2(e, 0)) - H(q3 - vec2(e, 0))) * 0.5 * detail;
        float dz = (H(q1 + vec2(0, e)) - H(q1 - vec2(0, e))) * 1.0 + (H(q2 + vec2(0, e)) - H(q2 - vec2(0, e))) * 0.7 + (H(q3 + vec2(0, e)) - H(q3 - vec2(0, e))) * 0.5 * detail;
        float strength = mix(2.2, 5.0, detail);
        vec3 n = normalize(vec3(-dx * strength, 1.0, -dz * strength));
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, n); R.y = abs(R.y) + 0.02; R = normalize(R);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 refl = skyRadiance(R, false);
        float sd = max(dot(R, uSunDir), 0.0);
        vec3 glit = uSunCol * (pow(sd, 900.0) * 60.0 + pow(sd, 90.0) * 1.2) * (1.0 - uNightK);
        vec2 suv = (vW.xz - uShoreBox.xy) / uShoreBox.z;
        float shore = texture2D(uShore, suv).r;
        vec3 deep = vec3(0.025, 0.06, 0.065) * (0.25 + 0.75 * uLight);
        vec3 murky = vec3(0.09, 0.09, 0.06) * (0.25 + 0.75 * uLight);
        vec3 body = mix(deep, murky, smoothstep(0.05, 0.6, shore));
        vec3 col = mix(body, refl, fres) + glit;
        // foam along the sea wall / tetrapods
        float fn = texture2D(uNoise, p * 0.09 + vec2(t * 0.03, t * 0.02)).r;
        float band = smoothstep(0.45, 0.9, shore) * (0.5 + 0.5 * sin(t * 0.9 - shore * 9.0 + fn * 6.0));
        float foam = smoothstep(0.45, 0.8, band * (0.6 + fn * 0.8));
        col = mix(col, vec3(0.75, 0.75, 0.72) * (0.15 + 0.85 * uLight) + uCityGlow * 0.6, foam * 0.55);
        // warm city light on the water at night
        col += uCityGlow * 0.25 * uNightK * fres;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), mat);
  sea.position.set(-400, seaY, -200);
  sea.renderOrder = -1;
  scene.add(sea);

  // ---- parapet wall along the Marine Drive sea edge (+ seats) and other sea frontages
  const seats = [];
  const se = roads.seaEdge;
  const parapetPts = [];
  for (let i = 0; i < se.length; i++) parapetPts.push(se[i]);
  // extend along the visual coast (north) a little for continuity
  if (fields.coastExt) for (const p of fields.coastExt) parapetPts.push(p);
  buildParapet(batch, parapetPts, seats, 0.6, 0.75);
  // tetrapods
  const tetras = buildTetrapods(scene, parapetPts, seaY, ctx);

  // ---- necklace reflection streaks (instanced quads lying on the water)
  const streaks = buildStreaks(scene, ctx.reflectLights || [], seaY, uniforms, mats);

  return {
    sea, seats, tetras,
    update(dt, state) {
      uniforms.uTime.value += dt;
      uniforms.uLight.value = state.lightLevel;
      if (streaks) streaks.material.uniforms.uNight.value = mats.U.uStreet.value;
      if (streaks) streaks.material.uniforms.uTime.value = uniforms.uTime.value;
    },
  };
}

function buildParapet(batch, pts, seats, thick, height) {
  // pts ordered south→north along the sea edge; sea is on the LEFT (west) of travel
  const pos = [], nrm = [], uv = [], idx = [];
  const y0 = KERB_H, y1 = KERB_H + height;
  let u = 0;
  const N = pts.length;
  const normals = [];
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    normals.push([tz, -tx]); // left = towards the sea
  }
  for (let i = 0; i < N - 1; i++) {
    const A = pts[i], B = pts[i + 1], nA = normals[i], nB = normals[i + 1];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    // outer edge at the sea edge (+0.05 overhang), inner edge `thick` inland
    const Ao = [A[0] + nA[0] * 0.05, A[1] + nA[1] * 0.05], Bo = [B[0] + nB[0] * 0.05, B[1] + nB[1] * 0.05];
    const Ai = [A[0] - nA[0] * thick, A[1] - nA[1] * thick], Bi = [B[0] - nB[0] * thick, B[1] - nB[1] * thick];
    const quad = (p0, p1, p2, p3, n0, n1, us) => {
      const b = pos.length / 3; pos.push(...p0, ...p1, ...p2, ...p3); nrm.push(...n0, ...n1, ...n1, ...n0); uv.push(...us); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    // top (y1): Ai,Bi,Bo,Ao  (winding to face up: check)
    const top = [[Ai[0], y1, Ai[1]], [Ao[0], y1, Ao[1]], [Bo[0], y1, Bo[1]], [Bi[0], y1, Bi[1]]];
    const cr = (top[1][2] - top[0][2]) * (top[2][0] - top[0][0]) - (top[1][0] - top[0][0]) * (top[2][2] - top[0][2]);
    const tq = cr > 0 ? top : [top[0], top[3], top[2], top[1]];
    quad(tq[0], tq[1], tq[2], tq[3], [0, 1, 0], [0, 1, 0], [u, 0, u, thick, u + L, thick, u + L, 0].slice(0, 8));
    // inner face (facing land: -n)
    const inner = [[Ai[0], y0, Ai[1]], [Bi[0], y0, Bi[1]], [Bi[0], y1, Bi[1]], [Ai[0], y1, Ai[1]]];
    const fn = [-nA[0], 0, -nA[1]], fnB = [-nB[0], 0, -nB[1]];
    // triangle (a0,b0,b1) normal ∝ (-ez, ex): want facing -n
    const ex = Bi[0] - Ai[0], ez = Bi[1] - Ai[1];
    if (-ez * fn[0] + ex * fn[2] > 0) quad(inner[0], inner[1], inner[2], inner[3], fn, fnB, [u, y0, u + L, y0, u + L, y1, u, y1]);
    else quad(inner[1], inner[0], inner[3], inner[2], fnB, fn, [u + L, y0, u, y0, u, y1, u + L, y1]);
    // outer face (facing sea), down to below the sea surface
    const yb = -3.5;
    const outer = [[Ao[0], yb, Ao[1]], [Bo[0], yb, Bo[1]], [Bo[0], y1, Bo[1]], [Ao[0], y1, Ao[1]]];
    const on = [nA[0], 0, nA[1]], onB = [nB[0], 0, nB[1]];
    const ex2 = Bo[0] - Ao[0], ez2 = Bo[1] - Ao[1];
    if (-ez2 * on[0] + ex2 * on[2] > 0) quad(outer[0], outer[1], outer[2], outer[3], on, onB, [u, yb, u + L, yb, u + L, y1, u, y1]);
    else quad(outer[1], outer[0], outer[3], outer[2], onB, on, [u + L, yb, u, yb, u, y1, u + L, y1]);
    // seats every ~3.5 m
    const nSeat = Math.floor(L / 3.5);
    for (let k = 0; k < nSeat; k++) {
      const t = (k + 0.5) / nSeat;
      const x = A[0] + (B[0] - A[0]) * t - nA[0] * thick * 0.5, z = A[1] + (B[1] - A[1]) * t - nA[1] * thick * 0.5;
      if (z < -560 || z > 470) continue;
      seats.push({ x, z, y: y1, heading: Math.atan2(nA[0], nA[1]) });
    }
    u += L;
  }
  // weathered whitewashed basalt
  batch.addRaw('facade', pos, nrm, uv, idx, { color: 0x9a948a, facade: [3, 3, 6, 0.61 + 40] });
}

function tetrapodGeometry() {
  const legs = [];
  const dirs = [[0, 1, 0], [0.9428, -0.3333, 0], [-0.4714, -0.3333, 0.8165], [-0.4714, -0.3333, -0.8165]];
  for (const d of dirs) {
    const g = new THREE.CylinderGeometry(0.26, 0.52, 1.35, 5, 1, true);
    g.translate(0, 0.675, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
    g.applyQuaternion(q);
    legs.push(g.toNonIndexed());
  }
  // merge
  const pos = [], nrm = [];
  for (const g of legs) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildTetrapods(scene, pts, seaY, ctx) {
  const rnd = mulberry(4242);
  const geo = tetrapodGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = ctx.mats.U.uNoise;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n varying vec3 vTW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vTW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n uniform sampler2D uNoise; varying vec3 vTW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec4 n = texture2D(uNoise, vTW.xz * 0.3 + vTW.y * 0.2);
          float wet = 1.0 - smoothstep(-1.9, -0.6, vTW.y);
          diffuseColor.rgb *= (0.75 + n.g * 0.4) * mix(1.0, 0.45, wet);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.14, 0.1), wet * 0.35 * n.r); }`);
  };
  const items = [];
  const N = pts.length;
  for (let i = 0; i < N - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    let tx = B[0] - A[0], tz = B[1] - A[1]; const L = Math.hypot(tx, tz); if (L < 0.1) continue; tx /= L; tz /= L;
    const nx = tz, nz = -tx; // sea side
    for (let s = 0; s < L; s += 2.0) {
      for (let row = 0; row < 3; row++) {
        if (row === 2 && rnd() < 0.4) continue;
        const off = 1.2 + row * 1.9 + rnd() * 0.8;
        const along = s + (row % 2) * 0.8 + rnd() * 0.5;
        const x = A[0] + tx * along + nx * off, z = A[1] + tz * along + nz * off;
        const y = seaY + 0.5 - row * 0.65 + rnd() * 0.5;
        items.push([x, y, z, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, 0.95 + rnd() * 0.3, 0.72 + rnd() * 0.25]);
      }
    }
  }
  // split into chunks along the coast for frustum culling
  const chunks = 6, per = Math.ceil(items.length / chunks);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const meshes = [];
  for (let k = 0; k < chunks; k++) {
    const part = items.slice(k * per, (k + 1) * per); if (!part.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, part.length);
    part.forEach(([x, y, z, rx, ry, rz, s, v], i) => {
      e.set(rx, ry, rz); q.setFromEuler(e); p.set(x, y, z); sc.setScalar(s);
      m.compose(p, q, sc); im.setMatrixAt(i, m); c.setRGB(0.62 * v, 0.6 * v, 0.56 * v); im.setColorAt(i, c);
    });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im); meshes.push(im);
  }
  return { meshes, count: items.length };
}

function buildStreaks(scene, lights, seaY, seaUniforms, mats) {
  if (!lights.length) return null;
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const lp = new Float32Array(lights.length * 4);
  lights.forEach((l, i) => { lp[i * 4] = l.x; lp[i * 4 + 1] = l.y; lp[i * 4 + 2] = l.z; lp[i * 4 + 3] = l.i ?? 1; });
  geo.setAttribute('aLight', new THREE.InstancedBufferAttribute(lp, 4));
  geo.instanceCount = lights.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uSea: { value: seaY + 0.04 }, uNight: { value: 0 }, uTime: { value: 0 }, uNoise: mats.U.uNoise, uCol: { value: new THREE.Color(1.0, 0.6, 0.25) } },
    vertexShader: `
      attribute vec4 aLight; uniform float uSea; varying vec2 vUv; varying float vI; varying vec3 vW; varying float vD;
      void main() {
        vec3 L = aLight.xyz; vec3 C = cameraPosition;
        vec2 d = L.xz - C.xz; float D = length(d); vec2 dir = d / max(D, 0.001);
        float hc = max(C.y - uSea, 0.3), hl = max(L.y - uSea, 0.5);
        float dr = D * hc / (hc + hl);
        float s0 = max(dr * 0.55, 1.5), s1 = D - 1.5;
        float t = position.y + 0.5; // 0 near camera .. 1 near light
        float s = mix(s0, s1, t);
        vec2 side = vec2(-dir.y, dir.x);
        float w = clamp(D * 0.01, 0.7, 6.0) * (0.6 + 0.8 * t);
        vec2 xz = C.xz + dir * s + side * position.x * w;
        vW = vec3(xz.x, uSea, xz.y);
        vUv = vec2(position.x + 0.5, t); vI = aLight.w; vD = D;
        if (s1 <= s0) vI = 0.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: `
      uniform float uNight; uniform float uTime; uniform sampler2D uNoise; uniform vec3 uCol;
      varying vec2 vUv; varying float vI; varying vec3 vW; varying float vD;
      void main() {
        float across = exp(-pow((vUv.x - 0.5) * 3.2, 2.0));
        float along = smoothstep(0.0, 0.5, vUv.y) * (0.35 + 0.65 * smoothstep(0.55, 1.0, vUv.y));
        float n = texture2D(uNoise, vW.xz * vec2(0.08, 0.25) + vec2(0.0, uTime * 0.05)).r;
        float sparkle = smoothstep(0.35, 0.8, n);
        float fade = exp(-vD * 0.0011);
        float a = across * along * (0.25 + 0.9 * sparkle) * vI * uNight * fade;
        gl_FragColor = vec4(uCol * a * 1.4, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}
