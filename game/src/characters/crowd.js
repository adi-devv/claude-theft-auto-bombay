import * as THREE from 'three';
import { bodyGeometries, poseBody } from './wardrobe.js';

export function createCrowd(scene, capacity = 512, groundY = .15) {
  const geometries = bodyGeometries(), meshes = {}, counts = {};
  const material = new THREE.MeshStandardMaterial({ roughness: .93, metalness: 0, emissive: 0x29231e, emissiveIntensity: .16 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float pedFade; varying float vPedFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPedFade = pedFade;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPedFade;').replace('#include <dithering_fragment>', 'if (vPedFade < fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233))) * 43758.5453)) discard;\n#include <dithering_fragment>');
  };
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x211e25, transparent: true, opacity: .2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 256;
  const context = canvas.getContext('2d');
  for (const [i, label] of ['CHAI · चहा', 'BHUTTA · भुट्टा', 'CHANA · चणा', 'BEST · बस थांबा'].entries()) {
    context.fillStyle = ['#307676', '#a14228', '#9a6330', '#a33026'][i]; context.fillRect(0, i * 64, 384, 64);
    context.strokeStyle = '#e9ca78'; context.lineWidth = 3; context.strokeRect(4, i * 64 + 4, 376, 56);
    context.fillStyle = '#fff1ca'; context.font = 'bold 34px "Nirmala UI", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, 192, i * 64 + 34);
  }
  const signTexture = new THREE.CanvasTexture(canvas); signTexture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
  for (const [name, geometry] of Object.entries(geometries)) {
    const mesh = new THREE.InstancedMesh(geometry, name === 'shadow' ? shadowMaterial : ['chai', 'bhutta', 'chana', 'best'].includes(name) ? signMaterial : material, capacity * (name === 'detail' ? 24 : name === 'limb' ? 14 : name === 'box' ? 16 : 10));
    mesh.name = 'Pedestrians / ' + name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('pedFade', new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
    mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = name !== 'shadow'; mesh.count = 0;
    scene.add(mesh); meshes[name] = mesh;
  }
  const root = new THREE.Matrix4(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), quat = new THREE.Quaternion(), euler = new THREE.Euler();
  const dir = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(), 2.7);
  let currentFade = 1;
  function emit(type, x, y, z, sx, sy, sz, tint, rx = 0, ry = 0, rz = 0) {
    if (type === 'segment') {
      pos.set((x + sx) / 2, (y + sy) / 2, (z + sz) / 2);
      dir.set(sx - x, sy - y, sz - z); const length = dir.length();
      quat.setFromUnitVectors(yAxis, dir.multiplyScalar(1 / Math.max(length, .0001)));
      scl.set(tint, length, tint); tint = rx; type = 'limb';
    } else {
      pos.set(x, y, z); scl.set(sx, sy, sz); quat.setFromEuler(euler.set(rx, ry, rz));
    }
    local.compose(pos, quat, scl); world.multiplyMatrices(root, local);
    const mesh = meshes[type], i = counts[type]++;
    if (i >= mesh.instanceMatrix.count) { counts[type]--; return; }
    mesh.setMatrixAt(i, world);
    mesh.geometry.attributes.pedFade.setX(i, currentFade);
    if (type !== 'shadow') { color.setHex(tint); mesh.setColorAt(i, color); }
  }
  let visible = 0, drawCalls = 0, frame = 0;
  function update(peds, camera, time) {
    frame++; visible = 0;
    for (const key in meshes) counts[key] = 0;
    camera.updateMatrixWorld(); projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projection);
    for (const p of peds) {
      if (p.removed) continue;
      const dist2 = (p.position.x - camera.position.x) ** 2 + (p.position.z - camera.position.z) ** 2;
      sphere.center.copy(p.position); sphere.center.y += .9;
      if (dist2 > 290 ** 2 || !frustum.intersectsSphere(sphere)) continue;
      visible++;
      const fallen = p.state === 'down' || p.state === 'dead';
      const fade = p.state === 'dead' ? Math.min(1, Math.max(0, (31 - p.downTime) / 3)) : 1;
      currentFade = fade;
      const scale = p.appearance.scale;
      const stride = dist2 > 160 ** 2 ? 8 : dist2 > 65 ** 2 ? 4 : 1;
      if (!p._pose || (frame + p.id) % stride === 0 || p._poseState !== p.state) {
        p._pose = []; p._poseState = p.state;
        poseBody(p, time, (...args) => p._pose.push(args), dist2 < 55 ** 2);
      }
      const sitting = p.activity === 'sit' && p.state === 'idle';
      const tilt = fallen ? Math.min(Math.PI / 2, p.downTime * 5) * (p.fallSign || 1) * (p.getUp ?? 1) : 0;
      pos.set(p.position.x, fallen ? groundY + .16 + (p.airY || 0) : sitting ? p.seatY : groundY, p.position.z);
      quat.setFromEuler(euler.set(0, p.heading, 0));
      root.compose(pos, quat, scl.set(scale, scale, scale));
      if (fallen) { local.makeRotationX(tilt); root.multiply(local); local.makeRotationZ((p.spin || 0) * (p.getUp ?? 1)); root.multiply(local); }
      for (const args of p._pose) emit(...args);
      root.identity();
      emit('shadow', p.position.x, groundY + .013, p.position.z, .36 * scale, 1, .24 * scale, 0);
      if (p.activity === 'cricket' && p.role === 'batsman' && !fallen) {
        const m = p.match, t = (time + m.phase) % 14;
        if (t > 7 && t < 10.6) {
          const f = Math.min(1, (t - 7) / .7), hit = Math.max(0, t - 7.7);
          const along = 8 - f * 16 - hit * 8, side = hit * 4;
          emit('ball', m.x + Math.sin(m.angle) * along + Math.cos(m.angle) * side, .25 + (hit > 0 ? Math.sin(Math.min(Math.PI, hit * 1.15)) * 3 : Math.sin(f * Math.PI) * .45), m.z + Math.cos(m.angle) * along - Math.sin(m.angle) * side, .055, .055, .055, 0xab3527);
        }
      }
    }
    drawCalls = 0;
    for (const key in meshes) {
      const mesh = meshes[key]; mesh.count = counts[key]; mesh.visible = mesh.count > 0;
      if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.attributes.pedFade.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; drawCalls++; }
    }
  }
  return { update, meshes, get visible() { return visible; }, get drawCalls() { return drawCalls; }, dispose() { for (const m of Object.values(meshes)) { m.removeFromParent(); m.geometry.dispose(); } material.dispose(); shadowMaterial.dispose(); signMaterial.dispose(); signTexture.dispose(); } };
}
