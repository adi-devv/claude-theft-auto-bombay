// Wanted level (GTA-style stars). Owned by the Police agent. See CONTRACT.md "Wanted".
//
// heat -> stars. Crimes only add heat when witnessed:
//   - by a cop (police unit within ~60 m with line of sight, or within 15 m) -> full weight, and the cop now SEES you;
//   - by civilians only (peds within 25 m) -> reduced weight, capped at 1-2 stars, and they phone in your position.
// Assaulting police (punching a cop, ramming a police car, hitting a cop with a car, jacking a police car):
//   +1 star, minimum 2 (3 s cooldown so one long scrape doesn't count three times).
// While any cop sees the player: seen = true, lastKnown follows the player.
// Unseen: stars flash, a search circle (radius grows slowly) sits on lastKnown. Being OUTSIDE the circle and unseen
// for CLEAR_TIME[level] seconds clears the level. Re-sighting resets the countdown.
const THRESH = [0, 10, 30, 60, 100, 160];
export const CLEAR_TIME = [0, 10, 15, 22, 28, 35];
export const SEARCH_R0 = [0, 80, 100, 120, 140, 160];
const SEARCH_GROWTH = 1.2;     // m/s
const SEARCH_MAX_K = 1.6;      // radius cap = R0 * k
const KNOWN_AFTER_CRIME = 5;   // s: dispatch "knows" where you are right after a witnessed crime / level set

const CRIMES = {
  punch:      { w: 10, civ: 0.4, civCap: 1, label: 'assault' },
  pedHit:     { w: 16, civ: 0.7, civCap: 1, label: 'hit-and-run' },
  pedKilled:  { w: 34, civ: 0.7, civCap: 2, label: 'vehicular homicide' },
  carjack:    { w: 16, civ: 0.7, civCap: 1, label: 'carjacking' },
  vehicleRam: { w: 5,  civ: 0.6, civCap: 1, label: 'reckless driving' },
  copAssault: { assault: true, label: 'assault on an officer' },
  policeRam:  { assault: true, label: 'ramming a police vehicle' },
};

const VEH_DESC = {
  taxi: 'a black-yellow Padmini taxi', sedan: 'a sedan', hatch: 'a hatchback', suv: 'an SUV',
  bus: 'a red BEST bus', police: 'a stolen police jeep', van: 'a van',
};

