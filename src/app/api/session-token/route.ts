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
