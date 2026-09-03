import { describe, expect, it } from "vitest";
import { RAN_STIMULI } from "./stimuli";
import { normalizeToTokens } from "@/lib/scoring/normalizer";

describe("RAN_STIMULI", () => {
  it("colors variant: 40 items, exactly 5 unique colors, deterministic", () => {
    expect(RAN_STIMULI.colors).toHaveLength(40);
    expect(new Set(RAN_STIMULI.colors).size).toBe(5);
    expect(RAN_STIMULI.colors).toEqual(RAN_STIMULI.colors);
  });
  it("objects variant: 40 items, exactly 5 unique objects", () => {
    expect(RAN_STIMULI.objects).toHaveLength(40);
    expect(new Set(RAN_STIMULI.objects).size).toBe(5);
  });
  it("every stimulus is a single normalized token (ranAnalyzer precondition)", () => {
    for (const list of [RAN_STIMULI.colors, RAN_STIMULI.objects]) {
      for (const s of list) {
        expect(normalizeToTokens(s)).toHaveLength(1);
      }
    }
  });
});
