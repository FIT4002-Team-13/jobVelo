import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex, card, button, badge } from "../styles/layout";
import { useAuth } from "../lib/AuthContext.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-primary-400",
  "bg-sky-400",
  "bg-mint-500",
  "bg-coral-400",
  "bg-primary-600",
  "bg-sky-600",
  "bg-mint-600",
  "bg-coral-600",
];

const SECTION_COLORS = [
  { border: "border-primary-200", activeBorder: "border-primary-400", badge: "bg-primary-100 text-primary-700", pauseBg: "bg-primary-100 hover:bg-primary-200 text-primary-600", timer: "text-primary-600" },
  { border: "border-sky-200",     activeBorder: "border-sky-400",     badge: "bg-sky-100 text-sky-700",         pauseBg: "bg-sky-100 hover:bg-sky-200 text-sky-600",           timer: "text-sky-600"     },
  { border: "border-mint-200",    activeBorder: "border-mint-400",    badge: "bg-mint-100 text-mint-700",       pauseBg: "bg-mint-100 hover:bg-mint-200 text-mint-600",        timer: "text-mint-600"    },
  { border: "border-coral-200",   activeBorder: "border-coral-400",   badge: "bg-coral-100 text-coral-700",     pauseBg: "bg-coral-100 hover:bg-coral-200 text-coral-600",     timer: "text-coral-600"   },
];

// ── Placeholder data — replace with API calls when endpoints are ready ─────────


const INITIAL_TRANSCRIPT = [];

