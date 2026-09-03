import SessionClient from "@/components/SessionClient";
import { gradeToPassageId, isGrade, isSeason } from "@/lib/session";

export default function SessionPage({
  searchParams,
}: {
  searchParams: { childName?: string; grade?: string; season?: string };
}) {
  const grade = Number(searchParams.grade);
  const season = searchParams.season;
  const valid = isGrade(grade) && isSeason(season) && !(grade === 1 && season === "fall");

  if (!valid) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <p className="text-gray-700">
          That session link is missing or invalid. Grade 1 fall is not supported.
        </p>
        <a href="/" className="text-blue-600 underline">
          Back to setup
        </a>
      </div>
    );
  }

  const childName = (searchParams.childName ?? "").trim();

  return (
    <SessionClient
      childName={childName}
      grade={grade}
      season={season}
      passageId={gradeToPassageId(grade)}
    />
  );
}
