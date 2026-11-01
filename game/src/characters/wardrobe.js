// All crowd bodies share these geometries. Models face +Z, in metres.
import * as THREE from 'three';

export const SKINS = [0x633d29, 0x825133, 0xa36742, 0xb77f53, 0xc99268, 0x71472f];
const CLOTH = [0xe85446, 0x188c91, 0xe8a528, 0x794499, 0x245a92, 0xe8799b, 0x76a354, 0xf0d2a1, 0x9f2449];
export function appearance(rng, kind = 'civ', role = '') {
  const pick = a => a[Math.floor(rng() * a.length)];
  const variant = kind === 'cop' ? 'cop' : role === 'cricket' ? 'cricket' : role === 'vendor' ? pick(['kurta', 'casual', 'office']) : pick(['office', 'kurta', 'sari', 'salwar', 'casual', 'school', 'casual']);
  const female = variant === 'sari' || variant === 'salwar';
  return { variant, female, skin: pick(SKINS), shirt: variant === 'cop' ? 0xb69b68 : variant === 'cricket' ? 0xe7e3cf : variant === 'school' ? 0xc8d8e3 : variant === 'office' ? pick([0xb6cdda, 0xe8ded1, 0x9db8c7, 0xe2c4cd]) : pick(CLOTH),
    trousers: variant === 'cop' ? 0x9f8557 : variant === 'cricket' ? 0xd6d1b8 : variant === 'school' ? 0x293854 : pick([0x293348, 0x474a3d, 0x343b54, 0xe6d8bc]),
    trim: pick(CLOTH), hair: rng() < .12 ? 0x66605a : 0x211c1b, moustache: !female && variant !== 'school' && rng() < .45,
    scale: variant === 'school' ? .72 + rng() * .13 : .91 + rng() * .15, build: .88 + rng() * .23 };
}

export function bodyGeometries() {
  const torso = new THREE.BoxGeometry(1, 1, 1);
  const a = torso.attributes.position;
  for (let i = 0; i < a.count; i++) a.setX(i, a.getX(i) * (a.getY(i) > 0 ? 1 : .83));
  torso.computeVertexNormals();
  const signs = {};
  for (const [i, name] of ['chai', 'bhutta', 'chana', 'best'].entries()) {
    const g = new THREE.PlaneGeometry(1, 1), uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setY(j, (3 - i + uv.getY(j)) / 4);
    signs[name] = g;
  }
  return {
    torso, box: new THREE.BoxGeometry(1, 1, 1), head: new THREE.SphereGeometry(1, 10, 8),
    hair: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * .53),
    limb: new THREE.CylinderGeometry(.86, 1, 1, 7), shoe: new THREE.BoxGeometry(1, 1, 1),
    dress: new THREE.CylinderGeometry(.63, 1, 1, 10), sash: new THREE.BoxGeometry(1, 1, 1),
    detail: new THREE.BoxGeometry(1, 1, 1), round: new THREE.CylinderGeometry(1, 1, 1, 10),
    canopy: new THREE.ConeGeometry(1, .35, 10), ball: new THREE.SphereGeometry(1, 7, 5),
    shadow: new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
    ...signs,
  };
}

