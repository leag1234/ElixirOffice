#!/usr/bin/env python3
"""Synthetic .docx fixtures of the table shading suite (tests/tableshade, docs/backlog.md F10, F12).

Writes into the output directory (default: tests/fixtures/docx):
  coloured-cells.docx     a worksheet table whose coloured cells also carry the cell colour as paragraph
                          and/or run shading (as files saved by LibreOffice or converted from .odt/.doc
                          often do), plus control cases: highlight, a different paragraph colour, a
                          theme-colour fill and an "auto" paragraph fill (F10).
  selection-fills.docx    one cell per fill (standard Blue 0070C0, dark blue, black, orange, a theme
                          colour with themeShade, white) holding italic text, then two empty standard
                          Blue cells, to check that the selection stays visible on any fill (F12).
Deterministic (fixed content, no timestamps in the core properties). Needs python-docx + lxml.
"""
import datetime
import os
import sys
from docx import Document
from docx.shared import Pt
from docx.oxml import parse_xml

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
PALE = "FFF2CC"  # pale yellow, the cell colour of the worksheet
THEME = ' w:themeFill="accent4" w:themeFillTint="33"'


def shd(fill, extra=""):
    return f'<w:shd {NS} w:val="clear" w:color="auto" w:fill="{fill}"{extra}/>'


def new_doc(title):
    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(11)
    doc.add_paragraph(title, style="Title")
    return doc


def save(doc, path):
    doc.add_paragraph("")
    cp = doc.core_properties
    cp.author = "ElixirOffice tests"
    cp.created = cp.modified = datetime.datetime(2026, 1, 1)
    cp.revision = 1
    doc.save(path)


# label, cell shading, paragraph shading, run shading, highlight (the first column holds the label)
SHADING_ROWS = [
    ("para", shd(PALE), shd(PALE), None, None),
    ("run", shd(PALE), None, shd(PALE), None),
    ("both", shd(PALE), shd(PALE), shd(PALE), None),
    ("highlight", shd(PALE), None, None, "yellow"),
    ("other", shd(PALE), shd("DDEBF7"), None, None),
    ("theme", shd(PALE, THEME), shd(PALE, THEME), shd(PALE, THEME), None),
    ("auto", shd(PALE), shd("auto"), None, None),
    ("plain", shd(PALE), None, None, None),
]


def coloured_cells(path):
    doc = new_doc("Coloured worksheet table")
    t = doc.add_table(rows=len(SHADING_ROWS), cols=2)
    t.style = "Table Grid"
    for r, (label, cell_shd, para_shd, run_shd, hl) in enumerate(SHADING_ROWS):
        t.cell(r, 0).text = label
        cell = t.cell(r, 1)
        cell._tc.get_or_add_tcPr().append(parse_xml(cell_shd))
        for k, line in enumerate([f"First line of the {label} cell", "Second line of text"]):
            p = cell.paragraphs[0] if k == 0 else cell.add_paragraph()
            run = p.add_run(line)
            if para_shd:
                p._p.get_or_add_pPr().append(parse_xml(para_shd))
            if run_shd:
                run._r.get_or_add_rPr().append(parse_xml(run_shd))
            if hl:
                run._r.get_or_add_rPr().append(parse_xml(f'<w:highlight {NS} w:val="{hl}"/>'))
    save(doc, path)


# label, cell shading
FILL_ROWS = [
    ("blue", shd("0070C0")),
    ("darkblue", shd("002060")),
    ("black", shd("000000")),
    ("orange", shd("FFC000")),
    ("themeshade", shd("2F5496", ' w:themeFill="accent1" w:themeFillShade="BF"')),
    ("white", shd("FFFFFF")),
    ("", shd("0070C0")),
    ("", shd("0070C0")),
]


def selection_fills(path):
    doc = new_doc("Selection on coloured cells")
    t = doc.add_table(rows=len(FILL_ROWS), cols=1)
    t.style = "Table Grid"
    for r, (label, cell_shd) in enumerate(FILL_ROWS):
        cell = t.cell(r, 0)
        cell._tc.get_or_add_tcPr().append(parse_xml(cell_shd))
        if label:
            p = cell.paragraphs[0]
            p.add_run(f"Use the money ({label})").italic = True
            p2 = cell.add_paragraph()
            p2.add_run("The shopkeeper: prepare the amount to give back").italic = True
    save(doc, path)


coloured_cells(os.path.join(OUT, "coloured-cells.docx"))
selection_fills(os.path.join(OUT, "selection-fills.docx"))
print("written", OUT)
