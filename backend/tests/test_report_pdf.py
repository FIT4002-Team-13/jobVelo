"""Report-PDF rendering smoke tests, focused on the bias log.

The builder is pure (no DB/LLM), so these just assert it produces a valid
PDF and that the interviewer bias section actually adds content while the
candidate report never carries one."""

from services.report_pdf import build_interview_report_pdf

_REPORT = {
    "summary": "Overall a solid interview.",
    "strengths": {"items": ["Asked clear technical questions"], "justification": None},
    "improvements": {
        "items": ["Watch phrasing on personal topics"],
        "justification": None,
    },
}

_BIAS = [
    {
        "quote": "Are you planning to have children any time soon?",
        "category": "Family status",
        "reason": "Touches a protected category and carries legal risk.",
        "suggestion": "Ask whether they can meet the role's schedule.",
        "timestamp": "04:12",
    }
]


def _build(kind, **over):
    kwargs = {
        "kind": kind,
        "report": _REPORT,
        "candidate_name": "Sara Doe",
        "job_title": "Backend Engineer",
        "interviewer_name": "Alex Tan",
        "interview_datetime": None,
        "duration_seconds": 1800,
        "status": "completed",
        "scores": None,
        "transcript": [],
    }
    kwargs.update(over)
    return build_interview_report_pdf(**kwargs)


def test_interviewer_pdf_bias_section_adds_content():
    """Flagged incidents make the interviewer PDF larger than the same report
    with none - i.e. the bias section actually rendered."""
    with_bias = _build("interviewer", bias_incidents=_BIAS)
    without = _build("interviewer", bias_incidents=[])

    assert with_bias.startswith(b"%PDF")
    assert without.startswith(b"%PDF")
    assert len(with_bias) > len(without)


def test_none_flagged_still_renders():
    """No incidents still produces a valid PDF (the reassuring 'none' line)."""
    pdf = _build("interviewer", bias_incidents=[])
    assert pdf.startswith(b"%PDF")


def test_candidate_pdf_ignores_bias_incidents():
    """The bias log is interviewer-only: passing incidents to the candidate
    report must not change its output."""
    baseline = _build(
        "candidate", scores={"communication": 8, "skill": 7, "problem_solving": 9}
    )
    with_bias = _build(
        "candidate",
        scores={"communication": 8, "skill": 7, "problem_solving": 9},
        bias_incidents=_BIAS,
    )
    assert len(baseline) == len(with_bias)


_RATINGS = {
    "communication": {
        "skill": "Communication",
        "score": 8,
        "explanation": "Articulated ideas clearly throughout.",
        "evidence": [
            {
                "transcript_entry_id": "3",
                "speaker": "Sara Doe",
                "timestamp": "02:14",
                "text": "I like to walk the team through my reasoning step by step.",
            }
        ],
    },
    "technical_skills": {
        "skill": "Technical Skills",
        "score": 7,
        "explanation": None,
        "evidence": [],
    },
    "problem_solving": {
        "skill": "Problem Solving",
        "score": 9,
        "explanation": "Broke the problem into smaller parts before coding.",
        "evidence": [],
    },
}


def test_candidate_pdf_score_evidence_adds_content():
    """Passing skill_evidence renders the extra Score Evidence section -
    quotes, explanations and all - so the candidate PDF is larger than the
    same report without it."""
    without = _build(
        "candidate", scores={"communication": 8, "skill": 7, "problem_solving": 9}
    )
    with_evidence = _build(
        "candidate",
        scores={"communication": 8, "skill": 7, "problem_solving": 9},
        skill_evidence=_RATINGS,
    )
    assert with_evidence.startswith(b"%PDF")
    assert len(with_evidence) > len(without)


def test_interviewer_pdf_ignores_skill_evidence():
    """Score Evidence is a candidate-only section, same as Scores itself -
    passing it for the interviewer variant must not change the output."""
    baseline = _build("interviewer", bias_incidents=[])
    with_evidence = _build("interviewer", bias_incidents=[], skill_evidence=_RATINGS)
    assert len(baseline) == len(with_evidence)
