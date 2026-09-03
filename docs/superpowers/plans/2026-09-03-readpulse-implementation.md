# ReadPulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ReadPulse, a conversational voice agent that administers a 1-minute oral reading probe, scores it with CBM/ORF rules (WCPM, error taxonomy, self-correction, 3s hesitation), benchmarks against Hasbrouck & Tindal 2017 norms, adds a RAN task, drills missed words, and produces a shareable report — for the AssemblyAI Voice Agent Hackathon (deadline 2026-09-30).

**Architecture:** Browser captures mic via AudioWorklet (PCM16 24kHz), streams to AssemblyAI Voice Agent API (temporary token) for conversation, and tees the same PCM into a buffer during reading/RAN phases. Captured audio is uploaded to a Next.js API route, transcribed via AssemblyAI batch STT (word timestamps + confidence), and scored by a pure TypeScript ScoringEngine implementing published CBM rules. Results are persisted (SQLite/Prisma) with a shareable slug.

**Tech Stack:** Next.js 14 (App Router, TypeScript, Tailwind, shadcn-style components), AssemblyAI Voice Agent API + Batch STT, Vitest, Prisma + SQLite, Recharts, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-03-readpulse-design.md` — all scoring rules in Section 5, data contracts in Section 6, references in Section 12. Read it before starting.

**Schedule (part-time, ~15-25h/week):**
- Week 1 (Sep 3-9): Tasks 0-8 — scaffold + complete ScoringEngine (TDD)
- Week 2 (Sep 10-16): Tasks 9-11 — server integration, DB, API routes
- Week 3 (Sep 17-23): Tasks 12-17 — voice UI, report, RAN, practice, demo page, E2E
- Week 4 (Sep 24-30): Tasks 18-20 — validation study, docs, deploy, video/slides, buffer

**Conventions:** pnpm (`npm i -g pnpm` if missing). Every task ends with a commit. Tests: Vitest, colocated as `*.test.ts`. English only. No emojis in code/comments. All thresholds traceable to the spec; operational (non-cited) parameters are named constants marked `// operational parameter`.

---

## File Structure

```
D:\AssemblyAIhackathon\
├── package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, postcss.config.mjs
├── vitest.config.ts
├── .env.local                      # AAI_API_KEY=... (never commit)
├── .env.example
├── prisma/schema.prisma            # Report model
├── public/worklet/pcm-worklet.js   # AudioWorklet processor (plain JS)
├── src/
│   ├── app/
│   │   ├── layout.tsx, globals.css
│   │   ├── page.tsx                # landing + session setup
│   │   ├── session/page.tsx        # voice session (loads SessionClient)
│   │   ├── demo/page.tsx           # audio-file demo + judge fallback
│   │   ├── report/[slug]/page.tsx  # shareable report
│   │   └── api/
│   │       ├── session-token/route.ts
│   │       ├── score-reading/route.ts
│   │       ├── score-ran/route.ts
│   │       └── report/route.ts
│   ├── components/
│   │   ├── SessionClient.tsx       # phase state machine (setup→…→done)
│   │   ├── PassageCard.tsx
│   │   ├── ReportView.tsx
│   │   ├── PercentileChart.tsx
│   │   └── RanGrid.tsx
│   ├── hooks/useVoiceAgent.ts      # WS client + audio tee + tool dispatch
│   └── lib/
│       ├── assemblyai.ts           # server: temp token + batch STT
│       ├── stats.ts                # Pearson r, MAE (validation)
│       ├── scoring/
│       │   ├── types.ts
│       │   ├── normalizer.ts  (+test)
│       │   ├── aligner.ts     (+test)
│       │   ├── cbmScorer.ts   (+test)
│       │   ├── norms.ts       (+test)
│       │   ├── ranAnalyzer.ts (+test)
│       │   ├── readability.ts (+test)
│       │   └── index.ts
│       └── data/
│           ├── passages.ts    (+test)  # 3 original passages + grade check
│           └── stimuli.ts     (+test)  # deterministic RAN grids
├── scripts/validation/
│   ├── run-scoring.ts, analyze.ts, PROTOCOL.md
├── validation/                    # recordings/*.wav + labels.csv (gitignored wavs)
├── VALIDATION.md, METHODOLOGY.md, README.md
```

---

### Task 0: Scaffold project + verify AssemblyAI endpoints

