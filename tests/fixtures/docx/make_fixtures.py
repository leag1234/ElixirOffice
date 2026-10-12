#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic .docx fixtures of the Word layout regression suite (tests/layout).

Writes into the output directory (default: tests/fixtures/docx):
  observation-grid.docx   a teacher's observation grid: numbered headings ("1. Preparation" ...
                          "9. Professional posture"), each followed by a 4-column table whose
                          last column holds small anchored shapes (coloured circles and a checkbox)
                          floating inside the cell, like the real document that triggered the bugs.
  vertical-cells.docx     a school worksheet table whose cells carry rotated text (btLr, tbRl),
                          shading, vertical alignment, cell margins, cell borders, exact and
                          at-least row heights, horizontal and vertical merges, followed by a
                          plain target table and an empty paragraph (copy-paste suite, F11).
Deterministic (fixed content, no timestamps in the core properties). Needs python-docx + lxml.
"""
import os, sys
from docx import Document
from docx.shared import Pt, Cm
from docx.oxml import parse_xml

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(OUT, exist_ok=True)

NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"')

_ids = [100]


def anchored_shape(off_x_cm, off_y_cm, size_cm, color, prst="ellipse"):
    """A floating shape (wrap none, in front of text) anchored in the paragraph that holds it:
    horizontal offset from the column (= the cell text area), vertical offset from the paragraph."""
    _ids[0] += 1
    n = _ids[0]
    emu = lambda cm: int(round(cm * 360000))
    return parse_xml(f'''<w:r {NS}><w:drawing>
<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="{251659264 + n}"
  behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:simplePos x="0" y="0"/>
<wp:positionH relativeFrom="column"><wp:posOffset>{emu(off_x_cm)}</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="paragraph"><wp:posOffset>{emu(off_y_cm)}</wp:posOffset></wp:positionV>
<wp:extent cx="{emu(size_cm)}" cy="{emu(size_cm)}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:wrapNone/>
<wp:docPr id="{n}" name="Shape {n}"/>
<wp:cNvGraphicFramePr/>
<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
<wps:wsp><wps:cNvSpPr/><wps:spPr>
<a:xfrm><a:off x="0" y="0"/><a:ext cx="{emu(size_cm)}" cy="{emu(size_cm)}"/></a:xfrm>
<a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>
<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>
<a:ln w="9525"><a:solidFill><a:srgbClr val="404040"/></a:solidFill></a:ln>
</wps:spPr><wps:bodyPr/></wps:wsp>
</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>''')


HEADINGS = ["Preparation of the lesson", "Welcome and opening", "Instructions", "Class management",
            "Differentiation", "Pupil engagement", "Assessment", "Closing of the lesson", "Professional posture"]
CRITERIA = ["Objectives are stated", "Material is ready", "Timing is respected"]


def observation_grid(path):
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(11)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    for m in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, m, Cm(2))
    doc.add_paragraph("Classroom observation grid", style="Title")
    doc.add_paragraph("Observer: ________    Teacher: ________    Date: ________")
    for i, h in enumerate(HEADINGS, 1):
        doc.add_paragraph(f"{i}. {h}", style="Heading 1")
        t = doc.add_table(rows=1 + len(CRITERIA), cols=4)
        t.style = "Table Grid"
        for c, txt in enumerate(["Criterion", "Observed", "Comment", "Level"]):
            t.cell(0, c).text = txt
        for r, crit in enumerate(CRITERIA, 1):
            t.cell(r, 0).text = crit
            t.cell(r, 1).text = "yes / no"
            t.cell(r, 2).text = ""
            cell = t.cell(r, 3)
            p = cell.paragraphs[0]
            p.add_run(" ")
            # four small shapes side by side in the cell: three coloured circles and a checkbox
            for k, color in enumerate(["00B050", "FFC000", "FF0000"]):
                p._p.append(anchored_shape(0.2 + k * 0.7, 0.05, 0.4, color))
            p._p.append(anchored_shape(0.2 + 3 * 0.7, 0.05, 0.4, "FFFFFF", prst="rect"))
            cell.width = Cm(4)
        doc.add_paragraph("")
    cp = doc.core_properties
    cp.author = "ElixirOffice tests"
    import datetime
    cp.created = cp.modified = datetime.datetime(2026, 1, 1)
    cp.revision = 1
    doc.save(path)


W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
TW = lambda cm: int(round(cm * 567))


def _cell(text, w_cm, direction=None, shd=None, valign=None, mar=None, borders=None, span=None, vmerge=None,
          bold=False, italic=False, underline=False):
    pr = [f'<w:tcW w:w="{TW(w_cm)}" w:type="dxa"/>']
    if span:
        pr.append(f'<w:gridSpan w:val="{span}"/>')
    if vmerge:
        pr.append('<w:vMerge w:val="restart"/>' if vmerge == "restart" else '<w:vMerge/>')
    if borders:
        pr.append('<w:tcBorders>' + ''.join(f'<w:{s} w:val="single" w:sz="{borders[1]}" w:space="0" w:color="{borders[0]}"/>'
                                             for s in ("top", "left", "bottom", "right")) + '</w:tcBorders>')
    if shd:
        pr.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shd}"/>')
    if mar:
        pr.append('<w:tcMar>' + ''.join(f'<w:{s} w:w="{TW(v)}" w:type="dxa"/>'
                                        for s, v in zip(("top", "left", "bottom", "right"), mar)) + '</w:tcMar>')
    if direction:
        pr.append(f'<w:textDirection w:val="{direction}"/>')
    if valign:
        pr.append(f'<w:vAlign w:val="{valign}"/>')
    rpr = ("<w:b/>" if bold else "") + ("<w:i/>" if italic else "") + ('<w:u w:val="single"/>' if underline else "")
    run = f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>' if text else ""
    return f'<w:tc><w:tcPr>{"".join(pr)}</w:tcPr><w:p>{run}</w:p></w:tc>'


def _row(cells, height_cm=None, rule=None):
    trpr = f'<w:trPr><w:trHeight w:val="{TW(height_cm)}" w:hRule="{rule}"/></w:trPr>' if height_cm else ""
    return f'<w:tr>{trpr}{"".join(cells)}</w:tr>'


def _table(grid_cm, rows):
    grid = "".join(f'<w:gridCol w:w="{TW(g)}"/>' for g in grid_cm)
    return parse_xml(f'<w:tbl {W_NS}><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
                     f'<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" '
                     f'w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>')


def vertical_cells(path):
    """Source table with rotated cells (like the teacher's worksheet), then a plain target table."""
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(11)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    for m in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, m, Cm(2))
    doc.add_paragraph("Weekly language skills", style="Heading 1")
    anchor = doc.add_paragraph("Target table:")
    biu = dict(bold=True, italic=True, underline=True)
    src = _table([1.5, 1.5, 2.0, 6.0], [
        _row([_cell("Reading", 1.5, "btLr", "9DC3E6", "center", (0.1, 0.2, 0.1, 0.2), ("C00000", 12), **biu),
              _cell("Writing", 1.5, "btLr", "A9D08E", "center", **biu),
              _cell("Listening", 2.0, "tbRl", "FFE699", "bottom"),
              _cell("Notes", 6.0)], 3.0, "exact"),
        _row([_cell("Monday", 1.5, "btLr", "F4B183", "center", vmerge="restart"),
              _cell("Speaking", 3.5, "tbRl", "D9D2E9", "top", span=2),
              _cell("Pair work", 6.0)], 2.0, "atLeast"),
        _row([_cell("", 1.5, "btLr", "F4B183", "center", vmerge="continue"),
              _cell("Song", 1.5), _cell("Poem", 2.0), _cell("Homework", 6.0)]),
    ])
    anchor._p.addprevious(src)
    tgt = _table([3.0, 3.0, 3.0, 3.0], [_row([_cell(f"t{r}{c}", 3.0) for c in range(4)]) for r in range(3)])
    anchor._p.addnext(tgt)
    tgt.addnext(parse_xml(f'<w:p {W_NS}/>'))
    doc.add_paragraph("End of the worksheet.")
    cp = doc.core_properties
    cp.author = "ElixirOffice tests"
    import datetime
    cp.created = cp.modified = datetime.datetime(2026, 1, 1)
    cp.revision = 1
    doc.save(path)


observation_grid(os.path.join(OUT, "observation-grid.docx"))
vertical_cells(os.path.join(OUT, "vertical-cells.docx"))
print("written", OUT)
