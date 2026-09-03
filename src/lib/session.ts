// Grade-to-passage mapping and session param validation (product rule).
// Kept server-safe (no "use client") so both the setup and session pages can use it.
export type Grade = 1 | 2 | 3 | 4 | 5 | 6;
export type Season = "fall" | "winter" | "spring";

export function gradeToPassageId(grade: number): string {
  if (grade <= 2) return "g1-cat-ball";
  if (grade <= 4) return "g3-morning-dog";
  return "g5-ancient-paths";
}

export function isGrade(value: unknown): value is Grade {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function isSeason(value: unknown): value is Season {
  return value === "fall" || value === "winter" || value === "spring";
}
