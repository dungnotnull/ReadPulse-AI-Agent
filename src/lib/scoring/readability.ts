// Flesch (1948); Kincaid et al. (1975). Syllable counting is the standard
// vowel-group heuristic (approximation disclosed in METHODOLOGY.md).
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith("e") && n > 1) n--; // silent e (smile=1, note: undercounts "-le" words like table)
  return Math.max(1, n);
}

export function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wps = words.length / sentences;
  const spw = words.length > 0 ? syllables / words.length : 0;
  return Math.round((0.39 * wps + 11.8 * spw - 15.59) * 100) / 100;
}
