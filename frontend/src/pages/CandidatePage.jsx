import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex } from "../styles/layout";
import Sidebar from "../components/common/Sidebar";
import { useAuth } from "../lib/AuthContext.jsx";
import { authedFetch, api } from "../lib/api.js";
import { useToast } from "../components/common/ToastContext.jsx";

import { useInterviewData } from "../hooks/useInterviewData.js";
import { useTranscript } from "../hooks/useTranscript.js";
import { parseTimestamp } from "../utils/time.js";

import ProfileTab from "../components/candidate/tabs/ProfileTab.jsx";
import CvTab from "../components/candidate/tabs/CvTab.jsx";
import CoverLetterTab from "../components/candidate/tabs/CoverLetterTab.jsx";
import InterviewPrepTab from "../components/candidate/tabs/InterviewPrepTab.jsx";
import TranscriptAnalysisTab from "../components/candidate/tabs/TranscriptAnalysisTab.jsx";

export default function CandidatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const beginningRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef(0);
  const generateFollowUpRef = useRef(null);
  const [centerView, setCenterView] = useState("profile");
  const [cvUploading, setCvUploading] = useState(false);
  const [clUploading, setClUploading] = useState(false);
  const [prefetchedReport, setPrefetchedReport] = useState(null);

  const {
    serverData,
    candidateName,
    candidateRole,
    candidate,
    job,
    cvUrl,
    setCvUrl,
    coverLetterUrl,
    setCoverLetterUrl,
    candId,
    cvAnalysis,
    jobCand,
    isCompleted,
    intvStatus,
    setIntvStatus,
    intvDateTime,
  } = useInterviewData(id);

  // null while the fetch is still in flight - deliberately distinct from
  // "live" so the redirect guard below can't fire on the loading state's
  // default before we actually know the interview's status.
  const phase = !serverData
    ? null
    : isCompleted
    ? "debrief"
    : intvStatus === "scheduled" || intvStatus === "not_scheduled"
    ? "prep"
    : "live";

  // Someone reached this page directly (a bookmark, a link shared mid-interview,
  // or the interview was already resumed elsewhere) while it's actually in
  // progress - that experience lives only on the separate live page now.
  useEffect(() => {
    if (phase === "live") navigate(`/interview/${id}/live`, { replace: true });
  }, [phase, id, navigate]);

  useEffect(() => {
    setCenterView("profile");
  }, [phase]);

  const {
    transcript,
    highlightedEntryIdx,
    highlightedEntryId,
    transcriptEntryRefs,
  } = useTranscript(id, {
    serverData,
    candidateName,
    userId: user?.full_name,
    isCompleted,
    startTimeRef,
    timerRef,
    generateFollowUpRef,
  });

  // Silently refresh the score/evidence breakdown for the debrief panel -
  // the stored interview record only carries the report text, not the
  // scored ratings, so this re-derives them without popping the report modal.
  useEffect(() => {
    if (!isCompleted) return;
    authedFetch(`/api/interviews/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: serverData?.intv_transcript ?? [],
        duration_seconds: serverData?.intv_duration_seconds ?? 0,
        bias_incidents: serverData?.intv_bias_incidents ?? [],
      }),
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data) setPrefetchedReport(data);
      }
    });
  }, [isCompleted, id, serverData]);

  const interviewerLabel = user?.full_name || "Interviewer";

  const report =
    prefetchedReport ??
    (serverData?.intv_candidate_report
      ? {
          candidate_report: serverData.intv_candidate_report,
          interviewer_report: serverData.intv_interviewer_report,
          scores: null,
          bias_incidents: serverData.intv_bias_incidents ?? [],
        }
      : null);

  const mergedInterview = serverData && {
    ...serverData,
    intv_candidate_report: report?.candidate_report ?? serverData.intv_candidate_report,
    intv_interviewer_report: report?.interviewer_report ?? serverData.intv_interviewer_report,
    intv_bias_incidents: report?.bias_incidents ?? serverData.intv_bias_incidents ?? [],
  };

  const sections = Array.isArray(serverData?.intv_sections) ? serverData.intv_sections : [];

  function jumpToSection(sectionIndex) {
    const section = sections[sectionIndex];
    const startSeconds =
      section?.start_at != null
        ? section.start_at
        : sections
            .slice(0, sectionIndex)
            .reduce((sum, s) => sum + (s.suggested_minutes || 0) * 60, 0);

    let targetIdx = transcript.findIndex(
      (e) => parseTimestamp(e.timestamp) >= startSeconds
    );
    if (targetIdx === -1) targetIdx = transcript.length - 1;
    if (targetIdx < 0) return;

    const el = transcriptEntryRefs.current[targetIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Failed to start the interview."
        );
      }
      setIntvStatus("in_progress");
      navigate(`/interview/${id}/live`);
    } catch (err) {
      toast.error(err.message || "Failed to start the interview.");
    } finally {
      beginningRef.current = false;
    }
  }

  async function handleCvUpload(file) {
    if (!jobCand?.jobcand_id) return;
    setCvUploading(true);
    try {
      const formData = new FormData();
      formData.append("jobcand_id", jobCand.jobcand_id);
      formData.append("cv", file);
      const result = await api.analyseCv(formData);
      if (result?.cv_path) setCvUrl(`/api/files/${result.cv_path}`);
    } catch {
      // silent — user can retry
    } finally {
      setCvUploading(false);
    }
  }

  async function handleCoverLetterUpload(file) {
    if (!candId) return;
    setClUploading(true);
    try {
      const formData = new FormData();
      formData.append("cover_letter", file);
      const result = await api.uploadCandidateCoverLetter(candId, formData);
      if (result?.cand_cover_letter_url) setCoverLetterUrl(result.cand_cover_letter_url);
    } catch {
      // silent — user can retry
    } finally {
      setClUploading(false);
    }
  }

  const scheduledLabel = intvDateTime
    ? new Date(intvDateTime).toLocaleString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="flex h-screen bg-neutral-50 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-4 shrink-0">
          <div className={flex.rowBetween}>
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
          </div>

          <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-2">
            {[
              { id: "profile", label: "Profile" },
              { id: "transcript", label: phase === "debrief" ? "Transcript" : "Prep" },
              { id: "cv", label: "CV" },
              { id: "cover-letter", label: "Cover Letter" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setCenterView(v.id)}
                className={`rounded-xl px-4 py-1 text-sm font-semibold transition-colors ${
                  centerView === v.id
                    ? "bg-primary-500 text-white"
                    : "bg-primary-100 text-primary-500 hover:bg-primary-200"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex">
          {centerView === "profile" && (
            <ProfileTab
              candidate={candidate}
              job={job}
              interview={mergedInterview}
              jobCand={jobCand}
              interviewerName={interviewerLabel}
              cvAnalysis={cvAnalysis}
              onStartInterview={phase === "prep" ? beginInterview : null}
            />
          )}

          {centerView === "transcript" && phase === "prep" && (
            <InterviewPrepTab
              analysis={cvAnalysis}
              scheduledLabel={scheduledLabel}
              onBegin={beginInterview}
              onViewFullAnalysis={
                jobCand?.jobcand_id
                  ? () => navigate(`/cv-analysis/${jobCand.jobcand_id}`)
                  : null
              }
            />
          )}

          {centerView === "transcript" && phase === "debrief" && (
            <TranscriptAnalysisTab
              transcript={transcript}
              transcriptEntryRefs={transcriptEntryRefs}
              highlightedEntryIdx={highlightedEntryIdx}
              highlightedEntryId={highlightedEntryId}
              interviewerLabel={interviewerLabel}
              sections={sections}
              jumpToSection={jumpToSection}
              report={report}
              interview={mergedInterview}
            />
          )}

          {centerView === "cv" && (
            <CvTab
              cvUrl={cvUrl}
              uploading={cvUploading}
              onUpload={handleCvUpload}
              cvAnalysis={cvAnalysis}
            />
          )}

          {centerView === "cover-letter" && (
            <CoverLetterTab
              coverLetterUrl={coverLetterUrl}
              uploading={clUploading}
              onUpload={handleCoverLetterUpload}
            />
          )}
        </div>
      </div>
    </div>
  );
}
