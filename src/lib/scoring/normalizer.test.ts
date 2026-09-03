import { describe, expect, it } from "vitest";
import { normalizeToTokens } from "./normalizer";

describe("normalizeToTokens", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeToTokens("Hello, World!")).toEqual([
      { norm: "hello", original: "Hello," },
      { norm: "world", original: "World!" },
    ]);
  });
  it("keeps contractions as one word", () => {
    expect(normalizeToTokens("It's Tom's dog.")).toEqual([
      { norm: "it's", original: "It's" },
      { norm: "tom's", original: "Tom's" },
      { norm: "dog", original: "dog." },
    ]);
  });
  it("splits hyphenated and dash-joined words", () => {
    expect(normalizeToTokens("well-known—the")).toEqual([
      { norm: "well", original: "well" },
      { norm: "known", original: "known" },
      { norm: "the", original: "the" },
    ]);
  });
  it("normalizes curly quotes to straight apostrophe", () => {
    expect(normalizeToTokens("don’t")[0].norm).toBe("don't");
  });
  it("collapses whitespace and drops empties", () => {
    expect(normalizeToTokens("  a   b  ")).toHaveLength(2);
  });
  it("splits interior punctuation into separate tokens", () => {
    expect(normalizeToTokens("hello...world")).toEqual([
      { norm: "hello", original: "hello...world" },
      { norm: "world", original: "hello...world" },
    ]);
  });
  it("splits chained hyphenated segments", () => {
    expect(normalizeToTokens("a-b-c").map((t) => t.norm)).toEqual(["a", "b", "c"]);
  });
  it("strips edge apostrophes but keeps internal ones", () => {
    expect(normalizeToTokens("’tis it’s").map((t) => t.norm)).toEqual(["tis", "it's"]);
  });
});
