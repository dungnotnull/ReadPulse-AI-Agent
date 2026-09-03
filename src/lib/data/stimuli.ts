// Deterministic RAN grids (spec 5.9): 40 items = 8 rows x 5 columns.
// Deterministic seed so tests and re-runs are stable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gridOf(items: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  const out: string[] = [];
  for (let row = 0; row < 8; row++) {
    const shuffled = [...items];
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
    out.push(...shuffled);
  }
  return out;
}

export const RAN_STIMULI = {
  colors: gridOf(["red", "blue", "green", "yellow", "black"], 20260903),
  objects: gridOf(["ball", "cat", "dog", "star", "tree"], 20260904),
} as const;
