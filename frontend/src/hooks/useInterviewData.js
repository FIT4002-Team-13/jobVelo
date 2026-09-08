import { useState, useEffect } from "react";
import { authedFetch, api } from "../lib/api.js";

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
            .then((job) => { if (job.title) setCandidateRole(job.title); })
            .catch(() => {});
        }

        if (data.cand_id) {
          setCandId(data.cand_id);
          authedFetch(`/api/candidates/${data.cand_id}`)
            .then((r) => r.json())
            .then((cand) => {
              if (cand.cand_full_name) setCandidateName(cand.cand_full_name);
              if (cand.cand_cv_url) setCvUrl(cand.cand_cv_url);
            })
            .catch(() => {});
        }

        if (data.cand_id && data.job_id && !completed) {
          authedFetch(`/api/job-candidates/by-candidate/${data.cand_id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((links) => {
              const link = Array.isArray(links) ? links.find((l) => l.job_id === data.job_id) : null;
              if (!link?.jobcand_id) return;
              api
                .getCvAnalysisByJobcand(link.jobcand_id)
                .then((a) => {
                  if (a && (a.status === "completed" || a.key_strengths)) setCvAnalysis(a);
                })
                .catch(() => {});
            })
            .catch(() => {});
        }
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
