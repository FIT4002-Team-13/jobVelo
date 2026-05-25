import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex, card, button, badge } from "../styles/layout";

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

// Score bar accent colours — Communication blue, Skill coral, Problem Solving mint.
const SCORE_COLORS = {
  Communication: "bg-primary-500",
  Skill: "bg-coral-500",
  "Problem Solving": "bg-mint-500",
};

// ── Placeholder data — replace with API calls when endpoints are ready ─────────

const MOCK_INTERVIEW = {
  candidate_name: "Super Mario",
  candidate_role: "Front End Developer",
  interviewer_name: "John Doe",
  interviewer_role: "Senior Engineer",
  cv_url: null,
};

const INITIAL_TRANSCRIPT = [];

const MOCK_SCORES = [
  { label: "Communication", score: 7.0 },
  { label: "Skill", score: 7.0 },
  { label: "Problem Solving", score: 7.0 },
];

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
      <button className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-neutral-600 shrink-0 p-1">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </div>
  );
}

function ScoreBar({ label, score }) {
  const pct = (score / 10) * 100;
  const color = SCORE_COLORS[label] ?? "bg-primary-500";
  return (
    <div className={`${flex.col} gap-1.5`}>
      <div className={`${flex.rowBetween} text-sm`}>
        <span className="text-neutral-700 font-medium">{label}</span>
        <span className="text-neutral-500">{score.toFixed(1)}/10.0</span>
      </div>
      <div className="h-1.5 w-full bg-neutral-200 rounded-pill overflow-hidden">
        <div
          className={`h-full ${color} rounded-pill transition-all`}
          style={{ width: `${pct}%` }}
        />
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
            >
              <path d="M14 9V5a3 3 0 0 0-6 0v4" />
              <path d="M18 9H6l1 12h10z" />
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
            >
              <path d="M10 15v4a3 3 0 0 0 6 0v-4" />
              <path d="M6 15h12l-1-12H7z" />
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [status, setStatus] = useState("Ready to start screen share");
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [interview] = useState(MOCK_INTERVIEW);
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [scores] = useState(MOCK_SCORES);
  const [questions] = useState(MOCK_QUESTIONS);
  const [timer, setTimer] = useState(0);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const partialEntryRef = useRef(null);
  const entryCounterRef = useRef(1);
  const startTimeRef = useRef(Date.now());
  const videoRef = useRef(null);

  function appendTranscript(text, isFinal) {
    const timestamp = formatTimer(
      Math.floor((Date.now() - startTimeRef.current) / 1000),
    );

    if (isFinal) {
      const id = entryCounterRef.current++;
      const prevPartialId = partialEntryRef.current;
      partialEntryRef.current = null;

      const newEntry = { id, speaker: "Live", timestamp, text };
      setTranscript((prev) => {
        const refreshed = prevPartialId
          ? prev.filter((entry) => entry.id !== prevPartialId)
          : prev;
        return [...refreshed, newEntry];
      });
    } else {
      if (!partialEntryRef.current) {
        partialEntryRef.current = `partial-${entryCounterRef.current++}`;
      }
      const partialId = partialEntryRef.current;
      const partialEntry = { id: partialId, speaker: "Live", timestamp, text };

      setTranscript((prev) => [
        ...prev.filter((entry) => entry.id !== partialId),
        partialEntry,
      ]);
    }
  }

  function createTranscriptionSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/realtime/transcribe`,
    );
    socket.binaryType = "arraybuffer";

    socket.onopen = () => setStatus("Listening…");
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript" && typeof data.text === "string") {
          appendTranscript(data.text, Boolean(data.is_final));
        }
      } catch (err) {
        console.error("Failed to parse transcription event", err);
      }
    };
    socket.onerror = () => setStatus("Microphone connection error");
    socket.onclose = () => setStatus("Transcription stopped");

    return socket;
  }

  async function startScreenShare() {
    try {
      const socket = createTranscriptionSocket();
      wsRef.current = socket;
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

      // Also request microphone access
      setStatus("Requesting microphone access...");
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      micStreamRef.current = micStream;

      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      audioContextRef.current = audioContext;

      // Create sources for both streams
      const displaySource = audioContext.createMediaStreamSource(displayStream);
      const micSource = audioContext.createMediaStreamSource(micStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const buffer = downsampleBuffer(
          inputBuffer,
          audioContext.sampleRate,
          16000,
        );
        wsRef.current.send(buffer);
      };

      // Connect both audio sources to the processor
      displaySource.connect(processor);
      micSource.connect(processor);
      processor.connect(audioContext.destination);

      // Display the screen share in the video element
      if (videoRef.current) {
        videoRef.current.srcObject = displayStream;
        videoRef.current.play().catch((err) => {
          console.warn("Video play failed", err);
        });
      }

      setIsScreenSharing(true);
      setStatus("Screen sharing & listening…");

      // Handle when user stops screen share from browser UI
      displayStream.getTracks().forEach((track) => {
        track.onended = () => {
          void stopScreenShare();
        };
      });
    } catch (error) {
      if (error.name === "NotAllowedError") {
        setStatus("Screen share or microphone access cancelled");
      } else if (error.name === "NotFoundError") {
        setStatus("No screen or microphone available");
      } else {
        console.error("Unable to start screen share", error);
        setStatus("Unable to start screen share");
      }
      setIsScreenSharing(false);
    }
  }

  async function stopScreenShare() {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (err) {
        console.warn("Audio context close failed", err);
      }
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
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

    setIsScreenSharing(false);
    setStatus("Screen share stopped");
  }

  async function toggleScreenShare() {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }

  useEffect(() => {
    return () => {
      void stopScreenShare();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor(
        (Date.now() - startTimeRef.current) / 1000,
      );

      setTimer(elapsedSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
                {interview.candidate_name}
              </span>
              <span className="text-sm text-neutral-400">
                {interview.candidate_role}
              </span>
            </div>
            <div className={flex.col}>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">
                Interviewer
              </span>
              <span className="text-2xl font-bold text-neutral-800">
                {interview.interviewer_name}
              </span>
              <span className="text-sm text-neutral-400">
                {interview.interviewer_role}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className={`${flex.row} gap-4`}>
            <button
              className={button.primary}
              onClick={() =>
                interview.cv_url && window.open(interview.cv_url, "_blank")
              }
            >
              View Resume
            </button>
            <button
              className={`${button.outline} ${isScreenSharing ? "bg-sky-100 text-sky-800 hover:bg-sky-200" : ""}`}
              onClick={() => void toggleScreenShare()}
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
            <div className="flex-1 overflow-y-auto px-6 py-3 scrollbar-primary">
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
          {/* Live Assessment */}
          <div className={`${card.base} shrink-0`}>
            <h2 className="text-base font-semibold text-neutral-800 mb-5">
              Live Assessment
            </h2>
            <div className={`${flex.col} gap-4`}>
              {scores.map((s) => (
                <ScoreBar key={s.label} label={s.label} score={s.score} />
              ))}
            </div>
          </div>

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
            <button className="flex-1 py-4 text-base font-semibold text-white bg-coral-400 hover:bg-coral-500 rounded-2xl transition-colors">
              Pause
            </button>
            <button
              onClick={() => navigate(`/jobs/${id}`)}
              className="flex-1 py-4 text-base font-semibold text-neutral-700 bg-mint-400 hover:bg-mint-500 rounded-2xl transition-colors"
            >
              Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