**Files:** Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.local`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `.gitignore`

- [ ] **Step 1: Scaffold**

```bash
cd D:/AssemblyAIhackathon
pnpm create next-app@14 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
pnpm add -D vitest @vitest/coverage-v8
pnpm add @prisma/client prisma recharts zod
```

If create-next-app refuses non-empty dir (docs/ exists), scaffold in `tmp-app/` then move contents up:

```bash
pnpm create next-app@14 tmp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm \
  && cp -r tmp-app/* tmp-app/.* . 2>/dev/null; rm -rf tmp-app
```

- [ ] **Step 2: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

Add to package.json scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: .gitignore additions** (append if missing): `.env*.local`, `*.db`, `validation/recordings/*.wav`, `validation/recordings/*.webm`

- [ ] **Step 4: .env.local + .env.example**

`.env.local` (get key at console.assemblyai.com; hackathon free credits link on lablab page):
```
AAI_API_KEY=your_key_here
DATABASE_URL="file:./dev.db"
```
`.env.example`: same keys with placeholder values.

- [ ] **Step 5: Verify AssemblyAI endpoints with real key** (prevents building on wrong URLs). Source of truth: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/api-spec/voice-agent-websocket

```bash
# a) Batch STT upload endpoint sanity check (expect 401 without auth, NOT 404):
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.assemblyai.com/v2/upload -H "authorization: $AAI_API_KEY" --data-binary "x"

# b) Voice Agent temporary token — try both documented candidates with the real key:
curl -s -X POST https://api.assemblyai.com/v1/realtime/token -H "authorization: $AAI_API_KEY" -H "content-type: application/json" -d '{"expires_in_seconds":480}'
curl -s -X GET "https://streaming.assemblyai.com/v3/token?expires_in_seconds=480" -H "Authorization: $AAI_API_KEY"
```

Whichever returns `{"token": "..."}` (or `{"data":{"token":"..."}}`) is the one to hard-code in Task 9. Record the winner in `src/lib/assemblyai.ts` comments. If neither works, re-check the "Temporary Token" section of the Voice Agent WebSocket docs page and use that endpoint. Expected: a JSON token string; store nothing in git.

- [ ] **Step 6: Verify build + commit**

```bash
pnpm build && pnpm test
```
Expected: build succeeds; vitest finds no tests but exits 0 (`No test files found` acceptable at this point — if it errors, add `passWithNoTests: true` to vitest test config).

```bash
git add -A && git commit -m "chore: scaffold Next.js + Vitest + Prisma deps"
```

---

### Task 1: scoring/types.ts

**Files:** Create: `src/lib/scoring/types.ts`

- [ ] **Step 1: Write types (no test — pure types, compile-checked)**

```ts
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
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/scoring/types.ts && git commit -m "feat(scoring): shared types for STT, alignment, scores, norms"
```

---

### Task 2: normalizer (TDD)

**Files:** Create: `src/lib/scoring/normalizer.ts`, Test: `src/lib/scoring/normalizer.test.ts`

Rules (spec 5.1): lowercase; convert curly quotes; em/en dashes and hyphens split words; keep internal apostrophes (contractions count as one word per CBM); strip all other punctuation; drop empties. Must also return the index mapping to original tokens so missedWords can show original words.

- [ ] **Step 1: Write failing tests**

```ts
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
      { norm: "dog.", original: "dog." },
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
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/scoring/normalizer.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export interface NormalizedToken {
  norm: string;
  original: string;
}

// Spec 5.1: lowercase, strip punctuation, keep internal apostrophes,
// split on hyphens/dashes so both passage and transcript tokenize identically.
export function normalizeToTokens(text: string): NormalizedToken[] {
  const flattened = text
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, " - ")
    .replace(/(\S)-(\S)/g, "$1 - $2");
  return flattened
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({
      norm: raw.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, ""),
      original: raw,
    }))
    .filter((t) => t.norm.length > 0);
}
```

- [ ] **Step 4: Run tests** — expect PASS. 
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(scoring): text normalizer with token mapping (TDD)"`

---

### Task 3: aligner (TDD)

**Files:** Create: `src/lib/aligner.ts` under `src/lib/scoring/`, Test: `src/lib/scoring/aligner.test.ts`

Word-level Levenshtein alignment with backtrace (spec 5.2). Tie-break order: match > substitution > insertion > omission (deterministic). Input: normalized token arrays (strings only, from `normalizeToTokens().map(t => t.norm)`).

- [ ] **Step 1: Failing tests**

```ts
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
    const ops = alignWords(
      ["a", "b", "c", "d"],
      ["a", "x", "d"]
    );
    expect(ops.map((o) => o.op)).toEqual([
      "match", "substitution", "omission", "match",
    ]);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { AlignmentOp } from "./types";

export interface RawOp {
  op: "match" | "substitution" | "omission" | "insertion";
  passageIndex: number | null;
  transcriptIndex: number | null;
}

// Word-level Levenshtein alignment with backtrace (spec 5.2).
// Tie-break preference (deterministic): match > substitution > insertion > omission.
export function alignWords(passage: string[], transcript: string[]): RawOp[] {
  const n = passage.length;
  const m = transcript.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0)
  );
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = passage[i - 1] === transcript[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + subCost, // match or substitution
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j] + 1 // omission
      );
    }
  }
  const ops: RawOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const subCost = passage[i - 1] === transcript[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + subCost) {
        ops.unshift({
          op: subCost === 0 ? "match" : "substitution",
          passageIndex: i - 1,
          transcriptIndex: j - 1,
        });
        i--;
        j--;
        continue;
      }
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      ops.unshift({ op: "insertion", passageIndex: null, transcriptIndex: j - 1 });
      j--;
      continue;
    }
    ops.unshift({ op: "omission", passageIndex: i - 1, transcriptIndex: null });
    i--;
  }
  return ops;
}
```

- [ ] **Step 4: Run** — expect PASS (all 5 tests).
- [ ] **Step 5: Commit** `git commit -am "feat(scoring): Levenshtein word alignment with deterministic backtrace (TDD)"`

---

### Task 4: cbmScorer (TDD) — the scientific core

**Files:** Create: `src/lib/scoring/cbmScorer.ts`, Test: `src/lib/scoring/cbmScorer.test.ts`

Implements spec 5.3-5.6. Inputs: passage (original words + sentenceIndex), STT transcript words, grade/season (for percentile), windowMs default 60000, self-correction gap 3000ms, hesitation gap 3000ms (DIBELS 8 Admin & Scoring Guide), low-confidence flag 0.80 (operational parameter).

- [ ] **Step 1: Failing tests** — build helpers to synthesize SttWord streams (evenly spaced 300ms/word). Test list:

```ts
import { describe, expect, it } from "vitest";
import { scoreReading } from "./cbmScorer";
import type { PassageWord, SttWord } from "./types";

const passage: PassageWord[] = "The little cat sat on the big red mat and he was very happy ."
  .split(" ")
  .map((word, i) => ({ word, sentenceIndex: Math.floor(i / 7) }));

// synth: word w at slot k -> start 1000 + k*300ms, duration 200ms, confidence 0.95
function synth(words: string[], startSlot = 0): SttWord[] {
  return words.map((text, k) => ({
    text,
    start_ms: 1000 + (startSlot + k) * 300,
    end_ms: 1000 + (startSlot + k) * 300 + 200,
    confidence: 0.95,
  }));
}

describe("scoreReading", () => {
  it("perfect read: WCPM normalized to per-minute, accuracy 100, on-tier percentile", () => {
    const transcript = synth(passage.map((p) => p.word));
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    // 14 scoreable words (the "." token normalizes away). Onset = end of first
    // word = 1200ms; last word ends 1000 + 13*300 + 200 = 5100ms -> elapsed
    // 3.9s -> WCPM = 14/3.9*60
    expect(s.wcpm).toBeCloseTo((14 / 3.9) * 60, 1);
    expect(s.accuracyPct).toBe(100);
    expect(s.counts.correct).toBe(14);
    expect(s.counts.substitutions).toBe(0);
  });

  it("substitution counted as error and listed in missedWords", () => {
    const words = passage.map((p) => p.word);
    words[2] = "dog"; // "cat" -> "dog"
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.substitutions).toBe(1);
    expect(s.missedWords).toContainEqual(
      expect.objectContaining({ expected: "cat", got: "dog", type: "substitution" })
    );
  });

  it("omission counted and listed with got=null", () => {
    const words = passage.map((p) => p.word).filter((_, i) => i !== 3); // drop "sat"
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.omissions).toBe(1);
    expect(s.missedWords.find((m) => m.type === "omission")?.got).toBeNull();
  });

  it("insertion counted as error (accuracy denominator)", () => {
    const words = ["The", "little", "the", "cat", "sat", "on", "the", "big", "red", "mat", "and", "he", "was", "very", "happy", "."];
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.insertions).toBe(1);
  });

  it("self-correction within 3s counts as correct (DIBELS 3s rule)", () => {
    // "cap" then "cat" within gap <= 3s: insertion+match collapses to correct
    const words = ["The", "little", "cap", "cat", "sat", "on", "the", "big", "red", "mat", "and", "he", "was", "very", "happy", "."];
    const s = scoreReading({ passage, transcript: synth(words), grade: 3, season: "spring" });
    expect(s.counts.selfCorrections).toBe(1);
    expect(s.counts.insertions).toBe(0);
    expect(s.counts.correct).toBe(14);
  });

  it("self-correction slower than 3s stays an insertion", () => {
    const words = ["The", "little", "cap", "cat", "sat", "on", "the", "big", "red", "mat", "and", "he", "was", "very", "happy", "."];
    const transcript = synth(words);
    // push gap between "cap" (idx2) and "cat" (idx3) to 4s
    for (let k = 3; k < transcript.length; k++) { transcript[k].start_ms += 4000; transcript[k].end_ms += 4000; }
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    expect(s.counts.insertions).toBe(1);
    expect(s.counts.selfCorrections).toBe(0);
  });

  it("hesitation >3s between consecutive passage words is an error", () => {
    const words = passage.map((p) => p.word);
    const transcript = synth(words);
    for (let k = 3; k < transcript.length; k++) { transcript[k].start_ms += 4000; transcript[k].end_ms += 4000; }
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    expect(s.counts.hesitations).toBe(1);
    // gap opens between transcript k=2 ("cat", ends 1800) and k=3 ("sat")
    expect(s.missedWords.find((m) => m.type === "hesitation")?.expected).toBe("sat");
  });

  it("60s window: words read after window end are excluded from WCPM", () => {
    const words = passage.map((p) => p.word);
    const transcript = synth(words).map((w, k) => ({
      ...w, start_ms: w.start_ms + k * 5000, end_ms: w.end_ms + k * 5000,
    }));
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring", windowMs: 60000 });
    expect(s.windowSeconds).toBeLessThanOrEqual(60);
    expect(s.counts.correct).toBeLessThan(14);
  });

  it("flags low-confidence matches as review items (operational 0.80)", () => {
    const transcript = synth(passage.map((p) => p.word));
    transcript[2].confidence = 0.4;
    const s = scoreReading({ passage, transcript, grade: 3, season: "spring" });
    expect(s.lowConfidenceWords).toEqual([{ word: "cat", confidence: 0.4 }]);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { alignWords } from "./aligner";
import { normalizeToTokens } from "./normalizer";
import { estimatePercentile } from "./norms";
import type {
  AlignmentOp, MissedWord, PassageWord, ReadingScore, SttWord,
} from "./types";

export const WINDOW_MS = 60_000; // CBM 1-minute probe (Deno 1985)
export const SELF_CORRECTION_GAP_MS = 3_000; // DIBELS 8: SC within 3s = correct
export const HESITATION_GAP_MS = 3_000; // DIBELS 8: hesitation > 3s = error
export const LOW_CONFIDENCE = 0.8; // operational parameter (adjustable)

interface ScoreInput {
  passage: PassageWord[];
  transcript: SttWord[];
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  season: "fall" | "winter" | "spring";
  windowMs?: number;
}

export function scoreReading(input: ScoreInput): ReadingScore {
  const windowMs = input.windowMs ?? WINDOW_MS;
  const normPassage = normalizeToTokens(input.passage.map((p) => p.word).join(" "));
  const normTranscript = normalizeToTokens(input.transcript.map((w) => w.text).join(" "));

  // Map normalized transcript token -> original SttWord (same order after filtering)
  const sttByToken = input.transcript.filter((w) => normalizeToTokens(w.text).length > 0);

  const raw = alignWords(
    normPassage.map((t) => t.norm),
    normTranscript.map((t) => t.norm)
  );

  // Reading onset = end of first transcript word (spec 5.3: timestamps decide)
  const onsetMs = sttByToken.length > 0 ? sttByToken[0].end_ms : 0;
  const windowEndMs = onsetMs + windowMs;

  const ops: AlignmentOp[] = raw.map((o) => {
    const stt = o.transcriptIndex !== null ? sttByToken[o.transcriptIndex] : null;
    const pw = o.passageIndex !== null ? input.passage[o.passageIndex] : null;
    return {
      ...o,
      expected: pw ? pw.word : null,
      got: stt ? stt.text : null,
      start_ms: stt ? stt.start_ms : 0,
      end_ms: stt ? stt.end_ms : 0,
    };
  });

  // Collapse self-corrections: insertion immediately followed by match on next
  // passage word, with inter-word gap <= 3s (spec 5.4, DIBELS 8 rule).
  const collapsed: Array<{ op: AlignmentOp; selfCorrected: boolean }> = [];
  for (let k = 0; k < ops.length; k++) {
    const cur = ops[k];
    const next = ops[k + 1];
    if (
      cur.op === "insertion" &&
      next &&
      next.op === "match" &&
      next.start_ms - cur.end_ms <= SELF_CORRECTION_GAP_MS
    ) {
      collapsed.push({ op: next, selfCorrected: true });
      k++; // consume the match
      continue;
    }
    collapsed.push({ op: cur, selfCorrected: false });
  }

  const inWindow = (endMs: number) => endMs <= windowEndMs;

  const counts = {
    correct: 0, substitutions: 0, omissions: 0,
    insertions: 0, hesitations: 0, selfCorrections: 0,
  };
  const missedWords: MissedWord[] = [];
  const lowConfidenceWords: Array<{ word: string; confidence: number }> = [];

  let lastEndMs = onsetMs;
  for (const { op, selfCorrected } of collapsed) {
    const timed = op.transcriptIndex !== null;
    const opEnd = op.end_ms;
    if (timed && !inWindow(opEnd)) continue; // outside 60s window (spec 5.3)

    // Hesitation: >3s silence gap between consecutive scored transcript words
    if (timed && op.start_ms - lastEndMs > HESITATION_GAP_MS && op.op !== "insertion") {
      counts.hesitations++;
      const si = op.passageIndex !== null ? input.passage[op.passageIndex].sentenceIndex : 0;
      missedWords.push({ expected: op.expected ?? "", got: null, type: "hesitation", sentenceIndex: si });
    }
    if (timed) lastEndMs = op.end_ms;

    if (selfCorrected) { counts.selfCorrections++; counts.correct++; continue; }
    switch (op.op) {
      case "match":
        counts.correct++;
        if (sttByToken[op.transcriptIndex!].confidence < LOW_CONFIDENCE) {
          lowConfidenceWords.push({
            word: op.expected ?? "",
            confidence: sttByToken[op.transcriptIndex!].confidence,
          });
        }
        break;
      case "substitution":
        counts.substitutions++;
        missedWords.push({
          expected: op.expected ?? "", got: op.got, type: "substitution",
          sentenceIndex: op.passageIndex !== null ? input.passage[op.passageIndex].sentenceIndex : 0,
        });
        break;
      case "omission":
        counts.omissions++;
        missedWords.push({
          expected: op.expected ?? "", got: null, type: "omission",
          sentenceIndex: op.passageIndex !== null ? input.passage[op.passageIndex].sentenceIndex : 0,
        });
        break;
      case "insertion":
        counts.insertions++;
        missedWords.push({
          expected: "", got: op.got, type: "insertion", sentenceIndex: 0,
        });
        break;
    }
  }

  // Elapsed = last scored word end - onset, clamped to window (spec 5.3)
  const elapsedMs = Math.min(Math.max(lastEndMs - onsetMs, 1), windowMs);
  const wcpm = (counts.correct / (elapsedMs / 1000)) * 60;

  const attempted = counts.correct + counts.substitutions +
    counts.omissions + counts.insertions;
  const accuracyPct = attempted === 0 ? 0 : (counts.correct / attempted) * 100;

  return {
    wcpm: Math.round(wcpm * 10) / 10,
    accuracyPct: Math.round(accuracyPct * 10) / 10,
    windowSeconds: elapsedMs / 1000,
    counts,
    missedWords,
    percentile: estimatePercentile(wcpm, input.grade, input.season),
    lowConfidenceWords,
  };
}
```

Note: Task 4 depends on `estimatePercentile` from Task 5. Implement Task 5's `norms.ts` with a temporary stub `throw new Error("norms not transcribed")` first, and in these tests use grades/seasons with mock via `vi.mock("./norms")`? **Simpler ordering: do Task 5 (norms data + interpolation with synthetic fixture) BEFORE Task 4's full run.** Concretely: write Task 5 first except real-data spot-checks, then Task 4 tests pass with real norms available. If you prefer to keep this order, stub `estimatePercentile` to return `{ estimated: 50, tier: "on_track", source: "Hasbrouck & Tindal 2017" }` and remove the stub in Task 5.

- [ ] **Step 4: Run** — expect PASS (after Task 5 stub/data available).
- [ ] **Step 5: Commit** `git commit -am "feat(scoring): CBM scorer - WCPM window, error taxonomy, 3s rules (TDD)"`

---

### Task 5: norms — H&T 2017 data + interpolation (TDD)

**Files:** Create: `src/lib/scoring/norms.ts`, Test: `src/lib/scoring/norms.test.ts`

**Data source (transcribe yourself — do NOT trust memory):** open https://www.readingrockets.org/topics/fluency/articles/fluency-norms-chart-2017-update (Hasbrouck & Tindal 2017 update; Technical Report No. 1702, Univ. of Oregon). Transcribe the WCPM percentile columns (10th/25th/50th/75th/90th) for grades 1-6, all three seasons (fall/winter/spring), into `HT2017`.

- [ ] **Step 1: Failing tests**

```ts
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
});

describe("estimatePercentile", () => {
  // Uses one real transcribed row as the fixture; values below MUST be copied
  // from the Reading Rockets table during transcription, never from memory.
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
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Transcribe the table into norms.ts**

```ts
import type { NormRow } from "./types";

// Hasbrouck, J., & Tindal, G. (2017). An Update to Compiled ORF Norms
// (Technical Report No. 1702). University of Oregon.
// Transcribed from the public chart:
// https://www.readingrockets.org/topics/fluency/articles/fluency-norms-chart-2017-update
// Every value MUST be copied from that table at transcription time.
export const HT2017: NormRow[] = [
  // { grade: 1, season: "fall", percentiles: { 10: X, 25: X, 50: X, 75: X, 90: X } },
  // ... 18 rows total (grades 1-6 x fall/winter/spring). Delete this comment
  // block once real values are in place.
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function estimatePercentile(
  wcpm: number,
  grade: 1 | 2 | 3 | 4 | 5 | 6,
  season: "fall" | "winter" | "spring"
): { estimated: number | "<10" | ">90"; tier: ReturnType<typeof tierFromPercentile>; source: "Hasbrouck & Tindal 2017" } {
  const row = HT2017.find((r) => r.grade === grade && r.season === season);
  if (!row) throw new Error(`No norms for grade ${grade} ${season}`);
  const p = row.percentiles;
  if (wcpm < p[10]) return { estimated: "<10", tier: "at_risk", source: "Hasbrouck & Tindal 2017" };
  if (wcpm > p[90]) return { estimated: ">90", tier: "on_track", source: "Hasbrouck & Tindal 2017" };
  const anchors: Array<[number, number]> = [
    [10, p[10]], [25, p[25]], [50, p[50]], [75, p[75]], [90, p[90]],
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
  return { estimated: 50, tier: "on_track", source: "Hasbrouck & Tindal 2017" }; // unreachable
}

export function tierFromPercentile(
  p: number | "<10" | ">90"
): "at_risk" | "below_benchmark" | "on_track" {
  if (p === "<10") return "at_risk";
  if (p === ">90") return "on_track";
  if (p < 10) return "at_risk";
  if (p < 25) return "below_benchmark";
  return "on_track";
}
```

Transcription steps: open the URL in a browser; for each grade 1-6 row and season column, copy the five percentile WCPM values into the array. After transcribing, add 3 spot-check assertions to the test file copying values directly from the rendered table (e.g. `expect(HT2017.find(r => r.grade===1 && r.season==="spring")!.percentiles[50]).toBe(<value from table>);`).

- [ ] **Step 4: Run** — PASS (all integrity, interpolation, tier tests).
- [ ] **Step 5: Remove Task 4 stub if used** (`pnpm vitest run` all green).
- [ ] **Step 6: Commit** `git commit -am "feat(scoring): Hasbrouck & Tindal 2017 norms + percentile interpolation (TDD)"`

---

### Task 6: ranAnalyzer (TDD)

**Files:** Create: `src/lib/scoring/ranAnalyzer.ts`, Test: `src/lib/scoring/ranAnalyzer.test.ts`

Spec 5.9: sequential greedy matching of normalized transcript to the 40-item stimulus sequence; items/sec over elapsed time (first matched start → last matched end); flag "slow" when itemsPerSecond < 0.5 (2s/item — conservative operational default, configurable; no age norms embedded by design).

- [ ] **Step 1: Failing tests**

```ts
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
    expect(r.secondsElapsed).toBeCloseTo(6.05, 1); // last end 1000+7*700+1150-1000
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
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**

```ts
import { normalizeToTokens } from "./normalizer";
import type { RanScore, SttWord } from "./types";

export const RAN_SLOW_ITEMS_PER_SECOND = 0.5; // operational parameter (no embedded norms, spec 5.9)

// Sequential greedy matcher: child names stimuli left-to-right (Denckla & Rudel 1976 serial naming).
export function analyzeRan(input: { stimuli: string[]; transcript: SttWord[] }): RanScore {
  const norm = (s: string) => normalizeToTokens(s)[0]?.norm ?? "";
  const words = input.transcript
    .map((w) => ({ stt: w, norm: norm(w.text) }))
    .filter((x) => x.norm.length > 0);
  let cursor = 0;
  const matched: SttWord[] = [];
  for (const stim of input.stimuli.map(norm)) {
    while (cursor < words.length && words[cursor].norm !== stim) cursor++;
    if (cursor < words.length) { matched.push(words[cursor].stt); cursor++; }
  }
  const stimuliNamed = matched.length;
  const secondsElapsed = matched.length >= 2
    ? (matched[matched.length - 1].end_ms - matched[0].start_ms) / 1000
    : 0;
  const itemsPerSecond = secondsElapsed > 0 ? stimuliNamed / secondsElapsed : 0;
  return {
    stimuliTotal: input.stimuli.length,
    stimuliNamed,
    secondsElapsed: Math.round(secondsElapsed * 100) / 100,
    itemsPerSecond: Math.round(itemsPerSecond * 100) / 100,
    flag: secondsElapsed > 0 && itemsPerSecond < RAN_SLOW_ITEMS_PER_SECOND ? "slow" : "typical",
    source: "Denckla & Rudel 1976 paradigm (40-item adaptation)",
  };
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `git commit -am "feat(scoring): RAN sequential analyzer with speed flag (TDD)"`

---

### Task 7: readability — Flesch-Kincaid grade (TDD)

**Files:** Create: `src/lib/scoring/readability.ts`, Test: `src/lib/scoring/readability.test.ts`

FK grade level = 0.39*(words/sentences) + 11.8*(syllables/words) − 15.59 (Kincaid et al. 1975, Navy training manuals; derived from Flesch 1948). Syllable counting: standard vowel-group heuristic (disclosed approximation).

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { countSyllables, fleschKincaidGrade } from "./readability";

describe("countSyllables (vowel-group heuristic)", () => {
  it("cat=1, water=2, elephant=3, smile=1 (silent e)", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("water")).toBe(2);
    expect(countSyllables("elephant")).toBe(3);
    expect(countSyllables("smile")).toBe(1);
  });
});

describe("fleschKincaidGrade", () => {
  it("hand-computed example", () => {
    // 2 sentences, 10 words, 14 syllables -> 0.39*5 + 11.8*1.4 - 15.59 = 1.95 + 16.52 - 15.59 = 2.88
    const text = "The cat sat on the mat. Dogs run fast in the park.";
    expect(fleschKincaidGrade(text)).toBeCloseTo(2.88, 1);
  });
});
```

Verify the hand-computed expectation by counting the actual syllables of that text with the heuristic BEFORE trusting the constant — adjust the expected number to the real count of the fixture (write the real syllable count in a comment).

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**

```ts
// Flesch (1948); Kincaid et al. (1975). Syllable counting is the standard
// vowel-group heuristic (approximation disclosed in METHODOLOGY.md).
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith("e") && !w.endsWith("le") && n > 1) n--; // silent e
  return Math.max(1, n);
}

export function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wps = words.length / sentences;
  const spw = words.length > 0 ? syllables / words.length : 0;
  return Math.round((0.39 * wps + 11.8 * spw - 15.59) * 100) / 100;
}
```

- [ ] **Step 4: Run** — PASS (fix the fixture expectation per Step 1 note if the heuristic's count differs). 
- [ ] **Step 5: Commit** `git commit -am "feat(scoring): Flesch-Kincaid grade + syllable heuristic (TDD)"`

---

### Task 8: passages + RAN stimuli data (TDD)

**Files:** Create: `src/lib/data/passages.ts`, `src/lib/data/stimuli.ts`, tests for both.

Passages are ORIGINAL texts written for this project (no copyright constraints). Three levels. Each stores id, title, text, sentences[], grade (1/3/5), sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", fleschGrade (computed at test time — must be within ±1.5 of the declared grade).

- [ ] **Step 1: Failing tests**

```ts
// src/lib/data/passages.test.ts
import { describe, expect, it } from "vitest";
import { PASSAGES } from "./passages";
import { fleschKincaidGrade } from "@/lib/scoring/readability";

describe("PASSAGES", () => {
  it("has 3 passages covering grades 1, 3, 5", () => {
    expect(PASSAGES.map((p) => p.grade).sort()).toEqual([1, 3, 5]);
  });
  it("each passage: 40-160 words, word/sentence indices built, FK within +/-1.5 of declared grade", () => {
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
});
```

```ts
// src/lib/data/stimuli.test.ts
import { describe, expect, it } from "vitest";
import { RAN_STIMULI } from "./stimuli";

describe("RAN_STIMULI", () => {
  it("colors variant: 40 items, 5 unique colors, deterministic (same seed)", () => {
    expect(RAN_STIMULI.colors).toHaveLength(40);
    expect(new Set(RAN_STIMULI.colors).size).toBe(5);
    expect(RAN_STIMULI.colors).toEqual(RAN_STIMULI.colors); // stable identity
  });
  it("objects variant: 40 items, 5 unique one-syllable-ish objects", () => {
    expect(RAN_STIMULI.objects).toHaveLength(40);
    expect(new Set(RAN_STIMULI.objects).size).toBe(5);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement passages.ts** (adjust wording if FK band test fails — iterate until within band; keep texts exactly 3 sentences for G1, 4-5 for G3, 6-8 for G5):

```ts
import type { PassageWord } from "@/lib/scoring/types";

export interface Passage {
  id: string;
  title: string;
  text: string;
  grade: 1 | 3 | 5;
  sourceUrl: string | null;
  sourceNote: string;
  sentences: string[];
  words: PassageWord[];
}

function build(text: string): { sentences: string[]; words: PassageWord[] } {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const words: PassageWord[] = [];
  let si = 0;
  for (const s of sentences) {
    for (const word of s.split(/\s+/).filter(Boolean)) {
      words.push({ word, sentenceIndex: si });
    }
    si++;
  }
  return { sentences, words };
}

const g1Text = "The little cat sat on the mat. She saw a big red ball. The cat ran to the ball and played.";
const g3Text = "One warm morning, a small brown dog woke up and looked out the window. The sun was bright, and the birds were singing in the tall green tree. The dog ran outside to play in the garden. He found a long stick under the old wooden bench.";
const g5Text = "Long before the first cities were built, people traveled across wide open lands in search of food and shelter. They followed the rivers, learned the patterns of the seasons, and studied the animals that shared their world. Over many hundreds of years, these travelers developed tools, language, and customs that helped them survive. Their knowledge was passed down through stories told around evening fires. Today, scientists study these ancient paths to understand how human history unfolded across the continents.";

export const PASSAGES: Passage[] = [
  { id: "g1-cat-ball", title: "The Cat and the Ball", text: g1Text, grade: 1, sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", ...build(g1Text) },
  { id: "g3-morning-dog", title: "A Morning in the Garden", text: g3Text, grade: 3, sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", ...build(g3Text) },
  { id: "g5-ancient-paths", title: "Ancient Paths", text: g5Text, grade: 5, sourceUrl: null, sourceNote: "Original text authored by the ReadPulse team", ...build(g5Text) },
];

export function passageById(id: string): Passage {
  const p = PASSAGES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown passage ${id}`);
  return p;
}
```

- [ ] **Step 4: Implement stimuli.ts**

```ts
// Deterministic RAN grids (spec 5.9): 40 items = 8 rows x 5 columns.
// Deterministic seed so tests and re-runs are stable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gridOf(items: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  const out: string[] = [];
  for (let row = 0; row < 8; row++) {
    const shuffled = [...items];
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
    out.push(...shuffled);
  }
  return out;
}

export const RAN_STIMULI = {
  colors: gridOf(["red", "blue", "green", "yellow", "black"], 20260903),
  objects: gridOf(["ball", "cat", "dog", "star", "tree"], 20260904),
} as const;
```

- [ ] **Step 5: Run** — PASS (iterate passage wording if FK test fails; g1Text has 25 words — pad to >= 40 with two more simple sentences, keep vocabulary simple).
- [ ] **Step 6: Commit** `git commit -am "feat(data): original leveled passages + deterministic RAN grids (TDD)"`

---

### Task 9: assemblyai server lib (mocked TDD)

**Files:** Create: `src/lib/assemblyai.ts`, Test: `src/lib/assemblyai.test.ts`

- [ ] **Step 1: Failing tests** (mock global fetch; verify request shapes + polling + word mapping)

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceAgentToken, transcribeAudio } from "./assemblyai";

afterEach(() => vi.unstubAllGlobals());

describe("createVoiceAgentToken", () => {
  it("POSTs the token endpoint with auth header and returns token string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "tok_123" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = await createVoiceAgentToken();
    expect(token).toBe("tok_123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/token");
    expect((init.headers as Record<string, string>).authorization).toContain(process.env.AAI_API_KEY ?? "");
  });
});

describe("transcribeAudio", () => {
  it("uploads, creates transcript with universal model, polls until completed, maps words", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      call++;
      if (String(url).endsWith("/v2/upload")) {
        return Promise.resolve(new Response(JSON.stringify({ upload_url: "https://up/1" })));
      }
      if (String(url).endsWith("/v2/transcript") && call === 2) {
        return Promise.resolve(new Response(JSON.stringify({ id: "tr1" }), { status: 200 }));
      }
      // polling GET
      return Promise.resolve(new Response(JSON.stringify({
        status: call === 3 ? "processing" : "completed",
        words: [{ text: "Hello", start: 100, end: 400, confidence: 0.99 }],
      })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const words = await transcribeAudio(new Blob(["x"]));
    expect(words).toEqual([{ text: "Hello", start_ms: 100, end_ms: 400, confidence: 0.99 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.assemblyai.com/v2/transcript",
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

(Import from `"vitest"` — fix the typo above when writing the file.)

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (use the endpoint verified in Task 0 Step 5)

```ts
import type { SttWord } from "./scoring/types";

const KEY = () => {
  const k = process.env.AAI_API_KEY;
  if (!k) throw new Error("AAI_API_KEY missing");
  return k;
};

// Endpoint confirmed in Task 0 verification (candidate:
// https://api.assemblyai.com/v1/realtime/token). Adjust ONLY per Task 0 result.
export async function createVoiceAgentToken(expiresInSeconds = 480): Promise<string> {
  const res = await fetch("https://api.assemblyai.com/v1/realtime/token", {
    method: "POST",
    headers: { authorization: KEY(), "content-type": "application/json" },
    body: JSON.stringify({ expires_in_seconds: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`token failed: ${res.status}`);
  const data = (await res.json()) as { token?: string; data?: { token: string } };
  return data.token ?? data.data!.token;
}

interface BatchWord { text: string; start: number; end: number; confidence: number }
interface BatchTranscript {
  id: string; status: "queued" | "processing" | "completed" | "error";
  words?: BatchWord[]; error?: string;
}

export async function transcribeAudio(audio: Blob): Promise<SttWord[]> {
  const headers = { authorization: KEY() };
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST", headers, body: audio,
  });
  if (!up.ok) throw new Error(`upload failed: ${up.status}`);
  const { upload_url } = (await up.json()) as { upload_url: string };

  const created = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speech_model: "universal" }),
  });
  if (!created.ok) throw new Error(`transcript create failed: ${created.status}`);
  let t = (await created.json()) as BatchTranscript;

  while (t.status === "queued" || t.status === "processing") {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${t.id}`, { headers });
    t = (await poll.json()) as BatchTranscript;
  }
  if (t.status === "error") throw new Error(`transcript error: ${t.error}`);
  return (t.words ?? []).map((w) => ({
    text: w.text, start_ms: w.start, end_ms: w.end, confidence: w.confidence,
  }));
}
```

- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Live smoke test (real key, no test)**: run a one-off script `pnpm tsx scripts/validation/stt-smoke.ts` (create `scripts/` dir later in Task 18; for now inline):

```bash
AAI_API_KEY=$AAI_API_KEY pnpm tsx -e "import('./src/lib/assemblyai').then(async m => { const fs = await import('fs'); const buf = fs.readFileSync('scripts/sample.webm'); const w = await m.transcribeAudio(new Blob([buf])); console.log(w.slice(0, 5)); })"
```

Record any 5-second audio as `scripts/sample.webm` first (e.g. via Windows Voice Recorder). Expected: array of SttWord with plausible ms timings. If `speech_model: "universal"` errors, retry without the field (default model).

- [ ] **Step 6: Commit** `git commit -am "feat(server): assemblyai temp token + batch STT with word mapping (mocked TDD)"`

---

### Task 10: API routes (mocked TDD)

**Files:** Create: `src/app/api/session-token/route.ts`, `src/app/api/score-reading/route.ts`, `src/app/api/score-ran/route.ts`, `src/app/api/report/route.ts`, tests: `src/app/api/score-reading/route.test.ts`

Routes run on Node runtime (`export const runtime = "nodejs"`). score-reading takes FormData (audio blob, passageId, grade, season), calls transcribeAudio + scoreReading, persists a Report row, returns { score, reportSlug }.

- [ ] **Step 1: Prisma schema** (`prisma/schema.prisma`) + generate:

```prisma
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Report {
  id            String   @id @default(cuid())
  slug          String   @unique
  childName     String?
  grade         Int
  season        String
  passageId     String
  passageTitle  String
  readingScore  String   // JSON ReadingScore
  ranScore      String?  // JSON RanScore
  createdAt     DateTime @default(now())
}
```

```bash
pnpm exec prisma db push
```

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Failing test for score-reading route** (mock `@/lib/assemblyai` and `@/lib/db`):

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/assemblyai", () => ({
  transcribeAudio: vi.fn().mockResolvedValue([
    { text: "The", start_ms: 1000, end_ms: 1200, confidence: 0.95 },
    { text: "little", start_ms: 1300, end_ms: 1500, confidence: 0.95 },
    { text: "dog", start_ms: 1600, end_ms: 1800, confidence: 0.95 },
    { text: "sat", start_ms: 1900, end_ms: 2100, confidence: 0.95 },
  ]),
}));
vi.mock("@/lib/db", () => ({
  prisma: { report: { create: vi.fn().mockResolvedValue({ slug: "abc123" }) } },
}));

import { POST } from "./route";
import { PASSAGES } from "@/lib/data/passages";

function makeForm(): FormData {
  const fd = new FormData();
  fd.append("audio", new Blob(["x"]), "reading.webm");
  fd.append("passageId", "g1-cat-ball");
  fd.append("grade", "1");
  fd.append("season", "spring");
  fd.append("childName", "Test");
  return fd;
}

describe("POST /api/score-reading", () => {
  it("returns ReadingScore with substituted error and a report slug", async () => {
    const res = await POST({ request: new Request("http://x", { method: "POST", body: makeForm() }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score.counts.substitutions).toBe(1); // cat -> dog
    expect(typeof body.reportSlug).toBe("string");
  });
  it("400 on missing fields", async () => {
    const res = await POST({ request: new Request("http://x", { method: "POST", body: new FormData() }) } as any);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement routes**

```ts
// src/app/api/session-token/route.ts
import { createVoiceAgentToken } from "@/lib/assemblyai";
export const runtime = "nodejs";
export async function POST() {
  try {
    const token = await createVoiceAgentToken();
    return Response.json({ token });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
```

```ts
// src/app/api/score-reading/route.ts
import { transcribeAudio } from "@/lib/assemblyai";
import { scoreReading } from "@/lib/scoring";
import { passageById } from "@/lib/data/passages";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "invalid form" }, { status: 400 });
  const audio = form.get("audio");
  const passageId = String(form.get("passageId") ?? "");
  const grade = Number(form.get("grade")) as 1 | 2 | 3 | 4 | 5 | 6;
  const season = String(form.get("season")) as "fall" | "winter" | "spring";
  const childName = form.get("childName") ? String(form.get("childName")) : null;
  if (!(audio instanceof Blob) || !passageId || !grade || !season) {
    return Response.json({ error: "audio, passageId, grade, season required" }, { status: 400 });
  }
  try {
    const passage = passageById(passageId);
    const words = await transcribeAudio(audio);
    const score = scoreReading({ passage: passage.words, transcript: words, grade, season });
    const slug = randomBytes(6).toString("base64url");
    await prisma.report.create({
      data: {
        slug, childName, grade, season,
        passageId: passage.id, passageTitle: passage.title,
        readingScore: JSON.stringify(score),
      },
    });
    return Response.json({ score, reportSlug: slug });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
```

```ts
// src/app/api/score-ran/route.ts
import { transcribeAudio } from "@/lib/assemblyai";
import { analyzeRan } from "@/lib/scoring";
import { RAN_STIMULI } from "@/lib/data/stimuli";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "invalid form" }, { status: 400 });
  const audio = form.get("audio");
  const variant = String(form.get("variant") ?? "colors") as "colors" | "objects";
  if (!(audio instanceof Blob)) return Response.json({ error: "audio required" }, { status: 400 });
  try {
    const words = await transcribeAudio(audio);
    const score = analyzeRan({ stimuli: RAN_STIMULI[variant], transcript: words });
    return Response.json({ score });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
```

```ts
// src/app/api/report/route.ts
import { prisma } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });
  const report = await prisma.report.findUnique({ where: { slug } });
  if (!report) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ report });
}

export async function PATCH(req: Request) {
  // attach RAN score to an existing report
  const body = (await req.json().catch(() => null)) as { slug?: string; ranScore?: unknown } | null;
  if (!body?.slug || !body?.ranScore) return Response.json({ error: "slug, ranScore required" }, { status: 400 });
  await prisma.report.update({
    where: { slug: body.slug },
    data: { ranScore: JSON.stringify(body.ranScore) },
  });
  return Response.json({ ok: true });
}
```

Also `src/lib/scoring/index.ts`: `export * from "./cbmScorer"; export * from "./ranAnalyzer"; export * from "./norms";`

- [ ] **Step 5: Run** `pnpm vitest run src/app` — PASS. 
- [ ] **Step 6: Commit** `git commit -am "feat(api): token, score-reading, score-ran, report routes + Prisma (mocked TDD)"`

---

### Task 11: report page + share link (server component)

**Files:** Create: `src/app/report/[slug]/page.tsx`

- [ ] **Step 1: Page** (fetch report server-side; render ReportView):

```tsx
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import ReportView from "@/components/ReportView";
import type { ReadingScore, RanScore } from "@/lib/scoring/types";

export default async function ReportPage({ params }: { params: { slug: string } }) {
  const report = await prisma.report.findUnique({ where: { slug: params.slug } });
  if (!report) notFound();
  const reading = JSON.parse(report.readingScore) as ReadingScore;
  const ran = report.ranScore ? (JSON.parse(report.ranScore) as RanScore) : null;
  return (
    <main className="mx-auto max-w-2xl p-6">
      <ReportView
        childName={report.childName}
        grade={report.grade}
        season={report.season}
        passageTitle={report.passageTitle}
        score={reading}
        ran={ran}
      />
    </main>
  );
}
```

- [ ] **Step 2: Manual check** — `pnpm build` passes (ReportView arrives in Task 14; create a minimal placeholder `ReportView` now rendering `score.wcpm` only, replace in Task 14 — do not skip).
- [ ] **Step 3: Commit** `git commit -am "feat(report): shareable report page"` 

---

### Task 12: voice hook — useVoiceAgent (browser, manual-verified)

**Files:** Create: `src/hooks/useVoiceAgent.ts`, `public/worklet/pcm-worklet.js`. No unit tests (WebAudio/WS live in browser); verification is the Task 17 Playwright smoke + manual checklist below.

- [ ] **Step 1: AudioWorklet processor** (`public/worklet/pcm-worklet.js`, plain JS, served statically):

```js
// Downmixes to mono Float32 at the AudioContext sample rate and posts frames.
class PcmWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-worklet", PcmWorklet);
```

- [ ] **Step 2: The hook** — responsibilities: mic → 24kHz AudioContext → worklet → Float32→Int16→base64 chunks → WS `input.audio`; tee raw Int16 into capture buffer on demand; WAV encode; session.update with inline agent (instructions + tools); event dispatch (session.ready, transcript.user.delta, input.speech.*, tool.call, reply.audio playback, reply.done); tool.result send.

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ToolSpec {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execution_mode?: "interactive" | "hold";
}

export interface VoiceAgentConfig {
  instructions: string;
  voice?: string;
  tools?: ToolSpec[];
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onStatus?: (s: string) => void;
}

const floatTo16 = new Float32Array(1);
function f32ToI16Base64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let k = 0; k < f32.length; k++) {
    const s = Math.max(-1, Math.min(1, f32[k]));
    i16[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return btoa(String.fromCharCode(...new Uint8Array(i16.buffer)));
}

// WAV (PCM16 mono 24k) encoder for the captured buffer
export function encodeWav(chunks: Int16Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new ArrayBuffer(44 + total * 2);
  const v = new DataView(out);
  const w = (off: number, s: string) => { for (let k = 0; k < s.length; k++) v.setUint8(off + k, s.charCodeAt(k)); };
  w(0, "RIFF"); v.setUint32(4, 36 + total * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, total * 2, true);
  let off = 44;
  for (const c of chunks) { for (let k = 0; k < c.length; k++) { v.setInt16(off, c[k], true); off += 2; } }
  return new Blob([out], { type: "audio/wav" });
}

export function useVoiceAgent() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<Int16Array[]>([]); // tee buffer
  const capturingRef = useRef(false);
  const cfgRef = useRef<VoiceAgentConfig | null>(null);
  const playbackQueue = useRef<Float32Array[]>([]);
  const playingRef = useRef(false);

  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    while (playbackQueue.current.length > 0 && ctxRef.current) {
      const f32 = playbackQueue.current.shift()!;
      const buf = ctxRef.current.createBuffer(1, f32.length, 24000);
      buf.copyToChannel(f32, 0);
      const src = ctxRef.current.createBufferSource();
      src.buffer = buf; src.connect(ctxRef.current.destination);
      src.start();
      await new Promise((r) => (src.onended = r));
    }
    playingRef.current = false;
  }, []);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const connect = useCallback(async (cfg: VoiceAgentConfig) => {
    cfgRef.current = cfg;
    const tokenRes = await fetch("/api/session-token", { method: "POST" });
    const { token } = (await tokenRes.json()) as { token: string };
    const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
    wsRef.current = ws;
    ws.onopen = () => {
      send({
        type: "session.update",
        session: {
          agent: {
            instructions: cfg.instructions,
            // Voice: pick a concrete voice id from the official voice catalog
            // (docs > Voice Agent API > voices) during Task 12 manual check.
            // Omitted here on purpose so the API default applies instead of a
            // fabricated id.
            ...(cfg.voice ? { voice: cfg.voice } : {}),
            tools: cfg.tools ?? [],
          },
          input: { format: { encoding: "audio/pcm", sample_rate: 24000 } },
        },
      });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      switch (msg.type) {
        case "session.ready": setConnected(true); cfg.onStatus?.("ready"); break;
        case "session.error": case "error": cfg.onStatus?.(`error: ${msg.message}`); break;
        case "transcript.user.delta": cfg.onUserTranscript?.(msg.text, false); break;
        case "transcript.user": cfg.onUserTranscript?.(msg.text, true); break;
        case "input.speech.started": cfg.onSpeechStarted?.(); break;
        case "input.speech.stopped": cfg.onSpeechStopped?.(); break;
        case "reply.audio": {
          const bytes = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0));
          const i16 = new Int16Array(bytes.buffer);
          const f32 = new Float32Array(i16.length);
          for (let k = 0; k < i16.length; k++) f32[k] = i16[k] / 32768;
          playbackQueue.current.push(f32);
          void playQueue();
          break;
        }
        case "reply.done": cfg.onStatus?.("reply.done"); break;
        case "tool.call": void handleToolCall(msg); break;
      }
    };
    // mic pipeline
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: 24000 });
    ctxRef.current = ctx;
    await ctx.audioWorklet.addModule("/worklet/pcm-worklet.js");
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-worklet");
    nodeRef.current = node;
    node.port.onmessage = (e) => {
      const f32 = e.data as Float32Array;
      // convert once, use for both WS and capture
      const i16 = new Int16Array(f32.length);
      for (let k = 0; k < f32.length; k++) {
        const s = Math.max(-1, Math.min(1, f32[k]));
        i16[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      if (capturingRef.current) captureRef.current.push(i16);
      send({ type: "input.audio", data: btoa(String.fromCharCode(...new Uint8Array(i16.buffer))) });
    };
    src.connect(node);
  }, [playQueue, send]);

  const handleToolCall = useCallback(async (msg: { call_id: string; name: string; arguments: string }) => {
    // Per docs: send tool.result inside reply.done flow; executing async then sending is acceptable
    // for hold-mode tools. See Task 0 docs URL for the exact contract.
    const args = msg.arguments ? JSON.parse(msg.arguments) : {};
    const result = await cfgRef.current?.onToolCall?.(msg.name, args);
    send({ type: "tool.result", call_id: msg.call_id, result: JSON.stringify(result ?? { ok: true }) });
  }, [send]);

  const startCapture = useCallback(() => { capturingRef.current = true; }, []);
  const stopCapture = useCallback(() => {
    capturingRef.current = false;
    const wav = encodeWav(captureRef.current, 24000);
    captureRef.current = [];
    return wav;
  }, []);
  const disconnect = useCallback(() => {
    try { wsRef.current?.close(); } catch { /* ignore */ }
    nodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close();
    setConnected(false);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);
  return { connected, connect, disconnect, send, startCapture, stopCapture };
}
```

Notes:
- Verify the exact `session.update` JSON shape (agent/tools nesting) and the default voice id list against the Voice Agent WebSocket docs page from Task 0 — inline agent fields may be named `instructions`, `voice`, `tools` per the spec page's session.update section; adjust keys to match the docs before demo day.
- The spread `String.fromCharCode(...new Uint8Array(...))` may hit call-stack limits on large chunks; chunk the conversion in a loop of 4096 bytes if the console shows RangeError.

- [ ] **Step 3: Manual checklist (5 min)**: temporary dev-only test button on `/` that connects, speaks a greeting via instructions "Say: connected OK", confirm audio plays both ways in Chrome; check Network WS frames show session.update/session.ready. Remove the button afterwards.
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(voice): useVoiceAgent hook - WS, audio tee capture, WAV encode, tool dispatch"`

