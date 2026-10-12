# -*- coding: utf-8 -*-
# SPDX-License-Identifier: AGPL-3.0-only
"""Teacher worksheets (original, fictional content)."""
from ooxml import *  # noqa

IMG = None  # images folder, set by build.py


def I(name):
    return '%s/%s' % (IMG, name)


W18 = cm(18)  # usable width with 1.5 cm margins


# ---------------------------------------------------------------------------
def t01():
    d = Doc('Les fractions – CM1', styles=dict(body_font='Andika', body_sz=12, after=120, line=264,
                                               title=dict(font='Cursive standard', sz=30, color='1F4E79', jc='center')),
            subject='Mathématiques CM1', keywords='fractions; CM1; fiche élève')
    n = d.numbering
    ex = n.decimal(fmts=[('decimal', 'Exercice %1 :'), ('lowerLetter', '%2)'), ('decimal', '%3.')],
                   indent=0, hanging=0, bold=True, color='C00000')
    sub = n.decimal(fmts=[('lowerLetter', '%1)')], indent=720, hanging=360)
    dr = d.draw

    def hdr(part):
        return (P(R('Prénom : ', b=True) + R('\t') + R('    Date : ', b=True) + R('\t'),
                  style='En-tte', tabs=[(cm(9), 'left', 'underscore'), (W18, 'right', 'underscore')], sa=60) +
                P(R('CM1 – Mathématiques – Nombres et calculs', sz=9, color='7F7F7F') + R('\t') +
                  R('Fiche n° 12', sz=9, color='7F7F7F', b=True),
                  style='En-tte', tabs=[(W18, 'right')],
                  bdr=pbdr(bottom=('single', 6, 4, '1F4E79'))))

    def ftr(part):
        return P(R('École élémentaire des Tilleuls – année 2025-2026', sz=8, color='7F7F7F') + R('\t') +
                 R('Page ', sz=8) + FLD('PAGE', '1', sz=8) + R(' / ', sz=8) + FLD('NUMPAGES', '2', sz=8),
                 style='Pieddepage', tabs=[(W18, 'right')])

    h = d.header(hdr)
    f = d.footer(ftr)
    d.final_sect = SECT(margins=(cm(2.3), cm(1.5), cm(1.6), cm(1.5), cm(0.8), cm(0.7), 0),
                        headers={'default': h}, footers={'default': f})
    rid34 = d.img(I('pie_3_4.png'))
    d.add(P('Les fractions', style='Titre', bdr=pbdr(bottom=('single', 12, 6, 'F4B183'))))
    # "To remember" box with a floating image
    d.add(P(dr.anchor(rid34, 3.2, 3.2, x=14.6, y=0.1, relH='margin', relV='paragraph', wrap='tight',
                      polygon=octagon_polygon(), name='Disque', descr='Disque partagé en 4, 3 parts colorées') +
            R('À retenir', b=True, sz=14, color='C55A11'),
            sb=240, sa=60, ind_right=cm(4), bdr=pbdr(box=('single', 8, 4, 'C55A11')), shd='FFF2CC', keepNext=True))
    d.add(P(md('Une fraction sert à exprimer un **partage en parts égales**. Dans la fraction ') +
            OMATH(MF('3', '4')) + md(', le nombre du bas (**4**) est le ') + R('dénominateur', b=True, color='2E75B6') +
            md(' : il indique en combien de parts égales on a partagé l’unité. Le nombre du haut (**3**) est le ') +
            R('numérateur', b=True, color='C00000') + md(' : il indique combien de parts on a prises.'),
            ind_right=cm(4), bdr=pbdr(box=('single', 8, 4, 'C55A11')), shd='FFF2CC', sa=0))
    d.add(P(md('On lit : « trois quarts ». ') + OMATH(MF('1', '2')) + R(' se lit « un demi », ') +
            OMATH(MF('1', '3')) + R(' « un tiers », ') + OMATH(MF('5', '8')) + R(' « cinq huitièmes ».'),
            ind_right=cm(4), bdr=pbdr(box=('single', 8, 4, 'C55A11')), shd='FFF2CC', sa=240))
    # exercise 1: image table
    d.add(P('Écris la fraction qui correspond à la partie colorée.', numId=ex, keepNext=True))
    cells = []
    answers = []
    for name, ans in (('pie_1_2.png', '1/2'), ('pie_1_4.png', '1/4'), ('pie_2_3.png', '2/3'), ('pie_3_8.png', '3/8')):
        rid = d.img(I(name))
        cells.append(C(P(dr.inline(rid, 3.0, 3.0, name='Disque'), jc='center', sa=0), valign='center'))
        answers.append(C(P(R('……') + R(' / ', b=True) + R('……') +
                           R('  (corrigé : %s)' % ans, vanish=True, color='C00000', i=True), jc='center', sa=0)))
    d.add(TBL([TROW(cells, height=cm(3.5), rule='exact'), TROW(answers, height=cm(1))], [cm(4.5)] * 4,
              borders='all', bcolor='A6A6A6', jc='center'))
    d.add(P('', sa=120))
    # exercise 2: colouring
    d.add(P(md('Colorie la fraction demandée de chaque bande.'), numId=ex, keepNext=True))
    for (num, den) in (('5', '6'), ('2', '5'), ('3', '4')):
        k = int(den)
        d.add(TBL([TROW([C(P(OMATH(MF(num, den)), jc='center', sa=0), valign='center',
                           borders={'top': 'nil', 'left': 'nil', 'bottom': 'nil'})] +
                        [C('', shd=None) for _ in range(k)], height=cm(1.1), rule='exact')],
                  [cm(2)] + [int(cm(14) / k)] * k, borders='all', bsz=12, bcolor='404040'))
        d.add(P('', sa=60, line=200))
    # exercise 3: ordering
    d.add(P('Range ces fractions de la plus petite à la plus grande.', numId=ex, keepNext=True))
    d.add(P(OMATH(MF('3', '4')) + R('    ') + OMATH(MF('1', '4')) + R('    ') + OMATH(MF('4', '4')) + R('    ') +
            OMATH(MF('2', '4')) + R('    ') + OMATH(MF('0', '4')), jc='center', sa=120))
    d.add(P(R('\t') + R(' < ', b=True) + R('\t') + R(' < ', b=True) + R('\t') + R(' < ', b=True) + R('\t') +
            R(' < ', b=True) + R('\t'),
            tabs=[(cm(3.2), 'left', 'dot'), (cm(6.9), 'left', 'dot'), (cm(10.6), 'left', 'dot'),
                  (cm(14.3), 'left', 'dot'), (W18, 'left', 'dot')], sa=240))
    # exercise 4: problem (multi-level list)
    d.add(P('Problème', numId=ex, keepNext=True, pageBreakBefore=True))
    d.add(P(md('Pour son anniversaire, Léa partage une pizza en **8 parts égales**. Elle mange 3 parts, '
               'son frère Tom en mange 2 et ses parents se partagent le reste.')))
    for q_ in ('Quelle fraction de la pizza Léa a-t-elle mangée ?',
               'Quelle fraction de la pizza Tom a-t-il mangée ?',
               'Quelle fraction reste-t-il pour les parents ?',
               'Qui a mangé le plus : Léa ou ses parents ? Justifie.'):
        d.add(P(q_, numId=sub, sa=40))
        d.add(P(R('\t'), tabs=[(W18, 'left', 'dot')], ind_left=720, sa=80))
    # challenge: bubble + floating band
    rbar = d.img(I('bar_2_5.png'))
    bubble = (P(R('Défi du jour', b=True, color='FFFFFF', sz=13), jc='center', sa=60) +
              P(md('Paul dit : « ') + OMATH(MF('1', '2')) + md(' est plus grand que ') + OMATH(MF('1', '3')) +
                md(' parce que 2 est plus petit que 3. » A-t-il **raison** ou **tort** ? Utilise la bande pour '
                   'expliquer.', color='FFFFFF'), sa=0, color='FFFFFF'))
    d.add(P(dr.shape(10.0, 4.6, x=0, y=0.3, relH='margin', relV='paragraph', geom='wedgeRoundRectCallout',
                     fill='2E75B6', line='1F4E79', line_w=1.5, text=bubble, wrap='square',
                     adj=[('adj1', -20833), ('adj2', 72000), ('adj3', 16667)]) +
            dr.anchor(rbar, 6.5, 1.0, x=11.0, y=1.4, relH='margin', relV='paragraph', wrap='square',
                      name='Bande', descr='Bande partagée en 5'), sb=240, sa=0))
    for _ in range(6):
        d.add(P(''))
    # self-assessment
    d.add(P('Je m’évalue', b=True, sz=14, color='C55A11', sb=240, keepNext=True))
    rows = [TROW([C('Je sais…', b=True, shd='FBE5D6'), C(P(SYM('F04A', sz=22, color='00B050'), jc='center', sa=0), shd='FBE5D6'),
                  C(P(SYM('F04B', sz=22, color='FFC000'), jc='center', sa=0), shd='FBE5D6'),
                  C(P(SYM('F04C', sz=22, color='FF0000'), jc='center', sa=0), shd='FBE5D6')], header=True)]
    for s in ('lire et écrire une fraction simple', 'reconnaître le numérateur et le dénominateur',
              'colorier une fraction d’une figure', 'comparer des fractions de même dénominateur'):
        rows.append(TROW([C(s), C(''), C(''), C('')], height=cm(0.9)))
    d.add(TBL(rows, [cm(11.4), cm(2.2), cm(2.2), cm(2.2)], bcolor='A6A6A6'))
    d.add(P(R('Observation de l’enseignant(e) : ', i=True) + R('\t'), tabs=[(W18, 'left', 'dot')], sb=200))
    d.add(P(R('\t'), tabs=[(W18, 'left', 'dot')]))
    return d, dict(pages=2, features='en-tête/pied (PAGE, NUMPAGES); tabulations points de suite et soulignées; '
                   'OMML fractions inline; image flottante habillage serré (wrapPolygon); encadré bordure+trame '
                   'paragraphe; liste numérotée personnalisée "Exercice %1"; sous-liste a); images inline dans '
                   'tableau; hauteurs de ligne exactes; texte masqué (corrigé); bulle wps wedgeRoundRectCallout '
                   'avec OMML; symboles Wingdings (smileys); saut de page avant; polices Andika et Cursive standard',
                   notes='Polices scolaires absentes des postes standard : test de substitution.')


