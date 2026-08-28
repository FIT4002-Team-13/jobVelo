from datetime import datetime

from fpdf import FPDF
from fpdf.enums import XPos, YPos

TEXT = (30, 41, 59)
MUTED = (100, 116, 139)
PRIMARY = (93, 137, 233)
FAINT = (148, 163, 184)

CHARACTER_REPLACEMENTS = {
    "—": "-",
    "–": "-",
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
}


def safe_text(value) -> str:
    text = str(value or "")

    for original, replacement in CHARACTER_REPLACEMENTS.items():
        text = text.replace(original, replacement)

    return text.encode("latin-1", "replace").decode("latin-1")

class TranscriptPDF(FPDF):
    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*FAINT)

        self.cell(0, 8, f"Page {self.page_no()}", align="C")

def build_transcript_pdf(*, entries: list[dict], candidate_name: str | None, job_title: str | None, interview_datetime: datetime | None) -> bytes:
    pdf = TranscriptPDF()

    pdf.set_auto_page_break(auto=True, margin=18)

    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*TEXT)

    pdf.cell(0, 10, "Interview Transcript", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)

    details = [
        ("Candidate", candidate_name),
        ("Role", job_title),
        (
            "Interview date",
            interview_datetime.strftime("%d %B %Y, %I:%M %p")
            if interview_datetime
            else None,
        ),
    ]

    for label, value in details:
        if not value:
            continue

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*MUTED)
        pdf.cell(35, 6, safe_text(label))
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*TEXT)
        pdf.multi_cell(0, 6, safe_text(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(4)

    pdf.set_draw_color(226, 232, 240)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())

    pdf.ln(5)

    for entry in entries:
        
        timestamp = entry.get("timestamp") or "--:--"
        speaker = entry.get("speaker") or "Unknown speaker"
        transcript_text = entry.get("text") or ""

        # Keep the timestamp, speaker and transcript text together.
        with pdf.unbreakable() as block:
            block.set_font("Helvetica", "B", 10)
            block.set_text_color(*PRIMARY)
            block.multi_cell(0, 6, safe_text(f"{timestamp}   {speaker}"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            block.set_font("Helvetica", "", 10)
            block.set_text_color(*TEXT)
            block.multi_cell(0, 5.5, safe_text(transcript_text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            block.ln(3)

    return bytes(pdf.output())