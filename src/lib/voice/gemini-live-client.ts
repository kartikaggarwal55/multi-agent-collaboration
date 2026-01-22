/**
 * Gemini Live API client wrapper for voice conversations.
 * Handles WebSocket connection, audio streaming, and event handling.
 *
 * Audio Format:
 * - Input: 16-bit PCM, 16kHz, mono
 * - Output: 16-bit PCM, 24kHz, mono
 */

import { GoogleGenAI, Modality, Session, LiveConnectConfig, LiveServerMessage, EndSensitivity, StartSensitivity } from '@google/genai';

// Event types emitted by the client
export type GeminiLiveEvent =
  | 'connected'
  | 'disconnected'
  | 'audio'
  | 'text'
  | 'transcript'  // For real-time transcript updates
  | 'turncomplete'
  | 'interrupted'
  | 'error';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface GeminiLiveEventData {
  connected: undefined;
  disconnected: undefined;
  audio: string; // Base64 PCM audio at 24kHz
  text: string; // Text from model (may include thinking)
  transcript: TranscriptEntry; // Clean transcript entry
  turncomplete: undefined;
  interrupted: undefined;
  error: Error;
}

type GeminiLiveCallback<T extends GeminiLiveEvent> = (data: GeminiLiveEventData[T]) => void;

export interface VoiceSessionConfig {
  systemInstruction: string;
  voiceName?: string; // Optional voice preset (default: Puck)
}

// Available voices: Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr
const DEFAULT_VOICE = 'Puck';

export class GeminiLiveClient {
  private client: GoogleGenAI | null = null;
  private session: Session | null = null;
  private isConnected = false;
  private transcript: TranscriptEntry[] = [];
  private listeners: Map<GeminiLiveEvent, Set<GeminiLiveCallback<GeminiLiveEvent>>> = new Map();

  // Buffers for aggregating transcription chunks
  private inputTranscriptBuffer = '';
  private outputTranscriptBuffer = '';

