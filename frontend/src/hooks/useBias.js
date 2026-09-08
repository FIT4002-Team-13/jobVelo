import { useState, useRef } from "react";
import { formatTimer } from "../utils/time.js";

export function useBias(timerRef) {
  const [biasWarnings, setBiasWarnings] = useState([]);
  const biasIncidentsRef = useRef([]);

  function addBiasWarning(warning) {
    const timestamp = formatTimer(timerRef.current);
    biasIncidentsRef.current.push({
      quote: warning.quote,
      category: warning.category ?? null,
      reason: warning.reason ?? null,
      suggestion: warning.suggestion ?? null,
      timestamp,
    });
    setBiasWarnings((prev) =>
      [...prev, { ...warning, timestamp, id: `bias-${Date.now()}-${Math.random()}` }].slice(-3)
    );
  }

  function dismissBiasWarning(warningId) {
    setBiasWarnings((prev) => prev.filter((w) => w.id !== warningId));
  }

  return { biasWarnings, biasIncidentsRef, addBiasWarning, dismissBiasWarning };
}
