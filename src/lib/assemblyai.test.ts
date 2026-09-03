import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createVoiceAgentToken, transcribeAudio } from "./assemblyai";

beforeAll(() => { process.env.AAI_API_KEY = "test_key_123"; });
afterEach(() => vi.unstubAllGlobals());

describe("createVoiceAgentToken", () => {
  it("GETs the agents token endpoint with Bearer auth and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "tok_123" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = await createVoiceAgentToken();
    expect(token).toBe("tok_123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://agents.assemblyai.com/v1/token?expires_in_seconds=600");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test_key_123");
  });
});

describe("transcribeAudio", () => {
  it("POSTs multipart to the sync API with X-AAI-Model and maps words to SttWord", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        text: "Hello",
        words: [{ text: "Hello", start: 100, end: 400, confidence: 0.99 }],
      }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const words = await transcribeAudio(new Blob(["x"]));
    expect(words).toEqual([{ text: "Hello", start_ms: 100, end_ms: 400, confidence: 0.99 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://sync.assemblyai.com/transcribe");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-AAI-Model"]).toBe("universal-3-5-pro");
    expect((init.headers as Record<string, string>).Authorization).toBe("test_key_123");
  });
  it("throws with status and body on non-OK sync response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error_code: "audio_too_short" }), { status: 400 })
    ));
    await expect(transcribeAudio(new Blob(["x"]))).rejects.toThrow(/400/);
  });
});
