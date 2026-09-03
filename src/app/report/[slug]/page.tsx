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
