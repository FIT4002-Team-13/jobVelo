// AI key-phrase highlighting (US18) - shared between the live interview
// transcript (InterviewTranscriptPanel) and the post-interview debrief
// transcript (TranscriptAnalysisTab), so a highlight picked out live still
// reads the same way once the interview is over.

// Splits `text` into plain/highlighted segments given the AI's key-phrase
// highlights - each `highlights[i].text` is an exact substring somewhere in
// the transcript, so this just locates it (case-insensitively) and marks
// that span, leaving the rest of the sentence untouched. Matches are sorted
// and de-overlapped so two phrases can never fight over the same characters.
export function splitTextHighlights(text, highlights) {
  if (!text || !highlights?.length) return [{ text, importance: null }];

  const lower = text.toLowerCase();
  const matches = [];
  for (const h of highlights) {
    const phrase = (h?.text || "").trim();
    if (!phrase) continue;
    const idx = lower.indexOf(phrase.toLowerCase());
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + phrase.length, importance: h.importance ?? 3 });
  }
  if (!matches.length) return [{ text, importance: null }];

  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) continue;
    merged.push(m);
  }

  const segments = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) segments.push({ text: text.slice(cursor, m.start), importance: null });
    segments.push({ text: text.slice(m.start, m.end), importance: m.importance });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), importance: null });
  return segments;
}

export const IMPORTANCE_CLASS = {
  5: "bg-amber-300/70 text-amber-950 rounded px-0.5",
  4: "bg-amber-200/70 text-amber-950 rounded px-0.5",
  3: "bg-amber-100 text-amber-900 rounded px-0.5",
  2: "bg-amber-50 text-amber-900 rounded px-0.5",
  1: "bg-amber-50 text-amber-800 rounded px-0.5",
};