---

### Task 13: SessionClient — phase state machine + reading flow

**Files:** Create: `src/components/SessionClient.tsx`, `src/components/PassageCard.tsx`, modify `src/app/page.tsx` (setup form: child name, grade 1/3/5 select, season select → router.push("/session?...")), `src/app/session/page.tsx`.

Phases: `intro → reading → scoring → result → practice → ran → ranScoring → ranResult → done`.

Agent instructions template (complete text — grade/passage interpolated client-side):

```
You are ReadPulse, a warm, encouraging virtual reading coach for children aged 6-12.
Session context: the child is about to read the passage "{title}" (grade {grade}) shown on screen.
Rules:
1. Greet briefly by first name, then say: "When you are ready, press the Start Reading button and read the passage aloud. I will listen quietly."
2. During reading you must stay completely silent. The screen shows the passage; do not repeat it.
3. Only if the child is silent for about 3 seconds mid-sentence, say just the next word of the passage, nothing else, then stay silent again.
4. When the reading phase ends (the app takes over), call the score_reading tool and wait.
5. When score results arrive, praise effort first, then state in simple words: words correct per minute, how it compares to the national average, and 2-3 words to practice.
6. In the practice phase, for each missed word the app gives you: say the word, ask the child to repeat it, confirm warmly.
7. Keep every reply under 3 sentences. Never call the child's reading "bad". Never invent scores; only speak numbers that appear in tool results.
```

