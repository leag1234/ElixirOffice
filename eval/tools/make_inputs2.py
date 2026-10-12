#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Input documents of the reference and everyday AI tasks added with the AI rework (docs/ai.md §6).

Standard library only, like make_inputs.py (whose helpers it reuses). Run from the repository root:
    python3 eval/tools/make_inputs2.py
Pictures are plain PNG rectangles generated here (zlib), embedded inline.
"""
import os
import struct
import sys
import zipfile
import zlib
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_inputs as base  # noqa: E402

ROOT = base.ROOT
W = base.W
WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' \
     'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' \
     'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

CONTENT_TYPES = base.CONTENT_TYPES.replace(
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>')


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def picture(rid, n, w_mm, h_mm):
    cx, cy = int(w_mm * 36000), int(h_mm * 36000)
    return (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
            f'<wp:docPr id="{n}" name="Picture {n}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<pic:pic><pic:nvPicPr><pic:cNvPr id="{n}" name="image{n}.png"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            f'</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


def p(text, style=None, rpr="", ppr="", bullet=False, runs_after=""):
    s = ""
    if style:
        s += f'<w:pStyle w:val="{style}"/>'
    if bullet:
        s += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    s += ppr
    r = f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ""
    return f'<w:p><w:pPr>{s}</w:pPr>{r}{runs_after}</w:p>'


def table(rows, header=False):
    grid = "".join('<w:gridCol w:w="3000"/>' for _ in rows[0])
    out = f'<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>'
    for i, r in enumerate(rows):
        trpr = '<w:trPr><w:tblHeader/></w:trPr>' if header and i == 0 else ''
        out += f'<w:tr>{trpr}' + "".join(f'<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>{p(c, rpr="<w:b/>" if header and i == 0 else "")}</w:tc>' for c in r) + '</w:tr>'
    return out + '</w:tbl>'


def write(task, title, body, media=None, sect=base.SECT):
    path = os.path.join(ROOT, task, "input.docx")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rels = base.DOC_RELS
    for rid, name, _ in media or []:
        rels = rels.replace('</Relationships>', f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{name}"/></Relationships>')
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {W} {WP}><w:body>{"".join(body)}{sect}</w:body></w:document>'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", base.RELS)
        z.writestr("word/_rels/document.xml.rels", rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", base.STYLES)
        z.writestr("word/numbering.xml", base.NUMBERING)
        z.writestr("docProps/core.xml", base.CORE.format(title=escape(title)))
        for _, name, data in media or []:
            z.writestr("word/media/" + name, data)
    print("wrote", os.path.relpath(path))


LOREM = ("Les élèves lisent le texte en silence puis répondent aux questions. Ils soulignent les mots qu'ils ne "
         "connaissent pas et cherchent leur sens dans le dictionnaire avant la mise en commun.")


def worksheet_body(title_rpr=""):
    return [
        p("Fiche de mathématiques : les fractions", rpr=title_rpr),
        p("Nom : ____________    Classe : CM2"),
        p("Exercice : Colorie les fractions", rpr="<w:b/>"),
        p("Colorie 1/4 du premier rectangle, 2/3 du deuxième et 3/5 du troisième."),
        p("Exercice : Compare", rpr="<w:b/>"),
        p("Complète avec <, > ou = : 1/2 … 2/4 ; 3/4 … 2/3 ; 5/8 … 1/2."),
        p("Exercice : Problème", rpr="<w:b/>"),
        p("Léa a mangé 3/8 d'une pizza et Tom 2/8. Quelle fraction de la pizza reste-t-il ?"),
        p("Exercice : Range", rpr="<w:b/>"),
        p("Range dans l'ordre croissant : 3/4 ; 1/4 ; 2/4 ; 4/4."),
    ]


def main():
    # --- Requests from a real user ---
    big = '<w:b/><w:sz w:val="28"/>'
    write("g-toc-unstyled", "Projet d'école", [
        p("Projet d'école 2026-2027", rpr='<w:b/><w:sz w:val="40"/>'),
        p("École élémentaire Jean-Moulin"),
        p("1. Diagnostic", rpr=big), p(LOREM),
        p("1.1 Résultats des évaluations", rpr='<w:b/>'), p(LOREM),
        p("1.2 Climat scolaire", rpr='<w:b/>'), p(LOREM),
        p("2. Objectifs", rpr=big), p(LOREM),
        p("2.1 Lecture et écriture", rpr='<w:b/>'), p(LOREM),
        p("2.2 Mathématiques", rpr='<w:b/>'), p(LOREM),
        p("3. Actions et calendrier", rpr=big), p(LOREM),
    ])
    img = png(400, 200, (70, 130, 180))
    sect_a4 = base.SECT
    write("g-a4-to-2xa5", "Sortie scolaire", [
        p("Sortie au parc naturel", rpr='<w:b/><w:sz w:val="56"/>', ppr='<w:jc w:val="center"/>'),
        p("Informations pour les familles", rpr='<w:sz w:val="28"/>', ppr='<w:jc w:val="center"/>'),
        p("", runs_after=picture("rId10", 1, 170, 85)),
        p("Le jeudi 12 juin, la classe partira en car à 8 h 30 pour une journée au parc naturel. Les enfants découvriront "
          "la faune et la flore avec un guide, puis pique-niqueront sur place. Retour prévu vers 16 h 30 devant l'école."),
        p("À prévoir", "Heading2"),
        p("Un pique-nique, une gourde, une casquette, de bonnes chaussures et un vêtement de pluie.", bullet=True, style="ListParagraph"),
        table([["Horaire", "Activité", "Lieu", "Encadrant"], ["8 h 30", "Départ en car", "École", "Mme Martin"],
               ["10 h 00", "Visite guidée", "Sentier", "Guide du parc"], ["12 h 00", "Pique-nique", "Clairière", "Parents"],
               ["14 h 00", "Atelier", "Maison du parc", "Animateur"]], header=True),
        p("Merci de rendre le coupon d'autorisation avant le 5 juin."),
    ], media=[("rId10", "image1.png", img)], sect=sect_a4.replace('<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"', '<w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="851"'))

    # --- reference tasks (brief, phase 3 item 6) ---
    long_p = ("La coopération entre les classes permet aux élèves de partager leurs découvertes. Chaque semaine, un groupe "
              "présente son travail aux autres, ce qui développe l'expression orale et la confiance en soi. Les enseignants "
              "observent les progrès et ajustent les activités en fonction des besoins de chacun.")
    body = [p("Bilan du projet lecture", "Heading1")]
    for i in range(1, 9):
        body += [p(f"Étape {i}", "Heading2"), p(long_p + " " + long_p[:120])]
    write("r-fit-one-page", "Bilan", body)

    write("r-explain-image-jump", "Herbier", [p("Notre herbier de classe", "Heading1")] +
          [p(long_p) for _ in range(9)] +
          [p("", runs_after=picture("rId10", 1, 150, 120)), p("Photo : les feuilles récoltées en octobre.")],
          media=[("rId10", "image1.png", png(300, 220, (60, 160, 90)))])

    write("r-two-levels", "Fractions", [p("Fiche de mathématiques : les fractions", "Heading1")] + worksheet_body()[1:])

    write("r-brand", "Note", [
        p("Note d'information aux familles", "Title"),
        p("Organisation de l'année", "Heading1"), p(LOREM),
        p("Les horaires", "Heading2"), p("L'école ouvre ses portes à 8 h 20 et la classe commence à 8 h 30."),
        p("La cantine", "Heading2"), p("Les menus sont affichés chaque lundi à l'entrée de l'école."),
        p("Contacts", "Heading1"), p("Le directeur reçoit sur rendez-vous le mardi après la classe."),
    ])

    write("r-translate", "Sortie", [
        p("Sortie au musée", "Title"),
        p("Le programme", "Heading1"),
        p("Nous partirons de l'école à neuf heures et nous visiterons la galerie des dinosaures."),
        p("Les élèves doivent apporter un pique-nique.", bullet=True, style="ListParagraph"),
        p("Les parents accompagnateurs sont les bienvenus.", bullet=True, style="ListParagraph"),
        p("Le retour", "Heading1"),
        p("Le car nous ramènera à l'école vers seize heures."),
    ])

    write("r-illustration", "Les dés", [
        p("Les probabilités avec des dés", "Heading1"),
        p("Lance deux dés vingt fois et note la somme obtenue à chaque lancer."),
        p("Quelle somme sort le plus souvent ? Pourquoi ?"),
    ])

    # --- everyday requests ---
    write("e-title-big-center", "Poésie", [
        p("La récitation de la semaine"), p("Apprendre la première strophe pour jeudi."), p(LOREM)])

    write("e-list-table-header", "Résultats", [
        p("Résultats de la dictée", "Heading1"),
        p("Lucas – 14/20 – Très bien", bullet=True, style="ListParagraph"),
        p("Emma – 17/20 – Excellent", bullet=True, style="ListParagraph"),
        p("Noah – 11/20 – Assez bien", bullet=True, style="ListParagraph"),
        p("Chloé – 15/20 – Très bien", bullet=True, style="ListParagraph"),
        p("Prochaine dictée lundi."),
    ])

    write("e-number-exercises", "Fractions", worksheet_body('<w:b/><w:sz w:val="32"/>'))
    write("e-heading2-exercises", "Fractions", worksheet_body('<w:b/><w:sz w:val="32"/>'))

    write("e-margin-2cm", "Lettre", [p("Lettre aux parents", "Heading1"), p(LOREM), p(LOREM)])
    write("e-date-top-right", "Lettre", [p("Chers parents,"), p(LOREM), p("L'équipe enseignante")])
    sp = '<w:spacing w:after="360"/>'
    write("e-reduce-spacing", "Compte rendu", [p("Compte rendu du conseil d'école", "Heading1")] + [p(LOREM, ppr=sp) for _ in range(5)])
    write("e-fix-spelling", "Sortie", [
        p("Compte rendu de la sortie", "Heading1"),
        p("Hier, les élèves sont aller au musée avec leur maitresse."),
        p("Ils on beaucoup apris sur les dinosaures et ils ont posé des question au guide."),
        p("La journée c'est très bien passée."),
    ])
    write("e-name-date-line", "Évaluation", [p("Évaluation de géographie", "Heading1"), p("1. Cite trois grands fleuves de France."), p("2. Place-les sur la carte.")])
    write("e-lines-to-bullets", "Matériel", [
        p("Liste du matériel", "Heading1"), p("Voici ce qu'il faut apporter :"),
        p("une trousse complète"), p("un cahier de brouillon"), p("une règle de 30 cm"), p("des crayons de couleur"),
        p("Merci !")])
    write("e-image-right", "Le hérisson", [
        p("Le hérisson", "Heading1"),
        p("", runs_after=picture("rId10", 1, 50, 40)),
        p("Le hérisson est un petit mammifère insectivore. Son dos est couvert de piquants qui le protègent de ses prédateurs. "
          "Il vit dans les haies, les jardins et les bois, et sort surtout la nuit pour chercher sa nourriture."),
        p("En hiver, il hiberne dans un nid de feuilles mortes."),
    ], media=[("rId10", "image1.png", png(250, 200, (150, 110, 70)))])
    write("e-landscape", "Planning", [p("Weekly planning", "Heading1"), p("Monday: reading. Tuesday: maths. Wednesday: sport.")])
    write("e-page-numbers", "Report", [p("Class report", "Heading1")] + [p("The class worked on the water cycle this term. " * 6) for _ in range(6)])
    write("e-comment", "Report", [p("History lesson", "Heading1"), p("The Gauls lived in villages of wooden houses."),
                                  p("Paris had about one hundred thousand inhabitants in the year 1200."), p("Next week we will study castles.")])
    write("e-replace-everywhere", "Classe", [
        p("Informations", "Heading1"), p("Mme Durand accueillera les enfants à 8 h 20."),
        p("Pour toute question, contactez Mme Durand par le cahier de liaison."),
        p("Mme Durand et l'équipe vous souhaitent une bonne rentrée.")])
    write("e-sort-table", "Class list", [p("Class list", "Heading1"),
                                          table([["Name", "Age", "Group"], ["Zoé", "9", "B"], ["Adam", "10", "A"], ["Mila", "9", "A"], ["Hugo", "10", "B"], ["Lina", "9", "C"]], header=True),
                                          p("Updated in September.")])
    write("e-add-header-row", "Library", [p("Library loans", "Heading1"),
                                           table([["The Little Prince", "Saint-Exupéry", "Emma"], ["Matilda", "Roald Dahl", "Noah"], ["Pinocchio", "Collodi", "Lina"]]),
                                           p("Books are due back on Friday.")])
    write("e-word-count", "Essay", [p("My holidays", "Heading1"), p("This summer I went to the seaside with my family."),
                                    p("We swam every day and built a big sand castle near the rocks.")])
    write("e-cannot-draw", "Story", [p("The lost cat", "Heading1"), p("Once upon a time, a little cat got lost in the city.")])


if __name__ == "__main__":
    main()
