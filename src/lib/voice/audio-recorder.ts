/**
 * Audio Recorder for capturing microphone input as PCM 16-bit audio.
 * Uses AudioWorklet for efficient audio processing.
 */

type AudioRecorderEvent = 'data' | 'volume' | 'error' | 'start' | 'stop';
type AudioRecorderCallback = (data: unknown) => void;

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private recorderWorklet: AudioWorkletNode | null = null;
  private vuMeterWorklet: AudioWorkletNode | null = null;
  private isRecording = false;
  private listeners: Map<AudioRecorderEvent, Set<AudioRecorderCallback>> = new Map();

  constructor() {
    // Initialize listener maps
    (['data', 'volume', 'error', 'start', 'stop'] as AudioRecorderEvent[]).forEach(event => {
      this.listeners.set(event, new Set());
    });
  }

  /**
   * Add event listener
   */
  on(event: AudioRecorderEvent, callback: AudioRecorderCallback): void {
    this.listeners.get(event)?.add(callback);
  }

  /**
   * Remove event listener
   */
  off(event: AudioRecorderEvent, callback: AudioRecorderCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: AudioRecorderEvent, data?: unknown): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Start recording from microphone
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      console.warn('AudioRecorder: Already recording');
      return;
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Create AudioContext with 16kHz sample rate
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      // Load AudioWorklet modules
      await this.audioContext.audioWorklet.addModule('/worklets/audio-recorder-worklet.js');
      await this.audioContext.audioWorklet.addModule('/worklets/vu-meter-worklet.js');

      // Create source node from microphone
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create recorder worklet
      this.recorderWorklet = new AudioWorkletNode(this.audioContext, 'audio-recorder-worklet');
      this.recorderWorklet.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          // Convert to base64 and emit
          const base64 = this.arrayBufferToBase64(event.data.data);
          this.emit('data', {
            mimeType: 'audio/pcm;rate=16000',
            data: base64
          });
        }
      };

      // Create VU meter worklet
      this.vuMeterWorklet = new AudioWorkletNode(this.audioContext, 'vu-meter-worklet');
      this.vuMeterWorklet.port.onmessage = (event) => {
        if (event.data.type === 'volume') {
          this.emit('volume', event.data.value);
        }
      };

      // Connect the audio graph
      // microphone -> recorder -> destination (muted)
      // microphone -> vu meter
      this.sourceNode.connect(this.recorderWorklet);
      this.sourceNode.connect(this.vuMeterWorklet);

      this.isRecording = true;
      this.emit('start');

    } catch (error) {
      console.error('AudioRecorder: Failed to start', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop recording and cleanup
   */
  stop(): void {
    if (!this.isRecording) {
      return;
    }

    // Stop worklets
    if (this.recorderWorklet) {
      this.recorderWorklet.port.postMessage({ type: 'stop' });
      this.recorderWorklet.disconnect();
      this.recorderWorklet = null;
    }

    if (this.vuMeterWorklet) {
      this.vuMeterWorklet.port.postMessage({ type: 'stop' });
      this.vuMeterWorklet.disconnect();
      this.vuMeterWorklet = null;
    }

    // Disconnect source
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isRecording = false;
    this.emit('stop');
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current audio context state
   */
  getState(): AudioContextState | null {
    return this.audioContext?.state ?? null;
  }
}

// Singleton instance for convenience
let recorderInstance: AudioRecorder | null = null;

export function getAudioRecorder(): AudioRecorder {
  if (!recorderInstance) {
    recorderInstance = new AudioRecorder();
  }
  return recorderInstance;
}
