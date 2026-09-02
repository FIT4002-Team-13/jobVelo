import { useState, useRef, useEffect } from "react";
import { authedFetch } from "../lib/api.js";
import { normaliseQuestion } from "../components/interview/InterviewQuestionDeck.jsx";

export function useInterviewQuestions(jobId, { isCompleted, intvStatus, transcriptRef }) {
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState("");
  const [similarQuestionId, setSimilarQuestionId] = useState(null);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [, setFollowUpLoading] = useState(false);

  const questionsRef = useRef([]);
  const questionsRequestedJobRef = useRef(null);
  const pendingCategoriesRef = useRef([]);
  const followUpGeneratingRef = useRef(false);

  const BASE_QUESTION_COUNT = 2;

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    if (!jobId || isCompleted || intvStatus !== "in_progress" || questionsRequestedJobRef.current === jobId) return;

    questionsRequestedJobRef.current = jobId;
    setQuestionsLoading(true);
    setQuestionsError("");

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
        const behavioural = data.questions.filter((q) => q.category === "behavioural");
        const technical = data.questions.filter((q) => q.category === "technical");
        const interleaved = [];
        const maxLen = Math.max(behavioural.length, technical.length);
        for (let i = 0; i < maxLen; i += 1) {
          if (behavioural[i]) interleaved.push(behavioural[i]);
          if (technical[i]) interleaved.push(technical[i]);
        }
        setQuestions(interleaved.map((q, i) => normaliseQuestion(q, i)));
      })
      .catch((error) => {
        console.error("Question generation failed", error);
        setQuestionsError(error.message || "Unable to generate questions");
      })
      .finally(() => setQuestionsLoading(false));
  }, [jobId, isCompleted, intvStatus]);

  async function generateFollowUpQuestions(candidateResponse) {
    if (!jobId || !candidateResponse?.trim() || followUpGeneratingRef.current) return;

    followUpGeneratingRef.current = true;
    setFollowUpLoading(true);

    try {
      const recentContext = transcriptRef.current
        .filter((e) => e.text)
        .slice(-8)
        .map((e) => `${e.speaker}: ${e.text}`)
        .join("\n");

      const response = await authedFetch(`/api/interview-questions/${jobId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          candidate_response: candidateResponse.trim(),
          interview_context: recentContext,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Follow-up question generation failed");

      const newFollowUps = (data.questions || []).slice(0, 2).map((q, i) => normaliseQuestion(q, i, true, true));
      setFollowUpQuestions((prev) => [...newFollowUps, ...prev].slice(0, 2));
    } catch (error) {
      console.error("Follow-up question generation failed", error);
    } finally {
      setFollowUpLoading(false);
      followUpGeneratingRef.current = false;
    }
  }

  async function generateMoreLike(question) {
    if (!jobId || similarQuestionId) return;

    setSimilarQuestionId(question.id);
    setQuestionsError("");

    try {
      const response = await authedFetch(`/api/interview-questions/${jobId}/similar`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ original_question: question.text, category: question.categoryValue }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Similar question generation failed");

      const similarQuestion = normaliseQuestion(data, 0, false, true);
      setQuestions((current) => [similarQuestion, ...current].slice(0, 6));
    } catch (error) {
      console.error("Similar question generation failed", error);
      setQuestionsError(error.message || "Unable to generate a similar question");
    } finally {
      setSimilarQuestionId(null);
    }
  }

  async function ignoreQuestion(question) {
    if (!jobId) return;

    if (question.isFollowUp) {
      setFollowUpQuestions((current) => current.filter((q) => q.id !== question.id));
      return;
    }

    const remaining = questionsRef.current.filter((q) => q.id !== question.id);
    questionsRef.current = remaining;
    setQuestions(remaining);
    setQuestionsError("");

    if (remaining.length >= BASE_QUESTION_COUNT) return;

    const behInList = remaining.filter((q) => q.categoryValue === "behavioural").length;
    const techInList = remaining.filter((q) => q.categoryValue === "technical").length;
    const behPending = pendingCategoriesRef.current.filter((c) => c === "behavioural").length;
    const techPending = pendingCategoriesRef.current.filter((c) => c === "technical").length;
    const neededCategory = behInList + behPending <= techInList + techPending ? "behavioural" : "technical";

    pendingCategoriesRef.current = [...pendingCategoriesRef.current, neededCategory];

    try {
      const response = await authedFetch(`/api/interview-questions/${jobId}/similar`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ original_question: question.text, category: neededCategory }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Replacement question generation failed");

      const replacement = normaliseQuestion(data, 0, false, true);
      setQuestions((current) => {
        const next = [...current, replacement];
        questionsRef.current = next;
        return next;
      });
    } catch (error) {
      console.error("Ignore replacement failed", error);
      setQuestionsError(error.message || "Unable to generate a replacement question");
    } finally {
      const idx = pendingCategoriesRef.current.indexOf(neededCategory);
      if (idx !== -1) {
        pendingCategoriesRef.current = [
          ...pendingCategoriesRef.current.slice(0, idx),
          ...pendingCategoriesRef.current.slice(idx + 1),
        ];
      }
    }
  }

  const displayedQuestions = [...followUpQuestions, ...questions].slice(0, 6);

  return {
    questions,
    questionsLoading,
    questionsError,
    similarQuestionId,
    followUpQuestions,
    displayedQuestions,
    generateFollowUpQuestions,
    generateMoreLike,
    ignoreQuestion,
  };
}
