# -*- coding: utf-8 -*-
"""
Generates a professional Evaluator / Judge Guide PDF for SKH 2026 (Round 2).
Self-contained: criteria are taken from SKH_2026_Round_2_Evaluation_Criteria.xlsx,
dashboard navigation + workflow reflect the live judge frontend.
"""
import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm

# --- Core platypus imports -------------------------------------------------
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    NextPageTemplate, PageBreak, Flowable, KeepTogether, ListFlowable, ListItem,
)
from reportlab.pdfgen import canvas as canvas_mod

ROOT = r"f:\skh-main\skh-main"
OUT = os.path.join(ROOT, "SKH_2026_Round_2_Evaluator_Guide.pdf")
XLSX = os.path.join(ROOT, "SKH_2026_Round_2_Evaluation_Criteria.xlsx")

# ---------------------------------------------------------------------------
# Brand palette
# ---------------------------------------------------------------------------
NAVY      = colors.HexColor("#0B1F3A")   # deep navy
INDIGO    = colors.HexColor("#3730A3")   # primary brand
INDIGO_LT = colors.HexColor("#4F46E5")
ACCENT    = colors.HexColor("#F59E0B")   # amber accent
INK       = colors.HexColor("#1E293B")
INK_SOFT  = colors.HexColor("#475569")
MUTED     = colors.HexColor("#64748B")
LINE      = colors.HexColor("#E2E8F0")
BG_SOFT   = colors.HexColor("#F1F5F9")
BG_INDIGO = colors.HexColor("#EEF2FF")
WHITE     = colors.white
GREEN     = colors.HexColor("#059669")
RED       = colors.HexColor("#DC2626")

PAGE_W, PAGE_H = A4
LM = RM = 18 * mm
TM = 20 * mm
BM = 18 * mm


# ---------------------------------------------------------------------------
# Load criteria from Excel
# ---------------------------------------------------------------------------
def load_criteria():
    import openpyxl
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb.worksheets[0]
    rows = [r for r in ws.iter_rows(values_only=True)]
    crit = []
    total = None
    for r in rows:
        if not r or r[0] is None:
            continue
        name = str(r[0]).strip()
        if name.lower().startswith("skh") or name.lower() == "criterion":
            continue
        marks = r[1] if len(r) > 1 else None
        desc = r[2] if len(r) > 2 else None
        if name.upper() == "TOTAL":
            total = marks
            continue
        if marks is None:
            continue
        crit.append((name, int(marks), str(desc or "").strip()))
    if total is None:
        total = sum(c[1] for c in crit)
    return crit, int(total)


CRITERIA, TOTAL = load_criteria()

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
ss = getSampleStyleSheet()

def style(name, **kw):
    base = kw.pop("parent", ss["Normal"])
    return ParagraphStyle(name, parent=base, **kw)

H1 = style("H1", fontName="Helvetica-Bold", fontSize=19, textColor=NAVY, spaceAfter=4, leading=23)
H2 = style("H2", fontName="Helvetica-Bold", fontSize=13.5, textColor=INDIGO, spaceBefore=14, spaceAfter=6, leading=17)
H3 = style("H3", fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceBefore=8, spaceAfter=3, leading=14)
BODY = style("BODY", fontName="Helvetica", fontSize=9.7, textColor=INK, leading=14.5, alignment=TA_JUSTIFY, spaceAfter=6)
BODY_L = style("BODY_L", parent=BODY, alignment=TA_LEFT)
SMALL = style("SMALL", fontName="Helvetica", fontSize=8.3, textColor=MUTED, leading=11.5)
KICK = style("KICK", fontName="Helvetica-Bold", fontSize=8.5, textColor=ACCENT, leading=11)
LEAD = style("LEAD", fontName="Helvetica", fontSize=11, textColor=INK_SOFT, leading=16, spaceAfter=6)

