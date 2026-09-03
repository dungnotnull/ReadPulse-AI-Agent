// Agreement statistics for the validation study (Pearson r, MAE).
// Pairwise operation: sequences are truncated to the shorter length.
// Zero variance in either input yields r = 0 (correlation undefined; convention).

function trimPair(xs: number[], ys: number[]): Array<[number, number]> {
  const n = Math.min(xs.length, ys.length);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) pairs.push([xs[i], ys[i]]);
  return pairs;
}

export function pearson(xs: number[], ys: number[]): number {
  const pairs = trimPair(xs, ys);
  const n = pairs.length;
  if (n === 0) return 0;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (const [x, y] of pairs) {
    cov += (x - mx) * (y - my);
    vx += (x - mx) ** 2;
    vy += (y - my) ** 2;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

export function mae(xs: number[], ys: number[]): number {
  const pairs = trimPair(xs, ys);
  if (pairs.length === 0) return 0;
  return pairs.reduce((s, [x, y]) => s + Math.abs(x - y), 0) / pairs.length;
}
