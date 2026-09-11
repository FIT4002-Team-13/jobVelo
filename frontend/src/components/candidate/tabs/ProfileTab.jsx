import { useNavigate } from "react-router-dom";
import CandidateInfoCard from "../CandidateInfoCard.jsx";
import CandidateScorePanel from "../CandidateScorePanel.jsx";
import CvAnalysisScorePanel from "../CvAnalysisScorePanel.jsx";

export default function ProfileTab({
  candidate,
  job,
  interview,
  jobCand,
  interviewerName,
  cvAnalysis,
  onStartInterview,
}) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-y-auto px-10 py-6">
      <div className="grid grid-cols-3 gap-5 items-stretch">
        <CandidateInfoCard
          candidate={candidate}
          job={job}
          interview={interview}
          jobCand={jobCand}
          interviewer={interviewerName}
          onStartInterview={onStartInterview}
          onEdit={null}
          cvAnalysis={cvAnalysis}
          onViewCvAnalysis={
            jobCand?.jobcand_id
              ? () => navigate(`/cv-analysis/${jobCand.jobcand_id}`)
              : null
          }
          onAnalyseCv={null}
          analysingCv={false}
          showDocumentLinks={false}
          showRole={false}
          showMeetingDate={false}
          title="Candidate Details"
        />
        <CandidateScorePanel
          jobCand={jobCand}
          interview={interview}
          showActions={false}
        />
        <CvAnalysisScorePanel cvAnalysis={cvAnalysis} />
      </div>
    </div>
  );
}
