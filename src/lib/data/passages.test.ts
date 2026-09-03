import { describe, expect, it } from "vitest";
import { PASSAGES, passageById } from "./passages";
import { fleschKincaidGrade } from "@/lib/scoring/readability";

describe("PASSAGES", () => {
  it("has 3 passages covering grades 1, 3, 5", () => {
    expect(PASSAGES.map((p) => p.grade).sort()).toEqual([1, 3, 5]);
  });
  it("each passage: 40-160 words, sentences/words built, FK within +/-1.5 of declared grade", () => {
    for (const p of PASSAGES) {
      const words = p.text.split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThanOrEqual(40);
      expect(words.length).toBeLessThanOrEqual(160);
      expect(p.sentences.length).toBeGreaterThanOrEqual(2);
      expect(p.words).toHaveLength(words.length);
      const fk = fleschKincaidGrade(p.text);
      expect(Math.abs(fk - p.grade), `${p.id}: FK ${fk} vs grade ${p.grade}`).toBeLessThanOrEqual(1.5);
    }
  });
  it("passageById returns the passage and throws on unknown id", () => {
    expect(passageById("g1-cat-ball").grade).toBe(1);
    expect(() => passageById("nope")).toThrow();
  });
});
