import { useState, useEffect } from "react";
import { authedFetch, api } from "../lib/api.js";

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
  const [isCompleted, setIsCompleted] = useState(false);
  const [intvStatus, setIntvStatus] = useState(null);
  const [intvDateTime, setIntvDateTime] = useState(null);

  useEffect(() => {
    authedFetch(`/api/interviews/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const completed = data.intv_status === "completed";
        setIsCompleted(completed);
        setIntvStatus(data.intv_status ?? null);
        setIntvDateTime(data.intv_date_time ?? null);
        setServerData(data);

        if (data.job_id) {
          setJobId(data.job_id);
          authedFetch(`/api/jobs/${data.job_id}`)
            .then((r) => r.json())
            .then((j) => {
              if (j.title) setCandidateRole(j.title);
              setJob(j);
            })
            .catch(() => {});
        }

        if (data.cand_id) {
          setCandId(data.cand_id);
          authedFetch(`/api/candidates/${data.cand_id}`)
            .then((r) => r.json())
            .then((cand) => {
              if (cand.cand_full_name) setCandidateName(cand.cand_full_name);
              if (cand.cand_cv_url) setCvUrl(cand.cand_cv_url);
              if (cand.cand_cover_letter_url) setCoverLetterUrl(cand.cand_cover_letter_url);
              setCandidate(cand);
            })
            .catch(() => {});
        }

        if (data.cand_id && data.job_id) {
          authedFetch(`/api/job-candidates/by-candidate/${data.cand_id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((links) => {
              const link = Array.isArray(links) ? links.find((l) => l.job_id === data.job_id) : null;
              if (!link?.jobcand_id) return;
              setJobCand(link);
            })
            .catch(() => {});
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
    isCompleted,
    setIsCompleted,
    intvStatus,
    setIntvStatus,
    intvDateTime,
  };
}
