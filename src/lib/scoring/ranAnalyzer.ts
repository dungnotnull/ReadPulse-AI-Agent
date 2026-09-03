import { alignWords } from "./aligner";
import { normalizeToTokens } from "./normalizer";
import type { RanScore, SttWord } from "./types";

export const RAN_SLOW_ITEMS_PER_SECOND = 0.5; // operational parameter (no embedded norms, spec 5.9)

// Aligns the spoken sequence to the stimulus grid with the same Levenshtein
// alignment used for passage scoring (fillers become insertions, skipped
// stimuli become omissions), then counts matched stimuli for naming speed.
export function analyzeRan(input: { stimuli: string[]; transcript: SttWord[] }): RanScore {
  const norm = (s: string) => normalizeToTokens(s)[0]?.norm ?? "";
  const words = input.transcript
    .map((w) => ({ stt: w, norm: norm(w.text) }))
    .filter((x) => x.norm.length > 0);
  const ops = alignWords(
    input.stimuli.map(norm),
    words.map((x) => x.norm)
  );
  const matched: SttWord[] = [];
  for (const op of ops) {
    if (op.op === "match" && op.transcriptIndex !== null) {
      matched.push(words[op.transcriptIndex].stt);
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