# ---------------------------------------------------------------------------
def t02():
    d = Doc('Évaluation – Le vivant – 6e', styles=dict(body_font='Arial', body_sz=10.5, after=80, line=252,
                                                     h={1: dict(font='Arial', sz=12, color='000000', b=True,
                                                                sb=200, sa=80,
                                                                pextra=pbdr(bottom=('single', 6, 1, '000000')))}),
            subject='SVT 6e', keywords='évaluation; grille; compétences')
    dr = d.draw
    logo = d.img(I('logo_ecole.png'))
    W = cm(18)

    def ftr(part):
        return P(R('Évaluation – Le vivant et son évolution – Séquence 3', sz=8, i=True) + R('\t') +
                 FLDSIMPLE('PAGE', '1', sz=8) + R('/', sz=8) + FLDSIMPLE('NUMPAGES', '2', sz=8),
                 style='Pieddepage', tabs=[(W, 'right')])
    f = d.footer(ftr)
    d.final_sect = SECT(kind='continuous', margins=(cm(1.5), cm(1.5), cm(1.5), cm(1.5), cm(0.7), cm(0.7), 0),
                        footers={'default': f})
    # header as a table
    d.add(TBL([TROW([C(P(dr.inline(logo, 1.8, 1.8, name='Logo'), jc='center', sa=0), vmerge='restart', valign='center'),
                     C([P('Collège des Trois-Rivières', b=True, sz=12, sa=0), P('Sciences et technologie – 6e B', sa=0)],
                       valign='center'),
                     C([P('NOTE', b=True, jc='center', sa=0), P('/ 20', b=True, sz=20, jc='center', sa=0)],
                       vmerge='restart', valign='center',
                       borders={'top': ('single', 18, 'C00000'), 'left': ('single', 18, 'C00000'),
                                'bottom': ('single', 18, 'C00000'), 'right': ('single', 18, 'C00000')})]),
               TROW([C('', vmerge='continue'),
                     C(P(R('Nom : ', b=True) + R('\t') + R('  Prénom : ', b=True) + R('\t'),
                         tabs=[(cm(5.5), 'left', 'dot'), (cm(11.3), 'left', 'dot')], sa=0)),
                     C('', vmerge='continue')], height=cm(0.9))],
              [cm(2.4), cm(11.8), cm(3.8)], borders='all', bcolor='7F7F7F'))
    d.add(P('Évaluation : les besoins des plantes vertes', b=True, sz=16, jc='center', sb=200, sa=40))
    d.add(P('Durée : 45 minutes – Calculatrice non autorisée – Soigne ton écriture et tes schémas.',
            i=True, jc='center', sz=9, color='595959', sa=160))
    # skills grid with vertical headers
    lv = [('Non atteint', 'F8CBAD'), ('Partiellement atteint', 'FFE699'), ('Atteint', 'C6E0B4'), ('Dépassé', 'BDD7EE')]
    head = TROW([C(P('Domaine', b=True, sa=0), valign='bottom', shd='D9D9D9'),
                 C(P('Compétence évaluée', b=True, sa=0), valign='bottom', shd='D9D9D9'),
                 C(P('Exercice', b=True, sa=0, jc='center'), valign='bottom', shd='D9D9D9', textDir='btLr')] +
                [C(P(t, b=True, sz=8, sa=0), shd=c, textDir='btLr', valign='center') for t, c in lv],
                height=cm(2.6), rule='exact', header=True)
    box = lambda: C(P(SYM('F0A8', sz=14), jc='center', sa=0), valign='center')
    rows = [head]
    data = [('Pratiquer des démarches scientifiques', ['Formuler une hypothèse', 'Interpréter un résultat'], ['3', '3']),
            ('Concevoir, créer, réaliser', ['Légender un schéma'], ['1']),
            ('S’approprier des outils et des méthodes', ['Lire un tableau de mesures', 'Utiliser le vocabulaire'], ['2', '1, 2']),
            ('Pratiquer des langages', ['Rédiger une explication'], ['3'])]
    for dom, comps, exs in data:
        for k, (cp, exn) in enumerate(zip(comps, exs)):
            rows.append(TROW([C(P(dom, sz=9, b=True, sa=0), vmerge='restart' if k == 0 else 'continue', valign='center',
                                shd='F2F2F2'),
                              C(P(cp, sa=0), valign='center'), C(P(exn, jc='center', sa=0), valign='center'),
                              box(), box(), box(), box()], height=cm(0.8)))
    d.add(TBL(rows, [cm(4.4), cm(7.6), cm(1.4)] + [cm(1.15)] * 4, bcolor='7F7F7F'))
    # exercise 1: diagram to label (image + floating labels + arrows)
    plant = d.img(I('plante.png'))
    d.add(P(R('Exercice 1 – Légende le schéma') + R('\t') + R('… / 4', b=True), style='Titre1',
            tabs=[(W, 'right', 'dot')]))
    d.add(P('Complète les étiquettes avec les mots : fleur, feuille, tige, racines, pot, terre.', sa=60))
    labels = ''
    for k, (yy, side) in enumerate(((0.6, 'r'), (2.6, 'l'), (3.6, 'r'), (5.4, 'r'), (6.2, 'l'))):
        x = 10.8 if side == 'r' else 0.0
        labels += dr.shape(3.6, 0.8, x=x, y=yy, relH='margin', relV='paragraph', fill='FFFFFF', line='2E75B6',
                           line_w=1, text=P(R('……………………'), jc='center', sa=0), wrap='none',
                           ins=(0.1, 0.05, 0.1, 0.05))
        ax = 10.0 if side == 'r' else 3.6
        labels += dr.shape(1.0 if side == 'r' else 1.3, 0.01, x=ax - (0.2 if side == 'r' else 0), y=yy + 0.4,
                           relH='margin', relV='paragraph', geom='straightConnector1', fill=None, line='2E75B6',
                           line_w=1.25, arrow='triangle', flipH=(side == 'r'), wrap='none')
    d.add(P(dr.anchor(plant, 5.0, 6.0, x=5.4, y=0.2, relH='margin', relV='paragraph', wrap='topAndBottom',
                      name='Schéma plante', descr='Plante en pot') + labels, sa=0))
    d.add(P('', sa=0))
    # exercise 2: two-column multiple choice
    d.add(P(R('Exercice 2 – Questionnaire') + R('\t') + R('… / 6', b=True), style='Titre1',
            tabs=[(W, 'right', 'dot')]))
    d.add(SECTBREAK(SECT(margins=(cm(1.5), cm(1.5), cm(1.5), cm(1.5), cm(0.7), cm(0.7), 0), footers={'default': f}),
                    sa=0, line=120))
    qs = [('De quoi une plante verte a-t-elle besoin pour fabriquer sa matière ?',
           ['de lumière', 'de sucre', 'd’eau et de sels minéraux', 'de terre uniquement']),
          ('Par quel organe la plante absorbe-t-elle l’eau ?', ['les feuilles', 'les racines', 'la fleur']),
          ('Une plante placée dans le noir pendant 15 jours…', ['pousse plus vite', 'jaunit', 'reste identique']),
          ('Le gaz rejeté par la plante à la lumière est…', ['le dioxygène', 'le dioxyde de carbone', 'l’azote'])]
    for k, (qq, opts) in enumerate(qs):
        d.add(P(R('%d. ' % (k + 1), b=True) + R(qq, b=True), sa=40, keepNext=True))
        for o in opts:
            d.add(P(SYM('F0A8', sz=12) + R('  ' + o), ind_left=cm(0.5), sa=20))
        d.add(P('', sa=60))
    d.add(SECTBREAK(SECT(kind='continuous', cols=(2, cm(1), True),
                         margins=(cm(1.5), cm(1.5), cm(1.5), cm(1.5), cm(0.7), cm(0.7), 0), footers={'default': f}),
                    sa=0))
    # exercise 3: writing
    d.add(P(R('Exercice 3 – J’explique') + R('\t') + R('… / 10', b=True), style='Titre1',
            tabs=[(W, 'right', 'dot')]))
    d.add(PM('Kenza a semé des graines de haricot dans trois pots. Elle les arrose tous de la même façon. Le pot **A** '
             'est placé près de la fenêtre, le pot **B** dans un placard fermé, le pot **C** dans le réfrigérateur. '
             'Voici ses mesures après 10 jours :'))
    d.add(TBL([TROW([C(P(t, b=True, jc='center', sa=0), shd='DEEAF6') for t in ('Pot', 'Lieu', 'Hauteur (cm)', 'Couleur des feuilles')], header=True),
               TROW([C(P(x, jc='center', sa=0)) for x in ('A', 'fenêtre', '12,5', 'vert foncé')]),
               TROW([C(P(x, jc='center', sa=0)) for x in ('B', 'placard', '15,0', 'jaune pâle')]),
               TROW([C(P(x, jc='center', sa=0)) for x in ('C', 'réfrigérateur', '1,2', 'vert')])],
              [cm(2), cm(5), cm(4), cm(5)], jc='center', bcolor='7F7F7F'))
    for qq in ('a) Quelle hypothèse Kenza voulait-elle tester ?',
               'b) Le pot B est le plus grand : peut-on dire qu’il est en meilleure santé ? Explique.',
               'c) Quelle conclusion peux-tu tirer de cette expérience ?'):
        d.add(P(qq, b=True, sb=120, sa=40, keepNext=True))
        for _ in range(3):
            d.add(P(R('\t'), tabs=[(W, 'left', 'dot')], sa=0, line=420, rule='exact'))
    d.add(P(R('Appréciation : ', b=True, i=True) + R('\t'), tabs=[(W, 'left', 'underscore')], sb=240,
            bdr=pbdr(box=('dashed', 4, 6, '7F7F7F'))))
    return d, dict(pages=2, features='en-tête en tableau (logo, fusion verticale, bordures épaisses de cellule); '
                   'grille de compétences: texte vertical btLr, vMerge, trames de cellules, cases Wingdings, ligne '
                   'd’en-tête répétée; image avec habillage haut/bas + étiquettes wps et connecteurs flèches '
                   'superposés; section continue 2 colonnes avec séparateur; tabulation droite points de suite '
                   '(barème); lignes d’écriture à interligne exact; champs fldSimple PAGE/NUMPAGES; bordure tiretée')


