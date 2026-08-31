import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/common/Sidebar";
import JobFormModal from "../components/job-candidate/JobFormModal";
import StartInterviewModal from "../components/job-candidate/StartInterviewModal";
import DeleteCandidateModal from "../components/job-candidate/DeleteCandidateModal";
import EditCandidateForm from "../components/candidate/EditCandidateForm";
import AddCandidateForm from "../components/candidate/AddCandidateForm";
import { flex, card, badge, button, modal, page } from "../styles/layout";

import { useAuth } from "../lib/AuthContext.jsx";
import { useToast } from "../components/common/ToastContext.jsx";
import { authedFetch, downloadFileWithAuth } from "../lib/api.js";
import {
  SortMenu,
  FilterMenu,
  makeSorter,
} from "../components/job-candidate/TableControls";

// ── Constants ─────────────────────────────────────────────────────────────────

// Solid-fill status pills - kept in sync with JobsPage + DashboardPage.
// Pending = warning (coral), In Progress = active (primary), Completed = done (mint).
const STATUS_STYLES = {
  Pending: "bg-coral-500 text-white",
  "In Progress": "bg-primary-500 text-white",
  Completed: "bg-mint-500 text-white",
};

// Anything not listed here (including legacy data) falls back to the
// neutral pill style via the `?? 'bg-neutral-100 ...'` guard at the call site.
const CANDIDATE_STATUS_STYLES = {
  'NOT SCHEDULED': 'bg-neutral-100 text-neutral-500',
  SCHEDULED:       'bg-primary-100 text-primary-600',
  'IN PROGRESS':   'bg-amber-100 text-amber-700',
  INCOMPLETE:      'bg-coral-50 text-coral-600',
  COMPLETED:       'bg-mint-100 text-mint-700',
  CANCELLED:       'bg-coral-100 text-coral-700',
  EVALUATED:       'bg-sky-100 text-sky-600',
  HIRED:           'bg-mint-500 text-white',
  REJECTED:        'bg-coral-100 text-coral-700',
}

// Options shown in the candidates-table FilterMenu. These mirror what the
// rows can actually hold (the interview status, upper-cased) so every pill
// the table can render is also selectable here.
const CANDIDATE_FILTER_OPTIONS = [
  { value: "NOT SCHEDULED", label: "Not Scheduled" },
  { value: "SCHEDULED",     label: "Scheduled"     },
  { value: 'IN PROGRESS',     label: 'In Progress' },
  { value: "COMPLETED",     label: "Completed"     },
];

