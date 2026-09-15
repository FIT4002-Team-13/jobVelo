import { flex } from "../../../styles/layout";
import DocumentSlot from "../DocumentSlot.jsx";
import FitVerdict from "../FitVerdict.jsx";
import InsightTabs from "../InsightTabs.jsx";

export default function CvTab({ cvUrl, uploading, onUpload, onDelete, cvAnalysis, candidate, onEdit }) {
  return (
    <div className="flex min-h-0 w-full flex-1">
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <DocumentSlot url={cvUrl} label="CV" uploading={uploading} onUpload={onUpload} onDelete={onDelete} />
      </div>
      <div className="flex-1 min-w-0 border-l border-neutral-200 bg-white overflow-y-auto p-5 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Candidate Detail</p>
            {onEdit && (
              <button type="button" onClick={onEdit} className="rounded-pill border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-50">Edit</button>
            )}
          </div>
          {candidate?.cand_email && (
            <p className="flex items-center gap-1.5 text-sm text-neutral-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
              <span className="min-w-0 break-all">{candidate.cand_email}</span>
            </p>
          )}
          {candidate?.cand_phone && (
            <p className="flex items-center gap-1.5 text-sm text-neutral-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              {candidate.cand_phone}
            </p>
          )}
          {!candidate?.cand_email && !candidate?.cand_phone && (
            <p className="text-sm italic text-neutral-300">No contact details on file</p>
          )}
        </div>

        <div className="border-t border-neutral-100" />

        {cvAnalysis?.status === "processing" ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-8">
            <svg className="h-6 w-6 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
            <p className="text-sm text-neutral-400 italic text-center">Analysing CV…</p>
          </div>
        ) : cvAnalysis?.status === "completed" || cvAnalysis?.key_strengths ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">CV Analysis</p>
              <FitVerdict positionFit={cvAnalysis.position_fit} />
            </div>
            <InsightTabs
              strengths={cvAnalysis.key_strengths ?? []}
              improvements={cvAnalysis.improvements ?? []}
              inconsistencies={cvAnalysis.inconsistencies ?? []}
            />
            {cvAnalysis.interview_questions?.length > 0 && (
              <div className={flex.col}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">Suggested Questions</p>
                <ol className={`${flex.col} gap-2.5`}>
                  {cvAnalysis.interview_questions.slice(0, 5).map((q, i) => (
                    <li key={i} className={`${flex.row} items-start gap-3`}>
                      <span className="w-4 shrink-0 pt-px text-right text-sm font-semibold tabular-nums text-neutral-300">{i + 1}</span>
                      <span className="flex-1 text-sm leading-snug text-neutral-700">{q.question}</span>
                      {q.category && (
                        <span className="shrink-0 pt-px text-[10px] font-semibold uppercase tracking-wide text-neutral-300">{q.category}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-400 italic text-center mt-8">No CV analysis available.</p>
        )}
      </div>
    </div>
  );
}
