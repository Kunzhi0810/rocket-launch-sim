"""
把 report.md 轉為 report.pdf
用 reportlab 直接構建，中文用系統字型
"""
import os
import re
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, Preformatted
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
MD_PATH = os.path.join(HERE, "report.md")
PDF_PATH = os.path.join(HERE, "report.pdf")


# 註冊中文字型（Windows 系統字型）
FONT_CANDIDATES = [
    ("MSJH", r"C:\Windows\Fonts\msjh.ttc"),      # 微軟正黑
    ("MSJH", r"C:\Windows\Fonts\msjhbd.ttc"),
    ("MingLiU", r"C:\Windows\Fonts\mingliu.ttc"),
    ("SimSun", r"C:\Windows\Fonts\simsun.ttc"),
]

FONT_NAME = "Helvetica"  # fallback
for name, path in FONT_CANDIDATES:
    if os.path.exists(path):
        try:
            pdfmetrics.registerFont(TTFont(name, path))
            FONT_NAME = name
            print(f"[PDF] Using font: {name} @ {path}")
            break
        except Exception as e:
            print(f"[PDF] Font {name} failed: {e}")

# 樣式
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ZH_Body", fontName=FONT_NAME, fontSize=10, leading=15,
    textColor=HexColor("#1a1a1a")
))
styles.add(ParagraphStyle(
    name="ZH_H1", fontName=FONT_NAME, fontSize=22, leading=28,
    spaceAfter=8, spaceBefore=12, textColor=HexColor("#0b1226")
))
styles.add(ParagraphStyle(
    name="ZH_H2", fontName=FONT_NAME, fontSize=15, leading=20,
    spaceAfter=6, spaceBefore=14, textColor=HexColor("#1a4a7a")
))
styles.add(ParagraphStyle(
    name="ZH_H3", fontName=FONT_NAME, fontSize=12, leading=17,
    spaceAfter=4, spaceBefore=10, textColor=HexColor("#2a6a99")
))
styles.add(ParagraphStyle(
    name="ZH_Code", fontName="Courier", fontSize=9, leading=12,
    backColor=HexColor("#f0f2f5"), borderPadding=6,
    leftIndent=8, rightIndent=8, spaceAfter=6, spaceBefore=6
))
styles.add(ParagraphStyle(
    name="ZH_Bullet", fontName=FONT_NAME, fontSize=10, leading=15,
    leftIndent=16, bulletIndent=6, spaceAfter=2
))
styles.add(ParagraphStyle(
    name="ZH_Meta", fontName=FONT_NAME, fontSize=9, leading=13,
    textColor=HexColor("#666")
))


def parse_md(md_text):
    """Simple MD → Story converter (only what we use in report.md)"""
    story = []
    lines = md_text.split("\n")
    i = 0
    in_code = False
    code_buf = []
    in_table = False
    table_rows = []

    def flush_code():
        nonlocal code_buf
        if code_buf:
            story.append(Preformatted("\n".join(code_buf), styles["ZH_Code"]))
            code_buf = []

    def flush_table():
        nonlocal table_rows
        if table_rows and len(table_rows) >= 2:
            # 建 reportlab Table
            data = []
            for row in table_rows:
                cells = [Paragraph(escape(c), styles["ZH_Body"]) for c in row]
                data.append(cells)
            t = Table(data, hAlign="LEFT")
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#e8eef5")),
                ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#c8d2e0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(Spacer(1, 4))
            story.append(t)
            story.append(Spacer(1, 8))
            table_rows = []

    def escape(text):
        # inline formatting: **bold** *italic* `code`
        text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
        text = re.sub(r"`([^`]+)`", r'<font face="Courier">\1</font>', text)
        return text

    while i < len(lines):
        line = lines[i]

        # code fence
        if line.startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                in_table and flush_table() or None
                if in_table: flush_table()
                in_table = False
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # table detection
        if line.strip().startswith("|") and line.strip().endswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            # skip separator row (all dashes)
            if all(re.match(r"^:?-+:?$", c.strip()) for c in cells if c.strip()):
                i += 1
                continue
            table_rows.append(cells)
            in_table = True
            i += 1
            continue
        else:
            if in_table:
                flush_table()
                in_table = False

        # headings
        if line.startswith("# "):
            story.append(Paragraph(escape(line[2:]), styles["ZH_H1"]))
        elif line.startswith("## "):
            story.append(Paragraph(escape(line[3:]), styles["ZH_H2"]))
        elif line.startswith("### "):
            story.append(Paragraph(escape(line[4:]), styles["ZH_H3"]))
        elif line.startswith("---"):
            story.append(Spacer(1, 6))
        elif re.match(r"^\s*[-*]\s+", line):
            content = re.sub(r"^\s*[-*]\s+", "", line)
            story.append(Paragraph("• " + escape(content), styles["ZH_Bullet"]))
        elif re.match(r"^\s*\d+\.\s+", line):
            content = re.sub(r"^\s*\d+\.\s+", "", line)
            story.append(Paragraph(escape(content), styles["ZH_Bullet"]))
        elif line.strip().startswith("**") and line.strip().endswith("**"):
            story.append(Paragraph(escape(line.strip()), styles["ZH_H3"]))
        elif line.strip().startswith(">"):
            story.append(Paragraph("<i>" + escape(line.strip()[1:].strip()) + "</i>",
                                    styles["ZH_Meta"]))
        elif line.strip() == "":
            story.append(Spacer(1, 4))
        else:
            story.append(Paragraph(escape(line), styles["ZH_Body"]))

        i += 1

    flush_code()
    flush_table()
    return story


def main():
    with open(MD_PATH, "r", encoding="utf-8") as f:
        md = f.read()

    story = parse_md(md)

    doc = SimpleDocTemplate(
        PDF_PATH, pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=18*mm, bottomMargin=18*mm,
        title="火箭起飛模擬器 · 技術報告",
        author="Ken + Claude",
    )
    doc.build(story)
    print(f"[PDF] Written to {PDF_PATH}")
    print(f"[PDF] Size: {os.path.getsize(PDF_PATH)/1024:.1f} KB")


if __name__ == "__main__":
    main()
