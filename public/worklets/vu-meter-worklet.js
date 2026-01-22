/**
 * AudioWorklet processor for measuring audio volume levels.
 * Calculates RMS (Root Mean Square) for volume visualization.
 */
class VUMeterWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._updateInterval = 100; // ms between updates
    this._lastUpdate = currentTime;
    this._volume = 0;
    this._isActive = true;

    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this._isActive = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this._isActive) {
      return false;
    }

    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channelData = input[0];

    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);

    // Smooth the volume value
    this._volume = this._volume * 0.8 + rms * 0.2;

    // Send volume updates at interval
    const now = currentTime;
    if (now - this._lastUpdate >= this._updateInterval / 1000) {
      this.port.postMessage({
        type: 'volume',
        value: this._volume
      });
      this._lastUpdate = now;
    }

    return true;
  }
}

registerProcessor('vu-meter-worklet', VUMeterWorklet);
