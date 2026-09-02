import { useState, useRef, useEffect } from "react";
import { downsampleBuffer } from "../utils/audio.js";

export function useAudioCapture({
  candidateName,
  user,
  appendTranscript,
  addBiasWarning,
  partialEntryRef,
  displayPartialEntryRef,
  serverData,
  isCompleted,
  timerRef,
  startTimeRef,
}) {
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timer, setTimer] = useState(0);
  const [, setStatus] = useState("Ready to start recording");

  const wsRef = useRef(null);
  const wsDisplayRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const displayProcessorRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const videoRef = useRef(null);
  const accumulatedRef = useRef(0);
  const isPausedRef = useRef(false);
  const pausedTimeRef = useRef(0);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isScreenSharing && !isPaused && !isCompleted) {
        const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setTimer(elapsedSeconds);
        timerRef.current = elapsedSeconds;
        accumulatedRef.current = elapsedSeconds;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isScreenSharing, isPaused, isCompleted]);

  useEffect(() => {
    if (!serverData || autoStartedRef.current) return;
    if (serverData.intv_status === "completed") return;
    autoStartedRef.current = true;

    const priorSeconds = serverData.intv_duration_seconds ?? 0;
    accumulatedRef.current = priorSeconds;
    timerRef.current = priorSeconds;
    setTimer(priorSeconds);

    startMicOnly().catch(() => {});
  }, [serverData]);

  useEffect(() => {
    return () => {
      void stopScreenShare();
    };
  }, []);

  useEffect(() => {
    const stopTracksSync = () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener("beforeunload", stopTracksSync);
    return () => window.removeEventListener("beforeunload", stopTracksSync);
  }, []);

  function createTranscriptionSocket(speaker, partialRef, role) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime/transcribe?role=${role}`);
    socket.binaryType = "arraybuffer";

    socket.onopen = () => setStatus("Listening…");
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript" && typeof data.text === "string") {
          appendTranscript(data.text, Boolean(data.is_final), speaker, partialRef);
        } else if (data.type === "bias_warning" && typeof data.quote === "string") {
          addBiasWarning(data);
        }
      } catch (err) {
        console.error("Failed to parse transcription event", err);
      }
    };
    socket.onerror = () => setStatus("Connection error");
    socket.onclose = () => {};
    return socket;
  }

  async function startMicOnly() {
    const interviewerLabel = user?.full_name || "Interviewer";
    try {
      wsRef.current = createTranscriptionSocket(interviewerLabel, partialEntryRef, "interviewer");
      setStatus("Requesting microphone access...");

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      const micSource = audioContext.createMediaStreamSource(micStream);
      const micProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = micProcessor;

      micProcessor.onaudioprocess = (event) => {
        if (isPausedRef.current) return;
        const inputBuffer = event.inputBuffer.getChannelData(0);
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(downsampleBuffer(inputBuffer, audioContext.sampleRate, 16000));
      };

      micSource.connect(micProcessor);
      micProcessor.connect(audioContext.destination);

      setIsMicActive(true);
      setStatus("Listening (interviewer mic)…");
    } catch (error) {
      if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (error.name === "NotAllowedError") setStatus("Microphone access denied");
      else if (error.name === "NotFoundError") setStatus("No microphone found");
      else setStatus("Unable to start microphone");
    }
  }

  async function startScreenShare() {
    const interviewerLabel = user?.full_name || "Interviewer";
    const candidateLabel = candidateName || "Candidate";

    try {
      wsRef.current = createTranscriptionSocket(interviewerLabel, partialEntryRef, "interviewer");
      setStatus("Requesting screen access...");

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: { cursor: "always" },
      });
      mediaStreamRef.current = displayStream;

      setStatus("Requesting microphone access...");
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      const micSource = audioContext.createMediaStreamSource(micStream);
      const micProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = micProcessor;

      micProcessor.onaudioprocess = (event) => {
        if (isPausedRef.current) return;
        const inputBuffer = event.inputBuffer.getChannelData(0);
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(downsampleBuffer(inputBuffer, audioContext.sampleRate, 16000));
      };

      micSource.connect(micProcessor);
      micProcessor.connect(audioContext.destination);

      if (displayStream.getAudioTracks().length > 0) {
        wsDisplayRef.current = createTranscriptionSocket(candidateLabel, displayPartialEntryRef, "candidate");

        const displaySource = audioContext.createMediaStreamSource(displayStream);
        const displayProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        displayProcessorRef.current = displayProcessor;

        displayProcessor.onaudioprocess = (event) => {
          if (isPausedRef.current) return;
          const inputBuffer = event.inputBuffer.getChannelData(0);
          if (!wsDisplayRef.current || wsDisplayRef.current.readyState !== WebSocket.OPEN) return;
          wsDisplayRef.current.send(downsampleBuffer(inputBuffer, audioContext.sampleRate, 16000));
        };

        displaySource.connect(displayProcessor);
        displayProcessor.connect(audioContext.destination);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.play().catch((err) => console.warn("Video play failed", err));
      }

      startTimeRef.current = Date.now() - accumulatedRef.current * 1000;

      setIsMicActive(true);
      setIsScreenSharing(true);
      setStatus(
        displayStream.getAudioTracks().length > 0
          ? "Listening (interviewer + candidate)…"
          : "Screen shared — no computer audio detected"
      );

      displayStream.getTracks().forEach((track) => {
        track.onended = () => { void stopScreenShare(); };
      });
    } catch (error) {
      if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (wsDisplayRef.current) { wsDisplayRef.current.close(); wsDisplayRef.current = null; }
      console.error("startScreenShare error:", error.name, error.message, error);
      if (error.name === "NotAllowedError") setStatus("Screen share or microphone access cancelled");
      else if (error.name === "NotFoundError") setStatus("No screen or microphone available");
      else setStatus("Unable to start screen share");
      setIsScreenSharing(false);
    }
  }

  async function stopScreenShare() {
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null; }
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current.onaudioprocess = null; processorRef.current = null; }
    if (displayProcessorRef.current) { displayProcessorRef.current.disconnect(); displayProcessorRef.current.onaudioprocess = null; displayProcessorRef.current = null; }
    if (audioContextRef.current) {
      try { await audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (wsRef.current) { if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close(); wsRef.current = null; }
    if (wsDisplayRef.current) { if (wsDisplayRef.current.readyState === WebSocket.OPEN) wsDisplayRef.current.close(); wsDisplayRef.current = null; }
    setIsMicActive(false);
    setIsScreenSharing(false);
    setStatus("Ready to start recording");
  }

  async function addDisplayAudio() {
    const candidateLabel = candidateName || "Candidate";
    try {
      setStatus("Requesting screen access...");
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: { cursor: "always" },
      });
      mediaStreamRef.current = displayStream;

      if (displayStream.getAudioTracks().length > 0) {
        wsDisplayRef.current = createTranscriptionSocket(candidateLabel, displayPartialEntryRef, "candidate");
        const displaySource = audioContextRef.current.createMediaStreamSource(displayStream);
        const displayProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        displayProcessorRef.current = displayProcessor;

        displayProcessor.onaudioprocess = (event) => {
          if (isPausedRef.current) return;
          const inputBuffer = event.inputBuffer.getChannelData(0);
          if (!wsDisplayRef.current || wsDisplayRef.current.readyState !== WebSocket.OPEN) return;
          wsDisplayRef.current.send(downsampleBuffer(inputBuffer, audioContextRef.current.sampleRate, 16000));
        };

        displaySource.connect(displayProcessor);
        displayProcessor.connect(audioContextRef.current.destination);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.play().catch((err) => console.warn("Video play failed", err));
      }

      setIsScreenSharing(true);
      setStatus(
        displayStream.getAudioTracks().length > 0
          ? "Listening (interviewer + candidate)…"
          : "Screen shared — no computer audio detected"
      );

      displayStream.getTracks().forEach((track) => {
        track.onended = () => { removeDisplayAudio(); };
      });
    } catch (error) {
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
      if (wsDisplayRef.current) { wsDisplayRef.current.close(); wsDisplayRef.current = null; }
      if (error.name === "NotAllowedError") setStatus("Screen share cancelled — mic still active");
      else setStatus("Unable to share screen — mic still active");
    }
  }

  function removeDisplayAudio() {
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    if (displayProcessorRef.current) { displayProcessorRef.current.disconnect(); displayProcessorRef.current.onaudioprocess = null; displayProcessorRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (wsDisplayRef.current) { if (wsDisplayRef.current.readyState === WebSocket.OPEN) wsDisplayRef.current.close(); wsDisplayRef.current = null; }
    setIsScreenSharing(false);
    setStatus("Listening (interviewer mic)…");
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      if (isMicActive) removeDisplayAudio();
      else await stopScreenShare();
    } else if (isMicActive) {
      await addDisplayAudio();
    } else {
      await startScreenShare();
    }
  }

  function togglePause() {
    if (isPaused) {
      setIsPaused(false);
      startTimeRef.current = Date.now() - pausedTimeRef.current;
    } else {
      setIsPaused(true);
      pausedTimeRef.current = Date.now() - startTimeRef.current;
    }
  }

  return {
    isMicActive,
    isScreenSharing,
    isPaused,
    timer,
    videoRef,
    stopScreenShare,
    toggleScreenShare,
    togglePause,
  };
}
