#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate realistic .pptx test decks for the presentation editor UI work.

Usage: python3 make_fixtures.py [outdir]   (needs python-pptx and Pillow)

Decks:
  p01-cours-photosynthese.pptx  title, bullets, picture, chart, table, notes,
                                transitions (written as raw XML: python-pptx
                                has no transition API), 8 slides
  p02-blank-16x9.pptx           one empty title slide (shortcut tests)
"""
import io
import os
import sys

from lxml import etree
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.util import Emu, Inches, Pt

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"


def picture(w=800, h=500):
    img = Image.new("RGB", (w, h), (226, 240, 217))
    d = ImageDraw.Draw(img)
    d.ellipse((w * 0.65, 30, w * 0.65 + 130, 160), fill=(255, 200, 40))  # sun
    d.rectangle((0, h * 0.75, w, h), fill=(120, 85, 50))  # soil
    d.rectangle((w * 0.45, h * 0.35, w * 0.48, h * 0.75), fill=(60, 120, 40))  # stem
    for dx, dy in ((-90, -40), (40, -70), (-60, 40), (50, 10)):
        cx, cy = w * 0.465 + dx, h * 0.45 + dy
        d.ellipse((cx - 55, cy - 25, cx + 55, cy + 25), fill=(70, 160, 60))
    b = io.BytesIO()
    img.save(b, "PNG")
    b.seek(0)
    return b


def add_notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def add_transition(slide, kind="fade", dur=700):
    """<p:transition spd="med" p14:dur=..><p:fade/></p:transition> after cSld/clrMapOvr."""
    el = slide._element
    tr = etree.SubElement(el, "{%s}transition" % P_NS)
    tr.set("spd", "med")
    etree.SubElement(tr, "{%s}%s" % (P_NS, kind))
    # transition must precede timing / extLst
    for tag in ("timing", "extLst"):
        for n in el.findall("{%s}%s" % (P_NS, tag)):
            el.remove(n)
            el.append(n)


def deck1():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    L = prs.slide_layouts

    s = prs.slides.add_slide(L[0])
    s.shapes.title.text = "La photosynthèse"
    s.placeholders[1].text = "Sciences de la vie et de la Terre · Classe de 5e"
    add_notes(s, "Accueillir la classe. Rappeler la séance précédente sur la respiration.")
    add_transition(s, "fade")

    s = prs.slides.add_slide(L[1])
    s.shapes.title.text = "Objectifs de la séance"
    tf = s.placeholders[1].text_frame
    tf.text = "Comprendre le rôle de la lumière"
    for t, lvl in (("Identifier les besoins de la plante", 0), ("eau, dioxyde de carbone, lumière", 1),
                   ("Décrire les produits de la réaction", 0), ("Réaliser une expérience simple", 0)):
        p = tf.add_paragraph()
        p.text, p.level = t, lvl
    add_notes(s, "Lire les objectifs à voix haute. Demander ce que les élèves savent déjà.")
    add_transition(s, "push")

    s = prs.slides.add_slide(L[5])
    s.shapes.title.text = "Une plante au soleil"
    s.shapes.add_picture(picture(), Inches(2.5), Inches(1.6), width=Inches(8.3))
    add_notes(s, "Faire observer l'image : d'où vient l'énergie ?")
    add_transition(s, "wipe")

    s = prs.slides.add_slide(L[5])
    s.shapes.title.text = "Croissance selon l'éclairage"
    cd = CategoryChartData()
    cd.categories = ["Semaine 1", "Semaine 2", "Semaine 3", "Semaine 4"]
    cd.add_series("Lumière", (2.1, 4.3, 7.0, 9.8))
    cd.add_series("Obscurité", (1.9, 2.4, 2.6, 2.7))
    ch = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1.5), Inches(1.6), Inches(10.3), Inches(5.2), cd).chart
    ch.has_legend = True
    ch.legend.position = XL_LEGEND_POSITION.BOTTOM
    ch.legend.include_in_layout = False
    add_notes(s, "Hauteur moyenne en cm de 10 plants par groupe.")

    s = prs.slides.add_slide(L[5])
    s.shapes.title.text = "Entrées et sorties"
    rows = [("", "Entre dans la feuille", "Sort de la feuille"),
            ("Gaz", "Dioxyde de carbone", "Dioxygène"),
            ("Liquide", "Eau (sève brute)", "Sève élaborée"),
            ("Énergie", "Lumière", "Matière organique")]
    t = s.shapes.add_table(4, 3, Inches(1.5), Inches(1.8), Inches(10.3), Inches(3.2)).table
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            t.cell(r, c).text = v
    add_notes(s, "Compléter le tableau avec les élèves avant de l'afficher.")
    add_transition(s, "fade")

    s = prs.slides.add_slide(L[3])
    s.shapes.title.text = "Avec ou sans lumière"
    s.placeholders[1].text = "Avec lumière : la plante verdit et grandit"
    s.placeholders[2].text = "Sans lumière : la plante jaunit et s'étiole"
    add_notes(s, "Montrer les deux pots préparés la semaine dernière.")

    s = prs.slides.add_slide(L[2])
    s.shapes.title.text = "Expérience"
    s.placeholders[1].text = "Partie 2 : à vous de jouer"

    s = prs.slides.add_slide(L[1])
    s.shapes.title.text = "À retenir"
    s.placeholders[1].text = "Lumière + eau + CO₂ → matière organique + O₂"
    add_notes(s, "Faire recopier la phrase dans le cahier.")
    add_transition(s, "cover")

    prs.core_properties.title = "La photosynthèse"
    prs.core_properties.author = "ElixirOffice tests"
    prs.save(os.path.join(OUT, "p01-cours-photosynthese.pptx"))


def deck2():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    s = prs.slides.add_slide(prs.slide_layouts[0])
    s.shapes.title.text = "Test"
    s.placeholders[1].text = "Sous-titre"
    prs.slides.add_slide(prs.slide_layouts[1]).shapes.title.text = "Deuxième"
    prs.slides.add_slide(prs.slide_layouts[1]).shapes.title.text = "Troisième"
    prs.save(os.path.join(OUT, "p02-blank-16x9.pptx"))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    deck1()
    deck2()
    print("ok", OUT)
