#!/usr/bin/env python3
"""Generate the input documents of the AI reference tasks (eval/tasks/*/input.docx).

Standard library only (zipfile + raw WordprocessingML): python-docx is not installed on the
build machines and the inputs need precise control over styles, numbering and direct
formatting. Run from the repository root:  python3 eval/tools/make_inputs.py
"""
import os
import zipfile
from xml.sax.saxutils import escape

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tasks")

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' \
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>"""

CORE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>{title}</dc:title><dc:creator>ElixirOffice eval</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-05T00:00:00Z</dcterms:created>
</cp:coreProperties>"""


def style(sid, name, based="Normal", ppr="", rpr="", kind="paragraph", default=False, next_="Normal"):
    d = ' w:default="1"' if default else ""
    b = f'<w:basedOn w:val="{based}"/>' if based else ""
    n = f'<w:next w:val="{next_}"/>' if next_ else ""
    return (f'<w:style w:type="{kind}"{d} w:styleId="{sid}"><w:name w:val="{name}"/>{b}{n}<w:qFormat/>'
            f'<w:pPr>{ppr}</w:pPr><w:rPr>{rpr}</w:rPr></w:style>')


STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
{style("Normal", "Normal", based=None, default=True, next_=None)}
{style("Heading1", "heading 1", ppr='<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>', rpr='<w:b/><w:color w:val="2F5496"/><w:sz w:val="32"/>')}
{style("Heading2", "heading 2", ppr='<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>', rpr='<w:b/><w:color w:val="2F5496"/><w:sz w:val="26"/>')}
{style("Heading3", "heading 3", ppr='<w:keepNext/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="2"/>', rpr='<w:b/><w:color w:val="1F3763"/><w:sz w:val="24"/>')}
{style("Title", "Title", ppr='<w:spacing w:after="240"/>', rpr='<w:sz w:val="52"/>')}
{style("ListParagraph", "List Paragraph", ppr='<w:ind w:left="720"/>')}
{style("NoSpacing", "No Spacing", ppr='<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>')}
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>
</w:styles>"""

NUMBERING = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering {W}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>"""

SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>'


def para(text, style_id=None, bullet=False, rpr=""):
    ppr = ""
    if style_id:
        ppr += f'<w:pStyle w:val="{style_id}"/>'
    if bullet:
        ppr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    r = f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ""
    return f'<w:p><w:pPr>{ppr}</w:pPr>{r}</w:p>'


def write_docx(path, title, body):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {W}><w:body>{"".join(body)}{SECT}</w:body></w:document>'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/numbering.xml", NUMBERING)
        z.writestr("docProps/core.xml", CORE.format(title=escape(title)))
    print("wrote", os.path.relpath(path))


def two_columns():
    body = [
        para("Le cycle de l'eau", "Heading1"),
        para("Cette fiche accompagne la séance de sciences du jeudi. Les élèves la lisent avant l'expérience "
             "et la complètent pendant la mise en commun."),
        para("Les étapes du cycle", "Heading2"),
        para("L'évaporation : sous l'effet de la chaleur du soleil, l'eau des océans, des lacs et des rivières "
             "se transforme en vapeur et monte dans l'atmosphère."),
        para("La condensation : en altitude, l'air est plus froid. La vapeur d'eau se refroidit et forme de "
             "minuscules gouttelettes qui composent les nuages."),
        para("Les précipitations : quand les gouttelettes deviennent trop lourdes, elles tombent sous forme "
             "de pluie, de neige ou de grêle."),
        para("Le ruissellement et l'infiltration : l'eau tombée au sol rejoint les rivières ou s'infiltre "
             "dans la terre pour alimenter les nappes souterraines, puis retourne vers la mer."),
        para("À retenir", "Heading2"),
        para("L'eau ne disparaît pas : elle change d'état et circule en permanence entre la mer, l'air et la terre."),
        para("Pour la prochaine séance, apporter un bocal en verre et une assiette."),
    ]
    write_docx(os.path.join(ROOT, "two-columns", "input.docx"), "Le cycle de l'eau", body)


def list_to_table():
    body = [
        para("Sortie au musée : répartition des groupes", "Heading1"),
        para("Chaque accompagnateur encadre un groupe. Merci de vérifier votre salle de départ."),
        para("Mme Martin – Groupe A – Salle 12", bullet=True, style_id="ListParagraph"),
        para("M. Dubois – Groupe B – Salle 14", bullet=True, style_id="ListParagraph"),
        para("Mme Leroy – Groupe C – Salle 3", bullet=True, style_id="ListParagraph"),
        para("M. Moreau – Groupe D – Gymnase", bullet=True, style_id="ListParagraph"),
        para("Mme Petit – Groupe E – CDI", bullet=True, style_id="ListParagraph"),
        para("Départ du car à 8 h 30 devant l'entrée principale."),
    ]
    write_docx(os.path.join(ROOT, "list-to-table", "input.docx"), "Sortie au musée", body)


def cleanup():
    big_bold = '<w:b/><w:sz w:val="32"/>'
    mid_bold = '<w:b/><w:i/><w:sz w:val="26"/>'
    body = [
        para("Rapport d'activité 2025", rpr='<w:b/><w:sz w:val="44"/>'),
        para("Association Les Jardins Partagés du quartier Saint-Michel"),
        para("1. Présentation", rpr=big_bold),
        para("L'association gère trois jardins partagés et compte 84 adhérents. Elle est animée par un bureau "
             "de cinq bénévoles et une salariée à mi-temps.", "NoSpacing"),
        para("2. Activités de l'année", rpr=big_bold),
        para("2.1 Ateliers", rpr=mid_bold),
        para("Vingt-deux ateliers ont été organisés : compostage, semis, taille des fruitiers et cuisine de saison.",
             "Heading3"),
        para("2.2 Accueil des écoles", rpr=mid_bold),
        para("Quatre classes de l'école Jean-Moulin sont venues chaque mois entre mars et juin.",
             rpr='<w:rFonts w:ascii="Comic Sans MS" w:hAnsi="Comic Sans MS"/><w:sz w:val="24"/>'),
        para("3. Finances", rpr=big_bold),
        para("Le budget s'élève à 18 400 euros, financé à 60 % par les cotisations et à 40 % par la ville.",
             "ListParagraph"),
        para("4. Perspectives", rpr=big_bold),
        para("Ouvrir un quatrième jardin au printemps et créer un groupe de bénévoles dédié à l'arrosage d'été.",
             "NoSpacing"),
    ]
    write_docx(os.path.join(ROOT, "cleanup", "input.docx"), "Rapport d'activité 2025", body)


if __name__ == "__main__":
    two_columns()
    list_to_table()
    cleanup()