# table cell styles
TH = style("TH", fontName="Helvetica-Bold", fontSize=9.2, textColor=WHITE, leading=12)
TD = style("TD", fontName="Helvetica", fontSize=9.0, textColor=INK, leading=12.5)
TD_B = style("TD_B", parent=TD, fontName="Helvetica-Bold")
TD_C = style("TD_C", parent=TD, alignment=TA_CENTER)
TD_BC = style("TD_BC", parent=TD_B, alignment=TA_CENTER, textColor=INDIGO)
CELL_WHITE = style("CELL_WHITE", parent=TD, textColor=WHITE)


# ---------------------------------------------------------------------------
# Custom flowables
# ---------------------------------------------------------------------------
class HRule(Flowable):
    def __init__(self, width, color=LINE, thickness=1, dash=None):
        super().__init__()
        self.width = width; self.color = color; self.thickness = thickness; self.dash = dash
    def wrap(self, aw, ah):
        return self.width, self.thickness
    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color); c.setLineWidth(self.thickness)
        if self.dash: c.setDash(self.dash)
        c.line(0, 0, self.width, 0)


class Badge(Flowable):
    """A small rounded pill with a number, used for step markers."""
    def __init__(self, text, diameter=16, fill=INDIGO, fg=WHITE, fs=9):
        super().__init__()
        self.text = str(text); self.d = diameter; self.fill = fill; self.fg = fg; self.fs = fs
    def wrap(self, aw, ah):
        return self.d, self.d
    def draw(self):
        c = self.canv
        c.setFillColor(self.fill)
        c.circle(self.d/2, self.d/2, self.d/2, stroke=0, fill=1)
        c.setFillColor(self.fg); c.setFont("Helvetica-Bold", self.fs)
        c.drawCentredString(self.d/2, self.d/2 - self.fs/2 + 1, self.text)


class Flowchart(Flowable):
    """
    A clean vertical flowchart with rounded process boxes, one decision diamond,
    and connecting arrows. Fits the page content width.
    """
    def __init__(self, width, steps, decision=None):
        super().__init__()
        self.width = width
        self.steps = steps            # list of (title, subtitle)
        self.decision = decision      # (question, yes_label, no_label) or None
        self.box_h = 15 * mm
        self.gap = 8 * mm
        self.dia_h = 22 * mm
        n = len(steps)
        self._h = n * self.box_h + (n - 1) * self.gap
        if decision:
            self._h += self.gap + self.dia_h
        self.pad = 2 * mm
        self._h += self.pad * 2

    def wrap(self, aw, ah):
        return self.width, self._h

    def _rounded(self, c, x, y, w, h, r, fill, stroke=None, sw=1):
        c.setFillColor(fill)
        if stroke:
            c.setStrokeColor(stroke); c.setLineWidth(sw)
        c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1)

    def _arrow(self, c, x, y_top, y_bot):
        c.setStrokeColor(INDIGO_LT); c.setLineWidth(1.6)
        c.line(x, y_top, x, y_bot + 2.2*mm)
        c.setFillColor(INDIGO_LT)
        c.saveState()
        # arrow head
        ah = 2.2 * mm
        c.setLineWidth(0)
        p = c.beginPath()
        p.moveTo(x - ah, y_bot + ah)
        p.lineTo(x + ah, y_bot + ah)
        p.lineTo(x, y_bot)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        c.restoreState()

    def draw(self):
        c = self.canv
        w = self.width
        cx = w / 2.0
        box_w = min(120 * mm, w * 0.82)
        x0 = cx - box_w / 2.0
        y = self._h - self.pad

        palette = [INDIGO, INDIGO_LT]
        for i, (title, sub) in enumerate(self.steps):
            top = y
            bot = y - self.box_h
            fill = BG_INDIGO
            self._rounded(c, x0, bot, box_w, self.box_h, 3*mm, fill, stroke=INDIGO_LT, sw=1)
            # number chip
            c.setFillColor(INDIGO)
            c.circle(x0 + 8*mm, bot + self.box_h/2, 4.4*mm, stroke=0, fill=1)
            c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(x0 + 8*mm, bot + self.box_h/2 - 3, str(i+1))
            # text
            c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 9.6)
            c.drawString(x0 + 16*mm, bot + self.box_h/2 + 1.2*mm, title)
            c.setFillColor(INK_SOFT); c.setFont("Helvetica", 7.8)
            c.drawString(x0 + 16*mm, bot + self.box_h/2 - 3.4*mm, sub)
            y = bot
            # arrow to next
            last = (i == len(self.steps) - 1)
            if not last or self.decision:
                self._arrow(c, cx, y, y - self.gap)
                y -= self.gap

        if self.decision:
            q = self.decision[0]
            yes_l = self.decision[1] if len(self.decision) > 1 else ""
            dh = self.dia_h
            dw = box_w * 0.9
            top = y
            midy = y - dh/2
            c.setFillColor(colors.HexColor("#FEF3C7"))
            c.setStrokeColor(ACCENT); c.setLineWidth(1.2)
            p = c.beginPath()
            p.moveTo(cx, y)               # top
            p.lineTo(cx + dw/2, midy)     # right
            p.lineTo(cx, y - dh)          # bottom
            p.lineTo(cx - dw/2, midy)     # left
            p.close()
            c.drawPath(p, fill=1, stroke=1)
            c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 8.6)
            c.drawCentredString(cx, midy + 1.5, q)
            c.setFillColor(MUTED); c.setFont("Helvetica-Oblique", 7.2)
            c.drawCentredString(cx, midy - 6.5, yes_l)


