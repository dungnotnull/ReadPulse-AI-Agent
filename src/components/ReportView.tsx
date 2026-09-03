import type { ReadingScore, RanScore, Tier } from "@/lib/scoring/types";
import PercentileChart from "@/components/PercentileChart";

interface ReportViewProps {
  childName: string | null;
  grade: number;
  season: string;
  passageTitle: string;
  score: ReadingScore;
  ran: RanScore | null;
}

// Tier -> badge text and Tailwind color classes (bg-100 / text-700 pairs).
const TIER_STYLES: Record<Tier, { label: string; className: string }> = {
  on_track: { label: "On Track", className: "bg-green-100 text-green-700" },
  below_benchmark: { label: "Below Benchmark", className: "bg-amber-100 text-amber-700" },
  at_risk: { label: "At Risk", className: "bg-red-100 text-red-700" },
};

// Rows shown only when the count is nonzero, so the table reflects actual results.
const ERROR_ROWS: Array<{
  key: keyof ReadingScore["counts"];
  label: string;
  meaning: string;
}> = [
  { key: "substitutions", label: "Substitutions", meaning: "read a different word" },
  { key: "omissions", label: "Omissions", meaning: "skipped a word" },
  { key: "insertions", label: "Insertions", meaning: "added an extra word" },
  { key: "hesitations", label: "Hesitations", meaning: "stuck on a word for over 3 seconds" },
  { key: "selfCorrections", label: "Self-corrections", meaning: "caught and fixed - counts as correct" },
];

export default function ReportView({ childName, grade, season, passageTitle, score, ran }: ReportViewProps) {
  const tier = TIER_STYLES[score.percentile.tier];
  const { counts, missedWords, lowConfidenceWords } = score;
  const hasErrors = ERROR_ROWS.some((row) => counts[row.key] > 0);

  return (
    <section className="mx-auto max-w-2xl space-y-8 p-6">
      {/* 1. Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {childName ?? "Reader"} - Reading Report
          </h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${tier.className}`}>{tier.label}</span>
        </div>
        <p className="text-gray-600">
          {passageTitle} - Grade {grade} ({season} benchmark)
        </p>
      </header>

      {/* 2. Headline metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-4xl font-bold" data-testid="wcpm">{score.wcpm}</p>
          <p className="text-sm text-gray-500">words correct per minute</p>
        </div>
        <div>
          <p className="text-4xl font-bold">{score.accuracyPct}%</p>
          <p className="text-sm text-gray-500">accuracy</p>
          {score.accuracyPct < 95 && (
            <p className="mt-1 text-xs text-amber-700">&lt; 95% suggests instructional-level support</p>
          )}
        </div>
        <div>
          <p className="text-4xl font-bold">{score.windowSeconds.toFixed(1)}s</p>
          <p className="text-sm text-gray-500">reading time scored</p>
        </div>
      </div>

      {/* 3. Percentile band chart */}
      <div className="space-y-2">
        <PercentileChart estimated={score.percentile.estimated} tier={score.percentile.tier} />
        <p className="text-xs text-gray-500">
          Compared with US national ORF norms (Hasbrouck &amp; Tindal 2017, University of Oregon, Technical Report No. 1702)
        </p>
      </div>

      {/* 4. Error breakdown */}
      {hasErrors && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Error breakdown</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2 font-medium">Error type</th>
                <th className="py-2 font-medium">Count</th>
                <th className="py-2 font-medium">What it means</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_ROWS.filter((row) => counts[row.key] > 0).map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2">{row.label}</td>
                  <td className="py-2 font-semibold">{counts[row.key]}</td>
                  <td className="py-2 text-gray-600">{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500">
            Scoring rules follow DIBELS-style oral reading fluency conventions.
          </p>
        </div>
      )}

      {/* 5. Missed words chips */}
      {missedWords.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Words to practice</h2>
          <div className="flex flex-wrap gap-2">
            {missedWords.map((missed, index) => {
              let text: string;
              if (missed.type === "substitution") {
                text = `${missed.expected} → ${missed.got ?? "?"}`;
              } else if (missed.type === "hesitation") {
                text = `${missed.expected} (hesitated)`;
              } else {
                text = missed.expected;
              }
              return (
                <span
                  key={`${missed.expected}-${index}`}
                  className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800"
                >
                  {text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. RAN card */}
      {ran && (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Rapid naming speed</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                ran.flag === "typical" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {ran.flag === "typical" ? "Typical" : "Slow"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold">
            {ran.itemsPerSecond.toFixed(2)} <span className="text-sm font-normal text-gray-500">items/sec</span>
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Naming speed is an additional signal linked to reading development (Denckla &amp; Rudel 1976; Araujo &amp;
            Faisca 2019). No age norms are embedded - this is not a diagnosis.
          </p>
        </div>
      )}

      {/* 7. Low-confidence disclosure */}
      {lowConfidenceWords.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Automated transcription was uncertain about:{" "}
          {lowConfidenceWords.map((item) => item.word).join(", ")}. These may need a human check.
        </p>
      )}

      {/* 8. Citations footer */}
      <footer className="border-t pt-4 text-xs text-gray-500">
        <p>
          Norms: Hasbrouck &amp; Tindal (2017) An Update to Compiled ORF Norms, Technical Report No. 1702, University of
          Oregon (public tables via Reading Rockets). Fluency scoring: CBM oral reading conventions (Deno 1985; DIBELS 8
          administration rules).
        </p>
        <p className="mt-1">Single-passage screening indicator - not a diagnosis. Generated by ReadPulse.</p>
      </footer>
    </section>
  );
}
