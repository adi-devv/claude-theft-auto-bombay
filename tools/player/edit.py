from pathlib import Path
p=Path('work/player/src/player/player.js'); s=p.read_text(encoding='utf-8')
s=s.replace('let lastHitTime = -9, seq = null;', 'let lastHitTime = -9, seq = null;\n  const vehicleContacts = new Set(), downHitVehicles = new Set();')
s=s.replace('    collideVehicles(dt);\n    const col', '    collideVehicles(dt);\n    collidePeds();\n    const col')
s=s.replace('  function collideVehicles(dt) {\n    for', '''  function collidePeds() {
    if (p.state !== 'normal' || p.airborne || ['down', 'tumble', 'getup'].includes(p.action)) return;
    const push = game.peds?.pushFrom || game.pedSystem?.pushFrom;
    if (typeof push === 'function') push.call(game.peds?.pushFrom ? game.peds : game.pedSystem, p.position, p.velocity, p.radius);
    // Resolve the player's side as well: older crowd systems do not expose pushFrom.
    for (const ped of game.peds || []) {
      if (!ped?.position || ['down', 'dead', 'driver'].includes(ped.state)) continue;
      const dx = p.position.x - ped.position.x, dz = p.position.z - ped.position.z;
      const d = Math.hypot(dx, dz), overlap = p.radius + (ped.radius || 0.29) - d;
      if (overlap <= 0) continue;
      const nx = d > 1e-5 ? dx / d : -Math.sin(p.heading), nz = d > 1e-5 ? dz / d : -Math.cos(p.heading);
      p.position.x += nx * overlap; p.position.z += nz * overlap;
      const vn = p.velocity.x * nx + p.velocity.z * nz;
      if (vn < 0) { p.velocity.x -= nx * vn * 0.85; p.velocity.z -= nz * vn * 0.85; }
    }
  }

  function collideVehicles(dt) {
    if (!['down', 'tumble', 'getup'].includes(p.action)) downHitVehicles.clear();
    const touching = new Set();
    for''')
s=s.replace('      if (!c) continue;\n      // relative', '      if (!c) continue;\n      touching.add(v);\n      // relative')
s=s.replace('const closing = cvx * c.nx + cvz * c.nz;', 'const closing = (cvx - p.velocity.x) * c.nx + (cvz - p.velocity.z) * c.nz;')
s=s.replace("if (!ignored && closing > HIT_MIN_CLOSING && game.time - lastHitTime > 0.6 && p.state === 'normal' && p.action !== 'tumble') {", "if (!ignored && !vehicleContacts.has(v) && !downHitVehicles.has(v) && closing > HIT_MIN_CLOSING && game.time - lastHitTime > 0.2 && p.state === 'normal') {\n        downHitVehicles.add(v);")
s=s.replace('    }\n  }\n\n  function knockDown', '    }\n    vehicleContacts.clear();\n    for (const v of touching) vehicleContacts.add(v);\n  }\n\n  function knockDown')
p.write_text(s,encoding='utf-8')
p=Path('work/player/src/player/cameras.js'); s=p.read_text(encoding='utf-8'); start=s.index('    // camera collision against buildings:'); end=s.index('    // aim along yaw/pitch',start)
s=s[:start]+'''    // Sweep a small camera volume from the player's unobstructed position. Pull in
    // immediately on obstruction and ease back out once the path is clear.
    const col = game.collision, radius = 0.18;
    const baseX = player.position.x, baseZ = player.position.z;
    const targetX = this.pivot.x + rx * this.shoulder - fx * cp * want;
    const targetZ = this.pivot.z + rz * this.shoulder - fz * cp * want;
    const dx = targetX - baseX, dz = targetZ - baseZ, length = Math.hypot(dx, dz);
    let fraction = 1;
    if (col && length > 0.001) {
      const steps = Math.ceil(length / 0.08);
      for (let i = 1; i <= steps; i++) {
        const f = i / steps, y = this.pivot.y + spch * want * f;
        if (col.queryCircle(baseX + dx * f, baseZ + dz * f, radius).some(c => c.shape.h > y - radius)) {
          fraction = Math.max(0, (i - 1) / steps); break;
        }
      }
    }
    this.curFraction = this.curFraction === undefined ? fraction : fraction < this.curFraction ? fraction : damp(this.curFraction, fraction, 3, dt);
    this.curDist = want * this.curFraction;
    cam.position.set(baseX + dx * this.curFraction, Math.max(0.35, this.pivot.y + spch * this.curDist), baseZ + dz * this.curFraction);
''' +s[end:]; p.write_text(s,encoding='utf-8')
p=Path('work/player/src/ui/hud.js'); s=p.read_text(encoding='utf-8'); s=s.replace('bigOpen = false, lockedOnce = false;', 'bigOpen = false, lockedOnce = false, mapHadLock = false, resumeLook = false;')
s=s.replace("    if (on) { if (document.pointerLockElement) document.exitPointerLock?.(); drawBigMap(); }", """    if (on) { mapHadLock = !!document.pointerLockElement; if (mapHadLock) document.exitPointerLock?.(); drawBigMap(); }
    else if (mapHadLock && !pausedByUs) {
      resumeLook = true;
      try { const r = game.renderer.domElement.requestPointerLock?.(); if (r?.catch) r.catch(() => {}); } catch (_) { /* prompt remains visible */ }
    }""")
