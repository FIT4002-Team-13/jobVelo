// Interviewer questioning-pattern analysis, shown below the interviewer report
// summary in the post-interview view (and mirrored in the downloaded PDF).
// Renders an empty state when the report carries no analysis (older interviews
// completed before this feature, or nothing detected).
function OpenClosedBar({ open, closed }) {
  const total = open + closed || 1;
  const openPct = (open / total) * 100;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
        Question mix
      </p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-pill bg-neutral-100">
        <div className="bg-primary-400" style={{ width: `${openPct}%` }} />
        <div className="bg-sky-300" style={{ width: `${100 - openPct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-pill bg-primary-400" />
          {open} open-ended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-pill bg-sky-300" />
          {closed} closed
        </span>
      </div>
    </div>
  );
}

export default function QuestioningPatternsPanel({ data }) {
  const qp = data || null;
  const totalQuestions = (qp?.open_questions || 0) + (qp?.closed_questions || 0);
  const hasContent =
    qp &&
    (qp.summary ||
      qp.plan_adherence ||
      totalQuestions > 0 ||
      (qp.topic_coverage?.length ?? 0) > 0);

  return (
    <div className="rounded-2xl border border-neutral-200 p-5">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
        Questioning Patterns
      </h4>

      {!hasContent ? (
        <p className="text-sm italic text-neutral-400">
          No questioning-pattern analysis for this interview.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {qp.summary && (
            <p className="text-sm leading-relaxed text-neutral-700">{qp.summary}</p>
          )}

          {totalQuestions > 0 && (
            <OpenClosedBar open={qp.open_questions || 0} closed={qp.closed_questions || 0} />
          )}

          {qp.topic_coverage?.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                Topic coverage
              </p>
              <ul className="flex flex-col gap-1.5">
                {qp.topic_coverage.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        t.covered ? "bg-mint-100 text-mint-700" : "bg-coral-100 text-coral-600"
                      }`}
                    >
                      {t.covered ? "Covered" : "Missed"}
                    </span>
                    <span className="text-sm leading-snug text-neutral-700">
                      <span className="font-medium">{t.topic}</span>
                      {t.note ? <span className="text-neutral-500"> — {t.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {qp.plan_adherence && (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                Plan adherence
              </p>
              <p className="text-sm leading-relaxed text-neutral-700">{qp.plan_adherence}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
