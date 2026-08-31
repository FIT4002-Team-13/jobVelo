"""Interview report PDF rendering (fpdf2).

Turns a stored interview feedback report (summary / strengths /
improvements, plus the three ratings for the candidate variant) into a
clean one-or-two page PDF for download. Pure-python - no native deps.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fpdf import FPDF
from fpdf.enums import XPos, YPos

# Brand palette (mirrors frontend/tailwind.config.js).
_INK = (30, 41, 59)  # neutral-800
_MUTED = (100, 116, 139)  # neutral-500
_FAINT = (148, 163, 184)  # neutral-400
_PRIMARY = (93, 137, 233)  # primary-500
_TRACK = (241, 245, 249)  # neutral-100
_MINT = (63, 212, 147)  # mint-500
_MINT_INK = (34, 130, 87)  # mint-700 (readable on white)
_CORAL = (255, 115, 118)  # coral-500
_AMBER = (217, 119, 6)  # amber-600

# The built-in Helvetica font is latin-1 only; map the common unicode
# punctuation LLM output tends to contain, then replace anything left.
_CHAR_MAP = {
    "—": "-",
    "–": "-",  # em/en dash
    "‘": "'",
    "’": "'",  # curly single quotes
    "“": '"',
    "”": '"',  # curly double quotes
    "…": "...",
    "•": "-",
    "·": "-",
}


def _latin(text: str | None) -> str:
    text = text or ""
    for src, dst in _CHAR_MAP.items():
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")


class _ReportPDF(FPDF):
    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*_FAINT)
        self.cell(0, 8, f"Smart Recruit - page {self.page_no()}", align="C")


def _heading(pdf: _ReportPDF, text: str) -> None:
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*_PRIMARY)
    pdf.cell(0, 7, _latin(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(226, 232, 240)  # neutral-200 divider
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2)


def _body(pdf: _ReportPDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_INK)
    pdf.multi_cell(0, 5.5, _latin(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _bullets(pdf: _ReportPDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_INK)
    for item in items:
        pdf.multi_cell(
            0, 5.5, _latin(f"-  {item}"), new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )


def _justification(pdf: _ReportPDF, text: str | None) -> None:
    if not text:
        return
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_MUTED)
    pdf.multi_cell(0, 5, _latin(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _score_bar(pdf: _ReportPDF, label: str, value: float, colour: tuple) -> None:
    bar_x = pdf.l_margin + 48
    bar_w = 90.0
    bar_h = 3.2
    y = pdf.get_y()

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_INK)
    pdf.cell(48, 6, _latin(label))

    pdf.set_fill_color(*_TRACK)
    pdf.rect(
        bar_x, y + 1.4, bar_w, bar_h, style="F", round_corners=True, corner_radius=1.6
    )
    filled = max(0.0, min(1.0, value / 10)) * bar_w
    if filled > 0:
        pdf.set_fill_color(*colour)
        pdf.rect(
            bar_x,
            y + 1.4,
            filled,
            bar_h,
            style="F",
            round_corners=True,
            corner_radius=1.6,
        )

    pdf.set_xy(bar_x + bar_w + 4, y)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, f"{value:.1f}/10", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _bias_section(pdf: _ReportPDF, incidents: list[dict]) -> None:
    """Render the bias log flagged live during the interview. Each incident:
    category + interview-clock timestamp, the quote, the risk reason, and a
    neutral rephrasing suggestion. An empty list still prints a reassuring
    "none flagged" line so the reader knows the check ran."""
    _heading(pdf, "Bias & Compliance")

    if not incidents:
        _body(
            pdf,
            "No potentially biased or legally-risky questions were flagged "
            "during this interview.",
        )
        return

    count = len(incidents)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_MUTED)
    noun = "question" if count == 1 else "questions"
    pdf.multi_cell(
        0,
        5,
        _latin(f"{count} {noun} flagged by the live bias checker."),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(1)

    for incident in incidents:
        category = (incident.get("category") or "Flagged question").strip()
        timestamp = (incident.get("timestamp") or "").strip()

        # Category (amber) + timestamp on one line.
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*_AMBER)
        pdf.cell(pdf.get_string_width(_latin(category)) + 3, 5.5, _latin(category))
        if timestamp:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_FAINT)
            pdf.cell(0, 5.5, _latin(timestamp))
        pdf.ln(5.5)

        # The flagged quote (italic ink).
        quote = (incident.get("quote") or "").strip()
        if quote:
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_text_color(*_INK)
            pdf.multi_cell(
                0, 5, _latin(f'"{quote}"'), new_x=XPos.LMARGIN, new_y=YPos.NEXT
            )

        # Why it was flagged (muted).
        reason = (incident.get("reason") or "").strip()
        if reason:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MUTED)
            pdf.multi_cell(0, 5, _latin(reason), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Neutral rephrasing (mint).
        suggestion = (incident.get("suggestion") or "").strip()
        if suggestion:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_MINT_INK)
            pdf.multi_cell(
                0,
                5,
                _latin(f"Try instead: {suggestion}"),
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

        pdf.ln(2)


def build_interview_report_pdf(
    *,
    kind: str,  # "candidate" | "interviewer"
    report: dict,
    candidate_name: str | None,
    job_title: str | None,
    interviewer_name: str | None,
    interview_datetime: datetime | None,
    duration_seconds: int | None,
    status: str | None,
    scores: dict | None,  # {communication, skill, problem_solving} for candidate kind
    transcript: list[dict] | None = None,  # [{speaker, timestamp, text}, ...]
    bias_incidents: list[dict] | None = None,  # interviewer kind only
) -> bytes:
    pdf = _ReportPDF()
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    # ── Title ────────────────────────────────────────────────────────────
    subject = "Candidate report" if kind == "candidate" else "Interviewer report"
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*_INK)
    pdf.cell(0, 10, _latin("Interview Report"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_MUTED)
    generated = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    pdf.cell(
        0,
        5.5,
        _latin(f"{subject} - generated {generated}"),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(4)

    # ── Interview details ────────────────────────────────────────────────
    when = (
        interview_datetime.strftime("%A %d %B %Y, %I:%M %p")
        if interview_datetime
        else None
    )
    duration = (
        f"{max(1, round(duration_seconds / 60))} min" if duration_seconds else None
    )
    details = [
        ("Candidate", candidate_name),
        ("Role", job_title),
        ("Interviewer", interviewer_name),
        ("Interview date", when),
        ("Duration", duration),
        ("Status", (status or "").replace("_", " ").title() or None),
    ]
    for label, value in details:
        if not value:
            continue
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*_MUTED)
        pdf.cell(34, 6, _latin(label.upper()))
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(0, 6, _latin(str(value)), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ── Scores (candidate variant only) ──────────────────────────────────
    if kind == "candidate" and scores:
        _heading(pdf, "Scores")
        rows = [
            ("Communication", scores.get("communication"), _PRIMARY),
            ("Skill", scores.get("skill"), _CORAL),
            ("Problem solving", scores.get("problem_solving"), _MINT),
        ]
        values = [v for _, v, _ in rows if isinstance(v, (int, float))]
        for label, value, colour in rows:
            if isinstance(value, (int, float)):
                _score_bar(pdf, label, float(value), colour)
        if values:
            pdf.ln(1)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*_INK)
            pdf.cell(
                0,
                6,
                _latin(f"Overall: {sum(values) / len(values):.1f}/10"),
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

    # ── Report body ──────────────────────────────────────────────────────
    _heading(pdf, "Summary")
    _body(pdf, report.get("summary") or "No summary generated.")

    strengths = report.get("strengths") or {}
    _heading(pdf, "Strengths")
    items = strengths.get("items") or []
    if items:
        _bullets(pdf, items)
        pdf.ln(1)
        _justification(pdf, strengths.get("justification"))
    else:
        _body(pdf, "Nothing noted.")

    improvements = report.get("improvements") or {}
    _heading(pdf, "Improvements")
    items = improvements.get("items") or []
    if items:
        _bullets(pdf, items)
        pdf.ln(1)
        _justification(pdf, improvements.get("justification"))
    else:
        _body(pdf, "Nothing noted.")

    # ── Bias log (interviewer report only - it's the interviewer's conduct)
    if kind == "interviewer":
        _bias_section(pdf, bias_incidents or [])

    # ── Section 2: full transcription, always on its own page ────────────
    entries = [e for e in (transcript or []) if (e.get("text") or "").strip()]
    if entries:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(*_INK)
        pdf.cell(
            0, 9, _latin("Interview Transcription"), new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_MUTED)
        pdf.cell(
            0,
            5,
            _latin(
                f"{len(entries)} entries - timestamps are minutes:seconds from the start"
            ),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        pdf.ln(3)

        for entry in entries:
            speaker = entry.get("speaker") or "Unknown"
            timestamp = entry.get("timestamp") or ""

            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*_INK)
            pdf.cell(pdf.get_string_width(_latin(speaker)) + 2, 5.5, _latin(speaker))
            if timestamp:
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(*_FAINT)
                pdf.cell(0, 5.5, _latin(timestamp))
            pdf.ln(5.5)

            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*_MUTED)
            pdf.multi_cell(
                0,
                5,
                _latin(entry.get("text") or ""),
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )
            pdf.ln(2)

    return bytes(pdf.output())
