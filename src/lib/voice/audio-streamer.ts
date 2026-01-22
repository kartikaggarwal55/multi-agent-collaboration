/**
 * Audio Streamer for playing back PCM 16-bit audio from Gemini Live API.
 * Handles buffering and smooth playback scheduling.
 */

type AudioStreamerEvent = 'start' | 'stop' | 'ended';
type AudioStreamerCallback = () => void;

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private queue: Float32Array[] = [];
  private isPlaying = false;
  private nextScheduleTime = 0;
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<AudioStreamerEvent, Set<AudioStreamerCallback>> = new Map();

  // Constants
  private readonly SAMPLE_RATE = 24000; // Gemini outputs 24kHz
  private readonly BUFFER_SIZE = 4800; // 200ms of audio at 24kHz
  private readonly SCHEDULE_AHEAD = 0.2; // Schedule 200ms ahead

  constructor() {
    // Initialize listener maps
    (['start', 'stop', 'ended'] as AudioStreamerEvent[]).forEach(event => {
      this.listeners.set(event, new Set());
    });
  }

  /**
   * Add event listener
   */
  on(event: AudioStreamerEvent, callback: AudioStreamerCallback): void {
    this.listeners.get(event)?.add(callback);
  }

  /**
   * Remove event listener
   */
  off(event: AudioStreamerEvent, callback: AudioStreamerCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: AudioStreamerEvent): void {
    this.listeners.get(event)?.forEach(callback => callback());
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (this.audioContext) {
      return;
    }

    this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  /**
   * Convert base64 PCM16 to Float32Array
   */
  private base64ToFloat32(base64: string): Float32Array {
    // Decode base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert to Int16Array (PCM16)
    const int16 = new Int16Array(bytes.buffer);

    // Convert to Float32Array normalized to [-1, 1]
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    return float32;
  }

  /**
   * Add PCM16 audio chunk to playback queue
   */
  addPCM16(base64: string): void {
    if (!this.audioContext) {
      console.warn('AudioStreamer: Not initialized');
      return;
    }

    const float32 = this.base64ToFloat32(base64);

    // Add directly to queue
    this.queue.push(float32);

    // Start playback if not already playing
    if (!this.isPlaying) {
      this.startPlayback();
    }
  }

  /**
   * Start playback scheduler
   */
  private startPlayback(): void {
    if (!this.audioContext || !this.gainNode) {
      return;
    }

    this.isPlaying = true;
    this.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    this.nextScheduleTime = this.audioContext.currentTime;

    // Schedule initial buffers
    this.scheduleBuffers();

    // Start scheduler interval
    this.schedulerInterval = setInterval(() => {
      this.scheduleBuffers();
    }, 50); // Check every 50ms

    this.emit('start');
  }

  /**
   * Schedule audio buffers for playback
   */
  private scheduleBuffers(): void {
    if (!this.audioContext || !this.gainNode) {
      return;
    }

    const currentTime = this.audioContext.currentTime;

    // Don't schedule if we're too far ahead
    while (this.queue.length > 0 && this.nextScheduleTime < currentTime + this.SCHEDULE_AHEAD) {
      const chunk = this.queue.shift()!;

      // Create buffer source
      const buffer = this.audioContext.createBuffer(1, chunk.length, this.SAMPLE_RATE);
      buffer.getChannelData(0).set(chunk);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);

      // Schedule playback
      const scheduleTime = Math.max(this.nextScheduleTime, currentTime);
      source.start(scheduleTime);

      // Update next schedule time
      this.nextScheduleTime = scheduleTime + (chunk.length / this.SAMPLE_RATE);

      // Handle end of playback
      source.onended = () => {
        if (this.queue.length === 0 && this.isPlaying) {
          // Check if more audio might be coming
          setTimeout(() => {
            if (this.queue.length === 0 && this.isPlaying) {
              this.emit('ended');
            }
          }, 100);
        }
      };
    }

    // Stop if queue is empty and we've played everything
    if (this.queue.length === 0 && this.nextScheduleTime <= currentTime) {
      this.stopPlayback();
    }
  }

  /**
   * Stop playback scheduler
   */
  private stopPlayback(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    this.isPlaying = false;
    this.emit('stop');
  }

  /**
   * Stop playback and clear queue
   */
  stop(): void {
    // Fade out over 100ms
    if (this.audioContext && this.gainNode && this.isPlaying) {
      const currentTime = this.audioContext.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.1);
    }

    // Clear queue
    this.queue = [];

    // Stop scheduler
    this.stopPlayback();
  }

  /**
   * Resume playback after interruption
   */
  resume(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    }

    if (this.queue.length > 0 && !this.isPlaying) {
      this.startPlayback();
    }
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Singleton instance for convenience
let streamerInstance: AudioStreamer | null = null;

export function getAudioStreamer(): AudioStreamer {
  if (!streamerInstance) {
    streamerInstance = new AudioStreamer();
  }
  return streamerInstance;
}
