"""The CV as a PDF file employers (and the student) download. Built from the same data as the web CV.

Uses the DejaVu font installed in the image (Cyrillic names and o'/g' letters print correctly); without it
the text falls back to a built-in font with unsupported characters replaced.
"""
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fpdf import FPDF

from .catalog import industry_label

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
GREEN = (22, 120, 60)
GREY = (100, 110, 105)
TEXT = (25, 30, 28)
JOB_TYPE = {"internship": "Amaliyot", "part_time": "Yarim stavka", "junior": "Junior", "project": "Loyiha"}


class _Doc(FPDF):
    def __init__(self) -> None:
        super().__init__(format="A4")
        self.set_margins(18, 16, 18)
        self.set_auto_page_break(True, margin=16)
        regular, bold = FONT_DIR / "DejaVuSans.ttf", FONT_DIR / "DejaVuSans-Bold.ttf"
        self.has_unicode = regular.is_file() and bold.is_file()
        if self.has_unicode:
            self.add_font("Body", "", str(regular))
            self.add_font("Body", "B", str(bold))
            self.body_font = "Body"
        else:
            self.body_font = "Helvetica"

    def clean(self, text: str) -> str:
        if self.has_unicode:
            return text
        text = text.replace("‘", "'").replace("’", "'").replace("ʻ", "'").replace("ʼ", "'")
        text = text.replace("–", "-").replace("—", "-").replace("·", "-")
        return text.encode("latin-1", "replace").decode("latin-1")

    def font(self, size: float, bold: bool = False, color=TEXT) -> None:
        self.set_font(self.body_font, "B" if bold else "", size)
        self.set_text_color(*color)

    def para(self, text: str, size: float = 10, bold: bool = False, color=TEXT, gap: float = 1.5) -> None:
        if not text:
            return
        self.font(size, bold, color)
        self.multi_cell(0, size * 0.5, self.clean(text), new_x="LMARGIN", new_y="NEXT")
        self.ln(gap)

    def section(self, title: str) -> None:
        self.ln(2)
        self.font(11.5, True, GREEN)
        self.cell(0, 7, self.clean(title.upper()), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*GREEN)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(2.5)


def _course(c: int | None) -> str:
    return "" if not c else ("magistratura" if c == 7 else f"{c}-kurs")


def render(cv: dict, extra: dict) -> bytes:
    """cv: build_cv() output. extra: fields the web CV leaves out (city, GPA, industries, job types...)."""
    doc = _Doc()
    doc.add_page()
    doc.para(cv["full_name"], 20, True, gap=0.5)
    if cv.get("headline"):
        doc.para(cv["headline"], 11.5, False, GREEN, gap=0.5)
    contacts = [f"Telegram: @{cv['username']}" if cv.get("username") else "", extra.get("city", ""),
                cv.get("github_url", ""), cv.get("linkedin_url", "")]
    doc.para("   ".join(c for c in contacts if c), 9.5, color=GREY, gap=1)
    if cv.get("verification") == "verified":
        doc.para(f"Talabaligi tasdiqlangan: {cv.get('verified_by') or 'TalantGo'}", 9.5, True, GREEN)

    doc.section("Ta'lim")
    study = ", ".join(x for x in [cv.get("faculty"), _course(cv.get("course")),
                                  f"guruh {cv['group_name']}" if cv.get("group_name") else ""] if x)
    doc.para(cv.get("university") or "Universitet ko'rsatilmagan", 10.5, True, gap=0.5)
    doc.para(study, 10)
    more = []
    if cv.get("graduation_year"):
        more.append(f"Bitirish yili: {cv['graduation_year']}")
    if extra.get("gpa") is not None:
        more.append(f"O'rtacha baho (GPA): {extra['gpa']}/{extra.get('gpa_scale', 5)}")
    doc.para("   ".join(more), 10)

    stats = cv.get("stats", {})
    doc.section("TalantGo natijalari")
    lines = [f"Yo'nalish: {cv['track']}" if cv.get("track") else "",
             f"Ball: {stats.get('points', 0)}   Umumiy reyting: {stats.get('rank_overall', '-')}-o'rin"
             + (f"   Yo'nalishda: {stats['rank_in_track']}-o'rin" if stats.get("rank_in_track") else ""),
             f"Tasdiqlangan ishlar: {stats.get('verified_tasks', 0)} (mentor tasdiqlagan: {stats.get('mentor_verified', 0)})"]
    for line in lines:
        doc.para(line, 10, gap=0.8)

    if cv.get("skills") or cv.get("languages") or extra.get("work_industries") or extra.get("job_types"):
        doc.section("Ko'nikmalar va qiziqishlar")
        if cv.get("skills"):
            doc.para("Ko'nikmalar: " + ", ".join(cv["skills"]), 10, gap=0.8)
        if cv.get("languages"):
            doc.para("Tillar: " + ", ".join(cv["languages"]), 10, gap=0.8)
        if extra.get("work_industries"):
            doc.para("Ishlamoqchi bo'lgan sohalar: " + ", ".join(industry_label(i) for i in extra["work_industries"]), 10, gap=0.8)
        if extra.get("job_types"):
            doc.para("Qidirayotgan ish: " + ", ".join(JOB_TYPE.get(j, j) for j in extra["job_types"]), 10, gap=0.8)

    if cv.get("bio"):
        doc.section("O'zi haqida")
        doc.para(cv["bio"], 10)

    if cv.get("achievements"):
        doc.section("Tasdiqlangan ishlar")
        for a in cv["achievements"]:
            doc.para(f"{a['task']}", 10.5, True, gap=0.3)
            who = ", ".join(v["name"] for v in a.get("verified_by", []))
            doc.para(f"{a['track'].split(':')[0]} · {a['level_label']}" + (f" ({who})" if who else "")
                     + f" · {a['points']} ball", 9, color=GREY, gap=0.3)
            if a.get("mentor_comment"):
                doc.para(f"Mentor izohi: {a['mentor_comment']}", 9, color=GREY, gap=0.3)
            if a.get("proof_url"):
                doc.para(a["proof_url"], 8.5, color=GREEN, gap=1.5)

    if cv.get("challenges"):
        doc.section("Chellenjlar")
        for c in cv["challenges"]:
            place = f"{c['place']}-o'rin" if c.get("place") else "ishtirok"
            doc.para(f"{c['title']}: {place}" + (f", {c['score']} ball" if c.get("score") is not None else ""), 10)

    doc.ln(4)
    now = datetime.now(ZoneInfo("Asia/Tashkent")).strftime("%d.%m.%Y")
    doc.para(f"TalantGo tomonidan {now} da yaratildi. Barcha ishlar tengdoshlar yoki mentor tomonidan tasdiqlangan.",
             8, color=GREY)
    return bytes(doc.output())


def filename(full_name: str) -> str:
    safe = "".join(ch if ch.isalnum() else "-" for ch in full_name).strip("-")
    return f"CV-{safe or 'talaba'}.pdf"
