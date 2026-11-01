// Small math helpers shared by the world builders.
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function distToPoly(x, z, poly) {
  let best = Infinity;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, za] = poly[b], [xb, zb] = poly[a];
    const dx = xb - xa, dz = zb - za, L2 = dx * dx + dz * dz || 1;
    let t = ((x - xa) * dx + (z - za) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - xa - dx * t, z - za - dz * t));
  }
  return best;
}
