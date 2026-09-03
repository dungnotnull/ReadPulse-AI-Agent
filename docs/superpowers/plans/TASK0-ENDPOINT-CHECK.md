# Task 0: AssemblyAI Endpoint Check

**Status: RESOLVED (2026-09-03)** — endpoints verified against AssemblyAI's official coding-agent documentation; canonical facts live in `docs/superpowers/specs/assemblyai-voice-agent-facts.md`:

- Voice Agent temp token: `GET https://agents.assemblyai.com/v1/token?expires_in_seconds=...` with `Authorization: Bearer <key>`
- Transcription (<=120s clips): `POST https://sync.assemblyai.com/transcribe` (multipart, `X-AAI-Model: universal-3-5-pro`)
- Async fallback: `POST /v2/upload` (raw binary) + `POST /v2/transcript` with `speech_models: ["universal-3-5-pro", "universal-2"]`

Task 9's live smoke test (real key) is the runtime confirmation. Original pending-check commands kept below for reference.

---

**Status (original): PENDING until AAI_API_KEY is set in .env.local**

Run the following commands to verify the AssemblyAI endpoints before wiring up the voice agent (Task 9).

```bash
# a) Batch STT upload endpoint sanity check (expect 401 without auth, NOT 404):
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.assemblyai.com/v2/upload -H "authorization: $AAI_API_KEY" --data-binary "x"

# b) Voice Agent temporary token — try both documented candidates with the real key:
curl -s -X POST https://api.assemblyai.com/v1/realtime/token -H "authorization: $AAI_API_KEY" -H "content-type: application/json" -d '{"expires_in_seconds":480}'
curl -s -X GET "https://streaming.assemblyai.com/v3/token?expires_in_seconds=480" -H "Authorization: $AAI_API_KEY"
```

Expected results:
- (a) `401` — confirms the upload endpoint is reachable and auth header format is correct.
- (b) One of the two candidates should return a JSON token; record which endpoint works.
