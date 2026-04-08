import { useState, useRef, useCallback, useEffect, type RefObject } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: { id: string; name: string; type: "tool"; status: "running" | "completed" }[];
  reasoning?: string;
  isStreaming?: boolean;
  inputModality?: "text" | "audio";
};

type UseAudioOptions = {
  conversationId: string | null;
  setConversationId: (id: string) => void;
  createConversation: () => Promise<string>;
  setupEventSource: (convId: string, assistantMessageId: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (loading: boolean) => void;
  isLoading: boolean;
  generateId: () => string;
  apiUrl: string;
};

export function useAudio({
  conversationId,
  setConversationId,
  createConversation,
  setupEventSource,
  setMessages,
  setIsLoading,
  isLoading,
  generateId,
  apiUrl,
}: UseAudioOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceMode, setVoiceMode] = useState<"single" | "continuous">("single");

  const voiceModeRef = useRef<"single" | "continuous">("single");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const pendingUserMsgIdRef = useRef<string | null>(null);
  const vadRef = useRef<any>(null);
  const speechActiveRef = useRef(false);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (audioWsRef.current) {
      audioWsRef.current.close();
      audioWsRef.current = null;
    }
    if (vadRef.current) {
      vadRef.current.destroy();
      vadRef.current = null;
    }
    speechActiveRef.current = false;
    pendingAssistantIdRef.current = null;
    pendingUserMsgIdRef.current = null;
    setRecordingDuration(0);
    setIsRecording(false);
    setIsListening(false);
  }, []);

  const openAudioWs = useCallback(async (convId: string): Promise<WebSocket> => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = apiUrl
      ? apiUrl.replace(/^http/, "ws")
      : `${wsProtocol}//${window.location.host}`;
    const ws = new WebSocket(`${wsBase}/api/conversations/${convId}/audio`);
    audioWsRef.current = ws;
    ws.onclose = () => { audioWsRef.current = null; };
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });
    return ws;
  }, [apiUrl]);

  const handleSpeechStart = useCallback(async (
    convIdRef: RefObject<string | null>,
  ) => {
    if (speechActiveRef.current) return;
    speechActiveRef.current = true;
    setIsRecording(true);
    setRecordingDuration(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1);
    }, 1000);

    let convId = convIdRef.current;
    if (!convId) {
      convId = await createConversation();
      setConversationId(convId);
      convIdRef.current = convId;
    }

    const userMessageId = generateId();
    const assistantMessageId = generateId();
    pendingUserMsgIdRef.current = userMessageId;
    pendingAssistantIdRef.current = assistantMessageId;

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user" as const, content: "[Listening...]", inputModality: "audio" as const },
      { id: assistantMessageId, role: "assistant" as const, content: "", steps: [], reasoning: "", isStreaming: true },
    ]);
    setIsLoading(true);

    setupEventSource(convId, assistantMessageId);

    try {
      const ws = await openAudioWs(convId);
      ws.send(JSON.stringify({
        type: "audio.config",
        encoding: "webm_opus",
        sample_rate: 48000,
        channels: 1,
        source: "browser",
      }));
    } catch {
      // WS failed — speech will still be captured by VAD
    }
  }, [createConversation, openAudioWs, setupEventSource, setConversationId, setMessages, setIsLoading, generateId]);

  const handleSpeechEnd = useCallback(() => {
    if (!speechActiveRef.current) return;
    speechActiveRef.current = false;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingDuration(0);
    setIsRecording(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setTimeout(() => {
        if (audioWsRef.current?.readyState === WebSocket.OPEN) {
          audioWsRef.current.send(JSON.stringify({ type: "audio.end" }));
        }
        if (voiceModeRef.current === "single") {
          if (vadRef.current) {
            vadRef.current.destroy();
            vadRef.current = null;
          }
          setIsListening(false);
        }
      }, 100);
    }
  }, []);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      cleanup();
      return;
    }

    if (isLoading) return;

    try {
      const convIdRef = { current: conversationId } as RefObject<string | null>;
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const { MicVAD } = await import("@ricky0123/vad-web");
      const vad = await MicVAD.new({
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/",
        startOnLoad: true,
        getStream: async () => micStream,
        onSpeechStart: () => {
          handleSpeechStart(convIdRef);

          if (!mediaRecorderRef.current) {
            try {
              const recorder = new MediaRecorder(micStream, { mimeType: "audio/webm;codecs=opus" });
              mediaRecorderRef.current = recorder;
              recorder.ondataavailable = (e) => {
                if (e.data.size > 0 && audioWsRef.current?.readyState === WebSocket.OPEN) {
                  e.data.arrayBuffer().then((buf) => {
                    audioWsRef.current?.send(buf);
                  });
                }
              };
              recorder.start(250);
            } catch {
              // MediaRecorder failed
            }
          }
        },
        onSpeechEnd: () => {
          handleSpeechEnd();
        },
        onVADMisfire: () => {
          // Speech was too short — ignore
        },
      });

      vadRef.current = vad;
      setIsListening(true);
    } catch (err) {
      console.error("VAD initialization failed:", err);
    }
  }, [isListening, isLoading, conversationId, cleanup, handleSpeechStart, handleSpeechEnd]);

  const toggleVoiceMode = useCallback(() => {
    const next = voiceMode === "single" ? "continuous" : "single";
    setVoiceMode(next);
    voiceModeRef.current = next;
  }, [voiceMode]);

  // Expose pendingUserMsgIdRef for transcript handling in SSE
  const getPendingUserMsgId = useCallback(() => pendingUserMsgIdRef.current, []);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    isListening,
    isRecording,
    recordingDuration,
    voiceMode,
    toggleListening,
    toggleVoiceMode,
    cleanup,
    getPendingUserMsgId,
  };
}
