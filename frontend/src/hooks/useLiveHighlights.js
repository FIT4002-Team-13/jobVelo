import { useEffect, useRef, useState } from "react";
import { api, authedFetch } from "../lib/api.js";

// Wait this long after the LATEST finalized transcript line before asking
// for highlights (US18). Chosen deliberately over a fixed interval: firing
// mid-utterance (while a speaker is still going) was implicated in the live
// transcript getting split into extra lines, so we only fire once things
// have actually gone quiet for a beat - and if a new final line lands
// before the timer elapses, the timer resets, so a single long/choppy
// utterance can't trigger a call partway through.
const DEBOUNCE_MS = 2500;
// Only the recent tail matters for "what did they just say that's
// important" - keeps the prompt small and cheap on a long interview.
const MAX_RECENT_ENTRIES = 20;
// Ceiling on how many highlights we keep accumulating over the whole
// interview - oldest drop off first once the interview runs long enough to
// hit this, so memory/render cost stays bounded.
const MAX_TOTAL_HIGHLIGHTS = 40;

// Collapses whitespace/punctuation/case so re-picking the "same" phrase in
// a later call (worded identically or nearly so) is recognised as a repeat
// rather than added again - mirrors the backend's own canonicalisation.
function canonicalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Each poll only re-extracts from the recent tail of the transcript, and an
// LLM call isn't guaranteed to re-pick the exact same phrases from mostly
// the same window twice - so REPLACING the highlight list on every call
// made older lines' highlights flicker or vanish once they aged out of that
// window, even though nothing was wrong with them. Merging instead makes a
// highlight, once shown, stick for the rest of the interview (bounded by
// MAX_TOTAL_HIGHLIGHTS).
function mergeHighlights(previous, incoming) {
  const merged = [...previous];
  const seen = new Set(previous.map((h) => canonicalize(h.text)));

  for (const h of incoming) {
    const key = canonicalize(h?.text || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(h);
  }

  return merged.length > MAX_TOTAL_HIGHLIGHTS
    ? merged.slice(merged.length - MAX_TOTAL_HIGHLIGHTS)
    : merged;
}

// Watches the live transcript and, once it's been quiet (no new finalized
// line) for DEBOUNCE_MS, asks the backend to pick out the most important
// phrases said so far. Returns [{ text, importance }] - `text` is an exact
// substring of some transcript entry's `text`, ready to be matched and
// highlighted in place (see InterviewTranscriptPanel).
//
// Also persists the accumulated list onto the interview record (best-effort,
// fire-and-forget) so the same highlights show up later on the post-
// interview debrief transcript (TranscriptAnalysisTab) - not just live.
// `initialHighlights` seeds state from that saved list when reopening an
// interview already in progress, so a page refresh doesn't lose them.
export function useLiveHighlights({ id, transcript, isCompleted, initialHighlights }) {
  const [highlights, setHighlights] = useState([]);
  const highlightsRef = useRef([]);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const seededRef = useRef(false);
  // The id of the latest finalized entry we've already scheduled/fired a
  // call for - lets a partial-only transcript update (which changes the
  // `transcript` array reference but adds no new final line) pass through
  // without resetting the debounce clock for no reason.
  const lastFinalIdRef = useRef(null);

  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  // `initialHighlights` only arrives once the interview record has finished
  // loading (a render or two after mount), so it can't be the useState
  // initializer - seed it in as soon as it shows up, once.
  useEffect(() => {
    if (seededRef.current || !Array.isArray(initialHighlights) || initialHighlights.length === 0) return;
    seededRef.current = true;
    setHighlights(initialHighlights);
  }, [initialHighlights]);

  useEffect(() => {
    if (isCompleted) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const finalEntries = transcript.filter(
      (e) => e.text?.trim() && !String(e.id).startsWith("partial-")
    );
    if (finalEntries.length === 0) return;

    const latestFinalId = finalEntries[finalEntries.length - 1].id;
    if (latestFinalId === lastFinalIdRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (inFlightRef.current) return;
      lastFinalIdRef.current = latestFinalId;

      const entries = finalEntries
        .slice(-MAX_RECENT_ENTRIES)
        .map((e) => ({ speaker: e.speaker, timestamp: e.timestamp, text: e.text }));

      inFlightRef.current = true;
      try {
        const result = await api.extractHighlights({ transcript: entries, limit: 5 });
        if (Array.isArray(result) && result.length > 0) {
          const merged = mergeHighlights(highlightsRef.current, result);
          setHighlights(merged);

          // Best-effort persistence so the debrief transcript can show the
          // same highlights later - never blocks/surfaces an error over the
          // live interview if it fails.
          if (id) {
            authedFetch(`/api/interviews/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ intv_highlights: merged }),
            }).catch(() => {});
          }
        }
      } catch {
        // Highlighting is a nice-to-have - never surface an error over a
        // live interview, just keep whatever highlights we last had.
      } finally {
        inFlightRef.current = false;
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [id, transcript, isCompleted]);

  return highlights;
}
