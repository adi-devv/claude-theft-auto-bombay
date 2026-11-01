import * as THREE from 'three';
import { appearance } from './wardrobe.js';
import { createCrowd } from './crowd.js';

// Optional single character, using the same appearance and animation as the crowd.
export function createHumanoid(opts = {}) {
  const group = new THREE.Group(), bodyScene = new THREE.Scene();
  const renderer = createCrowd(bodyScene, 1, 0);
  for (const mesh of Object.values(renderer.meshes)) group.add(mesh);
  const ped = { id: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: 0,
    appearance: appearance(opts.rng || Math.random, opts.kind), phase: 0, seed: 1, state: 'idle', activity: '', downTime: 0 };
  if (opts.shirt != null) ped.appearance.shirt = opts.shirt;
  if (opts.skin != null) ped.appearance.skin = opts.skin;
  if (opts.scale != null) ped.appearance.scale = opts.scale;
  const camera = new THREE.PerspectiveCamera(90, 1, .01, 100);
  camera.position.set(0, 1, 5); camera.lookAt(0, 1, 0);
  let time = 0;
  function update(dt, { speed = 0, state = speed > .1 ? 'walk' : 'idle' } = {}) {
    time += dt; ped.phase += speed * dt * 5; ped.velocity.z = speed; ped.state = state;
    if (state === 'lie') ped.state = 'down';
    if (state === 'run') ped.state = 'flee';
    ped.activity = state === 'sit' ? 'sit' : ''; if (state === 'sit') { ped.state = 'idle'; ped.seatY = .8; }
    if (ped.state === 'down' || ped.state === 'dead') ped.downTime += dt; else ped.downTime = 0;
    renderer.update([ped], camera, time);
  }
  update(0);
  return { group, update, dispose: () => renderer.dispose() };
}
