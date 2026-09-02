import { useState, useRef, useEffect } from "react";
import { authedFetch } from "../lib/api.js";
import { formatTimer } from "../utils/time.js";

export function useTranscript(id, { serverData, candidateName, userId, isCompleted, startTimeRef, timerRef, generateFollowUpRef }) {
  const [transcript, setTranscript] = useState([]);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [hasNewTranscriptUpdates, setHasNewTranscriptUpdates] = useState(false);
  const [highlightedEntryIdx, setHighlightedEntryIdx] = useState(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState(null);

  const transcriptRef = useRef([]);
  const transcriptContainerRef = useRef(null);
  const transcriptEntryRefs = useRef([]);
  const entryCounterRef = useRef(1);
  const partialEntryRef = useRef(null);
  const displayPartialEntryRef = useRef(null);
  const pendingCandidateResponseRef = useRef("");
  const followUpTimerRef = useRef(null);
  const hasLocalRef = useRef(false);
  const hasInitializedFromServerRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (!hasLocalRef.current) {
      const local = localStorage.getItem(`transcript-${id}`);
      if (local) {
        try {
          const entries = JSON.parse(local);
          setTranscript(entries);
          syncCounterFromEntries(entries);
          hasLocalRef.current = true;
        } catch {
          localStorage.removeItem(`transcript-${id}`);
        }
      }
    }

    if (!serverData || hasInitializedFromServerRef.current) return;
    hasInitializedFromServerRef.current = true;

    const serverTranscript = Array.isArray(serverData.intv_transcript) ? serverData.intv_transcript : [];
    const completed = serverData.intv_status === "completed";

    if (completed) {
      if (serverTranscript.length) {
        setTranscript(serverTranscript);
        syncCounterFromEntries(serverTranscript);
      } else if (!hasLocalRef.current) {
        setTranscript([]);
      }
    } else {
      if (!hasLocalRef.current && serverTranscript.length) {
        setTranscript(serverTranscript);
        syncCounterFromEntries(serverTranscript);
      }
    }
  }, [serverData, id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isCompleted && transcriptRef.current.length) {
        authedFetch(`/api/interviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intv_transcript: transcriptRef.current,
            intv_duration_seconds: timerRef.current,
          }),
        }).then((r) => {
          if (!r.ok) console.error("Autosave failed:", r.status);
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [id, isCompleted]);

  function syncCounterFromEntries(entries) {
    const maxId = entries.reduce((max, e) => {
      const n = parseInt(e.id, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    entryCounterRef.current = maxId + 1;
  }

  function appendTranscript(text, isFinal, speaker, partialRef) {
    const timestamp = formatTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
    const isCandidate = speaker === (candidateName || "Candidate");

    if (isFinal) {
      const entryId = String(entryCounterRef.current++);
      const prevPartialId = partialRef.current;
      partialRef.current = null;

      const newEntry = { id: entryId, speaker, timestamp, text };
      setTranscript((prev) => {
        const refreshed = prevPartialId ? prev.filter((e) => e.id !== prevPartialId) : prev;
        const updated = [...refreshed, newEntry];
        localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));
        return updated;
      });
      setHasNewTranscriptUpdates(true);
    } else {
      if (!partialRef.current) {
        partialRef.current = `partial-${entryCounterRef.current++}`;
      }
      const partialId = partialRef.current;
      setTranscript((prev) => [
        ...prev.filter((e) => e.id !== partialId),
        { id: partialId, speaker, timestamp, text },
      ]);
    }

    if (isCandidate && text?.trim()) {
      pendingCandidateResponseRef.current = [pendingCandidateResponseRef.current, text.trim()]
        .filter(Boolean)
        .join(" ");

      if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = setTimeout(() => {
        const response = pendingCandidateResponseRef.current.trim();
        if (!response) return;
        pendingCandidateResponseRef.current = "";
        generateFollowUpRef.current?.(response);
      }, 2000);
    }
  }

  function handleNoteChange(entryId, text) {
    setTranscript((prev) => {
      const updated = prev.map((e) => (e.id === entryId ? { ...e, comment: text || undefined } : e));
      localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));
      if (isCompleted) {
        authedFetch(`/api/interviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intv_transcript: updated }),
        });
      }
      return updated;
    });
  }

  function showLatestTranscript() {
    transcriptContainerRef.current?.scrollTo({
      top: transcriptContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
    setHasNewTranscriptUpdates(false);
  }

  function jumpToTranscriptEntry(quote) {
    const interviewerLabel = userId || "Interviewer";
    const match = [...transcriptRef.current]
      .reverse()
      .find((entry) => entry.speaker === interviewerLabel && entry.text === quote);
    if (!match) return;

    document.getElementById(`transcript-entry-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedEntryId(match.id);
    setTimeout(() => setHighlightedEntryId((cur) => (cur === match.id ? null : cur)), 3000);
  }

  return {
    transcript,
    setTranscript,
    transcriptRef,
    transcriptVisible,
    setTranscriptVisible,
    hasNewTranscriptUpdates,
    highlightedEntryIdx,
    setHighlightedEntryIdx,
    highlightedEntryId,
    transcriptContainerRef,
    transcriptEntryRefs,
    partialEntryRef,
    displayPartialEntryRef,
    appendTranscript,
    handleNoteChange,
    showLatestTranscript,
    jumpToTranscriptEntry,
  };
}