export function createWanted(game) {
  const ev = game.events;
  let sightingAge = 99, knownT = 0, unseenT = 0, escapeT = 0, assaultCD = 0, lastRadio = -99, wasSeen = false;
  let lostAnnounced = false;
  const cooldowns = {};

  const w = {
    level: 0, heat: 0, seen: false, flashing: false,
    lastKnown: { x: 0, z: 0 }, searchRadius: 0, escapeProgress: 0,
    lastCrime: null, stats: { crimes: 0, ignored: 0 },

    update(dt) {
      const p = game.player; if (!p) return;
      sightingAge += dt; knownT -= dt; assaultCD -= dt;
      for (const k in cooldowns) cooldowns[k] -= dt;
      if (p.state && p.state !== 'normal') { if (w.level) w.clear(true); return; }
      if (!w.level) { w.seen = false; w.flashing = false; w.searchRadius = 0; w.escapeProgress = 0; return; }
      const px = p.position.x, pz = p.position.z;
      w.seen = sightingAge < 0.35 || knownT > 0;
      if (knownT > 0) { w.lastKnown.x = px; w.lastKnown.z = pz; }
      const R0 = SEARCH_R0[w.level];
      if (w.seen) {
        if (!wasSeen && lostAnnounced && game.time - lastRadio > 6) radio(`Mobile ${unitNo()}: suspect re-sighted on ${where(px, pz)}! Moving in.`);
        w.flashing = false; unseenT = 0; escapeT = 0; w.searchRadius = R0; lostAnnounced = false;
      } else {
        w.flashing = true; unseenT += dt;
        w.searchRadius = Math.min(R0 * SEARCH_MAX_K, R0 + SEARCH_GROWTH * unseenT);
        const out = Math.hypot(px - w.lastKnown.x, pz - w.lastKnown.z) > w.searchRadius;
        if (out) escapeT += dt;
        if (unseenT > 2 && !lostAnnounced) {
          lostAnnounced = true;
          radio(`Control to all mobiles: visual lost near ${where(w.lastKnown.x, w.lastKnown.z)}. Search the area.`);
        }
        if (escapeT >= CLEAR_TIME[w.level]) {
          radio('Control: suspect has evaded pursuit. All mobiles resume patrol.');
          w.clear();
          return;
        }
      }
      w.escapeProgress = w.seen ? 0 : escapeT / CLEAR_TIME[w.level];
      wasSeen = w.seen;
    },

    /** A crime at (x,z). Escalates only if witnessed. Returns the stars gained (0 if unwitnessed). */
    addCrime(type, x, z, victim) {
      const p = game.player;
      if (!p || (p.state && p.state !== 'normal')) return 0;
      let def = CRIMES[type];
      if (!def) return 0;
      if (victim && (victim.isCop || victim.isPolice) && !def.assault) def = CRIMES.copAssault;
      if (x == null) { x = p.position.x; z = p.position.z; }
      w.stats.crimes++;
      const prev = w.level;
      const copSaw = def.assault || witnessedByCop(x, z);
      if (def.assault) {
        if (assaultCD > 0) { w.reportSighting(x, z, true); return 0; }
        assaultCD = 3;
        const nl = Math.min(5, Math.max(2, w.level + 1));
        w.heat = Math.max(w.heat, THRESH[nl]);
        setLvl(nl);
        w.reportSighting(x, z, true);
      } else if (copSaw) {
        w.heat += def.w;
        setLvl(Math.max(w.level, levelFor(w.heat)));
        w.reportSighting(x, z, true);
      } else {
        const civ = civilianWitnesses(x, z);
        if (!civ) { w.stats.ignored++; return 0; }
        w.heat += def.w * def.civ * Math.min(1.4, 0.8 + civ * 0.2);
        setLvl(Math.max(w.level, Math.min(levelFor(w.heat), Math.max(w.level, def.civCap))));
        if (w.level) w.reportSighting(x, z, false);
      }
      w.lastCrime = { type, x, z, t: game.time, cop: !!copSaw };
      if (w.level > prev) {
        knownT = Math.max(knownT, copSaw ? KNOWN_AFTER_CRIME : 2.5);
        radio(dispatchLine(prev, def));
      }
      return w.level - prev;
    },

    /** A cop (strong=true) or civilian report of the player at (x,z). */
    reportSighting(x, z, strong = true) {
      if (!w.level) return;
      w.lastKnown.x = x; w.lastKnown.z = z;
      if (strong) sightingAge = 0;
      else { unseenT = 0; escapeT = Math.max(0, escapeT - 4); }
    },

    setLevel(n) {
      n = Math.max(0, Math.min(5, Math.round(n)));
      if (!n) { w.clear(); return; }
      w.heat = Math.max(THRESH[n], Math.min(w.heat, THRESH[Math.min(5, n + 1)] - 1));
      if (n < w.level) w.heat = THRESH[n];
      const p = game.player;
      if (p) { w.lastKnown.x = p.position.x; w.lastKnown.z = p.position.z; }
      const prev = w.level;
      setLvl(n, true);
      if (n > prev) knownT = Math.max(knownT, KNOWN_AFTER_CRIME);
    },

    clear(silent) {
      const prev = w.level;
      w.level = 0; w.heat = 0; w.seen = false; w.flashing = false; w.searchRadius = 0; w.escapeProgress = 0;
      unseenT = 0; escapeT = 0; knownT = 0; sightingAge = 99; wasSeen = false; lostAnnounced = false;
      if (prev) ev.emit('wantedChanged', { level: 0, prev });
    },
  };

  function levelFor(heat) { let l = 0; for (let i = 1; i <= 5; i++) if (heat >= THRESH[i]) l = i; return l; }
  function setLvl(n, force) {
    n = Math.max(0, Math.min(5, n));
    if (n === w.level) return;
    if (!force && n < w.level) return;
    const prev = w.level;
    w.level = n;
    if (n > prev) { unseenT = 0; escapeT = 0; w.searchRadius = SEARCH_R0[n]; }
    ev.emit('wantedChanged', { level: n, prev });
  }

  function witnessedByCop(x, z) {
    if (game.police?.witness?.(x, z)) return true;
    // cops from the ped system (if any) also count
    for (const ped of game.peds || []) {
      if (!ped || !ped.isCop || ped.state === 'dead' || ped.state === 'down') continue;
      const dx = ped.position.x - x, dz = ped.position.z - z, d2 = dx * dx + dz * dz;
      if (d2 < 15 * 15 || (d2 < 45 * 45 && game.collision.lineOfSight(ped.position.x, ped.position.z, x, z, 2))) return true;
    }
    return false;
  }
  function civilianWitnesses(x, z) {
    let n = 0;
    for (const ped of game.peds || []) {
      if (!ped || ped.isCop || ped.state === 'dead' || ped.state === 'down' || ped.state === 'driver') continue;
      const dx = ped.position.x - x, dz = ped.position.z - z;
      if (dx * dx + dz * dz < 25 * 25) n++;
      if (n >= 3) break;
    }
    return n;
  }

  let unitCounter = 1 + Math.floor((game.rng?.() ?? Math.random()) * 9);
  function unitNo() { unitCounter = (unitCounter % 12) + 1; return unitCounter; }
  function where(x, z) {
    const r = game.roads?.roadNameAt?.(x, z), a = game.roads?.areaNameAt?.(x, z);
    if (r && a && a !== r) return `${r}, ${a}`;
    return r || a || 'South Bombay';
  }
  function suspectDesc() {
    const p = game.player; if (!p) return 'the suspect';
    if (p.mode === 'vehicle' && p.vehicle) return 'suspect in ' + (VEH_DESC[p.vehicle.type] || 'a vehicle');
    return 'suspect on foot';
  }
  function dispatchLine(prev, def) {
    const p = game.player, pos = p ? p.position : w.lastKnown;
    if (prev === 0) return `Control to all mobiles: ${def.label} reported on ${where(pos.x, pos.z)}. ${cap(suspectDesc())}. Respond.`;
    const lines = {
      2: `Control: ${suspectDesc()} heading along ${where(pos.x, pos.z)}. Additional mobiles dispatched.`,
      3: `Control: ${def.label}! All mobiles, set up nakabandi ahead of the ${suspectDesc().replace('suspect ', '')}.`,
      4: `Control to all mobiles: suspect is armed and dangerous. Use force. Last seen ${where(pos.x, pos.z)}.`,
      5: `Control: all available mobiles, Azad Maidan and Colaba, converge on ${where(pos.x, pos.z)}!`,
    };
    return lines[w.level] || `Control: ${def.label}.`;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function radio(text) { lastRadio = game.time; game.hud?.notify?.(text); }
  w.radio = radio; w.where = where; w.suspectDesc = suspectDesc;

  // ---- events ----
  ev.on('crime', (e) => { if (e && e.type) w.addCrime(e.type, e.x, e.z, e.victim); });
  ev.on('busted', () => { if (w.level) w.clear(true); });
  ev.on('wasted', () => { if (w.level) w.clear(true); });
  // Ramming: Vehicles emits 'vehicleCollision' {a,b,impulse,x,z}. Work out whether the PLAYER drove into the other car.
  ev.on('vehicleCollision', (e) => {
    const p = game.player; if (!p || !e || !p.vehicle) return;
    const pv = p.vehicle;
    const o = e.a === pv ? e.b : e.b === pv ? e.a : null;
    if (!o || !o.position) return;
    const dx = o.position.x - pv.position.x, dz = o.position.z - pv.position.z, d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    const mine = pv.velocity.x * nx + pv.velocity.z * nz;          // player's speed INTO the other car
    const theirs = -(o.velocity ? o.velocity.x * nx + o.velocity.z * nz : 0); // other's speed into the player
    if (mine < 3.5 || mine < theirs * 0.8) return;                  // not the player's fault
    const type = o.isPolice ? 'policeRam' : (o.driver ? 'vehicleRam' : null);
    if (!type) return;
    if ((cooldowns[type] || 0) > 0) return;
    cooldowns[type] = type === 'policeRam' ? 3 : 2;
    ev.emit('crime', { type, x: e.x ?? pv.position.x, z: e.z ?? pv.position.z, victim: o });
  });

  game.debug && (game.debug.extra.wanted2 = () => ({
    level: w.level, heat: Math.round(w.heat), seen: w.seen, flashing: w.flashing,
    lastKnown: { x: Math.round(w.lastKnown.x), z: Math.round(w.lastKnown.z) }, searchRadius: Math.round(w.searchRadius),
    escape: +w.escapeProgress.toFixed(2),
  }));
  return w;
}
