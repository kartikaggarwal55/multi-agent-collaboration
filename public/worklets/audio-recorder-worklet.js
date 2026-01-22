/**
 * AudioWorklet processor for recording microphone input as PCM 16-bit audio.
 * Converts Float32 samples to Int16 and sends as ArrayBuffer.
 */
class AudioRecorderWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 2048; // Samples per chunk
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferIndex = 0;
    this._isRecording = true;

    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this._isRecording = false;
      }
    };
  }

  /**
   * Convert Float32 audio samples to Int16 PCM
   */
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range and convert to 16-bit
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  process(inputs, outputs, parameters) {
    if (!this._isRecording) {
      return false; // Stop processing
    }

    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0]; // Mono channel

    // Buffer incoming audio
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._bufferIndex++] = channelData[i];

      // When buffer is full, send it
      if (this._bufferIndex >= this._bufferSize) {
        const pcm16 = this.floatTo16BitPCM(this._buffer);
        this.port.postMessage({
          type: 'audio',
          data: pcm16.buffer
        }, [pcm16.buffer]);

        // Reset buffer
        this._buffer = new Float32Array(this._bufferSize);
        this._bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-recorder-worklet', AudioRecorderWorklet);
