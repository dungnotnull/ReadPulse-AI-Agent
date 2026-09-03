import type { SttWord } from "./scoring/types";

const KEY = () => {
  const k = process.env.AAI_API_KEY;
  if (!k) throw new Error("AAI_API_KEY missing");
  return k;
};

// VERIFIED endpoints — see docs/superpowers/specs/assemblyai-voice-agent-facts.md
// The Voice Agent API requires the Bearer prefix (unique among AssemblyAI products).
// Per the API docs, expires_in_seconds (max 600) is the token REDEMPTION window
// (mint -> connect); the session itself runs up to max_session_duration_seconds
// (default 3h). Using the max removes any connect-delay risk; mid-session
// expiry is not a concern.
export async function createVoiceAgentToken(expiresInSeconds = 600): Promise<string> {
  const res = await fetch(
    `https://agents.assemblyai.com/v1/token?expires_in_seconds=${expiresInSeconds}`,
    { headers: { Authorization: `Bearer ${KEY()}` } }
  );
  if (!res.ok) throw new Error(`token failed: ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

interface SyncWord { text: string; start: number; end: number; confidence: number }
interface SyncResponse { text: string; words?: SyncWord[] }

// Sync API: single round trip for our <=60s clips (limits 80ms-120s, <=40MB, WAV ok).
export async function transcribeAudio(audio: Blob): Promise<SttWord[]> {
  const fd = new FormData();
  // Typeless Blobs (e.g. from Node file buffers) default to application/octet-stream,
  // which the sync API rejects with 415; fall back to WAV, our only client format.
  const audioBlob = audio.type ? audio : new Blob([audio], { type: "audio/wav" });
  fd.append("audio", audioBlob, "reading.wav");
  fd.append(
    "config",
    // timestamps: true is required — the sync API omits word start/end by default
    // (verified live + https://www.assemblyai.com/docs/sync-stt/word-timestamps)
    new Blob([JSON.stringify({ language_code: "en", timestamps: true })], { type: "application/json" })
  );
  const res = await fetch("https://sync.assemblyai.com/transcribe", {
    method: "POST",
    headers: {
      Authorization: KEY(), // raw key, NO Bearer for STT products
      "X-AAI-Model": "universal-3-5-pro",
    },
    body: fd,
  });
  if (!res.ok) throw new Error(`sync transcription failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as SyncResponse;
  return (data.words ?? []).map((w) => ({
    text: w.text, start_ms: w.start, end_ms: w.end, confidence: w.confidence,
  }));
}
