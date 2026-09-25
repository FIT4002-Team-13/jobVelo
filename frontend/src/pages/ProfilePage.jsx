import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import StatDelta from '../components/common/StatDelta';
import FeedbackItemRow from '../components/profile/FeedbackItemRow';
import { useEffect, useRef, useState } from "react";
import { api, downloadFileWithAuth } from "../lib/api";
import { initials } from "../utils/avatar";

export default function Profile() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  const [feedback, setFeedback] = useState(null);
  const [fbLoading, setFbLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [fbError, setFbError] = useState('');

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [exportingStats, setExportingStats] = useState(false);
  const [statsExportError, setStatsExportError] = useState('');

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
    api.getInterviewerStats()
      .then((d) => { if (!cancelled) setStats(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!user) return <div>Loading...</div>;

  const displayName =  user?.full_name || user?.name || user?.username || '';

  const avatarInitials = initials(displayName);

  const roleLabel = user?.role
    ? user.role
        .split('_')
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ')
    : '';

  // Score trend bars: rank the scored months low/mid/high so the chart
  // reads the same red/blue/green way the original mock did. Months with
  // no scored interviews render as a flat, uncoloured bar.
  const trend = stats?.score_trend || [];
  const scoredTrend = trend.filter((d) => d.avg_score != null);
  const sortedTrend = [...scoredTrend].sort((a, b) => a.avg_score - b.avg_score);
  const trendColorMap = new Map();
  sortedTrend.slice(0, Math.ceil(sortedTrend.length / 3)).forEach((d) => trendColorMap.set(d.label, "bg-red-200"));
  sortedTrend.slice(Math.ceil(sortedTrend.length / 3), Math.ceil((2 * sortedTrend.length) / 3)).forEach((d) => trendColorMap.set(d.label, "bg-blue-200"));
  sortedTrend.slice(Math.ceil((2 * sortedTrend.length) / 3)).forEach((d) => trendColorMap.set(d.label, "bg-green-200"));

  const formatPct = (pct) => (pct == null ? null : `${pct >= 0 ? "+" : ""}${pct}%`);

  async function handleExportStats() {
    setExportingStats(true);
    setStatsExportError("");
    try {
      await downloadFileWithAuth("/api/interviewer-stats/report", "my-interview-stats.pdf");
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

  async function handleRegenerateFeedback() {
    setRegenerating(true);
    setFbError("");
    try {
      const d = await api.regenerateInterviewerFeedback();
      setFeedback(d);
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

        <div className="bg-white border rounded-xl p-3">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
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

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-neutral-500">
                    TOTAL INTERVIEWS
                  </p>
                  <p className="text-xl font-bold text-neutral-800">
                    {statsLoading ? "—" : stats?.total_interviews ?? 0}
                  </p>
                  {formatPct(stats?.total_interviews_delta_pct) && (
                    <StatDelta value={formatPct(stats.total_interviews_delta_pct)} label="7d" />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-neutral-500">
                    AVG. CANDIDATE SCORE
                  </p>
                  <p className="text-xl font-bold text-neutral-800">
                    {statsLoading ? "—" : stats?.average_candidate_score ?? "—"}
                  </p>
                  {formatPct(stats?.average_candidate_score_delta_pct) && (
                    <StatDelta value={formatPct(stats.average_candidate_score_delta_pct)} label="1mo" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="shrink-0 text-xs font-medium text-neutral-500">
                  SCORE TRENDS
                </p>

                <div className="flex h-28 shrink-0 items-end gap-3">
                  {trend.map((d) => (
                    <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                      <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                        <div
                          className={`w-8 rounded-t-md ${d.avg_score != null ? trendColorMap.get(d.label) : "bg-neutral-100"}`}
                          style={{ height: `${d.avg_score != null ? Math.max((d.avg_score / 10) * 100, 4) : 4}%` }}
                        />
                      </div>

                      <p className="shrink-0 text-xs text-neutral-600">
                        {d.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        </div>
      </div>


      <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-2 gap-4">
        <div className="min-h-0 overflow-hidden bg-white border rounded-xl p-3 flex flex-col ">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-800">Strengths</h2>
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

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
            {renderFeedbackBody(feedback?.strengths)}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden bg-white border rounded-xl p-3">
          <h2 className="text-lg font-semibold text-neutral-800 mb-3 shrink-0">
            Improvements
          </h2>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
            {renderFeedbackBody(feedback?.improvements)}
          </div>
        </div>
      </div>
    </div>
  );

  function CompanyProfileTab({ compId }) {
    const [company, setCompany] = useState(null);
    const [form, setForm] = useState({});
    const [, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const fileRef = useRef();
    const handleLogoChange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('logo', file);

      try {
        const updated = await api.updateCompanyLogo(compId, formData);
        setCompany(updated);
      } catch {
        setError('Failed to upload logo.');
      }
    };

    useEffect(() => {
      api.getCompany(compId)
        .then((data) => {
          setCompany(data);
                console.log('company data:', data);

          setForm({
            comp_name: data.comp_name ?? '',
            comp_industry: data.comp_industry ?? '',
            comp_description: data.comp_description ?? '',
            comp_email: data.comp_email ?? '',
            comp_contact: data.comp_contact ?? '',
            comp_website: data.comp_website ?? '',
          });
        })
        .catch(() => setError('Failed to load company profile.'))
        .finally(() => setLoading(false));
    }, [compId]);

    const handleChange = (e) => {
      setForm(f => ({ ...f, [e.target.name]: e.target.value }));
      setSuccess(false);
    };

    const handleSave = async () => {

      if (!form.comp_name.trim()) return setError('Company name is required.');
      if (!form.comp_industry.trim()) return setError('Industry is required.');
      if (!form.comp_email.trim()) return setError('Email is required.');
      if (!form.comp_contact.trim()) return setError('Contact number is required.');

      setSaving(true);
      setError(null);
      try {
        const updated = await api.updateCompany(compId, form);
        setCompany(updated);
        setSuccess(true);
      } catch (e) {
        setError(e.message || 'Failed to save.');
      } finally {
        setSaving(false);
      }
    };

    const logoUrl = company?.comp_logo
      ? `/api/files/${company.comp_logo}`
      : null;

    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-4 items-stretch">

          {/* Left — Company Branding */}
          <div className="bg-white border rounded-xl p-4 flex min-h-0 flex-col gap-3">
            <h2 className="text-lg font-semibold text-neutral-800">Company Branding</h2>

            {/* Logo */}
            <div className="border rounded-xl p-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
              {logoUrl
                ? <img src={`${logoUrl}?t=${Date.now()}`} alt="Company logo" className="max-h-40 max-w-full object-contain" />
                : <div className="h-20 w-20 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 text-sm">No logo</div>
              }
              <button
                onClick={() => fileRef.current?.click()}
                className="text-sm text-primary-500 flex pt-2 items-center gap-1 hover:underline"
              >
                Edit Logo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            {/* Company Name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-neutral-500">Company Name</label>
              <input
                name="comp_name"
                value={form.comp_name}
                onChange={handleChange}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>

            {/* Industry */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-neutral-500">Industry</label>
              <input
                name="comp_industry"
                value={form.comp_industry}
                onChange={handleChange}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          </div>

          {/* Right — Description + Contact */}
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="bg-white border rounded-xl p-4 flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-neutral-800">Company Description</h2>
              <textarea
                name="comp_description"
                value={form.comp_description}
                onChange={handleChange}
                maxLength={500}
                rows={4}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <p className="text-xs text-neutral-400 text-right">
                {(form.comp_description ?? '').length}/500
              </p>
            </div>

            <div className="bg-white border rounded-xl p-4 flex min-h-0 flex-col overflow-hidden gap-3">
              <h2 className="text-lg font-semibold text-neutral-800">Contact Details</h2>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-neutral-500">Email Address</label>
                <input
                  name="comp_email"
                  value={form.comp_email}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-neutral-500">Contact Number</label>
                <input
                  name="comp_contact"
                  value={form.comp_contact}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-neutral-500">Website</label>
                <input
                  name="comp_website"
                  value={form.comp_website}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save Row */}
        <div className="flex shrink-0 justify-end items-center gap-4">
          {success && <p className="text-sm text-green-500">Changes saved successfully.</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold py-2 px-6 rounded-xl transition-colors cursor-pointer"      
            >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }  


  if (user?.role !== 'admin') {
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

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar user={user} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-neutral-100 bg-white px-10 py-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">
            Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Manage your personal and company profile
          </p>
        </header>

        <div className="flex shrink-0 border-b border-neutral-200 bg-neutral-100 px-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            My Profile
          </button>

          <button
            onClick={() => setActiveTab('company')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'company'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            Company Profile
          </button>
        </div>

        <section className="min-h-0 flex-1 overflow-hidden p-5">
          {activeTab === 'profile' && profileGrid}

          {activeTab === 'company' && (
            <CompanyProfileTab compId={user.comp_id} />
          )}
        </section>
      </main>
    </div>
  );
}