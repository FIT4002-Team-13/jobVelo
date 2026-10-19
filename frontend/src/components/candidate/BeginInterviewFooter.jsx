import { button, flex } from "../../styles/layout";

// Sticky pre-interview footer - rendered by CandidatePage under every tab
// (Prep, CV, Cover Letter) so Begin is reachable from wherever the
// interviewer is reviewing the candidate.
export default function BeginInterviewFooter({ onBegin }) {
  return (
    <div className="shrink-0 border-t border-neutral-200 bg-neutral-0 px-6 py-3">
      <div className={`mx-auto max-w-6xl ${flex.rowBetween} gap-4`}>
        <p className="text-xs text-neutral-400">
          Opens the live recording workspace, where you&apos;ll grant mic access to start.
        </p>
        <button
          type="button"
          onClick={onBegin}
          className={`${flex.row} shrink-0 gap-2 ${button.primary} !px-8 !py-2.5 text-base`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Begin Interview
        </button>
      </div>
    </div>
  );
}
