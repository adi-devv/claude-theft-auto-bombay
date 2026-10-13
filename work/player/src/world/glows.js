// Light glows: one THREE.Points draw for every lamp / window-glow / beacon in the city. Each point keeps a
// minimum on-screen size so distant lamps still read as "pearls" of the Queen's Necklace.
import * as THREE from 'three';

export class Glows {
  constructor() { this.items = []; }
  /** kind: 0 = streetlight (night only), 1 = always-on beacon (aircraft red), 2 = dusk-on decorative */
  add(x, y, z, color, size = 3, kind = 0, minPx = 2.2) { this.items.push([x, y, z, color, size, kind, minPx]); }

  build(scene, U) {
    const n = this.items.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n * 3);
    const c = new THREE.Color();
    this.items.forEach(([x, y, z, color, size, kind, minPx], i) => {
      pos.set([x, y, z], i * 3); c.set(color); col.set([c.r, c.g, c.b], i * 3); sz.set([size, kind, minPx], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uNight: U.uStreet, uScale: { value: 600 }, uFogD: { value: 0.0012 }, uTime: U.uTime, uDay: { value: 0 } },
      vertexShader: `
        attribute vec3 aSize; attribute vec3 color; uniform float uNight; uniform float uScale; uniform float uFogD; uniform float uTime; uniform float uDay;
        varying vec3 vCol; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          float k = aSize.y;
          float on = k < 0.5 ? uNight : k < 1.5 ? (0.55 + 0.45 * step(0.5, fract(uTime * 0.5 + position.x * 0.01))) * max(uNight, 0.25) : max(uNight, 0.0);
          float px = aSize.x * uScale / max(d, 1.0);
          float minPx = aSize.z;
          float sizePx = max(px, minPx);
          // fade really small points by their sub-pixel coverage
          vA = on * clamp(px / minPx, 0.35, 1.0) * exp(-d * uFogD * 0.35);
          vCol = color;
          gl_PointSize = min(sizePx * 2.0, 220.0);
          gl_Position = projectionMatrix * mv;
          if (on < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
          float core = smoothstep(0.32, 0.0, r);
          float halo = exp(-r * r * 5.0) * 0.45;
          float a = (core + halo) * vA;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol * a * 1.6 + vec3(1.0) * core * vA * 0.35, 1.0);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 3;
    scene.add(pts);
    this.points = pts; this.material = mat;
    return pts;
  }

  update(camera, renderer, fogDensity) {
    if (!this.material) return;
    const h = renderer.getSize(new THREE.Vector2()).y * renderer.getPixelRatio();
    this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.material.uniforms.uFogD.value = fogDensity;
  }
}
