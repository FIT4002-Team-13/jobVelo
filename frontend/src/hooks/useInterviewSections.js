import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";

// Section progress is persisted on each section in intv_sections so it
// survives leaving and re-entering an in-progress interview:
//   status          - idle | running | paused | done
//   elapsed_seconds - time banked from finished run segments
//   run_started_at  - interview-timer reading when the current run began
//                     (only while running)
// The live run segment isn't saved every tick; on re-entry it's rebuilt from
// the saved interview duration, which is what the main timer resumes from too.
export function restoreSectionStates(sections, priorSeconds) {
  return sections.map((s) => {
    const banked = s.elapsed_seconds ?? 0;
    if (s.status === "running") {
      const live = s.run_started_at != null ? Math.max(0, priorSeconds - s.run_started_at) : 0;
      // Held as paused until the mic is live again, then picked back up.
      return { status: "paused", elapsed: banked + live };
    }
    return { status: s.status ?? "idle", elapsed: banked };
  });
}

export function useInterviewSections(id, { serverData, timerRef, intvStatus, isMicActive }) {
  const [sections, setSections] = useState([]);
  const [sectionStates, setSectionStates] = useState([]);
  // Index of the section to (re)start once the mic goes live, or null.
  const [pendingSection, setPendingSection] = useState(null);

  const sectionIntervals = useRef([]);
  const sectionsScrollRef = useRef(null);
  const sectionCardRefs = useRef([]);
  const hasInitializedRef = useRef(false);
  const statesRef = useRef([]);

  useEffect(() => {
    statesRef.current = sectionStates;
  }, [sectionStates]);

  useEffect(() => {
    return () => {
      sectionIntervals.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  const activeSectionIndex = sectionStates.findIndex(
    (st) => st.status === "running" || st.status === "paused"
  );

  useEffect(() => {
    if (activeSectionIndex === -1) return;
    const card = sectionCardRefs.current[activeSectionIndex];
    const container = sectionsScrollRef.current;
    if (!card || !container) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    container.scrollTo({
      left: container.scrollLeft + cardRect.left - containerRect.left - 24,
      behavior: "smooth",
    });
  }, [activeSectionIndex]);

  // Merge per-section progress fields into intv_sections and save them.
  // `patchFor(j, section)` returns the fields to change, or null to leave it.
  function persistSections(patchFor) {
    setSections((prev) => {
      const updated = prev.map((s, j) => {
        const patch = patchFor(j, s);
        return patch ? { ...s, ...patch } : s;
      });
      api.updateInterview(id, { intv_sections: updated }).catch(() => {});
      return updated;
    });
  }

  const elapsedOf = (j) => statesRef.current[j]?.elapsed ?? 0;
  const stopped = (j, status) => ({ status, elapsed_seconds: elapsedOf(j), run_started_at: null });

  function tick(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = setInterval(() => {
      setSectionStates((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], elapsed: next[i].elapsed + 1 };
        return next;
      });
    }, 1000);
  }

  // Shared by start and resume: run section i, closing out whichever section
  // was active. `closeStatuses` is which states count as "active" to close.
  function runSection(i, closeStatuses) {
    const now = timerRef.current;
    const prevStates = statesRef.current;
    persistSections((j, s) => {
      if (j === i) {
        return {
          status: "running",
          elapsed_seconds: elapsedOf(j),
          run_started_at: now,
          ...(s.start_at == null ? { start_at: now } : {}),
        };
      }
      return closeStatuses.includes(prevStates[j]?.status) ? stopped(j, "done") : null;
    });

    setSectionStates((prev) =>
      prev.map((st, j) => {
        if (j === i) return { ...st, status: "running" };
        if (closeStatuses.includes(st.status)) {
          clearInterval(sectionIntervals.current[j]);
          sectionIntervals.current[j] = null;
          return { ...st, status: "done" };
        }
        return st;
      })
    );

    tick(i);
  }

  function startSection(i) {
    runSection(i, ["running", "paused"]);
  }

  function pauseSection(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = null;
    persistSections((j) => (j === i ? stopped(j, "paused") : null));
    setSectionStates((prev) => prev.map((st, j) => (j === i ? { ...st, status: "paused" } : st)));
  }

  function resumeSection(i) {
    runSection(i, ["running"]);
  }

  function doneSection(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = null;
    persistSections((j) => (j === i ? stopped(j, "done") : null));
    setSectionStates((prev) => prev.map((st, j) => (j === i ? { ...st, status: "done" } : st)));
  }

  useEffect(() => {
    if (!serverData || hasInitializedRef.current) return;
    // Don't stand up (or auto-start) the section plan while the interview is
    // still on the prep screen - sections, and their timers, should only
    // begin once the interviewer actually clicks "Begin Interview".
    if (intvStatus === "scheduled" || intvStatus === "not_scheduled") return;
    const { job_id, cand_id, intv_sections, intv_status } = serverData;
    if (!job_id || !cand_id) return;
    hasInitializedRef.current = true;

    const completed = intv_status === "completed";

    if (Array.isArray(intv_sections) && intv_sections.length > 0) {
      const restored = restoreSectionStates(intv_sections, serverData.intv_duration_seconds ?? 0);
      setSections(intv_sections);
      setSectionStates(restored);
      statesRef.current = restored;
      sectionIntervals.current = new Array(intv_sections.length).fill(null);
      if (!completed) {
        // Re-entering: pick the section that was running back up. A section
        // the interviewer paused themselves stays paused. Fresh plan: start
        // at the first section.
        const wasRunning = intv_sections.findIndex((s) => s.status === "running");
        const untouched = restored.every((st) => st.status === "idle");
        setPendingSection(wasRunning !== -1 ? wasRunning : untouched ? 0 : null);
      }
    } else if (!completed) {
      api
        .generatePlan({ job_id, cand_id })
        .then((plan) => {
          if (!Array.isArray(plan) || !plan.length) return;
          setSections(plan);
          setSectionStates(plan.map(() => ({ status: "idle", elapsed: 0 })));
          sectionIntervals.current = new Array(plan.length).fill(null);
          setPendingSection(0);
          api.updateInterview(id, { intv_sections: plan }).catch(() => {});
        })
        .catch(() => {});
    }
  }, [serverData, intvStatus]);

  useEffect(() => {
    if (isMicActive && pendingSection != null) {
      const i = pendingSection;
      setPendingSection(null);
      if (statesRef.current[i]?.status === "idle") startSection(i);
      else resumeSection(i);
    }
  }, [isMicActive, pendingSection]);

  return {
    sections,
    sectionStates,
    sectionsScrollRef,
    sectionCardRefs,
    startSection,
    pauseSection,
    resumeSection,
    doneSection,
  };
}
