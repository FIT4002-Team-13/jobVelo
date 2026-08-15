import { Eye, Play } from "lucide-react";

function getInitials(name) {
  if (!name) return "--";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "--";
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function formatDateTime(isoString) {
  if (!isoString) return "--";

  const date = new Date(isoString);
  const datePart = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart}, ${timePart}`;
}

function getAverageScore(jobCandidate) {
  const scores = [
    jobCandidate?.jobcand_communication_score,
    jobCandidate?.jobcand_skill_score,
    jobCandidate?.jobcand_problem_solving_score,
  ].filter((score) => typeof score === "number");

  if (scores.length === 0) return null;

  return (
    scores.reduce((sum, score) => sum + score, 0) / scores.length
  ).toFixed(1);
}

function deriveStatus(interview, score) {
  if (!interview) return "SCHEDULED";
  if (interview.intv_status === "scheduled") return "SCHEDULED";
  if (score === null) return "EVALUATED";
  if (Number(score) >= 8.5) return "HIRED";
  if (Number(score) <= 5.0) return "REJECTED";
  return "EVALUATED";
}

function getStatusStyles(status) {
  switch (status) {
    case "HIRED":
      return {
        badgeBg: "#D0FFEB",
        badgeText: "#68E3AD",
        buttonBg: "#F0F0F0",
        buttonText: "#868B98",
        buttonDisabled: true,
      };
    case "REJECTED":
      return {
        badgeBg: "#FEE3E4",
        badgeText: "#D34343",
        buttonBg: "#F0F0F0",
        buttonText: "#868B98",
        buttonDisabled: true,
      };
    case "EVALUATED":
      return {
        badgeBg: "#F0F0F0",
        badgeText: "#868B98",
        buttonBg: "#F0F0F0",
        buttonText: "#868B98",
        buttonDisabled: true,
      };
    case "SCHEDULED":
    default:
      return {
        badgeBg: "#F0F0F0",
        badgeText: "#868B98",
        buttonBg: "#D0FFEB",
        buttonText: "#68E3AD",
        buttonDisabled: false,
      };
  }
}

function Avatar({ initials, bgColor }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center font-semibold text-white"
      style={{
        width: "40px",
        height: "40px",
        minWidth: "40px",
        minHeight: "40px",
        borderRadius: "9999px",
        backgroundColor: bgColor,
        fontSize: "15px",
        lineHeight: 1,
      }}
    >
      {initials}
    </div>
  );
}

function HeaderCell({ children }) {
  return (
    <div className="w-full min-w-0 flex items-center justify-start">
      {children}
    </div>
  );
}

function BodyCell({ children }) {
  return (
    <div className="w-full min-w-0 flex items-center justify-start">
      {children}
    </div>
  );
}

export default function CandidateTable({
  rows = [],
  onStartInterview,
  onViewCandidate,
}) {
  const HEADER_HEIGHT = 30;
  const ROW_HEIGHT = 54;
  const VISIBLE_ROWS = 4;
  const TABLE_HEIGHT = HEADER_HEIGHT + ROW_HEIGHT * VISIBLE_ROWS;

  // Candidate/interviewer slightly smaller
  // Status and datetime slightly wider
  // Score narrow
  // Actions enough for button + eye
  const GRID_COLS = "2.2fr 1.45fr 1.7fr 0.7fr 2.2fr 1.35fr";

  return (
    <div
      className="w-full overflow-hidden rounded-[32px] bg-white"
      style={{
        height: `${TABLE_HEIGHT}px`,
      }}
    >
      <div
        className="grid px-8 font-semibold"
        style={{
          gridTemplateColumns: GRID_COLS,
          backgroundColor: "#F0F0F0",
          color: "#868B98",
          height: `${HEADER_HEIGHT}px`,
          fontSize: "13px",
          alignItems: "center",
        }}
      >
        <HeaderCell>CANDIDATE</HeaderCell>
        <HeaderCell>STATUS</HeaderCell>
        <HeaderCell>DATETIME</HeaderCell>
        <HeaderCell>SCORE</HeaderCell>
        <HeaderCell>INTERVIEWER</HeaderCell>
        <HeaderCell>ACTIONS</HeaderCell>
      </div>

      <div
        className="overflow-y-auto no-scrollbar"
        style={{
          height: `${ROW_HEIGHT * VISIBLE_ROWS}px`,
        }}
      >
        {rows.map((row, index) => {
          const score = getAverageScore(row.jobCandidate);
          const status = deriveStatus(row.interview, score);
          const styles = getStatusStyles(status);

          return (
            <div
              key={row.rowId}
              className="grid px-8"
              style={{
                gridTemplateColumns: GRID_COLS,
                height: `${ROW_HEIGHT}px`,
                alignItems: "center",
                borderTop: index === 0 ? "none" : "1px solid #F0F0F0",
              }}
            >
              <BodyCell>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    initials={getInitials(row.candidate?.cand_full_name)}
                    bgColor={row.candidateAvatarColor}
                  />
                  <span
                    className="truncate font-medium text-[#3F3F46]"
                    style={{ fontSize: "15px" }}
                  >
                    {row.candidate?.cand_full_name || "--"}
                  </span>
                </div>
              </BodyCell>

              <BodyCell>
                <span
                  className="inline-flex items-center justify-center font-semibold"
                  style={{
                    minWidth: "104px",
                    height: "22px",
                    padding: "0 12px",
                    borderRadius: "9999px",
                    backgroundColor: styles.badgeBg,
                    color: styles.badgeText,
                    fontSize: "12px",
                  }}
                >
                  {status}
                </span>
              </BodyCell>

              <BodyCell>
                <span
                  className="truncate text-[#3F3F46]"
                  style={{ fontSize: "14px" }}
                >
                  {formatDateTime(row.interview?.intv_date_time)}
                </span>
              </BodyCell>

              <BodyCell>
                <span className="text-[#3F3F46]" style={{ fontSize: "14px" }}>
                  {score ?? "--"}
                </span>
              </BodyCell>

              <BodyCell>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    initials={getInitials(row.interviewer?.full_name || "--")}
                    bgColor={row.interviewerAvatarColor}
                  />
                  <span
                    className="truncate font-medium text-[#3F3F46]"
                    style={{ fontSize: "15px" }}
                  >
                    {row.interviewer?.full_name || "--"}
                  </span>
                </div>
              </BodyCell>

              <BodyCell>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    disabled={styles.buttonDisabled}
                    onClick={() => onStartInterview?.(row)}
                    className="flex items-center whitespace-nowrap font-semibold"
                    style={{
                      gap: "6px",
                      height: "26px",
                      padding: "0 14px",
                      borderRadius: "12px",
                      backgroundColor: styles.buttonBg,
                      color: styles.buttonText,
                      cursor: styles.buttonDisabled ? "not-allowed" : "pointer",
                      fontSize: "13px",
                    }}
                  >
                    <Play size={13} fill="currentColor" />
                    Start Interview
                  </button>

                  <button
                    type="button"
                    onClick={() => onViewCandidate?.(row)}
                    className="flex shrink-0 items-center justify-center text-[#868B98] transition hover:opacity-80"
                    style={{
                      width: "18px",
                      height: "18px",
                    }}
                  >
                    <Eye size={18} />
                  </button>
                </div>
              </BodyCell>
            </div>
          );
        })}
      </div>
    </div>
  );
}