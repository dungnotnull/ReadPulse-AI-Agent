"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { passageById } from "@/lib/data/passages";
import ReportView from "@/components/ReportView";
import PassageCard from "@/components/PassageCard";
import RanGrid from "@/components/RanGrid";
import type { RanScore, ReadingScore } from "@/lib/scoring/types";
import { normalizeToTokens } from "@/lib/scoring/normalizer";

// Exact protocol prompt; do not paraphrase (scientific protocol requirement).
function buildInstructions(childName: string, grade: number, title: string): string {
  return `You are ReadPulse, a warm, encouraging virtual reading coach for children aged 6-12.
Session context: the child is about to read the passage "${title}" (grade ${grade}) shown on screen.
Rules:
1. Greet briefly by first name, then say: "When you are ready, press the Start Reading button and read the passage aloud. I will listen quietly."
2. During reading you must stay completely silent. Do not repeat the passage.
3. Only if the child is silent for about 3 seconds mid-sentence, say just the next word of the passage, nothing else, then stay silent again.
4. When the reading phase ends (the app takes over), call the score_reading tool and wait.
5. When score results arrive, praise effort first, then state in simple words: words correct per minute, how it compares to the national average, and 2-3 words to practice.
6. In the practice phase, for each missed word the app gives you: say the word, ask the child to repeat it, confirm warmly.
7. Keep every reply under 3 sentences. Never call the child's reading "bad". Never invent scores; only speak numbers that appear in tool results.`;
}

type Phase =
  | "intro"
  | "greeting"
  | "reading"
  | "scoring"
  | "result"
  | "practice"
  | "ran"
  | "ranScoring"
  | "ranResult"
  | "done";

const EMPTY_TOOL_PARAMS = { type: "object", properties: {}, required: [] } as const;