const MOCK_QUESTIONS = [
  {
    id: 1,
    category: "Tech",
    categoryColor: "bg-mint-100 text-mint-700",
    text: "How would you design an end-to-end audio pipeline that preserves fidelity from recording to playback?",
    why: "Evaluates whether the candidate truly understands end-to-end audio fidelity by looking for knowledge of sampling rate.",
  },
  {
    id: 2,
    category: "General",
    categoryColor: "bg-sky-100 text-sky-700",
    text: "How would you design an end-to-end audio pipeline that preserves fidelity from recording to playback?",
    why: "Evaluates whether the candidate truly understands end-to-end audio fidelity by looking for knowledge of sampling rate.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name = "") {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(name = "") {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTimer(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function convertFloat32ToInt16(buffer) {
  const output = new DataView(new ArrayBuffer(buffer.length * 2));
  for (let i = 0; i < buffer.length; i += 1) {
    let sample = Math.max(-1, Math.min(1, buffer[i]));
    sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    output.setInt16(i * 2, sample, true);
  }
  return output.buffer;
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
  if (outputSampleRate === inputSampleRate) {
    return convertFloat32ToInt16(buffer);
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < buffer.length;
      i += 1
    ) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return convertFloat32ToInt16(result);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TranscriptEntry({ entry }) {
  return (
    <div className={`${flex.row} gap-3 py-2 group`}>
      <div
        className={`w-8 h-8 rounded-pill ${
          flex.rowCenter
        } text-white text-xs font-bold shrink-0 ${avatarColor(entry.speaker)}`}
      >
        {initials(entry.speaker)}
      </div>
      <div className={`${flex.col} gap-0.5 flex-1 min-w-0`}>
        <span className="text-xs text-neutral-400">{entry.timestamp}</span>
        <span className="text-sm text-neutral-700 leading-snug">
          {entry.text}
        </span>
      </div>
    </div>
  );
}

function QuestionCard({ q }) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div
      className={`${flex.col} gap-3 bg-neutral-0 border border-neutral-200 rounded-2xl p-4 min-w-[260px] max-w-[280px] shrink-0`}
    >
      <div className={`${flex.rowBetween}`}>
        <span className={`${badge.sm} ${q.categoryColor}`}>{q.category}</span>
        <div className={`${flex.row} gap-2 text-neutral-400`}>
          <button className="hover:text-mint-500 transition-colors">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button className="hover:text-coral-500 transition-colors">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
              <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>
      </div>
      <p className="text-sm text-neutral-700 leading-snug flex-1">{q.text}</p>
      <div className={`${flex.col} gap-2`}>
        <button
          className={`${button.danger} w-full py-2 text-sm font-semibold rounded-xl`}
        >
          Ignore
        </button>
        <button className="w-full py-2 text-sm font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors">
          More like this
        </button>
      </div>
      <button
        onClick={() => setWhyOpen((o) => !o)}
        className={`${flex.row} gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Why?
      </button>
      {whyOpen && (
        <p className="text-xs text-neutral-500 bg-neutral-50 rounded-xl p-3 leading-relaxed">
          {q.why}
        </p>
      )}
    </div>
  );
}

function SectionCard({ section, st, color, onStart, onPause, onResume, onDone, locked }) {
  const budget = section.suggested_minutes * 60;
  const pct = Math.min(100, (st.elapsed / budget) * 100);
  const over = st.elapsed > budget && st.status === "running";

  const isIdle    = st.status === "idle";
  const isRunning = st.status === "running";
  const isPaused  = st.status === "paused";
  const isDone    = st.status === "done";

  const borderClass = isRunning
    ? (over ? "border-coral-400" : color.activeBorder)
    : isPaused ? "border-amber-400"
    : isDone   ? "border-neutral-200"
    : color.border;

  const barClass = isRunning ? "bg-primary-500"
    : isPaused ? "bg-amber-400"
    : isDone   ? "bg-neutral-300"
    : "bg-neutral-200";

  const timerClass = over
    ? "text-coral-500 animate-pulse"
    : isRunning ? color.timer
    : "text-neutral-700";

  return (
    <div className={`shrink-0 w-[200px] border-2 ${borderClass} rounded-2xl overflow-hidden bg-neutral-0 transition-colors duration-300 ${isDone ? "opacity-40" : ""}`}>
      <div className="h-1 bg-neutral-100">
        <div className={`h-1 ${barClass} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>

      <div className={`${flex.col} gap-2.5 p-3.5`}>
        <div className={`${flex.rowBetween} gap-1.5`}>
          <span className="font-semibold text-neutral-800 text-sm leading-tight">{section.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${isDone ? "bg-neutral-100 text-neutral-400" : color.badge}`}>
            {section.suggested_minutes}m
          </span>
        </div>

        <p className="text-xs text-neutral-400 leading-snug">{section.description}</p>

        <div className={`${flex.row} items-baseline gap-1`}>
          <span className={`font-mono text-xl font-bold ${timerClass}`}>{formatTimer(st.elapsed)}</span>
          <span className="text-xs text-neutral-400">/ {formatTimer(budget)}</span>
        </div>

        {isIdle && (
          <button
            onClick={onStart}
            disabled={locked}
            className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${locked ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" : "bg-primary-500 hover:bg-primary-600 text-white"}`}
          >
            Start
          </button>
        )}

        {(isRunning || isPaused) && (
          <div className={`${flex.row} gap-2`}>
            <button
              onClick={isRunning ? onPause : onResume}
              disabled={locked}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${locked ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" : color.pauseBg}`}
            >
              {isRunning ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21" />
                </svg>
              )}
            </button>
            <button
              onClick={onDone}
              disabled={locked}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${locked ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600"}`}
            >
              Done
            </button>
          </div>
        )}

        {isDone && (
          <div className={`${flex.row} gap-1.5 py-1`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-sm font-semibold text-neutral-400">Done</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [status, setStatus] = useState("Ready to start recording");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const { user } = useAuth();
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [cvUrl, setCvUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [questions] = useState(MOCK_QUESTIONS);
  const [timer, setTimer] = useState(0);
  const [sections, setSections] = useState([]);
  const [sectionStates, setSectionStates] = useState([]);
  const sectionIntervals = useRef([]);
  const sectionsScrollRef = useRef(null);
  const sectionCardRefs = useRef([]);

  const transcriptRef = useRef([]);
  const timerRef = useRef(0);
  const wsRef = useRef(null);
  const wsDisplayRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const displayProcessorRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const partialEntryRef = useRef(null);
  const displayPartialEntryRef = useRef(null);
  const entryCounterRef = useRef(1);
  const startTimeRef = useRef(Date.now());
  const pausedTimeRef = useRef(0);
  const isPausedRef = useRef(false);
  const videoRef = useRef(null);
  const transcriptContainerRef = useRef(null);

  useEffect(() => {
    const element = transcriptContainerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [transcript]);

  function appendTranscript(text, isFinal, speaker, partialRef) {
    const timestamp = formatTimer(
      Math.floor((Date.now() - startTimeRef.current) / 1000)
    );

    if (isFinal) {
      const entryId = String(entryCounterRef.current++);
      const prevPartialId = partialRef.current;
      partialRef.current = null;

      const newEntry = { id: entryId, speaker, timestamp, text };
      setTranscript((prev) => {
        const refreshed = prevPartialId
          ? prev.filter((entry) => entry.id !== prevPartialId)
          : prev;
        const updated = [...refreshed, newEntry];
        localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));
        return updated;
      });
    } else {
      if (!partialRef.current) {
        partialRef.current = `partial-${entryCounterRef.current++}`;
      }
      const partialId = partialRef.current;
      const partialEntry = { id: partialId, speaker, timestamp, text };

      setTranscript((prev) => [
        ...prev.filter((entry) => entry.id !== partialId),
        partialEntry,
      ]);
    }
  }

  useEffect(() => {
    return () => {
      sectionIntervals.current.forEach((id) => clearInterval(id));
    };
  }, []);

  const activeSectionIndex = sectionStates.findIndex(
    (st) => st.status === "running" || st.status === "paused"
  );

  useEffect(() => {
    if (activeSectionIndex === -1) return;
    const card = sectionCardRefs.current[activeSectionIndex];
    const container = sectionsScrollRef.current;
    if (!card || !container) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const padding = 24; // px-6
    container.scrollTo({
      left: container.scrollLeft + cardRect.left - containerRect.left - padding,
      behavior: "smooth",
    });
  }, [activeSectionIndex]);

  function startSection(i) {
    setSectionStates((prev) =>
      prev.map((st, j) => {
        if (j === i) return { ...st, status: "running" };
        if (st.status === "running" || st.status === "paused") {
          clearInterval(sectionIntervals.current[j]);
          sectionIntervals.current[j] = null;
          return { ...st, status: "done" };
        }
        return st;
      })
    );
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = setInterval(() => {
      setSectionStates((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], elapsed: next[i].elapsed + 1 };
        return next;
      });
    }, 1000);
  }

  function pauseSection(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = null;
    setSectionStates((prev) =>
      prev.map((st, j) => (j === i ? { ...st, status: "paused" } : st))
    );
  }

  function resumeSection(i) {
    setSectionStates((prev) =>
      prev.map((st, j) => {
        if (j === i) return { ...st, status: "running" };
        if (st.status === "running") {
          clearInterval(sectionIntervals.current[j]);
          sectionIntervals.current[j] = null;
          return { ...st, status: "done" };
        }
        return st;
      })
    );
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = setInterval(() => {
      setSectionStates((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], elapsed: next[i].elapsed + 1 };
        return next;
      });
    }, 1000);
  }

  function doneSection(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = null;
    setSectionStates((prev) =>
      prev.map((st, j) => (j === i ? { ...st, status: "done" } : st))
    );
  }

  function togglePause() {
    if (isPaused) {
      // Unpause: restore the start time so timer continues from where it was
      setIsPaused(false);
      startTimeRef.current = Date.now() - pausedTimeRef.current;
    } else {
      // Pause: save current elapsed time
      setIsPaused(true);
      pausedTimeRef.current = Date.now() - startTimeRef.current;
    }
  }

  // Sync isPausedRef with isPaused state for use in processor callback
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  function createTranscriptionSocket(speaker, partialRef) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/realtime/transcribe`
    );
    socket.binaryType = "arraybuffer";

    socket.onopen = () => setStatus("Listening…");
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript" && typeof data.text === "string") {
          appendTranscript(data.text, Boolean(data.is_final), speaker, partialRef);
        }
      } catch (err) {
        console.error("Failed to parse transcription event", err);
      }
    };
    socket.onerror = () => setStatus("Connection error");
    socket.onclose = () => {};

    return socket;
  }

  async function startScreenShare() {
    const interviewerLabel = user?.full_name || "Interviewer";
    const candidateLabel = candidateName || "Candidate";

    try {
      // Mic socket — always created
      wsRef.current = createTranscriptionSocket(interviewerLabel, partialEntryRef);
      setStatus("Requesting screen access...");

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: { cursor: "always" },
      });
      mediaStreamRef.current = displayStream;

      setStatus("Requesting microphone access...");
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      micStreamRef.current = micStream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      // Mic processor → mic WebSocket (Interviewer)
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

      // Display audio processor → separate WebSocket (Candidate)
      // macOS getDisplayMedia returns video-only by default — skip if no audio tracks.
      if (displayStream.getAudioTracks().length > 0) {
        wsDisplayRef.current = createTranscriptionSocket(candidateLabel, displayPartialEntryRef);

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
        videoRef.current.play().catch((err) => {
          console.warn("Video play failed", err);
        });
      }

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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsDisplayRef.current) {
        wsDisplayRef.current.close();
        wsDisplayRef.current = null;
      }
      console.error("startScreenShare error:", error.name, error.message, error);
      if (error.name === "NotAllowedError") {
        setStatus("Screen share or microphone access cancelled");
      } else if (error.name === "NotFoundError") {
        setStatus("No screen or microphone available");
      } else {
        setStatus("Unable to start screen share");
      }
      setIsScreenSharing(false);
    }
  }

  async function stopScreenShare() {
    // Stop media tracks first (synchronous) so the OS releases the screen
    // recording session before any async work. If this runs during page unload
    // via `void stopScreenShare()`, the async parts below may never execute —
    // but the tracks must be stopped or macOS hangs the next getDisplayMedia.
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (displayProcessorRef.current) {
      displayProcessorRef.current.disconnect();
      displayProcessorRef.current.onaudioprocess = null;
      displayProcessorRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (err) {
        console.warn("Audio context close failed", err);
      }
      audioContextRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    if (wsDisplayRef.current) {
      if (wsDisplayRef.current.readyState === WebSocket.OPEN) {
        wsDisplayRef.current.close();
      }
      wsDisplayRef.current = null;
    }

    setIsMicActive(false);
    setIsScreenSharing(false);
    setStatus("Ready to start recording");
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      if (isMicActive) {
        removeDisplayAudio();
      } else {
        await stopScreenShare();
      }
    } else {
      if (isMicActive) {
        await addDisplayAudio();
      } else {
        await startScreenShare();
      }
    }
  }

  async function startMicOnly() {
    const interviewerLabel = user?.full_name || "Interviewer";
    try {
      wsRef.current = createTranscriptionSocket(interviewerLabel, partialEntryRef);
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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (error.name === "NotAllowedError") {
        setStatus("Microphone access denied");
      } else if (error.name === "NotFoundError") {
        setStatus("No microphone found");
      } else {
        setStatus("Unable to start microphone");
      }
    }
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
        wsDisplayRef.current = createTranscriptionSocket(candidateLabel, displayPartialEntryRef);

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
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (wsDisplayRef.current) {
        wsDisplayRef.current.close();
        wsDisplayRef.current = null;
      }
      if (error.name === "NotAllowedError") {
        setStatus("Screen share cancelled — mic still active");
      } else {
        setStatus("Unable to share screen — mic still active");
      }
    }
  }

  function removeDisplayAudio() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (displayProcessorRef.current) {
      displayProcessorRef.current.disconnect();
      displayProcessorRef.current.onaudioprocess = null;
      displayProcessorRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (wsDisplayRef.current) {
      if (wsDisplayRef.current.readyState === WebSocket.OPEN) wsDisplayRef.current.close();
      wsDisplayRef.current = null;
    }
    setIsScreenSharing(false);
    setStatus("Listening (interviewer mic)…");
  }

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

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused && !isCompleted) {
        const elapsedSeconds = Math.floor(
          (Date.now() - startTimeRef.current) / 1000
        );
        setTimer(elapsedSeconds);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, isCompleted]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isCompleted && transcriptRef.current.length) {
        fetch(`/api/interviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intv_transcript: transcriptRef.current,
            intv_duration_seconds: timerRef.current,
          }),
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [id, isCompleted]);

  function syncCounterFromEntries(entries) {
    const maxId = entries.reduce((max, e) => {
      const n = parseInt(e.id, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    entryCounterRef.current = maxId + 1;
  }

  useEffect(() => {
    let hasLocal = false;
    const local = localStorage.getItem(`transcript-${id}`);
    if (local) {
      try {
        const entries = JSON.parse(local);
        setTranscript(entries);
        syncCounterFromEntries(entries);
        hasLocal = true;
      } catch {
        localStorage.removeItem(`transcript-${id}`);
      }
    }
    fetch(`/api/interviews/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const serverTranscript = Array.isArray(data.intv_transcript)
          ? data.intv_transcript
          : [];
        const completed = data.intv_status === "completed";

        setIsCompleted(completed);
        if (completed) {
          setStatus("Interview completed");
          setTimer(data.intv_duration_seconds ?? 0);
          if (serverTranscript.length) {
            setTranscript(serverTranscript);
            syncCounterFromEntries(serverTranscript);
          } else if (!hasLocal) {
            setTranscript([]);
          }
        } else {
          if (!hasLocal && serverTranscript.length) {
            setTranscript(serverTranscript);
            syncCounterFromEntries(serverTranscript);
          }
          if (data.intv_duration_seconds) {
            startTimeRef.current = Date.now() - data.intv_duration_seconds * 1000;
          }
        }

        if (data.job_id) {
          setJobId(data.job_id);
          fetch(`/api/jobs/${data.job_id}`)
            .then((r) => r.json())
            .then((job) => { if (job.title) setCandidateRole(job.title); })
            .catch(() => {});
        }
        if (data.cand_id) {
          fetch(`/api/candidates/${data.cand_id}`)
            .then((r) => r.json())
            .then((cand) => {
              if (cand.cand_full_name) setCandidateName(cand.cand_full_name);
              if (cand.cand_cv_url) setCvUrl(cand.cand_cv_url);
            })
            .catch(() => {});
        }
        if (data.job_id && data.cand_id) {
          if (Array.isArray(data.intv_sections) && data.intv_sections.length > 0) {
            setSections(data.intv_sections);
            setSectionStates(data.intv_sections.map(() => ({ status: "idle", elapsed: 0 })));
            sectionIntervals.current = new Array(data.intv_sections.length).fill(null);
          } else {
            fetch("/api/interviews/generate-plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ job_id: data.job_id, cand_id: data.cand_id }),
            })
              .then((r) => r.json())
              .then((plan) => {
                if (Array.isArray(plan) && plan.length > 0) {
                  setSections(plan);
                  setSectionStates(plan.map(() => ({ status: "idle", elapsed: 0 })));
                  sectionIntervals.current = new Array(plan.length).fill(null);
                  fetch(`/api/interviews/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ intv_sections: plan }),
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      });
  }, [id]);

  async function completeInterview() {
    if (isCompleted) {
      return;
    }

    await fetch(`/api/interviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intv_transcript: transcript,
        intv_status: "completed",
        intv_duration_seconds: timer,
      }),
    });
    setIsCompleted(true);
    setStatus("Interview completed");
    localStorage.removeItem(`transcript-${id}`);
    navigate(`/jobs/${jobId}`);
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-50 font-sans overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-4 shrink-0">
        <div className={`${flex.rowBetween}`}>
          {/* Candidate + interviewer info */}
          <div className={`${flex.row} gap-16`}>
            <div className={flex.col}>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">
                Candidate
              </span>
              <span className="text-2xl font-bold text-neutral-800">
                {candidateName || "—"}
              </span>
              <span className="text-sm text-neutral-400">
                {candidateRole || "—"}
              </span>
            </div>
            <div className={flex.col}>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">
                Interviewer
              </span>
              <span className="text-2xl font-bold text-neutral-800">
                {user?.full_name || "—"}
              </span>
              <span className="text-sm text-neutral-400">
                {user?.role || "—"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className={`${flex.row} gap-4`}>
            <button
              className={button.primary}
              onClick={() => cvUrl && window.open(cvUrl, "_blank")}
              disabled={!cvUrl}
            >
              View Resume
            </button>
            <button
              className={`${button.outline} ${
                isMicActive
                  ? "bg-coral-100 text-coral-800 hover:bg-coral-200"
                  : ""
              } ${isCompleted ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={() => {
                if (isCompleted) return;
                if (isMicActive) void stopScreenShare();
                else void startMicOnly();
              }}
              disabled={isCompleted}
            >
              {isMicActive ? "Stop Recording" : "Start Recording"}
            </button>
            <button
              className={`${button.outline} ${
                isScreenSharing
                  ? "bg-sky-100 text-sky-800 hover:bg-sky-200"
                  : !isMicActive || isCompleted
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
              onClick={() => !isCompleted && isMicActive && void toggleScreenShare()}
              disabled={isCompleted || !isMicActive}
              title={!isMicActive ? "Start recording first" : isScreenSharing ? "Stop sharing screen" : "Share screen to capture computer audio"}
            >
              {isScreenSharing ? "Stop screen share" : "Share screen"}
            </button>
            <div className={`${flex.col} gap-2 text-right`}>
              <div
                className={`${flex.row} gap-2 text-neutral-700 font-semibold text-lg`}
              >
                <span>{formatTimer(timer)}</span>
                <span className="w-3 h-3 rounded-pill bg-coral-500 animate-pulse" />
              </div>
              <span className="text-xs text-neutral-500">{status}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 ${flex.row} gap-6 p-6 overflow-hidden items-stretch`}
      >
        {/* Left — Live Transcription */}
        <div
          className={`${card.base} flex flex-col w-[48%] overflow-hidden p-0`}
        >
          <div
            className={`${flex.rowBetween} px-6 pt-5 pb-4 border-b border-neutral-100 shrink-0`}
          >
            <span className="text-base font-semibold text-neutral-800">
              Live Transcription
            </span>
            <button
              onClick={() => setTranscriptVisible((v) => !v)}
              className={`text-sm ${
                transcriptVisible
                  ? "text-neutral-400 hover:text-neutral-600"
                  : "text-primary-500 hover:text-primary-600"
              } transition-colors`}
            >
              {transcriptVisible ? "Hide" : "Show"}
            </button>
          </div>
          {transcriptVisible && (
            <div
              className="flex-1 overflow-y-auto px-6 py-3 scrollbar-primary scroll-auto"
              ref={transcriptContainerRef}
            >
              {transcript.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center mt-8">
                  Transcription will appear here once the interview starts.
                </p>
              ) : (
                transcript.map((entry) => (
                  <TranscriptEntry key={entry.id} entry={entry} />
                ))
              )}
            </div>
          )}
          {isScreenSharing && (
            <div className="shrink-0 border-t border-neutral-100 pt-4 px-6 pb-4">
              <p className="text-xs text-neutral-500 mb-2 font-medium">
                Screen Share
              </p>
              <video
                ref={videoRef}
                autoPlay
                muted
                className="w-full h-40 bg-neutral-900 rounded-lg object-cover"
              />
            </div>
          )}
        </div>

        {/* Right — Assessment + Questions + Actions */}
        <div className={`flex-1 ${flex.col} gap-4 overflow-hidden`}>
          {/* Interview Sections */}
          {sections.length > 0 && (
            <div className={`${card.flat} flex flex-col shrink-0 overflow-hidden`}>
              <div className="px-6 pt-4 pb-3 border-b border-neutral-100 shrink-0">
                <h2 className="text-base font-semibold text-neutral-800">Interview Sections</h2>
              </div>
              <div ref={sectionsScrollRef} className="overflow-x-auto px-6 py-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                <div className={`${flex.row} gap-3 items-stretch`}>
                  {sections.map((section, i) => (
                    <div key={i} ref={(el) => (sectionCardRefs.current[i] = el)} className="shrink-0">
                      <SectionCard
                        section={section}
                        st={sectionStates[i] ?? { status: "idle", elapsed: 0 }}
                        color={SECTION_COLORS[i % SECTION_COLORS.length]}
                        locked={!isMicActive}
                        onStart={() => startSection(i)}
                        onPause={() => pauseSection(i)}
                        onResume={() => resumeSection(i)}
                        onDone={() => doneSection(i)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Suggested Questions */}
          <div className={`${card.flat} flex flex-col flex-1 overflow-hidden`}>
            <div className="px-6 pt-5 pb-4 border-b border-neutral-100 shrink-0">
              <h2 className="text-base font-semibold text-neutral-800">
                Suggested Questions
              </h2>
            </div>
            <div
              className={`flex-1 overflow-x-auto overflow-y-hidden px-6 py-4`}
            >
              <div className={`${flex.row} gap-4 h-full items-start`}>
                {questions.map((q) => (
                  <QuestionCard key={q.id} q={q} />
                ))}
              </div>
            </div>
          </div>

          {/* Pause / Complete */}
          <div className={`${flex.row} gap-4 shrink-0`}>
            <button
              onClick={() => !isCompleted && togglePause()}
              disabled={isCompleted}
              className={`flex-1 py-4 text-base font-semibold rounded-2xl transition-colors ${
                isCompleted
                  ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  : isPaused
                  ? "bg-mint-400 hover:bg-mint-500 text-white"
                  : "bg-coral-400 hover:bg-coral-500 text-white"
              }`}
            >
              {isPaused ? "Unpause" : "Pause"}
            </button>
            <button
              onClick={() => completeInterview()}
              disabled={isCompleted}
              className={`flex-1 py-4 text-base font-semibold rounded-2xl transition-colors ${
                isCompleted
                  ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  : "text-white bg-sky-300 hover:bg-sky-400"
              }`}
            >
              Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
