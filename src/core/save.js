// Save/load to localStorage-like storage. Never throws, never logs.
export const SAVE_KEY = 'ctaBombay.save.v1';

export function defaultSave() {
  return {
    v: 1,
    money: 500,
    story: 0,        // index of next story mission (or whatever the mission manager stores)
    done: {},        // { missionId: true | bestScore }
    chai: [],        // collected chai ids
    bestRace: null,  // best time in seconds, or null
    fares: 0,        // completed taxi fares
    owned: [],       // purchased/unlocked items, e.g. 'sports', 'bike'
    stats: {},
    settings: {},
  };
}

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Deep-copies JSON-safe data (depth/size limited); drops anything else.
function clean(x, depth = 0) {
  if (x === null) return null;
  const t = typeof x;
  if (t === 'string') return x.length > 200 ? x.slice(0, 200) : x;
  if (t === 'boolean') return x;
  if (t === 'number') return Number.isFinite(x) ? x : 0;
  if (depth >= 4) return undefined;
  if (Array.isArray(x)) {
    const out = [];
    for (const item of x.slice(0, 500)) {
      const c = clean(item, depth + 1);
      if (c !== undefined) out.push(c);
    }
    return out;
  }
  if (t === 'object') {
    const out = {};
    let n = 0;
    for (const k of Object.keys(x)) {
      if (BAD_KEYS.has(k)) continue;
      if (++n > 200) break;
      const c = clean(x[k], depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}

const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);

/** Shape check. Returns a sanitized save object (missing fields defaulted) or null. */
export function validateSave(obj) {
  try {
    if (!isObj(obj) || obj.v !== 1) return null;
    if (typeof obj.money !== 'number' || !Number.isFinite(obj.money)) return null;
    const d = defaultSave();
    const out = d;
    out.money = Math.max(0, Math.round(obj.money));
    if (obj.story !== undefined) {
      const s = clean(obj.story);
      if (typeof s === 'number') out.story = Math.max(0, Math.floor(s));
      else if (s !== undefined && s !== null) out.story = s;
    }
    if (isObj(obj.done)) out.done = clean(obj.done);
    if (Array.isArray(obj.chai)) out.chai = clean(obj.chai).filter(c => typeof c === 'number' || typeof c === 'string');
    if (typeof obj.bestRace === 'number' && Number.isFinite(obj.bestRace) && obj.bestRace > 0) out.bestRace = obj.bestRace;
    if (typeof obj.fares === 'number' && Number.isFinite(obj.fares)) out.fares = Math.max(0, Math.floor(obj.fares));
    else if (isObj(obj.fares)) out.fares = clean(obj.fares);
    if (Array.isArray(obj.owned)) out.owned = clean(obj.owned).filter(c => typeof c === 'string');
    if (isObj(obj.stats)) out.stats = clean(obj.stats);
    if (isObj(obj.settings)) out.settings = clean(obj.settings);
    return out;
  } catch {
    return null;
  }
}

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Load and validate the save. Missing/corrupt/unavailable -> null. */
export function loadSave(storage) {
  try {
    const st = getStorage(storage);
    if (!st) return null;
    const raw = st.getItem(SAVE_KEY);
    if (raw === null || raw === undefined) return null;
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Validate then write. Returns true on success, false otherwise. */
export function writeSave(data, storage) {
  try {
    const st = getStorage(storage);
    if (!st) return false;
    const clean_ = validateSave(data);
    if (!clean_) return false;
    st.setItem(SAVE_KEY, JSON.stringify(clean_));
    return true;
  } catch {
    return false;
  }
}

/** Remove the save (New Game). Returns true on success. */
export function clearSave(storage) {
  try {
    const st = getStorage(storage);
    if (!st) return false;
    st.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
