import { transcribeAudio } from "@/lib/assemblyai";
import { scoreReading } from "@/lib/scoring";
import { passageById } from "@/lib/data/passages";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

// Grade-to-passage mapping: 1->g1, 2->g1, 3->g3, 4->g3, 5->g5, 6->g5.

// Accept the raw Request (Next.js handler) or a { request } wrapper (tests).
export async function POST(req: Request) {
  const request =
    "request" in req ? (req as unknown as { request: Request }).request : req;
  const form = await request.formData().catch(() => null);
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
        slug,
        childName,
        grade,
        season,
        passageId: passage.id,
        passageTitle: passage.title,
        readingScore: JSON.stringify(score),
      },
    });
    return Response.json({ score, reportSlug: slug });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("grade 1 fall")) {
      return Response.json(
        { error: "No published norms for grade 1 fall - benchmarking unavailable" },
        { status: 422 }
      );
    }
    if (msg.includes("Unknown passage")) {
      return Response.json({ error: msg }, { status: 400 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
