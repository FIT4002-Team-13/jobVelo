"""Pure helpers for the interview-completion flow: transcript formatting,
interruption analysis, CV/plan summaries for the report prompt and the
"no transcript" fallbacks.

Nothing here touches the database, so routes/interview.py stays the only place
that talks to MongoDB for interviews.
"""

from __future__ import annotations

from models.interview import (
    InterviewFeedback,
    InterviewFeedbackSection,
    InterviewScores,
)
from models.job_candidate import CandidateRatings, SkillRating

# Cap what we send to the LLM: far below the model's context window, but
# enough for hours of conversation. Past the budget the OLDEST turns are
# dropped - the recent portion carries the most signal for scoring.
TRANSCRIPT_CHAR_BUDGET = 60_000


def clamp_score(value) -> float:
    try:
        return round(min(10.0, max(0.0, float(value))), 1)
    except (TypeError, ValueError):
        return 0.0


def has_non_interviewer_speech(
    entries: list[dict], interviewer_names: set[str]
) -> bool:
    """True if at least one non-empty transcript line is attributed to
    someone other than the given interviewer label set (case-insensitive,
    stripped). False - conservatively - for empty/missing speakers; only an
    explicit non-interviewer label counts as candidate evidence.

    There's no real speaker diarization anywhere in this system - the
    frontend stamps whichever of two hardcoded audio channels a chunk
    arrived on, and the candidate channel silently never connects when
    there's no separate audio source (solo testing, in-person interviews
    sharing one mic, or getDisplayMedia falling back to video-only on
    macOS). When that happens every line - interviewer's and candidate's -
    ends up labeled with the interviewer's own name. This is used to detect
    that failure mode so the report doesn't hallucinate a candidate
    evaluation from text nobody but the interviewer said.
    """
    for e in entries or []:
        text = (e.get("text") or "").strip()
        if not text:
            continue

        role = (e.get("speaker_role") or "").strip().casefold()

        if role:
            if role == "candidate":
                return True
            continue

        speaker = (e.get("speaker") or "").strip()
        if speaker and speaker.casefold() not in interviewer_names:
            return True
    return False


def zero_ratings() -> CandidateRatings:
    return CandidateRatings(
        technical_skills=SkillRating(
            skill="Technical Skills",
            score=0,
            explanation=(
                "No candidate transcript evidence was available to evaluate technical skills."
            ),
            evidence=[],
        ),
        communication=SkillRating(
            skill="Communication",
            score=0,
            explanation=(
                "No candidate transcript evidence was available to evaluate communication."
            ),
            evidence=[],
        ),
        problem_solving=SkillRating(
            skill="Problem Solving",
            score=0,
            explanation=(
                "No candidate transcript evidence was available"
                " to evaluate problem-solving ability."
            ),
            evidence=[],
        ),
    )


def scores_from_ratings(ratings: CandidateRatings) -> InterviewScores:
    return InterviewScores(
        communication=ratings.communication.score,
        skill=ratings.technical_skills.score,
        problem_solving=ratings.problem_solving.score,
    )


def cv_analysis_to_text(doc: dict) -> str:
    """Condense a cv_analyses doc into a compact plain-text block for the
    report prompt: fit scores + bullet titles + suggested questions. The
    detail sentences are dropped - titles carry the hypotheses, and the
    transcript is the evidence."""
    lines: list[str] = []
    fit = doc.get("position_fit") or {}
    if fit:
        lines.append(
            "CV fit scores (0-10): "
            f"relevant experience {fit.get('relevant_experience', '?')}, "
            f"technical {fit.get('technical_fit', '?')}, "
            f"soft skills {fit.get('soft_skills', '?')}"
        )
    for label, key in (
        ("Strengths on paper", "key_strengths"),
        ("Flagged concerns", "improvements"),
        ("Inconsistencies", "inconsistencies"),
    ):
        titles = [b.get("title") for b in (doc.get(key) or []) if b.get("title")]
        if titles:
            lines.append(f"{label}: " + "; ".join(titles))
    questions = [
        q.get("question")
        for q in (doc.get("interview_questions") or [])
        if q.get("question")
    ]
    if questions:
        lines.append("Suggested questions to probe: " + " | ".join(questions))
    return "\n".join(lines)


