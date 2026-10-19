#!/usr/bin/env python3
"""
Build GLOWAMOUR-Instagram-Strategy.pdf from the deliverable files in this folder.

The Markdown/CSV sources are the single source of truth: this script renders them
VERBATIM (no rewording, no regeneration). It exists so the PDF can be rebuilt after
the .md files are edited.

Pipeline
--------
prose  -> python-markdown -> fpdf2 write_html (headings, lists, code, quotes, TOC)
tables -> fpdf2 native table() API (write_html cannot do mixed inline markup in cells)
csv    -> appendix tables (calendar landscape, tracker structure + week grid)

Requirements: pip install fpdf2 uharfbuzz markdown
Fonts: Noto static TTFs in ../.fonts/static/ (NotoSans R/B/I/BI, NotoSansMono R/B,
NotoSansGujarati R/B, NotoEmoji R, NotoSansSymbols2 R). Gujarati conjuncts are shaped
with HarfBuzz (set_text_shaping); missing glyphs fall back per character.
"""
from __future__ import annotations

import csv
import math
import re
from pathlib import Path

import markdown as md_lib
from fpdf import FPDF
from fpdf.enums import WrapMode
from fpdf.fonts import FontFace, TextStyle
from fpdf.html import HTML2FPDF, HEADING_TAGS

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "glowamour"
FONTDIR = ROOT / ".fonts" / "static"
OUT = SRC / "GLOWAMOUR-Instagram-Strategy.pdf"

FILES = [
    "00-START-HERE.md",
    "01-profile-setup.md",
    "02-seo-keywords.md",
    "03-profile-layout-trust.md",
    "04-audience.md",
    "05-content-strategy.md",
    "06-algorithm-growth.md",
    "07-measurement.md",
    "08-implementation-plan.md",
    "09-dm-scripts.md",
    "10-master-checklist.md",
    "11-compliance-claims.md",
]

# ---------------------------------------------------------------- palette
INK = (26, 26, 26)
SLATE = (55, 65, 81)
MUTED = (110, 116, 125)
AMBER = (146, 64, 14)
AMBER_SOFT = (250, 243, 232)
ZEBRA = (247, 245, 241)
RULE = (210, 214, 219)
CODE_COL = (124, 45, 18)

MD_EXTENSIONS = ["tables", "fenced_code", "sane_lists"]


# ---------------------------------------------------------------- markdown helpers
def sanitize(md_text: str) -> str:
    """Escape stray raw-HTML angle brackets (the sources contain none on purpose)."""
    return re.sub(r"<(?=[A-Za-z/])", "&lt;", md_text)


def split_segments(md_text: str) -> list:
    """Split a markdown document into ('md', text) and ('table', rows) segments."""
    lines = md_text.split("\n")
    segs: list = []
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        if "\n".join(buf).strip():
            segs.append(("md", "\n".join(buf)))
        buf = []

    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if (
            s.startswith("|")
            and s.endswith("|")
            and i + 1 < len(lines)
            and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip())
        ):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            if len(rows) >= 2 and all(re.fullmatch(r":?-{1,}:?", c) for c in rows[1]):
                rows.pop(1)
            segs.append(("table", rows))
            continue
        buf.append(lines[i])
        i += 1
    flush()
    return segs


def table_col_widths(rows: list[list[str]]) -> list[float]:
    """Relative widths from content length, clamped so narrow columns stay usable."""
    ncols = max(len(r) for r in rows)
    score = []
    for c in range(ncols):
        lens = [len(r[c]) for r in rows if c < len(r)] or [4]
        mx, mean = max(lens), sum(lens) / len(lens)
        score.append(math.sqrt(max(mx, 6)) * 0.6 + math.sqrt(max(mean, 4)) * 0.9)
    pct = [100.0 * s / sum(score) for s in score]
    pct = [min(max(p, 4.0), 46.0) for p in pct]
    return [p * 100.0 / sum(pct) for p in pct]


