import { describe, expect, it } from "vitest";
import { HT2017, estimatePercentile, tierFromPercentile } from "./norms";

describe("HT2017 data integrity", () => {
  it("covers grades 1-6 x 3 seasons (18 rows)", () => {
    expect(HT2017).toHaveLength(18);
    for (const grade of [1, 2, 3, 4, 5, 6] as const) {
      for (const season of ["fall", "winter", "spring"] as const) {
        expect(
          HT2017.find((r) => r.grade === grade && r.season === season),
          `missing grade ${grade} ${season}`
        ).toBeTruthy();
      }
    }
  });
  it("percentile anchors are monotonically non-decreasing in every row", () => {
    for (const row of HT2017) {
      const p = row.percentiles;
      expect(p[10] <= p[25], `grade ${row.grade} ${row.season}`).toBe(true);
      expect(p[25] <= p[50]).toBe(true);
      expect(p[50] <= p[75]).toBe(true);
      expect(p[75] <= p[90]).toBe(true);
    }
  });
  it("spot-checks three transcribed cells against the source table", () => {
    const get = (g: 1 | 2 | 3 | 4 | 5 | 6, s: "fall" | "winter" | "spring") =>
      HT2017.find((r) => r.grade === g && r.season === s)!.percentiles[50];
    expect(get(1, "spring")).toBe(60);
    expect(get(2, "spring")).toBe(100);
    expect(get(6, "spring")).toBe(146);
  });
});

describe("estimatePercentile", () => {
  const row = HT2017.find((r) => r.grade === 2 && r.season === "spring")!;
  it("clamps below 10th instead of extrapolating", () => {
    expect(estimatePercentile(row.percentiles[10] - 1, 2, "spring").estimated).toBe("<10");
  });
  it("clamps above 90th", () => {
    expect(estimatePercentile(row.percentiles[90] + 1, 2, "spring").estimated).toBe(">90");
  });
  it("returns exact anchor percentile at anchor WCPM", () => {
    expect(estimatePercentile(row.percentiles[50], 2, "spring").estimated).toBe(50);
  });
  it("interpolates linearly between anchors", () => {
    const mid = (row.percentiles[50] + row.percentiles[75]) / 2;
    const res = estimatePercentile(mid, 2, "spring").estimated;
    expect(res).toBeGreaterThanOrEqual(50);
    expect(res).toBeLessThanOrEqual(75);
  });
  it("throws for grade 1 fall (no published norms) instead of a misleading result", () => {
    expect(() => estimatePercentile(20, 1, "fall")).toThrow(/grade 1 fall/);
    expect(() => estimatePercentile(0, 1, "fall")).toThrow(/grade 1 fall/);
  });
});

describe("tierFromPercentile", () => {
  it("<10 -> at_risk; 10-24 -> below_benchmark; >=25 -> on_track", () => {
    expect(tierFromPercentile("<10")).toBe("at_risk");
    expect(tierFromPercentile(10)).toBe("below_benchmark");
    expect(tierFromPercentile(24.9)).toBe("below_benchmark");
    expect(tierFromPercentile(25)).toBe("on_track");
    expect(tierFromPercentile(">90")).toBe("on_track");
  });
});