class InfoBox(Flowable):
    """Colored callout box with a title and bullet lines."""
    def __init__(self, width, title, lines, accent=INDIGO, bg=BG_INDIGO, icon="i"):
        super().__init__()
        self.width = width; self.title = title; self.lines = lines
        self.accent = accent; self.bg = bg; self.icon = icon
        self._para = [Paragraph(l, style("cbx", fontName="Helvetica", fontSize=8.8,
                                          textColor=INK, leading=13)) for l in lines]
        self._title_p = Paragraph(title, style("cbt", fontName="Helvetica-Bold",
                                               fontSize=9.6, textColor=accent, leading=13))
        self._h = None

    def wrap(self, aw, ah):
        self.width = aw
        inner = self.width - 12*mm
        h = 6*mm  # top pad + title
        tw, th = self._title_p.wrap(inner, 1000); h += th + 3*mm
        for p in self._para:
            pw, ph = p.wrap(inner, 1000); h += ph + 1.6*mm
        h += 4*mm
        self._h = h
        return self.width, h

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.roundRect(0, 0, self.width, self._h, 2.5*mm, stroke=0, fill=1)
        c.setFillColor(self.accent)
        c.roundRect(0, 0, 1.6*mm, self._h, 0, stroke=0, fill=1)
        y = self._h - 5*mm
        inner = self.width - 12*mm
        tw, th = self._title_p.wrap(inner, 1000)
        self._title_p.drawOn(c, 6*mm, y - th + 3*mm)
        y -= th + 3*mm
        for p in self._para:
            pw, ph = p.wrap(inner, 1000)
            p.drawOn(c, 6*mm, y - ph + 2*mm)
            y -= ph + 1.6*mm


# ---------------------------------------------------------------------------
# Page decoration (canvas callbacks)
# ---------------------------------------------------------------------------
def cover_page(c, doc):
    c.saveState()
    # full navy background
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # indigo band
    c.setFillColor(INDIGO)
    c.rect(0, PAGE_H*0.52, PAGE_W, PAGE_H*0.20, stroke=0, fill=1)
    # accent thin line
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_H*0.52 - 3, PAGE_W, 3, stroke=0, fill=1)
    # decorative circles
    c.setStrokeColor(colors.HexColor("#1E3A5F"))
    c.setLineWidth(1)
    for rr in (30, 55, 80):
        c.circle(PAGE_W - 18*mm, PAGE_H - 26*mm, rr, stroke=1, fill=0)
    c.restoreState()


