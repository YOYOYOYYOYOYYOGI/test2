"""
Build the RANGAT NATURALS CEO Growth Strategy as a polished PDF (~50 pages)
"""
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Image, Flowable
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfgen import canvas
import markdown
from pathlib import Path

# Brand palette
SAFFRON = HexColor("#E2A04B")
TERRACOTTA = HexColor("#C5654B")
CREAM = HexColor("#F7F2EA")
FOREST = HexColor("#2F4F3E")
DARK = HexColor("#1A1A1A")

# Source markdown
src = Path("/home/user/test2/rangat-naturals-strategy/RANGAT_NATURALS_FINAL_DOCUMENT.md").read_text()

# Custom page templates with header/footer
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        page_num = self._pageNumber
        # Header band
        self.setFillColor(TERRACOTTA)
        self.rect(0, self._pagesize[1] - 0.5 * cm, self._pagesize[0], 0.5 * cm, fill=1, stroke=0)
        self.setFillColor(white)
        self.setFont("Helvetica-Bold", 8)
        self.drawString(1 * cm, self._pagesize[1] - 0.32 * cm, "RANGAT NATURALS — CEO GROWTH STRATEGY")
        # Footer band
        self.setFillColor(CREAM)
        self.rect(0, 0, self._pagesize[0], 0.5 * cm, fill=1, stroke=0)
        self.setFillColor(FOREST)
        self.setFont("Helvetica-Oblique", 8)
        self.drawString(1 * cm, 0.15 * cm, "v1.0 • September 2026 • Gujarat → India → Global")
        self.drawRightString(self._pagesize[0] - 1 * cm, 0.15 * cm, f"Page {page_num} of {page_count}")
        # Side accent
        self.setFillColor(SAFFRON)
        self.rect(0, 0.5 * cm, 0.25 * cm, self._pagesize[1] - 1.0 * cm, fill=1, stroke=0)


# Styles
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "TitleStyle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=28, textColor=TERRACOTTA, alignment=TA_LEFT, leading=32, spaceAfter=8
)
subtitle_style = ParagraphStyle(
    "Subtitle", fontName="Helvetica-Bold", fontSize=15, textColor=FOREST, leading=18, spaceAfter=5
)
h1 = ParagraphStyle(
    "H1", fontName="Helvetica-Bold", fontSize=14, textColor=TERRACOTTA,
    leading=18, spaceBefore=8, spaceAfter=5, borderPadding=3,
    borderWidth=0, backColor=CREAM, leftIndent=0
)
h2 = ParagraphStyle(
    "H2", fontName="Helvetica-Bold", fontSize=11, textColor=FOREST,
    leading=14, spaceBefore=6, spaceAfter=3
)
h3 = ParagraphStyle(
    "H3", fontName="Helvetica-Bold", fontSize=9.5, textColor=TERRACOTTA,
    leading=12, spaceBefore=5, spaceAfter=2
)
body = ParagraphStyle(
    "Body", fontName="Helvetica", fontSize=8, textColor=DARK,
    leading=11, spaceAfter=3, alignment=TA_JUSTIFY
)
body_b = ParagraphStyle(
    "BodyBold", parent=body, fontName="Helvetica-Bold"
)
quote = ParagraphStyle(
    "Quote", fontName="Helvetica-Oblique", fontSize=9, textColor=FOREST,
    leading=12, leftIndent=14, rightIndent=14, spaceAfter=5, spaceBefore=2
)
bullet = ParagraphStyle(
    "Bullet", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=2
)
table_h = ParagraphStyle(
    "TableH", fontName="Helvetica-Bold", fontSize=7, textColor=white, leading=8.5, alignment=TA_LEFT
)
table_c = ParagraphStyle(
    "TableC", fontName="Helvetica", fontSize=7, textColor=DARK, leading=8.5, alignment=TA_LEFT
)
callout = ParagraphStyle(
    "Callout", fontName="Helvetica-Bold", fontSize=9, textColor=white,
    backColor=FOREST, leading=12, leftIndent=10, rightIndent=10,
    spaceBefore=5, spaceAfter=5, borderPadding=5
)


def parse_inline(text):
    """Convert markdown inline to reportlab-friendly markup."""
    # Escape XML chars
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Bold **text**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic *text* or _text_
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    # Code `text`
    text = re.sub(r"`(.+?)`", r'<font face="Courier">\1</font>', text)
    return text


