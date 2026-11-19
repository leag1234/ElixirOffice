#!/usr/bin/env python3
"""Fixture of the character-style tests (#91): charstyles.docx.

Two paragraphs; the styles part has the character styles "Key Term" (bold, dark red) and
"Quiet" (italic, grey) with qFormat, as Word writes a user character style.
Run: python3 tests/fixtures/docx/make_charstyle_fixture.py
"""
import os
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.shared import RGBColor

doc = Document()
for name, bold, italic, color in (("Key Term", True, False, RGBColor(0x9C, 0x00, 0x06)), ("Quiet", False, True, RGBColor(0x7F, 0x7F, 0x7F))):
    st = doc.styles.add_style(name, WD_STYLE_TYPE.CHARACTER)
    st.base_style = doc.styles["Default Paragraph Font"]
    st.quick_style = True
    st.font.bold = bold
    st.font.italic = italic
    st.font.color.rgb = color
doc.add_paragraph("alpha beta gamma delta")
doc.add_paragraph("epsilon zeta eta theta")
doc.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "charstyles.docx"))