Tools registered (client-side execution):
- `score_reading` — hold mode; the hook's onToolCall returns the ReadingScore JSON (SessionClient performs the upload itself when phase changes; the tool simply returns the stored result).
- `get_missed_words` — returns `missedWords` array.
- `start_ran_task` — interactive; returns `{ started: true }`; UI switches to RAN phase.

Reading phase flow (SessionClient):
1. On "Start Reading" click: `startCapture()`, start a 60s visual countdown (display only; timing authority is STT — spec risk table).
2. On 60s elapsed OR user clicks "I'm done" OR `onSpeechStopped` with >4s silence after first speech: `stopCapture()` → phase `scoring` → POST /api/score-reading (FormData: wav blob, passageId, grade, season, childName) → store score + slug → call tool flow → phase `result`.
3. `result` renders `<ReportView score={score} ... />` inline while agent narrates.
4. Buttons: "Practice words" → practice phase; "Try the naming game" → RAN phase; "Finish" → done + share link display.

Component skeleton (complete enough to build on; style minimally with Tailwind):

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { passageById } from "@/lib/data/passages";
import PassageCard from "./PassageCard";
import ReportView from "./ReportView";
import RanGrid from "./RanGrid";
import type { ReadingScore, RanScore } from "@/lib/scoring/types";

