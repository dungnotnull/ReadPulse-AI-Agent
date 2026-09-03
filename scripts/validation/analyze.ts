// Validation study analysis: join human labels with system scores, report
// Pearson r + MAE for WCPM and accuracy, and compare error totals.
// Writes VALIDATION.md. Run: pnpm validation:analyze
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mae, pearson } from "../../src/lib/stats";
import { parseCsv } from "./csv";

const ROOT = resolve(__dirname, "..", "..");
const LABELS = join(ROOT, "validation", "labels.csv");
const SCORES = join(ROOT, "validation", "system-scores.json");
const OUT = join(ROOT, "VALIDATION.md");

const METHODS = `## Methods

Recordings of oral reading were collected per the protocol in
\`scripts/validation/PROTOCOL.md\`: 15-20 one-minute readings across three
graded passages (g1/g3/g5) with planted errors (substitutions, omissions,
insertions, hesitations, self-corrections) and varied reader proficiency.
Each recording was scored twice, independently:

1. **Human ground truth** — a human scorer marked errors live per DIBELS 8
   conventions (1-minute window from first word; self-correction within 3 s
   counts correct; hesitation > 3 s counts as an error) and computed WCPM
   and accuracy by hand.
2. **System** — the production ReadPulse pipeline: AssemblyAI sync STT
   (universal-3-5-pro, word timestamps) followed by the CBM scoring engine
   (word alignment, self-correction collapse, 60 s window).

Agreement was assessed with Pearson's r and mean absolute error (MAE) for
WCPM and reading accuracy. Error totals (substitutions + omissions +
insertions, and self-corrections separately) are compared to expose ASR
auto-correction bias: speech models can "fix" reader errors, so the system
is expected to under-count errors relative to the human scorer. This
agreement-analysis methodology replicates van der Velde et al. 2025 (SERDA,
PMC12686063) and Molenaar et al. 2023 (arXiv:2306.03444).

Rows whose filename starts with \`r00-\` are TTS smoke recordings, not human
readings; they are excluded from headline metrics.`;

const LIMITATIONS = `## Limitations

- Small sample size (n at most ~20): correlation estimates carry wide
  confidence intervals and are sensitive to single readings.
- Adult voices simulating child readers, including simulated error patterns;
  genuine child speech (smaller vocal tracts, disfluencies) is harder for ASR
  and may depress agreement.
- Errors were scripted and planted, so the error distribution is not that of
  natural oral reading.
- Multiple recordings may come from the same reader and the passage set is
  small, so readings are not fully independent observations.
- ASR auto-correction bias is expected to push system accuracy upward relative
  to human scoring; the error-count comparison quantifies the direction.`;

interface Row {
  file: string;
  human: { human_wcpm: number; human_accuracy_pct: number };
  system: {
    wcpm: number;
    accuracyPct: number;
    counts: { substitutions: number; omissions: number; insertions: number; selfCorrections: number };
  };
}

function fmt(r: number): string {
  return r.toFixed(3);
}

function main(): void {
  if (!existsSync(SCORES)) {
    console.error(`Missing ${SCORES} - run \`pnpm validation:run\` first`);
    process.exit(1);
  }
  const scores = JSON.parse(readFileSync(SCORES, "utf8")) as Row[];
  const labeled = parseCsv(readFileSync(LABELS, "utf8")) as Array<Record<string, string>>;

  // Join on file; exclude TTS smoke recordings (r00-*) from headline metrics.
  const labeledFiles = new Set(labeled.map((r) => r.file));
  const paired = scores.filter((s) => labeledFiles.has(s.file) && !s.file.startsWith("r00-"));

  if (paired.length < 4) {
    const content = `# ReadPulse Validation Study\n\n${METHODS}\n\nInsufficient data (n=${paired.length}) - collect recordings first. See \`scripts/validation/PROTOCOL.md\`.\n\n${LIMITATIONS}\n`;
    writeFileSync(OUT, content);
    console.log(`VALIDATION.md written: insufficient data (n=${paired.length})`);
    return;
  }

  const hw = paired.map((r) => r.human.human_wcpm);
  const sw = paired.map((r) => r.system.wcpm);
  const ha = paired.map((r) => r.human.human_accuracy_pct);
  const sa = paired.map((r) => r.system.accuracyPct);
  // Error totals need the labels file (scores' human snapshot omits them).
  const humanErrorTotals = labeled
    .filter((l) => paired.some((p) => p.file === l.file))
    .map((l) =>
      Number(l.human_substitutions) + Number(l.human_omissions) + Number(l.human_insertions)
    );
  const systemErrorTotals = paired.map(
    (r) => r.system.counts.substitutions + r.system.counts.omissions + r.system.counts.insertions
  );
  const humanSc = labeled
    .filter((l) => paired.some((p) => p.file === l.file))
    .map((l) => Number(l.human_self_corrections));
  const systemSc = paired.map((r) => r.system.counts.selfCorrections);

  const table = `| Metric | n | Pearson r | MAE |\n|---|---|---|---|\n| WCPM | ${paired.length} | ${fmt(pearson(hw, sw))} | ${mae(hw, sw).toFixed(1)} |\n| Accuracy (%) | ${paired.length} | ${fmt(pearson(ha, sa))} | ${mae(ha, sa).toFixed(1)} |`;

  const errorTable = `| Error count | Human (total) | System (total) |\n|---|---|---|\n| Substitutions + omissions + insertions | ${humanErrorTotals.reduce((a, b) => a + b, 0)} | ${systemErrorTotals.reduce((a, b) => a + b, 0)} |\n| Self-corrections | ${humanSc.reduce((a, b) => a + b, 0)} | ${systemSc.reduce((a, b) => a + b, 0)} |`;

  const content = `# ReadPulse Validation Study\n\n${METHODS}\n\n## Results\n\n${table}\n\n### Error-count comparison\n\n${errorTable}\n\n${LIMITATIONS}\n`;
  writeFileSync(OUT, content);

  console.log(table);
  console.log(errorTable);
  console.log(`VALIDATION.md written (n=${paired.length})`);
}

main();
