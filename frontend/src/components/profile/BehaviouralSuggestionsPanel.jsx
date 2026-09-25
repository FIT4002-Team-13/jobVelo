import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api.js";

export default function BehaviouralSuggestionsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getBehaviouralSuggestions().then((d) => {
        if (!cancelled) setData(d);
      }).catch(() => {
        if (!cancelled) setData({ suggestions: [] });
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {cancelled = true}}, []);

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    
    try {
      const fresh = await api.regenerateBehaviouralSuggestions();
      setData(fresh);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate suggestions right now.");
    } finally {
      setRegenerating(false);
    }
  }

  const hasSuggestions = (data?.suggestions?.length ?? 0) > 0;
  const generatedAt = data?.generated_at ? new Date(data.generated_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }) : null;

  return (
    <div className="min-h-0 min-w-0 flex flex-col overflow-hidden bg-white border rounded-xl p-3">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-neutral-800">
            Behavioural questioning
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {generatedAt && (
            <span className="text-[11px] text-neutral-400">
              Updated {generatedAt}
            </span>
          )}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={regenerating ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {regenerating
              ? "Generating…"
              : hasSuggestions
                ? "Regenerate"
                : "Generate"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-2 shrink-0 text-xs text-coral-500">{error}</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
        {loading ? (
          <p className="text-xs text-neutral-400">Loading…</p>
        ) : hasSuggestions ? (
          data.suggestions.map((s, i) => (
            <div
              key={i}
              className="shrink-0 bg-neutral-100 rounded-xl px-3 py-2"
            >
              <p className="text-sm font-bold text-neutral-800">{s.title}</p>
              {s.detail && (
                <p className="text-xs leading-snug text-neutral-500 mt-0.5">
                  {s.detail}
                </p>
              )}
              {Array.isArray(s.examples) && s.examples.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-neutral-500">
                  {s.examples.map((ex, j) => (
                    <li key={j}>{ex}</li>
                  ))}
                </ul>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-neutral-400">
            No suggestions yet. Click Generate once you have at least one
            completed interview.
          </p>
        )}
      </div>
    </div>
  );
}
