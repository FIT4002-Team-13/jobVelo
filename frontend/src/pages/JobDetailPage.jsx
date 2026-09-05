import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/common/Sidebar";
import JobFormModal from "../components/job-candidate/JobFormModal";
import StartInterviewModal from "../components/job-candidate/StartInterviewModal";
import DeleteCandidateModal from "../components/job-candidate/DeleteCandidateModal";
import EditCandidateForm from "../components/candidate/EditCandidateForm";
import AddCandidateForm from "../components/candidate/AddCandidateForm";
import { flex, card, badge, button, page } from "../styles/layout";

import { useAuth } from "../lib/AuthContext.jsx";
import { useToast } from "../components/common/ToastContext.jsx";
import { authedFetch, downloadFileWithAuth } from "../lib/api.js";
import { formatDate } from "../utils/format.js";
import { JOB_STATUS_STYLES, FALLBACK_STATUS_CLASS } from "../utils/status.js";
import InterviewStatusPanel from "../components/job-candidate/InterviewStatusPanel";
import CandidatesTable from "../components/job-candidate/CandidatesTable";

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
                    JOB_STATUS_STYLES[displayStatus] ?? FALLBACK_STATUS_CLASS
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