type Phase = "intro" | "reading" | "scoring" | "result" | "practice" | "ran" | "ranScoring" | "ranResult" | "done";

export default function SessionClient(props: {
  childName: string; grade: 1 | 3 | 5; season: "fall" | "winter" | "spring"; passageId: string;
}) {
  const passage = passageById(props.passageId);
  const [phase, setPhase] = useState<Phase>("intro");
  const [score, setScore] = useState<ReadingScore | null>(null);
  const [ranScore, setRanScore] = useState<RanScore | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [countdown, setCountdown] = useState(60);
  const scoreRef = useRef<ReadingScore | null>(null); // for tool results (declare before use)

  const onToolCall = useCallback(async (name: string) => {
    if (name === "get_missed_words") return scoreRef.current?.missedWords ?? [];
    if (name === "start_ran_task") { setPhase("ran"); return { started: true }; }
    if (name === "score_reading") return scoreRef.current ?? { pending: true };
    return { ok: true };
  }, []);

  const { connected, connect, startCapture, stopCapture } = useVoiceAgent();
  // connect() with instructions template + tools on mount (useEffect once), store refs.

  async function finishReading() {
    const wav = stopCapture();
    setPhase("scoring");
    const fd = new FormData();
    fd.append("audio", wav, "reading.wav");
    fd.append("passageId", passage.id);
    fd.append("grade", String(props.grade));
    fd.append("season", props.season);
    fd.append("childName", props.childName);
    const res = await fetch("/api/score-reading", { method: "POST", body: fd });
    const body = await res.json();
    scoreRef.current = body.score;
    setScore(body.score); setSlug(body.reportSlug); setPhase("result");
  }

  async function finishRan(wav: Blob, variant: "colors" | "objects") {
    setPhase("ranScoring");
    const fd = new FormData();
    fd.append("audio", wav, "ran.wav"); fd.append("variant", variant);
    const res = await fetch("/api/score-ran", { method: "POST", body: fd });
    const body = await res.json();
    setRanScore(body.score);
    if (slug) await fetch("/api/report", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, ranScore: body.score }) });
    setPhase("ranResult");
  }

  // Render switch by phase: intro (Start button), reading (PassageCard + countdown + Done),
  // scoring (spinner), result (ReportView + next actions), practice (missed word list),
  // ran (RanGrid + capture), ranResult (RanScore card), done (share link `${location.origin}/report/${slug}`).
}
```

Fill the render switch with real JSX (PassageCard shows `passage.text` large, word wrap, sentence breaks; countdown from `setInterval` 1s started at reading phase, cleared at finish). Keep the agent transcript display minimal (`transcript` state via onUserTranscript).

- [ ] **Verify:** `pnpm build` clean; manual run through phases with a real reading (you reading the G1 passage, planting one substitution and one omission); report renders with expected counts. 
- [ ] **Commit** `git commit -am "feat(ui): session phase state machine, reading flow, passage card"`

---

### Task 14: ReportView + PercentileChart

**Files:** Create: `src/components/ReportView.tsx`, `src/components/PercentileChart.tsx` (replace the Task 11 placeholder).

ReportView props: childName, grade, season, passageTitle, score: ReadingScore, ran: RanScore | null.

Sections: (1) headline — WCPM big number + tier badge + accuracy; (2) PercentileChart — horizontal band chart with colored ReferenceArea zones (<10 red At Risk, 10-25 amber, 25-100 green) + ReferenceLine marker at estimated percentile; (3) error table (type, expected, got, sentence #); (4) missed words chips (drill list); (5) RAN card if present (items/sec + flag + no-norms disclaimer); (6) citations footer: "Norms: Hasbrouck & Tindal (2017), Univ. of Oregon, Technical Report No. 1702. Scoring rules per DIBELS 8 conventions. Single-passage screening indicator — not a diagnosis." + low-confidence disclosure line when `lowConfidenceWords.length > 0`.

PercentileChart (Recharts):

```tsx
"use client";
import { ReferenceArea, ReferenceLine, ResponsiveContainer, ScatterChart, XAxis, YAxis } from "recharts";

