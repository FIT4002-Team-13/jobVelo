import { useState, useEffect } from "react";
import { api } from "../lib/api.js";

export function useInterviewData(id) {
  const [serverData, setServerData] = useState(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [job, setJob] = useState(null);
  const [cvUrl, setCvUrl] = useState(null);
  const [coverLetterUrl, setCoverLetterUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [candId, setCandId] = useState(null);
  const [cvAnalysis, setCvAnalysis] = useState(null);
  const [cvAnalysisKey, setCvAnalysisKey] = useState(0);
  const [jobCand, setJobCand] = useState(null);
  // Flips true once the CV-analysis lookup has settled (found, absent, or
  // failed), so the question pool knows whether to seed from it or fall back
  // to job-description questions - without racing the fetch.
  const [cvAnalysisLoaded, setCvAnalysisLoaded] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [intvStatus, setIntvStatus] = useState(null);
  const [intvDateTime, setIntvDateTime] = useState(null);

  // Pull the candidate record into local state. Shared by the initial load and
  // by refreshCandidate() so an in-page edit reflects without a hard reload.
  function loadCandidate(cid) {
    return api
      .getCandidate(cid)
      .then((cand) => {
        if (cand.cand_full_name) setCandidateName(cand.cand_full_name);
        if (cand.cand_cv_url) setCvUrl(cand.cand_cv_url);
        if (cand.cand_cover_letter_url) setCoverLetterUrl(cand.cand_cover_letter_url);
        setCandidate(cand);
      })
      .catch(() => {});
  }

  useEffect(() => {
    api.getInterview(id).then((data) => {
      const completed = data.intv_status === "completed";
      setIsCompleted(completed);
      setIntvStatus(data.intv_status ?? null);
      setIntvDateTime(data.intv_date_time ?? null);
      setServerData(data);

      if (data.job_id) {
        setJobId(data.job_id);
        api
          .getJob(data.job_id)
          .then((j) => {
            if (j.title) setCandidateRole(j.title);
            setJob(j);
          })
          .catch(() => {});
      }

      if (data.cand_id) {
        setCandId(data.cand_id);
        loadCandidate(data.cand_id);
      }

      if (data.cand_id && data.job_id) {
        api
          .getJobCandidatesByCandidate(data.cand_id)
          .then((links) => {
            const link = Array.isArray(links) ? links.find((l) => l.job_id === data.job_id) : null;
            if (!link?.jobcand_id) {
              setCvAnalysisLoaded(true);
              return;
            }
            setJobCand(link);
          })
          .catch(() => setCvAnalysisLoaded(true));
      } else {
        setCvAnalysisLoaded(true);
      }
    });
  }, [id]);

  // Poll CV analysis while the backend job is still running so the UI
  // automatically flips from the loading state to the results without a reload.
  useEffect(() => {
    const jobcandId = jobCand?.jobcand_id;
    if (!jobcandId) return;

    let cancelled = false;
    let timer = null;

    async function poll() {
      try {
        const a = await api.getCvAnalysisByJobcand(jobcandId);
        if (cancelled) return;
        setCvAnalysis(a ?? null);
        if (a?.status === "processing") timer = setTimeout(poll, 4000);
      } catch {
        if (!cancelled) setCvAnalysis(null);
      } finally {
        if (!cancelled) setCvAnalysisLoaded(true);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobCand?.jobcand_id, cvAnalysisKey]);

  return {
    serverData,
    candidateName,
    setCandidateName,
    candidateRole,
    candidate,
    refreshCandidate: () => (candId ? loadCandidate(candId) : Promise.resolve()),
    job,
    cvUrl,
    setCvUrl,
    coverLetterUrl,
    setCoverLetterUrl,
    jobId,
    candId,
    cvAnalysis,
    setCvAnalysis,
    refreshCvAnalysis: () => setCvAnalysisKey((k) => k + 1),
    jobCand,
    cvAnalysisLoaded,
    isCompleted,
    setIsCompleted,
    intvStatus,
    setIntvStatus,
    intvDateTime,
  };
}