export default function SessionClient(props: {
  childName: string;
  grade: number;
  season: string;
  passageId: string;
}) {
  const { childName, grade, season, passageId } = props;
  const { passage, agentConfig } = useMemo(() => {
    const passage = passageById(passageId);
    return {
      passage,
      agentConfig: {
        instructions: buildInstructions(childName, grade, passage.title),
        tools: [
          {
            name: "score_reading",
            description:
              "Get the oral reading score for this session. Call after the reading phase ends and before discussing results.",
            parameters: { ...EMPTY_TOOL_PARAMS },
          },
          {
            name: "get_missed_words",
            description: "Get the list of words the child missed, for the practice phase.",
            parameters: { ...EMPTY_TOOL_PARAMS },
          },
          {
            name: "start_ran_task",
            description: "Start the rapid naming game.",
            parameters: { ...EMPTY_TOOL_PARAMS },
          },
        ],
        onUserTranscript: (text: string, isFinal: boolean) => {
          setTranscript(text);
          if (isFinal) setFinalTranscript(text);
        },
        onStatus: (s: string) => {
          setStatusLine(s);
          // The greeting reply finished speaking (user gesture already resumed audio):
          // start mic capture and hand the floor to the child.
          if (s === "reply.done" && phaseRef.current === "greeting") {
            startReading();
          }
        },
        onSpeechStarted: () => {
          // The 60s reading window starts on the child's FIRST speech, not on
          // entering the reading phase. Guarded by phase and existing interval.
          if (phaseRef.current === "reading" && !countdownIntervalRef.current) {
            setCountdown(60);
            countdownIntervalRef.current = setInterval(() => {
              setCountdown((prev) => (prev === null ? prev : Math.max(0, prev - 1)));
            }, 1000);
          }
        },
        onToolCall: async (name: string) => {
          if (name === "score_reading") {
            return scoreRef.current ?? { pending: true };
          }
          if (name === "get_missed_words") {
            return scoreRef.current?.missedWords ?? [];
          }
          if (name === "start_ran_task") {
            goPhase("ran");
            return { started: true };
          }
          return { ok: true };
        },
      } satisfies Parameters<typeof connect>[0],
    };
    // Built once from props; phase setters are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { connected, connect, disconnect, send, startCapture, stopCapture, resumeAudio } =
    useVoiceAgent();

  const [phase, setPhase] = useState<Phase>("intro");
  // Mirror of phase for callbacks inside the memoized agent config (no stale closure).
  const phaseRef = useRef<Phase>("intro");
  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const [score, setScore] = useState<ReadingScore | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [ranScore, setRanScore] = useState<RanScore | null>(null);
  const [transcript, setTranscript] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [statusLine, setStatusLine] = useState("connecting");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ranBusy, setRanBusy] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiced, setPracticed] = useState<string[]>([]);
  const [finalTranscript, setFinalTranscript] = useState("");

  const scoreRef = useRef<ReadingScore | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Connect the agent once on mount; cleanup tears the session down on unmount.
  useEffect(() => {
    void connect(agentConfig).catch(() => {
      setStatusLine("error: microphone or connection failed");
    });
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Posts the captured WAV to /api/score-reading and transitions to the result phase.
  // submittingRef makes single-submission structural: both entry paths (button and
  // countdown effect) are covered against double invocation.
  const submitReading = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      const wav = stopCapture();
      setCountdown(null);
      if (wav.size <= 44) {
        // Header-only WAV: no audio was captured; do not round-trip the API.
        setError("No audio captured - check your microphone and try again");
        setScore(null);
        goPhase("result");
        submittingRef.current = false;
        return;
      }
      goPhase("scoring");
      const form = new FormData();
      form.append("audio", new File([wav], "reading.wav", { type: "audio/wav" }));
      form.append("passageId", passageId);
      form.append("grade", String(grade));
      form.append("season", season);
      if (childName) form.append("childName", childName);
      const res = await fetch("/api/score-reading", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Scoring failed (${res.status})`);
      }
      const body = (await res.json()) as { score: ReadingScore; reportSlug: string };
      scoreRef.current = body.score;
      setScore(body.score);
      setSlug(body.reportSlug);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScore(null);
    } finally {
      goPhase("result");
      submittingRef.current = false;
    }
  }, [childName, grade, passageId, season, stopCapture]);

  // Enters the reading phase after the greeting reply finished (or via the manual
  // fallback). The 60s countdown is NOT started here - it starts on first speech.
  const startReading = useCallback(() => {
    if (phaseRef.current !== "greeting" || countdownIntervalRef.current) return;
    startCapture();
    goPhase("reading");
  }, [goPhase, startCapture]);

  // Manual fallback from the greeting phase in case reply.create fails silently.
  const skipGreeting = useCallback(() => {
    resumeAudio();
    startReading();
  }, [resumeAudio, startReading]);

  // One button press: resume audio behind a real gesture, ask the agent to greet
  // verbally, then wait for reply.done to hand over to the reading phase.
  const startSession = useCallback(() => {
    resumeAudio();
    send({
      type: "reply.create",
      instructions: `Greet the child warmly by name in one short sentence, then say: "When you are ready, read the passage aloud. I will listen quietly."`,
    });
    goPhase("greeting");
  }, [goPhase, resumeAudio, send]);

  // Finish the reading phase when the countdown hits 0 (effect keeps side effects
  // out of the state updater; submitReading sets phase synchronously so this fires once).
  useEffect(() => {
    if (phase === "reading" && countdown === 0) {
      void submitReading();
    }
  }, [phase, countdown, submitReading]);

  const startRanCapture = useCallback(() => {
    startCapture();
    goPhase("ranScoring");
  }, [startCapture]);

  const finishRan = useCallback(async () => {
    const wav = stopCapture();
    if (wav.size <= 44) {
      // Header-only WAV: no audio was captured; do not round-trip the API.
      setError("No audio captured - check your microphone and try again");
      goPhase("ran");
      return;
    }
    goPhase("ranScoring");
    setRanBusy(true);
    try {
      const form = new FormData();
      form.append("audio", new File([wav], "ran.wav", { type: "audio/wav" }));
      form.append("variant", "colors");
      const res = await fetch("/api/score-ran", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `RAN scoring failed (${res.status})`);
      }
      const body = (await res.json()) as { score: RanScore };
      setRanScore(body.score);
      if (slug) {
        const patchRes = await fetch("/api/report", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, ranScore: body.score }),
        });
        // Non-blocking: the RAN result is still shown even if attaching it to the report fails.
        setError(patchRes.ok ? null : "Could not attach naming score to report");
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRanBusy(false);
      goPhase("ranResult");
    }
  }, [slug, stopCapture]);

  const shareLink =
    slug && typeof window !== "undefined" ? `${window.location.origin}/report/${slug}` : "";

  const copyLink = useCallback(() => {
    if (!shareLink) return;
    void navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [shareLink]);

  // Guided repeated oral reading is the evidence-based fluency intervention
  // (National Reading Panel 2000; Samuels 1979; Therrien 2004). Drill only words
  // with an expected form (substitution/omission); dedup by normalized expected word.
  const drillWords = useMemo(() => {
    if (!score) return [];
    const seen = new Set<string>();
    return score.missedWords.filter((w) => {
      if (w.type !== "substitution" && w.type !== "omission") return false;
      const key = normalizeToTokens(w.expected)
        .map((t) => t.norm)
        .join(" ");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [score]);

  const markPracticed = useCallback(() => {
    const word = drillWords[practiceIndex];
    if (!word) return;
    setPracticed((prev) => [...prev, word.expected]);
    setPracticeIndex((i) => i + 1);
  }, [drillWords, practiceIndex]);

  const skipWord = useCallback(() => {
    setPracticeIndex((i) => i + 1);
  }, []);

  // One-shot agent speech via the verified reply.create message (see voice agent factsheet).
  const sayWord = useCallback(() => {
    const word = drillWords[practiceIndex];
    if (!word) return;
    send({
      type: "reply.create",
      instructions: `Say the word "${word.expected}" clearly, then ask the child to repeat it.`,
    });
  }, [drillWords, practiceIndex, send]);

  // Auto-detect: when a final user transcript contains the current drill word
  // (normalized token membership), mark it practiced and advance. Consuming the
  // transcript prevents re-triggering on the same utterance.
  useEffect(() => {
    if (phase !== "practice" || !finalTranscript) return;
    const word = drillWords[practiceIndex];
    if (!word) return;
    const targetTokens = normalizeToTokens(word.expected).map((t) => t.norm);
    const heard = new Set(normalizeToTokens(finalTranscript).map((t) => t.norm));
    if (targetTokens.length > 0 && targetTokens.every((t) => heard.has(t))) {
      setFinalTranscript("");
      markPracticed();
    }
  }, [phase, finalTranscript, drillWords, practiceIndex, markPracticed]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">ReadPulse</h1>
        <p className="text-xs text-gray-500" data-testid="status-line">
          {connected ? "connected" : statusLine}
        </p>
      </header>

      {transcript && (
        <p className="text-sm italic text-gray-500 truncate" data-testid="transcript">
          {transcript.length > 120 ? `${transcript.slice(-120)}` : transcript}
        </p>
      )}

      {phase === "intro" && (
        <section className="rounded-lg border p-6 space-y-4">
          <PassageCard passage={passage} />
          <button
            type="button"
            onClick={startSession}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Start session
          </button>
        </section>
      )}

      {phase === "greeting" && (
        <section className="rounded-lg border p-6 space-y-4">
          <PassageCard passage={passage} />
          <p className="text-sm text-gray-500" data-testid="greeting-hint">
            Listen to ReadPulse, then read the passage aloud.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
              aria-hidden="true"
            />
            Listening...
          </div>
          <div>
            <button
              type="button"
              onClick={skipGreeting}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Skip greeting and read now
            </button>
          </div>
        </section>
      )}

      {phase === "reading" && (
        <section className="rounded-lg border p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Time left: <span data-testid="countdown">{countdown ?? 60}</span>s
          </p>
          <PassageCard passage={passage} />
          <button
            type="button"
            onClick={() => void submitReading()}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            I&apos;m done reading
          </button>
        </section>
      )}

      {phase === "scoring" && (
        <section className="rounded-lg border p-6">
          <p className="text-lg font-semibold">Scoring your reading...</p>
        </section>
      )}

      {phase === "result" && score && (
        <section className="rounded-lg border p-6 space-y-4">
          <ReportView
            childName={childName || null}
            grade={grade}
            season={season}
            passageTitle={passage.title}
            score={score}
            ran={ranScore}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPracticeIndex(0);
                setPracticed([]);
                goPhase("practice");
              }}
              className="rounded border px-4 py-2 hover:bg-gray-50"
            >
              Practice words
            </button>
            <button
              type="button"
              onClick={() => goPhase("ran")}
              className="rounded border px-4 py-2 hover:bg-gray-50"
            >
              Try the naming game
            </button>
            <button
              type="button"
              onClick={() => goPhase("done")}
              className="rounded border px-4 py-2 hover:bg-gray-50"
            >
              Finish and get report link
            </button>
          </div>
        </section>
      )}

      {phase === "result" && !score && (
        <section className="rounded-lg border p-6 space-y-2">
          <p className="font-semibold text-red-600">Scoring failed</p>
          <p className="text-sm text-gray-600">{error}</p>
          <a href="/" className="text-sm text-blue-600 underline">
            Start over
          </a>
        </section>
      )}

      {phase === "practice" && (
        <section className="rounded-lg border p-6 space-y-4">
          <div>
            <button
              type="button"
              onClick={() => goPhase("result")}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              Back
            </button>
          </div>
          {drillWords.length === 0 ? (
            <p className="text-gray-600">No missed words - great reading!</p>
          ) : practiceIndex < drillWords.length ? (
            <>
              <h2 className="text-lg font-semibold">Echo practice</h2>
              <p className="text-sm text-gray-500" data-testid="practice-progress">
                Word {practiceIndex + 1} of {drillWords.length} - Practiced {practiced.length}
              </p>
              <p className="text-5xl font-bold text-center py-6" data-testid="drill-word">
                {drillWords[practiceIndex].expected}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sayWord}
                  className="rounded border px-4 py-2 hover:bg-gray-50"
                >
                  ReadPulse says the word
                </button>
                <button
                  type="button"
                  onClick={markPracticed}
                  data-testid="mark-practiced"
                  className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  Mark as practiced
                </button>
                <button
                  type="button"
                  onClick={skipWord}
                  data-testid="skip-word"
                  className="rounded border px-4 py-2 hover:bg-gray-50"
                >
                  Skip
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Say the word out loud after your coach - or a grown-up - says it. ReadPulse
                listens and marks it practiced automatically.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold" data-testid="practice-complete">
                Practice complete! Practiced {practiced.length} of {drillWords.length} words.
              </h2>
              <p className="text-gray-600">Great work - rereading words out loud makes them stick!</p>
              <button
                type="button"
                onClick={() => goPhase("result")}
                className="rounded border px-4 py-2 hover:bg-gray-50"
              >
                Back
              </button>
            </>
          )}
        </section>
      )}

      {phase === "ran" && (
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Rapid Naming Game</h2>
          <p className="text-sm text-gray-600">
            Name each color out loud, left to right, top to bottom, as fast as you can.
          </p>
          <RanGrid variant="colors" />
          <button
            type="button"
            onClick={startRanCapture}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Start naming
          </button>
        </section>
      )}

      {phase === "ranScoring" && (
        <section className="rounded-lg border p-6 space-y-4">
          <RanGrid variant="colors" />
          <p className="text-sm text-gray-500">Take your time, then press Done.</p>
          <button
            type="button"
            onClick={() => void finishRan()}
            disabled={ranBusy}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Done
          </button>
        </section>
      )}

      {phase === "ranResult" && (
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Naming game result</h2>
          {ranScore ? (
            <div className="space-y-2" data-testid="ran-result">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">
                  Items named: {ranScore.stimuliNamed} of {ranScore.stimuliTotal}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    ranScore.flag === "typical"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {ranScore.flag === "typical" ? "Typical" : "Slow"}
                </span>
              </div>
              <p className="text-sm text-gray-700">
                Speed: {ranScore.itemsPerSecond.toFixed(2)} items/sec
              </p>
              <p className="text-xs text-gray-500">
                Naming speed is an additional signal linked to reading development - not a
                diagnosis.
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-600">{error ?? "RAN scoring unavailable."}</p>
          )}
          <button
            type="button"
            onClick={() => goPhase("result")}
            className="rounded border px-4 py-2 hover:bg-gray-50"
          >
            Back
          </button>
        </section>
      )}

      {phase === "done" && (
        <section className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Your report link</h2>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={shareLink}
              className="flex-1 rounded border px-3 py-2 text-sm bg-gray-50"
              data-testid="share-link"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <a href="/" className="inline-block text-sm text-blue-600 underline">
            Start a new session
          </a>
        </section>
      )}
    </div>
  );
}
