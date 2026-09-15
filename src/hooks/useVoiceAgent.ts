"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface VoiceAgentConfig {
  instructions: string; // becomes session.system_prompt (flat schema)
  greeting?: string; // optional spoken greeting right after session.ready
  voice?: string; // exact voice name, e.g. "anna" (default)
  tools?: ToolSpec[];
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onStatus?: (s: string) => void;
}

// WAV (PCM16 mono 24k) encoder for the captured buffer
export function encodeWav(chunks: Int16Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new ArrayBuffer(44 + total * 2);
  const v = new DataView(out);
  const w = (off: number, s: string) => {
    for (let k = 0; k < s.length; k++) v.setUint8(off + k, s.charCodeAt(k));
  };
  w(0, "RIFF"); v.setUint32(4, 36 + total * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, total * 2, true);
  let off = 44;
  for (const c of chunks) {
    for (let k = 0; k < c.length; k++) {
      v.setInt16(off, c[k], true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

// Base64 for potentially large Int16Array without call-stack overflow
function i16ToBase64(i16: Int16Array): string {
  const bytes = new Uint8Array(i16.buffer);
  let bin = "";
  const CHUNK = 0x8000;
  for (let k = 0; k < bytes.length; k += CHUNK) {
    bin += String.fromCharCode(...(bytes.subarray(k, k + CHUNK) as unknown as number[]));
  }
  return btoa(bin);
}

export function useVoiceAgent() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<Int16Array[]>([]);
  const capturingRef = useRef(false);
  const cfgRef = useRef<VoiceAgentConfig | null>(null);
  const readyRef = useRef(false);
  const pendingToolResults = useRef(new Map<string, string>());
  const playbackQueue = useRef<Float32Array[]>([]);
  // Running playback cursor (AudioContext time) for gapless chunk scheduling,
  // plus the set of already-scheduled sources so barge-in can stop them.
  const nextTimeRef = useRef(0);
  const activeSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const resumeOnceRef = useRef<(() => void) | null>(null);
  const connectEpochRef = useRef(0);
  const sendBufferRef = useRef<Int16Array[]>([]);
  const sendBufferSamplesRef = useRef(0);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Chrome autoplay policy keeps a context created without a user gesture suspended;
  // resuming from a real click unblocks all queued reply.audio playback.
  const resumeAudio = useCallback(() => {
    ctxRef.current?.resume().catch(() => undefined);
  }, []);

  // Tool results are buffered on tool.call and only flushed after reply.done;
  // discarded entirely on interrupted (barge-in) per protocol.
  const flushToolResults = useCallback(
    (discard: boolean) => {
      if (discard) {
        pendingToolResults.current.clear();
        return;
      }
      pendingToolResults.current.forEach((result, callId) => {
        send({ type: "tool.result", call_id: callId, result });
      });
      pendingToolResults.current.clear();
    },
    [send],
  );

  // Gapless playback: schedule every chunk back-to-back on a running time cursor.
  // Awaiting each buffer's onended instead inserts an event-loop gap at every
  // chunk boundary - periodic clicks that smear the agent's speech.
  const playQueue = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return; // suspended: keep queue, a later reply.audio retries
    let nextTime = nextTimeRef.current;
    while (playbackQueue.current.length > 0) {
      const f32 = playbackQueue.current.shift()!;
      const buf = ctx.createBuffer(1, f32.length, ctx.sampleRate);
      buf.copyToChannel(new Float32Array(f32), 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime + 0.03, nextTime);
      src.start(startAt);
      activeSourcesRef.current.add(src);
      src.onended = () => {
        activeSourcesRef.current.delete(src);
      };
      nextTime = startAt + buf.duration;
    }
    nextTimeRef.current = nextTime;
  }, []);

  const disconnect = useCallback(() => {
    connectEpochRef.current++; // invalidate any in-flight connect()
    readyRef.current = false;
    sendBufferRef.current = [];
    sendBufferSamplesRef.current = 0;
    try {
      wsRef.current?.close();
    } catch {
      // already closed
    }
    nodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (resumeOnceRef.current) {
      document.removeEventListener("pointerdown", resumeOnceRef.current);
      resumeOnceRef.current = null;
    }
    void ctxRef.current?.close().catch(() => undefined);
    setConnected(false);
  }, []);

  const handleToolCall = useCallback(async (msg: { call_id: string; name: string; arguments?: string }) => {
    let args: Record<string, unknown> = {};
    if (msg.arguments) {
      try {
        args = JSON.parse(msg.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    const result = await cfgRef.current?.onToolCall?.(msg.name, args);
    pendingToolResults.current.set(msg.call_id, JSON.stringify(result ?? { ok: true }));
  }, []);

  const connect = useCallback(
    async (cfg: VoiceAgentConfig) => {
      // Tear down any prior session before opening a new one (double-connect leak).
      disconnect();
      const epoch = ++connectEpochRef.current;
      cfgRef.current = cfg;
      const tokenRes = await fetch("/api/session-token", { method: "POST" });
      if (epoch !== connectEpochRef.current) return;
      const { token } = (await tokenRes.json()) as { token: string };
      const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
      wsRef.current = ws;

      ws.onclose = () => {
        if (epoch !== connectEpochRef.current) return; // expected close from our disconnect
        readyRef.current = false;
        setConnected(false);
        cfg.onStatus?.("closed");
      };
      ws.onerror = () => {
        cfg.onStatus?.("error: websocket");
      };

      ws.onopen = () => {
        // Flat session schema per factsheet; sent immediately on open.
        send({
          type: "session.update",
          session: {
            system_prompt: cfg.instructions,
            ...(cfg.greeting ? { greeting: cfg.greeting } : {}),
            input: { format: { encoding: "audio/pcm" } },
            output: { voice: cfg.voice ?? "anna", format: { encoding: "audio/pcm" } },
            tools: (cfg.tools ?? []).map((t) => ({
              type: "function",
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        });
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown> & { type: string };
        switch (msg.type) {
          case "session.ready":
            readyRef.current = true;
            setConnected(true);
            cfg.onStatus?.("ready");
            break;
          case "session.error":
          case "error":
            cfg.onStatus?.(`error: ${String(msg.message ?? msg.code)}`);
            break;
          case "transcript.user.delta":
            cfg.onUserTranscript?.(String(msg.text), false);
            break;
          case "transcript.user":
            cfg.onUserTranscript?.(String(msg.text), true);
            break;
          case "input.speech.started":
            cfg.onSpeechStarted?.();
            break;
          case "input.speech.stopped":
            cfg.onSpeechStopped?.();
            break;
          case "reply.started":
            cfg.onStatus?.("reply.started");
            break;
          case "reply.audio": {
            const bytes = Uint8Array.from(atob(String(msg.data)), (c) => c.charCodeAt(0));
            const i16 = new Int16Array(bytes.buffer);
            const f32 = new Float32Array(i16.length);
            for (let k = 0; k < i16.length; k++) f32[k] = i16[k] / 32768;
            playbackQueue.current.push(f32);
            playQueue();
            break;
          }
          case "reply.done":
            cfg.onStatus?.("reply.done");
            if (msg.status === "interrupted") {
              // Barge-in: drop queued chunks AND stop already-scheduled buffers,
              // then reset the cursor so the next reply starts immediately.
              playbackQueue.current = [];
              activeSourcesRef.current.forEach((s) => {
                try {
                  s.stop();
                } catch {
                  // already ended
                }
              });
              activeSourcesRef.current.clear();
              nextTimeRef.current = 0;
            }
            flushToolResults(msg.status === "interrupted");
            break;
          case "tool.call":
            void handleToolCall(msg as unknown as { call_id: string; name: string; arguments?: string });
            break;
          default:
            break;
        }
      };

      // Mic pipeline (only the WS send is gated on readyRef; local capture is not)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (epoch !== connectEpochRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 24000 });
      await ctx.audioWorklet.addModule("/worklet/pcm-worklet.js");
      if (epoch !== connectEpochRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
        return;
      }
      ctxRef.current = ctx;
      // Autoplay policy: try to resume immediately, and fall back to the first
      // user gesture in case this connect() ran without one (initial mount).
      void ctx.resume().catch(() => undefined);
      const resumeOnce = () => {
        ctxRef.current?.resume().catch(() => undefined);
      };
      resumeOnceRef.current = resumeOnce;
      document.addEventListener("pointerdown", resumeOnce, { once: true });
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-worklet");
      nodeRef.current = node;
      if (epoch !== connectEpochRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => undefined);
        return;
      }
      node.port.onmessage = (e) => {
        const f32 = e.data as Float32Array;
        const i16 = new Int16Array(f32.length);
        for (let k = 0; k < f32.length; k++) {
          const s = Math.max(-1, Math.min(1, f32[k]));
          i16[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Local capture must receive every raw chunk regardless of WS state,
        // so scoring survives a mid-reading connection drop.
        if (capturingRef.current) captureRef.current.push(i16);
        // Only the outbound send is gated on session.ready (per factsheet).
        if (!readyRef.current) return;
        // Batch outgoing audio to ~100ms (2400 samples at 24kHz) to reduce message overhead.
        sendBufferRef.current.push(i16);
        sendBufferSamplesRef.current += i16.length;
        if (sendBufferSamplesRef.current >= 2400) {
          const merged = new Int16Array(sendBufferSamplesRef.current);
          let off = 0;
          for (const chunk of sendBufferRef.current) {
            merged.set(chunk, off);
            off += chunk.length;
          }
          sendBufferRef.current = [];
          sendBufferSamplesRef.current = 0;
          send({ type: "input.audio", audio: i16ToBase64(merged) });
        }
      };
      src.connect(node);
      // note: worklet node NOT connected to destination (no passthrough playback)
    },
    [disconnect, flushToolResults, handleToolCall, playQueue, send],
  );

  const startCapture = useCallback(() => {
    captureRef.current = [];
    capturingRef.current = true;
  }, []);

  const stopCapture = useCallback((): Blob => {
    capturingRef.current = false;
    const wav = encodeWav(captureRef.current, 24000);
    captureRef.current = [];
    return wav;
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return { connected, connect, disconnect, send, startCapture, stopCapture, resumeAudio };
}