def content_page(c, doc):
    c.saveState()
    # header rule
    c.setStrokeColor(LINE); c.setLineWidth(1)
    c.line(LM, PAGE_H - TM + 8*mm, PAGE_W - RM, PAGE_H - TM + 8*mm)
    c.setFont("Helvetica-Bold", 8); c.setFillColor(INDIGO)
    c.drawString(LM, PAGE_H - TM + 10.5*mm, "SMART KOP HACKATHON 2026")
    c.setFont("Helvetica", 8); c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - RM, PAGE_H - TM + 10.5*mm, "Round 2  |  Evaluator Guide")
    # footer
    c.setStrokeColor(LINE); c.setLineWidth(1)
    c.line(LM, BM - 4*mm, PAGE_W - RM, BM - 4*mm)
    c.setFont("Helvetica", 7.6); c.setFillColor(MUTED)
    c.drawString(LM, BM - 8*mm, "Confidential - for authorised jury members only")
    c.drawRightString(PAGE_W - RM, BM - 8*mm, "Page %d" % (doc.page - 1))
    c.restoreState()


# ---------------------------------------------------------------------------
# Build document
# ---------------------------------------------------------------------------
def build():
    doc = BaseDocTemplate(
        OUT, pagesize=A4,
        leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
        title="SKH 2026 Round 2 - Evaluator Guide", author="Smart KOP Hackathon Organizing Committee",
    )
    content_w = doc.width

    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="cover", leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0)
    content_frame = Frame(LM, BM, doc.width, doc.height, id="content",
                          leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="Content", frames=[content_frame], onPage=content_page),
    ])

    E = []  # story

    # ---------------- COVER ----------------
    E.append(NextPageTemplate("Content"))
    E.append(Spacer(1, PAGE_H*0.14))
    cover_kick = style("ck", fontName="Helvetica-Bold", fontSize=11, textColor=ACCENT,
                       alignment=TA_CENTER, leading=14)
    cover_title = style("ct", fontName="Helvetica-Bold", fontSize=34, textColor=WHITE,
                        alignment=TA_CENTER, leading=38)
    cover_sub = style("cs", fontName="Helvetica", fontSize=13, textColor=colors.HexColor("#C7D2FE"),
                      alignment=TA_CENTER, leading=18)
    cover_meta = style("cm", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#94A3B8"),
                       alignment=TA_CENTER, leading=15)
    E.append(Paragraph("SMART KOP HACKATHON 2026", cover_kick))
    E.append(Spacer(1, 6*mm))
    E.append(Paragraph("Evaluator&nbsp;&amp;&nbsp;Judge Guide", cover_title))
    E.append(Spacer(1, 4*mm))
    E.append(Paragraph("Round 2 &mdash; Prototype Evaluation", cover_sub))
    E.append(Spacer(1, 40*mm))
    E.append(Paragraph("Scoring rubric &bull; Dashboard navigation &bull; Step-by-step evaluation process",
                       cover_meta))
    E.append(Spacer(1, 4*mm))
    E.append(Paragraph("Prepared for the Jury Panel by the Organizing Committee", cover_meta))
    E.append(PageBreak())

    # ---------------- 1. WELCOME ----------------
    E.append(Paragraph("Welcome, Evaluator", H1))
    E.append(HRule(content_w, INDIGO, 2))
    E.append(Spacer(1, 5*mm))
    E.append(Paragraph(
        "Thank you for serving on the jury panel for the Smart KOP Hackathon 2026. Your assessment "
        "directly determines which teams advance from Round 2. This guide explains <b>what you will "
        "score</b>, <b>how to navigate your evaluation dashboard</b>, and <b>the exact steps</b> to "
        "submit a fair, consistent evaluation.", LEAD))

    E.append(Paragraph("At a glance", H3))
    glance = [
        ["7", "scoring criteria", str(TOTAL), "total marks"],
        ["3", "outcome statuses", "1", "final submission (locks your sheet)"],
    ]
    gt = Table(
        [[Paragraph(f"<font size=17 color='#3730A3'><b>{a}</b></font><br/><font size=8 color='#64748B'>{b}</font>", BODY_L),
          Paragraph(f"<font size=17 color='#3730A3'><b>{c}</b></font><br/><font size=8 color='#64748B'>{d}</font>", BODY_L)]
         for a, b, c, d in glance],
        colWidths=[content_w*0.5, content_w*0.5])
    gt.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, LINE),
    ]))
    E.append(gt)
    E.append(Spacer(1, 3*mm))
    E.append(InfoBox(content_w,
        "Before you begin",
        ["Evaluate only the teams shown in your queue &mdash; access is scoped to your assigned problem statements.",
         "Open every submitted artifact (deck, PDF, video, repository) before scoring.",
         "Your draft saves automatically; the <b>Submit Final</b> action locks your sheet from further edits."],
        accent=INDIGO, bg=BG_INDIGO))

    # ---------------- 2. CRITERIA ----------------
    E.append(Paragraph("Round 2 Evaluation Criteria", H2))
    E.append(Paragraph(
        f"Each submission is scored out of <b>{TOTAL} marks</b> across the seven criteria below. "
        "Score each criterion on its own merits using the descriptions as your anchor.", BODY))

    header = [Paragraph("#", TH), Paragraph("Criterion", TH), Paragraph("Marks", TH), Paragraph("What to look for", TH)]
    data = [header]
    for i, (name, marks, desc) in enumerate(CRITERIA, 1):
        data.append([
            Paragraph(str(i), TD_C),
            Paragraph(f"<b>{name}</b>", TD),
            Paragraph(str(marks), TD_BC),
            Paragraph(desc, TD),
        ])
    data.append([
        Paragraph("", TD_C),
        Paragraph("TOTAL", style("tt", parent=TD_B, textColor=WHITE)),
        Paragraph(str(TOTAL), style("ttc", parent=TD_BC, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph("Sum of all criteria", style("tt2", parent=TD, textColor=WHITE)),
    ])

    col_w = [10*mm, 46*mm, 16*mm, content_w - (10+46+16)*mm]
    ct = Table(data, colWidths=col_w, repeatRows=1)
    ts = [
        ("BACKGROUND", (0,0), (-1,0), INDIGO),
        ("BACKGROUND", (0,-1), (-1,-1), NAVY),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 6.5), ("BOTTOMPADDING", (0,0), (-1,-1), 6.5),
        ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, LINE),
        ("BOX", (0,0), (-1,-1), 0.8, LINE),
        ("ROWBACKGROUNDS", (0,1), (-1,-2), [WHITE, BG_SOFT]),
    ]
    ct.setStyle(TableStyle(ts))
    E.append(ct)
    E.append(Spacer(1, 3*mm))
    E.append(Paragraph(
        "<b>Tip:</b> Technical Feasibility &amp; Prototype carries the highest weight (20). Give the "
        "working prototype and its progress proportionate attention.", SMALL))

    # score band guidance (kept on its own page with navigation)
    E.append(PageBreak())
    bands_heading = Paragraph("Scoring bands (guidance)", H3)
    band_rows = [
        [Paragraph("Band", TH), Paragraph("Range", TH), Paragraph("Interpretation", TH)],
        [Paragraph("Excellent", TD_B), Paragraph("85 - 100%", TD_C), Paragraph("Exceptional; clearly exceeds expectations and stands out.", TD)],
        [Paragraph("Strong", TD_B), Paragraph("70 - 84%", TD_C), Paragraph("Solid, well-executed work with minor gaps.", TD)],
        [Paragraph("Adequate", TD_B), Paragraph("50 - 69%", TD_C), Paragraph("Meets the basics; noticeable room for improvement.", TD)],
        [Paragraph("Weak", TD_B), Paragraph("Below 50%", TD_C), Paragraph("Significant gaps in this criterion.", TD)],
    ]
    bt = Table(band_rows, colWidths=[28*mm, 26*mm, content_w - 54*mm], repeatRows=1)
    bt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), INDIGO_LT),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 5.5), ("BOTTOMPADDING", (0,0), (-1,-1), 5.5),
        ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("BOX", (0,0), (-1,-1), 0.8, LINE),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, LINE),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BG_SOFT]),
    ]))
    E.append(KeepTogether([bands_heading, Spacer(1, 2*mm), bt]))
    E.append(Spacer(1, 6*mm))

    # ---------------- 3. DASHBOARD NAVIGATION ----------------
    E.append(Paragraph("Navigating Your Judge Dashboard", H2))
    E.append(Paragraph(
        "After signing in you land on the <b>Jury Home</b>. The left sidebar is your primary "
        "navigation. It is organised into three groups:", BODY))

    nav = [
        [Paragraph("Menu item", TH), Paragraph("Where it goes", TH), Paragraph("What you do there", TH)],
        # group label row handled via styling
        [Paragraph("<b>Home</b>", TD), Paragraph("/judge/home", style("m", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Snapshot of assigned problem statements and your counts: Pending, In progress, Submitted, Locked. Shows deadlines and recent activity.", TD)],
        [Paragraph("<b>Assignments</b>", TD), Paragraph("/judge/assignments", style("m2", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Your problem statements with the teams grouped under each. Filter by a specific problem statement.", TD)],
        [Paragraph("<b>Evaluate Teams</b>", TD), Paragraph("/judge/evaluate", style("m3", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Your evaluation queue. Filter by status (All / Pending / In progress / Submitted / Locked) and open a team's review.", TD)],
        [Paragraph("<b>Progress</b>", TD), Paragraph("/judge/progress", style("m4", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Track how many of your assigned evaluations are complete versus outstanding.", TD)],
        [Paragraph("<b>Announcements</b>", TD), Paragraph("/judge/announcements", style("m5", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Official notices from the organizing committee for the jury.", TD)],
        [Paragraph("<b>Notifications</b>", TD), Paragraph("/judge/notifications", style("m6", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Personal alerts, e.g. when an organizer reopens a sheet for you.", TD)],
        [Paragraph("<b>Account</b>", TD), Paragraph("/judge/account", style("m7", parent=TD, fontName="Courier", textColor=INDIGO)),
         Paragraph("Manage your profile and password.", TD)],
    ]
    nt = Table(nav, colWidths=[32*mm, 40*mm, content_w - 72*mm], repeatRows=1)
    nt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), INDIGO),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("BOX", (0,0), (-1,-1), 0.8, LINE),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, LINE),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BG_SOFT]),
    ]))
    E.append(nt)
    E.append(Spacer(1, 3*mm))
    E.append(InfoBox(content_w,
        "Security note",
        ["Your queue only lists teams within your scope. Editing a URL to open a team outside your "
         "assignment returns <b>Access denied</b> &mdash; always open teams from your dashboard."],
        accent=ACCENT, bg=colors.HexColor("#FEF3C7")))

    # ---------------- 4. THE TEAM REVIEW SCREEN ----------------
    E.append(PageBreak())
    E.append(Paragraph("Inside the Team Review Screen", H2))
    E.append(Paragraph(
        "Opening a team from the queue (<font face='Courier' color='#3730A3'>/judge/evaluate/&lt;team&gt;</font>) "
        "shows everything you need in one place:", BODY))
    review_items = [
        "<b>Problem statement</b> &mdash; title, organization, department, category, theme and full description.",
        "<b>Submission</b> &mdash; quick links and embedded previews for the Deck, PDF, Demo/Video and Repository.",
        "<b>Submission timeline</b> &mdash; status, whether the team locked it, last updated and finalized times.",
        "<b>Rubric &amp; remarks</b> (right panel) &mdash; a slider for each criterion, a remarks box, the team-status "
        "buttons, and the Save / Submit actions.",
    ]
    E.append(ListFlowable(
        [ListItem(Paragraph(t, BODY_L), leftIndent=6, value="\u2022") for t in review_items],
        bulletType="bullet", start="\u2022", leftIndent=12, bulletColor=INDIGO))
    E.append(Spacer(1, 6*mm))

    # ---------------- 5. HOW TO EVALUATE (STEPS + FLOWCHART) ----------------
    E.append(Paragraph("How to Evaluate: Step by Step", H2))

    steps = [
        ("Open your queue", "Sidebar &rarr; <b>Evaluate Teams</b>. Pick a team with status <i>Pending</i> or <i>In progress</i>."),
        ("Study the submission", "Open the deck, PDF, video and repository. Read the problem statement in full."),
        ("Score every criterion", "Move each slider (0 to its maximum). All seven criteria must reflect your honest judgement."),
        ("Write remarks", "Add concise, constructive remarks for the organizers and finalists."),
        ("Set the team status", "Choose <b>Qualified</b>, <b>Waitlist</b> or <b>Not Qualified</b>. This is required to submit."),
        ("Submit final", "Click <b>Submit Final</b>. Your sheet locks; drafts saved along the way are replaced by the final."),
    ]
    for i, (t, d) in enumerate(steps, 1):
        row = Table(
            [[Badge(i, 15), Paragraph(f"<b>{t}</b><br/><font size=8.6 color='#475569'>{d}</font>",
                                      style("st", parent=BODY_L, spaceAfter=0))]],
            colWidths=[10*mm, content_w - 10*mm])
        row.setStyle(TableStyle([
            ("VALIGN", (0,0), (0,0), "TOP"), ("VALIGN", (1,0), (1,0), "MIDDLE"),
            ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("LEFTPADDING", (0,0), (0,0), 0),
        ]))
        E.append(row)
    E.append(Spacer(1, 2*mm))
    E.append(InfoBox(content_w, "Remember",
        ["Drafts autosave as you work, so you can pause and return.",
         "You cannot edit after submitting &mdash; if you need to, ask an organizer to reopen your sheet.",
         "If the phase is closed, the screen is read-only and scores cannot be saved."],
        accent=GREEN, bg=colors.HexColor("#ECFDF5")))

    # Flowchart (own page)
    E.append(PageBreak())
    fc_steps = [
        ("Sign in to Jury Dashboard", "Land on Jury Home"),
        ("Open Assignments / Evaluate Teams", "See only your scoped teams"),
        ("Open a team's Review page", "Problem statement + submission"),
        ("Review all artifacts", "Deck, PDF, video, repository"),
        ("Score 7 criteria + remarks", "Drafts autosave"),
        ("Set team status", "Qualified / Waitlist / Not Qualified"),
        ("Submit Final", "Sheet locks from edits"),
    ]
    flow_block = [
        Paragraph("Evaluation Process Flow", H2),
        Paragraph("The end-to-end path from sign-in to a locked, submitted evaluation:", BODY),
        Spacer(1, 2*mm),
        Flowchart(content_w, fc_steps,
                  decision=("Need to change a submitted sheet?", "Yes -> organizer reopens it for you")),
        Spacer(1, 4*mm),
        HRule(content_w, LINE, 1),
        Spacer(1, 2*mm),
        Paragraph(
            "Questions during evaluation? Contact the Organizing Committee through the channel provided in your "
            "jury onboarding email. Thank you for helping us run a fair and rigorous Round 2.", SMALL),
    ]
    E.append(KeepTogether(flow_block))

    doc.build(E)
    return OUT


if __name__ == "__main__":
    path = build()
    print("PDF written to:", path)
    print("Size (bytes):", os.path.getsize(path))
