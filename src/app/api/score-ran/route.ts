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
  if (variant !== "colors" && variant !== "objects") {
    return Response.json({ error: "variant must be colors or objects" }, { status: 400 });
  }
  try {
    const words = await transcribeAudio(audio);
    const score = analyzeRan({ stimuli: RAN_STIMULI[variant], transcript: words });
    return Response.json({ score });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
