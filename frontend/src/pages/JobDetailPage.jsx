import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/common/Sidebar";
import JobFormModal from "../components/job-candidate/JobFormModal";
import StartInterviewModal from "../components/job-candidate/StartInterviewModal";
import DeleteCandidateModal from "../components/job-candidate/DeleteCandidateModal";
import AddCandidateForm from "../components/candidate/AddCandidateForm";
import { flex, card, badge, form, button, modal, page } from "../styles/layout";

import { useAuth } from "../lib/AuthContext.jsx";
import { api, authedFetch } from "../lib/api.js";
import {
  isEmail,
  isHttpUrl,
  isPhone,
  isFullName,
  isFutureDateTime,
} from "../lib/validators.js";
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

// Only SCHEDULED + EVALUATED are surfaced - HIRED / REJECTED removed.
// Anything else (including legacy data) falls back to the neutral pill style
// via the `?? 'bg-neutral-100 ...'` guard at the call site.
const CANDIDATE_STATUS_STYLES = {
  'NOT SCHEDULED': 'bg-neutral-100 text-neutral-500',
  SCHEDULED:       'bg-primary-100 text-primary-600',
  'IN PROGRESS':   'bg-sky-100 text-sky-600',
  INCOMPLETE:      'bg-coral-50 text-coral-600',
  COMPLETED:       'bg-mint-100 text-mint-700',
  EVALUATED:       'bg-sky-100 text-sky-600',
  HIRED:           'bg-mint-500 text-white',
  REJECTED:        'bg-coral-100 text-coral-700',
}