  // Model for native audio
  private readonly MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });

    // Initialize listener maps
    const events: GeminiLiveEvent[] = ['connected', 'disconnected', 'audio', 'text', 'transcript', 'turncomplete', 'interrupted', 'error'];
    events.forEach(event => {
      this.listeners.set(event, new Set());
    });
  }

  /**
   * Add event listener
   */
  on<T extends GeminiLiveEvent>(event: T, callback: GeminiLiveCallback<T>): void {
    this.listeners.get(event)?.add(callback as GeminiLiveCallback<GeminiLiveEvent>);
  }

  /**
   * Remove event listener
   */
  off<T extends GeminiLiveEvent>(event: T, callback: GeminiLiveCallback<T>): void {
    this.listeners.get(event)?.delete(callback as GeminiLiveCallback<GeminiLiveEvent>);
  }

  /**
   * Emit event to all listeners
   */
  private emit<T extends GeminiLiveEvent>(event: T, data?: GeminiLiveEventData[T]): void {
    this.listeners.get(event)?.forEach(callback => callback(data as GeminiLiveEventData[GeminiLiveEvent]));
  }

  /**
   * Handle incoming messages from Gemini
   */
  private handleMessage(message: LiveServerMessage): void {
    // Extended message type for transcription fields
    const msg = message as LiveServerMessage & {
      serverContent?: {
        interrupted?: boolean;
        modelTurn?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data: string } }> };
        turnComplete?: boolean;
        inputTranscription?: { text: string };
        outputTranscription?: { text: string };
      };
    };

    // Buffer transcription chunks (they arrive incrementally)
    if (msg.serverContent?.inputTranscription?.text) {
      this.inputTranscriptBuffer += msg.serverContent.inputTranscription.text;
    }

    if (msg.serverContent?.outputTranscription?.text) {
      this.outputTranscriptBuffer += msg.serverContent.outputTranscription.text;
    }

    // Handle server content (model responses)
    if (message.serverContent) {
      const content = message.serverContent;

      // Check for interruption - flush buffers
      if (content.interrupted) {
        console.log('GeminiLiveClient: Interrupted');
        this.flushTranscriptBuffers();
        this.emit('interrupted');
      }

      // Process model turn parts for audio
      if (content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          // Handle audio response
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            this.emit('audio', part.inlineData.data);
          }

          // Emit text events for any text content (includes thinking)
          if (part.text) {
            this.emit('text', part.text);
          }
        }
      }

      // Handle turn complete - flush transcription buffers and emit complete entries
      if (content.turnComplete) {
        this.flushTranscriptBuffers();
        this.emit('turncomplete');
      }
    }

    // Handle tool calls (if we add tools later)
    if (message.toolCall) {
      console.log('GeminiLiveClient: Tool call received', message.toolCall);
    }
  }

  /**
   * Flush transcription buffers and emit complete transcript entries
   */
  private flushTranscriptBuffers(): void {
    // Flush user input buffer
    if (this.inputTranscriptBuffer.trim()) {
      const text = this.inputTranscriptBuffer.trim();
      const entry: TranscriptEntry = { role: 'user', text, timestamp: Date.now() };
      this.transcript.push(entry);
      this.emit('transcript', entry);
      console.log('GeminiLiveClient: User said:', text);
    }
    this.inputTranscriptBuffer = '';

    // Flush assistant output buffer
    if (this.outputTranscriptBuffer.trim()) {
      const text = this.outputTranscriptBuffer.trim();
      const entry: TranscriptEntry = { role: 'assistant', text, timestamp: Date.now() };
      this.transcript.push(entry);
      this.emit('transcript', entry);
      console.log('GeminiLiveClient: Assistant said:', text);
    }
    this.outputTranscriptBuffer = '';
  }

  /**
   * Connect to Gemini Live API
   */
  async connect(config: VoiceSessionConfig): Promise<void> {
    if (!this.client) {
      throw new Error('GeminiLiveClient: Client not initialized');
    }

    if (this.isConnected) {
      console.warn('GeminiLiveClient: Already connected');
      return;
    }

    console.log('GeminiLiveClient: Connecting to', this.MODEL);

    try {
      // Build connection config with transcription enabled
      const liveConfig: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: config.systemInstruction,
        // Enable transcription for both input and output
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Voice configuration
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: config.voiceName || DEFAULT_VOICE
            }
          }
        },
        // Turn detection config for faster, more natural response
        // Based on Google's examples: https://ai.google.dev/gemini-api/docs/live-guide
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            // Capture speech onset that might be truncated (default ~20ms)
            prefixPaddingMs: 20,
            // Short silence threshold for snappy responses (100-300ms typical)
            silenceDurationMs: 100,
          }
        }
      };

      console.log('GeminiLiveClient: Config - voice:', config.voiceName || DEFAULT_VOICE);

      // Connect to Live API with callbacks
      this.session = await this.client.live.connect({
        model: this.MODEL,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            console.log('GeminiLiveClient: WebSocket connected');
            this.isConnected = true;
            this.transcript = [];
            this.inputTranscriptBuffer = '';
            this.outputTranscriptBuffer = '';
            this.emit('connected');
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            console.error('GeminiLiveClient: WebSocket error', e);
            this.emit('error', new Error(e.message || 'WebSocket error'));
          },
          onclose: (e: CloseEvent) => {
            console.log('GeminiLiveClient: WebSocket closed', {
              code: e.code,
              reason: e.reason,
              wasClean: e.wasClean
            });
            this.isConnected = false;
            this.emit('disconnected');
          }
        }
      });

      console.log('GeminiLiveClient: Session created');

    } catch (error) {
      console.error('GeminiLiveClient: Connection failed', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Send audio chunk to Gemini
   * Audio should be 16-bit PCM at 16kHz
   */
  sendAudio(chunk: { mimeType: string; data: string }): void {
    if (!this.session || !this.isConnected) {
      return; // Silently ignore when not connected
    }

    try {
      this.session.sendRealtimeInput({
        audio: {
          mimeType: chunk.mimeType,
          data: chunk.data
        }
      });
    } catch (error) {
      console.error('GeminiLiveClient: Failed to send audio', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send text message to Gemini (useful for starting conversation)
   * Note: Text sent via sendClientContent won't come back in inputTranscription,
   * so we need to add it to transcript manually.
   */
  async sendText(text: string): Promise<void> {
    if (!this.session || !this.isConnected) {
      console.warn('GeminiLiveClient: Cannot send text - not connected');
      return;
    }

    console.log('GeminiLiveClient: Sending text:', text);

    try {
      // Add to transcript manually (sendClientContent doesn't trigger inputTranscription)
      const entry: TranscriptEntry = { role: 'user', text, timestamp: Date.now() };
      this.transcript.push(entry);
      this.emit('transcript', entry);

      // Send as client content with turnComplete to trigger response
      await this.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true
      });
    } catch (error) {
      console.error('GeminiLiveClient: Failed to send text', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Disconnect from Gemini Live API
   */
  async disconnect(): Promise<TranscriptEntry[]> {
    if (!this.isConnected || !this.session) {
      return this.transcript;
    }

    // Flush any remaining transcription buffers
    this.flushTranscriptBuffers();

    try {
      await this.session.close();
    } catch (error) {
      console.error('GeminiLiveClient: Error closing session', error);
    }

    this.session = null;
    this.isConnected = false;
    this.emit('disconnected');

    return this.transcript;
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current transcript
   */
  getTranscript(): TranscriptEntry[] {
    return [...this.transcript];
  }

  /**
   * Get transcript as formatted strings
   */
  getTranscriptStrings(): string[] {
    return this.transcript.map(entry =>
      `[${entry.role === 'user' ? 'User' : 'Assistant'}]: ${entry.text}`
    );
  }

  /**
   * Clear transcript
   */
  clearTranscript(): void {
    this.transcript = [];
  }
}

/**
 * Create a new Gemini Live client instance
 */
export function createGeminiLiveClient(apiKey: string): GeminiLiveClient {
  return new GeminiLiveClient(apiKey);
}
