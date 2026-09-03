// Validation study: run the REAL scoring pipeline over each labeled recording.
// Reads validation/labels.csv, transcribes each recording with AssemblyAI sync STT,
// scores with scoreReading, and writes validation/system-scores.json.
// Run: pnpm validation:run
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { transcribeAudio } from "../../src/lib/assemblyai";
import { passageById } from "../../src/lib/data/passages";
import { scoreReading } from "../../src/lib/scoring";
import { parseCsv } from "./csv";

const ROOT = resolve(__dirname, "..", "..");
const LABELS = join(ROOT, "validation", "labels.csv");
const RECORDINGS = join(ROOT, "validation", "recordings");
const OUT = join(ROOT, "validation", "system-scores.json");

// tsx does not load Next.js env files; the API key lives in .env.local.
function loadEnvLocal(): void {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

interface HumanRow {
  file: string;
  passage_id: string;
  grade: number;
  season: string;
  human_wcpm: number;
  human_accuracy_pct: number;
  notes: string;
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!existsSync(LABELS)) {
    console.error(`Missing ${LABELS}`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(LABELS, "utf8")) as Array<Record<string, string>>;
  const results: Array<{ file: string; human: HumanRow; system: unknown }> = [];

  for (const row of rows) {
    const audioPath = join(RECORDINGS, row.file);
    if (!existsSync(audioPath)) {
      console.warn(`SKIP (missing): ${row.file}`);
      continue;
    }
    const passage = passageById(row.passage_id);
    const buffer = readFileSync(audioPath);
    console.log(`Transcribing ${row.file} (${(buffer.length / 1024).toFixed(0)} KB)...`);
    const transcript = await transcribeAudio(new Blob([buffer], { type: "audio/wav" }));
    const score = scoreReading({
      passage: passage.words,
      transcript,
      grade: Number(row.grade) as 1 | 3 | 5,
      season: row.season as "fall" | "winter" | "spring",
    });
    results.push({
      file: row.file,
      human: {
        file: row.file,
        passage_id: row.passage_id,
        grade: Number(row.grade),
        season: row.season,
        human_wcpm: Number(row.human_wcpm),
        human_accuracy_pct: Number(row.human_accuracy_pct),
        notes: row.notes ?? "",
      },
      system: {
        wcpm: score.wcpm,
        accuracyPct: score.accuracyPct,
        counts: score.counts,
      },
    });
    console.log(`  -> wcpm=${score.wcpm} accuracy=${score.accuracyPct}`);
  }

  writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n");
  console.log(`Wrote ${results.length} scored recording(s) to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