s=s.replace('if (document.pointerLockElement) { lockedOnce = true; return; }','if (document.pointerLockElement) { lockedOnce = true; resumeLook = false; return; }')
s=s.replace("    if (area !== lastArea) { areaEl.textContent = area; areaEl.classList.add('show'); areaT = t + 4.5; lastArea = area; }", "    if (area !== lastArea || street !== lastStreet) { const distinct = area && (!street || area.trim().toLowerCase() !== street.trim().toLowerCase()); areaEl.textContent = area || ''; areaEl.classList.toggle('show', !!distinct); areaT = distinct ? t + 4.5 : 0; lastArea = area; }")
s=s.replace('    if (near) {\n      const jack', "    if (resumeLook && !document.pointerLockElement) prompt.innerHTML = '<span>Click to resume mouse look</span>';\n    else if (near) {\n      const jack")
s=s.replace("prompt.classList.toggle('show', !!near);", "prompt.classList.toggle('show', !!near || (resumeLook && !document.pointerLockElement));")
s=s.replace('    const p = game.player;\n    if (p) {\n      const [sx, sy] = P', """    for (const ped of game.peds || []) {
      if (!ped.isCop || ped.state === 'dead' || !ped.position) continue;
      const [sx, sy] = P(ped.position.x, ped.position.z);
      g.beginPath(); g.arc(sx, sy, 4, 0, 7); g.fillStyle = flash ? '#ff6b78' : '#6c9bff'; g.fill();
      g.lineWidth = 1; g.strokeStyle = '#0a0610'; g.stroke();
    }
    const p = game.player;
    if (p) {
      const [sx, sy] = P""")
p.write_text(s,encoding='utf-8')
p=Path('work/player/index.html'); s=p.read_text(encoding='utf-8').replace('  <title>', '  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2712%27 fill=%27%231a1020%27/%3E%3Cpath d=%27M8 42h48v10H8z%27 fill=%27%23ffcf54%27/%3E%3Cpath d=%27M15 40l5-12h24l6 12z%27 fill=%27%23ff8a3d%27/%3E%3Ccircle cx=%2718%27 cy=%2752%27 r=%275%27 fill=%27%23fff3df%27/%3E%3Ccircle cx=%2746%27 cy=%2752%27 r=%275%27 fill=%27%23fff3df%27/%3E%3C/svg%3E" />\n  <title>'); p.write_text(s,encoding='utf-8')
