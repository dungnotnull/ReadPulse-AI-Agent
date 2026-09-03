import type { NormRow, PercentileResult, Tier } from "./types";

// Hasbrouck, J., & Tindal, G. (2017). An Update to Compiled ORF Norms
// (Technical Report No. 1702). University of Oregon.
// Transcribed from the public chart:
// https://www.readingrockets.org/topics/fluency/articles/fluency-norms-chart-2017-update
// Cross-checked against:
// https://www.readnaturally.com/article/hasbrouck-tindal-oral-reading-fluency-data-2017
// Every value was copied from the fetched table at transcription time (2026-09).
// Note: the source table leaves grade 1 fall cells blank (no published norms);
// those anchors are represented here as 0, and estimatePercentile throws for this row.
export const HT2017: NormRow[] = [
  { grade: 1, season: "fall", percentiles: { 10: 0, 25: 0, 50: 0, 75: 0, 90: 0 } },
  { grade: 1, season: "winter", percentiles: { 10: 9, 25: 16, 50: 29, 75: 59, 90: 97 } },
  { grade: 1, season: "spring", percentiles: { 10: 18, 25: 34, 50: 60, 75: 91, 90: 116 } },
  { grade: 2, season: "fall", percentiles: { 10: 23, 25: 36, 50: 50, 75: 84, 90: 111 } },
  { grade: 2, season: "winter", percentiles: { 10: 35, 25: 59, 50: 84, 75: 109, 90: 131 } },
  { grade: 2, season: "spring", percentiles: { 10: 43, 25: 72, 50: 100, 75: 124, 90: 148 } },
  { grade: 3, season: "fall", percentiles: { 10: 40, 25: 59, 50: 83, 75: 104, 90: 134 } },
  { grade: 3, season: "winter", percentiles: { 10: 62, 25: 79, 50: 97, 75: 137, 90: 161 } },
  { grade: 3, season: "spring", percentiles: { 10: 63, 25: 91, 50: 112, 75: 139, 90: 166 } },
  { grade: 4, season: "fall", percentiles: { 10: 60, 25: 75, 50: 94, 75: 125, 90: 153 } },
  { grade: 4, season: "winter", percentiles: { 10: 71, 25: 95, 50: 120, 75: 143, 90: 168 } },
  { grade: 4, season: "spring", percentiles: { 10: 83, 25: 105, 50: 133, 75: 160, 90: 184 } },
  { grade: 5, season: "fall", percentiles: { 10: 64, 25: 87, 50: 121, 75: 153, 90: 179 } },
  { grade: 5, season: "winter", percentiles: { 10: 84, 25: 109, 50: 133, 75: 160, 90: 183 } },
  { grade: 5, season: "spring", percentiles: { 10: 102, 25: 119, 50: 146, 75: 169, 90: 195 } },
  { grade: 6, season: "fall", percentiles: { 10: 89, 25: 112, 50: 132, 75: 159, 90: 185 } },
  { grade: 6, season: "winter", percentiles: { 10: 91, 25: 116, 50: 145, 75: 166, 90: 195 } },
  { grade: 6, season: "spring", percentiles: { 10: 91, 25: 122, 50: 146, 75: 173, 90: 204 } },
];

export function tierFromPercentile(p: number | "<10" | ">90"): Tier {
  if (p === "<10") return "at_risk";
  if (p === ">90") return "on_track";
  if (p < 10) return "at_risk";
  if (p < 25) return "below_benchmark";
  return "on_track";
}

export function estimatePercentile(
  wcpm: number,
  grade: 1 | 2 | 3 | 4 | 5 | 6,
  season: "fall" | "winter" | "spring"
): PercentileResult {
  const row = HT2017.find((r) => r.grade === grade && r.season === season);
  if (!row) throw new Error(`No norms for grade ${grade} ${season}`);
  if (row.percentiles[90] === 0) {
    throw new Error("No published Hasbrouck & Tindal 2017 norms for grade 1 fall - benchmarking unavailable");
  }
  const p = row.percentiles;
  if (wcpm < p[10]) return { estimated: "<10", tier: "at_risk", source: "Hasbrouck & Tindal 2017" };
  if (wcpm > p[90]) return { estimated: ">90", tier: "on_track", source: "Hasbrouck & Tindal 2017" };
  const anchors: Array<[number, number]> = [
    [10, p[10]],
    [25, p[25]],
    [50, p[50]],
    [75, p[75]],
    [90, p[90]],
  ];
  for (let k = 0; k < anchors.length - 1; k++) {
    const [pLo, wLo] = anchors[k];
    const [pHi, wHi] = anchors[k + 1];
    if (wcpm >= wLo && wcpm <= wHi) {
      const t = wHi === wLo ? 0 : (wcpm - wLo) / (wHi - wLo);
      return {
        estimated: Math.round(pLo + t * (pHi - pLo)),
        tier: tierFromPercentile(pLo + t * (pHi - pLo)),
        source: "Hasbrouck & Tindal 2017",
      };
    }
  }
  throw new Error("estimatePercentile: WCPM fell outside all anchor intervals");
}
