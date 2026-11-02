import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import StatDelta from '../components/common/StatDelta';
import FeedbackItemRow from '../components/profile/FeedbackItemRow';
import { useEffect, useState } from "react";
import { api, downloadFileWithAuth } from "../lib/api";
import { initials } from "../utils/avatar";

export default function Profile() {
  const { user } = useAuth();

  const [feedback, setFeedback] = useState(null);
  const [fbLoading, setFbLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [fbError, setFbError] = useState('');
  const [behavioural, setBehavioural] = useState(null);

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [exportingStats, setExportingStats] = useState(false);
  const [statsExportError, setStatsExportError] = useState('');
  const [trendRange, setTrendRange] = useState('6months');
  const [trendOffset, setTrendOffset] = useState(0);
  const [hoveredBar, setHoveredBar] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getInterviewerFeedback()
      .then((d) => { if (!cancelled) setFeedback(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFbLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getBehaviouralSuggestions()
      .then((d) => { if (!cancelled) setBehavioural(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    api.getInterviewerStats({ range: trendRange, offset: trendOffset })
      .then((d) => { if (!cancelled) setStats(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [trendRange, trendOffset]);

  if (!user) return <div>Loading...</div>;

  const displayName =  user?.full_name || user?.name || user?.username || '';

  const avatarInitials = initials(displayName);

  const roleLabel = user?.role
    ? user.role
        .split('_')
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ')
    : '';

  const trend = stats?.score_trend || [];

  // Bar colour reflects the score itself, not its rank among other bars:
  // below expectation / good / excellent, matching the app's rating bands.
  function trendBarColor(avgScore) {
    if (avgScore == null) return "bg-neutral-100";
    if (avgScore < 3) return "bg-red-200";
    if (avgScore < 7) return "bg-blue-200";
    return "bg-green-200";
  }

  function trendValueColor(avgScore) {
    if (avgScore == null) return "text-neutral-300";
    if (avgScore < 3) return "text-coral-500";
    if (avgScore < 7) return "text-primary-500";
    return "text-mint-600";
  }

  const formatPct = (pct) => (pct == null ? null : `${pct >= 0 ? "+" : ""}${pct}%`);

  function handleTrendRangeChange(e) {
    setTrendRange(e.target.value);
    setTrendOffset(0);
  }

  async function handleExportStats() {
    setExportingStats(true);
    setStatsExportError("");
    try {
      const params = new URLSearchParams({ range: trendRange, offset: String(trendOffset) });
      await downloadFileWithAuth(`/api/interviewer-stats/report?${params}`, "my-interview-stats.pdf");
    } catch (e) {
      setStatsExportError(e?.message || "Could not export statistics.");
    } finally {
      setExportingStats(false);
    }
  }

  const hasFeedback = Boolean(feedback?.feedback_id);
  const feedbackUpdated = feedback?.generated_at
    ? new Date(feedback.generated_at).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  async function handleUpdateFeedbackItem(itemId, patch) {
    if (!feedback?.feedback_id) return;
    const updated = await api.updateFeedbackItem(feedback.feedback_id, itemId, patch);
    setFeedback(updated);
  }

  async function handleUpdateBehaviouralItem(itemId, patch) {
    const updated = await api.updateBehaviouralSuggestion(itemId, patch);
    setBehavioural(updated);
  }

  async function handleRegenerateFeedback() {
    setRegenerating(true);
    setFbError("");
    try {
      const [d, b] = await Promise.all([
        api.regenerateInterviewerFeedback(),
        api.regenerateBehaviouralSuggestions().catch(() => null),
      ]);
      setFeedback(d);
      if (b) setBehavioural(b);
    } catch (e) {
      setFbError(e?.message || "Could not generate feedback.");
    } finally {
      setRegenerating(false);
    }
  }

  // Body renderer shared by the Strengths / Improvements cards.
  function renderFeedbackBody(items) {
    if (fbLoading) return <p className="text-xs text-neutral-400">Loading…</p>;
    if (!hasFeedback)
      return (
        <p className="text-xs italic text-neutral-400">
          No feedback yet. Generate it once you have completed interviews.
        </p>
      );
    if (!items || items.length === 0)
      return <p className="text-xs italic text-neutral-400">Nothing flagged here.</p>;
    return items.map((it) => (
      <FeedbackItemRow key={it.id} item={it} onUpdate={handleUpdateFeedbackItem} />
    ));
  }
  function renderBehaviouralSuggestions() {
    const items = behavioural?.suggestions ?? [];
    if (!items.length) return null;
    return items.map((s) => (
      <FeedbackItemRow
        key={s.id}
        item={s}
        onUpdate={handleUpdateBehaviouralItem}
        tag={{ label: "Behavioural", className: "bg-yellow-100 text-yellow-700" }}
      />
    ));
  }

  const profileGrid = (

    <div className="grid h-full min-h-0 w-full grid-cols-[minmax(260px,1fr)_minmax(0,2fr)] items-stretch gap-4">

      <div className="grid min-h-0  min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4">
        <div className="bg-white border p-4 rounded-xl">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-pill bg-primary-500 flex items-center justify-center text-white font-bold text-2xl">
              {avatarInitials}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-800">
              {user.full_name}
            </h2>
            <p className="mt-1 text-sm font-medium text-primary-500">
              {roleLabel}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {user.email}
            </p>
          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col bg-white border rounded-xl p-5">
            <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-neutral-800">Performance Stats</h2>
              <button
                type="button"
                onClick={handleExportStats}
                disabled={exportingStats}
                className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                {exportingStats ? "Exporting…" : "Export PDF"}
              </button>
            </div>
            {statsExportError && (
              <p className="mb-2 shrink-0 text-xs text-coral-500">{statsExportError}</p>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-neutral-500">
                      TOTAL INTERVIEWS
                    </p>
                    <p className="text-2xl font-bold text-neutral-800">
                      {statsLoading ? "—" : stats?.total_interviews ?? 0}
                    </p>
                  </div>
                  {formatPct(stats?.total_interviews_delta_pct) && (
                    <StatDelta value={formatPct(stats.total_interviews_delta_pct)} label="from past 7 days" />
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-neutral-500">
                      AVERAGE CANDIDATE SCORE
                    </p>
                    <p className="text-2xl font-bold text-neutral-800">
                      {statsLoading ? "—" : stats?.average_candidate_score ?? "—"}
                    </p>
                  </div>
                  {formatPct(stats?.average_candidate_score_delta_pct) && (
                    <StatDelta value={formatPct(stats.average_candidate_score_delta_pct)} label="from last month" />
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="shrink-0 text-xs font-medium text-neutral-500">
                    SCORE TRENDS
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTrendOffset((o) => o + 1)}
                      className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                      aria-label="Show older period"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span className="whitespace-nowrap text-[11px] text-neutral-400">
                      {stats?.score_trend_range_label || ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTrendOffset((o) => Math.max(0, o - 1))}
                      disabled={trendOffset === 0}
                      className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="Show newer period"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                    <select
                      value={trendRange}
                      onChange={handleTrendRangeChange}
                      className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    >
                      <option value="month">This month</option>
                      <option value="6months">Past 6 months</option>
                      <option value="year">Past year</option>
                    </select>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 items-end gap-3">
                  {trend.map((d, i) => (
                    <div key={i} className="relative flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                      {hoveredBar === i && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-max -translate-x-1/2 rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs shadow-lg">
                          <p className="font-semibold text-white">{d.tooltip_label}</p>
                          <p className="text-neutral-300">
                            {d.avg_score != null ? `${d.avg_score}/10 avg score` : "No scored interviews"}
                          </p>
                        </div>
                      )}

                      {/* Label sits directly above the bar (not the column) - grouped
                          with it via justify-end so it tracks the bar's own height. */}
                      <div
                        className="flex min-h-0 w-full flex-1 cursor-default flex-col items-center justify-end gap-1"
                        onMouseEnter={() => setHoveredBar(i)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <p className={`shrink-0 text-xs font-semibold ${trendValueColor(d.avg_score)}`}>
                          {d.avg_score != null ? d.avg_score.toFixed(1) : ""}
                        </p>
                        <div
                          className={`w-8 rounded-t-md transition-colors ${trendBarColor(d.avg_score)}`}
                          style={{ height: `${d.avg_score != null ? Math.max((d.avg_score / 10) * 100, 4) : 4}%` }}
                        />
                      </div>

                      <p className={`shrink-0 text-xs ${d.label === "Now" ? "font-semibold text-primary-500" : "text-neutral-600"}`}>
                        {d.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex flex-col overflow-hidden bg-white border rounded-xl p-3">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-800">Feedback</h2>
          <div className="flex items-center gap-2">
            {feedbackUpdated && (
              <span className="text-[11px] text-neutral-400">Updated {feedbackUpdated}</span>
            )}
            <button
              type="button"
              onClick={handleRegenerateFeedback}
              disabled={regenerating}
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
              {regenerating ? "Generating…" : hasFeedback ? "Regenerate" : "Generate"}
            </button>
          </div>
        </div>
        {fbError && <p className="mb-2 shrink-0 text-xs text-coral-500">{fbError}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-4">
          <div className="flex min-h-0 flex-col rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2 shrink-0">Strengths</h3>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
              {renderFeedbackBody(feedback?.strengths)}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-lg border border-neutral-200 bg-neutral-50/50 p-3">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2 shrink-0">Improvements</h3>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
              {renderFeedbackBody(feedback?.improvements)}
              {renderBehaviouralSuggestions()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar user={user} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-neutral-100 bg-white px-10 py-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">
            My Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Your interviewing performance and feedback
          </p>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden p-6">
          {profileGrid}
        </section>
      </main>
    </div>
  );
}