# ---------------------------------------------------------------------------
def t03():
    d = Doc('Affiche – Les règles de la classe', styles=dict(body_font='Comic Sans MS', body_sz=14, after=0, line=240),
            subject='Affichage de classe', keywords='affiche; règles de vie; cycle 2')
    dr = d.draw
    W3, H3 = A3
    d.final_sect = SECT(size=A3, margins=(cm(1.5), cm(1.5), cm(1.5), cm(1.5), cm(0.7), cm(0.7), 0),
                        pgBorders=page_borders('pencils', 24, 20, 'auto', offset='page'))
    w14 = ('<w14:shadow w14:blurRad="38100" w14:dist="38100" w14:dir="2700000" w14:sx="100000" w14:sy="100000" '
           'w14:kx="0" w14:ky="0" w14:algn="tl"><w14:srgbClr w14:val="000000"><w14:alpha w14:val="60000"/>'
           '</w14:srgbClr></w14:shadow><w14:textOutline w14:w="19050" w14:cap="flat" w14:cmpd="sng" '
           'w14:algn="ctr"><w14:solidFill><w14:srgbClr w14:val="1F3864"/></w14:solidFill><w14:prstDash '
           'w14:val="solid"/><w14:round/></w14:textOutline><w14:textFill><w14:gradFill><w14:gsLst>'
           '<w14:gs w14:pos="0"><w14:srgbClr w14:val="FFC000"/></w14:gs><w14:gs w14:pos="100000">'
           '<w14:srgbClr w14:val="FF0000"/></w14:gs></w14:gsLst><w14:lin w14:ang="5400000" w14:scaled="0"/>'
           '</w14:gradFill></w14:textFill>')
    d.add(P(R('Les règles de la classe', font='Belle Allure CM', sz=44, b=True, w14=w14), jc='center', sb=500, sa=200))
    d.add(P(R('CP – CE1 · Classe de Mme Rivière · 2025-2026', font='Comic Sans MS', sz=20, color='595959'),
            jc='center', sa=400))
    rules = [('main', 'Je lève le doigt pour prendre la parole.', 'DEEBF7', '2E75B6'),
             ('oreille', 'J’écoute quand quelqu’un parle.', 'E2F0D9', '548235'),
             ('bulle', 'Je parle doucement dans la classe.', 'FFF2CC', 'BF8F00'),
             ('coeur', 'Je respecte mes camarades et les adultes.', 'FBE5D6', 'C55A11'),
             ('rangement', 'Je range mon matériel après l’activité.', 'EDE2F6', '7030A0'),
             ('livre', 'Je prends soin des livres et du matériel.', 'DAEEF3', '31849B')]
    shapes = ''
    for k, (pic, txt, fill, line) in enumerate(rules):
        rid = d.img(I('picto_%s.png' % pic))
        col, row = k % 2, k // 2
        x = 1.6 + col * 13.4
        y = 9.0 + row * 9.4
        inner = (P(dr.inline(rid, 3.2, 3.2, name='Picto'), jc='center', sb=120, sa=120) +
                 P(R(txt, font='Comic Sans MS', sz=26, b=True, color=line), jc='center', sa=0))
        shapes += dr.shape(12.4, 8.4, x=x, y=y, relH='page', relV='page', geom='roundRect', fill=fill, line=line,
                           line_w=4.5, text=inner, wrap='none', anchor='ctr', adj=[('adj', 12000)], shadow=True)
        shapes += dr.shape(2.0, 2.0, x=x - 0.4, y=y - 0.5, relH='page', relV='page', geom='ellipse', fill=line,
                           line='FFFFFF', line_w=2, text=P(R(str(k + 1), font='Arial Black', sz=28, color='FFFFFF'),
                                                            jc='center', sa=0),
                           wrap='none', anchor='ctr', ins=(0, 0, 0, 0))
    shapes += dr.shape(25.0, 3.2, x=2.35, y=37.6, relH='page', relV='page', geom='ribbon2', fill='FFD966',
                       line='BF8F00', line_w=2, text=P(R('Ensemble, on apprend mieux !', font='Belle Allure CM',
                                                         sz=22, b=True, color='7F6000'), jc='center', sa=0),
                       wrap='none', anchor='ctr', ins=(0.2, 0.1, 0.2, 0.1))
    shapes += dr.shape(3.4, 3.4, x=24.0, y=3.0, relH='page', relV='page', geom='star5', fill='FFC000', line='C00000',
                       line_w=1.5, wrap='none', rot=15, text=None)
    shapes += dr.shape(2.4, 2.4, x=2.0, y=2.6, relH='page', relV='page', geom='sun', fill='FFE699', line='BF8F00',
                       line_w=1, wrap='none', text=None)
    d.add(P(shapes, sa=0))
    return d, dict(pages=1, features='format A3; bordure de page artistique (pencils); titre WordArt w14 '
                   '(dégradé, contour, ombre) en Belle Allure; 6 formes wps roundRect positionnées par rapport à la '
                   'page avec ombre et image inline DANS la zone de texte; pastilles ellipse; ruban ribbon2; étoile '
                   'pivotée; soleil; Comic Sans MS / Arial Black',
                   notes='Affiche entièrement composée d’objets flottants ancrés au dernier paragraphe.')


