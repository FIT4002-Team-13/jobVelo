import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// How often to re-extract highlights from the running transcript (US18).
// Long enough to give the candidate a real answer to highlight, short
// enough to feel "live" - not a fine-tuned value, just a reasonable default.
const POLL_INTERVAL_MS = 15000;
// Only the recent tail matters for "what did they just say that's
// important" - keeps the prompt small and cheap on a long interview.
const MAX_RECENT_ENTRIES = 20;

// Periodically asks the backend to pick out the most important phrases from
// the live transcript so far, and returns them as [{ text, importance }] -
// `text` is an exact substring of some transcript entry's `text`, ready to
// be matched and highlighted in place (see InterviewTranscriptPanel).
//
// Reads the transcript via a ref (not the array itself) so the poll
// interval is created once on mount instead of being torn down and
// recreated on every partial-transcript update, which arrives far more
// often than every 15s during live speech.
export function useLiveHighlights({ transcriptRef, isCompleted }) {
  const [highlights, setHighlights] = useState([]);
  const activeRef = useRef(!isCompleted);
  const inFlightRef = useRef(false);

  useEffect(() => {
    activeRef.current = !isCompleted;
  }, [isCompleted]);

  useEffect(() => {
    async function tick() {
      if (!activeRef.current || inFlightRef.current) return;

      const entries = (transcriptRef.current || [])
        .filter((e) => e.text?.trim() && !String(e.id).startsWith("partial-"))
        .slice(-MAX_RECENT_ENTRIES)
        .map((e) => ({ speaker: e.speaker, timestamp: e.timestamp, text: e.text }));
      if (entries.length === 0) return;

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
    }

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [transcriptRef]);

  return highlights;
}
