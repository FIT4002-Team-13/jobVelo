import CandidateTable from '../components/landing/CandidateTable.jsx';

const candidates = [
  {
    cand_id: "cand_1",
    cand_full_name: "John Doe",
    cand_email: "john@example.com",
    comp_id: "comp_1",
  },
  {
    cand_id: "cand_2",
    cand_full_name: "Sophia",
    cand_email: "sophia@example.com",
    comp_id: "comp_1",
  },
  {
    cand_id: "cand_3",
    cand_full_name: "Isabella Garcia",
    cand_email: "isabella@example.com",
    comp_id: "comp_1",
  },
  {
    cand_id: "cand_4",
    cand_full_name: "Olivia",
    cand_email: "olivia@example.com",
    comp_id: "comp_1",
  },
  {
    cand_id: "cand_5",
    cand_full_name: "Olivia",
    cand_email: "olivia@example.com",
    comp_id: "comp_1",
  },
];

const jobCandidates = [
  {
    jobcand_id: "jobcand_1",
    cand_id: "cand_1",
    job_id: "job_1",
    jobcand_communication_score: 7.2,
    jobcand_skill_score: 7.0,
    jobcand_problem_solving_score: 7.1,
  },
  {
    jobcand_id: "jobcand_2",
    cand_id: "cand_2",
    job_id: "job_1",
    jobcand_communication_score: 9.0,
    jobcand_skill_score: 9.2,
    jobcand_problem_solving_score: 9.1,
  },
  {
    jobcand_id: "jobcand_3",
    cand_id: "cand_3",
    job_id: "job_1",
    jobcand_communication_score: null,
    jobcand_skill_score: null,
    jobcand_problem_solving_score: null,
  },
  {
    jobcand_id: "jobcand_4",
    cand_id: "cand_4",
    job_id: "job_1",
    jobcand_communication_score: 4.2,
    jobcand_skill_score: 4.3,
    jobcand_problem_solving_score: 4.4,
  },
  {
    jobcand_id: "jobcand_5",
    cand_id: "cand_5",
    job_id: "job_1",
    jobcand_communication_score: 4.2,
    jobcand_skill_score: 4.3,
    jobcand_problem_solving_score: 4.4,
  }
];

const interviews = [
  {
    intv_id: "intv_1",
    cand_id: "cand_1",
    job_id: "job_1",
    intv_date_time: "2026-05-15T12:00:00Z",
    intv_status: "evaluated",
  },
  {
    intv_id: "intv_2",
    cand_id: "cand_2",
    job_id: "job_1",
    intv_date_time: "2026-05-15T12:00:00Z",
    intv_status: "evaluated",
  },
  {
    intv_id: "intv_3",
    cand_id: "cand_3",
    job_id: "job_1",
    intv_date_time: "2026-05-15T12:00:00Z",
    intv_status: "scheduled",
  },
  {
    intv_id: "intv_4",
    cand_id: "cand_4",
    job_id: "job_1",
    intv_date_time: "2026-05-15T12:00:00Z",
    intv_status: "evaluated",
  },
  {
    intv_id: "intv_5",
    cand_id: "cand_5",
    job_id: "job_1",
    intv_date_time: "2026-05-15T12:00:00Z",
    intv_status: "evaluated",
  }
];

const userInterview = [
  { intvuser_id: "intvuser_1", user_id: "user_1", intv_id: "intv_1" },
  { intvuser_id: "intvuser_2", user_id: "user_2", intv_id: "intv_2" },
  { intvuser_id: "intvuser_3", user_id: "user_3", intv_id: "intv_3" },
  { intvuser_id: "intvuser_4", user_id: "user_4", intv_id: "intv_4" },
  { intvuser_id: "intvuser_5", user_id: "user_5", intv_id: "intv_5" },
];

const users = [
  { userid: "user_1", full_name: "John Doe" },
  { userid: "user_2", full_name: "Dave Smith" },
  { userid: "user_3", full_name: "Lee JunJie" },
  { userid: "user_4", full_name: "Emma Johnson" },
  { userid: "user_5", full_name: "Sarah Williams" },
];

const avatarColors = ["#7C94F5", "#68E3AD", "#D34343", "#68E3AD"];

function getAvatarColor(index) {
  return avatarColors[index % avatarColors.length];
}

export default function CandidateTableTestPage() {
  const rows = jobCandidates
    .filter((jobCandidate) => jobCandidate.job_id === "job_1")
    .map((jobCandidate, index) => {
      const candidate = candidates.find(
        (item) => item.cand_id === jobCandidate.cand_id
      );

      const interview = interviews.find(
        (item) =>
          item.cand_id === jobCandidate.cand_id &&
          item.job_id === jobCandidate.job_id
      );

      const interviewUser = interview
        ? userInterview.find((item) => item.intv_id === interview.intv_id)
        : null;

      const interviewer = interviewUser
        ? users.find((item) => item.userid === interviewUser.user_id)
        : null;

      return {
        rowId: jobCandidate.jobcand_id,
        candidate,
        jobCandidate,
        interview,
        interviewer,
        candidateAvatarColor: getAvatarColor(index),
        interviewerAvatarColor: interviewer
          ? getAvatarColor(index + 1)
          : "#868B98",
      };
    })
    .filter((row) => row.candidate);

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="mx-auto max-w-[1600px]">

        <CandidateTable
          rows={rows}
          onStartInterview={(row) => {
            console.log("Start interview", row);
          }}
          onViewCandidate={(row) => {
            console.log("View candidate", row);
          }}
        />
      </div>
    </div>
  );
}