/**
 * React hook for managing voice sessions with Gemini Live API.
 * Coordinates audio recording, playback, and transcript management.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioRecorder } from '@/lib/voice/audio-recorder';
import { AudioStreamer } from '@/lib/voice/audio-streamer';
import { GeminiLiveClient, TranscriptEntry } from '@/lib/voice/gemini-live-client';
import type { DailyBriefing } from '@/lib/voice/mock-briefing';

export type VoiceSessionState = 'idle' | 'connecting' | 'active' | 'error';
export type SpeakingState = 'listening' | 'speaking' | 'idle';

interface VoiceSessionConfig {
  apiKey: string;
  systemInstruction: string;
  userName: string;
  briefing: DailyBriefing;
}

interface UseVoiceSessionReturn {
  // State
  sessionState: VoiceSessionState;
  speakingState: SpeakingState;
  volume: number;
  transcript: TranscriptEntry[];
  error: string | null;

  // Actions
  startSession: () => Promise<void>;
  endSession: () => Promise<string[]>;
  sendTextMessage: (text: string) => Promise<void>;

  // Computed
  isActive: boolean;
  isConnecting: boolean;
}

export function useVoiceSession(): UseVoiceSessionReturn {
  // State
  const [sessionState, setSessionState] = useState<VoiceSessionState>('idle');
  const [speakingState, setSpeakingState] = useState<SpeakingState>('idle');
  const [volume, setVolume] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio components (persist across renders)
  const recorderRef = useRef<AudioRecorder | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const configRef = useRef<VoiceSessionConfig | null>(null);

  /**
   * Fetch session config from API
   */
  const fetchSessionConfig = async (): Promise<VoiceSessionConfig> => {
    const response = await fetch('/api/me/voice/token');
    if (!response.ok) {
      throw new Error('Failed to get voice session config');
    }
    return response.json();
  };

  /**
   * Start a new voice session
   */
  const startSession = useCallback(async () => {
    if (sessionState !== 'idle') {
      console.warn('VoiceSession: Session already active');
      return;
    }

    console.log('VoiceSession: Starting session...');
    setSessionState('connecting');
    setError(null);
    setTranscript([]);

    try {
      // Get session config
      console.log('VoiceSession: Fetching config...');
      const config = await fetchSessionConfig();
      console.log('VoiceSession: Config received');
      configRef.current = config;

      // Initialize audio components
      console.log('VoiceSession: Initializing audio components...');
      recorderRef.current = new AudioRecorder();
      streamerRef.current = new AudioStreamer();
      clientRef.current = new GeminiLiveClient(config.apiKey);

      // Initialize audio streamer
      await streamerRef.current.initialize();
      console.log('VoiceSession: Audio streamer initialized');

      // Set up recorder events
      recorderRef.current.on('data', (chunk) => {
        if (clientRef.current?.getIsConnected()) {
          clientRef.current.sendAudio(chunk as { mimeType: string; data: string });
        }
      });

      recorderRef.current.on('volume', (vol) => {
        setVolume(vol as number);
      });

      recorderRef.current.on('error', (err) => {
        console.error('VoiceSession: Recorder error', err);
        setError('Microphone error');
      });

      // Set up client events
      clientRef.current.on('connected', () => {
        setSessionState('active');
        setSpeakingState('listening');
        // Send greeting trigger to start conversation
        setTimeout(() => {
          if (clientRef.current?.getIsConnected()) {
            console.log('VoiceSession: Sending greeting trigger');
            clientRef.current?.sendText("Hello");
          }
        }, 500);
      });

      clientRef.current.on('disconnected', () => {
        setSessionState('idle');
        setSpeakingState('idle');
      });

      clientRef.current.on('audio', (audioData) => {
        streamerRef.current?.addPCM16(audioData);
        setSpeakingState('speaking');
      });

      // Listen for transcript events (cleaner than text events)
      clientRef.current.on('transcript', (entry) => {
        setTranscript(prev => [...prev, entry]);
      });

      clientRef.current.on('turncomplete', () => {
        setSpeakingState('listening');
      });

      clientRef.current.on('interrupted', () => {
        streamerRef.current?.stop();
        setSpeakingState('listening');
      });

      clientRef.current.on('error', (err) => {
        console.error('VoiceSession: Client error', err);
        setError(err.message);
        setSessionState('error');
      });

      // Set up streamer events
      streamerRef.current.on('ended', () => {
        setSpeakingState('listening');
      });

      // Connect to Gemini
      console.log('VoiceSession: Connecting to Gemini...');
      await clientRef.current.connect({
        systemInstruction: config.systemInstruction
      });

      // Start recording
      console.log('VoiceSession: Starting recorder...');
      await recorderRef.current.start();
      console.log('VoiceSession: Recorder started');

    } catch (err) {
      console.error('VoiceSession: Failed to start', err);
      setError(err instanceof Error ? err.message : 'Failed to start voice session');
      setSessionState('error');

      // Cleanup on error
      recorderRef.current?.stop();
      streamerRef.current?.destroy();
      await clientRef.current?.disconnect();
    }
  }, [sessionState]);

  /**
   * End the current voice session
   */
  const endSession = useCallback(async (): Promise<string[]> => {
    // Stop recording
    recorderRef.current?.stop();
    recorderRef.current = null;

    // Stop playback
    streamerRef.current?.stop();
    streamerRef.current?.destroy();
    streamerRef.current = null;

    // Disconnect from Gemini and get transcript
    const finalTranscript = await clientRef.current?.disconnect() || [];
    clientRef.current = null;

    setSessionState('idle');
    setSpeakingState('idle');
    setVolume(0);

    // Return formatted transcript strings for backward compatibility
    return finalTranscript.map(entry =>
      `[${entry.role === 'user' ? 'User' : 'Assistant'}]: ${entry.text}`
    );
  }, []);

  /**
   * Send a text message during active session
   */
  const sendTextMessage = useCallback(async (text: string) => {
    if (!clientRef.current?.getIsConnected()) {
      console.warn('VoiceSession: Cannot send text - not connected');
      return;
    }

    await clientRef.current.sendText(text);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamerRef.current?.destroy();
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    // State
    sessionState,
    speakingState,
    volume,
    transcript,
    error,

    // Actions
    startSession,
    endSession,
    sendTextMessage,

    // Computed
    isActive: sessionState === 'active',
    isConnecting: sessionState === 'connecting',
  };
}
