// Taxi fare maths (PLAN.md section 6). Pure logic.

/** Par time (seconds) for a route of `dist` metres, at 14 m/s. */
export function parTime(dist) {
  return Math.max(0, Number(dist) || 0) / 14;
}

/**
 * fareFor(routeDist m, elapsed s, damageTaken HP, streak count)
 * -> { base, bonus, tipPenalty, total (integer), multiplier }
 */
export function fareFor(routeDist, elapsed, damageTaken = 0, streak = 0) {
  const dist = Math.max(0, Number(routeDist) || 0);
  const t = Math.max(0, Number(elapsed) || 0);
  const dmg = Math.max(0, Number(damageTaken) || 0);
  const st = Math.max(0, Math.floor(Number(streak) || 0));

  const base = 40 + 0.15 * dist;
  const par = parTime(dist);
  // Linear: 0 at par (or slower) -> 1 at 0.5 * par (or faster).
  let f = 0;
  if (par > 0) f = Math.min(1, Math.max(0, (par - t) / (0.5 * par)));
  const bonus = base * f;
  const tipPenalty = Math.min(bonus, dmg * 1.5);
  const multiplier = 1 + 0.25 * Math.min(st, 4);
  const total = Math.max(0, Math.round((base + bonus - tipPenalty) * multiplier));
  return { base, bonus, tipPenalty, total, multiplier };
}
