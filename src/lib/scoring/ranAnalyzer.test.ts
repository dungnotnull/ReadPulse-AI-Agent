import { describe, expect, it } from "vitest";
import { analyzeRan } from "./ranAnalyzer";
import type { SttWord } from "./types";

const stimuli = ["red", "blue", "red", "green", "yellow", "blue", "black", "red"];
const w = (text: string, k: number): SttWord => ({
  text, start_ms: 1000 + k * 700, end_ms: 1150 + k * 700, confidence: 0.9,
});

describe("analyzeRan", () => {
  it("counts in-order named stimuli and computes items/sec", () => {
    const transcript = stimuli.map((s, k) => w(s, k));
    const r = analyzeRan({ stimuli, transcript });
    expect(r.stimuliNamed).toBe(8);
    expect(r.stimuliTotal).toBe(8);
    // Recount: w(k) end_ms = 1150 + k*700 -> last end = 1150 + 7*700 = 6050 (not 7050;
    // the 1000 offset is not part of end_ms). elapsed = 6050 - 1000 = 5.05s.
    expect(r.secondsElapsed).toBeCloseTo(5.05, 1);
    expect(r.itemsPerSecond).toBeGreaterThan(1);
    expect(r.flag).toBe("typical");
  });
  it("skips missed stimulus but keeps counting later ones in order", () => {
    const transcript = ["red", "red", "green", "yellow", "blue", "black", "red"].map((s, k) => w(s, k));
    const r = analyzeRan({ stimuli, transcript });
    expect(r.stimuliNamed).toBe(7);
  });
  it("slow naming gets the slow flag (operational 0.5 items/s)", () => {
    const transcript = stimuli.map((s, k) => ({ ...w(s, k), start_ms: 1000 + k * 3000, end_ms: 1150 + k * 3000 }));
    const r = analyzeRan({ stimuli, transcript });
    expect(r.flag).toBe("slow");
  });
  it("isolated filler words between names do not poison matching", () => {
    const seq = ["red", "blue", "green"];
    const transcript = ["red", "um", "blue", "uh", "green"].map((s, k) => w(s, k));
    const r = analyzeRan({ stimuli: seq, transcript });
    expect(r.stimuliNamed).toBe(3);
  });
  it("empty transcript yields zeros with typical flag (no division by zero)", () => {
    const r = analyzeRan({ stimuli, transcript: [] });
    expect(r.stimuliNamed).toBe(0);
    expect(r.secondsElapsed).toBe(0);
    expect(r.itemsPerSecond).toBe(0);
    expect(r.flag).toBe("typical");
  });
});