// Options shown in the candidates-table FilterMenu. Kept in sync with the
// CANDIDATE_STATUS_STYLES keys above - any new status pill needs a matching
// entry here so users can filter by it.
const CANDIDATE_FILTER_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "EVALUATED", label: "Evaluated" },
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
  const time = d.toLocaleTimeString("en-US", {
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

// ── Add Candidate Modal ───────────────────────────────────────────────────────

function AddCandidateModal({ jobId, onClose, onAdded }) {
  const { user } = useAuth();
  // Mirrors the AddCandidateToJob Pydantic model on the backend:
  //   name + email are required (so the candidate doc has real identity);
  //   phone, cv_url, cover_letter_url, interviewer, scheduled_at are optional.
  const [form_state, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cv_url: "",
    cover_letter_url: "",
    interviewer: "",
    scheduled_at: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Interviewers in the caller's company - powers the combobox below.
  const [interviewers, setInterviewers] = useState([]);

  useEffect(() => {
    if (!user?.comp_id) return;
    api
      .listUsers({ comp_id: user.comp_id, role: "interviewer" })
      .then(setInterviewers)
      .catch(() => setInterviewers([])); // empty -> dropdown shows "no interviewers"
  }, [user?.comp_id]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Required fields
    if (!form_state.name.trim()) return setError("Candidate name is required.");
    if (!isFullName(form_state.name))
      return setError(
        "Please enter a real name (2-100 characters, includes letters)."
      );
    if (!form_state.email.trim())
      return setError("Candidate email is required.");
    if (!isEmail(form_state.email))
      return setError("Please enter a valid email address.");
    // Optional fields - only validate format when the user actually filled them in
    if (form_state.phone.trim() && !isPhone(form_state.phone))
      return setError(
        "Phone number looks malformed (digits, +, spaces, dashes only)."
      );
    if (form_state.cv_url.trim() && !isHttpUrl(form_state.cv_url))
      return setError("CV URL must start with http:// or https://");
    if (
      form_state.cover_letter_url.trim() &&
      !isHttpUrl(form_state.cover_letter_url)
    )
      return setError("Cover Letter URL must start with http:// or https://");
    // Booking the past doesn't make sense - even if the candidate showed up
    // late, you'd update an existing record, not back-date a new one.
    if (form_state.scheduled_at && !isFutureDateTime(form_state.scheduled_at))
      return setError("Scheduled date/time must be in the future.");

    setError(null);
    setSubmitting(true);
    // Convert empty optional strings to null so EmailStr / URL validators
    // on the backend don't trip on "".
    const body = {
      name: form_state.name.trim(),
      email: form_state.email.trim().toLowerCase(),
      phone: form_state.phone.trim() || null,
      cv_url: form_state.cv_url.trim() || null,
      cover_letter_url: form_state.cover_letter_url.trim() || null,
      interviewer: form_state.interviewer.trim() || null,
      scheduled_at: form_state.scheduled_at || null,
    };
    try {
      const res = await authedFetch(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Surface FastAPI's actual error so 422s aren't silently "Failed to add candidate."
        const data = await res.json().catch(() => null);
        const detail = data?.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
            ? detail
                .map((d) => `${d.loc?.slice(1).join(".")}: ${d.msg}`)
                .join(" • ")
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      onAdded(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={modal.overlay}>
      <div
        className={`${modal.panel} scrollbar-primary max-w-md max-h-[90vh] overflow-y-auto`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 text-xl leading-none"
        >
          ×
        </button>
        <h2 className="text-xl font-bold text-neutral-800 mb-1">
          Add Candidate
        </h2>
        <p className="text-xs text-neutral-400 mb-5">
          Required fields are indicated with an asterisk *
        </p>

        <form onSubmit={handleSubmit} className={`${flex.col} gap-4`}>
          <SectionLabel>Candidate</SectionLabel>

          <div>
            <label className={form.label}>Full Name *</label>
            <input
              value={form_state.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="eg. John Doe"
              className={form.input}
            />
          </div>
          <div>
            <label className={form.label}>Email *</label>
            <input
              type="email"
              value={form_state.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="eg. john.doe@example.com"
              className={form.input}
            />
          </div>
          <div>
            <label className={form.label}>Phone</label>
            <input
              value={form_state.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="eg. +61 412 345 678"
              className={form.input}
            />
          </div>
          <div>
            <label className={form.label}>CV URL</label>
            <input
              type="url"
              value={form_state.cv_url}
              onChange={(e) => set("cv_url", e.target.value)}
              placeholder="https://..."
              className={form.input}
            />
          </div>
          <div>
            <label className={form.label}>Cover Letter URL</label>
            <input
              type="url"
              value={form_state.cover_letter_url}
              onChange={(e) => set("cover_letter_url", e.target.value)}
              placeholder="https://..."
              className={form.input}
            />
          </div>

          <SectionLabel>Interview (optional)</SectionLabel>

          <div>
            <label className={form.label}>Interviewer</label>
            <InterviewerCombobox
              value={form_state.interviewer}
              onChange={(v) => set("interviewer", v)}
              options={interviewers}
            />
          </div>
          <div>
            <label className={form.label}>Scheduled Date & Time</label>
            <input
              type="datetime-local"
              value={form_state.scheduled_at}
              onChange={(e) => set("scheduled_at", e.target.value)}
              // Browser-level guard so the picker hides past times.
              // The submit handler re-checks (browsers can be bypassed).
              min={new Date().toISOString().slice(0, 16)}
              className={form.input}
            />
          </div>

          {error && <p className={form.error}>{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={`${button.cancel} px-6 py-2`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`${button.primary} disabled:opacity-60`}
            >
              {submitting ? "Adding…" : "Add Candidate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wider text-primary-600 pt-1">
      {children}
    </div>
  );
}

// Searchable dropdown for picking an interviewer from the company roster.
// Behaviour:
//   - typing filters the list by full_name / username / email (case-insensitive)
//   - clicking an option fills the field with the user's full_name
//   - clicking outside closes the panel
//   - this is a SELECT (not free-text) - the picker only ever sets values
//     from the supplied options, so we don't end up with typos in the DB
function InterviewerCombobox({ value, onChange, options }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Keep query in sync if the parent clears/sets value externally.
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Close panel on outside click.
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? options.filter(
        (o) =>
          (o.full_name || "").toLowerCase().includes(q) ||
          (o.username || "").toLowerCase().includes(q) ||
          (o.email || "").toLowerCase().includes(q)
      )
    : options;

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={
          options.length === 0
            ? "No interviewers in your company yet"
            : "Type to search interviewers…"
        }
        className={form.input}
      />
      {open && (
        <div className="scrollbar-primary absolute z-10 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-400">
              {options.length === 0
                ? "No interviewers yet — invite one from the admin dashboard."
                : `No matches for "${query}".`}
            </div>
          ) : (
            <ul>
              {filtered.map((o) => (
                <li key={o.userid}>
                  <button
                    type="button"
                    onClick={() => {
                      const picked = o.full_name || o.username || o.email || "";
                      onChange(picked);
                      setQuery(picked);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary-500/10 transition-colors flex items-center gap-3"
                  >
                    <Avatar
                      name={o.full_name || o.username || o.email || "?"}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-800 truncate">
                        {o.full_name || o.username}
                      </div>
                      {o.email && (
                        <div className="text-xs text-neutral-400 truncate">
                          {o.email}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Interview Status Panel ────────────────────────────────────────────────────

// Order matches the pipeline progression so the panel reads top-to-bottom
// from "not started" → "in progress" → "done". The dot colour mirrors the
// candidate-row pill palette (SCHEDULED = primary, EVALUATED = mint), so
// users can visually link the count here with the pill on the row.
const INTERVIEW_STATUS_ROWS = [
  { key: 'NOT SCHEDULED', label: 'Not Scheduled', dot: 'bg-neutral-400' },
  { key: 'SCHEDULED',     label: 'Scheduled',     dot: 'bg-primary-500' },
  { key: 'EVALUATED',     label: 'Evaluated',     dot: 'bg-mint-500'    },
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
  onDelete,
  onOpenInterview,
  onOpenCandidate,
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
            // Only two statuses surface (SCHEDULED / EVALUATED) - radio-style
            // is clearer than multi-select, and matches the dashboard.
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
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className={`${flex.row} gap-2`}>
                      {hasCompletedInterview ? (
                        // Interview done - the primary action becomes reviewing
                        // it. The interview page renders the stored transcript
                        // (and the report via View Report) for completed runs.
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
                      <button
                        type="button"
                        title="View candidate details"
                        aria-label="View candidate details"
                        onClick={() => onOpenCandidate?.(c)}
                        className={`w-7 h-7 ${flex.rowCenter} rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
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
                            i === 0
                              ? "text-yellow-500"
                              : i === 1
                              ? "text-neutral-400"
                              : i === 2
                              ? "text-amber-700"
                              : "text-neutral-500"
                          }`}
                        >
                          #{i + 1}
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

  useEffect(() => {
    async function load() {
      try {
        const [jobRes, candsRes] = await Promise.all([
          authedFetch(`/api/jobs/${id}`),
          authedFetch(`/api/jobs/${id}/candidates`),
        ]);
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
  }

  async function handleCandidateAdded() {
    try {
      const [jobRes, candsRes] = await Promise.all([
        authedFetch(`/api/jobs/${id}`),
        authedFetch(`/api/jobs/${id}/candidates`),
      ]);
      if (jobRes.ok) setJob(await jobRes.json());
      if (candsRes.ok) {
        const data = await candsRes.json().catch(() => []);
        setCandidates(Array.isArray(data) ? data : []);
      }
    } catch {}
    setShowAddCandidate(false);
  }

  async function onConfirmStart() {
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
      alert(interview?.detail || "Failed to start interview.");
      setStartTarget(null);
      return;
    }
    navigate(`/interview/${interview.intv_id}`);
  }

  // Delete flow:
  //   1. row's trash icon → setDeleteTarget(c) → DeleteCandidateModal opens
  //   2. modal owns the confirm + DELETE request + its own error state
  //   3. on success it calls onDeleted(id) → we drop the row from local
  //      state, which keeps the table in sync without a re-fetch.
  function handleCandidateDeleted(jobcand_id) {
    setCandidates((rows) => rows.filter((r) => r.id !== jobcand_id));
    setDeleteTarget(null);
  }

  // Capacity gate. Candidates count comes from the freshly-loaded list
  // (which the AddCandidate flow optimistically appends to), so it always
  // reflects the latest state without re-fetching the job. We treat a
  // missing/zero cap as "no cap" so legacy rows aren't locked out.
  const capacity = job?.candidates_total ?? 0;
  const isFull = capacity > 0 && candidates.length >= capacity;

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
              onClick={() => navigate("/jobs")}
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
              Back to Jobs
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
          <div className={`col-span-2 ${card.base}`}>
            <div className="flex items-start justify-between mb-3">
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
                  Last Update{" "}
                  {new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
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
                    STATUS_STYLES[job.status] ??
                    "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {job.status}
                </span>
              </div>
            </div>

            <div className="mb-3">
              <p className="text-sm font-bold text-neutral-700 mb-1">
                Description
              </p>
              <p className="text-sm text-neutral-500 leading-relaxed">
                {job.description || "—"}
              </p>
            </div>

            {job.employment_type?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
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

            <div className={`${flex.row} gap-8 text-sm text-neutral-500`}>
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
            onDelete={(c) => setDeleteTarget(c)}
            onOpenInterview={(intvId) => navigate(`/interview/${intvId}`)}
            onOpenCandidate={(c) => {
              navigate(`/candidates/${c.cand_id}/${id}`)
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
          jobs={job ? [{ ...job, id }] : []}
          defaultJobId={id}
          onClose={() => setShowAddCandidate(false)}
          onSaved={handleCandidateAdded}
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
    </div>
  );
}