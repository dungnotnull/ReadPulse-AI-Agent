# AssemblyAI API Facts (verified from official coding-agent documentation, 2026-09-03)

Authoritative reference snapshot used by this project. Source: AssemblyAI "Start building with a coding agent" default prompt (official docs context) + https://www.assemblyai.com/docs/llms.txt. If anything here conflicts with live docs, live docs win — re-fetch llms.txt.

## Voice Agent API (conversational layer)

- Endpoint: `wss://agents.assemblyai.com/v1/ws`
- Auth (server): `Authorization: Bearer YOUR_API_KEY` — Bearer prefix REQUIRED (unique to this product; everything else uses the raw key with no prefix)
- Auth (browser): temp token as `?token=<token>` query param; mint server-side:
  `GET https://agents.assemblyai.com/v1/token?expires_in_seconds=480` with `Authorization: Bearer <key>` header
  - `expires_in_seconds`: 1-600; `max_session_duration_seconds`: 60-10800 optional; tokens single-use per session
- Audio: PCM16 mono 24kHz, base64 inside JSON events, ~50ms chunks fine
- Lifecycle: connect -> send `session.update` IMMEDIATELY (do not wait) -> receive `session.ready` (has session_id) -> only THEN start sending `input.audio`
- `session.update` shape (FLAT schema):
  ```json
  {
    "type": "session.update",
    "session": {
      "system_prompt": "...",
      "greeting": "...",
      "input": {
        "format": { "encoding": "audio/pcm" },
        "keyterms": ["optional"],
        "turn_detection": { "vad_threshold": 0.5, "min_silence": 200, "max_silence": 1000, "interrupt_response": true }
      },
      "output": { "voice": "anna", "format": { "encoding": "audio/pcm" } },
      "tools": [ { "type": "function", "name": "...", "description": "...", "parameters": {JSON Schema} } ]
    }
  }
  ```
  - Tools use the FLAT schema (NOT OpenAI's nested {type:"function", function:{...}} form)
  - Voices are exact string names: default "anna"; others include alba, jane, michael (US), charles, paul, vera (UK), lola (es), estelle (fr), juergen (de), giovanni (it), rafael (pt). Authoritative list: `GET https://agents.assemblyai.com/v1/voices`. Old names (claire, dawn, josh, grace, pete) are INVALID.
- Client -> server: `{ "type": "input.audio", "audio": "<base64>" }` (field name is `audio`)
- Server -> client events: session.ready, session.error/error, input.speech.started/stopped, transcript.user.delta / transcript.user (final), reply.started, reply.audio (base64 PCM16 24k in field `data`), transcript.agent, reply.done (status completed|interrupted), tool.call {call_id, name, arguments}
  - FIELD ASYMMETRY: input audio field = `audio`; reply audio field = `data`
- Tool results: execute locally, send `{ "type": "tool.result", "call_id": "...", "result": "<JSON string>" }` AFTER reply.done fires. If reply.done.status == "interrupted" (barge-in), DISCARD pending tool results.
- Playback: write each reply.audio PCM chunk directly into an audio buffer queue; never sleep-schedule. On interrupted: flush the buffer.
- Resume: within 30s of disconnect, reconnect with a NEW token + `session.resume` carrying previous session_id.

## Transcription (scoring layer)

### Sync API (preferred for our <=60s reading/RAN clips)
- `POST https://sync.assemblyai.com/transcribe` — multipart/form-data: `audio` file part + `config` JSON part; headers: `Authorization: <raw key>` (no Bearer) + `X-AAI-Model: universal-3-5-pro`
- Limits: 80ms-120s, <=40MB, PCM/WAV 16-bit, mono/stereo, sample rate in {8000,16000,22050,24000,32000,44100,48000}
- Response (single round trip, no polling): `{ text, words: [{text, start, end, confidence}], confidence, audio_duration_ms, session_id }` — timings in ms
- config part fields: prompt (<=4096 chars), keyterms_prompt (<=2048 chars), language_code ("en")
- CORRECTION (live smoke, 2026-09-03): word `start`/`end` are OMITTED by default. Config must set `timestamps: true` (https://www.assemblyai.com/docs/sync-stt/word-timestamps). Also: audio Blob needs an explicit MIME type (e.g. audio/wav) or the API returns 415 for application/octet-stream.

### Async API (fallback for long audio)
- `POST https://api.assemblyai.com/v2/upload` — RAW BINARY body (not multipart), raw-key Authorization -> `{upload_url}`
- `POST https://api.assemblyai.com/v2/transcript` — `{audio_url, speech_models: ["universal-3-5-pro", "universal-2"]}` (PLURAL array, ordered fallback list)
- `GET /v2/transcript/{id}` — statuses queued/processing/completed/error; words[] have text/start/end/confidence (ms)

### General
- REST base: https://api.assemblyai.com (EU: api.eu.assemblyai.com)
- Authorization for STT products: raw key, NO Bearer prefix (401 otherwise)
- Deprecated params (do not use): auto_chapters, summarization, summary_model, summary_type; singular speech_model on async requests
- Realtime STT v3 (not used by ReadPulse; scoring is sync/async): wss://streaming.assemblyai.com/v3/ws, singular speech_model, PCM16 16k binary frames, always Terminate
