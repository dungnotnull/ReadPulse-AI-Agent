import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/assemblyai", () => ({
  transcribeAudio: vi.fn().mockResolvedValue([
    { text: "The", start_ms: 1000, end_ms: 1200, confidence: 0.95 },
    { text: "little", start_ms: 1300, end_ms: 1500, confidence: 0.95 },
    { text: "dog", start_ms: 1600, end_ms: 1800, confidence: 0.95 },
    { text: "sat", start_ms: 1900, end_ms: 2100, confidence: 0.95 },
  ]),
}));
vi.mock("@/lib/db", () => ({
  prisma: { report: { create: vi.fn().mockResolvedValue({ slug: "abc123" }) } },
}));

import { POST } from "./route";
import { passageById } from "@/lib/data/passages";

function makeForm(): FormData {
  const fd = new FormData();
  fd.append("audio", new Blob(["x"]), "reading.webm");
  fd.append("passageId", "g1-cat-ball");
  fd.append("grade", "1");
  fd.append("season", "spring");
  fd.append("childName", "Test");
  return fd;
}

describe("POST /api/score-reading", () => {
  it("returns ReadingScore with substituted error and a report slug", async () => {
    const res = await POST({ request: new Request("http://x", { method: "POST", body: makeForm() }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score.counts.substitutions).toBe(1); // cat -> dog
    expect(typeof body.reportSlug).toBe("string");
  });
  it("400 on missing fields", async () => {
    const res = await POST({ request: new Request("http://x", { method: "POST", body: new FormData() }) } as any);
    expect(res.status).toBe(400);
  });
  it("422 for grade 1 fall (no published norms)", async () => {
    const fd = makeForm();
    fd.set("season", "fall");
    const res = await POST({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(422);
  });
  it("400 for invalid grade", async () => {
    const fd = makeForm();
    fd.set("grade", "9");
    const res = await POST({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(400);
  });
});
