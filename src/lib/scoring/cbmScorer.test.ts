import { describe, expect, it } from "vitest";
import { scoreReading } from "./cbmScorer";
import type { PassageWord, SttWord } from "./types";

const passage: PassageWord[] = "The little cat sat on the big red mat and he was very happy ."
  .split(" ")
  .map((word, i) => ({ word, sentenceIndex: Math.floor(i / 7) }));

// synth: word w at slot k -> start 1000 + k*300ms, duration 200ms, confidence 0.95
function synth(words: string[], startSlot = 0): SttWord[] {
  return words.map((text, k) => ({
    text,
    start_ms: 1000 + (startSlot + k) * 300,
    end_ms: 1000 + (startSlot + k) * 300 + 200,
    confidence: 0.95,
  }));
}

describe("scoreReading", () => {
  it("perfect read: WCPM normalized to per-minute, accuracy 100", () => {
    const transcript = synth(passage.map((p) => p.word));
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    // 14 scoreable words (the "." token normalizes away). Onset = end of first
    // word = 1200ms; last word ends 1000 + 13*300 + 200 = 5100ms -> elapsed
    // 3.9s -> WCPM = 14/3.9*60
    expect(s.wcpm).toBeCloseTo((14 / 3.9) * 60, 1);
    expect(s.accuracyPct).toBe(100);
    expect(s.counts.correct).toBe(14);
    expect(s.counts.substitutions).toBe(0);
  });

  it("substitution counted as error and listed in missedWords", () => {
    const words = passage.map((p) => p.word);
    words[2] = "dog"; // "cat" -> "dog"
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.substitutions).toBe(1);
    expect(s.missedWords).toContainEqual(
      expect.objectContaining({ expected: "cat", got: "dog", type: "substitution" })
    );
  });

  it("omission counted and listed with got=null", () => {
    const words = passage.map((p) => p.word).filter((_, i) => i !== 3); // drop "sat"
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.omissions).toBe(1);
    expect(s.missedWords.find((m) => m.type === "omission")?.got).toBeNull();
  });

  it("insertion counted as error (accuracy denominator)", () => {
    const words = ["The", "little", "the", "cat", "sat", "on", "the", "big", "red", "mat", "and", "he", "was", "very", "happy", "."];
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.insertions).toBe(1);
  });

  it("self-correction within 3s counts as correct (DIBELS 3s rule)", () => {
    // "cap" then "cat" within gap <= 3s: insertion+match collapses to correct
    const words = ["The", "little", "cap", "cat", "sat", "on", "the", "big", "red", "mat", "and", "he", "was", "very", "happy", "."];
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.selfCorrections).toBe(1);
    expect(s.counts.insertions).toBe(0);
    expect(s.counts.correct).toBe(14);
  });

  it("self-correction slower than 3s stays an insertion", () => {
    const words = ["The", "little", "cap", "cat", "sat", "on", "the", "big", "red", "mat", "and", "he", "was", "very", "happy", "."];
    const transcript = synth(words);
    for (let k = 3; k < transcript.length; k++) { transcript[k].start_ms += 4000; transcript[k].end_ms += 4000; }
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    expect(s.counts.insertions).toBe(1);
    expect(s.counts.selfCorrections).toBe(0);
  });

  it("hesitation >3s between consecutive passage words is an error", () => {
    const words = passage.map((p) => p.word);
    const transcript = synth(words);
    for (let k = 3; k < transcript.length; k++) { transcript[k].start_ms += 4000; transcript[k].end_ms += 4000; }
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    expect(s.counts.hesitations).toBe(1);
    // gap opens between transcript k=2 ("cat", ends 1800) and k=3 ("sat")
    expect(s.missedWords.find((m) => m.type === "hesitation")?.expected).toBe("sat");
  });

  it("60s window: words read after window end are excluded from WCPM", () => {
    const words = passage.map((p) => p.word);
    const transcript = synth(words).map((w, k) => ({
      ...w, start_ms: w.start_ms + k * 5000, end_ms: w.end_ms + k * 5000,
    }));
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring", windowMs: 60000 });
    expect(s.windowSeconds).toBeLessThanOrEqual(60);
    expect(s.counts.correct).toBeLessThan(14);
  });

  it("flags low-confidence matches as review items (operational 0.80)", () => {
    const transcript = synth(passage.map((p) => p.word));
    transcript[2].confidence = 0.4;
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    expect(s.lowConfidenceWords).toEqual([{ word: "cat", confidence: 0.4 }]);
  });
});