def plan_sections_to_text(sections: list | None) -> str | None:
    """Condense the interview plan sections into a numbered list for the report
    prompt (topic coverage + plan adherence). None when there's no plan."""
    if not sections:
        return None
    lines: list[str] = []
    for i, s in enumerate(sections, 1):
        if not isinstance(s, dict):
            continue
        name = (s.get("name") or "").strip()
        if not name:
            continue
        desc = (s.get("description") or "").strip()
        minutes = s.get("suggested_minutes")
        extra = []
        if desc:
            extra.append(desc)
        if isinstance(minutes, (int, float)) and minutes:
            extra.append(f"{int(minutes)} min")
        suffix = f" - {'; '.join(extra)}" if extra else ""
        lines.append(f"{i}. {name}{suffix}")
    return "\n".join(lines) or None


def no_transcript_result() -> tuple[
    CandidateRatings, InterviewFeedback, InterviewFeedback
]:
    ratings = zero_ratings()
    candidate_report = InterviewFeedback(
        summary="No transcript was recorded, so candidate feedback could not be generated.",
        strengths=InterviewFeedbackSection(items=[], justification=None),
        improvements=InterviewFeedbackSection(items=[], justification=None),
    )
    interviewer_report = InterviewFeedback(
        summary="No transcript was recorded, so interviewer feedback could not be generated.",
        strengths=InterviewFeedbackSection(items=[], justification=None),
        improvements=InterviewFeedbackSection(items=[], justification=None),
    )
    return ratings, candidate_report, interviewer_report


INTERRUPTION_ACKNOWLEDGEMENTS = {
    "yeah",
    "yes",
    "yep",
    "yup",
    "okay",
    "ok",
    "right",
    "mm-hmm",
    "mm hmm",
    "uh-huh",
    "uh huh",
}


async def detect_interruptions(
    entries: list[dict],
    duration_seconds: int | None,
) -> dict:
    """Detect interviewer speech that starts before the candidate finishes.

    Transcript entries come from two separate audio streams:
      - source="mic"    -> interviewer
      - source="screen" -> candidate/shared audio

    Deepgram timestamps are relative to each stream, so this assumes both
    streams use the same interview timer / recording clock.

    An overlap is treated as a potential interruption when the interviewer
    starts speaking while the candidate is still speaking. Short
    acknowledgement responses (e.g. "yeah", "okay", "right") are ignored
    because they are more likely to be active-listening responses than
    interruptions.

    Frequency is normalised by interview duration so the same number of
    interruptions is not treated equally in a short and long interview.
    """

    interviewer_entries = [
        entry
        for entry in entries
        if entry.get("source") == "mic"
        and entry.get("start") is not None
        and entry.get("end") is not None
    ]

    candidate_entries = [
        entry
        for entry in entries
        if entry.get("source") == "screen"
        and entry.get("start") is not None
        and entry.get("end") is not None
    ]

    interruptions = []

    for interviewer in interviewer_entries:
        interviewer_start = float(interviewer["start"])

        interviewer_text = str(interviewer.get("text") or "").strip()
        normalised_text = " ".join(interviewer_text.casefold().split())

        # Ignore common active-listening acknowledgements.
        if normalised_text in INTERRUPTION_ACKNOWLEDGEMENTS:
            continue

        # Find the candidate utterance that was active when the interviewer
        # started speaking.
        for candidate in candidate_entries:
            candidate_start = float(candidate["start"])
            candidate_end = float(candidate["end"])

            if candidate_start <= interviewer_start < candidate_end:
                overlap = candidate_end - interviewer_start

                interruptions.append(
                    {
                        "timestamp": interviewer.get("timestamp", ""),
                        "interviewer_text": interviewer.get("text", ""),
                        "candidate_text": candidate.get("text", ""),
                        "overlap_seconds": round(overlap, 2),
                    }
                )
                break

    count = len(interruptions)
    effective_duration_seconds = None

    if duration_seconds is not None:
        try:
            parsed_duration = float(duration_seconds)
            if parsed_duration > 0:
                effective_duration_seconds = parsed_duration
        except (TypeError, ValueError):
            pass

    if effective_duration_seconds is None:
        all_end_times = [
            float(entry["end"]) for entry in entries if entry.get("end") is not None
        ]
        if all_end_times:
            effective_duration_seconds = max(all_end_times)

    rate_per_minute = (
        count / (effective_duration_seconds / 60)
        if effective_duration_seconds and effective_duration_seconds > 0
        else None
    )

    # Three or more interruptions per 10 minutes is treated as frequent.
    frequent = rate_per_minute is not None and rate_per_minute >= 0.3

    return {
        "count": count,
        "rate_per_minute": (
            round(rate_per_minute, 2) if rate_per_minute is not None else None
        ),
        "duration_seconds": (
            round(effective_duration_seconds, 2)
            if effective_duration_seconds is not None
            else None
        ),
        "frequent": frequent,
        "evidence": interruptions,
    }


