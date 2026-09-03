export interface NormalizedToken {
  norm: string;
  original: string;
}

// Spec 5.1: lowercase, strip punctuation, keep internal apostrophes,
// split on hyphens/dashes so both passage and transcript tokenize identically.
export function normalizeToTokens(text: string): NormalizedToken[] {
  const flattened = text
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–-]/g, " ");
  const tokens: NormalizedToken[] = [];
  for (const raw of flattened.split(/\s+/).filter(Boolean)) {
    // Strip non-word edges, then strip edge apostrophes so only internal ones remain.
    const stripped = raw
      .toLowerCase()
      .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "")
      .replace(/^'+|'+$/g, "");
    for (const norm of stripped.split(/[^a-z0-9']+/).filter(Boolean)) {
      tokens.push({ norm, original: raw });
    }
  }
  return tokens;
}