export default function PercentileChart({ estimated, tier }: { estimated: number | "<10" | ">90"; tier: string }) {
  const x = typeof estimated === "number" ? estimated : estimated === "<10" ? 5 : 95;
  return (
    <div className="h-24 w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
          <XAxis dataKey="x" type="number" domain={[0, 100]} ticks={[10, 25, 50, 75, 90]} />
          <YAxis dataKey="y" type="number" domain={[0, 1]} hide />
          <ReferenceArea x1={0} x2={10} y1={0} y2={1} fill="#dc2626" fillOpacity={0.15} label="At risk" />
          <ReferenceArea x1={10} x2={25} y1={0} y2={1} fill="#f59e0b" fillOpacity={0.15} label="Below" />
          <ReferenceArea x1={25} x2={100} y1={0} y2={1} fill="#16a34a" fillOpacity={0.15} label="On track" />
          <ReferenceLine x={x} stroke="#111827" strokeWidth={2} label={`Your reader: ~${estimated}`} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Verify:** `pnpm build`; render `/report/<slug>` from the manual Task 13 session — all sections show, chart bands + marker correct for the score's tier.
- [ ] **Commit** `git commit -am "feat(ui): report view with percentile band chart, error table, citations footer"`

---

### Task 15: RanGrid + RAN phase

**Files:** Create: `src/components/RanGrid.tsx` (8 rows x 5 colored squares or emoji objects from `RAN_STIMULI`), wire into SessionClient phases (started via `start_ran_task` tool or UI button).

Flow: grid appears → "Start" → `startCapture()` → child names all 40 → "Done" → `stopCapture()` → `finishRan(wav, variant)`. Colors rendered as colored divs with no text label (naming from color perception); objects as large emoji (⚽🐱🐶⭐🌳).

```tsx
"use client";
import { RAN_STIMULI } from "@/lib/data/stimuli";

const COLORS: Record<string, string> = {
  red: "#dc2626", blue: "#2563eb", green: "#16a34a", yellow: "#eab308", black: "#111827",
};
const EMOJI: Record<string, string> = { ball: "⚽", cat: "🐱", dog: "🐶", star: "⭐", tree: "🌳" };

export default function RanGrid({ variant }: { variant: "colors" | "objects" }) {
  const items = RAN_STIMULI[variant];
  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map((item, k) => (
        <div key={k} className="flex h-16 w-16 items-center justify-center rounded-lg border text-3xl"
          style={variant === "colors" ? { backgroundColor: COLORS[item] } : undefined}>
          {variant === "objects" ? EMOJI[item] : ""}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Verify:** manual run — name all items at a natural pace; expect stimuliNamed ≈ 40, itemsPerSecond ~0.7-1.1 for an adult, flag "typical".
- [ ] **Commit** `git commit -am "feat(ui): RAN 40-item naming grid, colors + objects variants"`

---

### Task 16: Practice loop

**Files:** Modify: `src/components/SessionClient.tsx`.

Practice phase UI: iterate `score.missedWords` (substitutions + omissions only; insertions skipped — nothing to drill): show the expected word large, a "Say it" agent button (`send({ type: "reply.create", reply: { text: \`The word is ${word}. Can you say it?\` } })` — verify reply.create shape against docs), listen via `onUserTranscript`, mark word as "practiced" when the final transcript contains the normalized word; progress "3/5 practiced". The agent's own instructions section 6 drives the same loop conversationally — the UI is the visual companion.

- [ ] **Verify:** manual — plant 3 errors in a reading, practice all 3, UI progress completes; agent stays within 3-sentence replies.
- [ ] **Commit** `git commit -am "feat(ui): missed-word practice loop with agent echo drill"`

---

### Task 17: Demo page + Playwright smoke

**Files:** Create: `src/app/demo/page.tsx`, `tests/e2e/demo.spec.ts`, `playwright.config.ts`; add devDeps `@playwright/test`.

`/demo` (judge fallback + E2E target): file input (.wav/.webm) + passageId/grade/season selects → POST /api/score-reading → render ReportView inline.

```ts
// tests/e2e/demo.spec.ts
import { expect, test } from "@playwright/test";

test("demo page renders and blocks submit until file chosen", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /demo/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /score/i })).toBeDisabled();
});

test("report page renders for a seeded slug", async ({ page }) => {
  // seed: run `pnpm tsx scripts/seed-report.ts` in webServer command first (script creates one Report row via prisma and prints slug to a fixed file)
  await page.goto("/report/readpulse-seed");
  await expect(page.getByText(/words correct per minute/i)).toBeVisible();
});
```

`scripts/seed-report.ts`: creates a Report with slug "readpulse-seed" and a hardcoded ReadingScore fixture (the perfect-read fixture from Task 4). playwright.config.ts: `webServer: { command: "pnpm dev", url: "http://localhost:3000" }`, `use: { baseURL: "http://localhost:3000" }`. First e2e test intentionally avoids real audio upload (flaky); the audio path is covered by Task 18's validation runner end-to-end with real files.

- [ ] **Verify:** `pnpm exec playwright test` — 2/2 pass.
- [ ] **Commit** `git commit -am "feat(demo): audio-file demo page + Playwright smoke tests"`

---

### Task 18: Validation study kit + run

**Files:** Create: `src/lib/stats.ts` (+test), `scripts/validation/run-scoring.ts`, `scripts/validation/analyze.ts`, `scripts/validation/PROTOCOL.md`, `scripts/seed-report.ts` (Task 17), `validation/labels.csv` template, output `VALIDATION.md`. Add devDep `tsx`.

- [ ] **Step 1: stats.ts (TDD)**

```ts
// tests (src/lib/stats.test.ts):
// pearson([1,2,3],[1,2,3]) === 1
// pearson([1,2,3],[3,2,1]) === -1
// mae([1,2],[2,4]) === 1.5
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let k = 0; k < n; k++) {
    const a = xs[k] - mx, b = ys[k] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}
export function mae(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  return xs.slice(0, n).reduce((s, x, k) => s + Math.abs(x - ys[k]), 0) / Math.max(1, n);
}
```

- [ ] **Step 2: PROTOCOL.md** (complete instructions): recruit 2-4 volunteer readers; for each of ~20 recordings: pick passage + grade; follow an error script (e.g. "G3, reader B, script: 2 substitutions (lines 1,2), 1 omission (line 3), 1 self-correction (line 4), hesitate 4s on 'garden'"); record via the app itself in a "record-only" mode (add a dev toggle on /demo that records and downloads the wav without scoring) or Windows Voice Recorder (convert to wav 24k mono if needed); human-score with stopwatch + error marks per DIBELS 8 rules (3s SC, 3s hesitation); fill `validation/labels.csv`: `file,passage_id,grade,season,human_wcpm,human_accuracy_pct,human_errors_json`.
- [ ] **Step 3: run-scoring.ts**: reads labels.csv, for each row reads `validation/recordings/<file>`, calls transcribeAudio + scoreReading, writes `validation/system-scores.json` (array with both human and system values).
- [ ] **Step 4: analyze.ts**: computes pearson + MAE for WCPM and accuracy, plus total error counts human vs system (ASR auto-correction bias, spec 5.11) and prints a markdown table; writes `VALIDATION.md` with methods paragraph (citing SERDA/Henkel methodology), results table, limitations (small N, adult voices, scripted errors).
- [ ] **Step 5: Run the study** (~20 recordings), generate VALIDATION.md, record headline r/MAE for slides.
- [ ] **Step 6: Commit** `git commit -am "feat(validation): study kit + results (human vs system agreement)"`

---

### Task 19: METHODOLOGY.md + README + deploy

**Files:** Create: `METHODOLOGY.md`, `README.md`; modify `.env.example`.

METHODOLOGY.md sections (write fully, no placeholders): 1) What is ORF/WCPM and why it screens (Deno 1985; NRP 2000). 2) Our scoring rules table — rule -> implementation -> citation (pull the 12 rules from spec Section 5). 3) Norms source + transcription URL + interpolation method. 4) RAN paradigm + no-norms disclaimer (Denckla & Rudel 1976; Araujo & Faísca 2019). 5) ASR limitation + mitigations (Molenaar 2023; Henkel 2024). 6) Validation study method + results (from VALIDATION.md). 7) Full reference list (spec Section 12).