def merge_consecutive_turns(entries: list[dict]) -> list[dict]:
    """Merge back-to-back fragments from the SAME speaker into one turn.

    Live speech-to-text emits many short partial fragments per utterance,
    each with its own timestamp - so a single spoken sentence is split
    across several entries. When the report LLM later quotes "verbatim from
    one line" it lands on a fragment and the evidence reads as a cut-off
    half-sentence. Stitching consecutive same-speaker fragments into one
    block (keeping the FIRST fragment's timestamp as the turn's marker) means
    each line the LLM sees is a whole utterance, so it can quote a complete
    sentence anchored to a real timestamp.
    """
    merged: list[dict] = []
    for e in entries or []:
        text = (e.get("text") or "").strip()
        if not text:
            continue
        speaker = e.get("speaker") or "Unknown"
        if merged and merged[-1]["speaker"] == speaker:
            # Same speaker still talking - append to the open turn. A space
            # joins fragments; existing terminal punctuation is preserved.
            merged[-1]["text"] = f"{merged[-1]['text']} {text}".strip()
        else:
            merged.append(
                {
                    "speaker": speaker,
                    "timestamp": e.get("timestamp") or "",
                    "text": text,
                }
            )
    return merged


def transcript_to_text(entries: list[dict]) -> str:
    """Flatten transcript entries into "[mm:ss] Speaker: text" lines for the
    LLM, one line per speaker TURN (consecutive same-speaker fragments are
    merged first) so quotes come out as complete sentences, not fragments.

    Very long interviews are truncated to TRANSCRIPT_CHAR_BUDGET so a huge
    transcript can never blow the model's context: oldest whole turns are
    dropped first, and a single oversized turn is head-trimmed as a last
    resort. The most recent content (what the report is really about) is
    always kept, flagged with a truncation marker."""
    lines = []
    for e in merge_consecutive_turns(entries):
        timestamp = e.get("timestamp") or ""
        prefix = f"[{timestamp}] " if timestamp else ""
        lines.append(f"{prefix}{e['speaker']}: {e['text']}")

    full = "\n".join(lines)
    if len(full) <= TRANSCRIPT_CHAR_BUDGET:
        return full

    marker = "[earlier transcript truncated]\n"
    while len(lines) > 1 and len(marker + "\n".join(lines)) > TRANSCRIPT_CHAR_BUDGET:
        lines.pop(0)
    body = "\n".join(lines)
    # One remaining turn can still exceed the budget - keep its most recent tail.
    keep = TRANSCRIPT_CHAR_BUDGET - len(marker)
    if len(body) > keep:
        body = body[-keep:]
    return marker + body
