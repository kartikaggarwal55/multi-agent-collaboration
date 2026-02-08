/**
 * React hook for managing voice sessions with OpenAI Realtime API via WebRTC.
 * Audio flows bidirectionally through WebRTC media tracks - no manual
 * AudioRecorder, AudioStreamer, or AudioWorklets needed.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export type VoiceSessionState = 'idle' | 'connecting' | 'active' | 'error';
export type SpeakingState = 'listening' | 'speaking' | 'idle';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
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

  // Refs for WebRTC components
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for transcript accumulation (avoid stale closures)
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const assistantTextRef = useRef<string>('');
  const sessionReadyRef = useRef<boolean>(false);

  // Guard against double session creation (ref is synchronous, unlike state)
  const startingRef = useRef<boolean>(false);

  // Track tool call validity for interruption handling
  // Maps call_id → response_id so we can invalidate on cancellation
  const pendingCallsRef = useRef<Map<string, string>>(new Map());
  const cancelledResponsesRef = useRef<Set<string>>(new Set());

  // Track whether a response is currently active to avoid sending
  // response.create while one is already in progress
  const activeResponseCountRef = useRef<number>(0);

  /**
   * Start monitoring mic volume via AnalyserNode
   */
  const startVolumeMonitoring = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    audioContextRef.current = audioContext;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    volumeIntervalRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;
      setVolume(rms);
    }, 100);
  }, []);

  /**
   * Stop volume monitoring and release AudioContext
   */
  const stopVolumeMonitoring = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  /**
   * Release all WebRTC and audio resources
   */
  const cleanup = useCallback(() => {
    stopVolumeMonitoring();

    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }

    sessionReadyRef.current = false;
    startingRef.current = false;
    pendingCallsRef.current.clear();
    cancelledResponsesRef.current.clear();
    activeResponseCountRef.current = 0;
  }, [stopVolumeMonitoring]);

  /**
   * Execute a tool call server-side and send the result back via data channel
   */
  const executeToolCall = useCallback(async (callId: string, responseId: string, name: string, args: string) => {
    try {
      const parsedArgs = JSON.parse(args);

      console.log(`VoiceSession: Executing tool ${name}`, parsedArgs);

      const response = await fetch('/api/me/voice/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, arguments: parsedArgs }),
      });

      const data = await response.json();
      const result = data.result || data.error || 'Tool execution failed';

      // Check if this tool call was cancelled (user interrupted) before sending result
      if (cancelledResponsesRef.current.has(responseId)) {
        console.log(`VoiceSession: Skipping cancelled tool result for ${name} (call: ${callId})`);
        pendingCallsRef.current.delete(callId);
        return;
      }

      pendingCallsRef.current.delete(callId);

      // Send result back via data channel
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: result,
          },
        }));
        // Only request a new response if one isn't already active
        if (activeResponseCountRef.current === 0) {
          dcRef.current.send(JSON.stringify({ type: 'response.create' }));
        }
      }
    } catch (err) {
      console.error(`VoiceSession: Tool ${name} failed`, err);

      // Skip if cancelled
      if (cancelledResponsesRef.current.has(responseId)) {
        pendingCallsRef.current.delete(callId);
        return;
      }

      pendingCallsRef.current.delete(callId);

      // Send error result so model can recover gracefully
      if (dcRef.current?.readyState === 'open') {
        dcRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: `Error: Failed to execute ${name}`,
          },
        }));
        if (activeResponseCountRef.current === 0) {
          dcRef.current.send(JSON.stringify({ type: 'response.create' }));
        }
      }
    }
  }, []);

  /**
   * Send the greeting to trigger the assistant's first response
   */
  const sendGreeting = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;

    console.log('VoiceSession: Sending greeting trigger');
    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      },
    }));
    dc.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  /**
   * Handle incoming data channel messages from OpenAI Realtime
   */
  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'session.created':
          console.log('VoiceSession: Session ready, sending greeting');
          sessionReadyRef.current = true;
          sendGreeting();
          break;

        case 'session.updated':
          console.log('VoiceSession: Session updated');
          break;

        case 'input_audio_buffer.speech_started':
          setSpeakingState('listening');
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (msg.transcript?.trim()) {
            console.log('VoiceSession: User said:', msg.transcript.trim());
            const entry: TranscriptEntry = {
              role: 'user',
              text: msg.transcript.trim(),
              timestamp: Date.now(),
            };
            transcriptRef.current = [...transcriptRef.current, entry];
            setTranscript([...transcriptRef.current]);
          }
          break;

        case 'response.audio_transcript.delta':
          assistantTextRef.current += msg.delta || '';
          setSpeakingState('speaking');
          break;

        case 'response.audio_transcript.done':
          if (assistantTextRef.current.trim()) {
            console.log('VoiceSession: Assistant said:', assistantTextRef.current.trim());
            const entry: TranscriptEntry = {
              role: 'assistant',
              text: assistantTextRef.current.trim(),
              timestamp: Date.now(),
            };
            transcriptRef.current = [...transcriptRef.current, entry];
            setTranscript([...transcriptRef.current]);
          }
          assistantTextRef.current = '';
          break;

        case 'response.created':
          activeResponseCountRef.current++;
          break;

        case 'response.function_call_arguments.done':
          console.log(`VoiceSession: Tool call: ${msg.name}`, msg.arguments);
          // Track this call so we can skip it if the response gets cancelled
          pendingCallsRef.current.set(msg.call_id, msg.response_id);
          executeToolCall(msg.call_id, msg.response_id, msg.name, msg.arguments);
          break;

        case 'response.done': {
          activeResponseCountRef.current = Math.max(0, activeResponseCountRef.current - 1);
          const status = msg.response?.status;
          console.log('VoiceSession: Response complete, status:', status);

          if (status === 'cancelled') {
            // Mark this response as cancelled so in-flight tool calls are skipped
            cancelledResponsesRef.current.add(msg.response.id);
          } else if (status === 'failed') {
            console.error('VoiceSession: Response FAILED:', JSON.stringify(msg.response?.status_details, null, 2));
          }

          setSpeakingState('listening');
          break;
        }

        case 'error':
          // Suppress tool-call errors from cancelled responses (expected during interruptions)
          if (msg.error?.code === 'invalid_tool_call_id' ||
              msg.error?.code === 'conversation_already_has_active_response') {
            console.warn('VoiceSession: Suppressed expected error:', msg.error.code);
            break;
          }
          console.error('VoiceSession: Server error', msg.error);
          setError(msg.error?.message || 'Server error');
          break;

        case 'conversation.item.input_audio_transcription.failed':
          console.error('VoiceSession: Transcription failed:', JSON.stringify(msg.error, null, 2));
          break;

        default:
          // Log unhandled events for debugging
          if (!msg.type?.startsWith('response.audio.') &&
              !msg.type?.startsWith('rate_limits') &&
              !msg.type?.startsWith('response.function_call_arguments.delta') &&
              !msg.type?.startsWith('conversation.item.input_audio_transcription.delta')) {
            console.log('VoiceSession: Event:', msg.type);
          }
          break;
      }
    } catch (err) {
      console.error('VoiceSession: Failed to parse data channel message', err);
    }
  }, [executeToolCall, sendGreeting]);

  /**
   * Start a new voice session via WebRTC
   */
  const startSession = useCallback(async () => {
    // Use ref for synchronous guard (React state can be stale across rapid calls)
    if (startingRef.current || pcRef.current) {
      console.warn('VoiceSession: Session already active or starting');
      return;
    }
    startingRef.current = true;

    console.log('VoiceSession: Starting session...');
    setSessionState('connecting');
    setError(null);
    setTranscript([]);
    transcriptRef.current = [];
    assistantTextRef.current = '';

    try {
      // 1. Get ephemeral token from our API
      console.log('VoiceSession: Fetching token...');
      const tokenResponse = await fetch('/api/me/voice/token');
      if (!tokenResponse.ok) {
        throw new Error('Failed to get voice session token');
      }
      const { token, model } = await tokenResponse.json();
      console.log('VoiceSession: Token received');

      // 2. Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Start volume monitoring on mic
      startVolumeMonitoring(stream);

      // 4. Create WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 5. Create hidden <audio> element for assistant playback
      //    Must be in the DOM for autoplay to work reliably across browsers
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;

      // Route incoming audio track to the audio element
      pc.ontrack = (e) => {
        console.log('VoiceSession: Received remote audio track');
        audioEl.srcObject = e.streams[0];
      };

      // 6. Add mic track to peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 7. Create data channel for OpenAI events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('VoiceSession: Data channel open');
        setSessionState('active');
        setSpeakingState('listening');
        // Greeting is sent when 'session.created' event arrives via handleDataChannelMessage
      };

      dc.onmessage = handleDataChannelMessage;

      dc.onclose = () => {
        console.log('VoiceSession: Data channel closed');
      };

      // 8. Create SDP offer and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 9. POST SDP offer to OpenAI Realtime endpoint, get answer
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`OpenAI Realtime connection failed: ${sdpResponse.status} ${errorText}`);
      }

      // 10. Set remote SDP answer to complete WebRTC handshake
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      console.log('VoiceSession: WebRTC connected');

    } catch (err) {
      console.error('VoiceSession: Failed to start', err);
      setError(err instanceof Error ? err.message : 'Failed to start voice session');
      setSessionState('error');
      cleanup();
    }
  }, [handleDataChannelMessage, startVolumeMonitoring, cleanup]);

  /**
   * End the current voice session
   */
  const endSession = useCallback(async (): Promise<string[]> => {
    cleanup();

    setSessionState('idle');
    setSpeakingState('idle');
    setVolume(0);

    // Return formatted transcript strings for backward compatibility
    const finalTranscript = transcriptRef.current;
    return finalTranscript.map(entry =>
      `[${entry.role === 'user' ? 'User' : 'Assistant'}]: ${entry.text}`
    );
  }, [cleanup]);

  /**
   * Send a text message during an active session
   */
  const sendTextMessage = useCallback(async (text: string) => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      console.warn('VoiceSession: Cannot send text - data channel not open');
      return;
    }

    dcRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }));
    dcRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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
