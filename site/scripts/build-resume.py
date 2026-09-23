"""Build and validate the one-page website resume.

Run with the bundled Python runtime. The copy in backups/ is the preserved
pre-redesign baseline; the approved career wording and dates below remain exact.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/assets/documents/J-Wayne-Graves-Jr-Resume.pdf"
EVIDENCE = ROOT / "evidence"
CANONICAL_EVIDENCE = EVIDENCE / "resume-canonical-text.txt"
VALIDATION_EVIDENCE = EVIDENCE / "resume-validation.json"
COLOR_RENDER = EVIDENCE / "resume-color.png"
GRAY_RENDER = EVIDENCE / "resume-grayscale.png"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(parents=True, exist_ok=True)

FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("PerchGeorgia", str(FONT_DIR / "georgia.ttf")))
pdfmetrics.registerFont(TTFont("PerchGeorgiaBold", str(FONT_DIR / "georgiab.ttf")))
pdfmetrics.registerFontFamily(
    "PerchGeorgia",
    normal="PerchGeorgia",
    bold="PerchGeorgiaBold",
    italic="PerchGeorgia",
    boldItalic="PerchGeorgiaBold",
)

INK = HexColor("#211C17")
GRAYBROWN = HexColor("#66594A")
RULE = HexColor("#A99A83")
MARGIN_INK = HexColor("#E7E0D4")
PAPER = HexColor("#F5F0E6")
WIDTH, HEIGHT = 612, 792  # US Letter, points
MARGIN = 43.2  # 0.6 inches
LEFT, RIGHT = MARGIN, WIDTH - MARGIN
CONTENT = RIGHT - LEFT

NAME = "J WAYNE GRAVES JR"
DESCRIPTOR = "Operation Leader, Automation Expert and Quality Improvement Specialist"
EMAIL = "jwaynegravesjr@gmail.com"
SUMMARY = (
    "I turn recurring quality problems into clearer ways of working. "
    "I investigate errors, develop practical guidance with operational specialists, "
    "and support implementation through demonstrations, coaching and follow-up."
)
SCOPE = (
    "Direct management: 20 operations-team members. "
    "Quality lead scope: an 80-person line of business."
)
WIPRO_ROLE = "Operations & Quality Responsibilities"
WIPRO_BULLETS = [
    "Directly managed a 20-person operations team while serving as quality lead "
    "for an 80-person line of business.",
    "Investigated recurring genetics handling errors through error classification "
    "and root-cause narratives. Drafted questions, then refined and expanded them "
    "with the Nurse Supervisor whose team reported the errors.",
    "Authored the operational questions, answers, corrective callouts, email "
    "templates and decision logic in pseudocode. AI converted that pseudocode "
    "into the local HTML/CSS Genetics Support Tool.",
    "Rolled out the tool to all teams at the beginning of July, demonstrated it "
    "to genetics teams and provided team leads with written guidance. Team leads "
    "confirmed continued use; leaders described using it to coach agents.",
]
ASHLEY_TEXT = (
    "Supported customers with website navigation and online ordering; "
    "resolved usability issues and helped streamline call-center workflows."
)
CONVERGYS_TEXT = (
    "Delivered remote hardware and software troubleshooting for Dell ProSupport "
    "customers and shared troubleshooting and service practices with colleagues."
)
PROJECT_TITLE = "Genetics Support Tool"
PROJECT_TEXT = (
    "Designed an operational guidance tool for agents processing genetics "
    "prior-authorization requests. Used recurring error patterns to develop a "
    "question-led workflow, refined with the Nurse Supervisor. Authored the "
    "guidance and decision logic; AI produced the local HTML/CSS implementation. "
    "Supported rollout through demonstrations and written instructions, with "
    "team leads confirming continued use."
)
EDUCATION_TEXT = (
    "Hillsborough Community College | Associate of Arts | 2013-2015"
    "\nLean Methodology Training"
)

# This is the complete approved document text in reading order. Both independent
# extractors must match it after whitespace normalization; keywords alone cannot
# pass this validation.
CANONICAL_TEXT = " ".join(
    [
        NAME,
        DESCRIPTOR,
        EMAIL,
        SUMMARY,
        SCOPE,
        "PROFESSIONAL EXPERIENCE",
        "WIPRO LIMITED",
        "2022-Present",
        WIPRO_ROLE,
        *WIPRO_BULLETS,
        "ASHLEY FURNITURE INDUSTRIES",
        "2021-2022",
        "Customer Service Representative",
        ASHLEY_TEXT,
        "CONVERGYS",
        "2015-2016",
        "Technical Support Representative",
        CONVERGYS_TEXT,
        "SELECTED PORTFOLIO PROJECT",
        PROJECT_TITLE,
        PROJECT_TEXT,
        "EDUCATION & TRAINING",
        EDUCATION_TEXT.replace("\n", " "),
        NAME,
        "1/1",
    ]
)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


BODY = ParagraphStyle(
    "body",
    fontName="PerchGeorgia",
    fontSize=10.4,
    leading=13.0,
    textColor=INK,
    spaceAfter=0,
)
SUMMARY_STYLE = ParagraphStyle(
    "summary",
    parent=BODY,
    fontSize=10.8,
    leading=13.7,
)
SCOPE_STYLE = ParagraphStyle(
    "scope",
    parent=BODY,
    fontSize=10.4,
    leading=13.0,
    textColor=GRAYBROWN,
)
ROLE = ParagraphStyle(
    "role",
    parent=BODY,
    fontName="PerchGeorgiaBold",
    fontSize=10.4,
    leading=12.8,
)
PROJECT_ROLE = ParagraphStyle(
    "project role",
    parent=ROLE,
    fontSize=10.6,
    leading=13.0,
)
DESCRIPTOR_STYLE = ParagraphStyle(
    "descriptor",
    parent=BODY,
    fontSize=11.1,
    leading=13.8,
    textColor=GRAYBROWN,
)
EMAIL_STYLE = ParagraphStyle(
    "email",
    parent=BODY,
    fontSize=10.1,
    leading=12.4,
    textColor=GRAYBROWN,
)


def draw_section_divider(pdf: canvas.Canvas, y: float) -> None:
    pdf.setStrokeColor(RULE)
    pdf.setLineWidth(0.58)
    path = pdf.beginPath()
    path.moveTo(LEFT, y)
    path.curveTo(LEFT + 142, y + 1.25, RIGHT - 166, y - 1.05, RIGHT, y + 0.15)
    pdf.drawPath(path)


def draw_header_bird(pdf: canvas.Canvas, x: float, perch_y: float) -> None:
    """Draw one small perched bird as vector paths on the header divider."""
    pdf.saveState()
    pdf.setFillColor(GRAYBROWN)
    pdf.setStrokeColor(GRAYBROWN)
    pdf.setLineWidth(0.72)

    # Compact filled silhouette: tail, body, neck, head and pointed beak.
    silhouette = pdf.beginPath()
    silhouette.moveTo(x - 7.0, perch_y + 3.2)
    silhouette.lineTo(x - 11.1, perch_y + 6.7)
    silhouette.lineTo(x - 9.1, perch_y + 1.7)
    silhouette.curveTo(x - 6.7, perch_y - 0.2, x - 1.7, perch_y + 0.3, x + 0.8, perch_y + 2.8)
    silhouette.curveTo(x + 2.3, perch_y + 4.7, x + 2.2, perch_y + 8.6, x + 5.3, perch_y + 9.0)
    silhouette.curveTo(x + 7.8, perch_y + 9.2, x + 9.2, perch_y + 7.0, x + 9.4, perch_y + 5.4)
    silhouette.lineTo(x + 12.0, perch_y + 4.6)
    silhouette.lineTo(x + 9.0, perch_y + 3.9)
    silhouette.curveTo(x + 7.7, perch_y + 1.4, x + 4.0, perch_y + 0.2, x + 0.2, perch_y + 0.9)
    silhouette.curveTo(x - 2.6, perch_y + 1.2, x - 5.1, perch_y + 1.8, x - 7.0, perch_y + 3.2)
    silhouette.close()
    pdf.drawPath(silhouette, fill=1, stroke=0)

    # A single curved wing mark and paired feet make the small shape read as a bird.
    wing = pdf.beginPath()
    wing.moveTo(x - 5.8, perch_y + 3.3)
    wing.curveTo(x - 2.1, perch_y + 4.4, x + 1.3, perch_y + 4.0, x + 3.7, perch_y + 2.2)
    pdf.drawPath(wing, stroke=1, fill=0)
    for foot_x in (x - 0.5, x + 2.0):
        pdf.line(foot_x, perch_y + 0.7, foot_x - 0.2, perch_y - 0.9)
        pdf.line(foot_x - 0.2, perch_y - 0.9, foot_x - 1.5, perch_y - 1.3)
        pdf.line(foot_x - 0.2, perch_y - 0.9, foot_x + 1.3, perch_y - 1.15)
    pdf.restoreState()


def paragraph(pdf: canvas.Canvas, text: str, top: float, *, x=LEFT, width=CONTENT, style=BODY) -> float:
    p = Paragraph(text, style)
    _, height = p.wrap(width, HEIGHT)
    p.drawOn(pdf, x, top - height)
    return top - height


def section(pdf: canvas.Canvas, label: str, top: float) -> float:
    pdf.setFillColor(GRAYBROWN)
    pdf.setFont("PerchGeorgiaBold", 10.0)
    pdf.drawString(LEFT, top - 10.0, label.upper())
    divider_y = top - 15.3
    draw_section_divider(pdf, divider_y)
    return divider_y - 8.2


def job(pdf: canvas.Canvas, company: str, date: str, top: float) -> float:
    line = Paragraph(
        f'<b>{company}</b> <font name="PerchGeorgia" color="#66594A">{date}</font>',
        ParagraphStyle(
            "job line",
            fontName="PerchGeorgia",
            fontSize=10.8,
            leading=13.2,
            textColor=INK,
        ),
    )
    _, height = line.wrap(CONTENT, HEIGHT)
    line.drawOn(pdf, LEFT, top - height)
    return top - height - 4.0


def bullet(pdf: canvas.Canvas, text: str, top: float) -> float:
    pdf.setFillColor(GRAYBROWN)
    pdf.circle(LEFT + 3.5, top - 5.5, 1.2, fill=1, stroke=0)
    return paragraph(pdf, text, top, x=LEFT + 13.5, width=CONTENT - 13.5, style=BODY) - 3.5


def resolve_pdftotext() -> Path | None:
    env_path = os.environ.get("PDFTOTEXT")
    candidates = [Path(env_path)] if env_path else []
    found_on_path = shutil.which("pdftotext") or shutil.which("pdftotext.exe")
    if found_on_path:
        candidates.append(Path(found_on_path))
    candidates.extend(
        [
            Path(sys.executable).parents[1] / "native/poppler/Library/bin/pdftotext.exe",
            ROOT
            / "tmp/pdf-tools/poppler-26.07.0/poppler-26.07.0/Library/bin/pdftotext.exe",
        ]
    )
    return next((candidate for candidate in candidates if candidate.is_file()), None)


def embedded_font_names(reader: PdfReader) -> list[str]:
    names: set[str] = set()
    for page in reader.pages:
        resources = page.get("/Resources")
        if not resources:
            continue
        fonts = resources.get_object().get("/Font", {})
        for font_ref in fonts.values():
            font = font_ref.get_object()
            descriptors = []
            descriptor = font.get("/FontDescriptor")
            if descriptor:
                descriptors.append(descriptor.get_object())
            for descendant_ref in font.get("/DescendantFonts", []):
                descendant = descendant_ref.get_object()
                descriptor = descendant.get("/FontDescriptor")
                if descriptor:
                    descriptors.append(descriptor.get_object())
            assert descriptors, f"Font has no descriptor: {font.get('/BaseFont')}"
            assert any(
                descriptor.get("/FontFile")
                or descriptor.get("/FontFile2")
                or descriptor.get("/FontFile3")
                for descriptor in descriptors
            ), f"Font is not embedded: {font.get('/BaseFont')}"
            names.add(str(font.get("/BaseFont", "unknown")))
    return sorted(names)


def draw_document() -> float:
    pdf = canvas.Canvas(
        str(OUTPUT),
        pagesize=(WIDTH, HEIGHT),
        pageCompression=1,
        initialFontName="PerchGeorgia",
        initialFontSize=10.4,
    )
    pdf.setTitle("J Wayne Graves Jr - Operations, Automation and Quality Improvement")
    pdf.setAuthor("J Wayne Graves Jr")
    pdf.setSubject("Updated professional resume using the approved September 2026 narrative")
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)

    # Faint side ink stays outside the 0.6 inch text margins.
    pdf.setStrokeColor(MARGIN_INK)
    pdf.setLineWidth(0.32)
    pdf.line(24, 68, 24, 725)
    pdf.line(WIDTH - 24, 68, WIDTH - 24, 725)

    name_size = 30.5
    assert pdfmetrics.stringWidth(NAME, "PerchGeorgiaBold", name_size) <= CONTENT
    pdf.setFillColor(INK)
    pdf.setFont("PerchGeorgiaBold", name_size)
    pdf.drawString(LEFT, 727.0, NAME)

    y = paragraph(pdf, DESCRIPTOR, 708.3, style=DESCRIPTOR_STYLE)
    y = paragraph(
        pdf,
        f'<link href="mailto:{EMAIL}" color="#66594A">{EMAIL}</link>',
        y - 3.4,
        style=EMAIL_STYLE,
    )

    header_divider_y = 666.0
    draw_section_divider(pdf, header_divider_y)
    draw_header_bird(pdf, RIGHT - 48.0, header_divider_y)

    y = paragraph(pdf, SUMMARY, header_divider_y - 23.0, style=SUMMARY_STYLE) - 8.0
    y = paragraph(pdf, SCOPE, y, style=SCOPE_STYLE) - 10.8

    y = section(pdf, "Professional experience", y)
    y = job(pdf, "WIPRO LIMITED", "2022-Present", y)
    y = paragraph(pdf, WIPRO_ROLE.replace("&", "&amp;"), y, style=ROLE) - 4.0
    for item in WIPRO_BULLETS:
        y = bullet(pdf, item, y)

    y -= 1.5
    y = job(pdf, "ASHLEY FURNITURE INDUSTRIES", "2021-2022", y)
    y = paragraph(pdf, "Customer Service Representative", y, style=ROLE) - 2.3
    y = paragraph(pdf, ASHLEY_TEXT, y, style=BODY) - 7.2

    y = job(pdf, "CONVERGYS", "2015-2016", y)
    y = paragraph(pdf, "Technical Support Representative", y, style=ROLE) - 2.3
    y = paragraph(pdf, CONVERGYS_TEXT, y, style=BODY) - 7.2

    y = section(pdf, "Selected portfolio project", y)
    y = paragraph(pdf, PROJECT_TITLE, y, style=PROJECT_ROLE) - 2.3
    y = paragraph(pdf, PROJECT_TEXT, y, style=BODY) - 7.5

    y = section(pdf, "Education & training", y)
    y = paragraph(pdf, EDUCATION_TEXT.replace("\n", "<br/>"), y, style=BODY)

    assert y >= 84, f"Resume content is too close to the footer: bottom={y:.2f} pt"

    # Footer is set inside the lower text margin and separated from body content.
    draw_section_divider(pdf, 67.0)
    pdf.setFillColor(GRAYBROWN)
    pdf.setFont("PerchGeorgia", 8.6)
    pdf.drawString(LEFT, 49.0, NAME)
    pdf.drawRightString(RIGHT, 49.0, "1/1")
    pdf.showPage()
    pdf.save()
    return y


def validate_and_render(bottom_y: float) -> dict:
    reader = PdfReader(OUTPUT)
    assert len(reader.pages) == 1, f"Expected one page; got {len(reader.pages)}"
    page = reader.pages[0]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)
    assert (page_width, page_height) == (WIDTH, HEIGHT), "Page is not US Letter"

    pypdf_text = normalize(page.extract_text() or "")
    expected_text = normalize(CANONICAL_TEXT)
    assert pypdf_text == expected_text, (
        "pypdf extraction differs from the canonical approved body.\n"
        f"Expected: {expected_text}\nActual:   {pypdf_text}"
    )

    pdftotext_path = resolve_pdftotext()
    assert pdftotext_path, (
        "pdftotext.exe is required for independent full-text validation. "
        "Set PDFTOTEXT to its path; no package download is performed by this script."
    )
    extracted = subprocess.run(
        [str(pdftotext_path), "-enc", "UTF-8", "-nopgbrk", str(OUTPUT), "-"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout
    poppler_text = normalize(extracted)
    assert poppler_text == expected_text, (
        "pdftotext extraction differs from the canonical approved body.\n"
        f"Expected: {expected_text}\nActual:   {poppler_text}"
    )

    fonts = embedded_font_names(reader)
    assert fonts, "No page fonts were found"
    assert BODY.fontSize >= 10.0 and SUMMARY_STYLE.fontSize >= 10.0
    assert ROLE.fontSize >= 10.0 and SCOPE_STYLE.fontSize >= 10.0

    mailto = []
    for annotation_ref in page.get("/Annots", []):
        annotation = annotation_ref.get_object()
        action = annotation.get("/A")
        if action and action.get_object().get("/S") == "/URI":
            mailto.append(str(action.get_object().get("/URI")))
    assert mailto.count(f"mailto:{EMAIL}") == 1, f"Expected one clickable email URI: {mailto}"

    # Verify all extracted text starts within the horizontal text margins and the
    # primary page body remains above the lower margin and footer rule.
    text_origins: list[tuple[float, str]] = []

    def collect_positions(text, cm, tm, font_dict, font_size):
        if text and text.strip():
            text_origins.append((float(cm[4] + tm[4]), text.strip()))

    page.extract_text(visitor_text=collect_positions)
    assert text_origins, "Could not inspect extracted text positions"
    assert min(x for x, _ in text_origins) >= LEFT - 0.2, "Text crossed the left margin"
    assert max(x for x, _ in text_origins) <= RIGHT + 0.2, "Text crossed the right margin"
    assert bottom_y >= 84, f"Body bottom is below the safe area: {bottom_y:.2f}"

    poppler_bin = Path(sys.executable).parents[1] / "native/poppler/Library/bin"
    pdftoppm = poppler_bin / "pdftoppm.exe"
    if not pdftoppm.is_file():
        pdftoppm = Path(shutil.which("pdftoppm") or shutil.which("pdftoppm.exe") or "")
    assert pdftoppm.is_file(), "pdftoppm is required to render the PDF for visual review"
    for old_render in (COLOR_RENDER, GRAY_RENDER):
        if old_render.exists():
            old_render.unlink()
    subprocess.run(
        [str(pdftoppm), "-png", "-singlefile", "-r", "150", str(OUTPUT), str(COLOR_RENDER.with_suffix(""))],
        check=True,
    )
    subprocess.run(
        [str(pdftoppm), "-png", "-gray", "-singlefile", "-r", "150", str(OUTPUT), str(GRAY_RENDER.with_suffix(""))],
        check=True,
    )
    assert COLOR_RENDER.is_file() and GRAY_RENDER.is_file()

    CANONICAL_EVIDENCE.write_text(expected_text + "\n", encoding="utf-8")
    receipt = {
        "pages": len(reader.pages),
        "pageSize": "US Letter (612 x 792 pt)",
        "textMargins": "0.6 in on all sides",
        "bodyBottomY": round(bottom_y, 2),
        "bodyFont": "Georgia",
        "minimumBodyPointSize": 10.0,
        "allNarrativeTextPointSizesAtLeast10": True,
        "embeddedFonts": fonts,
        "pypdfNormalizedTextEqualsCanonical": True,
        "pdftotextNormalizedTextEqualsCanonical": True,
        "canonicalNormalizedTextSha256": hashlib.sha256(expected_text.encode("utf-8")).hexdigest(),
        "canonicalNormalizedCharacters": len(expected_text),
        "emailUri": f"mailto:{EMAIL}",
        "singleColumn": True,
        "headerBirdsDrawn": 1,
        "headerBirdAttachedToDivider": True,
        "colorRender": str(COLOR_RENDER),
        "grayscaleRender": str(GRAY_RENDER),
        "pdftotextExecutable": str(pdftotext_path),
        "originalSources": "untouched",
    }
    VALIDATION_EVIDENCE.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


if __name__ == "__main__":
    body_bottom = draw_document()
    validation = validate_and_render(body_bottom)
    print(json.dumps(validation, indent=2))
    print(OUTPUT)
