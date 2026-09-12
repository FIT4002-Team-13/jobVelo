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

  const [speakerAssignments, setSpeakerAssignments] = useState({});
  const speakerAssignmentsRef = useRef({});

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

  function appendTranscript(text, isFinal, speaker, partialRef, detected = {}) {
    const timestamp = formatTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
    const assignment = getSpeakerAssignment(detected);

    const displayedSpeaker = assignment?.speaker_name || (Number.isInteger(detected.speaker_id) ? `Speaker ${detected.speaker_id + 1}` : speaker);
    const isCandidate = assignment?.speaker_role === "candidate" || (!detected.stream_id && speaker === (candidateName || "Candidate"));

    if (isFinal) {
      const entryId = String(entryCounterRef.current++);
      const prevPartialId = partialRef.current;
      partialRef.current = null;

      const newEntry = {id: entryId, speaker: displayedSpeaker, timestamp, text, source: detected.source, stream_id: detected.stream_id, speaker_id: detected.speaker_id, participant_id: assignment?.participant_id ?? null, speaker_role: assignment?.speaker_role ?? null};
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
        { id: partialId,
          speaker: displayedSpeaker,
          timestamp,
          text,
          source: detected.source,
          stream_id: detected.stream_id,
          speaker_id: detected.speaker_id,
          participant_id: assignment?.participant_id ?? null,
          speaker_role: assignment?.speaker_role ?? null},
      ]);
    }

    if (isCandidate && text?.trim() && isFinal) {
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
        .find((entry) => entry.speaker_role === "interviewer" && entry.text === quote) ||
      [...transcriptRef.current]
        .reverse()
        .find((entry) => entry.speaker === interviewerLabel && entry.text === quote);
    if (!match) return;

    document.getElementById(`transcript-entry-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedEntryId(match.id);
    setTimeout(() => setHighlightedEntryId((cur) => (cur === match.id ? null : cur)), 3000);
  }

  function detectedSpeakerKey(detected) {
    if (!detected.stream_id || !Number.isInteger(detected.speaker_id)) {
      return null;
    }

    return `${detected.stream_id}:${detected.speaker_id}`;
  }

  function storeSpeakerAssignment(key, assignment) {
    const updatedAssignments = { ...speakerAssignmentsRef.current, [key]: assignment};

    speakerAssignmentsRef.current = updatedAssignments;
    setSpeakerAssignments(updatedAssignments);

    return assignment;
  }

  function getSpeakerAssignment(detected) {
    const key = detectedSpeakerKey(detected);

    if (!key) return null;
    const currentAssignments = speakerAssignmentsRef.current;

    // This voice ois already assigned
    if (Object.prototype.hasOwnProperty.call(currentAssignments, key)) {
      return currentAssignments[key];
    }

    const streamAlreadyHasSpeaker = Object.values(currentAssignments).some( assignment => assignment.stream_id === detected.stream_id);

    let person = null;

    if (!streamAlreadyHasSpeaker && detected.source === "mic") {
      person = {
        participant_id: "primary-interviewer",
        speaker_name: userId || "Interviewer",
        speaker_role: "interviewer"
      };
    }

    if (!streamAlreadyHasSpeaker && detected.source === "screen") {
      person = {
        participant_id: "candidate",
        speaker_name: candidateName || "Candidate",
        speaker_role: "candidate"
      };
    }

    return storeSpeakerAssignment(key, {
      stream_id: detected.stream_id,
      speaker_id: detected.speaker_id,
      source: detected.source,

      // Additional voices remain unassigned.
      participant_id: person?.participant_id ?? null,
      speaker_name: person?.speaker_name ?? null,
      speaker_role: person?.speaker_role ?? null
    });
  }

  function assignSpeaker(entry, person) {
    const key = detectedSpeakerKey(entry);

    if (!key) return;

    const demotedKeys = new Set();
    if (person?.role === "interviewer" || person?.role === "candidate") {
      for (const [existingKey, existing] of Object.entries(speakerAssignmentsRef.current)) {
        if (existingKey === key) continue;
        if (existing.speaker_role === person.role) {
          storeSpeakerAssignment(existingKey, {
            stream_id: existing.stream_id,
            speaker_id: existing.speaker_id,
            source: existing.source,
            participant_id: null,
            speaker_name: null,
            speaker_role: null,
          });
          demotedKeys.add(existingKey);
        }
      }
    }

    storeSpeakerAssignment(key, {
      stream_id: entry.stream_id,
      speaker_id: entry.speaker_id,
      source: entry.source,
      participant_id: person?.id ?? null,
      speaker_name: person?.name ?? null,
      speaker_role: person?.role ?? null
    });

    setTranscript(prev => {
      const updated = prev.map(item => {
        const itemKey = detectedSpeakerKey(item);

        if (itemKey === key) {
          const fallback = Number.isInteger(item.speaker_id) ? `Speaker ${item.speaker_id + 1}` : "Speaker";
          return {...item, speaker: person?.name || fallback, participant_id: person?.id ?? null, speaker_role: person?.role ?? null};
        }
        if (itemKey && demotedKeys.has(itemKey)) {
          const fallback = Number.isInteger(item.speaker_id) ? `Speaker ${item.speaker_id + 1}` : "Speaker";
          return { ...item, speaker: fallback, participant_id: null, speaker_role: null};
        }

        return item;
      });

      localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));
      return updated;
    });
  }

  function assignSpeakerForEntry(entry, person) {
    if (!entry?.id) return;

    setTranscript((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== entry.id) return item;
        
        const fallback = Number.isInteger(item.speaker_id) ? `Speaker ${item.speaker_id + 1}` : "Speaker";
        return {...item, speaker: person?.name || fallback, participant_id: person?.id ?? null, speaker_role: person?.role ?? null};
      });
      localStorage.setItem(`transcript-${id}`, JSON.stringify(updated));
      return updated;
    });
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
    speakerAssignments,
    assignSpeaker,
    assignSpeakerForEntry,
  };
}
