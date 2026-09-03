// Word-level output of AssemblyAI batch STT (start/end in milliseconds).
export interface SttWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export type ErrorType =
  | "substitution"
  | "omission"
  | "insertion"
  | "hesitation"
  | "selfCorrected";

export interface AlignmentOp {
  op: "match" | "substitution" | "omission" | "insertion";
  passageIndex: number | null; // index into normalized passage sequence
  transcriptIndex: number | null; // index into normalized transcript sequence
  expected: string | null; // original passage word (pre-normalization)
  got: string | null; // original transcript word
  start_ms: number; // transcript timing; 0 when no transcript word
  end_ms: number;
}

export interface MissedWord {
  expected: string;
  got: string | null;
  type: ErrorType;
  sentenceIndex: number;
}

export type Tier = "at_risk" | "below_benchmark" | "on_track";

export interface PercentileResult {
  estimated: number | "<10" | ">90";
  tier: Tier;
  source: "Hasbrouck & Tindal 2017";
}

export interface ReadingScore {
  wcpm: number;
  accuracyPct: number;
  windowSeconds: number; // scored window actually used (<= 60)
  counts: {
    correct: number;
    substitutions: number;
    omissions: number;
    insertions: number;
    hesitations: number;
    selfCorrections: number;
  };
  missedWords: MissedWord[];
  percentile: PercentileResult;
  lowConfidenceWords: Array<{ word: string; confidence: number }>;
}

export interface RanScore {
  stimuliTotal: number;
  stimuliNamed: number;
  secondsElapsed: number;
  itemsPerSecond: number;
  flag: "typical" | "slow";
  source: "Denckla & Rudel 1976 paradigm (40-item adaptation)";
}

export interface PassageWord {
  word: string; // original word
  sentenceIndex: number;
}

export interface NormRow {
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  season: "fall" | "winter" | "spring";
  percentiles: Record<10 | 25 | 50 | 75 | 90, number>; // WCPM anchors
}
