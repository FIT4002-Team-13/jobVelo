import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex, card, button, modal } from "../styles/layout";
import { useAuth } from "../lib/AuthContext.jsx";

import ReportSections from "../components/interview/ReportSections.jsx";
import { useToast } from "../components/common/ToastContext.jsx";
import { api, authedFetch } from "../lib/api.js";
import { TranscriptPanel, avatarColor, initials } from "../components/interview/InterviewTranscriptPanel.jsx";
import { normaliseQuestion, SuggestedQuestionDeck } from "../components/interview/InterviewQuestionDeck.jsx";
import { formatTimer, InterviewSectionTimeline } from "../components/interview/InterviewSectionTimers.jsx";
import InterviewPrepPage from "./InterviewPrepPage.jsx";
import InterviewPostInterviewPage from "./InterviewPostInterviewPage.jsx";

const INITIAL_TRANSCRIPT = [];

function parseTimestamp(ts = "") {
  const [m, s] = ts.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
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

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return convertFloat32ToInt16(result);
}

const SCORE_COLORS = {
  Communication: "bg-primary-500",
  Skill: "bg-mint-500",
  "Problem Solving": "bg-sky-400",
};

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
        <div className={`h-full ${color} rounded-pill transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScoreDonut({ value }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 10));

  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="9" className="stroke-neutral-100" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-primary-500 transition-all duration-700"
        />
      </svg>
      <div className={`absolute inset-0 ${flex.colCenter}`}>
        <span className="text-2xl font-extrabold leading-none text-neutral-800">{value.toFixed(1)}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Overall</span>
      </div>
    </div>
  );
}

function ReportBody({ report, scores, showRequirements }) {
  const scoreRows = scores
    ? [
        { label: "Communication", score: scores.communication },
        { label: "Skill", score: scores.skill },
        { label: "Problem Solving", score: scores.problem_solving },
      ]
    : null;
  const overall = scoreRows ? scoreRows.reduce((sum, r) => sum + r.score, 0) / scoreRows.length : null;

  return (
    <div className={`${flex.col} gap-5`}>
      {scoreRows && (
        <div className="rounded-2xl border border-neutral-200 p-5">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">Result</h4>
          <div className={`${flex.row} gap-6`}>
            <ScoreDonut value={overall} />
            <div className={`${flex.col} flex-1 gap-2.5`}>
              {scoreRows.map((s) => (
                <ScoreBar key={s.label} label={s.label} score={s.score} />
              ))}
            </div>
          </div>
        </div>
      )}

      <ReportSections report={report} showRequirements={showRequirements} variant="stack" />
    </div>
  );
}

function InterviewReportModal({
  state,
  candidateName,
  candidateRole,
  interviewerName,
  onClose,
  onDone,
  onRetry,
}) {
  const [activeTab, setActiveTab] = useState("candidate");
  const { phase, data, error } = state;

  const tabClass = (isActive) =>
    `rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${
      isActive ? "bg-primary-500 text-white" : "bg-primary-100 text-primary-500 hover:bg-primary-200"
    }`;

  const isCandidateTab = activeTab === "candidate";
  const headerName = isCandidateTab ? candidateName || "Candidate" : interviewerName || "Interviewer";
  const headerRole = isCandidateTab ? candidateRole || "" : "Interviewer";

  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} scrollbar-primary max-w-xl max-h-[92vh] overflow-y-auto`}>
        {phase === "generating" && (
          <div className={`${flex.colCenter} gap-3 py-16 text-center`}>
            <svg className="h-9 w-9 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
            <p className="text-base font-semibold text-neutral-700">Generating interview report…</p>
            <p className="text-sm text-neutral-400">Analysing the transcript. This usually takes a few seconds.</p>
          </div>
        )}

        {phase === "error" && (
          <div className={`${flex.colCenter} gap-3 py-16 text-center`}>
            <p className="text-base font-semibold text-coral-500">Report generation failed.</p>
            {error && <p className="max-w-sm text-sm text-neutral-500">{error}</p>}
            <div className={`${flex.row} gap-3 pt-2`}>
              <button type="button" onClick={onClose} className={`${button.cancel} px-6 py-2`}>
                Close
              </button>
              <button type="button" onClick={onRetry} className={button.primary}>
                Retry
              </button>
            </div>
          </div>
        )}

        {phase === "ready" && data && (
          <div className={`${flex.col} gap-5`}>
            <div className={`${flex.colCenter} gap-2 pt-2`}>
              <div className={`h-16 w-16 rounded-pill ${flex.rowCenter} text-xl font-bold text-white ${avatarColor(headerName)}`}>
                {initials(headerName)}
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-neutral-800">{headerName}</h2>
                {headerRole && <p className="text-sm text-neutral-400">{headerRole}</p>}
              </div>
              <div className={`${flex.row} gap-3 pt-1`}>
                <button type="button" onClick={() => setActiveTab("candidate")} className={tabClass(isCandidateTab)}>
                  CANDIDATE
                </button>
                <button type="button" onClick={() => setActiveTab("interviewer")} className={tabClass(!isCandidateTab)}>
                  INTERVIEWER
                </button>
              </div>
            </div>

            {isCandidateTab ? (
              <ReportBody report={data.candidate_report} scores={data.scores} showRequirements />
            ) : (
              <ReportBody report={data.interviewer_report} scores={null} showRequirements={false} />
            )}

            <div className={`${flex.row} gap-3 pt-1`}>
              <button type="button" onClick={onClose} className={`${button.cancel} flex-1 py-2.5`}>
                Back
              </button>
              <button type="button" onClick={onDone} className={`${button.primary} flex-1`}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [, setStatus] = useState("Ready to start recording");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [intvStatus, setIntvStatus] = useState(null);
  const [intvDateTime, setIntvDateTime] = useState(null);
  const [cvAnalysis, setCvAnalysis] = useState(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [cvUrl, setCvUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [candId, setCandId] = useState(null);
  const [reportState, setReportState] = useState({ phase: "idle" });
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState("");
  const [similarQuestionId, setSimilarQuestionId] = useState(null);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [, setFollowUpLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [hasNewTranscriptUpdates, setHasNewTranscriptUpdates] = useState(false);
  const [sections, setSections] = useState([]);
  const [sectionStates, setSectionStates] = useState([]);
  const [highlightedEntryIdx, setHighlightedEntryIdx] = useState(null);
  const [biasWarnings, setBiasWarnings] = useState([]);
  const [highlightedEntryId, setHighlightedEntryId] = useState(null);

  const sectionIntervals = useRef([]);
  const sectionsScrollRef = useRef(null);
  const sectionCardRefs = useRef([]);
  const transcriptEntryRefs = useRef([]);
  const biasIncidentsRef = useRef([]);

  const transcriptRef = useRef([]);
  const timerRef = useRef(0);
  const autoStartedRef = useRef(false);
  const accumulatedRef = useRef(0);
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
  const questionsRequestedJobRef = useRef(null);
  const questionsRef = useRef([]);
  const pendingCategoriesRef = useRef([]);
  const pendingCandidateResponseRef = useRef("");
  const followUpTimerRef = useRef(null);
  const followUpGeneratingRef = useRef(false);
  const beginningRef = useRef(false);

  const displayedQuestions = [...followUpQuestions, ...questions].slice(0, 6);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  function syncCounterFromEntries(entries) {
    const maxId = entries.reduce((max, e) => {
      const n = parseInt(e.id, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    entryCounterRef.current = maxId + 1;
  }

  function appendTranscript(text, isFinal, speaker, partialRef) {
    const timestamp = formatTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
    const isCandidate = speaker === (candidateName || "Candidate");

    if (isFinal) {
      const entryId = String(entryCounterRef.current++);
      const prevPartialId = partialRef.current;
      partialRef.current = null;

      const newEntry = { id: entryId, speaker, timestamp, text };
      setTranscript((prev) => {
        const refreshed = prevPartialId ? prev.filter((entry) => entry.id !== prevPartialId) : prev;
        const updated = [...refreshed, newEntry];
        localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));
        return updated;
      });
      setHasNewTranscriptUpdates(true);
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

    if (isCandidate && text?.trim()) {
      pendingCandidateResponseRef.current = [pendingCandidateResponseRef.current, text.trim()].filter(Boolean).join(" ");
    }

    if (isCandidate && text?.trim()) {
      if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = setTimeout(() => {
        const candidateResponse = pendingCandidateResponseRef.current.trim();
        if (!candidateResponse || followUpGeneratingRef.current) return;
        pendingCandidateResponseRef.current = "";
        void generateFollowUpQuestions(candidateResponse);
      }, 2000);
    }
  }

  function addBiasWarning(warning) {
    const timestamp = formatTimer(timerRef.current);
    biasIncidentsRef.current.push({
      quote: warning.quote,
      category: warning.category ?? null,
      reason: warning.reason ?? null,
      suggestion: warning.suggestion ?? null,
      timestamp,
    });
    setBiasWarnings((prev) => [...prev, { ...warning, timestamp, id: `bias-${Date.now()}-${Math.random()}` }].slice(-3));
  }

  function dismissBiasWarning(warningId) {
    setBiasWarnings((prev) => prev.filter((w) => w.id !== warningId));
  }

  function jumpToTranscriptEntry(quote) {
    const interviewerLabel = user?.full_name || "Interviewer";
    const match = [...transcriptRef.current]
      .reverse()
      .find((entry) => entry.speaker === interviewerLabel && entry.text === quote);
    if (!match) return;

    document.getElementById(`transcript-entry-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedEntryId(match.id);
    setTimeout(() => setHighlightedEntryId((cur) => (cur === match.id ? null : cur)), 3000);
  }

  useEffect(() => {
    return () => {
      sectionIntervals.current.forEach((id) => clearInterval(id));
    };
  }, []);

  const activeSectionIndex = sectionStates.findIndex((st) => st.status === "running" || st.status === "paused");

  useEffect(() => {
    if (activeSectionIndex === -1) return;
    const card = sectionCardRefs.current[activeSectionIndex];
    const container = sectionsScrollRef.current;
    if (!card || !container) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const padding = 24;
    container.scrollTo({
      left: container.scrollLeft + cardRect.left - containerRect.left - padding,
      behavior: "smooth",
    });
  }, [activeSectionIndex]);

  function startSection(i) {
    const startAt = timerRef.current;
    setSections((prev) => {
      const updated = prev.map((s, j) => (j === i && s.start_at == null ? { ...s, start_at: startAt } : s));
      fetch(`/api/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intv_sections: updated }),
      }).catch(() => {});
      return updated;
    });

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
    setSectionStates((prev) => prev.map((st, j) => (j === i ? { ...st, status: "paused" } : st)));
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
    setSectionStates((prev) => prev.map((st, j) => (j === i ? { ...st, status: "done" } : st)));
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

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

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
      setStatus(displayStream.getAudioTracks().length > 0 ? "Listening (interviewer + candidate)…" : "Screen shared — no computer audio detected");

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
      if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      wsRef.current = null;
    }

    if (wsDisplayRef.current) {
      if (wsDisplayRef.current.readyState === WebSocket.OPEN) wsDisplayRef.current.close();
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
    } else if (isMicActive) {
      await addDisplayAudio();
    } else {
      await startScreenShare();
    }
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
      setStatus(displayStream.getAudioTracks().length > 0 ? "Listening (interviewer + candidate)…" : "Screen shared — no computer audio detected");

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
      if (isScreenSharing && !isPaused && !isCompleted) {
        const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setTimer(elapsedSeconds);
        accumulatedRef.current = elapsedSeconds;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isScreenSharing, isPaused, isCompleted]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isCompleted && transcriptRef.current.length) {
        authedFetch(`/api/interviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intv_transcript: transcriptRef.current,
            intv_duration_seconds: timerRef.current,
          }),
        }).then((r) => {
          if (!r.ok) console.error("Autosave failed:", r.status);
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [id, isCompleted]);

  function handleNoteChange(entryId, text) {
    setTranscript((prev) => {
      const updated = prev.map((e) => (e.id === entryId ? { ...e, comment: text || undefined } : e));
      localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));

      if (isCompleted) {
        fetch(`/api/interviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intv_transcript: updated }),
        });
      }

      return updated;
    });
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

    authedFetch(`/api/interviews/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const serverTranscript = Array.isArray(data.intv_transcript) ? data.intv_transcript : [];
        const completed = data.intv_status === "completed";

        setIsCompleted(completed);
        setIntvStatus(data.intv_status ?? null);
        setIntvDateTime(data.intv_date_time ?? null);

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
          const priorSeconds = data.intv_duration_seconds ?? 0;
          accumulatedRef.current = priorSeconds;
          timerRef.current = priorSeconds;
          setTimer(priorSeconds);
          if (!autoStartedRef.current) {
            autoStartedRef.current = true;
            startMicOnly().catch(() => {});
          }
        }

        if (data.job_id) {
          setJobId(data.job_id);
          authedFetch(`/api/jobs/${data.job_id}`)
            .then((r) => r.json())
            .then((job) => { if (job.title) setCandidateRole(job.title); })
            .catch((err) => console.error("Failed to load job:", err));
        }

        if (data.cand_id) {
          setCandId(data.cand_id);
          authedFetch(`/api/candidates/${data.cand_id}`)
            .then((r) => r.json())
            .then((cand) => {
              if (cand.cand_full_name) setCandidateName(cand.cand_full_name);
              if (cand.cand_cv_url) setCvUrl(cand.cand_cv_url);
            })
            .catch((err) => console.error("Failed to load candidate:", err));
        }

        if (data.job_id && data.cand_id) {
          if (Array.isArray(data.intv_sections) && data.intv_sections.length > 0) {
            setSections(data.intv_sections);
            setSectionStates(data.intv_sections.map(() => ({ status: "idle", elapsed: 0 })));
            sectionIntervals.current.forEach((intv) => clearInterval(intv));
            sectionIntervals.current = new Array(data.intv_sections.length).fill(null);
            if (!completed) startSection(0);
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
                  sectionIntervals.current.forEach((intv) => clearInterval(intv));
                  sectionIntervals.current = new Array(plan.length).fill(null);
                  if (!completed) startSection(0);
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

        if (data.cand_id && data.job_id && !completed) {
          authedFetch(`/api/job-candidates/by-candidate/${data.cand_id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((links) => {
              const link = Array.isArray(links) ? links.find((l) => l.job_id === data.job_id) : null;
              if (!link?.jobcand_id) return;
              api
                .getCvAnalysisByJobcand(link.jobcand_id)
                .then((a) => {
                  if (a && (a.status === "completed" || a.key_strengths)) {
                    setCvAnalysis(a);
                  }
                })
                .catch(() => {});
            })
            .catch(() => {});
        }
      });
  }, [id]);

  useEffect(() => {
    if (!jobId || isCompleted || intvStatus !== "in_progress" || questionsRequestedJobRef.current === jobId) {
      return;
    }

    questionsRequestedJobRef.current = jobId;
    setQuestionsLoading(true);
    setQuestionsError("");

    authedFetch(`/api/interview-questions/${jobId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Question generation failed");
        return data;
      })
      .then((data) => {
        const behavioural = data.questions.filter((q) => q.category === "behavioural");
        const technical = data.questions.filter((q) => q.category === "technical");
        const interleaved = [];
        const maxLen = Math.max(behavioural.length, technical.length);
        for (let i = 0; i < maxLen; i += 1) {
          if (behavioural[i]) interleaved.push(behavioural[i]);
          if (technical[i]) interleaved.push(technical[i]);
        }
        setQuestions(interleaved.map((question, index) => normaliseQuestion(question, index)));
      })
      .catch((error) => {
        console.error("Question generation failed", error);
        setQuestionsError(error.message || "Unable to generate questions");
      })
      .finally(() => setQuestionsLoading(false));
  }, [jobId, isCompleted, intvStatus]);

  async function generateMoreLike(question) {
    if (!jobId || similarQuestionId) return;

    setSimilarQuestionId(question.id);
    setQuestionsError("");

    try {
      const response = await authedFetch(`/api/interview-questions/${jobId}/similar`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_question: question.text,
          category: question.categoryValue,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Similar question generation failed");

      const similarQuestion = normaliseQuestion(data, 0, false, true);
      setQuestions((current) => [similarQuestion, ...current].slice(0, 6));
    } catch (error) {
      console.error("Similar question generation failed", error);
      setQuestionsError(error.message || "Unable to generate a similar question");
    } finally {
      setSimilarQuestionId(null);
    }
  }

  async function generateFollowUpQuestions(candidateResponse) {
    if (!jobId || !candidateResponse?.trim() || followUpGeneratingRef.current) return;

    followUpGeneratingRef.current = true;
    setFollowUpLoading(true);

    try {
      const recentContext = transcript
        .filter((entry) => entry.text)
        .slice(-8)
        .map((entry) => `${entry.speaker}: ${entry.text}`)
        .join("\n");

      const response = await authedFetch(`/api/interview-questions/${jobId}/follow-up`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          candidate_response: candidateResponse.trim(),
          interview_context: recentContext,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Follow-up question generation failed");

      const newFollowUps = (data.questions || []).slice(0, 2).map((question, index) => normaliseQuestion(question, index, true, true));
      setFollowUpQuestions((prev) => [...newFollowUps, ...prev].slice(0, 2));
    } catch (error) {
      console.error("Follow-up question generation failed", error);
    } finally {
      setFollowUpLoading(false);
      followUpGeneratingRef.current = false;
    }
  }

  const BASE_QUESTION_COUNT = 2;

  async function ignoreQuestion(question) {
    if (!jobId) return;

    if (question.isFollowUp) {
      setFollowUpQuestions((current) => current.filter((q) => q.id !== question.id));
      return;
    }

    const remaining = questionsRef.current.filter((q) => q.id !== question.id);
    questionsRef.current = remaining;
    setQuestions(remaining);
    setQuestionsError("");

    if (remaining.length >= BASE_QUESTION_COUNT) return;

    const behInList = remaining.filter((q) => q.categoryValue === "behavioural").length;
    const techInList = remaining.filter((q) => q.categoryValue === "technical").length;
    const behPending = pendingCategoriesRef.current.filter((c) => c === "behavioural").length;
    const techPending = pendingCategoriesRef.current.filter((c) => c === "technical").length;
    const neededCategory = behInList + behPending <= techInList + techPending ? "behavioural" : "technical";

    pendingCategoriesRef.current = [...pendingCategoriesRef.current, neededCategory];

    try {
      const response = await authedFetch(`/api/interview-questions/${jobId}/similar`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_question: question.text,
          category: neededCategory,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Replacement question generation failed");

      const replacement = normaliseQuestion(data, 0, false, true);
      setQuestions((current) => {
        const next = [...current, replacement];
        questionsRef.current = next;
        return next;
      });
    } catch (error) {
      console.error("Ignore replacement failed", error);
      setQuestionsError(error.message || "Unable to generate a replacement question");
    } finally {
      const idx = pendingCategoriesRef.current.indexOf(neededCategory);
      if (idx !== -1) {
        pendingCategoriesRef.current = [
          ...pendingCategoriesRef.current.slice(0, idx),
          ...pendingCategoriesRef.current.slice(idx + 1),
        ];
      }
    }
  }

  function jumpToSection(sectionIndex) {
    const section = sections[sectionIndex];
    const startSeconds =
      section?.start_at != null
        ? section.start_at
        : sections.slice(0, sectionIndex).reduce((sum, s) => sum + (s.suggested_minutes || 0) * 60, 0);

    let targetIdx = transcript.findIndex((entry) => parseTimestamp(entry.timestamp) >= startSeconds);
    if (targetIdx === -1) targetIdx = transcript.length - 1;
    if (targetIdx < 0) return;

    const el = transcriptEntryRefs.current[targetIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });

    setHighlightedEntryIdx(targetIdx);
    setTimeout(() => setHighlightedEntryIdx(null), 2000);
  }

  async function beginInterview() {
    if (beginningRef.current) return;
    beginningRef.current = true;
    try {
      const res = await authedFetch(`/api/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intv_status: "in_progress" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.detail === "string" ? data.detail : "Failed to start the interview.");
      }
      setIntvStatus("in_progress");
    } catch (err) {
      toast.error(err.message || "Failed to start the interview.");
    } finally {
      beginningRef.current = false;
    }
  }

  async function completeInterview() {
    if (reportState.phase === "generating") return;

    setReportState({ phase: "generating" });
    try {
      const finalEntries = transcript.filter((e) => !String(e.id).startsWith("partial-"));
      const res = await authedFetch(`/api/interviews/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalEntries,
          duration_seconds: timer,
          bias_incidents: biasIncidentsRef.current,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === "string" ? detail : "Report generation failed.");
      }

      if (isScreenSharing) void stopScreenShare();
      setIsCompleted(true);
      setStatus("Interview completed");
      localStorage.removeItem(`transcript-${id}`);
      setReportState({ phase: "ready", data });
    } catch (err) {
      setReportState({ phase: "error", error: err.message || "Something went wrong." });
    }
  }

  function showLatestTranscript() {
    transcriptContainerRef.current?.scrollTo({
      top: transcriptContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
    setHasNewTranscriptUpdates(false);
  }

  const phase = isCompleted ? "debrief" : intvStatus === "scheduled" || intvStatus === "not_scheduled" ? "prep" : "live";

  return (
    <div className="h-screen flex flex-col bg-neutral-50 font-sans overflow-hidden">
      <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-4 shrink-0">
        <div className={`${flex.rowBetween}`}>
          <div className={`${flex.row} gap-16`}>
            <div className={flex.col}>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Candidate</span>
              <span className="text-2xl font-bold text-neutral-800">{candidateName || "—"}</span>
              <span className="text-sm text-neutral-400">{candidateRole || "—"}</span>
            </div>
            <div className={flex.col}>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Interviewer</span>
              <span className="text-2xl font-bold text-neutral-800">{user?.full_name || "—"}</span>
              <span className="text-sm text-neutral-400">{user?.role || "—"}</span>
            </div>
          </div>

          <div className={`${flex.row} gap-4 items-center`}>
            <button className={button.primary} onClick={() => cvUrl && window.open(cvUrl, "_blank")} disabled={!cvUrl}>
              View Resume
            </button>
            {phase !== "prep" && (
              <button
                className={`${button.outline} ${isScreenSharing ? "bg-sky-100 text-sky-800 hover:bg-sky-200" : ""} ${isCompleted ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => !isCompleted && void toggleScreenShare()}
                disabled={isCompleted}
              >
                {isScreenSharing ? "Stop screen share" : "Share screen"}
              </button>
            )}
            {phase !== "prep" && (
              <div className={`${flex.row} gap-2 items-center text-neutral-700 font-semibold text-xl`}>
                <span>{formatTimer(timer)}</span>
                <span className={`w-3 h-3 rounded-pill ${isScreenSharing && !isPaused && !isCompleted ? "bg-coral-500 animate-pulse" : "bg-neutral-300"}`} />
              </div>
            )}
          </div>
        </div>
      </header>

      {phase === "prep" ? (
        <InterviewPrepPage
          analysis={cvAnalysis}
          scheduledLabel={
            intvDateTime
              ? new Date(intvDateTime).toLocaleString("en-AU", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : null
          }
          onBegin={beginInterview}
          onViewFullAnalysis={cvAnalysis?.jobcand_id ? () => navigate(`/cv-analysis/${cvAnalysis.jobcand_id}`) : null}
        />
      ) : phase === "debrief" ? (
        <InterviewPostInterviewPage
          transcript={transcript}
          transcriptEntryRefs={transcriptEntryRefs}
          highlightedEntryIdx={highlightedEntryIdx}
          highlightedEntryId={highlightedEntryId}
          onNoteChange={handleNoteChange}
          onViewReport={() => setReportState({ phase: "ready", data: reportState.data ?? null })}
          onBack={() => navigate(candId && jobId ? `/candidates/${candId}/${jobId}` : `/jobs/${jobId}`, { replace: true })}
          candId={candId}
          jobId={jobId}
        />
      ) : (
        <div className={`flex-1 ${flex.row} gap-6 p-6 overflow-hidden items-stretch`}>
          <TranscriptPanel
            transcript={transcript}
            transcriptVisible={transcriptVisible}
            setTranscriptVisible={setTranscriptVisible}
            hasNewTranscriptUpdates={hasNewTranscriptUpdates}
            showLatestTranscript={showLatestTranscript}
            onNoteChange={handleNoteChange}
            highlightedEntryIdx={highlightedEntryIdx}
            highlightedEntryId={highlightedEntryId}
            transcriptContainerRef={transcriptContainerRef}
            transcriptEntryRefs={transcriptEntryRefs}
            biasWarnings={biasWarnings}
            dismissBiasWarning={dismissBiasWarning}
            jumpToTranscriptEntry={jumpToTranscriptEntry}
            isScreenSharing={isScreenSharing}
            videoRef={videoRef}
          />

          <div className={`flex-1 ${flex.col} gap-4 overflow-hidden`}>
            {sections.length > 0 && (
              <InterviewSectionTimeline
                sections={sections}
                sectionStates={sectionStates}
                isCompleted={isCompleted}
                isMicActive={isMicActive}
                sectionsScrollRef={sectionsScrollRef}
                sectionCardRefs={sectionCardRefs}
                jumpToSection={jumpToSection}
                startSection={startSection}
                pauseSection={pauseSection}
                resumeSection={resumeSection}
                doneSection={doneSection}
              />
            )}

            <SuggestedQuestionDeck
              questions={questions}
              questionsLoading={questionsLoading}
              questionsError={questionsError}
              displayedQuestions={displayedQuestions}
              similarQuestionId={similarQuestionId}
              onMoreLike={generateMoreLike}
              onIgnore={ignoreQuestion}
            />

            <div className={`${flex.row} gap-4 shrink-0`}>
              <button
                onClick={() => !isCompleted && togglePause()}
                disabled={isCompleted}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
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
                disabled={reportState.phase === "generating"}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
                  reportState.phase === "generating"
                    ? "bg-neutral-300 text-neutral-500 cursor-wait"
                    : isCompleted
                    ? "text-white bg-primary-500 hover:bg-primary-600"
                    : "text-white bg-sky-300 hover:bg-sky-400"
                }`}
              >
                {reportState.phase === "generating" ? "Generating…" : isCompleted ? "View Report" : "Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportState.phase !== "idle" && (
        <InterviewReportModal
          state={reportState}
          candidateName={candidateName}
          candidateRole={candidateRole}
          interviewerName={user?.full_name}
          onClose={() => setReportState({ phase: "idle" })}
          onDone={() => navigate(candId && jobId ? `/candidates/${candId}/${jobId}` : `/jobs/${jobId}`, { replace: true })}
          onRetry={() => completeInterview()}
        />
      )}
    </div>
  );
}
