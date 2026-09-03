import type { ReadingScore, RanScore } from "@/lib/scoring/types";

// Placeholder report renderer; replaced by the full report UI in Task 14.
export default function ReportView(props: {
  childName: string | null;
  grade: number;
  season: string;
  passageTitle: string;
  score: ReadingScore;
  ran: RanScore | null;
}) {
  return (
    <section>
      <h1 className="text-2xl font-bold">{props.childName ?? "Reader"} - Reading Report</h1>
      <p className="text-gray-600">
        {props.passageTitle} - Grade {props.grade} ({props.season})
      </p>
      <p className="mt-4 text-4xl font-bold" data-testid="wcpm">{props.score.wcpm}</p>
      <p className="text-sm text-gray-500">words correct per minute</p>
    </section>
  );
}
