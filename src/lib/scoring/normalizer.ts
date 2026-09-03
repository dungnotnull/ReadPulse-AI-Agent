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
    .replace(/[—–]/g, " - ")
    .replace(/(\S)-(\S)/g, "$1 - $2");
  return flattened
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({
      norm: raw.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, ""),
      original: raw,
    }))
    .filter((t) => t.norm.length > 0);
}
