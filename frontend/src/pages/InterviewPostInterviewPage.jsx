import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { flex, card } from "../styles/layout";
import { SECTION_COLORS } from "../utils/constants.js";
import { formatTimer, parseTimestamp } from "../utils/time.js";
import ReportSections from "../components/interview/ReportSections.jsx";
import PdfPreview from "../components/candidate/PdfPreview.jsx";
import InterviewPlanCard from "../components/candidate/InterviewPlanCard.jsx";
import FitVerdict from "../components/candidate/FitVerdict.jsx";
import InsightTabs from "../components/candidate/InsightTabs.jsx";
import CandidateInfoCard from "../components/candidate/CandidateInfoCard.jsx";
import CandidateScorePanel from "../components/candidate/CandidateScorePanel.jsx";
import FeedbackPanel from "../components/candidate/FeedbackPanel.jsx";
import ScoreEvidencePopup from "../components/candidate/ScoreEvidencePopup.jsx";
import { api, downloadFileWithAuth } from "../lib/api.js";

const SCORE_COLORS = {
  Communication: "bg-primary-500",
  Skill: "bg-mint-500",
  "Problem Solving": "bg-sky-400",
};

function ScoreDonut({ value }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / 10));
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="9" className="stroke-neutral-100" />
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className="stroke-primary-500 transition-all duration-700"
        />
      </svg>
      <div className={`absolute inset-0 ${flex.colCenter}`}>
        <span className="text-2xl font-extrabold leading-none text-neutral-800">{value.toFixed(1)}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Overall</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, score }) {
  const pct = (score / 10) * 100;
  const color = SCORE_COLORS[label] ?? "bg-primary-500";
  return (
    <div className={`${flex.col} gap-1.5`}>
      <div className={`${flex.rowBetween} text-sm`}>
        <span className="text-neutral-700 font-medium">{label}</span>
        <span className="text-neutral-500">{score.toFixed(1)}/10.0</span>
      </div>
      <div className="h-1.5 w-full bg-neutral-200 rounded-pill overflow-hidden">
        <div className={`h-full ${color} rounded-pill transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HighlightedText({ text, query }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-neutral-900 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function DocumentSlot({ url, label, uploading, onUpload }) {
  const inputRef = useRef(null);
  if (url) {
    const pdfSrc = url.startsWith("/api/files/") ? url.slice("/api/files/".length) : url;
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <PdfPreview src={pdfSrc} label={label} />
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-neutral-400">No {label.toLowerCase()} on file.</p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 text-sm transition-colors"
      >
        {uploading ? "Uploading…" : `Upload ${label}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function InterviewPostInterviewPage({
  transcript,
  transcriptEntryRefs,
  highlightedEntryIdx,
  highlightedEntryId,
  interviewerLabel,
  sections,
  jumpToSection,
  report,
  cvUrl,
  setCvUrl,
  coverLetterUrl,
  setCoverLetterUrl,
  cvAnalysis,
  jobCand,
  candId,
  jobId,
  centerView,
  interview,
  candidate,
  job,
  interviewerName,
  onSwitchToTranscript,
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [localHighlightId, setLocalHighlightId] = useState(null);
  const [activeTab, setActiveTab] = useState("candidate");
  const [cvUploading, setCvUploading] = useState(false);
  const [clUploading, setClUploading] = useState(false);
  const [showScoreEvidence, setShowScoreEvidence] = useState(false);

  const mergedInterview = interview && {
    ...interview,
    intv_candidate_report: report?.candidate_report ?? interview.intv_candidate_report,
    intv_interviewer_report: report?.interviewer_report ?? interview.intv_interviewer_report,
    intv_bias_incidents: report?.bias_incidents ?? interview.intv_bias_incidents ?? [],
  };

  const startedSections = Array.isArray(sections)
    ? sections.map((s, i) => ({ ...s, _idx: i })).filter((s) => s.start_at != null)
    : [];
  const hasSections = startedSections.length > 0;

  const query = search.trim();
  const filteredTranscript = query
    ? transcript.filter(
        (e) =>
          e.text?.toLowerCase().includes(query.toLowerCase()) ||
          e.comment?.toLowerCase().includes(query.toLowerCase())
      )
    : transcript;

  function handleFilteredEntryClick(entry) {
    const { id, timestamp } = entry;
    setSearch("");
    setTimeout(() => jumpToEntry(id, timestamp), 50);
  }

  function jumpToEntry(firstId, timestamp) {
    let match = transcript.find((e) => e.id === firstId);
    if (!match && timestamp) {
      const targetSecs = parseTimestamp(timestamp);
      match = transcript.reduce((best, e) => {
        const diff = Math.abs(parseTimestamp(e.timestamp) - targetSecs);
        const bestDiff = best ? Math.abs(parseTimestamp(best.timestamp) - targetSecs) : Infinity;
        return diff < bestDiff ? e : best;
      }, null);
    }
    if (!match) return;
    document.getElementById(`post-entry-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setLocalHighlightId(match.id);
    setTimeout(() => setLocalHighlightId((id) => (id === match.id ? null : id)), 3000);
  }

  async function handleCvUpload(file) {
    if (!jobCand?.jobcand_id) return;
    setCvUploading(true);
    try {
      const formData = new FormData();
      formData.append("jobcand_id", jobCand.jobcand_id);
      formData.append("cv", file);
      const result = await api.analyseCv(formData);
      if (result?.cv_path) setCvUrl(`/api/files/${result.cv_path}`);
    } catch {
      // silent — user can retry
    } finally {
      setCvUploading(false);
    }
  }

  async function handleCoverLetterUpload(file) {
    if (!candId) return;
    setClUploading(true);
    try {
      const formData = new FormData();
      formData.append("cover_letter", file);
      const result = await api.uploadCandidateCoverLetter(candId, formData);
      if (result?.cand_cover_letter_url) setCoverLetterUrl(result.cand_cover_letter_url);
    } catch {
      // silent — user can retry
    } finally {
      setClUploading(false);
    }
  }

  const candidateReport = report?.candidate_report;

  const scoreRows = report?.scores
    ? [
        {
          label: "Communication",
          score: report.scores.communication,
          explanation: report.ratings?.communication?.explanation ?? null,
          evidence: report.ratings?.communication?.evidence ?? [],
        },
        {
          label: "Skill",
          score: report.scores.skill,
          explanation: report.ratings?.technical_skills?.explanation ?? null,
          evidence: report.ratings?.technical_skills?.evidence ?? [],
        },
        {
          label: "Problem Solving",
          score: report.scores.problem_solving,
          explanation: report.ratings?.problem_solving?.explanation ?? null,
          evidence: report.ratings?.problem_solving?.evidence ?? [],
        },
      ]
    : [];
  const overall = scoreRows.length
    ? scoreRows.reduce((s, r) => s + r.score, 0) / scoreRows.length
    : 0;

  return (
    <div className={`flex-1 overflow-hidden ${flex.col}`}>
      <div className="flex-1 overflow-hidden flex">

        {/* ── Transcript view ─────────────────────────────────────── */}
        {centerView === "transcript" && (
          <>
            {/* Sections sidebar */}
            {hasSections && (
              <div className={`shrink-0 overflow-hidden border-r border-neutral-200 bg-white transition-[width] duration-200 ${flex.col} ${menuOpen ? "w-64" : "w-0"}`}>
                <div className="w-64 flex flex-col h-full">
                  <div className={`${flex.rowBetween} items-center px-4 py-3.5 border-b border-neutral-100 shrink-0`}>
                    <span className="text-sm font-semibold text-neutral-800">Sections</span>
                    <button
                      onClick={() => setMenuOpen(false)}
                      className="text-neutral-400 hover:text-neutral-600 transition-colors p-1 rounded-lg hover:bg-neutral-100"
                      aria-label="Close menu"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto py-2">
                    {startedSections.map((section) => {
                      const i = section._idx;
                      const color = SECTION_COLORS[i % SECTION_COLORS.length];
                      return (
                        <button
                          key={i}
                          onClick={() => { jumpToSection(i); setMenuOpen(false); }}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 group"
                        >
                          <span className={`mt-0.5 text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${color.badge}`}>
                            {formatTimer(section.start_at)}
                          </span>
                          <div className={`${flex.col} min-w-0`}>
                            <span className="text-sm font-semibold text-neutral-800 group-hover:text-primary-600 transition-colors">
                              {section.name}
                            </span>
                            {section.description && (
                              <span className="text-xs text-neutral-400 line-clamp-2 mt-0.5">
                                {section.description}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Transcript column */}
            <div className={`flex-1 ${flex.col} overflow-hidden`}>
              <div className="shrink-0 bg-neutral-50 border-b border-neutral-100 px-6 py-3">
                <div className={`${flex.row} items-center gap-2`}>
                  {hasSections && (
                    <button
                      onClick={() => setMenuOpen((o) => !o)}
                      aria-label="Toggle section navigation"
                      className="shrink-0 flex flex-col justify-center gap-1 p-2.5 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50 transition-colors"
                    >
                      <span className="block w-4 h-0.5 bg-neutral-600 rounded" />
                      <span className="block w-4 h-0.5 bg-neutral-600 rounded" />
                      <span className="block w-4 h-0.5 bg-neutral-600 rounded" />
                    </button>
                  )}
                  <div className="relative flex-1">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search transcript…"
                      className="w-full pl-8 pr-8 py-2 text-sm rounded-xl border border-neutral-200 bg-white text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                        aria-label="Clear search"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {query && (
                    <span className="text-xs text-neutral-400 shrink-0">
                      {filteredTranscript.length} result{filteredTranscript.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="mx-auto max-w-4xl space-y-3">
                  {transcript.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center mt-8">No transcript recorded for this interview.</p>
                  ) : filteredTranscript.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center mt-8">No results for the current filter.</p>
                  ) : (
                    filteredTranscript.map((entry, i) => (
                      <div
                        id={`post-entry-${entry.id}`}
                        key={entry.id}
                        ref={(el) => (transcriptEntryRefs.current[i] = el)}
                        onClick={query ? () => handleFilteredEntryClick(entry) : undefined}
                        className={`rounded-lg transition-colors duration-700 ${
                          query ? "cursor-pointer hover:bg-neutral-50" : ""
                        } ${
                          highlightedEntryIdx === i || entry.id === highlightedEntryId || entry.id === localHighlightId
                            ? "bg-yellow-50 ring-1 ring-yellow-300"
                            : ""
                        }`}
                      >
                        <div className={`${flex.row} gap-3 py-2`}>
                          <div
                            className={`w-8 h-8 rounded-pill ${flex.rowCenter} text-white text-xs font-bold shrink-0 ${
                              entry.speaker === interviewerLabel ? "bg-primary-500" : "bg-sky-500"
                            }`}
                          >
                            {entry.speaker?.slice(0, 2).toUpperCase() || "??"}
                          </div>
                          <div className={`${flex.col} gap-0.5 flex-1 min-w-0`}>
                            <span className="text-xs text-neutral-400">{entry.timestamp}</span>
                            <span className="text-sm text-neutral-700 leading-snug">
                              <HighlightedText text={entry.text} query={query} />
                            </span>
                            {entry.comment && (
                              <span className="mt-1 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
                                Note: <HighlightedText text={entry.comment} query={query} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Report panel — transcript mode only */}
            {candidateReport && (
              <div className={`flex-1 border-l border-neutral-200 bg-white ${flex.col} overflow-hidden`}>
                <div className="shrink-0 flex items-center gap-2 px-5 py-3.5 border-b border-neutral-100 bg-white">
                  {[
                    { id: "candidate", label: "Candidate" },
                    { id: "interviewer", label: "Interviewer" },
                    { id: "evidence", label: "Evidence" },
                    { id: "bias", label: "Bias" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-xl px-4 py-0.5 text-sm font-semibold transition-colors ${
                        activeTab === tab.id
                          ? "bg-primary-500 text-white"
                          : "bg-primary-100 text-primary-500 hover:bg-primary-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                  {activeTab === "candidate" && (
                    <div className={`${flex.col} gap-5`}>
                      {scoreRows.length > 0 && (
                        <div className="rounded-2xl border border-neutral-200 p-5">
                          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">Result</h4>
                          <div className={`${flex.row} gap-6`}>
                            <ScoreDonut value={overall} />
                            <div className={`${flex.col} flex-1 gap-2.5`}>
                              {scoreRows.map((r) => (
                                <ScoreBar key={r.label} label={r.label} score={r.score} />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <ReportSections report={candidateReport} showRequirements variant="stack" />
                    </div>
                  )}

                  {activeTab === "interviewer" && (
                    report?.interviewer_report ? (
                      <ReportSections report={report.interviewer_report} showRequirements={false} variant="stack" />
                    ) : (
                      <p className="text-sm text-neutral-400 text-center mt-8">No interviewer report available.</p>
                    )
                  )}

                  {activeTab === "evidence" && (
                    scoreRows.length > 0 ? (
                      <div className={`${flex.col} gap-4`}>
                        {scoreRows.map((r) => (
                          <div key={r.label} className={`${flex.col} gap-1.5`}>
                            <ScoreBar label={r.label} score={r.score} />
                            {r.explanation && (
                              <p className="text-xs text-neutral-500 leading-relaxed pl-1">{r.explanation}</p>
                            )}
                            {r.evidence.length > 0 ? (
                              <div className={`${flex.col} gap-1 pl-1 pt-0.5`}>
                                {r.evidence.map((ev, i) => (
                                  <button
                                    key={i}
                                    onClick={() => jumpToEntry(ev.transcript_entry_id?.split("+")[0], ev.timestamp)}
                                    className="w-full text-left group flex items-start gap-2 rounded-lg px-2.5 py-2 border border-neutral-100 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                                  >
                                    <div className={`${flex.col} gap-0.5 flex-1 min-w-0`}>
                                      <span className="text-[10px] font-bold tabular-nums text-neutral-400">{ev.timestamp}</span>
                                      <p className="text-xs italic leading-relaxed text-neutral-600 group-hover:text-neutral-800 transition-colors line-clamp-3">
                                        &ldquo;{ev.text}&rdquo;
                                      </p>
                                    </div>
                                    <svg
                                      className="mt-1 shrink-0 text-neutral-300 group-hover:text-primary-400 transition-colors"
                                      width="11" height="11" viewBox="0 0 24 24" fill="none"
                                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    >
                                      <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-400 italic pl-1">No evidence recorded.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400 text-center mt-8">No evidence available for this interview.</p>
                    )
                  )}

                  {activeTab === "bias" && (() => {
                    const incidents = report?.bias_incidents ?? [];
                    return incidents.length > 0 ? (
                      <div className={`${flex.col} gap-4`}>
                        {incidents.map((inc, i) => (
                          <div key={i} className="rounded-2xl border border-neutral-200 p-4">
                            <div className={`${flex.rowBetween} items-start gap-2 mb-2`}>
                              {inc.category && (
                                <span className="text-xs font-bold uppercase tracking-wide text-coral-500">{inc.category}</span>
                              )}
                              {inc.timestamp && (
                                <span className="text-[10px] font-mono text-neutral-400 shrink-0">{inc.timestamp}</span>
                              )}
                            </div>
                            {inc.quote && (
                              <p className="text-sm italic text-neutral-700 mb-3">&ldquo;{inc.quote}&rdquo;</p>
                            )}
                            {inc.reason && (
                              <div className="mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 mb-0.5">Why it was flagged</p>
                                <p className="text-xs text-neutral-600 leading-relaxed">{inc.reason}</p>
                              </div>
                            )}
                            {inc.suggestion && (
                              <div className="rounded-xl bg-mint-50 border border-mint-100 px-3 py-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-mint-600 mb-0.5">Suggestion</p>
                                <p className="text-xs text-mint-800 leading-relaxed">{inc.suggestion}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400 text-center mt-8">No bias incidents recorded.</p>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CV view ─────────────────────────────────────────────── */}
        {centerView === "cv" && (
          <>
            <div className="flex-[2] flex flex-col overflow-hidden">
              <DocumentSlot
                url={cvUrl}
                label="CV"
                uploading={cvUploading}
                onUpload={handleCvUpload}
              />
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
        )}

        {/* ── Cover Letter view ────────────────────────────────────── */}
        {centerView === "cover-letter" && (
          <DocumentSlot
            url={coverLetterUrl}
            label="Cover Letter"
            uploading={clUploading}
            onUpload={handleCoverLetterUpload}
          />
        )}

        {/* ── Profile view ─────────────────────────────────────────── */}
        {centerView === "profile" && (
          <div className="flex-1 overflow-y-auto px-10 py-6">
            <div className="mb-5 grid grid-cols-11 gap-5 items-stretch">
              <div className="col-span-7">
                <CandidateInfoCard
                  candidate={candidate}
                  job={job}
                  interview={mergedInterview}
                  jobCand={jobCand}
                  interviewer={interviewerName}
                  onStartInterview={null}
                  onEdit={null}
                  cvAnalysis={cvAnalysis}
                  onViewCvAnalysis={
                    jobCand?.jobcand_id
                      ? () => navigate(`/cv-analysis/${jobCand.jobcand_id}`)
                      : null
                  }
                  onAnalyseCv={null}
                  analysingCv={false}
                />
              </div>
              <div className="col-span-4">
                <CandidateScorePanel
                  jobCand={jobCand}
                  interview={mergedInterview}
                  onViewEvidence={() => setShowScoreEvidence(true)}
                  onViewTranscription={onSwitchToTranscript}
                />
              </div>
            </div>
            <FeedbackPanel
              interview={mergedInterview}
              onDownloadCandidateReport={() => {
                if (!interview?.intv_id) return;
                downloadFileWithAuth(`/api/interviews/${interview.intv_id}/candidate-report`).catch(() => {});
              }}
              onDownloadInterviewerReport={() => {
                if (!interview?.intv_id) return;
                downloadFileWithAuth(`/api/interviews/${interview.intv_id}/interviewer-report`).catch(() => {});
              }}
            />
            {showScoreEvidence && (
              <ScoreEvidencePopup
                ratings={jobCand?.ratings}
                onClose={() => setShowScoreEvidence(false)}
              />
            )}
          </div>
        )}

        {/* ── Prep & Plan view ─────────────────────────────────────── */}
        {centerView === "prep" && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-2xl flex flex-col gap-6">
              {cvAnalysis ? (
                <div className={`${card.base} ${flex.col} gap-5`}>
                  <div className={flex.rowBetween}>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Briefing</h3>
                    <FitVerdict positionFit={cvAnalysis.position_fit} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                    {cvAnalysis.key_strengths?.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">Strengths</p>
                        <ul className={`${flex.col} gap-1.5`}>
                          {cvAnalysis.key_strengths.slice(0, 3).map((item, i) => (
                            <li key={i} className={`${flex.row} items-start gap-2`}>
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill bg-mint-500" aria-hidden />
                              <span className="text-sm leading-snug text-neutral-700">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {[...(cvAnalysis.improvements ?? []), ...(cvAnalysis.inconsistencies ?? [])].length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">Areas to probe</p>
                        <ul className={`${flex.col} gap-1.5`}>
                          {[...(cvAnalysis.improvements ?? []), ...(cvAnalysis.inconsistencies ?? [])].slice(0, 3).map((item, i) => (
                            <li key={i} className={`${flex.row} items-start gap-2`}>
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill bg-sky-500" aria-hidden />
                              <span className="text-sm leading-snug text-neutral-700">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-sm italic text-neutral-400">No CV analysis available.</p>
              )}

              {cvAnalysis?.interview_questions?.length > 0 && (
                <div className={`${card.base} ${flex.col} gap-4`}>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Question Plan</h3>
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

              {jobCand && (
                <InterviewPlanCard jobId={jobId} candId={candId} jobCand={jobCand} />
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