const AVATAR_COLORS = [
  "bg-primary-500",
  "bg-sky-500",
  "bg-mint-500",
  "bg-coral-500",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name = '') {
  const safeName = typeof name === 'string' ? name.trim() : ''
  if (!safeName) return '--'

  return safeName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function avatarColor(name = '') {
  const safeName = typeof name === 'string' ? name : ''
  let hash = 0
  for (const c of safeName) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatDate(iso) {
  if (!iso || typeof iso !== 'string' || !iso.includes('-')) return '--'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(iso) {
  if (!iso) return "--";
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return isToday
    ? `Today, ${time}`
    : `${formatDate(iso.slice(0, 10))}, ${time}`;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-xs";
  return (
    <div
      title={name}
      className={`${sz} rounded-pill ${
        flex.rowCenter
      } text-white font-bold border-2 border-neutral-0 -ml-2 first:ml-0 ${avatarColor(
        name
      )}`}
    >
      {initials(name)}
    </div>
  );
}


// ── Interview Status Panel ────────────────────────────────────────────────────

// Order matches the pipeline progression so the panel reads top-to-bottom
// from "not started" → "in progress" → "done". The dot colour mirrors the
// candidate-row pill palette so users can visually link the count here
// with the pill on the row. Every status a row can hold is bucketed, so
// the counts always sum to the Total Candidates number above them.
const INTERVIEW_STATUS_ROWS = [
  { key: 'NOT SCHEDULED', label: 'Not Scheduled', dot: 'bg-neutral-400' },
  { key: 'SCHEDULED',     label: 'Scheduled',     dot: 'bg-primary-500' },
  { key: 'COMPLETED',     label: 'Completed',     dot: 'bg-mint-500'    }
]

function InterviewStatusPanel({ candidates}) {
  // Start each tracked status at 0 - keeps the row visible even when
  // nobody's in that bucket yet (an empty job still shows 0/0/0).
  const counts = INTERVIEW_STATUS_ROWS.reduce((acc, { key }) => ({ ...acc, [key]: 0 }), {})
  let scoreSum = 0, scoreCount = 0

  for (const c of candidates) {
    if (counts[c.status] !== undefined) counts[c.status]++;
    if (c.score != null) {
      scoreSum += c.score;
      scoreCount++;
    }
  }

  const total = candidates.length;
  const avgScore = scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : "--";

  const uniqueInterviewers = [
    ...new Set(candidates.map((c) => c.interviewer).filter(Boolean)),
  ];

  return (
    <div className={`${card.base} ${flex.col} gap-4`}>
      <h2 className="text-base font-bold text-neutral-800">Interview Status</h2>

      <div className="text-center">
        <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
          Total Candidates
        </p>
        <p className="text-5xl font-extrabold text-primary-500">{total}</p>
      </div>

      <div className={`${flex.col} gap-1.5`}>
        {INTERVIEW_STATUS_ROWS.map(({ key, label, dot }) => (
          <div key={key} className={`${flex.rowBetween} text-sm`}>
            <span className={`${flex.row} gap-2`}>
              <span className={`w-2 h-2 rounded-pill ${dot}`} aria-hidden />
              <span className="text-neutral-500 font-medium">{label}</span>
            </span>
            <span className="font-bold text-neutral-700">{counts[key]}</span>
          </div>
        ))}
      </div>

      <hr className="border-neutral-100" />

      <div className={flex.rowBetween}>
        <div>
          <p className="text-xs text-neutral-400 mb-2">Interviewer</p>
          <div className={flex.row}>
            {uniqueInterviewers.slice(0, 5).map((name, i) => (
              <Avatar key={i} name={name} size="sm" />
            ))}
            {uniqueInterviewers.length > 5 && (
              <div
                className={`w-7 h-7 rounded-pill bg-neutral-200 ${flex.rowCenter} text-xs font-bold text-neutral-500 border-2 border-neutral-0 -ml-2`}
              >
                +{uniqueInterviewers.length - 5}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-400 mb-1">Average Score</p>
          <p className="text-xl font-extrabold text-neutral-700">{avgScore}</p>
        </div>
      </div>
    </div>
  );
}

// ── Candidates Table ──────────────────────────────────────────────────────────

// Format a 0-10 rubric score for the RANKINGS columns. Backend stores them
// as floats; we round to one decimal so "7.333333" doesn't blow up the cell.
function formatScore(n) {
  if (n == null) return "--";
  return Number.isFinite(n) ? Number(n).toFixed(1) : "--";
}

function CandidatesTable({
  candidates,
  tab,
  setTab,
  user,
  onStartInterview,
  onEditCandidate,
  onDelete,
  onOpenInterview,
  onOpenCandidate,
  onDownloadTranscript,
}) {
  const isInterviewer = user?.role === "interviewer";
  const [search, setSearch] = useState("");
  // SortMenu is only consulted while the SCHEDULES tab is active. The
  // RANKINGS tab is itself a sort ("highest score first") so letting the
  // dropdown override it would be confusing - we just lock it there.
  const [sortKey, setSortKey] = useState("latest");
  const [statusFilters, setStatusFilters] = useState([]);

  const needle = search.trim().toLowerCase();
  const filtered = candidates.filter((c) => {
    if (needle && !(c.name ?? "").toLowerCase().includes(needle)) return false;
    if (statusFilters.length > 0 && !statusFilters.includes(c.status))
      return false;
    return true;
  });

  let sorted;
  if (tab === "RANKINGS") {
    // Highest score wins; rows with no score sink to the bottom.
    sorted = [...filtered].sort(
      (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)
    );
  } else {
    const sorter = makeSorter(sortKey, {
      nameField: "name",
      dateField: "scheduled_at",
    });
    sorted = sorter ? [...filtered].sort(sorter) : filtered;
  }

  return (
    <div>
      {/* Single row: tabs on the left, search + sort + filter on the right. */}
      <div className={`${flex.rowBetween} gap-3 mb-4`}>
        <div className={`${flex.row} gap-2`}>
          {["SCHEDULES", "RANKINGS"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === t
                  ? "bg-primary-500 text-white"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={`${flex.row} gap-3`}>
          <div
            className={`${flex.row} gap-2 border border-neutral-200 rounded-xl px-3 py-1.5 bg-neutral-0`}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Candidate Name"
              className="outline-none border-none bg-transparent text-sm text-neutral-600 placeholder:text-neutral-400 w-32"
            />
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-neutral-400"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          {/* Sort is only meaningful on the SCHEDULES tab - RANKINGS already
              IS a sort by score. We still render the menu in disabled-style
              on RANKINGS for layout stability. */}
          {tab === "SCHEDULES" ? (
            <SortMenu value={sortKey} onChange={setSortKey} />
          ) : (
            <span
              className={`${flex.row} gap-1 text-xs font-medium text-neutral-300 cursor-not-allowed`}
              title="Rankings are sorted by score"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18M6 12h12M9 18h6" />
              </svg>
              Sort
            </span>
          )}
          <FilterMenu
            values={statusFilters}
            onChange={setStatusFilters}
            options={CANDIDATE_FILTER_OPTIONS}
            singleSelect
          />
        </div>
      </div>

      <div className={`${card.flat} overflow-hidden`}>
        <table className="w-full text-sm">
          {/* Column set is tab-aware:
                SCHEDULES  → Candidate | Status | Datetime | Score | Interviewer | Actions
                RANKINGS   → Rank | Candidate | Status | Communication | Skill | Problem Solving | Score | Actions
              The two views share the Candidate / Status / Score / Actions cells so
              the column count differs but the look stays consistent. */}
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-100">
              {(tab === "RANKINGS"
                ? [
                    "Rank",
                    "Candidate",
                    "Status",
                    "Communication",
                    "Skill",
                    "Problem Solving",
                    "Score",
                    "Actions",
                  ]
                : [
                    "Candidate",
                    "Status",
                    "Datetime",
                    "Score",
                    "Interviewer",
                    "Actions",
                  ]
              ).map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={tab === "RANKINGS" ? 8 : 6}
                  className="px-4 py-8 text-center text-sm text-neutral-400"
                >
                  No candidates found.
                </td>
              </tr>
            ) : (
              sorted.map((c, i) => {
                // Cells shared by both views (so they read identically across tabs)
                const candidateCell = (
                  <td className="px-4 py-3">
                    <div className={`${flex.row} gap-3`}>
                      <div
                        className={`w-8 h-8 rounded-pill ${
                          flex.rowCenter
                        } text-white text-xs font-bold shrink-0 ${avatarColor(
                          c.name
                        )}`}
                      >
                        {initials(c.name)}
                      </div>
                      <span className="font-medium text-neutral-800">
                        {c.name}
                      </span>
                    </div>
                  </td>
                );
                const statusCell = (
                  <td className="px-4 py-3">
                    <span
                      className={`${badge.sm} ${
                        CANDIDATE_STATUS_STYLES[c.status] ??
                        "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                );
                const scoreCell = (
                  <td className="px-4 py-3 font-semibold text-neutral-700">
                    {formatScore(c.score)}
                  </td>
                );
                // A candidate is only rankable once they have a real score
                // (i.e. a completed, rated interview). Without one, a "#N" would
                // imply a pecking order that hasn't been earned - show N/A and
                // skip the medal styling instead. Unscored rows already sort to
                // the bottom, so the scored ones keep contiguous #1..#k ranks.
                const isRanked = typeof c.score === "number" && Number.isFinite(c.score);
                // Actions: Start Interview is only meaningful for SCHEDULED rows
                // (so it stays greyed-out on the RANKINGS tab where everything is
                // typically EVALUATED), and is interviewer-only - mirrors the
                // backend's Depends(require_role("interviewer")) on
                // POST /api/interviews. Delete is always available - removing a
                // mis-added candidate from a job shouldn't depend on their state.
                const canStart = c.status === "SCHEDULED" && isInterviewer;
                const hasCompletedInterview = Boolean(c.intv_completed);
                const actionsCell = (
                  // stopPropagation: the whole row navigates to the candidate
                  // page on click - without this, the action buttons would
                  // fire AND navigate away (which is why Delete appeared to
                  // do nothing: the confirm modal unmounted immediately).
                  // w-[1%] + nowrap shrink-wraps the Actions column to its
                  // content, so the action cluster stays compact instead of
                  // stretching across whatever slack width the table has -
                  // the other columns absorb it. Fixed-width primary button
                  // (w-[150px]) keeps the icons vertically aligned row-to-row.
                  <td className="px-4 py-3 w-[1%]" onClick={(e) => e.stopPropagation()}>
                    <div className={`${flex.row} gap-2 whitespace-nowrap`}>
                      {hasCompletedInterview ? (
                        <button
                          type="button"
                          title="View the completed interview's transcription"
                          onClick={() => c.intv_id && onOpenInterview?.(c.intv_id)}
                          className={`${flex.row} justify-center w-[150px] gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap bg-mint-100 text-mint-700 hover:bg-mint-200`}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          View Transcription
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canStart}
                          title={!isInterviewer ? "Only interviewers can start interviews" : undefined}
                          onClick={() => canStart && onStartInterview?.(c)}
                          className={`${
                            flex.row
                          } justify-center w-[150px] gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                            canStart
                              ? "bg-primary-500 hover:bg-primary-600 text-white"
                              : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                          }`}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          Start Interview
                        </button>
                      )}
                      {/* Hairline divider visually separates the primary
                          action from the secondary icon trio while keeping
                          the whole cluster compact. */}
                      <span
                        className="mx-1 w-px self-stretch bg-neutral-200"
                        aria-hidden
                      />
                      <div className={`${flex.row} gap-2`}>
                      <button
                        type="button"
                        disabled={!hasCompletedInterview}
                        title={hasCompletedInterview ? "Download transcript" : "No transcript available"}
                        aria-label="Download transcript"
                        onClick={() => hasCompletedInterview && onDownloadTranscript?.(c.intv_id)}
                        className={`w-7 h-7 ${flex.rowCenter} rounded-lg transition-colors ${
                          hasCompletedInterview
                            ? "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                            : "text-neutral-200 cursor-not-allowed"
                        }`}
                      >
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
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                      {/* Edit - same icon trio as the Applications page
                          (view / edit / delete) so the two candidate tables
                          read identically. Locked once the interview is
                          finished, mirroring the backend immutability guard. */}
                      <button
                        type="button"
                        disabled={c.status === "COMPLETED" || c.status === "CANCELLED"}
                        onClick={() => {
                          if (c.status === "COMPLETED" || c.status === "CANCELLED") return;
                          onEditCandidate?.(c);
                        }}
                        title={
                          c.status === "COMPLETED" || c.status === "CANCELLED"
                            ? "This interview is finished - the application can no longer be edited."
                            : "Edit candidate"
                        }
                        aria-label="Edit candidate"
                        className={`w-7 h-7 ${flex.rowCenter} rounded-lg transition-colors ${
                          c.status === "COMPLETED" || c.status === "CANCELLED"
                            ? "cursor-not-allowed text-neutral-200"
                            : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                        }`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
                      {/* Edit - same icon trio as the Applications page
                          (view / edit / delete) so the two candidate tables
                          read identically. Locked once the interview is
                          finished, mirroring the backend immutability guard. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete?.(c);
                        }}
                        title="Remove this candidate from the job"
                        aria-label="Delete candidate"
                        className={`w-7 h-7 ${flex.rowCenter} rounded-lg text-coral-500 hover:bg-coral-50 hover:text-coral-700 transition-colors`}
                      >
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
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                      </div>
                    </div>
                  </td>
                );

              return (
                <tr
                  key={c.id ?? i}
                  onClick={() => onOpenCandidate?.(c)}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 cursor-pointer transition-colors"
                >
                  {tab === 'RANKINGS' ? (
                    <>
                      {/* Rank - 1-based since people don't count from zero.
                          Top three use the medal palette (🥇 gold / 🥈 silver
                          / 🥉 bronze) for at-a-glance pecking order. Everyone
                          else renders in plain neutral. All non-bold per spec. */}
                        <td
                          className={`px-4 py-3 w-12 ${
                            !isRanked
                              ? "text-neutral-400"
                              : i === 0
                              ? "text-yellow-500"
                              : i === 1
                              ? "text-neutral-400"
                              : i === 2
                              ? "text-amber-700"
                              : "text-neutral-500"
                          }`}
                        >
                          {isRanked ? `#${i + 1}` : "N/A"}
                        </td>
                        {candidateCell}
                        {statusCell}
                        <td className="px-4 py-3 text-neutral-700">
                          {formatScore(c.ratings?.communication?.score)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatScore(c.ratings?.technical_skills?.score)}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {formatScore(c.ratings?.problem_solving?.score)}
                        </td>
                        {scoreCell}
                        {actionsCell}
                      </>
                    ) : (
                      <>
                        {candidateCell}
                        {statusCell}
                        <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                          {formatDateTime(c.scheduled_at)}
                        </td>
                        {scoreCell}
                        <td className="px-4 py-3">
                          <div className={`${flex.row} gap-2`}>
                            <div
                              className={`w-7 h-7 rounded-pill ${
                                flex.rowCenter
                              } text-white text-xs font-bold shrink-0 ${avatarColor(
                                c.interviewer ?? ""
                              )}`}
                            >
                              {initials(c.interviewer ?? "")}
                            </div>
                            <span className="text-neutral-600">
                              {c.interviewer}
                            </span>
                          </div>
                        </td>
                        {actionsCell}
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  // Double-click guard for Start Interview - two rapid confirms used to
  // race two POST /api/interviews calls and create duplicate interviews.
  const startingRef = useRef(false);

  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("SCHEDULES");
  const [showEdit, setShowEdit] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  // The candidate row clicked via "Start Interview" - null when no modal is open.
  const [startTarget, setStartTarget] = useState(null);
  // Candidate row queued for deletion - null when the confirm modal is closed.
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Candidate row being edited via the pencil icon - null when closed.
  const [editTarget, setEditTarget] = useState(null);
  // All company jobs - feeds the Edit Candidate modal's "Assign to Job"
  // select (shared with the Applications page, which passes the same list).
  const [allJobs, setAllJobs] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [jobRes, candsRes, jobsRes] = await Promise.all([
          authedFetch(`/api/jobs/${id}`),
          authedFetch(`/api/jobs/${id}/candidates`),
          authedFetch(`/api/jobs`),
        ]);
        // Best-effort: without the list the edit modal's job select just
        // shows the current job.
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json().catch(() => []);
          setAllJobs(Array.isArray(jobsData) ? jobsData : []);
        }
        if (!jobRes.ok) throw new Error("Job not found.");
        setJob(await jobRes.json());

        // Defend against the candidates endpoint failing or returning a
        // non-array shape (e.g. FastAPI's {detail: ...} on a 404). Without
        // this guard the InterviewStatusPanel and CandidatesTable crash with
        // "candidates is not iterable" on first render.
        if (candsRes.ok) {
          const data = await candsRes.json().catch(() => []);
          setCandidates(Array.isArray(data) ? data : []);
        } else {
          setCandidates([]);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function handleJobSaved(updated) {
    setJob(updated);
    setShowEdit(false);
    toast.success(`Job "${updated?.title || "Untitled role"}" updated.`);
  }

  // Re-fetch the job (for the updated candidate count) and the enriched
  // candidate rows (status / ratings / score / interviewer) after an add.
  // The shared AddCandidateForm returns a bare candidate doc, not a row, so a
  // reload is what keeps the table + rankings correct rather than an
  // optimistic append of a half-populated row.
  async function refreshJobAndCandidates() {
    const [jobRes, candsRes] = await Promise.all([
      authedFetch(`/api/jobs/${id}`),
      authedFetch(`/api/jobs/${id}/candidates`),
    ]);
    if (jobRes.ok) setJob(await jobRes.json().catch(() => null));
    if (candsRes.ok) {
      const data = await candsRes.json().catch(() => []);
      setCandidates(Array.isArray(data) ? data : []);
    }
  }

  function handleCandidateSaved(saved) {
    setShowAddCandidate(false);
    const name = saved?.cand_full_name || saved?.name || "Candidate";
    toast.success(`${name} added to this job.`);
    void refreshJobAndCandidates();
  }

  async function onConfirmStart() {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      // Resume an existing in-progress or scheduled interview rather than
      // creating a duplicate every time the button is clicked.
      const existingRes = await authedFetch(
        `/api/interviews?cand_id=${startTarget.cand_id}&job_id=${id}`
      );
      if (existingRes.ok) {
        const existing = await existingRes.json();
        const resumable = existing.find(
          (i) => i.intv_status === "in_progress" || i.intv_status === "scheduled"
        );
        if (resumable) {
          navigate(`/interview/${resumable.intv_id}`);
          return;
        }
      }

      const res = await authedFetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cand_id: startTarget.cand_id,
          job_id: id,
          intv_date_time: new Date().toISOString(),
          intv_status: "in_progress",
        }),
      });
      const interview = await res.json();
      if (!res.ok) {
        toast.error(interview?.detail || "Failed to start interview.");
        setStartTarget(null);
        return;
      }
      navigate(`/interview/${interview.intv_id}`);
    } catch {
      // Network failure used to leave the confirm modal stuck open with an
      // unhandled rejection in the console.
      toast.error("Could not reach the server - check your connection and try again.");
      setStartTarget(null);
    } finally {
      startingRef.current = false;
    }
  }

  // Delete flow:
  //   1. row's trash icon → setDeleteTarget(c) → DeleteCandidateModal opens
  //   2. modal owns the confirm + DELETE request + its own error state
  //   3. on success it calls onDeleted(id) → we drop the row from local
  //      state, which keeps the table in sync without a re-fetch.
  function handleCandidateDeleted(jobcand_id) {
    setCandidates((rows) => rows.filter((r) => r.id !== jobcand_id));
    setDeleteTarget(null);
    toast.success("Candidate removed from this job.");
  }

  // Fresh fetch of the candidate rows in the exact GET shape - used after
  // any server-side change (edit, pipeline drag) so status/interviewer/
  // schedule are whatever the server now says, not an optimistic guess.
  async function reloadCandidates() {
    try {
      const res = await authedFetch(`/api/jobs/${id}/candidates`);
      if (res.ok) {
        const data = await res.json().catch(() => []);
        setCandidates(Array.isArray(data) ? data : []);
      }
    } catch {
      // Keep the stale rows rather than blanking the table.
    }
  }

  // Edit flow: EditCandidateForm PATCHes the candidate + application on the
  // server. The edit may also have MOVED the candidate to another job, in
  // which case the row simply disappears from this job's list - which the
  // refetch handles for free.
  async function handleCandidateEdited() {
    setEditTarget(null);
    toast.success("Candidate updated.");
    await reloadCandidates();
  }


  // Capacity gate. Candidates count comes from the freshly-loaded list
  // (which the AddCandidate flow optimistically appends to), so it always
  // reflects the latest state without re-fetching the job. We treat a
  // missing/zero cap as "no cap" so legacy rows aren't locked out.
  const capacity = job?.candidates_total ?? 0;
  const isFull = capacity > 0 && candidates.length >= capacity;

  // Display-status override - same rule as JobsPage/DashboardPage:
  //   every candidate on the job has completed their interview -> Completed
  //   some (but not all) have completed -> In Progress
  //   a job explicitly marked Completed keeps its label either way
  // Derived from the candidate rows we already load (each carries
  // intv_completed), so no extra fetch is needed.
  const completedCount = candidates.filter((c) => c.intv_completed).length;
  const displayStatus =
    job?.status === "Completed"
      ? "Completed"
      : candidates.length > 0 && completedCount === candidates.length
      ? "Completed"
      : completedCount > 0
      ? "In Progress"
      : job?.status;

  if (loading)
    return (
      <div className={page.loading}>
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );

  if (error)
    return (
      <div className={page.loading}>
        <p className="text-sm text-coral-500">{error}</p>
      </div>
    );

  return (
    <div className={page.shell}>
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-6 shrink-0 flex items-start justify-between">
          <div>
            {/* Back-to-Jobs - upgraded from a tiny grey breadcrumb to a
                proper chip so users actually notice it. Border + bg make it
                read as a button; primary hover ties it to the rest of the
                action palette (Edit, Add Candidate, Start Interview). */}
            <button
              onClick={() => navigate(-1)}
              className={`${flex.row} gap-2 mb-3 text-sm font-semibold text-neutral-600 bg-neutral-0 border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-primary-500/10 hover:border-primary-200 hover:text-primary-600 transition-colors`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
              Job Posting
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Manage your open positions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Capacity hint - mirrors the job card on JobsPage so the user
                sees the same X/Y number on both screens. Also explains WHY
                the button is disabled when the role is full. */}
            <span className="text-xs text-neutral-500">
              <span
                className={`font-bold ${
                  isFull ? "text-neutral-700" : "text-neutral-700"
                }`}
              >
                {candidates.length}
              </span>
              {" / "}
              {job.candidates_total ?? 0} candidates
            </span>
            <button
              type="button"
              onClick={() => setShowAddCandidate(true)}
              disabled={isFull}
              title={
                isFull
                  ? `This role is full (${job.candidates_total} candidates).`
                  : undefined
              }
              className={`${flex.row} gap-2 ${button.primary} ${
                isFull
                  ? "opacity-50 cursor-not-allowed hover:bg-primary-500"
                  : ""
              }`}
            >
              + Add Candidate
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-8">

        {/* Top panels */}
        <div className="grid grid-cols-3 gap-5 mb-6">
          {/* Job Info */}
          <div className={`col-span-2 ${card.base} flex flex-col h-[320px]`}>
            <div className="shrink-0 flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-neutral-800">
                  {job.title}
                </h2>
                <p
                  className={`text-sm text-neutral-400 mt-0.5 ${flex.row} gap-1`}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  {/* Real last-update timestamp from the job doc - this used
                      to render new Date() (always "today"), which quietly
                      lied about how fresh the posting was. */}
                  Last Update{" "}
                  {job.job_last_update_datetime
                    ? new Date(job.job_last_update_datetime).toLocaleDateString(
                        "en-AU",
                        { month: "short", day: "numeric", year: "numeric" }
                      )
                    : "--"}
                </p>
              </div>
              <div className={`${flex.row} gap-2`}>
                <button
                  onClick={() => setShowEdit(true)}
                  className="text-xs font-medium text-neutral-500 border border-neutral-200 px-3 py-1 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Edit
                </button>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-pill ${
                    STATUS_STYLES[displayStatus] ??
                    "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {displayStatus}
                </span>
              </div>
            </div>

            <p className="shrink-0 text-sm font-bold text-neutral-700 mb-1">
              Description
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-primary mb-4">
              <p className="text-sm text-neutral-500 leading-relaxed pr-2">
                {job.description || "—"}
              </p>
            </div>

            {job.employment_type?.length > 0 && (
              <div className="shrink-0 flex flex-wrap gap-2 mb-4">
                {job.employment_type.map((t) => (
                  <span
                    key={t}
                    className={`${badge.base} bg-sky-100 text-sky-600`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className={`shrink-0 ${flex.row} gap-8 text-sm text-neutral-500`}>
              <div>
                <span className="block text-neutral-400 font-medium uppercase tracking-wide mb-0.5">
                  Start
                </span>
                <span className="font-semibold text-neutral-700">
                  {formatDate(job.recruitment_start)}
                </span>
              </div>
              <div>
                <span className="block text-neutral-400 font-medium uppercase tracking-wide mb-0.5">
                  End
                </span>
                <span className="font-semibold text-neutral-700">
                  {formatDate(job.recruitment_end)}
                </span>
              </div>
              {job.salary && (
                <div>
                  <span className="block text-neutral-400 font-medium uppercase tracking-wide mb-0.5">
                    Salary
                  </span>
                  <span className="font-semibold text-neutral-700">
                    $ {job.salary}
                    {job.salary_type === "Yearly"
                      ? " / year"
                      : job.salary_type === "Hourly"
                      ? " / hr"
                      : ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Interview Status */}
          <InterviewStatusPanel candidates={candidates} />
        </div>

        {/* Candidates section - tabs are now inside CandidatesTable so they
            align in the same row as the search + sort + filter controls. */}
        <div className={card.base}>
          <CandidatesTable
            candidates={candidates}
            tab={tab}
            setTab={setTab}
            user={user}
            onStartInterview={(c) => setStartTarget(c)}
            onEditCandidate={(c) => setEditTarget(c)}
            onDelete={(c) => setDeleteTarget(c)}
            onOpenInterview={(intvId) => navigate(`/interview/${intvId}`)}
            onOpenCandidate={(c) => {
              navigate(`/candidates/${c.cand_id}/${id}`)
            }}
            onDownloadTranscript={(intvId) => {
              downloadFileWithAuth(`/api/interviews/${intvId}/transcript-pdf`)
                .catch((err) => toast.error(err.message || 'Failed to download transcript.'))
            }}
          />
        </div>
        </main>
      </div>

      {showEdit && (
        <JobFormModal
          initialJob={job}
          onClose={() => setShowEdit(false)}
          onSaved={handleJobSaved}
        />
      )}

      {startTarget && (
        <StartInterviewModal
          candidate={startTarget}
          jobTitle={job?.title}
          onClose={() => setStartTarget(null)}
          // Placeholder for now - eventually this will PATCH the link's
          // status to EVALUATED and open the live-transcription UI.
          onConfirm={() => onConfirmStart()}
        />
      )}

      {showAddCandidate && (
        <AddCandidateForm
          fixedJobId={id}
          jobs={allJobs}
          onClose={() => setShowAddCandidate(false)}
          onSaved={handleCandidateSaved}
        />
      )}

      {deleteTarget && (
        <DeleteCandidateModal
          candidate={deleteTarget}
          jobId={id}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleCandidateDeleted}
        />
      )}

      {editTarget && (
        <EditCandidateForm
          // Fall back to just the current job if the jobs list fetch failed -
          // the select then shows one (valid) option instead of none.
          jobs={allJobs.length > 0 ? allJobs : job ? [job] : []}
          // Map this page's GET row shape onto the field names the shared
          // form expects (it was built against the /api/applications rows).
          initialData={{
            cand_id: editTarget.cand_id,
            application_id: editTarget.id,
            candidate_name: editTarget.name,
            email: editTarget.email,
            phone: editTarget.phone,
            job_id: id,
            interviewer: editTarget.interviewer || "",
            interview_datetime: editTarget.scheduled_at || null,
            cv_url: editTarget.cv_url,
            cover_letter_url: editTarget.cover_letter_url,
          }}
          onClose={() => setEditTarget(null)}
          onSaved={handleCandidateEdited}
        />
      )}
    </div>
  );
}