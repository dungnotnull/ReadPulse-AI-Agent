import { alignWords } from "./aligner";
import { normalizeToTokens } from "./normalizer";
import { estimatePercentile } from "./norms";
import type { AlignmentOp, MissedWord, PassageWord, ReadingScore, SttWord } from "./types";

export const WINDOW_MS = 60_000; // CBM 1-minute probe (Deno 1985)
export const SELF_CORRECTION_GAP_MS = 3_000; // DIBELS 8: SC within 3s = correct
export const HESITATION_GAP_MS = 3_000; // DIBELS 8: hesitation > 3s = error
export const LOW_CONFIDENCE = 0.8; // operational parameter (adjustable)

interface ScoreInput {
  passage: PassageWord[];
  transcript: SttWord[];
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  season: "fall" | "winter" | "spring";
  windowMs?: number;
}

// Normalizing a source word can yield 0 tokens ("." -> []) or several
// ("well-known" -> 2), so alignment indexes over the normalized sequence do
// not correspond to source indexes. Build an explicit token -> source index
// map by normalizing each source word independently.
function mapTokensToSources<T>(sources: string[]): { norms: string[]; sourceOf: number[] } {
  const norms: string[] = [];
  const sourceOf: number[] = [];
  sources.forEach((text, sourceIndex) => {
    for (const token of normalizeToTokens(text)) {
      norms.push(token.norm);
      sourceOf.push(sourceIndex);
    }
  });
  return { norms, sourceOf };
}

export function scoreReading(input: ScoreInput): ReadingScore {
  const windowMs = input.windowMs ?? WINDOW_MS;
  const passage = mapTokensToSources(input.passage.map((p) => p.word));
  const spoken = mapTokensToSources(input.transcript.map((w) => w.text));

  const raw = alignWords(passage.norms, spoken.norms);
  // Reading onset = completion of the first spoken word (spec: elapsed time
  // starts when the student begins; first word's end is the first reliable mark).
  const onsetMs = input.transcript.length > 0 ? input.transcript[0].end_ms : 0;
  const windowEndMs = onsetMs + windowMs;

  const ops: AlignmentOp[] = raw.map((o) => {
    const stt = o.transcriptIndex !== null ? input.transcript[spoken.sourceOf[o.transcriptIndex]] : null;
    const pw = o.passageIndex !== null ? input.passage[passage.sourceOf[o.passageIndex]] : null;
    return {
      ...o,
      expected: pw ? pw.word : null,
      got: stt ? stt.text : null,
      start_ms: stt ? stt.start_ms : 0,
      end_ms: stt ? stt.end_ms : 0,
    };
  });

  // Extra spoken tokens that are themselves passage words (e.g. an anticipated
  // "the") are genuine insertions, not self-corrections. A self-correction is a
  // false start at the target word, so the inserted token must be absent from
  // the passage (e.g. "cap" for "cat").
  const isPassageToken = new Set(passage.norms);

  // Collapse self-corrections: an insertion of a non-passage word immediately
  // followed by a match with a gap <= 3s counts as one correct word.
  const collapsed: Array<{ op: AlignmentOp; selfCorrected: boolean }> = [];
  for (let k = 0; k < ops.length; k++) {
    const cur = ops[k];
    const next = ops[k + 1];
    const curNorm =
      cur.transcriptIndex !== null ? spoken.norms[cur.transcriptIndex] : null;
    if (
      cur.op === "insertion" &&
      curNorm !== null &&
      !isPassageToken.has(curNorm) &&
      next &&
      next.op === "match" &&
      next.start_ms - cur.end_ms <= SELF_CORRECTION_GAP_MS
    ) {
      collapsed.push({ op: next, selfCorrected: true });
      k++;
      continue;
    }
    collapsed.push({ op: cur, selfCorrected: false });
  }

  const inWindow = (endMs: number) => endMs <= windowEndMs;
  const counts = { correct: 0, substitutions: 0, omissions: 0, insertions: 0, hesitations: 0, selfCorrections: 0 };
  const missedWords: MissedWord[] = [];
  const lowConfidenceWords: Array<{ word: string; confidence: number }> = [];
  let lastEndMs = onsetMs;

  for (const { op, selfCorrected } of collapsed) {
    const timed = op.transcriptIndex !== null;
    if (timed && !inWindow(op.end_ms)) continue;
    if (timed && op.start_ms - lastEndMs > HESITATION_GAP_MS && op.op !== "insertion") {
      counts.hesitations++;
      const si = op.passageIndex !== null ? input.passage[passage.sourceOf[op.passageIndex]].sentenceIndex : 0;
      missedWords.push({ expected: op.expected ?? "", got: null, type: "hesitation", sentenceIndex: si });
    }
    if (timed) lastEndMs = op.end_ms;
    if (selfCorrected) {
      counts.selfCorrections++;
      counts.correct++;
      continue;
    }
    switch (op.op) {
      case "match":
        counts.correct++;
        if (input.transcript[spoken.sourceOf[op.transcriptIndex!]].confidence < LOW_CONFIDENCE) {
          lowConfidenceWords.push({
            word: op.expected ?? "",
            confidence: input.transcript[spoken.sourceOf[op.transcriptIndex!]].confidence,
          });
        }
        break;
      case "substitution":
        counts.substitutions++;
        missedWords.push({
          expected: op.expected ?? "",
          got: op.got,
          type: "substitution",
          sentenceIndex: op.passageIndex !== null ? input.passage[passage.sourceOf[op.passageIndex]].sentenceIndex : 0,
        });
        break;
      case "omission":
        counts.omissions++;
        missedWords.push({
          expected: op.expected ?? "",
          got: null,
          type: "omission",
          sentenceIndex: op.passageIndex !== null ? input.passage[passage.sourceOf[op.passageIndex]].sentenceIndex : 0,
        });
        break;
      case "insertion":
        counts.insertions++;
        missedWords.push({ expected: "", got: op.got, type: "insertion", sentenceIndex: 0 });
        break;
    }
  }

  const elapsedMs = Math.min(Math.max(lastEndMs - onsetMs, 1), windowMs);
  const wcpm = (counts.correct / (elapsedMs / 1000)) * 60;
  const attempted = counts.correct + counts.substitutions + counts.omissions + counts.insertions;
  const accuracyPct = attempted === 0 ? 0 : (counts.correct / attempted) * 100;

  return {
    wcpm: Math.round(wcpm * 10) / 10,
    accuracyPct: Math.round(accuracyPct * 10) / 10,
    windowSeconds: elapsedMs / 1000,
    counts,
    missedWords,
    percentile: estimatePercentile(wcpm, input.grade, input.season),
    lowConfidenceWords,
  };
}
