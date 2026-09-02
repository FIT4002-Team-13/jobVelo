import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { flex, button } from "../styles/layout";
import { useAuth } from "../lib/AuthContext.jsx";
import { authedFetch } from "../lib/api.js";
import { useToast } from "../components/common/ToastContext.jsx";

import { TranscriptPanel } from "../components/interview/InterviewTranscriptPanel.jsx";
import { SuggestedQuestionDeck } from "../components/interview/InterviewQuestionDeck.jsx";
import { InterviewSectionTimeline } from "../components/interview/InterviewSectionTimers.jsx";
import { InterviewReportModal } from "../components/interview/InterviewReportModal.jsx";
import InterviewPrepPage from "./InterviewPrepPage.jsx";
import InterviewPostInterviewPage from "./InterviewPostInterviewPage.jsx";

import { useInterviewData } from "../hooks/useInterviewData.js";
import { useBias } from "../hooks/useBias.js";
import { useInterviewSections } from "../hooks/useInterviewSections.js";
import { useTranscript } from "../hooks/useTranscript.js";
import { useInterviewQuestions } from "../hooks/useInterviewQuestions.js";
import { useAudioCapture } from "../hooks/useAudioCapture.js";
import { formatTimer, parseTimestamp } from "../utils/time.js";

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const timerRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const generateFollowUpRef = useRef(null);
  const beginningRef = useRef(false);
  const [reportState, setReportState] = useState({ phase: "idle" });

  const {
    serverData,
    candidateName,
    candidateRole,
    cvUrl,
    jobId,
    candId,
    cvAnalysis,
    isCompleted,
    setIsCompleted,
    intvStatus,
    setIntvStatus,
    intvDateTime,
  } = useInterviewData(id);

  const { biasWarnings, biasIncidentsRef, addBiasWarning, dismissBiasWarning } = useBias(timerRef);

  const { sections, sectionStates, sectionsScrollRef, sectionCardRefs, startSection, pauseSection, resumeSection, doneSection } =
    useInterviewSections(id, { serverData, timerRef });

  const {
    transcript,
    transcriptRef,
    transcriptVisible,
    setTranscriptVisible,
    hasNewTranscriptUpdates,
    highlightedEntryIdx,
    setHighlightedEntryIdx,
    highlightedEntryId,
    transcriptContainerRef,
    transcriptEntryRefs,
    partialEntryRef,
    displayPartialEntryRef,
    appendTranscript,
    handleNoteChange,
    showLatestTranscript,
    jumpToTranscriptEntry,
  } = useTranscript(id, {
    serverData,
    candidateName,
    userId: user?.full_name,
    isCompleted,
    startTimeRef,
    timerRef,
    generateFollowUpRef,
  });

  const {
    questions,
    questionsLoading,
    questionsError,
    similarQuestionId,
    displayedQuestions,
    generateFollowUpQuestions,
    generateMoreLike,
    ignoreQuestion,
  } = useInterviewQuestions(jobId, { isCompleted, intvStatus, transcriptRef });

  useEffect(() => {
    generateFollowUpRef.current = generateFollowUpQuestions;
  }, [generateFollowUpQuestions]);

  const { isMicActive, isScreenSharing, isPaused, timer, videoRef, stopScreenShare, toggleScreenShare, togglePause } =
    useAudioCapture({
      candidateName,
      user,
      appendTranscript,
      addBiasWarning,
      partialEntryRef,
      displayPartialEntryRef,
      serverData,
      isCompleted,
      timerRef,
      startTimeRef,
    });

  function jumpToSection(sectionIndex) {
    const section = sections[sectionIndex];
    const startSeconds =
      section?.start_at != null
        ? section.start_at
        : sections.slice(0, sectionIndex).reduce((sum, s) => sum + (s.suggested_minutes || 0) * 60, 0);

    let targetIdx = transcript.findIndex((e) => parseTimestamp(e.timestamp) >= startSeconds);
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
      localStorage.removeItem(`transcript-${id}`);
      setReportState({ phase: "ready", data });
    } catch (err) {
      setReportState({ phase: "error", error: err.message || "Something went wrong." });
    }
  }

  const phase = isCompleted ? "debrief" : intvStatus === "scheduled" || intvStatus === "not_scheduled" ? "prep" : "live";

  return (
    <div className="h-screen flex flex-col bg-neutral-50 font-sans overflow-hidden">
      <header className="bg-neutral-0 border-b border-neutral-200 px-10 py-4 shrink-0">
        <div className={flex.rowBetween}>
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
