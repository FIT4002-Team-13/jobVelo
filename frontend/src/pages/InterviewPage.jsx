import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex, card, button, badge, modal } from "../styles/layout";
import { useAuth } from "../lib/AuthContext.jsx";
import { authedFetch } from "../lib/api.js";

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


const INITIAL_TRANSCRIPT = [];

const MOCK_SCORES = [
  { label: "Communication", score: 7.0 },
  { label: "Skill", score: 7.0 },
  { label: "Problem Solving", score: 7.0 },
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

function normaliseQuestion(question, index = 0, isFollowUp = false, isNew = false) {
  const isTechnical = question.category === "technical";

  return {
    id: `${Date.now()}-${index}-${Math.random()}`,
    category: isTechnical ? "Technical" : "Behavioural",
    categoryValue: isTechnical ? "technical" : "behavioural",
    categoryColor: isTechnical
      ? "bg-mint-100 text-mint-700"
      : "bg-sky-100 text-sky-700",
    text: question.question,
    why: question.reason,
    isFollowUp,
    isNew,
  };
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

function TranscriptEntry({ entry, highlighted }) {
  return (
    <div
      id={`transcript-entry-${entry.id}`}
      className={`${flex.row} gap-3 py-2 group rounded-lg transition-colors ${
        highlighted ? "bg-coral-50 ring-1 ring-coral-200" : ""
      }`}
    >
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

// ── Post-interview report modal ──────────────────────────────────────────────

function ScoreDonut({ value }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 10));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="9"
          className="stroke-neutral-100"
        />
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className="stroke-primary-500 transition-all duration-700"
        />
      </svg>
      <div className={`absolute inset-0 ${flex.colCenter}`}>
        <span className="text-2xl font-extrabold leading-none text-neutral-800">
          {value.toFixed(1)}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Overall
        </span>
      </div>
    </div>
  );
}

// One strengths/improvements card. `tone` picks the tinted palette so the
// pair reads like the report cards on the candidate detail page.
function FeedbackListCard({ title, section, tone }) {
  const palette =
    tone === "mint"
      ? { bg: "bg-mint-50", heading: "text-mint-700" }
      : { bg: "bg-coral-50", heading: "text-coral-600" };
  const items = section?.items ?? [];
  return (
    <div className={`rounded-2xl p-4 ${palette.bg}`}>
      <h4 className={`mb-2 text-xs font-bold uppercase tracking-wide ${palette.heading}`}>
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs italic text-neutral-400">Nothing noted.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-neutral-800">
          {items.map((item, i) => (
            <li key={`${item}-${i}`}>{item}</li>
          ))}
        </ul>
      )}
      {section?.justification && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          {section.justification}
        </p>
      )}
    </div>
  );
}

