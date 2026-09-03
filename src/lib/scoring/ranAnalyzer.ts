import { normalizeToTokens } from "./normalizer";
import type { RanScore, SttWord } from "./types";

export const RAN_SLOW_ITEMS_PER_SECOND = 0.5; // operational parameter (no embedded norms, spec 5.9)

// Sequential greedy matcher: child names stimuli left-to-right (Denckla & Rudel 1976 serial naming).
export function analyzeRan(input: { stimuli: string[]; transcript: SttWord[] }): RanScore {
  const norm = (s: string) => normalizeToTokens(s)[0]?.norm ?? "";
  const words = input.transcript
    .map((w) => ({ stt: w, norm: norm(w.text) }))
    .filter((x) => x.norm.length > 0);
  // Strict sequential matching: each stimulus may only match the transcript
  // word at the current position (serial naming, Denckla & Rudel 1976). On a
  // mismatch the stimulus is missed and the position is unchanged, so the
  // next stimulus resumes from the same word (a skipped color does not
  // consume the rest of the transcript).
  let cursor = 0;
  const matched: SttWord[] = [];
  for (const stim of input.stimuli.map(norm)) {
    if (cursor < words.length && words[cursor].norm === stim) {
      matched.push(words[cursor].stt);
      cursor++;
    }
  }
  const stimuliNamed = matched.length;
  const secondsElapsed = matched.length >= 2
    ? (matched[matched.length - 1].end_ms - matched[0].start_ms) / 1000
    : 0;
  const itemsPerSecond = secondsElapsed > 0 ? stimuliNamed / secondsElapsed : 0;
  return {
    stimuliTotal: input.stimuli.length,
    stimuliNamed,
    secondsElapsed: Math.round(secondsElapsed * 100) / 100,
    itemsPerSecond: Math.round(itemsPerSecond * 100) / 100,
    flag: secondsElapsed > 0 && itemsPerSecond < RAN_SLOW_ITEMS_PER_SECOND ? "slow" : "typical",
    source: "Denckla & Rudel 1976 paradigm (40-item adaptation)",
  };
}
