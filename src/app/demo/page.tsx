"use client";

import { useState } from "react";
import Link from "next/link";
import ReportView from "@/components/ReportView";
import { PASSAGES } from "@/lib/data/passages";
import type { ReadingScore } from "@/lib/scoring/types";

interface ScoreResponse {
  score: ReadingScore;
  reportSlug?: string;
  error?: string;
}

// Judge fallback: upload a pre-recorded reading instead of using the live session flow.
export default function DemoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [passageId, setPassageId] = useState(PASSAGES[0].id);
  const [grade, setGrade] = useState(3);
  const [season, setSeason] = useState("fall");
  const [childName, setChildName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: ReadingScore; slug: string | null } | null>(null);

  const passage = PASSAGES.find((p) => p.id === passageId) ?? PASSAGES[0];

  // Grade 1 readers only get the fall-disable rule per benchmark conventions.
  function handleGradeChange(value: number) {
    setGrade(value);
    if (value === 1 && season === "fall") {
      setSeason("winter");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("audio", file);
      form.append("passageId", passageId);
      form.append("grade", String(grade));
      form.append("season", season);
      if (childName.trim()) form.append("childName", childName.trim());
      const res = await fetch("/api/score-reading", { method: "POST", body: form });
      const data = (await res.json()) as ScoreResponse;
      if (!res.ok || data.error) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setResult({ score: data.score, slug: data.reportSlug ?? null });
      }
    } catch {
      setError("Failed to reach the scoring service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-bold">ReadPulse Demo - score a recording</h1>
        <p className="text-sm text-gray-600">
          Upload a pre-recorded passage reading to see the full report without a microphone.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="audio" className="block text-sm font-semibold">
            Audio recording
          </label>
          <input
            id="audio"
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="passageId" className="block text-sm font-semibold">
            Passage
          </label>
          <select
            id="passageId"
            value={passageId}
            onChange={(e) => setPassageId(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            {PASSAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">{passage.text}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="grade" className="block text-sm font-semibold">
              Grade
            </label>
            <select
              id="grade"
              value={grade}
              onChange={(e) => handleGradeChange(Number(e.target.value))}
              className="w-full rounded border px-3 py-2"
            >
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="season" className="block text-sm font-semibold">
              Season
            </label>
            <select
              id="season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="fall" disabled={grade === 1}>
                fall
              </option>
              <option value="winter">winter</option>
              <option value="spring">spring</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="childName" className="block text-sm font-semibold">
            Child&apos;s first name
          </label>
          <input
            id="childName"
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="Optional"
          />
        </div>

        <button
          type="submit"
          disabled={!file || submitting}
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Scoring..." : "Score reading"}
        </button>
      </form>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {result && (
        <section className="space-y-4">
          <ReportView
            childName={childName.trim() || null}
            grade={grade}
            season={season}
            passageTitle={passage.title}
            score={result.score}
            ran={null}
          />
          {result.slug && (
            <Link href={`/report/${result.slug}`} className="block text-center text-blue-600 underline">
              Open shareable report
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