def translate_cell(s: str) -> str:
    """Map markdown inline markup onto the flavour fpdf2's table markdown supports.

    fpdf2 table markdown understands **bold**, __italics__, --underline--, ~~strike~~.
    Backticks are dropped (cell text stays verbatim, just not monospaced).
    """
    s = re.sub(r"\*\*\*([^*\n]+)\*\*\*", r"**\1**", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"__\1__", s)
    return s


# ---------------------------------------------------------------- document
class SingleSectionHTML(HTML2FPDF):
    """fpdf2 registers one outline section per *text chunk* inside a heading, which
    splits any heading containing inline markup (code, bold...) into several TOC
    lines. Register each heading exactly once, when its closing tag arrives."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._heading_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in HEADING_TAGS:
            self._heading_buf = []
        super().handle_starttag(tag, attrs)

    def _write_data(self, data: str) -> None:
        if self.heading_level:
            self._heading_buf.append(data)
            self._write_paragraph(data)
        else:
            super()._write_data(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in HEADING_TAGS and self._heading_buf:
            level = 0 if tag == "title" else int(tag[1:]) - 1
            self.pdf.start_section(" ".join("".join(self._heading_buf).split()), level, strict=False)
            self._heading_buf = []
        super().handle_endtag(tag)


class Playbook(FPDF):
    HTML2FPDF_CLASS = SingleSectionHTML

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("NS", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 4, "GLOWAMOUR  ·  Instagram Growth & Social SEO Playbook  ·  prepared 19 Oct 2026")
        self.ln(4.6)
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4.5)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("NS", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(self.epw * 0.66, 5, "GLOWAMOUR strategy pack · every claim must stay substantiable")
        self.cell(self.epw * 0.34, 5, f"Page {self.page_no()}/{{nb}}", align="R")


def register_fonts(pdf: FPDF) -> None:
    specs = [
        ("NS", "", "NotoSans-Regular.ttf"),
        ("NS", "B", "NotoSans-Bold.ttf"),
        ("NS", "I", "NotoSans-Italic.ttf"),
        ("NS", "BI", "NotoSans-BoldItalic.ttf"),
        ("NM", "", "NotoSansMono-Regular.ttf"),
        ("NM", "B", "NotoSansMono-Bold.ttf"),
        ("NG", "", "NotoSansGujarati-Regular.ttf"),
        ("NG", "B", "NotoSansGujarati-Bold.ttf"),
        ("NE", "", "NotoEmoji-Regular.ttf"),
        ("NS2", "", "NotoSansSymbols2-Regular.ttf"),
        # synthetic italic slots: these families ship no oblique, so italic contexts
        # (blockquotes, *emphasis* around code) must still resolve to a real face
        ("NM", "I", "NotoSansMono-Regular.ttf"),
        ("NM", "BI", "NotoSansMono-Bold.ttf"),
        ("NG", "I", "NotoSansGujarati-Regular.ttf"),
        ("NG", "BI", "NotoSansGujarati-Bold.ttf"),
        ("NE", "I", "NotoEmoji-Regular.ttf"),
        ("NE", "BI", "NotoEmoji-Regular.ttf"),
        ("NS2", "I", "NotoSansSymbols2-Regular.ttf"),
        ("NS2", "BI", "NotoSansSymbols2-Regular.ttf"),
    ]
    for fam, style, fn in specs:
        pdf.add_font(fam, style, str(FONTDIR / fn))
    pdf.set_fallback_fonts(["NG", "NE", "NS2", "NM"])
    pdf.set_text_shaping(True)


# NOTE on margins: fpdf2 only calibrates the margin values of its own
# DEFAULT_TAG_STYLES; TextStyle instances passed in via tag_styles are used raw and
# any custom t_margin/b_margin blows the vertical rhythm up dramatically. So every
# block style below keeps fpdf2's calibrated default margins and overrides only
# colour, size, weight and (where safe) left indent.
TAG_STYLES = {
    "a": FontFace(color=(37, 99, 235)),
    "b": FontFace(emphasis="BOLD"),
    "code": FontFace(family="NM", size_pt=8.1, color=CODE_COL),
    "del": FontFace(emphasis="STRIKETHROUGH"),
    "em": FontFace(emphasis="ITALICS"),
    "font": FontFace(),
    "i": FontFace(emphasis="ITALICS"),
    "s": FontFace(emphasis="STRIKETHROUGH"),
    "strong": FontFace(emphasis="BOLD"),
    "u": FontFace(emphasis="UNDERLINE"),
    "blockquote": TextStyle(color=(96, 100, 106), font_style="I", l_margin=6, t_margin=3, b_margin=3),
    "center": TextStyle(t_margin=4 + 7 / 30, l_margin="Center"),
    "dd": TextStyle(l_margin=10),
    "dt": TextStyle(font_style="B", t_margin=4 + 7 / 30),
    "title": TextStyle(b_margin=0.4, font_size_pt=28, t_margin=6, l_margin="Center"),
    "h1": TextStyle(color=INK, font_style="B", font_size_pt=18.5,
                    t_margin=5 + 834 / 900, b_margin=0.4),
    "h2": TextStyle(color=AMBER, font_style="B", font_size_pt=13,
                    t_margin=5 + 453 / 900, b_margin=0.4),
    "h3": TextStyle(color=SLATE, font_style="B", font_size_pt=11,
                    t_margin=5 + 199 / 900, b_margin=0.4),
    "h4": TextStyle(color=SLATE, font_style="B", font_size_pt=9.8,
                    t_margin=5 + 72 / 900, b_margin=0.4),
    "h5": TextStyle(color=SLATE, font_style="B", font_size_pt=9.4,
                    t_margin=5 - 55 / 900, b_margin=0.4),
    "h6": TextStyle(color=SLATE, font_style="B", font_size_pt=9.2,
                    t_margin=5 - 182 / 900, b_margin=0.4),
    "li": TextStyle(l_margin=5, t_margin=2),
    "p": TextStyle(t_margin=0.6, b_margin=0.6),
    "pre": TextStyle(font_family="NM", font_size_pt=7.9, color=(30, 41, 59),
                     t_margin=4 + 7 / 30, l_margin=4),
    "ol": TextStyle(t_margin=2),
    "ul": TextStyle(t_margin=2),
}


def draw_toc(pdf: FPDF, entries: list) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font("NS", "B", 16)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.7)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.l_margin + 34, pdf.get_y() + 1)
    pdf.ln(6)
    for name, level, page in entries:
        if level > 1:
            continue
        top = level == 0
        if pdf.get_y() > pdf.h - 24:
            pdf.add_page()
        pdf.set_font("NS", "B" if top else "", 10.6 if top else 9.3)
        pdf.set_text_color(*(INK if top else SLATE))
        label = name if top else "        " + name
        if top:
            pdf.ln(2.2)
        pdf.cell(pdf.epw - 13, 5.4, label)
        pdf.cell(13, 5.4, str(page), align="R", new_x="LMARGIN", new_y="NEXT")


def render_toc(pdf: FPDF, outline) -> None:
    draw_toc(pdf, [(s.name, s.level, s.page_number) for s in outline])


def draw_cover(pdf: FPDF) -> None:
    pdf.add_page()
    pdf.set_fill_color(*AMBER)
    pdf.rect(0, 0, pdf.w, 26, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("NS", "B", 9)
    pdf.set_xy(pdf.l_margin, 9)
    pdf.cell(0, 6, "BRAND GROWTH PLAYBOOK  ·  INDIA / GUJARAT  ·  v1.0")
    pdf.set_text_color(*INK)

    pdf.set_xy(pdf.l_margin, 52)
    pdf.set_font("NS", "B", 40)
    pdf.cell(0, 16, "GLOWAMOUR")
    pdf.ln(18)
    pdf.set_font("NS", "", 15)
    pdf.set_text_color(*AMBER)
    pdf.multi_cell(0, 8, "Instagram Growth, Social SEO & Trust-Building Playbook",
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("NS", "", 10.5)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(
        0, 6,
        "Night cream + Kesar Goti Soap  ·  sold online across India, rooted in Ahmedabad, Gujarat  ·  "
        "Gujarati-speaking audience included",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.8)
    pdf.line(pdf.l_margin, pdf.get_y() + 4, pdf.l_margin + 46, pdf.get_y() + 4)
    pdf.ln(11)

    pdf.set_fill_color(*AMBER_SOFT)
    x0, y0 = pdf.l_margin, pdf.get_y()
    box_h = 46
    pdf.rect(x0, y0, pdf.epw, box_h, "F")
    pdf.set_xy(x0 + 6, y0 + 5)
    pdf.set_font("NS", "B", 9.5)
    pdf.set_text_color(*AMBER)
    pdf.cell(0, 5, "WHAT THIS PACK CONTAINS", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(x0 + 6, pdf.get_y() + 1.5)
    pdf.set_font("NS", "", 9.2)
    pdf.set_text_color(*SLATE)
    items = [
        "Profile build, username/display-name/bio options and every discoverability setting",
        "Instagram SEO + keyword strategy (English, Hinglish and Gujarati) with placement map",
        "Algorithm & organic-growth model based on 2026 confirmed platform guidance",
        "Grid, pinned posts, Highlights and a blank Trust Evidence Inventory (nothing invented)",
        "Audience segments, 30-day content calendar, 8 written captions, DM scripts",
        "Measurement system, phased implementation plan, master checklist, compliance rules",
    ]
    for it in items:
        pdf.set_x(x0 + 6)
        pdf.cell(4, 5, "·")
        pdf.cell(pdf.epw - 16, 5, it, new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(y0 + box_h + 8)

    pdf.set_font("NS", "", 9)
    meta = [
        ("Prepared", "Monday 19 October 2026"),
        ("Sources", "Instagram / Meta official guidance and 2026 trade press, checked 19 Oct 2026; "
                    "platform facts table in section 00"),
        ("Companion files", "content-calendar-30-days.csv and glowamour-weekly-tracker.csv "
                            "(summarised in Appendix A and B of this PDF)"),
        ("Ground rule", "No invented reviews, certifications, clinical results or guarantees. "
                        "Missing business facts are listed as open questions, not assumed."),
    ]
    for k, v in meta:
        pdf.set_font("NS", "B", 9)
        pdf.set_text_color(*INK)
        pdf.cell(28, 5.4, k)
        pdf.set_font("NS", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(pdf.epw - 30, 5.4, v, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1.2)

    pdf.set_y(pdf.h - 24)
    pdf.set_font("NS", "I", 8.4)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0, 4.6,
        "This PDF is a rendering of the Markdown sources in the glowamour/ folder. "
        "The .md and .csv files remain the editable source of truth.",
        new_x="LMARGIN", new_y="NEXT",
    )


def render_native_table(pdf: FPDF, rows: list[list[str]], font_size: float = 8.6) -> None:
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    if pdf.get_y() > pdf.h - 45:
        pdf.add_page()
    pdf.set_font("NS", "", font_size)
    pdf.set_draw_color(176, 172, 166)
    pdf.set_line_width(0.2)
    with pdf.table(
        col_widths=table_col_widths(rows),
        markdown=True,
        text_align="LEFT",
        wrapmode=WrapMode.WORD,
        headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255),
                                fill_color=AMBER, size_pt=font_size),
        cell_fill_color=ZEBRA,
        cell_fill_mode="ROWS",
        line_height=4.3,
        padding=1.3,
        repeat_headings=1,
    ) as table:
        for row in rows:
            tr = table.row()
            for cell in row:
                tr.cell(translate_cell(cell))
    pdf.ln(3.5)


def appendix_a_calendar(pdf: FPDF) -> None:
    rows = list(csv.reader(open(SRC / "content-calendar-30-days.csv", encoding="utf-8")))
    header, body = rows[0], rows[1:]
    pdf.add_page(orientation="L")
    pdf.set_font("NS", "B", 15)
    pdf.set_text_color(*INK)
    pdf.cell(0, 8, "Appendix A — 30-day content calendar (verbatim from content-calendar-30-days.csv)",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("NS", "", 8.6)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0, 5,
        "19 Oct – 17 Nov 2026, built on the real festival arc: Dhanteras Fri 6 Nov, Diwali Sun 8 Nov, "
        "Bestu Varas (Gujarati New Year) Tue 10 Nov, Bhai Bij Wed 11 Nov. Open this in a spreadsheet to "
        "filter and reorder; the grid below is the same data.",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(2)
    pdf.set_font("NS", "", 6.6)
    pdf.set_draw_color(176, 172, 166)
    pdf.set_line_width(0.2)
    with pdf.table(
        col_widths=table_col_widths(rows),
        text_align="LEFT",
        wrapmode=WrapMode.WORD,
        headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=AMBER, size_pt=6.8),
        cell_fill_color=ZEBRA,
        cell_fill_mode="ROWS",
        line_height=3.4,
        padding=0.9,
        repeat_headings=1,
    ) as table:
        for row in [header] + body:
            tr = table.row()
            for cell in row:
                tr.cell(cell)
    pdf.ln(4)


def appendix_b_tracker(pdf: FPDF) -> None:
    rows = list(csv.reader(open(SRC / "glowamour-weekly-tracker.csv", encoding="utf-8")))
    header, body = rows[0], rows[1:]
    pdf.add_page()
    pdf.set_font("NS", "B", 15)
    pdf.set_text_color(*INK)
    pdf.cell(0, 8, "Appendix B — weekly measurement tracker (glowamour-weekly-tracker.csv)",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("NS", "", 9.2)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(
        0, 5.4,
        "The tracker ships as a spreadsheet on purpose: 13 pre-dated weeks × 61 columns is a working "
        "grid, not a readable table. Only the week dates are prefilled; every metric cell is "
        "intentionally blank for you to fill from Professional dashboard → Insights. The column groups "
        "below are exactly the CSV's 61 headers, in CSV order.",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(3)

    groups = [
        ("Cadence", header[2:5], "Did I publish what I planned?"),
        ("Reach & account health", header[5:14], "Is discovery growing beyond followers?"),
        ("Top post 1 — deep dive", header[14:25], "Why did the best post work?"),
        ("Top posts 2 & 3", header[25:33], "Is the win repeatable?"),
        ("Derived ratios", header[33:39], "Sends / saves / likes per reach, watch-through, follow conversion"),
        ("Geography & audience", header[39:43], "Is Gujarat / Ahmedabad actually showing up?"),
        ("Commerce & service", header[43:53], "Inquiries, orders, COD mix, RTO, repeats"),
        ("Compliance & reflection", header[53:61], "Account Status, keywords won, what changes next week"),
    ]
    pdf.set_font("NS", "", 8.4)
    pdf.set_draw_color(176, 172, 166)
    pdf.set_line_width(0.2)
    with pdf.table(
        col_widths=[20, 52, 28],
        text_align="LEFT",
        wrapmode=WrapMode.WORD,
        headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=AMBER, size_pt=8.6),
        cell_fill_color=ZEBRA,
        cell_fill_mode="ROWS",
        line_height=4.4,
        padding=1.2,
    ) as table:
        tr = table.row()
        for h in ("Column group", "CSV columns, in order", "What it answers"):
            tr.cell(h)
        for name, cols, why in groups:
            tr = table.row()
            tr.cell(name)
            tr.cell(", ".join(cols))
            tr.cell(why)
    pdf.ln(5)

    pdf.set_font("NS", "B", 10.5)
    pdf.set_text_color(*AMBER)
    pdf.cell(0, 6, "Pre-dated weeks (rows 2–14 of the CSV)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("NS", "", 8.6)
    pdf.set_draw_color(176, 172, 166)
    pdf.set_line_width(0.2)
    with pdf.table(
        col_widths=[14, 43, 43],
        text_align="LEFT",
        wrapmode=WrapMode.WORD,
        headings_style=FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=AMBER, size_pt=8.6),
        cell_fill_color=ZEBRA,
        cell_fill_mode="ROWS",
        line_height=4.6,
        padding=1.2,
    ) as table:
        tr = table.row()
        for h in ("Week", "Starts", "Ends"):
            tr.cell(h)
        for i, row in enumerate(body, start=1):
            tr = table.row()
            tr.cell(f"Week {i}")
            tr.cell(row[0])
            tr.cell(row[1])
    pdf.ln(4)
    pdf.set_font("NS", "I", 8.4)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0, 5,
        "Weekly rhythm: 15 minutes every Monday, same order every time — cadence, reach, top post, "
        "ratios, geography, commerce, then write the three CHANGE columns before touching next week's "
        "content. Full instructions live in 07-measurement.md.",
        new_x="LMARGIN", new_y="NEXT",
    )


def main() -> None:
    pdf = Playbook(orientation="P", unit="mm", format="A4")
    pdf.set_margin(15)
    pdf.set_auto_page_break(True, margin=18)
    pdf.alias_nb_pages()
    register_fonts(pdf)
    pdf.set_font("NS", "", 9.6)
    pdf.set_text_color(*INK)

    draw_cover(pdf)

    # Dry-run the TOC on a throwaway document so the placeholder reserves exactly
    # the right number of pages (no blank leftovers, no overflow). The entry list is
    # derived from the same HTML that write_html will see, so counts match exactly.
    fab: list = []
    for f in FILES:
        for kind, payload in split_segments((SRC / f).read_text(encoding="utf-8")):
            if kind != "md":
                continue
            html = md_lib.markdown(sanitize(payload), extensions=MD_EXTENSIONS)
            for lvl, name in re.findall(r"<h([12])[^>]*>(.*?)</h\1>", html, re.S):
                clean = re.sub(r"<[^>]+>", "", name).strip()
                fab.append((clean, int(lvl) - 1, 0))
    dummy = Playbook(orientation="P", unit="mm", format="A4")
    dummy.set_margin(15)
    dummy.set_auto_page_break(True, margin=18)
    dummy.alias_nb_pages()
    register_fonts(dummy)
    dummy.add_page()  # stand-in for the cover, so the TOC starts on a headed page
    dummy.add_page()
    draw_toc(dummy, fab)
    toc_pages = dummy.pages_count - 1
    del dummy

    pdf.add_page()
    pdf.insert_toc_placeholder(render_toc, pages=toc_pages)

    first = True
    for f in FILES:
        print(f"rendering {f}")
        if not first:
            pdf.add_page()
        first = False
        for kind, payload in split_segments((SRC / f).read_text(encoding="utf-8")):
            if kind == "md":
                html = md_lib.markdown(sanitize(payload), extensions=MD_EXTENSIONS)
                pdf.write_html(
                    html,
                    tag_styles=TAG_STYLES,
                    table_line_separators=True,
                    font_family="NS",
                    li_prefix_color=AMBER,
                    ul_bullet_char="disc",
                )
            else:
                render_native_table(pdf, payload)

    appendix_a_calendar(pdf)
    appendix_b_tracker(pdf)

    pdf.output(str(OUT))
    size = OUT.stat().st_size
    print(f"\nwrote {OUT} ({size/1024:.0f} KB, {pdf.pages_count} pages, toc_pages={toc_pages})")


if __name__ == "__main__":
    main()
