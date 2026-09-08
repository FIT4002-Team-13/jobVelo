import { useState } from "react";
import { flex, button, modal } from "../../styles/layout";
import { avatarColor, initials } from "../../utils/avatar";
import ReportSections from "./ReportSections.jsx";

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

export function InterviewReportModal({
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
