import { describe, expect, it } from "vitest";
import { countSyllables, fleschKincaidGrade } from "./readability";

describe("countSyllables (vowel-group heuristic)", () => {
  it("cat=1, water=2, elephant=3, smile=1 (silent e)", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("water")).toBe(2);
    expect(countSyllables("elephant")).toBe(3);
    expect(countSyllables("smile")).toBe(1);
  });
});

describe("fleschKincaidGrade", () => {
  it("hand-computed example", () => {
    // "The cat sat on the mat. Dogs run fast in the park."
    // 2 sentences, 12 words. Syllables via heuristic: count them by hand FIRST
    // (the=1 cat=1 sat=1 on=1 the=1 mat=1 Dogs=1 run=1 fast=1 in=1 the=1 park=1 -> 12)
    // FK = 0.39*(12/2) + 11.8*(12/12) - 15.59 = 2.34 + 11.8 - 15.59 = -1.45
    const text = "The cat sat on the mat. Dogs run fast in the park.";
    expect(fleschKincaidGrade(text)).toBeCloseTo(-1.45, 2);
  });

  it("a long academic sentence scores higher than the simple fixture", () => {
    // 1 sentence, words with 2-4 vowel groups push syllables/word up,
    // so FK grade must exceed the monosyllabic fixture above (-1.45).
    const academic =
      "Comprehension difficulties originate from inadequate phonological awareness intervention strategies.";
    expect(fleschKincaidGrade(academic)).toBeGreaterThan(
      fleschKincaidGrade("The cat sat on the mat. Dogs run fast in the park."),
    );
  });
});