# ---------------------------------------------------------------------------
def t04():
    d = Doc('Séquence – La Révolution française – CM2',
            styles=dict(body_sz=11, h={1: dict(sz=14, color='833C0B', sb=240, sa=80),
                                       2: dict(sz=12, color='C55A11', sb=160, sa=40)}),
            subject='Histoire CM2', keywords='séquence; préparation; cycle 3')
    n = d.numbering
    chk = n.bullet('check', color='548235')
    bul = n.bullet('disc', indent=284, hanging=284)
    num = n.decimal()
    PW = cm(17)
    LW = cm(25.7)

    def hdr_first(part):
        return P(R('Document de préparation – à usage de l’enseignant', sz=8, i=True, color='7F7F7F'), style='En-tte',
                 jc='right')

    def hdr(width):
        def b(part):
            return P(R('Histoire – CM2 – Période 3', sz=9, color='833C0B', b=True) + R('\t') +
                     R('Séquence : La Révolution française et l’Empire', sz=9, color='833C0B'),
                     style='En-tte', tabs=[(width, 'right')], bdr=pbdr(bottom=('single', 4, 1, '833C0B')))
        return b

    def ftr(width):
        def b(part):
            return P(R('École élémentaire des Tilleuls', sz=8) + R('\t') + FLD('PAGE', '1', sz=8),
                     style='Pieddepage', tabs=[(width, 'right')])
        return b
    hf = d.header(hdr_first)
    hp = d.header(hdr(PW))
    hl = d.header(hdr(LW))
    fp = d.footer(ftr(PW))
    fl = d.footer(ftr(LW))
    mP = (cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0)
    mL = (cm(2), cm(2), cm(1.8), cm(2), cm(1), cm(0.9), 0)
    d.add(P('La Révolution française et l’Empire', style='Titre'))
    d.add(P('Séquence d’histoire – Cycle 3 – CM2', style='Sous-titre'))
    d.add(TBL([TROW([C('Thème', b=True, shd='FBE4D5'), C('Le temps de la Révolution et de l’Empire (thème 2 du programme de CM2)')]),
               TROW([C('Durée', b=True, shd='FBE4D5'), C('6 séances de 45 minutes à 1 heure, de janvier à février')]),
               TROW([C('Prérequis', b=True, shd='FBE4D5'), C('Louis XIV et la monarchie absolue ; lecture d’une frise chronologique')]),
               TROW([C('Matériel', b=True, shd='FBE4D5'), C('Frise de classe, vidéoprojecteur, corpus documentaire (gravures, extraits de textes), cahier d’histoire')])],
              [cm(3.2), cm(13.8)], bcolor='F4B183'))
    d.add(P('Objectifs et compétences', style='Titre1'))
    d.add(SECTBREAK(SECT(margins=mP, headers={'default': hp, 'first': hf}, footers={'default': fp, 'first': fp},
                         titlePg=True), sa=0))
    d.add(P('Objectifs de connaissance', style='Titre2'))
    for t in ('Connaître quelques dates clés : 1789, 1792, 1799, 1804, 1815.',
              'Comprendre le passage d’une monarchie absolue à une république.',
              'Identifier quelques acquis durables : Déclaration des droits de l’homme, Code civil, départements, système métrique.',
              'Connaître le rôle de quelques acteurs : les députés du tiers état, le peuple de Paris, Napoléon Bonaparte.'):
        d.add(P(t, numId=chk, sa=60))
    d.add(P('Compétences travaillées', style='Titre2', pageBreakBefore=False))
    for t in ('Se repérer dans le temps : construire des repères historiques.',
              'Comprendre un document : identifier sa nature, son auteur, sa date.',
              'Pratiquer différents langages : écrire pour structurer sa pensée.',
              'Coopérer et mutualiser : travail en groupes sur un corpus.'):
        d.add(P(t, numId=chk, sa=60))
    d.add(P(md('*Liens avec l’EMC : les symboles de la République (devise, drapeau, Marianne, hymne).*'), sb=120))
    d.add(SECTBREAK(SECT(kind='continuous', cols=(2, cm(1.2), True), margins=mP,
                         headers={'default': hp}, footers={'default': fp}), sa=0))
    d.add(P('Déroulement de la séquence', style='Titre1'))
    d.add(P('Le tableau ci-dessous détaille chaque séance (voir pages suivantes, en orientation paysage).', sa=0))
    d.add(SECTBREAK(SECT(kind='continuous', margins=mP, headers={'default': hp}, footers={'default': fp}), sa=0))
    # landscape table
    hdrrow = TROW([C(P(t, b=True, color='FFFFFF', sa=0, jc='center'), shd='833C0B', valign='center') for t in
                   ('Séance', 'Objectifs', 'Déroulement', 'Matériel', 'Durée', 'Évaluation / trace')],
                  header=True, height=cm(0.9))
    seances = [
        ('1. La France avant 1789', 'Découvrir l’organisation de la société d’Ancien Régime (trois ordres).',
         ['Rappel : Louis XIV et la monarchie absolue (5 min).', 'Observation de la caricature « Le tiers état portant le clergé et la noblesse » : description guidée.',
          'Travail en binômes : compléter un schéma de la pyramide sociale.', 'Mise en commun et formulation d’une phrase de synthèse.'],
         'Caricature vidéoprojetée ; schéma à compléter', '50 min', 'Schéma collé dans le cahier'),
        ('2. 1789 : la Révolution commence', 'Comprendre les causes et les premiers événements.',
         ['Lecture d’un récit : les États généraux, le serment du Jeu de paume, la prise de la Bastille.', 'Questionnaire de compréhension en autonomie.',
          'Construction collective d’une mini-frise : mai – août 1789.'], 'Récit photocopié ; frise vierge', '55 min', 'Questionnaire corrigé'),
        ('3. Les droits de l’homme', 'Étudier un texte fondateur et en dégager les idées principales.',
         ['Lecture à voix haute de quatre articles de la Déclaration de 1789.', 'Reformulation en groupes, un article par groupe.',
          'Débat : « Ces droits sont-ils respectés aujourd’hui ? » (lien EMC).'], 'Extraits de la Déclaration ; affiches', '1 h', 'Affiche de groupe'),
        ('4. La fin de la monarchie', 'Comprendre le passage à la République (1792) et la période de la Terreur.',
         ['Étude d’une chronologie : fuite à Varennes, 10 août 1792, proclamation de la République.', 'Analyse d’une gravure de l’exécution de Louis XVI : nature, date, point de vue.',
          'Trace écrite dictée à l’adulte.'], 'Chronologie ; gravure', '50 min', 'Trace écrite'),
        ('5. Napoléon Bonaparte', 'Identifier les grandes étapes du parcours de Napoléon et ses réformes.',
         ['Visionnage d’un extrait vidéo (4 min) puis questions orales.', 'Lecture documentaire en groupes : le Code civil, les lycées, les préfets, le franc germinal.',
          'Chaque groupe présente « sa » réforme en une phrase.', 'Placement des dates 1799, 1804, 1815 sur la frise de classe.'],
         'Vidéo ; fiches documentaires', '1 h', 'Présentation orale'),
        ('6. Évaluation', 'Réinvestir les connaissances de la séquence.',
         ['Évaluation écrite : frise à compléter, vocabulaire, question rédigée.', 'Auto-évaluation avec la grille de compétences.'],
         'Évaluation photocopiée', '45 min', 'Évaluation sommative'),
    ]
    rows = [hdrrow]
    for s, o, steps, mat, du, ev in seances:
        rows.append(TROW([C(P(s, b=True, color='833C0B', sa=0), shd='FBE4D5'), C(P(o, sa=0)),
                          C([P(st, numId=bul, sa=40) for st in steps]), C(P(mat, sa=0, i=True)),
                          C(P(du, jc='center', sa=0), valign='center'), C(P(ev, sa=0))], cantSplit=True))
    d.add(TBL(rows, [cm(3.2), cm(4.4), cm(9.2), cm(3.6), cm(1.6), cm(3.7)], bcolor='C55A11'))
    d.add(SECTBREAK(SECT(landscape=True, margins=mL, headers={'default': hl}, footers={'default': fl}), sa=0))
    d.add(P('Trace écrite finale', style='Titre1'))
    d.add(P(md('En **1789**, les Français réunis aux États généraux réclament des changements. Le 14 juillet, le peuple '
               'de Paris prend la Bastille. En août, les députés abolissent les privilèges et adoptent la '
               '**Déclaration des droits de l’homme et du citoyen**. En **1792**, la monarchie est abolie et la '
               'République proclamée. Après des années de guerre et de troubles, le général **Napoléon Bonaparte** '
               'prend le pouvoir en **1799** puis devient empereur en **1804**. Il crée le Code civil, les lycées et '
               'les préfets. Il est vaincu à Waterloo en **1815**.'),
            bdr=pbdr(box=('double', 6, 8, '833C0B')), shd='FFF8F2', jc='both', ind_left=cm(0.4), ind_right=cm(0.4)))
    d.add(P('Différenciation', style='Titre1'))
    for t in ('Élèves en difficulté de lecture : textes enregistrés, police agrandie, frise pré-remplie.',
              'Élèves rapides : enquête sur un personnage (Olympe de Gouges, Lafayette, Robespierre).',
              'Élève allophone : lexique illustré bilingue.'):
        d.add(P(t, numId=num))
    d.add(P('Ressources', style='Titre1'))
    d.add(P(R('Programme du cycle 3 : ') + d.link('https://eduscol.education.fr/', 'eduscol.education.fr') +
            R(' (consulté le 2 janvier 2026).')))
    d.final_sect = SECT(margins=mP, headers={'default': hp}, footers={'default': fp})
    return d, dict(pages=4, features='4 sections: portrait (1re page différente) / continue 2 colonnes avec ligne '
                   'séparatrice / paysage / portrait; en-têtes différents par section (largeur adaptée au paysage); '
                   'tableau multi-pages avec ligne d’en-tête répétée et lignes insécables; listes à puces dans les '
                   'cellules; puces Wingdings colorées; liste numérotée; styles Titre/Sous-titre/Titre1/2 (thème '
                   'Calibri Light/Calibri); encadré double bordure; lien hypertexte')


