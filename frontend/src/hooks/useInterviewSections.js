import { useState, useRef, useEffect } from "react";
import { authedFetch } from "../lib/api.js";

export function useInterviewSections(id, { serverData, timerRef }) {
  const [sections, setSections] = useState([]);
  const [sectionStates, setSectionStates] = useState([]);

  const sectionIntervals = useRef([]);
  const sectionsScrollRef = useRef(null);
  const sectionCardRefs = useRef([]);
  const hasInitializedRef = useRef(false);

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

  function startSection(i) {
    const startAt = timerRef.current;
    setSections((prev) => {
      const updated = prev.map((s, j) => (j === i && s.start_at == null ? { ...s, start_at: startAt } : s));
      authedFetch(`/api/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intv_sections: updated }),
      }).catch(() => {});
      return updated;
    });

    setSectionStates((prev) =>
      prev.map((st, j) => {
        if (j === i) return { ...st, status: "running" };
        if (st.status === "running" || st.status === "paused") {
          clearInterval(sectionIntervals.current[j]);
          sectionIntervals.current[j] = null;
          return { ...st, status: "done" };
        }
        return st;
      })
    );

    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = setInterval(() => {
      setSectionStates((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], elapsed: next[i].elapsed + 1 };
        return next;
      });
    }, 1000);
  }

  function pauseSection(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = null;
    setSectionStates((prev) => prev.map((st, j) => (j === i ? { ...st, status: "paused" } : st)));
  }

  function resumeSection(i) {
    setSectionStates((prev) =>
      prev.map((st, j) => {
        if (j === i) return { ...st, status: "running" };
        if (st.status === "running") {
          clearInterval(sectionIntervals.current[j]);
          sectionIntervals.current[j] = null;
          return { ...st, status: "done" };
        }
        return st;
      })
    );

    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = setInterval(() => {
      setSectionStates((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], elapsed: next[i].elapsed + 1 };
        return next;
      });
    }, 1000);
  }

  function doneSection(i) {
    clearInterval(sectionIntervals.current[i]);
    sectionIntervals.current[i] = null;
    setSectionStates((prev) => prev.map((st, j) => (j === i ? { ...st, status: "done" } : st)));
  }

  useEffect(() => {
    if (!serverData || hasInitializedRef.current) return;
    const { job_id, cand_id, intv_sections, intv_status } = serverData;
    if (!job_id || !cand_id) return;
    hasInitializedRef.current = true;

    const completed = intv_status === "completed";

    if (Array.isArray(intv_sections) && intv_sections.length > 0) {
      setSections(intv_sections);
      setSectionStates(intv_sections.map(() => ({ status: "idle", elapsed: 0 })));
      sectionIntervals.current = new Array(intv_sections.length).fill(null);
      if (!completed) startSection(0);
    } else if (!completed) {
      authedFetch("/api/interviews/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id, cand_id }),
      })
        .then((r) => r.json())
        .then((plan) => {
          if (!Array.isArray(plan) || !plan.length) return;
          setSections(plan);
          setSectionStates(plan.map(() => ({ status: "idle", elapsed: 0 })));
          sectionIntervals.current = new Array(plan.length).fill(null);
          startSection(0);
          authedFetch(`/api/interviews/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intv_sections: plan }),
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }, [serverData]);

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
