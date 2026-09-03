import { describe, expect, it } from "vitest";
import { mae, pearson } from "./stats";

describe("pearson", () => {
  it("returns 1 for identical sequences", () => {
    expect(pearson([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 10);
  });
  it("returns -1 for reversed sequences", () => {
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });
  it("returns 0 for constant sequence", () => {
    expect(pearson([2, 2, 2], [1, 2, 3])).toBe(0);
  });
});
describe("mae", () => {
  it("computes mean absolute error", () => {
    expect(mae([1, 2], [2, 4])).toBe(1.5);
  });
});