# ---------------------------------------------------------------------------
def t05():
    d = Doc('Lecture adaptée – Le petit renard et la lune – CE1',
            styles=dict(body_font='OpenDyslexic', body_sz=14, after=200, line=360,
                        title=dict(font='Andika', sz=26, color='7030A0', jc='left')),
            subject='Lecture CE1 – version adaptée DYS', keywords='lecture; dyslexie; syllabes')
    dr = d.draw
    n = d.numbering
    qn = n.decimal(fmts=[('decimal', '%1.')], indent=500, hanging=500, bold=True, color='7030A0')
    d.final_sect = SECT(kind='continuous', margins=(cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0))
    d.add(P('Le petit renard et la lune', style='Titre', spacing=40))
    d.add(P(R('Lis le texte. Les syllabes sont en couleur pour t’aider.', font='Andika', i=True, sz=12, color='595959')))
    # first paragraph in coloured syllables
    runs = ''
    colors = ['C00000', '0070C0']
    k = 0
    for word in SYLLABES.split(' '):
        for sy in word.split('/'):
            runs += R(sy, color=colors[k % 2], spacing=20)
            k += 1
        runs += R(' ', spacing=20)
    pays = d.img(I('paysage3.png'))
    d.add(P(dr.anchor(pays, 5.0, 5.0, x=0, y=0, relH='margin', relV='paragraph', wrap='square', side='right',
                      name='Illustration', descr='Paysage de forêt la nuit', line=('7030A0', 2)) + runs, sa=200))
    text = [
        'Une nuit, la lune sembla toute petite, comme un ongle. Filou eut très peur : « La lune est malade ! Elle va disparaître ! »',
        'Il courut voir la vieille chouette, qui savait tout. La chouette ouvrit un œil et dit : « Ne t’inquiète pas. '
        'La lune ne disparaît pas. Chaque nuit, elle change de forme. Attends, et tu verras. »',
        'Filou attendit. Nuit après nuit, la lune devint plus ronde. Un soir, elle fut énorme et toute blanche. '
        'Filou dansa de joie au milieu de la clairière.',
    ]
    for t in text:
        d.add(P(R(t, spacing=20)))
    d.add(P(md('**Mots outils :** ', spacing=20) + R('qui   –   chaque   –   comme   –   très   –   après', b=True,
                                                       spacing=30, color='7030A0', hl='lightGray'),
            bdr=pbdr(box=('single', 12, 6, '7030A0')), sb=200))
    # vocabulary in two columns
    d.add(SECTBREAK(SECT(margins=(cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0)), sa=0))
    d.add(P('Le vocabulaire', style='Titre1'))
    d.add(SECTBREAK(SECT(kind='nextPage', margins=(cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0)), sa=0))
    voc = [('une clairière', 'un endroit sans arbres au milieu de la forêt'),
           ('une chouette', 'un oiseau de nuit aux grands yeux'),
           ('disparaître', 'ne plus se voir'),
           ('énorme', 'très très grand'),
           ('s’inquiéter', 'avoir peur qu’il arrive quelque chose de grave')]
    for w, defi in voc:
        d.add(P(R(w, b=True, color='C00000', spacing=20), sa=0, keepNext=True))
        d.add(P(R(defi, sz=12, spacing=20), sa=160))
    d.add(SECTBREAK(SECT(kind='continuous', cols=(2, cm(1.5), False),
                         margins=(cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0)), sa=0))
    # true / false questions with checkboxes (content controls)
    d.add(P('Je comprends', style='Titre1'))
    d.add(P(R('Coche la bonne case.', i=True, font='Andika', sz=12)))
    rows = [TROW([C(P('', sa=0)), C(P('Vrai', b=True, jc='center', sa=0), shd='E4DFEC'),
                  C(P('Faux', b=True, jc='center', sa=0), shd='E4DFEC')], header=True)]
    for k, s in enumerate(('Le renard s’appelle Filou.', 'La lune est malade.', 'La chouette sait beaucoup de choses.',
                           'À la fin, la lune est toute ronde.')):
        rows.append(TROW([C(P(R(s, spacing=20), sa=0), valign='center'),
                          C(P(d.sdt_check('Vrai %d' % (k + 1), sz=18), jc='center', sa=0), valign='center'),
                          C(P(d.sdt_check('Faux %d' % (k + 1), sz=18), jc='center', sa=0), valign='center')],
                         height=cm(1.3)))
    d.add(TBL(rows, [cm(11), cm(3), cm(3)], bcolor='7030A0', bsz=8))
    d.add(P('', sa=0))
    d.add(P(R('Pourquoi Filou a-t-il peur ?', spacing=20), numId=qn, sb=200))
    d.add(P(R('\t'), tabs=[(cm(17), 'left', 'underscore')], line=480, rule='exact', sa=0))
    d.add(P(R('Que lui conseille la chouette ?', spacing=20), numId=qn, sb=200))
    d.add(P(R('\t'), tabs=[(cm(17), 'left', 'underscore')], line=480, rule='exact', sa=0))
    d.add(P(dr.shape(17, 2.4, x=0, y=0.4, relH='margin', relV='paragraph', geom='rect', fill='F3EEF8', line='7030A0',
                     line_w=3, dash='sysDash',
                     text=P(R('Je relis le texte à voix haute à un camarade. Il colorie une étoile à chaque phrase bien lue : ',
                              font='Andika', sz=13) + SYM('F0AB', sz=16, color='FFC000') + SYM('F0AB', sz=16, color='FFC000') +
                            SYM('F0AB', sz=16, color='FFC000') + SYM('F0AB', sz=16, color='FFC000'), sa=0),
                     wrap='topAndBottom', anchor='ctr'), sb=200))
    return d, dict(pages=2, features='police OpenDyslexic (corps) et Andika (titres); interligne 1,5; espacement '
                   'de caractères élargi; syllabes alternées en couleur (un run par syllabe); image flottante avec '
                   'bordure, habillage côté droit seulement; surlignage gris; section page suivante puis section '
                   'continue 2 colonnes; cases à cocher contrôles de contenu w14:checkbox dans tableau; lignes '
                   'd’écriture soulignées à interligne exact; zone de texte bordure pointillée avec symboles Wingdings',
                   notes='Adaptation « dys » typique : test de substitution OpenDyslexic.')


