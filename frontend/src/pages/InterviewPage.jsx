import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex, card, button, badge, modal } from "../styles/layout";
import { useAuth } from "../lib/AuthContext.jsx";
import { useToast } from "../components/common/ToastContext.jsx";
import { api, authedFetch } from "../lib/api.js";

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
  { border: "border-primary-200", activeBorder: "border-primary-300", ring: "ring-primary-100", badge: "bg-primary-100 text-primary-700", pauseBg: "bg-primary-100 hover:bg-primary-200 text-primary-600", timer: "text-primary-600" },
  { border: "border-sky-200",     activeBorder: "border-sky-300",     ring: "ring-sky-100",     badge: "bg-sky-100 text-sky-700",         pauseBg: "bg-sky-100 hover:bg-sky-200 text-sky-600",           timer: "text-sky-600"     },
  { border: "border-mint-200",    activeBorder: "border-mint-300",    ring: "ring-mint-100",    badge: "bg-mint-100 text-mint-700",       pauseBg: "bg-mint-100 hover:bg-mint-200 text-mint-600",        timer: "text-mint-600"    },
  { border: "border-coral-200",   activeBorder: "border-coral-300",   ring: "ring-coral-100",   badge: "bg-coral-100 text-coral-700",     pauseBg: "bg-coral-100 hover:bg-coral-200 text-coral-600",     timer: "text-coral-600"   },
];

// ── Placeholder data — replace with API calls when endpoints are ready ─────────


const INITIAL_TRANSCRIPT = [];


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