def md_to_flowables(md_text):
    """Convert markdown to reportlab flowables."""
    flow = []
    lines = md_text.split("\n")
    i = 0
    in_code = False
    code_buffer = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Code blocks
        if stripped.startswith("```"):
            if not in_code:
                in_code = True
                code_buffer = []
            else:
                in_code = False
                code_text = "\n".join(code_buffer)
                flow.append(Spacer(1, 4))
                code_p = ParagraphStyle("Code", fontName="Courier", fontSize=8,
                                        backColor=CREAM, leading=11, leftIndent=8, rightIndent=8,
                                        borderPadding=6, spaceAfter=6)
                flow.append(Paragraph(code_text.replace("\n", "<br/>"), code_p))
                flow.append(Spacer(1, 4))
            i += 1
            continue
        if in_code:
            code_buffer.append(line)
            i += 1
            continue

        # Headings
        if stripped.startswith("# "):
            flow.append(Spacer(1, 4))
            flow.append(Paragraph(parse_inline(stripped[2:]), title_style))
            flow.append(Spacer(1, 6))
            i += 1
            continue
        if stripped.startswith("## "):
            flow.append(Paragraph(parse_inline(stripped[3:]), h1))
            i += 1
            continue
        if stripped.startswith("### "):
            flow.append(Paragraph(parse_inline(stripped[4:]), h2))
            i += 1
            continue
        if stripped.startswith("#### "):
            flow.append(Paragraph(parse_inline(stripped[5:]), h3))
            i += 1
            continue

        # Horizontal rule
        if stripped == "---":
            flow.append(Spacer(1, 4))
            flow.append(Table([[""]], colWidths=[16 * cm], rowHeights=[0.02 * cm],
                              style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), TERRACOTTA)])))
            flow.append(Spacer(1, 4))
            i += 1
            continue

        # Tables
        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s\-:|]+\|", lines[i + 1]):
            tbl_rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                tbl_rows.append(cells)
                i += 1
            if len(tbl_rows) >= 2:
                header = tbl_rows[0]
                data = tbl_rows[2:]  # skip separator row
                # Build paragraph-styled cells
                styled_header = [Paragraph(parse_inline(c), table_h) for c in header]
                styled_data = [[Paragraph(parse_inline(c), table_c) for c in row] for row in data]
                # Equal column widths
                n_cols = len(header)
                col_w = 17 * cm / n_cols
                tbl = Table([styled_header] + styled_data,
                            colWidths=[col_w] * n_cols,
                            repeatRows=1)
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), TERRACOTTA),
                    ("TEXTCOLOR", (0, 0), (-1, 0), white),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, CREAM]),
                    ("GRID", (0, 0), (-1, -1), 0.2, HexColor("#C5654B")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ]))
                flow.append(tbl)
                flow.append(Spacer(1, 4))
            continue

        # Bullets
        if stripped.startswith("- ") or stripped.startswith("* "):
            items = []
            while i < len(lines) and (lines[i].strip().startswith("- ") or lines[i].strip().startswith("* ")):
                items.append(lines[i].strip()[2:])
                i += 1
            for it in items:
                flow.append(Paragraph("• " + parse_inline(it), bullet))
            flow.append(Spacer(1, 2))
            continue

        # Numbered list
        if re.match(r"^\d+\.\s", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i].strip()):
                items.append(re.sub(r"^\d+\.\s", "", lines[i].strip()))
                i += 1
            for n, it in enumerate(items, 1):
                flow.append(Paragraph(f"{n}. " + parse_inline(it), bullet))
            flow.append(Spacer(1, 2))
            continue

        # Empty line
        if not stripped:
            flow.append(Spacer(1, 1))
            i += 1
            continue

        # Quote (> line)
        if stripped.startswith(">"):
            text = stripped[1:].strip()
            flow.append(Paragraph(parse_inline(text), quote))
            i += 1
            continue

        # Regular paragraph
        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith("#") or nxt.startswith("- ") or nxt.startswith("|") or nxt.startswith(">") or nxt == "---" or re.match(r"^\d+\.\s", nxt):
                break
            para_lines.append(nxt)
            i += 1
        para_text = " ".join(para_lines)
        flow.append(Paragraph(parse_inline(para_text), body))
        flow.append(Spacer(1, 2))

    return flow


# Build document
out_pdf = "/home/user/test2/RANGAT_NATURALS_CEO_GROWTH_STRATEGY.pdf"
doc = SimpleDocTemplate(
    out_pdf,
    pagesize=A4,
    leftMargin=1.6 * cm,
    rightMargin=1.4 * cm,
    topMargin=1.2 * cm,
    bottomMargin=1.0 * cm,
    title="RANGAT NATURALS — CEO Growth Strategy",
    author="Founder",
)

flow = md_to_flowables(src)
doc.build(flow, canvasmaker=NumberedCanvas)
print(f"PDF saved: {out_pdf}")

# Estimate page count from word count (~350 words/page for this layout)
import os
size = os.path.getsize(out_pdf)
print(f"Size: {size:,} bytes")