// A procedural rig, shared by both the instanced crowd and createHumanoid.
// Each call emits local part transforms; no Object3D is allocated per pedestrian.
export function poseBody(p, time, emit, detail = true) {
  const a = p.appearance, variant = a.variant, skin = a.skin, shirt = a.shirt;
  const sitting = p.activity === 'sit' && p.state === 'idle';
  const down = p.state === 'down' || p.state === 'dead';
  const speed = Math.hypot(p.velocity?.x || 0, p.velocity?.z || 0);
  const running = p.state === 'flee' || speed > 2.2;
  const gait = Math.sin(p.phase || 0), amp = down || sitting ? 0 : Math.min(1, speed / 1.2) * (running ? .85 : .48);
  const cricket = p.activity === 'cricket' && p.state !== 'flee' && !down;
  const swing = cricket && p.role === 'batsman' ? Math.sin(Math.max(0, (time + p.matchPhase) % 14 - 7.4) * 8) * (((time + p.matchPhase) % 14 > 7.4 && (time + p.matchPhase) % 14 < 8.1) ? 1 : 0) : 0;
  const hip = sitting ? .04 : .82;
  const bob = sitting || down ? 0 : Math.abs(gait) * amp * .055 + Math.sin(time * 1.9 + p.seed) * .008;
  const lean = running ? .12 : 0;
  emit('torso', 0, hip + .32 + bob, lean, .43 * a.build, .57, .25, shirt, -.06 * speed, 0, 0);
  emit('box', 0, hip + bob, 0, .34 * a.build, .19, .23, a.trousers);
  emit('limb', 0, hip + .67 + bob, lean, .073, .13, .073, skin);
  emit('head', 0, hip + .84 + bob, lean, .146, .193, .145, skin);
  emit('hair', 0, hip + .89 + bob, lean - .014, .155, .159, .153, a.hair);
  if (a.female) emit('head', 0, hip + .82 + bob, lean - .155, .09, .11, .08, a.hair);
  if (detail) {
    for (const side of [-1, 1]) {
      emit('detail', side * .052, hip + .872 + bob, lean + .135, .022, .018, .017, 0x211a17);
      emit('head', side * .146, hip + .84 + bob, lean, .026, .045, .025, skin);
    }
    emit('detail', 0, hip + .82 + bob, lean + .147, .038, .049, .034, skin);
    if (a.moustache) emit('detail', 0, hip + .779 + bob, lean + .137, .081, .023, .019, a.hair);
    emit('detail', 0, hip + .752 + bob, lean + .12, .043, .012, .02, 0x714438);
    // Collar / buttons, shirt pocket, dark belt. These use the same detail batch.
    if (!a.female) {
      for (const s of [-1, 1]) emit('detail', s * .055, hip + .57 + bob, lean + .133, .083, .08, .02, variant === 'cop' ? 0xc4ad80 : 0xe4ded0, 0, 0, s * -.4);
      emit('detail', .105, hip + .38 + bob, lean + .129, .105, .1, .012, shirt);
      for (const y of [.2, .32, .44]) emit('detail', 0, hip + y + bob, lean + .134, .012, .012, .013, 0x555052);
      emit('detail', 0, hip + .035 + bob, .13, .34 * a.build, .041, .025, 0x37302a);
    }
  }
  const limb = (x1, y1, z1, x2, y2, z2, r, color) => emit('segment', x1, y1, z1, x2, y2, z2, r, color);
  for (const s of [-1, 1]) {
    const step = gait * amp * s;
    const hx = s * (down ? .15 : .105);
    const kneeY = sitting ? hip - .04 : hip - Math.cos(step) * .36;
    const kneeZ = sitting ? .37 : down ? (s > 0 ? .19 : -.07) : Math.sin(step) * .36;
    const lower = sitting ? -.08 : step - Math.max(0, -gait * s) * amp * .9;
    const footY = sitting ? kneeY - .37 : kneeY - Math.cos(lower) * .37;
    const footZ = sitting ? .41 : down ? kneeZ + (s > 0 ? -.12 : .02) : kneeZ + Math.sin(lower) * .37;
    limb(hx, hip, 0, hx, kneeY, kneeZ, .09, a.trousers);
    limb(hx, kneeY, kneeZ, hx, footY, footZ, .071, a.trousers);
    emit('shoe', hx, footY - .045, footZ + .055, .13, .09, .25, variant === 'cricket' || variant === 'school' ? 0xd1caba : 0x292727);
    const ax = s * (.255 * a.build), ay = hip + .55 + bob;
    let elbowZ = -step * .28 + lean, elbowY = ay - .25;
    let handZ = -step * .52 + lean, handY = elbowY - .22;
    if (sitting || p.activity === 'vendor') { elbowZ = .12; handZ = .28; handY = hip + .07; }
    if (cricket && p.role === 'batsman') { elbowZ = .28 + swing * .25; handZ = .42 + swing * .5; handY = hip + .15 + Math.abs(swing) * .7; }
    if (cricket && p.role === 'bowler' && (time + p.matchPhase) % 14 > 6.6 && (time + p.matchPhase) % 14 < 7.5 && s === 1) { elbowY = ay + .23; handY = ay + .5; handZ = .1; }
    const elbowX = ax + s * (down ? .19 : .025), handX = ax + s * (down ? .36 : .04);
    if (down) { elbowY += .14; handY += .22; elbowZ = s * .12; handZ = s * .16; }
    limb(ax, ay, lean, elbowX, elbowY, elbowZ, .075, shirt);
    limb(elbowX, elbowY, elbowZ, handX, handY, handZ, .055, variant === 'kurta' || a.female || variant === 'office' ? shirt : skin);
    emit('head', handX, handY, handZ, .057, .072, .05, skin);
  }
  if (variant === 'sari') {
    if (sitting) {
      emit('dress', 0, hip - .045, .2, .25, .46, .17, shirt, Math.PI / 2);
      emit('dress', 0, hip - .22, .4, .22, .42, .13, shirt);
    } else emit('dress', 0, hip - .35, .015, .25, .77, .17, shirt);
    emit('sash', .045, hip + .34 + bob, .146, .16, .64, .035, a.trim, 0, 0, -.42);
    emit('sash', -.18, hip + .2, -.15, .18, .85, .035, a.trim, .1, 0, -.1);
    if (detail && !sitting) for (const x of [-.12, -.05, .02, .09]) emit('detail', x, hip - .41, .175, .015, .58, .012, a.trim);
  } else if (variant === 'kurta' || variant === 'salwar') {
    emit('dress', 0, hip - (sitting ? .02 : .12), sitting ? .12 : .015, .23, sitting ? .32 : .49, .15, shirt, sitting ? .8 : 0);
    if (variant === 'salwar') for (const s of [-1, 1]) emit('sash', s * .14, hip + .26, s < 0 ? -.15 : .15, .13, .67, .028, a.trim, 0, 0, s * .1);
  }
  if (variant === 'office' || variant === 'school') {
    if (variant === 'office') emit('detail', 0, hip + .38, .15, .035, .27, .023, a.trim, 0, 0, -.08);
    else { emit('box', 0, hip + .31, -.2, .3, .35, .14, a.trim); for (const s of [-1, 1]) emit('sash', s * .14, hip + .36, .145, .035, .39, .02, a.trim); }
  }
  if (variant === 'cop') {
    emit('round', 0, hip + 1.01, -.005, .16, .083, .155, 0x8f7b52);
    emit('box', 0, hip + .97, .137, .22, .027, .13, 0x594c36);
    if (detail) {
      emit('detail', 0, hip + 1.008, .153, .035, .045, .014, 0xe6c276);
      emit('detail', -.112, hip + .4, .14, .046, .04, .015, 0xdac478);
      for (const s of [-1, 1]) emit('detail', s * .19, hip + .59, 0, .09, .023, .22, 0x6a634d);
    }
    emit('box', -.215, hip - .15, -.04, .035, .47, .035, 0x403829, 0, 0, -.15);
  }
  if (cricket && p.role === 'batsman') {
    emit('round', 0, hip + 1.01, -.005, .155, .07, .15, 0xdad6c5);
    emit('box', 0, hip + .98, .13, .22, .025, .13, 0xdad6c5);
    emit('box', .22, hip - .19 + Math.abs(swing) * .7, .49 + swing * .5, .105, .54, .055, 0xc29b60, -.3 - swing * 1.7);
    if (detail) for (const s of [-1, 1]) emit('box', s * .105, hip - .58, .095, .13, .27, .05, 0xe2dfcf);
  }
  if (p.activity === 'busStop' && p.place?.stopLeader && !down) {
    emit('limb', .52, .99, .35, .025, 1.98, .025, 0x754c41);
    emit('box', .52, 1.96, .35, .62, .33, .055, 0x8a3029);
    emit('best', .52, 1.96, .382, .57, .27, 1, 0xffffff);
  }
  if (p.activity === 'vendor' && !down) {
    const tea = p.role === 'chai', corn = p.role === 'bhutta';
    emit('box', 0, .62, .85, .94, .14, .6, corn ? 0x85452a : 0x3b7778);
    emit(tea ? 'chai' : corn ? 'bhutta' : 'chana', 0, .61, 1.155, .8, .15, 1, 0xffffff);
    for (const s of [-1, 1]) {
      emit('box', s * .38, .34, .85, .045, .56, .045, 0x4d4a43);
      emit('round', s * .4, .24, .85, .18, .045, .18, 0x282a2a, 0, 0, Math.PI / 2);
    }
    emit('round', -.12, .78, .85, .19, .23, .19, tea ? 0xa4a5a0 : 0xb68544);
    emit('round', -.12, .91, .85, .205, .023, .205, 0xd6c8a5);
    if (corn) for (let i = 0; i < 4; i++) emit('limb', -.29 + i * .16, .73, 1.01, .035, .22, .035, 0xe2bd4e, Math.PI / 2);
    else for (let i = 0; i < 3; i++) emit('round', .19 + i * .1, .74, .91, .035, .07, .035, tea ? 0xb77948 : 0xd9bc7e);
    // Small striped parasol; fittings share the body batches.
    emit('limb', -.38, 1.35, 1.03, .018, 1.42, .018, 0x77664c);
    emit('canopy', -.38, 2.08, 1.03, .8, 1, .8, a.trim);
  }
}