SYLLABES = ('Il é/tait u/ne fois un pe/tit re/nard qui s’ap/pe/lait Fi/lou. Cha/que soir, il re/gar/dait '
            'la lu/ne bril/ler au-/des/sus de la fo/rêt.')


# ---------------------------------------------------------------------------
def t06():
    d = Doc('Conjugaison – Le présent des verbes du 1er groupe – CE2',
            styles=dict(body_font='Arial', body_sz=12, after=0, line=360),
            subject='Français CE2', keywords='conjugaison; présent; Seyès')
    dr = d.draw
    n = d.numbering
    ex = n.decimal(fmts=[('decimal', '%1)')], indent=360, hanging=360, bold=True)

    def hdr(part):
        rid = d.img(I('seyes.png'), part)
        return P(dr.anchor(rid, 21.0, 29.7, x=0, y=0, relH='page', relV='page', wrap='none', behind=True,
                           name='Fond Seyès', descr='Lignage Seyès'), style='En-tte')
    h = d.header(hdr)
    d.final_sect = SECT(kind='continuous', margins=(cm(2.5), cm(1.5), cm(1.5), cm(3.0), cm(0.5), cm(0.5), 0),
                        headers={'default': h})
    d.add(P(R('Le présent des verbes en -er', font='Cursive standard', sz=28, color='C00000'), jc='center', sa=120))
    d.add(P(R('Je retiens', b=True, color='FFFFFF', sz=12), shd='C00000', ind_right=cm(13), sa=120))
    d.add(P(md('Au présent, les verbes du **1er groupe** (comme *chanter*) prennent les terminaisons : '
               '**-e, -es, -e, -ons, -ez, -ent**.'), sa=120))
    # borderless conjugation table, exact heights aligned on the Seyes grid (8 mm)
    rows = []
    for pr, v, pr2, v2 in (('je', 'chant**e**', 'nous', 'chant**ons**'), ('tu', 'chant**es**', 'vous', 'chant**ez**'),
                           ('il, elle, on', 'chant**e**', 'ils, elles', 'chant**ent**')):
        rows.append(TROW([C(P(R(pr, font='Belle Allure CM', sz=18), jc='right', sa=0), valign='bottom'),
                          C(P(md(v, font='Belle Allure CM', sz=18, color='0070C0'), sa=0), valign='bottom'),
                          C(P(R(pr2, font='Belle Allure CM', sz=18), jc='right', sa=0), valign='bottom'),
                          C(P(md(v2, font='Belle Allure CM', sz=18, color='0070C0'), sa=0), valign='bottom')],
                         height=cm(0.8 * 2), rule='exact'))
    d.add(TBL(rows, [cm(3.2), cm(4.4), cm(3.2), cm(4.4)], borders='none', jc='center'))
    d.add(P(dr.shape(6.4, 3.2, x=10.8, y=0.0, relH='margin', relV='paragraph', geom='wedgeEllipseCallout',
                     fill='FFF2CC', line='BF8F00', line_w=1.25,
                     text=P(R('Coup de pouce : ', b=True, sz=10) + R('avec « nous », pense au « -ons » de « nous '
                                                                      'chantons » !', sz=10), sa=0),
                     wrap='square', anchor='ctr', adj=[('adj1', -60000), ('adj2', 40000)]) +
            R('Je m’entraîne', b=True, color='FFFFFF', sz=12), shd='0070C0', ind_right=cm(13), sb=240, sa=120))
    d.add(P(R('Exercice A – Complète avec le pronom qui convient.', b=True), sa=0))
    for s in ('… parlons trop fort.', '… regardes la télévision.', '… jouent dans la cour.', '… dessinez un château.'):
        d.add(P(R(s, font='Belle Allure CM', sz=16), numId=ex, line=454, rule='exact'))
    d.add(P(R('Exercice B – Conjugue le verbe entre parenthèses au présent.', b=True), sb=227, sa=0))
    exb = n.restart(ex)
    for s, v in (('Le chat (sauter)', 'sur le mur.'), ('Nous (préparer)', 'un gâteau.'),
                 ('Tu (chercher)', 'tes lunettes.'), ('Mes cousins (arriver)', 'demain.')):
        d.add(P(R(s + ' ', font='Belle Allure CM', sz=16) + R('\t') + R(' ' + v, font='Belle Allure CM', sz=16),
                numId=exb, tabs=[(cm(11), 'left', 'dot')], line=454, rule='exact'))
    # columns with a column break
    d.add(P(R('Exercice C – Trie les verbes : 1er groupe ou pas ?', b=True), sb=227, sa=0, keepNext=True))
    d.add(SECTBREAK(SECT(kind='continuous', margins=(cm(2.5), cm(1.5), cm(1.5), cm(3.0), cm(0.5), cm(0.5), 0),
                         headers={'default': h}), sa=0, line=240))
    d.add(P(R('aimer – finir – danser – venir – porter – prendre – crier – voir', i=True, font='Belle Allure CM',
              sz=16), jc='center', line=454, rule='exact'))
    d.add(SECTBREAK(SECT(kind='continuous', margins=(cm(2.5), cm(1.5), cm(1.5), cm(3.0), cm(0.5), cm(0.5), 0),
                         headers={'default': h}), sa=0, line=240))
    d.add(P(R('1er groupe', b=True, u='single', color='0070C0'), jc='center', line=454, rule='exact'))
    for _ in range(4):
        d.add(P(R('\t'), tabs=[(cm(7.5), 'left', 'dot')], line=454, rule='exact'))
    d.add(P(BR('column') + R('Autres verbes', b=True, u='single', color='C00000'), jc='center', line=454, rule='exact'))
    for _ in range(4):
        d.add(P(R('\t'), tabs=[(cm(7.5), 'left', 'dot')], line=454, rule='exact'))
    d.add(SECTBREAK(SECT(kind='continuous', cols=(2, cm(1)),
                         margins=(cm(2.5), cm(1.5), cm(1.5), cm(3.0), cm(0.5), cm(0.5), 0), headers={'default': h}),
                    sa=0, line=240))
    d.add(P(R('Dictée de phrases', font='Cursive standard', sz=20, color='C00000'), pageBreakBefore=True, sa=227))
    for k in range(1, 6):
        d.add(P(R('%d. ' % k, b=True) + R('\t'), tabs=[(cm(16.5), 'left', 'none')], line=908, rule='exact'))
    d.add(P(R('Je m’auto-corrige : j’ai vérifié les terminaisons ', i=True) + SYM('F0A8') + R('   les majuscules ') +
            SYM('F0A8') + R('   les points ') + SYM('F0A8'), sb=227))
    return d, dict(pages=2, features='image Seyès pleine page DERRIÈRE le texte placée dans l’en-tête (répétée '
                   'chaque page); polices Cursive standard et Belle Allure CM; tableau sans bordure à hauteurs '
                   'exactes; interligne exact aligné sur le lignage; bulle wedgeEllipseCallout; numérotation '
                   'redémarrée (lvlOverride/startOverride); sections continues 1→2 colonnes avec saut de colonne '
                   'explicite; points de suite; trames de paragraphe en bandeau (retrait droit)')