README.md sections: hero (GIF of a session), 60-second pitch, architecture diagram (mermaid: browser worklet -> WS agents.assemblyai.com + tee -> /api/score-reading -> batch STT -> ScoringEngine -> Prisma), quickstart (pnpm i; .env.local; prisma db push; pnpm dev), demo URLs (/session, /demo, sample /report link), science section linking METHODOLOGY.md, hackathon compliance notes (original work, MIT license), team credit.

Deploy: `vercel` CLI (or GitHub integration), set AAI_API_KEY + DATABASE_URL env vars. Note: SQLite does not persist across serverless instances — acceptable for demo; document the limitation in README ("demo persistence is best-effort; production would move to Postgres"), OR switch DATABASE_URL to a free Supabase Postgres at this point if report links flake during judging (30-minute swap, prisma schema provider change).

- [ ] **Verify:** deployed URL loads /session with working token route (`curl -X POST https://<app>.vercel.app/api/session-token` returns token JSON).
- [ ] **Commit** `git commit -am "docs: methodology, README, deployment"`

---

### Task 20: Submission package (deadline Sep 30, 15:00 UTC)

- [ ] Video (~3 min, script first): 0:00-0:40 problem (1-in-children reading delay story, show norms chart); 0:40-1:50 live demo (full session incl. planted errors + report + practice); 1:50-2:35 the science (CBM rules on screen, validation r/MAE, citations); 2:35-3:00 business (tutoring centers, EFL, MTSS Tier-1; precedents Amira/Moby.Read).
- [ ] Slides: 8 pages — title / problem / demo screenshots / architecture / THE SCIENCE (rules->citations table) / validation results / business value / team+links.
- [ ] lablab.ai submission form: title, short + long description (reuse README pitch), tags (education, voice-agent, assemblyai), cover image (session screenshot with percentile chart), repo URL (public, MIT license file), demo URL, video link.
- [ ] Final repo pass: MIT LICENSE, .env not committed (`git log --all -- .env.local` must be empty), README links work, VALIDATION.md numbers match slides.
- [ ] Commit any final assets `git commit -am "chore: submission package"`

---

## Self-Review (completed during planning)

- **Spec coverage:** P0 items map to Tasks 2-14, 17-19; P1 RAN -> Tasks 6, 15; practice loop -> Task 16; share link -> Tasks 10-11; validation -> Task 18; submission -> Task 20. Spec 5.7 grades 1-6 norms cover grades beyond passage grades 1/3/5 (norms cover 1-6; passages P0 = 3 levels — spec's flow selects grade then passage; grade-to-passage mapping: 1->g1, 2->g1, 3->g3, 4->g3, 5->g5, 6->g5, documented in SessionClient).
- **Known deliberate deviations:** none material; operational parameters (LOW_CONFIDENCE 0.8, RAN 0.5 items/s) are marked as operational in code and spec.
- **Type consistency:** SttWord/ReadingScore/RanScore/NormRow/PassageWord defined in Task 1 and used unchanged in Tasks 4-16; alignWords returns RawOp (Task 3) consumed by cbmScorer; estimatePercentile signature fixed in Task 5 and called in Task 4.
