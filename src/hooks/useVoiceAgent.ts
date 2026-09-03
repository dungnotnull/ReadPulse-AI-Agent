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
  const playingRef = useRef(false);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
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

  // Sequential playback: queue PCM chunks into AudioContext buffers, never sleep-schedule.
  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    while (playbackQueue.current.length > 0 && ctxRef.current) {
      const f32 = playbackQueue.current.shift()!;
      const buf = ctxRef.current.createBuffer(1, f32.length, 24000);
      buf.copyToChannel(new Float32Array(f32), 0);
      const src = ctxRef.current.createBufferSource();
      src.buffer = buf;
      src.connect(ctxRef.current.destination);
      src.start();
      await new Promise((r) => {
        src.onended = r;
      });
    }
    playingRef.current = false;
  }, []);

  const handleToolCall = useCallback(async (msg: { call_id: string; name: string; arguments?: string }) => {
    const args = msg.arguments ? (JSON.parse(msg.arguments) as Record<string, unknown>) : {};
    const result = await cfgRef.current?.onToolCall?.(msg.name, args);
    pendingToolResults.current.set(msg.call_id, JSON.stringify(result ?? { ok: true }));
  }, []);

  const connect = useCallback(
    async (cfg: VoiceAgentConfig) => {
      cfgRef.current = cfg;
      const tokenRes = await fetch("/api/session-token", { method: "POST" });
      const { token } = (await tokenRes.json()) as { token: string };
      const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
      wsRef.current = ws;

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
            void playQueue();
            break;
          }
          case "reply.done":
            cfg.onStatus?.("reply.done");
            if (msg.status === "interrupted") {
              playbackQueue.current = []; // flush stale agent speech on barge-in
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

      // Mic pipeline (audio itself is gated on readyRef in the worklet handler)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 24000 });
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/worklet/pcm-worklet.js");
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-worklet");
      nodeRef.current = node;
      node.port.onmessage = (e) => {
        if (!readyRef.current) return; // per factsheet: audio only after session.ready
        const f32 = e.data as Float32Array;
        const i16 = new Int16Array(f32.length);
        for (let k = 0; k < f32.length; k++) {
          const s = Math.max(-1, Math.min(1, f32[k]));
          i16[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        if (capturingRef.current) captureRef.current.push(i16);
        send({ type: "input.audio", audio: i16ToBase64(i16) });
      };
      src.connect(node);
      // note: worklet node NOT connected to destination (no passthrough playback)
    },
    [flushToolResults, handleToolCall, playQueue, send],
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

  const disconnect = useCallback(() => {
    readyRef.current = false;
    try {
      wsRef.current?.close();
    } catch {
      // already closed
    }
    nodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => undefined);
    setConnected(false);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return { connected, connect, disconnect, send, startCapture, stopCapture };
}