# ---------------------------------------------------------------------------
def t07():
    d = Doc('Frise chronologique – De la Préhistoire au Moyen Âge – 6e',
            styles=dict(body_font='Cambria', body_sz=11, after=80, line=259),
            subject='Histoire 6e', keywords='frise; chronologie; formes')
    dr = d.draw
    d.final_sect = SECT(landscape=True, margins=(cm(1.2), cm(1.2), cm(1.2), cm(1.2), cm(0.6), cm(0.6), 0))
    d.add(P(R('De la Préhistoire au Moyen Âge', font='Cambria', sz=26, b=True, color='1F3864'), jc='center', sa=0))
    d.add(P(R('Frise chronologique à compléter – Histoire 6e', i=True, color='595959'), jc='center', sa=120))
    # main arrow + group of periods + landmarks
    s = dr.shape(26.6, 1.6, x=1.4, y=8.2, relH='page', relV='page', geom='rightArrow', fill='D9D9D9', line='7F7F7F',
                 line_w=1, wrap='none', text=None, adj=[('adj1', 50000), ('adj2', 60000)])
    periods = [dict(x=0, y=0, w=4.2, h=1.0, geom='rect', fill='C5E0B4', line='548235',
                    text=P(R('Préhistoire', b=True, sz=10), jc='center', sa=0)),
               dict(x=4.2, y=0, w=11.0, h=1.0, geom='rect', fill='F8CBAD', line='C55A11',
                    text=P(R('Antiquité', b=True, sz=10), jc='center', sa=0)),
               dict(x=15.2, y=0, w=8.6, h=1.0, geom='rect', fill='BDD7EE', line='2E75B6',
                    text=P(R('Moyen Âge', b=True, sz=10), jc='center', sa=0))]
    s += dr.group(23.8, 1.0, periods, x=2.2, y=8.5, relH='page', relV='page', wrap='none')
    events = [(3.0, 'vers – 3 000', 'Invention de l’écriture', 'pyramide', True),
              (7.0, '– 753', 'Fondation légendaire de Rome', 'temple', False),
              (11.5, '52 av. J.-C.', 'Bataille d’Alésia', None, True),
              (16.2, '476', 'Fin de l’Empire romain d’Occident', None, False),
              (20.0, '800', 'Charlemagne couronné empereur', 'chateau', True),
              (24.5, '1492', '?', None, False)]
    for x, date, label, pic, up in events:
        y_box = 4.2 if up else 10.6
        s += dr.shape(4.0, 2.1, x=x - 1.6, y=y_box, relH='page', relV='page', geom='roundRect', fill='FFFFFF',
                      line='1F3864', line_w=1.25, wrap='none',
                      text=P(R(date, b=True, color='C00000', sz=11), jc='center', sa=0) +
                      P(R(label, sz=9.5), jc='center', sa=0), anchor='ctr', ins=(0.1, 0.05, 0.1, 0.05))
        y0 = 6.3 if up else 9.8
        s += dr.shape(0.01, 1.6 if up else 0.8, x=x + 0.4, y=y0, relH='page', relV='page',
                      geom='straightConnector1', fill=None, line='1F3864', line_w=1.5, arrow='oval',
                      flipV=not up, wrap='none')
        if pic:
            rid = d.img(I('frise_%s.png' % pic))
            s += dr.anchor(rid, 2.0, 2.0, x=x + 1.0 if up else x - 1.0, y=(2.0 if up else 12.8), relH='page',
                           relV='page', wrap='none', name='Picto')
    s += dr.shape(3.2, 0.9, x=13.6, y=10.0, relH='page', relV='page', geom='rect', fill='FFFF00', line='BF8F00',
                  line_w=1, wrap='none', rot=-8, text=P(R('Naissance de J.-C.', b=True, sz=9), jc='center', sa=0),
                  anchor='ctr', ins=(0.05, 0.02, 0.05, 0.02))
    d.add(P(s, sa=0))
    for _ in range(22):
        d.add(P('', sa=0))
    d.add(P(R('Consigne : ', b=True) + R('complète le tableau en t’aidant de ta leçon, puis place la date manquante '
                                          '(1492) sur la frise. Colorie chaque période d’une couleur différente.'),
            sb=120))
    rows = [TROW([C(P(t, b=True, jc='center', sa=0), shd='DEEAF6') for t in ('Événement', 'Date', 'Période', 'Civilisation')],
                 header=True)]
    for e, dt in (('Invention de l’écriture', ''), ('Fondation de Rome', '– 753'), ('Bataille d’Alésia', ''),
                  ('Couronnement de Charlemagne', ''), ('Arrivée de Christophe Colomb en Amérique', '')):
        rows.append(TROW([C(e), C(P(dt, jc='center', sa=0)), C(''), C('')], height=cm(0.65)))
    d.add(TBL(rows, [cm(9.5), cm(4), cm(6), cm(6.5)], jc='center', bcolor='1F3864'))
    return d, dict(pages=1, features='paysage A4; flèche rightArrow; groupe de formes wpg (3 rectangles avec texte); '
                   'zones de texte roundRect positionnées par rapport à la page; connecteurs straightConnector1 avec '
                   'extrémités ovales et retournement vertical; zone de texte pivotée (-8°); images flottantes '
                   'wrapNone; tableau centré; police Cambria',
                   notes='Mise en page très dépendante du positionnement absolu.')


