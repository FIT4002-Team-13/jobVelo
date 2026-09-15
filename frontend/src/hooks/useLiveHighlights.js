import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

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

// Watches the live transcript and, once it's been quiet (no new finalized
// line) for DEBOUNCE_MS, asks the backend to pick out the most important
// phrases said so far. Returns [{ text, importance }] - `text` is an exact
// substring of some transcript entry's `text`, ready to be matched and
// highlighted in place (see InterviewTranscriptPanel).
export function useLiveHighlights({ transcript, isCompleted }) {
  const [highlights, setHighlights] = useState([]);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  // The id of the latest finalized entry we've already scheduled/fired a
  // call for - lets a partial-only transcript update (which changes the
  // `transcript` array reference but adds no new final line) pass through
  // without resetting the debounce clock for no reason.
  const lastFinalIdRef = useRef(null);

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
        setHighlights(Array.isArray(result) ? result : []);
      } catch {
        // Highlighting is a nice-to-have - never surface an error over a
        // live interview, just keep whatever highlights we last had.
      } finally {
        inFlightRef.current = false;
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [transcript, isCompleted]);

  return highlights;
}
