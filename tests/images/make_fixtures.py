#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Fixtures of the multi-image layout stability suite (docs/images.md).

Writes into the output directory (default: tests/images/fixtures, not tracked):
  worksheet.docx   a 2-page teacher worksheet (title, instructions, numbered exercises,
                   a 4x4 table, writing lines), Word defaults (Calibri 11, A4, 2.5 cm margins)
  photo-*.jpg / clip-*.png   synthetic pictures of typical sizes (camera photo, scan,
                   transparent clip art, small icon, wide banner)
Deterministic: same bytes on every run (fixed seeds, no timestamps in the docx core props).
"""
import os, sys, random, math
from PIL import Image, ImageDraw, ImageFilter
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(OUT, exist_ok=True)

def photo(name, w, h, seed, dpi=96, quality=88):
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h))
    px = im.load()
    c1 = [rnd.randint(40, 200) for _ in range(3)]; c2 = [rnd.randint(40, 200) for _ in range(3)]
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3))
        for x in range(0, w):
            px[x, y] = row
    d = ImageDraw.Draw(im)
    for _ in range(40):
        x0, y0 = rnd.randint(0, w), rnd.randint(0, h); r = rnd.randint(w // 40, w // 6)
        d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=tuple(rnd.randint(0, 255) for _ in range(3)))
    im = im.filter(ImageFilter.GaussianBlur(radius=max(1, w // 400)))
    im.save(os.path.join(OUT, name), "JPEG", quality=quality, dpi=(dpi, dpi))

def clip(name, w, h, seed, alpha=True):
    rnd = random.Random(seed)
    im = Image.new("RGBA" if alpha else "RGB", (w, h), (0, 0, 0, 0) if alpha else (255, 255, 255))
    d = ImageDraw.Draw(im)
    for i in range(6):
        col = tuple(rnd.randint(0, 255) for _ in range(3)) + ((255,) if alpha else ())
        x0, y0 = rnd.randint(0, w // 2), rnd.randint(0, h // 2)
        d.rounded_rectangle([x0, y0, x0 + rnd.randint(w // 4, w // 2), y0 + rnd.randint(h // 4, h // 2)], radius=min(w, h) // 12, fill=col)
    im.save(os.path.join(OUT, name), "PNG", dpi=(96, 96))

photo("photo-camera.jpg", 4000, 3000, 1)        # phone photo: wider than the column at 96 dpi
photo("photo-portrait.jpg", 1500, 2200, 2)      # portrait scan: taller than the column is wide
photo("photo-small.jpg", 480, 320, 3)           # small photo, fits
clip("clip-star.png", 600, 600, 4)              # transparent clip art
clip("clip-icon.png", 128, 128, 5)              # small icon
clip("clip-banner.png", 2400, 500, 6, alpha=False)  # wide banner

doc = Document()
st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(11)
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = Cm(2.5)
cp = doc.core_properties
cp.author = "fixture"; cp.title = "worksheet"
import datetime
cp.created = cp.modified = datetime.datetime(2026, 1, 1)
cp.last_modified_by = "fixture"; cp.revision = 1

doc.add_heading("Les animaux de la ferme", level=0)
doc.add_paragraph("Nom : ____________________    Prénom : ____________________    Date : ____________")
doc.add_heading("Consigne", level=1)
doc.add_paragraph("Lis attentivement chaque exercice. Réponds en faisant des phrases complètes. "
                  "Tu peux t’aider des images pour trouver les réponses. Prends ton temps et relis-toi.")
texts = [
    "Observe la vache et la poule. Écris trois différences entre ces deux animaux de la ferme. "
    "Pense à leur taille, à ce qu’ils mangent et à ce qu’ils nous donnent.",
    "Complète les phrases avec le nom du petit de chaque animal : la vache a un ______, la poule a un ______, "
    "la brebis a un ______, la chèvre a un ______.",
    "Relie chaque animal à son cri : le cheval, le cochon, le canard, l’âne. Utilise des flèches de couleur.",
    "Range ces animaux du plus petit au plus grand : lapin, cheval, poule, cochon, vache, souris.",
    "Lis le texte puis réponds aux questions. Le fermier se lève tôt pour traire les vaches. Ensuite il "
    "nourrit les poules et ramasse les œufs. L’après-midi, il répare la clôture du pré.",
    "Dessine ton animal préféré dans le cadre et écris deux phrases pour le décrire.",
]
for i, t in enumerate(texts):
    p = doc.add_paragraph(style="List Number"); p.add_run(f"Exercice {i + 1}. ").bold = True; p.add_run(t)
    for _ in range(2):
        doc.add_paragraph("…" * 60)
    if i == 2:
        doc.add_heading("Tableau à compléter", level=1)
        tb = doc.add_table(rows=4, cols=4); tb.style = "Table Grid"
        for c, h in enumerate(["Animal", "Petit", "Cri", "Ce qu’il nous donne"]):
            tb.cell(0, c).text = h
        for r, row in enumerate([["Vache", "", "", ""], ["Poule", "", "", ""], ["Mouton", "", "", ""]]):
            for c, v in enumerate(row):
                tb.cell(r + 1, c).text = v
        doc.add_paragraph("")
doc.add_heading("Bilan", level=1)
doc.add_paragraph("Ce que j’ai appris aujourd’hui : " + "…" * 40)
doc.add_paragraph("Je colorie le smiley qui correspond à mon travail.")
# Word 2013+ layout rules (compatibilityMode 15), as in any document created by a current
# Word; python-docx's template is in Word 2010 compatibility mode (14)
from docx.oxml.ns import qn
mode = [e for e in doc.settings.element.iter(qn("w:compatSetting")) if e.get(qn("w:name")) == "compatibilityMode"][0]
mode.set(qn("w:val"), "15")
doc.save(os.path.join(OUT, "worksheet.docx"))
# same worksheet in Word 2010 compatibility mode (old worksheets kept in compatibility mode)
mode.set(qn("w:val"), "14")
doc.save(os.path.join(OUT, "worksheet-compat14.docx"))
print("fixtures in", OUT)