# ---------------------------------------------------------------------------
def t08():
    d = Doc('Progression annuelle – Mathématiques 5e', styles=dict(body_font='Times New Roman', body_sz=10, after=0,
                                                                  line=240, h={1: dict(font='Times New Roman', sz=13,
                                                                                       color='002060', b=True, sb=120, sa=80)}),
            subject='Mathématiques 5e', keywords='progression; cycle 4; tableau')
    dr = d.draw
    n = d.numbering
    bul = n.bullet('dash', indent=170, hanging=170)
    LW = cm(27.7)

    def hdr(part):
        return P(R('Progression annuelle – Mathématiques – 5e', b=True, sz=11, color='002060') + R('\t') +
                 R('Collège des Trois-Rivières – 2025-2026', sz=9), style='En-tte', tabs=[(LW, 'right')],
                 bdr=pbdr(bottom=('thinThickSmallGap', 12, 1, '002060')))

    def ftr(part):
        return P(R('Progression établie en conseil pédagogique de mathématiques (version du 2 septembre 2025)', sz=8,
                   i=True) + R('\t') + FLD('PAGE', '1', sz=8), style='Pieddepage', tabs=[(LW, 'right')])
    h = d.header(hdr)
    f = d.footer(ftr)

    def hdrP(part):
        return P(R('Progression annuelle – Mathématiques – 5e', b=True, sz=11, color='002060') + R('\t') +
                 R('2025-2026', sz=9), style='En-tte', tabs=[(cm(17), 'right')],
                 bdr=pbdr(bottom=('thinThickSmallGap', 12, 1, '002060')))

    def ftrP(part):
        return P(R('Mathématiques 5e', sz=8, i=True) + R('\t') + FLD('PAGE', '2', sz=8), style='Pieddepage',
                 tabs=[(cm(17), 'right')])
    hP = d.header(hdrP)
    fP = d.footer(ftrP)
    mL = (cm(1.5), cm(1), cm(1.3), cm(1), cm(0.6), cm(0.6), 0)
    periods = ['Période 1\nsept. – oct.', 'Période 2\nnov. – déc.', 'Période 3\njanv. – fév.', 'Période 4\nmars – avril',
               'Période 5\nmai – juin']
    domains = [
        ('Nombres et calculs', 'E2EFDA', [
            ['Enchaînement d’opérations, priorités', 'Nombres relatifs : repérage'],
            ['Fractions : égalité, simplification', 'Addition de relatifs'],
            ['Calcul littéral : expressions, tester une égalité'],
            ['Proportionnalité : 4e proportionnelle, pourcentages'],
            ['Nombres premiers, multiples, diviseurs']]),
        ('Grandeurs et mesures', 'FFF2CC', [
            ['Périmètres et aires (rappels)'], ['Aire du disque'], ['Volumes : prisme et cylindre'],
            ['Durées et vitesses moyennes'], ['Conversions d’unités de volume']]),
        ('Espace et géométrie', 'DDEBF7', [
            ['Triangles : construction, inégalité triangulaire'], ['Symétrie centrale'], ['Angles et parallélisme'],
            ['Parallélogrammes : propriétés'], ['Repérage dans le plan et dans l’espace']]),
        ('Organisation et gestion de données', 'FCE4D6', [
            [], ['Lecture et construction de diagrammes'], ['Moyenne'], ['Probabilités : vocabulaire'], []]),
        ('Algorithmique et programmation', 'EDEDED', [
            ['Scratch : déplacements'], [], ['Boucles et conditions'], [], ['Projet : jeu de labyrinthe']]),
    ]
    rows = [TROW([C(P('Domaine', b=True, color='FFFFFF', jc='center', sa=0), shd='002060', valign='center',
                    vmerge='restart'),
                  C(P('Périodes de l’année scolaire', b=True, color='FFFFFF', jc='center', sa=0), shd='002060', span=5)],
                 header=True),
            TROW([C('', vmerge='continue', shd='002060')] +
                 [C(P(R(p, b=True, color='FFFFFF'), jc='center', sa=0), shd='1F4E79') for p in periods], header=True)]
    for dom, col, cells in domains:
        rr = [C(P(dom, b=True, jc='center', sa=0), textDir='btLr', shd=col, valign='center')]
        for items in cells:
            rr.append(C([P(t, numId=bul, sa=20) for t in items] if items else P('—', jc='center', color='A6A6A6', sa=0),
                        shd=None))
        rows.append(TROW(rr, height=cm(2.4), cantSplit=True))
    # assessments row with a nested table
    ev_cells = [C(P('Évaluations', b=True, jc='center', sa=0), textDir='btLr', shd='D9D9D9', valign='center')]
    for k in range(5):
        nested = TBL([TROW([C(P('Type', b=True, sz=8, sa=0), shd='F2F2F2'), C(P('Sem.', b=True, sz=8, sa=0), shd='F2F2F2')]),
                      TROW([C(P('Contrôle', sz=8, sa=0)), C(P('S%d' % (6 + 8 * k), sz=8, sa=0))]),
                      TROW([C(P('Flash', sz=8, sa=0)), C(P('chaque sem.', sz=8, sa=0))])],
                     [cm(2.6), cm(1.8)], bcolor='A6A6A6', bsz=2)
        ev_cells.append(C([nested, P('', sa=0)]))
        if k == 4:
            pass
    rows.append(TROW(ev_cells, cantSplit=True))
    d.add(P('Répartition des thèmes par période', style='Titre1'))
    d.add(TBL(rows, [cm(2.0)] + [cm(5.14)] * 5, bcolor='002060', bsz=6))
    d.add(P(md('Les automatismes (calcul mental, questions flash) sont travaillés **chaque semaine** en début de '
               'séance') + d.footnote('Conformément aux repères annuels de progression du cycle 4 (version 2019) et '
                                      'aux recommandations sur les automatismes.') + R('.'), sb=120))
    d.add(SECTBREAK(SECT(landscape=True, margins=mL, headers={'default': h}, footers={'default': f})))
    d.add(P('Nombre de semaines consacrées à chaque domaine', style='Titre1'))
    d.add(P(d.chart('bar', 'Semaines par domaine et par période', ['P1', 'P2', 'P3', 'P4', 'P5'],
                    [('Nombres et calculs', [3, 3, 2, 3, 2]), ('Grandeurs et mesures', [1, 2, 2, 2, 1]),
                     ('Espace et géométrie', [3, 2, 2, 2, 2]), ('Données', [0, 1, 1, 1, 0]),
                     ('Algorithmique', [1, 0, 1, 0, 2])], grouping='stacked', w=16, h=9), jc='center'))
    d.add(PM('*Total : 36 semaines effectives, hors semaines d’évaluations communes.*', jc='center'))
    d.final_sect = SECT(margins=(cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0), headers={'default': hP},
                        footers={'default': fP})
    return d, dict(pages=2, features='section paysage puis portrait; grand tableau: 2 lignes d’en-tête répétées '
                   '(fusion verticale + horizontale), texte vertical btLr, trames par domaine, puces dans cellules, '
                   'TABLEAU IMBRIQUÉ dans cellules; bordure d’en-tête thinThickSmallGap; note de bas de page; '
                   'graphique histogramme empilé (DrawingML chart + classeur incorporé); Times New Roman 10')
