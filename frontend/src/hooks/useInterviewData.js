import { useState, useEffect } from "react";
import { api } from "../lib/api.js";

export function useInterviewData(id) {
  const [serverData, setServerData] = useState(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [cvUrl, setCvUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [candId, setCandId] = useState(null);
  const [cvAnalysis, setCvAnalysis] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [intvStatus, setIntvStatus] = useState(null);
  const [intvDateTime, setIntvDateTime] = useState(null);

  useEffect(() => {
    // One aggregate call replaces the old fan-out of
    // interview -> job -> candidate -> job-candidates -> cv-analysis.
    api.getInterviewContext(id).then((ctx) => {
      const data = ctx.interview;
      const completed = data.intv_status === "completed";
      setIsCompleted(completed);
      setIntvStatus(data.intv_status ?? null);
      setIntvDateTime(data.intv_date_time ?? null);
      setServerData(data);

      if (data.job_id) setJobId(data.job_id);
      if (data.cand_id) setCandId(data.cand_id);
      if (ctx.job?.title) setCandidateRole(ctx.job.title);
      if (ctx.candidate?.cand_full_name) setCandidateName(ctx.candidate.cand_full_name);
      if (ctx.candidate?.cand_cv_url) setCvUrl(ctx.candidate.cand_cv_url);

      // Only surface the CV analysis on a still-running interview, matching
      // the previous behaviour (the prep/live screens use it; the debrief
      // screen doesn't).
      if (!completed && ctx.cv_analysis) setCvAnalysis(ctx.cv_analysis);
    });
  }, [id]);

  return {
    serverData,
    candidateName,
    setCandidateName,
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
  };
}