// Body of the dedicated BIAS tab. No header/badge of its own - the tab pill
// and modal header already say what this is - so it's just the empty state or
// the list of flagged questions. Its own scroll region keeps a long list from
// growing the whole modal.
function BiasTabBody({ incidents }) {
  const list = Array.isArray(incidents) ? incidents : [];

  if (list.length === 0) {
    return (
      <div className={`${flex.colCenter} gap-2 rounded-2xl bg-mint-50 px-6 py-12 text-center`}>
        <svg
          width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-mint-500"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <p className="text-sm font-bold text-mint-700">No bias flagged</p>
        <p className="max-w-xs text-sm leading-relaxed text-neutral-500">
          No potentially biased or legally-risky questions were detected during this
          interview.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-primary flex max-h-[52vh] flex-col gap-2.5 overflow-y-auto pr-1">
      {list.map((incident, index) => (
        <div
          key={index}
          className="rounded-xl border-l-[3px] border-amber-400 bg-amber-50/60 py-2.5 pl-4 pr-3"
        >
          <div className={`${flex.rowBetween} gap-2`}>
            {incident.category && (
              <span className="rounded-pill bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                {incident.category}
              </span>
            )}
            {incident.timestamp && (
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-400">
                {incident.timestamp}
              </span>
            )}
          </div>
          <p className="mt-1.5 break-words text-sm italic leading-relaxed text-neutral-700">
            &ldquo;{incident.quote}&rdquo;
          </p>
          {incident.reason && (
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{incident.reason}</p>
          )}
          {incident.suggestion && (
            <p className="mt-1.5 text-xs leading-relaxed text-mint-700">
              <span className="font-semibold">Try instead:</span> {incident.suggestion}
            </p>
          )}
        </div>
      ))}
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
  const isBiasTab = activeTab === "bias";
  const biasCount = (data?.bias_incidents ?? []).length;
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
            {/* Header: who/what this report is about + report switcher */}
            <div className={`${flex.colCenter} gap-2 pt-2`}>
              {isBiasTab ? (
                <div className={`h-16 w-16 rounded-pill ${flex.rowCenter} bg-amber-100 text-amber-600`}>
                  <svg
                    width="30" height="30" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              ) : (
                <div
                  className={`h-16 w-16 rounded-pill ${flex.rowCenter} text-xl font-bold text-white ${avatarColor(headerName)}`}
                >
                  {initials(headerName)}
                </div>
              )}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-neutral-800">
                  {isBiasTab ? "Bias & Compliance" : headerName}
                </h2>
                <p className="text-sm text-neutral-400">
                  {isBiasTab ? "Questions flagged during the interview" : headerRole}
                </p>
              </div>
              <div className={`${flex.row} gap-2 pt-1`}>
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
                  className={tabClass(activeTab === "interviewer")}
                >
                  INTERVIEWER
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("bias")}
                  className={`rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${flex.row} items-center gap-1.5 ${
                    isBiasTab
                      ? "bg-amber-500 text-white"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  BIAS
                  {biasCount > 0 && (
                    <span
                      className={`rounded-pill px-1.5 text-[10px] font-bold leading-4 ${
                        isBiasTab ? "bg-white/30 text-white" : "bg-amber-500 text-white"
                      }`}
                    >
                      {biasCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {isCandidateTab ? (
              <ReportBody report={data.candidate_report} scores={data.scores} />
            ) : isBiasTab ? (
              <BiasTabBody incidents={data.bias_incidents} />
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

// A single suggested question card in the horizontal strip. It stretches to
// the strip's height (items-stretch on the row) rather than a fixed 345px,
// so it never gets clipped; the question scrolls internally if very long and
// the actions stay pinned at the bottom. Readability bumps: larger question
// text, roomier spacing.
function QuestionCard({ q, onMoreLike, onIgnore, isGeneratingSimilar }) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div className="flex w-[290px] shrink-0 flex-col rounded-2xl border border-neutral-200 bg-neutral-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-2 shrink-0">
        <span className={`${badge.sm} ${q.categoryColor}`}>{q.category}</span>
        <div className={`${flex.row} gap-1 text-neutral-300`}>
          <button className="rounded-lg p-1 transition-colors hover:bg-mint-50 hover:text-mint-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button className="rounded-lg p-1 transition-colors hover:bg-coral-50 hover:text-coral-500">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
              <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>
      </div>

      {/* Question + rationale - grows to fill, scrolls if it overflows. */}
      <div className="scrollbar-hide flex-1 overflow-y-auto">
        <p className="text-base leading-relaxed text-neutral-800">{q.text}</p>
        {whyOpen && (
          <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500">
            {q.why}
          </p>
        )}
      </div>

      {/* Actions pinned at the bottom - stacked, matching the original card. */}
      <div className="mt-3 flex flex-col gap-1.5 shrink-0">
        <button
          onClick={() => onIgnore?.(q)}
          className={`${button.danger} w-full py-1.5 text-xs font-semibold rounded-lg`}
        >
          Ignore
        </button>
        <button
          onClick={() => onMoreLike(q)}
          disabled={isGeneratingSimilar}
          className="w-full rounded-lg bg-neutral-100 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingSimilar ? "Generating…" : "More like this"}
        </button>
        <button
          onClick={() => setWhyOpen((o) => !o)}
          className="flex items-center justify-start gap-1.5 pt-0.5 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {whyOpen ? "Hide" : "Why?"}
        </button>
      </div>
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
    ? (over ? "border-coral-300 ring-2 ring-coral-100" : `${color.activeBorder} ring-2 ${color.ring}`)
    : isPaused ? "border-amber-300"
    : "border-neutral-200";

  const barClass = isRunning ? "bg-primary-500"
    : isPaused ? "bg-amber-400"
    : isDone   ? "bg-neutral-300"
    : "bg-neutral-200";

  const timerClass = over
    ? "text-coral-500 animate-pulse"
    : isRunning ? color.timer
    : "text-neutral-700";

  return (
    <div className={`shrink-0 w-[190px] h-[186px] flex flex-col border ${borderClass} rounded-2xl overflow-hidden bg-neutral-0 transition-all duration-300 ${isDone ? "opacity-50" : ""}`}>
      <div className="h-1 bg-neutral-100 shrink-0">
        <div className={`h-1 ${barClass} transition-all duration-1000`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className={`${flex.rowBetween} gap-1.5 shrink-0`}>
          <span className="font-semibold text-neutral-800 text-sm leading-tight line-clamp-1">{section.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${isDone ? "bg-neutral-100 text-neutral-400" : color.badge}`}>
            {section.suggested_minutes}m
          </span>
        </div>

        <p className="text-xs text-neutral-400 leading-snug line-clamp-2">{section.description}</p>

        <div className={`${flex.row} items-baseline gap-1 shrink-0`}>
          <span className={`font-mono text-lg font-bold ${timerClass}`}>{formatTimer(st.elapsed)}</span>
          <span className="text-xs text-neutral-400">/ {formatTimer(budget)}</span>
        </div>

        <div className="mt-auto shrink-0">
          {isIdle && (
            <button
              onClick={onStart}
              disabled={locked}
              className={`w-full py-1.5 rounded-lg text-sm font-semibold transition-colors ${locked ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" : "bg-primary-500 hover:bg-primary-600 text-white"}`}
            >
              Start
            </button>
          )}

          {(isRunning || isPaused) && (
            <div className={`${flex.row} gap-2`}>
              <button
                onClick={isRunning ? onPause : onResume}
                disabled={locked}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${locked ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" : color.pauseBg}`}
              >
                {isRunning ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                )}
              </button>
              <button
                onClick={onDone}
                disabled={locked}
                className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${locked ? "bg-neutral-100 text-neutral-300 cursor-not-allowed" : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600"}`}
              >
                Done
              </button>
            </div>
          )}

          {isDone && (
            <div className={`${flex.row} justify-center gap-1.5 py-1.5`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-sm font-semibold text-neutral-400">Done</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
          aria-label={expanded ? "Collapse bias warning" : "Expand bias warning"}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <p className="text-sm font-semibold text-coral-700">
            Possibly biased question
            {warning.category ? ` — ${warning.category}` : ""}
          </p>
          <svg
            className={`shrink-0 text-coral-500 transition-transform ${expanded ? "rotate-180" : ""}`}
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
              <p className="text-xs text-coral-700 mt-1">{warning.reason}</p>
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

// ── Prep screen ───────────────────────────────────────────────────────────────
// Shown while the interview is still scheduled: the CV-analysis briefing on
// the left, the AI-suggested questions on the right, one Begin CTA. The
// interviewer walks into the call already knowing the candidate's strengths,
// gaps, and what to ask - instead of discovering the analysis page later.

const PREP_FIT_METRICS = [
  { key: "relevant_experience", label: "Relevant Experience" },
  { key: "technical_fit", label: "Technical Fit" },
  { key: "soft_skills", label: "Soft Skills" },
];

function PrepVerdictChip({ positionFit }) {
  const values = PREP_FIT_METRICS.map((m) => positionFit?.[m.key]).filter(
    (v) => typeof v === "number"
  );
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const [label, chipClass] =
    avg >= 7.5
      ? ["Strong fit", "bg-mint-50 text-mint-700"]
      : avg >= 4.5
      ? ["Moderate fit", "bg-sky-50 text-sky-700"]
      : ["Weak fit", "bg-coral-50 text-coral-700"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1 text-xs font-bold ${chipClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-pill bg-current" aria-hidden />
      {label}
      <span className="font-semibold opacity-70 tabular-nums">{avg.toFixed(1)}/10</span>
    </span>
  );
}

// A short, quiet list: tiny tinted dot + the takeaway title only. The
// evidence and per-metric bars live on the full analysis page - repeating
// them here buried the CTA under noise.
function PrepInsightList({ title, items, dot }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
        {title}
      </p>
      <ul className={`${flex.col} gap-1.5`}>
        {items.slice(0, 3).map((item, i) => (
          <li
            key={`${item.title}-${i}`}
            className={`${flex.row} items-start gap-2`}
            title={item.detail || undefined}
          >
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill ${dot}`} aria-hidden />
            <span className="text-sm leading-snug text-neutral-700">{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrepPanel({ analysis, scheduledLabel, onBegin, onViewFullAnalysis }) {
  // The prep question plan comes from the CV analysis report (generated
  // once, tailored to THIS candidate's CV) - not from a fresh OpenAI run.
  // The generic AI deck only spins up once the interview actually begins.
  const analysisQuestions = analysis?.interview_questions ?? [];
  return (
    <div className="scrollbar-primary flex-1 overflow-y-auto px-6 py-10">
      <div className={`mx-auto max-w-2xl ${flex.col} gap-6`}>
        {/* Quiet heading - the candidate/role already live in the page
            header, so this only carries the when + what-happens-next. */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-800">Interview Prep</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {scheduledLabel ? `Scheduled for ${scheduledLabel}` : "Not scheduled yet"}
          </p>
        </div>

        {/* Briefing - one calm card, takeaways only */}
        <div className={`${card.base} ${flex.col} gap-5`}>
          <div className={flex.rowBetween}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
              Briefing
            </h3>
            {analysis && <PrepVerdictChip positionFit={analysis.position_fit} />}
          </div>

          {analysis ? (
            <>
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                <PrepInsightList
                  title="Strengths"
                  items={analysis.key_strengths}
                  dot="bg-mint-500"
                />
                <PrepInsightList
                  title="Areas to probe"
                  items={[
                    ...(analysis.improvements ?? []),
                    ...(analysis.inconsistencies ?? []),
                  ]}
                  dot="bg-sky-500"
                />
              </div>
              {onViewFullAnalysis && (
                <button
                  type="button"
                  onClick={onViewFullAnalysis}
                  className="self-start text-sm font-semibold text-primary-500 hover:text-primary-600"
                >
                  View full CV analysis →
                </button>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm italic text-neutral-400">
              No CV analysis for this application yet.
            </p>
          )}
        </div>

        {/* Question plan - the CV analysis report's suggested questions,
            as a plain numbered list. Only renders when a report exists;
            hover a question for the report's rationale. */}
        {analysisQuestions.length > 0 && (
          <div className={`${card.base} ${flex.col} gap-4`}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">
              Question Plan
            </h3>
            <ol className={`${flex.col} gap-2.5`}>
              {analysisQuestions.slice(0, 5).map((q, i) => (
                <li
                  key={`${q.question}-${i}`}
                  className={`${flex.row} items-start gap-3`}
                  title={q.rationale || undefined}
                >
                  <span className="w-4 shrink-0 pt-px text-right text-sm font-semibold tabular-nums text-neutral-300">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm leading-snug text-neutral-700">
                    {q.question}
                  </span>
                  {q.category && (
                    <span className="shrink-0 pt-px text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                      {q.category}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* One centered CTA - the only loud element on the screen */}
        <div className={`${flex.col} items-center gap-2 pt-2`}>
          <button
            type="button"
            onClick={onBegin}
            className={`${flex.row} gap-2 ${button.primary} !px-8 !py-3 text-base`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Begin Interview
          </button>
          <p className="text-xs text-neutral-400">
            Opens the live transcription workspace and marks the interview In Progress.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [, setStatus] = useState("Ready to start recording");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  // Raw interview status from the server - drives the prep/live/debrief arc.
  const [intvStatus, setIntvStatus] = useState(null);
  const [intvDateTime, setIntvDateTime] = useState(null);
  // CV analysis for this application (candidate+job) - shown on the prep
  // screen so the interviewer walks in already briefed. null = none/404.
  const [cvAnalysis, setCvAnalysis] = useState(null);
  const beginningRef = useRef(false);

  const { user } = useAuth();
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [cvUrl, setCvUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [candId, setCandId] = useState(null);
  // Post-interview report popup: idle -> generating -> ready | error.
  const [reportState, setReportState] = useState({ phase: "idle" });
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState("");
  const [similarQuestionId, setSimilarQuestionId] = useState(null);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [, setFollowUpLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [sections, setSections] = useState([]);
  const [sectionStates, setSectionStates] = useState([]);
  const sectionIntervals = useRef([]);
  const sectionsScrollRef = useRef(null);
  const sectionCardRefs = useRef([]);

  const [highlightedEntryIdx, setHighlightedEntryIdx] = useState(null);
  const transcriptEntryRefs = useRef([]);
  const [biasWarnings, setBiasWarnings] = useState([]);
  // Append-only log of EVERY flagged incident this session - unlike the capped,
  // dismissible banner state above, this is never trimmed, so the completion
  // report can persist the full list.
  const biasIncidentsRef = useRef([]);
  const [highlightedEntryId, setHighlightedEntryId] = useState(null);

  const transcriptRef = useRef([]);
  const timerRef = useRef(0);
  const autoStartedRef = useRef(false);
  // Seconds actually recorded so far (across visits). The timer only runs
  // while screen share is live - merely VIEWING an in-progress interview
  // used to inflate intv_duration_seconds via the 30s autosave.
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
    // Stamp with the interview clock so the report can point back to the
    // moment, and log it to the uncapped list before the banner trims to 3.
    const timestamp = formatTimer(timerRef.current);
    biasIncidentsRef.current.push({
      quote: warning.quote,
      category: warning.category ?? null,
      reason: warning.reason ?? null,
      suggestion: warning.suggestion ?? null,
      timestamp,
    });
    setBiasWarnings((prev) =>
      [...prev, { ...warning, timestamp, id: `bias-${Date.now()}-${Math.random()}` }].slice(-3)
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
    const startAt = timerRef.current;
    setSections((prev) => {
      const updated = prev.map((s, j) =>
        j === i && s.start_at == null ? { ...s, start_at: startAt } : s
      );
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

  function createTranscriptionSocket(speaker, partialRef, role) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `wss://jobvelo.onrender.com/api/realtime/transcribe?role=${role}`
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

      // Resume the clock from the recorded total, not from page mount.
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
      // Only count while the interview is actually being recorded. The old
      // condition ticked from page MOUNT, so opening an in-progress
      // interview just to look at it silently inflated the duration.
      if (isScreenSharing && !isPaused && !isCompleted) {
        const elapsedSeconds = Math.floor(
          (Date.now() - startTimeRef.current) / 1000
        );
        setTimer(elapsedSeconds);
        accumulatedRef.current = elapsedSeconds;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isScreenSharing, isPaused, isCompleted]);

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
          // Seed the clock with what was already recorded; it stays frozen
          // there until screen share actually starts.
          const priorSeconds = data.intv_duration_seconds ?? 0;
          accumulatedRef.current = priorSeconds;
          timerRef.current = priorSeconds;
          setTimer(priorSeconds);
          if (!autoStartedRef.current) {
            autoStartedRef.current = true;
            startMicOnly().catch(() => {});
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

        // Prep briefing: the CV analysis for this (candidate, job) pair.
        if (data.cand_id && data.job_id && !completed) {
          authedFetch(`/api/job-candidates/by-candidate/${data.cand_id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((links) => {
              const link = Array.isArray(links)
                ? links.find((l) => l.job_id === data.job_id)
                : null;
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
    // Only generate suggestions for a LIVE interview:
    //  - never for a finished one (reopening a completed transcript was
    //    silently firing a fresh OpenAI run per visit);
    //  - never during prep - the prep screen's question plan comes from the
    //    CV analysis report, so paying for an OpenAI run before the
    //    interview even starts was pure waste. Generation kicks off the
    //    moment Begin Interview flips the status to in_progress.
    if (
      !jobId ||
      isCompleted ||
      intvStatus !== "in_progress" ||
      questionsRequestedJobRef.current === jobId
    ) {
      return;
    }

    questionsRequestedJobRef.current = jobId;
    setQuestionsLoading(true);
    setQuestionsError("");

    authedFetch(`/api/interview-questions/${jobId}`, {
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
  }, [jobId, isCompleted, intvStatus]);

  async function generateMoreLike(question) {
    if (!jobId || similarQuestionId) {
      return;
    }

    setSimilarQuestionId(question.id);
    setQuestionsError("");

    try {
      const response = await authedFetch(
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
      const response = await authedFetch(
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

  function jumpToSection(sectionIndex) {
    const section = sections[sectionIndex];
    const startSeconds =
      section?.start_at != null
        ? section.start_at
        : sections
            .slice(0, sectionIndex)
            .reduce((sum, s) => sum + (s.suggested_minutes || 0) * 60, 0);

    let targetIdx = transcript.findIndex(
      (entry) => parseTimestamp(entry.timestamp) >= startSeconds
    );
    if (targetIdx === -1) targetIdx = transcript.length - 1;
    if (targetIdx < 0) return;

    const el = transcriptEntryRefs.current[targetIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });

    setHighlightedEntryIdx(targetIdx);
    setTimeout(() => setHighlightedEntryIdx(null), 2000);
  }

  // Prep -> live transition: mark the interview in_progress server-side so
  // status pills across the app flip immediately, then swap to the live
  // workspace. Double-click guarded.
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
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Failed to start the interview."
        );
      }
      setIntvStatus("in_progress");
    } catch (err) {
      toast.error(err.message || "Failed to start the interview.");
    } finally {
      beginningRef.current = false;
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
      // Drop in-flight partial captions - only finalised lines are analysed.
      const finalEntries = transcript.filter(
        (e) => !String(e.id).startsWith("partial-")
      );
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
        throw new Error(
          typeof detail === "string" ? detail : "Report generation failed."
        );
      }

      if (isScreenSharing) void stopScreenShare();
      setIsCompleted(true);
      setStatus("Interview completed");
      localStorage.removeItem(`transcript-${id}`);
      setReportState({ phase: "ready", data });
    } catch (err) {
      setReportState({
        phase: "error",
        error: err.message || "Something went wrong.",
      });
    }
  }

  // The page's arc: PREP while the interview is still scheduled (briefing +
  // question plan + one Begin CTA), LIVE once it's in progress (transcript,
  // deck, complete), DEBRIEF when completed (read-only transcript + report).
  const phase = isCompleted
    ? "debrief"
    : intvStatus === "scheduled" || intvStatus === "not_scheduled"
    ? "prep"
    : "live";

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
            {phase !== "prep" && (
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
            )}
            {phase !== "prep" && (
              <div
                className={`${flex.row} gap-2 items-center text-neutral-700 font-semibold text-xl`}
              >
                <span>{formatTimer(timer)}</span>
                <span
                  className={`w-3 h-3 rounded-pill ${
                    isScreenSharing && !isPaused && !isCompleted
                      ? "bg-coral-500 animate-pulse"
                      : "bg-neutral-300"
                  }`}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Debrief banner - completed interviews open in review mode ────── */}
      {phase === "debrief" && (
        <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-2xl border border-mint-100 bg-mint-50 px-5 py-3">
          <p className="text-sm text-mint-700">
            <span className="font-bold">Interview completed.</span>{" "}
            The transcript below is read-only - open the report for scores,
            strengths and the summary.
          </p>
          <div className={`${flex.row} shrink-0 gap-2`}>
            <button
              type="button"
              onClick={() => completeInterview()}
              className="rounded-xl bg-mint-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-mint-600"
            >
              View Report
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(
                  candId && jobId
                    ? `/candidates/${candId}/${jobId}`
                    : `/jobs/${jobId}`,
                  { replace: true }
                )
              }
              className="rounded-xl border border-mint-200 bg-white px-4 py-1.5 text-sm font-semibold text-mint-700 transition-colors hover:bg-mint-100"
            >
              Back to candidate
            </button>
          </div>
        </div>
      )}

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      {phase === "prep" ? (
        <PrepPanel
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
          onViewFullAnalysis={
            cvAnalysis?.jobcand_id
              ? () => navigate(`/cv-analysis/${cvAnalysis.jobcand_id}`)
              : null
          }
        />
      ) : (
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
                transcript.map((entry, i) => (
                  <div
                    key={entry.id}
                    ref={(el) => (transcriptEntryRefs.current[i] = el)}
                    className={`rounded-lg transition-colors duration-700 ${highlightedEntryIdx === i || entry.id === highlightedEntryId ? "bg-yellow-50 ring-1 ring-yellow-300" : ""}`}
                  >
                    <TranscriptEntry entry={entry} highlighted={entry.id === highlightedEntryId} />
                  </div>
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
          {/* Interview Sections */}
          {sections.length > 0 && (
            <div className={`${card.flat} flex flex-col shrink-0 overflow-hidden`}>
              <div className="px-6 pt-3.5 pb-2.5 border-b border-neutral-100 shrink-0">
                <h2 className="text-base font-semibold text-neutral-800">Interview Sections</h2>
              </div>

              {isCompleted ? (
                <div className="px-4 py-3 flex flex-col gap-0.5">
                  {sections.map((section, i) => {
                    const hasReal = section.start_at != null;
                    const startSec = hasReal
                      ? section.start_at
                      : sections.slice(0, i).reduce((sum, s) => sum + (s.suggested_minutes || 0) * 60, 0);
                    const color = SECTION_COLORS[i % SECTION_COLORS.length];
                    return (
                      <button
                        key={i}
                        onClick={() => jumpToSection(i)}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors hover:bg-neutral-50 group"
                      >
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${color.badge}`}>
                          {hasReal ? "" : "~"}{formatTimer(startSec)}
                        </span>
                        <span className="text-sm font-semibold text-neutral-800 group-hover:text-primary-600 transition-colors shrink-0">
                          {section.name}
                        </span>
                        <span className="text-xs text-neutral-400 truncate">{section.description}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 group-hover:text-primary-400 shrink-0 transition-colors">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </div>
          )}

          {/* Suggested Questions - vertical list (was a horizontal strip of
              fixed-height cards that got squashed when the panel was short). */}
          <div className={`${card.flat} flex flex-col flex-1 overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 pt-3.5 pb-2.5 shrink-0">
              <h2 className="text-base font-semibold text-neutral-800">
                Suggested Questions
              </h2>
              {questions.length > 0 && (
                <span className="text-xs font-semibold text-neutral-300">{questions.length}</span>
              )}
            </div>
            {questionsLoading ? (
              <div className={`${flex.rowCenter} flex-1`}>
                <p className="text-sm text-neutral-400">Generating questions…</p>
              </div>
            ) : questionsError && questions.length === 0 ? (
              <div className={`${flex.rowCenter} flex-1 px-6`}>
                <p className="text-sm text-coral-500 text-center">{questionsError}</p>
              </div>
            ) : displayedQuestions.length === 0 ? (
              <div className={`${flex.rowCenter} flex-1`}>
                <p className="text-sm text-neutral-400">No suggested questions available.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
                <div className="flex h-full items-stretch gap-4">
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
              </div>
            )}
          </div>

          {/* Pause / Complete — or navigation buttons when interview is done */}
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
      )}

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
