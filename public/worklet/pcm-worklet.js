// Forwards mono Float32 frames from the audio graph to the main thread.
class PcmWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-worklet", PcmWorklet);
