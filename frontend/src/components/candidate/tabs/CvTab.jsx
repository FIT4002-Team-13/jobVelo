import { flex } from "../../../styles/layout";
import DocumentSlot from "../DocumentSlot.jsx";
import FitVerdict from "../FitVerdict.jsx";
import InsightTabs from "../InsightTabs.jsx";

export default function CvTab({ cvUrl, uploading, onUpload, cvAnalysis }) {
  return (
    <>
      <div className="flex-[2] flex flex-col overflow-hidden">
        <DocumentSlot url={cvUrl} label="CV" uploading={uploading} onUpload={onUpload} />
      </div>
      <div className="w-80 shrink-0 border-l border-neutral-200 bg-white overflow-y-auto p-5 flex flex-col gap-5">
        {cvAnalysis ? (
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
    </>
  );
}
