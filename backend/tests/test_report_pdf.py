"""Report-PDF rendering smoke tests, focused on the bias log.

The builder is pure (no DB/LLM), so these just assert it produces a valid
PDF and that the interviewer bias section actually adds content while the
candidate report never carries one."""

from services.report_pdf import build_interview_report_pdf

_REPORT = {
    "summary": "Overall a solid interview.",
    "strengths": {"items": ["Asked clear technical questions"], "justification": None},
    "improvements": {"items": ["Watch phrasing on personal topics"], "justification": None},
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
    baseline = _build("candidate", scores={"communication": 8, "skill": 7, "problem_solving": 9})
    with_bias = _build(
        "candidate",
        scores={"communication": 8, "skill": 7, "problem_solving": 9},
        bias_incidents=_BIAS,
    )
    assert len(baseline) == len(with_bias)
