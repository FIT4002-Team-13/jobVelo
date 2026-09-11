import { useState, useRef, useEffect } from "react";
import { authedFetch } from "../lib/api.js";
import { normaliseQuestion } from "../components/interview/InterviewQuestionDeck.jsx";

// One shared question pool holds prepared questions AND live follow-ups /
// "more like this" together. New questions go to the FRONT (newest first); the
// interviewer removes them by asking or ignoring; nothing is dropped
// automatically except beyond a generous cap so the deck can't grow forever.
const POOL_CAP = 12;

// Spread a list of {category,...} across categories round-robin so the topic
// mix is interleaved rather than grouped.
function interleaveByCategory(list) {
  const byCategory = new Map();
  for (const q of list || []) {
    if (!byCategory.has(q.category)) byCategory.set(q.category, []);
    byCategory.get(q.category).push(q);
  }
  const out = [];
  let addedAny = true;
  while (addedAny) {
    addedAny = false;
    for (const bucket of byCategory.values()) {
      const next = bucket.shift();
      if (next) {
        out.push(next);
        addedAny = true;
      }
    }
  }
  return out;
}

export function useInterviewQuestions(
  jobId,
  { isCompleted, intvStatus, transcriptRef, activeSectionRef, cvQuestions, cvAnalysisLoaded }
) {
  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [similarQuestionId, setSimilarQuestionId] = useState(null);

  const poolRef = useRef([]);
  const initialRequestedRef = useRef(null);
  const reactiveGeneratingRef = useRef(false);

  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  // Prepend freshly generated questions to the front of the shared pool.
  function prependToPool(items) {
    if (!items.length) return;
    setPool((current) => {
      const next = [...items, ...current].slice(0, POOL_CAP);
      poolRef.current = next;
      return next;
    });
  }

  // Seed the pool once when the interview goes live. Prefer the candidate's
  // CV-analysis questions (specific to their resume); fall back to
  // job-description questions only when there's no analysis. We wait for the
  // CV lookup to settle first so we don't fall back before it has loaded.
  useEffect(() => {
    if (
      !jobId ||
      isCompleted ||
      intvStatus !== "in_progress" ||
      !cvAnalysisLoaded ||
      initialRequestedRef.current === jobId
    )
      return;

    initialRequestedRef.current = jobId;

    // CV-analysis questions carry {category, question, rationale}; map rationale
    // -> reason for the shared normaliser. If present, seed from them and skip
    // the JD call entirely.
    if (cvQuestions && cvQuestions.length) {
      const seeded = interleaveByCategory(cvQuestions).map((q, i) =>
        normaliseQuestion({ category: q.category, question: q.question, reason: q.rationale }, i)
      );
      poolRef.current = seeded;
      setPool(seeded);
      return;
    }

    setPoolLoading(true);
    setPoolError("");

    authedFetch(`/api/interview-questions/${jobId}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Question generation failed");
        return data;
      })
      .then((data) => {
        const seeded = interleaveByCategory(data.questions).map((q, i) => normaliseQuestion(q, i));
        poolRef.current = seeded;
        setPool(seeded);
      })
      .catch((error) => {
        console.error("Question generation failed", error);
        setPoolError(error.message || "Unable to generate questions");
      })
      .finally(() => setPoolLoading(false));
  }, [jobId, isCompleted, intvStatus, cvAnalysisLoaded, cvQuestions]);

  // React to the candidate's latest answer. The model returns 0..N questions,
  // freely mixing "follow_up" (their answer was ambiguous) and "general" (they
  // touched a JD-relevant topic) - or nothing when the answer was clear and
  // off-scope. Whatever comes back is pushed to the FRONT of the flat pool with
  // no cap on follow-ups and no ordering; older questions stay put (queue,
  // don't drop). Single-flight only, so one call runs at a time.
  async function generateReactiveQuestions(candidateResponse) {
    if (!jobId || !candidateResponse?.trim() || reactiveGeneratingRef.current) return;

    reactiveGeneratingRef.current = true;
    try {
      const recentContext = transcriptRef.current
        .filter((e) => e.text)
        .slice(-8)
        .map((e) => `${e.speaker}: ${e.text}`)
        .join("\n");

      const section = activeSectionRef?.current;
      const sectionContext = section
        ? `${section.name}${section.description ? ` - ${section.description}` : ""}`
        : "";

      const response = await authedFetch(`/api/interview-questions/${jobId}/reactive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          candidate_response: candidateResponse.trim(),
          interview_context: recentContext,
          section_context: sectionContext,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Question generation failed");

      const fresh = (data.questions || []).map((q, i) =>
        normaliseQuestion(
          { category: q.category, question: q.question, reason: q.reason },
          i,
          q.kind === "follow_up",
          true
        )
      );
      prependToPool(fresh);
    } catch (error) {
      console.error("Reactive question generation failed", error);
    } finally {
      reactiveGeneratingRef.current = false;
    }
  }

  // "More like this" -> a fresh variant pushed to the front of the pool.
  async function generateMoreLike(question) {
    if (!jobId || similarQuestionId) return;

    setSimilarQuestionId(question.id);
    setPoolError("");

    try {
      const response = await authedFetch(`/api/interview-questions/${jobId}/similar`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          original_question: question.text,
          category: question.categoryValue,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Similar question generation failed");

      prependToPool([normaliseQuestion(data, 0, question.isFollowUp, true)]);
    } catch (error) {
      console.error("Similar question generation failed", error);
      setPoolError(error.message || "Unable to generate a similar question");
    } finally {
      setSimilarQuestionId(null);
    }
  }

  // Asked or ignored -> drop it from the pool. Fresh questions arrive via the
  // triggers above (follow-ups, more-like-this), so there's no forced top-up.
  function ignoreQuestion(question) {
    setPool((current) => {
      const next = current.filter((q) => q.id !== question.id);
      poolRef.current = next;
      return next;
    });
  }

  return {
    questions: pool,
    questionsLoading: poolLoading,
    questionsError: poolError,
    similarQuestionId,
    displayedQuestions: pool,
    generateReactiveQuestions,
    generateMoreLike,
    ignoreQuestion,
  };
}
