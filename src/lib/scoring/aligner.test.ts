import { describe, expect, it } from "vitest";
import { alignWords } from "./aligner";

describe("alignWords", () => {
  it("perfect read is all matches", () => {
    const ops = alignWords(["the", "cat", "sat"], ["the", "cat", "sat"]);
    expect(ops.map((o) => o.op)).toEqual(["match", "match", "match"]);
    expect(ops[1].passageIndex).toBe(1);
    expect(ops[1].transcriptIndex).toBe(1);
  });
  it("substitution", () => {
    const ops = alignWords(["the", "cat"], ["the", "bat"]);
    expect(ops[1].op).toBe("substitution");
  });
  it("omission (word skipped)", () => {
    const ops = alignWords(["the", "big", "cat"], ["the", "cat"]);
    expect(ops).toHaveLength(3);
    expect(ops[1].op).toBe("omission");
    expect(ops[1].passageIndex).toBe(1);
    expect(ops[1].transcriptIndex).toBeNull();
  });
  it("insertion (extra word)", () => {
    const ops = alignWords(["the", "cat"], ["the", "a", "cat"]);
    expect(ops[1].op).toBe("insertion");
    expect(ops[1].passageIndex).toBeNull();
    expect(ops[1].transcriptIndex).toBe(1);
  });
  it("mixed case keeps order", () => {
    const ops = alignWords(["a", "b", "c", "d"], ["a", "x", "d"]);
    expect(ops.map((o) => o.op)).toEqual([
      "match", "substitution", "omission", "match",
    ]);
  });
  it("empty transcript yields all omissions", () => {
    const ops = alignWords(["a", "b"], []);
    expect(ops.map((o) => o.op)).toEqual(["omission", "omission"]);
    expect(ops.every((o) => o.transcriptIndex === null)).toBe(true);
  });
  it("empty passage yields all insertions", () => {
    const ops = alignWords([], ["x"]);
    expect(ops.map((o) => o.op)).toEqual(["insertion"]);
    expect(ops[0].passageIndex).toBeNull();
    expect(ops[0].transcriptIndex).toBe(0);
  });
});