function ReportBody({ report, scores }) {
  const scoreRows = scores
    ? [
        { label: "Communication", score: scores.communication },
        { label: "Skill", score: scores.skill },
        { label: "Problem Solving", score: scores.problem_solving },
      ]
    : null;
  const overall = scoreRows
    ? scoreRows.reduce((sum, r) => sum + r.score, 0) / scoreRows.length
    : null;

  return (
    <div className={`${flex.col} gap-4`}>
      {/* Result card - candidate tab only (the interviewer isn't rated). */}
      {scoreRows && (
        <div className="rounded-2xl border border-neutral-200 p-5">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
            Result
          </h4>
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

      <div className="grid grid-cols-2 gap-4">
        <FeedbackListCard title="Strengths" section={report?.strengths} tone="mint" />
        <FeedbackListCard title="Improvements" section={report?.improvements} tone="coral" />
      </div>

      <div className="rounded-2xl bg-neutral-50 p-4">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Summary
        </h4>
        <p className="text-sm leading-relaxed text-neutral-800">
          {report?.summary || "No summary generated."}
        </p>
      </div>
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
      isActive
        ? "bg-primary-500 text-white"
        : "bg-primary-100 text-primary-500 hover:bg-primary-200"
    }`;

  const isCandidateTab = activeTab === "candidate";
  const headerName = isCandidateTab ? candidateName || "Candidate" : interviewerName || "Interviewer";
  const headerRole = isCandidateTab ? candidateRole || "" : "Interviewer";

  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} scrollbar-primary max-w-xl max-h-[92vh] overflow-y-auto`}>
        {phase === "generating" && (
          <div className={`${flex.colCenter} gap-3 py-16 text-center`}>
            <svg
              className="h-9 w-9 animate-spin text-primary-500"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
            <p className="text-base font-semibold text-neutral-700">
              Generating interview report…
            </p>
            <p className="text-sm text-neutral-400">
              Analysing the transcript. This usually takes a few seconds.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className={`${flex.colCenter} gap-3 py-16 text-center`}>
            <p className="text-base font-semibold text-coral-500">
              Report generation failed.
            </p>
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
            {/* Header: who this report is about + report switcher */}
            <div className={`${flex.colCenter} gap-2 pt-2`}>
              <div
                className={`h-16 w-16 rounded-pill ${flex.rowCenter} text-xl font-bold text-white ${avatarColor(headerName)}`}
              >
                {initials(headerName)}
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-neutral-800">{headerName}</h2>
                {headerRole && <p className="text-sm text-neutral-400">{headerRole}</p>}
              </div>
              <div className={`${flex.row} gap-3 pt-1`}>
                <button
                  type="button"
                  onClick={() => setActiveTab("candidate")}
                  className={tabClass(isCandidateTab)}
                >
                  CANDIDATE
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("interviewer")}
                  className={tabClass(!isCandidateTab)}
                >
                  INTERVIEWER
                </button>
              </div>
            </div>

            {isCandidateTab ? (
              <ReportBody report={data.candidate_report} scores={data.scores} />
            ) : (
              <ReportBody report={data.interviewer_report} scores={null} />
            )}

            <div className={`${flex.row} gap-3 pt-1`}>
              <button
                type="button"
                onClick={onClose}
                className={`${button.cancel} flex-1 py-2.5`}
              >
                Back
              </button>
              <button
                type="button"
                onClick={onDone}
                className={`${button.primary} flex-1`}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionCard({ q, onMoreLike, onIgnore, isGeneratingSimilar }) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div
      className={`${flex.col} gap-3 bg-neutral-0 border border-neutral-200 rounded-2xl p-4 w-[280px] h-[345px] shrink-0 overflow-y-auto scrollbar-hide ${
        q.isNew ? "new-question-glow" : ""
      }`}
    >
      <div className={`${flex.rowBetween}`}>

        <div className={`${flex.row} gap-2`}>
          <span className={`${badge.sm} ${q.categoryColor}`}>{q.category}</span>
          {q.isFollowUp && (
            <span className="rounded-pill bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
              Follow-up
            </span>
          )}
        </div>

        <div className={`${flex.row} gap-2 text-neutral-400`}>
          <button className="hover:text-mint-500 transition-colors py-1">
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
      <p className="text-sm text-neutral-700 leading-snug">{q.text}</p>
      <div className={`${flex.col} gap-1.5`}>
        <button
          onClick={() => onIgnore?.(q)}
          className={`${button.danger} w-full py-1 text-xs font-semibold rounded-lg`}
        >
          Ignore
        </button>
        <button onClick={() => onMoreLike(q)} disabled={isGeneratingSimilar} className="w-full py-1 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors">
          {isGeneratingSimilar ? "Generating..." : "More like this"}
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

// A live nudge for a question the interviewer just asked, not a suggestion
// for what to ask next (that's QuestionCard/Suggested Questions) — kept
// visually distinct (coral, dismissible, stacked) so the two don't blur.
function BiasWarningBanner({warning, onDismiss, onJumpTo, isLatest}) {
  const [expanded, setExpanded] = useState(isLatest);

  useEffect(() => {setExpanded(isLatest)}, [isLatest]);

  return (
    <div className="flex shrink-0 items-start gap-3 bg-coral-50 border border-coral-200 rounded-xl px-4 py-3">
      <svg
        className="shrink-0 text-coral-500 mt-0.5"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Collapse bias warning" : "Expand bias warning"
          }
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <p className="text-sm font-semibold text-coral-700">
            Possibly biased question
            {warning.category ? ` — ${warning.category}` : ""}
          </p>

          <svg
            className={`shrink-0 text-coral-500 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {expanded && (
          <>
            <button
              onClick={onJumpTo}
              className="text-xs text-coral-600 italic mt-0.5 text-left hover:underline"
              title="Jump to this line in the transcript"
            >
              &ldquo;{warning.quote}&rdquo;
            </button>

            {warning.reason && (
              <p className="text-xs text-coral-700 mt-1">
                {warning.reason}
              </p>
            )}

            {warning.suggestion && (
              <p className="text-xs text-neutral-600 mt-1">
                <span className="font-medium">Try instead:</span>{" "}
                {warning.suggestion}
              </p>
            )}
          </>
        )}
      </div>


      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-coral-400 hover:text-coral-700 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [transcriptVisible, setTranscriptVisible] = useState(true);
  // Status text used to render under the timer — the header no longer
  // shows it, but we still call setStatus in various places (screen-share
  // lifecycle, ws events, complete) so log/dev tooling can trace state.
  const [, setStatus] = useState("Ready to start screen share");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const { user } = useAuth();
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [cvUrl, setCvUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [candId, setCandId] = useState(null);
  // Post-interview report popup: idle -> generating -> ready | error.
  const [reportState, setReportState] = useState({ phase: "idle" });
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [scores] = useState(MOCK_SCORES);
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState("");
  const [similarQuestionId, setSimilarQuestionId] = useState(null);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [, setFollowUpLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  // Live bias nudges for questions the interviewer just asked. Capped at 3
  // and independently dismissible - Deepgram can finalize two flaggable
  // segments close together, so a single "latest only" slot would silently
  // drop the first one before it's read.
  const [biasWarnings, setBiasWarnings] = useState([]);
  const [highlightedEntryId, setHighlightedEntryId] = useState(null);

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
  const questionsRequestedJobRef = useRef(null);
  const questionsRef = useRef([]);
  const pendingCategoriesRef = useRef([]);
  const displayedQuestions = [...followUpQuestions, ...questions].slice(0, 6);
  const pendingCandidateResponseRef = useRef("");
  const followUpTimerRef = useRef(null);
  const followUpGeneratingRef = useRef(false);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

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

    const isCandidate = speaker === (candidateName || "Candidate");

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

    // US19: generate follow-up questions from the candidate's
    // completed response.
    if (isCandidate && text?.trim()) {
      pendingCandidateResponseRef.current = [
        pendingCandidateResponseRef.current,
        text.trim(),
        ]
          .filter(Boolean)
          .join(" ");
      }
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

    // US19: reset the silence timer whenever the candidate is still speaking.
    if (isCandidate && text?.trim()) {
      if (followUpTimerRef.current) {
        clearTimeout(followUpTimerRef.current);
      }

      followUpTimerRef.current = setTimeout(() => {
        const candidateResponse =
          pendingCandidateResponseRef.current.trim();

        if (
          !candidateResponse ||
          followUpGeneratingRef.current
        ) {
          return;
        }

        pendingCandidateResponseRef.current = "";

        void generateFollowUpQuestions(candidateResponse);
      }, 2000);
    }
  }

  function addBiasWarning(warning) {
    setBiasWarnings((prev) =>
      [...prev, { ...warning, id: `bias-${Date.now()}-${Math.random()}` }].slice(-3)
    );
  }

  function dismissBiasWarning(warningId) {
    setBiasWarnings((prev) => prev.filter((w) => w.id !== warningId));
  }

  // There's no shared id between backend transcript messages and frontend
  // transcript entries - matching on the echoed quote text against the
  // interviewer's own lines is the cheapest correct way to find "where did
  // I just say that" without adding new backend state.
  function jumpToTranscriptEntry(quote) {
    const interviewerLabel = user?.full_name || "Interviewer";
    const match = [...transcriptRef.current]
      .reverse()
      .find((entry) => entry.speaker === interviewerLabel && entry.text === quote);
    if (!match) return;

    document
      .getElementById(`transcript-entry-${match.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedEntryId(match.id);
    setTimeout(() => setHighlightedEntryId((cur) => (cur === match.id ? null : cur)), 3000);
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

  function createTranscriptionSocket(speaker, partialRef, role) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/realtime/transcribe?role=${role}`
    );
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
      // Mic socket — always created. Tagged role="interviewer" so the
      // backend knows this connection carries the interviewer's own speech
      // and can run bias-checks on it (never on the candidate/display side).
      wsRef.current = createTranscriptionSocket(interviewerLabel, partialEntryRef, "interviewer");
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
        videoRef.current.play().catch((err) => {
          console.warn("Video play failed", err);
        });
      }

      setIsScreenSharing(true);
      setStatus(
        displayStream.getAudioTracks().length > 0
          ? "Screen sharing & listening (interviewer + candidate)…"
          : "Screen sharing & listening (interviewer mic only)…"
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
    authedFetch(`/api/interviews/${id}`)
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

        // These two endpoints are tenant-scoped (JWT required) - a bare
        // fetch() got a silent 401 here, which left the header name/role
        // blank and the report popup without the candidate's name.
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
      })
      .catch((err) => {
        console.error("Failed to load interview:", err);
        setStatus("Failed to load interview");
      });
  }, [id]);

  useEffect(() => {
    // Never (re)generate suggestions for a finished interview - reopening a
    // completed transcript was silently firing a fresh OpenAI run per visit.
    // isCompleted lands in the same state batch as jobId, so this effect
    // sees the final value on first run.
    if (!jobId || isCompleted || questionsRequestedJobRef.current === jobId) {
      return;
    }

    questionsRequestedJobRef.current = jobId;
    setQuestionsLoading(true);
    setQuestionsError("");

    fetch(`/api/interview-questions/${jobId}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Question generation failed");
        }

        return data;
      })
      .then((data) => {
        // Interleave so the list alternates behavioural / technical / behavioural / ...
        // If one category runs out, the rest of the other category is appended at the end.
        const behavioural = data.questions.filter((q) => q.category === "behavioural");
        const technical = data.questions.filter((q) => q.category === "technical");
        const interleaved = [];
        const maxLen = Math.max(behavioural.length, technical.length);
        for (let i = 0; i < maxLen; i += 1) {
          if (behavioural[i]) interleaved.push(behavioural[i]);
          if (technical[i]) interleaved.push(technical[i]);
        }
        setQuestions(
          interleaved.map((question, index) =>
            normaliseQuestion(question, index)
          )
        );
      })
      .catch((error) => {
        console.error("Question generation failed", error);
        setQuestionsError(error.message || "Unable to generate questions");
      })
      .finally(() => {setQuestionsLoading(false);});
  }, [jobId, isCompleted]);

  async function generateMoreLike(question) {
    if (!jobId || similarQuestionId) {
      return;
    }

    setSimilarQuestionId(question.id);
    setQuestionsError("");

    try {
      const response = await fetch(
        `/api/interview-questions/${jobId}/similar`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            original_question: question.text,
            category: question.categoryValue,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Similar question generation failed"
        );
      }

      const similarQuestion = normaliseQuestion(data, 0, false, true);

      setQuestions((current) => [
        similarQuestion,
        ...current,
      ].slice(0, 6));
    } catch (error) {
      console.error("Similar question generation failed", error);
      setQuestionsError(
        error.message || "Unable to generate a similar question"
      );
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

      const response = await fetch(
        `/api/interview-questions/${jobId}/follow-up`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            candidate_response: candidateResponse.trim(),
            interview_context: recentContext,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Follow-up question generation failed"
        );
      }

      const newFollowUps = (data.questions || [])
        .slice(0, 2)
        .map((question, index) =>
          normaliseQuestion(question, index, true, true),
        );

      setFollowUpQuestions((prev) => [
        ...newFollowUps,
        ...prev,
      ].slice(0, 2));

    } catch (error) {
      console.error("Follow-up question generation failed", error);
    } finally {
      setFollowUpLoading(false);
      followUpGeneratingRef.current = false;
    }
  }

  // Minimum 2 questions, ignore only generate new questions when theres less than 2. 
  const BASE_QUESTION_COUNT = 2;

  async function ignoreQuestion(question) {
    if (!jobId) return;

    // US19: if the question being ignored is a follow-up, remove it from the follow-up list only.
    if (question.isFollowUp) {
      setFollowUpQuestions((current) =>
        current.filter((q) => q.id !== question.id)
      );
      return;
    }

    // Read + update from the ref so a second click in the same tick sees
    // the freshest list (React state hasn't re-rendered yet).
    const remaining = questionsRef.current.filter((q) => q.id !== question.id);
    questionsRef.current = remaining;
    setQuestions(remaining);
    setQuestionsError("");

    if (remaining.length >= BASE_QUESTION_COUNT) return;

    const behInList = remaining.filter(
      (q) => q.categoryValue === "behavioural"
    ).length;
    const techInList = remaining.filter(
      (q) => q.categoryValue === "technical"
    ).length;
    const behPending = pendingCategoriesRef.current.filter(
      (c) => c === "behavioural"
    ).length;
    const techPending = pendingCategoriesRef.current.filter(
      (c) => c === "technical"
    ).length;
    const neededCategory =
      behInList + behPending <= techInList + techPending
        ? "behavioural"
        : "technical";

    pendingCategoriesRef.current = [
      ...pendingCategoriesRef.current,
      neededCategory,
    ];

    try {
      const response = await fetch(
        `/api/interview-questions/${jobId}/similar`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            original_question: question.text,
            category: neededCategory,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Replacement question generation failed"
        );
      }

      const replacement = normaliseQuestion(data, 0, false, true);      
      
      setQuestions((current) => {
        const next = [...current, replacement];
        questionsRef.current = next;
        return next;
      });
    } catch (error) {
      console.error("Ignore replacement failed", error);
      setQuestionsError(
        error.message || "Unable to generate a replacement question"
      );
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


  // Complete = persist the transcript, have the LLM write both reports
  // (candidate + interviewer) and score the candidate, then show them in
  // the popup. Idempotent server-side, so "View Report" after completion
  // re-uses the stored reports instead of a second LLM run.  
  async function completeInterview() {
    if (reportState.phase === "generating") return;

    setReportState({ phase: "generating" });

    try {
      const finalEntries = transcript.filter(
        (entry) => entry.text?.trim() && !String(entry.id).startsWith("partial-")
      );

      const response = await authedFetch(
        `/api/interviews/${id}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcript: finalEntries,
            duration_seconds: timer,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Interview completion failed."
        );
      }

      if (isScreenSharing) void stopScreenShare();
      setIsCompleted(true);
      setStatus("Interview completed");
      localStorage.removeItem(`transcript-${id}`);

      setReportState({phase: "ready", data,});
    } catch (error) {
      setReportState({
        phase: "error",
        error: error.message || "Something went wrong.",
      });
    }
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
          <div className={`${flex.row} gap-4 items-center`}>
            <button
              className={button.primary}
              onClick={() => cvUrl && window.open(cvUrl, "_blank")}
              disabled={!cvUrl}
            >
              View Resume
            </button>
            <button
              className={`${button.outline} ${
                isScreenSharing
                  ? "bg-sky-100 text-sky-800 hover:bg-sky-200"
                  : ""
              } ${isCompleted ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={() => !isCompleted && void toggleScreenShare()}
              disabled={isCompleted}
            >
              {isScreenSharing ? "Stop screen share" : "Share screen"}
            </button>
            <div
              className={`${flex.row} gap-2 items-center text-neutral-700 font-semibold text-xl`}
            >
              <span>{formatTimer(timer)}</span>
              <span className="w-3 h-3 rounded-pill bg-coral-500 animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 ${flex.row} gap-6 p-6 overflow-hidden items-stretch`}
      >
        {/* Left — Live Transcription */}
        <div className={`${card.base} relative isolate flex flex-col w-[48%] overflow-hidden p-0 pt-3`}>
          <div
            className={`${flex.rowBetween} px-6 pt-1 pb-1 border-b border-neutral-100 shrink-0`}
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
          {biasWarnings.length > 0 && (
            <div className={`${flex.col} gap-2 absolute top-12 bottom-0 left-0 right-0 z-50 overflow-y-auto px-6 pt-4 pb-6 scrollbar-primary`}>
              {biasWarnings.map((warning, index) => (
                <BiasWarningBanner
                  key={warning.id}
                  warning={warning}
                  isLatest={index === biasWarnings.length - 1}
                  onDismiss={() => dismissBiasWarning(warning.id)}
                  onJumpTo={() => jumpToTranscriptEntry(warning.quote)}
                />
              ))}
            </div>
          )}
          {transcriptVisible && (
            <div
              className="flex-1 min-h-[200px] overflow-y-auto px-6 py-3 scrollbar-primary scroll-auto"
              ref={transcriptContainerRef}
            >
              {transcript.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center mt-8">
                  Transcription will appear here once the interview starts.
                </p>
              ) : (
                transcript.map((entry) => (
                  <TranscriptEntry
                    key={entry.id}
                    entry={entry}
                    highlighted={entry.id === highlightedEntryId}
                  />
                ))
              )}
            </div>
          )}
          {isScreenSharing && (
            <div className="relative z-0 shrink-0 border-t border-neutral-100 pt-4 px-6 pb-4">
              <p className="text-xs text-neutral-500 mb-2 font-medium">
                Screen Share
              </p>
              <video
                ref={videoRef}
                autoPlay
                muted
                className="relative z-0 w-full h-40 bg-neutral-900 rounded-lg object-cover"
              />
            </div>
          )}
        </div>

        {/* Right — Assessment + Questions + Actions */}
        <div className={`flex-1 ${flex.col} gap-4 overflow-hidden`}>
          {/* Live Assessment */}
          <div className={`${card.base} shrink-0 !py-3`}>
            <h2 className="text-base font-semibold text-neutral-800 mb-2">
              Live Assessment
            </h2>
            <div className={`${flex.col} gap-1.5`}>
              {scores.map((s) => (
                <ScoreBar key={s.label} label={s.label} score={s.score} />
              ))}
            </div>
          </div>

          {/* Suggested Questions */}
          <div className={`${card.flat} flex flex-col flex-1 overflow-hidden`}>
            <div className="px-6 pt-3 pb-1 border-b border-neutral-100 shrink-0">
              <h2 className="text-base font-semibold text-neutral-800">
                Suggested Questions
              </h2>
            </div>
            <div
              className={`flex-1 overflow-x-auto overflow-y-hidden px-6 py-3`}
            >
              {questionsLoading ? (
                <div className={`${flex.rowCenter} h-full`}>
                  <p className="text-sm text-neutral-400">Generating questions...</p>
                </div>
              ) : questionsError && questions.length === 0 ? (
                <div className={`${flex.rowCenter} h-full`}>
                  <p className="text-sm text-coral-500 text-center">{questionsError}</p>
                </div>
              ) : displayedQuestions.length === 0 ? (
                <div className={`${flex.rowCenter} h-full`}>
                  <p className="text-sm text-neutral-400">No suggested questions available.</p>
                </div>
              ) : (
                <div className={`${flex.row} gap-4 h-full items-start`}>
                  {displayedQuestions.map((q) => (
                    <QuestionCard
                      key={q.id}
                      q={q}
                      onMoreLike={generateMoreLike}
                      onIgnore={ignoreQuestion}
                      isGeneratingSimilar={similarQuestionId === q.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pause / Complete */}
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
              {reportState.phase === "generating"
                ? "Generating…"
                : isCompleted
                ? "View Report"
                : "Complete"}
            </button>
          </div>
        </div>
      </div>

      {reportState.phase !== "idle" && (
        <InterviewReportModal
          state={reportState}
          candidateName={candidateName}
          candidateRole={candidateRole}
          interviewerName={user?.full_name}
          onClose={() => setReportState({ phase: "idle" })}
          onDone={() =>
            navigate(
              candId && jobId ? `/candidates/${candId}/${jobId}` : `/jobs/${jobId}`,
              { replace: true }
            )
          }
          onRetry={() => completeInterview()}
        />
      )}
    </div>
  );
}
