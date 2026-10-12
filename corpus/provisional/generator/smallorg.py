# -*- coding: utf-8 -*-
# SPDX-License-Identifier: AGPL-3.0-only
"""Very-small-business / association documents (fictional entities, people and contact details).
Phone numbers in the 01 99 00 xx xx range, e-mails and sites on example.org (RFC 2606)."""
from ooxml import *  # noqa

IMG = None


def I(name):
    return '%s/%s' % (IMG, name)


ASSO = 'Les Jardins partagés du Moulin'
ASSO_ADR = '3 chemin du Moulin – 99120 Valmont-sur-Ourse'
ASSO_MAIL = 'contact@jardins-du-moulin.example.org'


# ---------------------------------------------------------------------------
def s01():
    d = Doc('Devis n° 2026-0042 – Menuiserie du Val Fleuri', styles=dict(body_font='Arial', body_sz=10, after=0, line=240),
            subject='Devis', keywords='devis; TPE; menuiserie')
    dr = d.draw
    W = cm(18)
    logo = d.img(I('logo_menuiserie.png'))

    def hdr_first(part):
        rid = d.img(I('logo_menuiserie.png'), part)
        return (TBL([TROW([C(P(dr.inline(rid, 2.4, 2.4, name='Logo'), sa=0), valign='center'),
                           C([P('MENUISERIE DU VAL FLEURI', b=True, sz=15, color='5D4037', sa=0),
                              P('Menuiserie – Agencement – Escaliers sur mesure', i=True, sz=9, color='8D6E63', sa=40),
                              P('12 rue des Artisans – ZA des Prés – 99120 Valmont-sur-Ourse', sz=8.5, sa=0),
                              P('Tél. 01 99 00 41 27 – atelier@menuiserie-valfleuri.example.org', sz=8.5, sa=0)],
                             valign='center')])], [cm(3), cm(15)], borders='none') +
                P('', style='En-tte') + P(dr.watermark('DEVIS', font='Arial Black', color='D7CCC8'), style='En-tte'))

    def hdr(part):
        return (P(R('Menuiserie du Val Fleuri – Devis n° 2026-0042 (suite)', sz=8, color='8D6E63'), style='En-tte',
                  bdr=pbdr(bottom=('single', 4, 1, '8D6E63'))) +
                P(dr.watermark('DEVIS', font='Arial Black', color='D7CCC8'), style='En-tte'))

    def ftr(part):
        return (P(R('SARL au capital de 8 000 € – RCS Valmont-sur-Ourse 999 999 999 – SIRET 999 999 999 00011 – '
                    'APE 1623Z – TVA intracommunautaire FR00 999999999', sz=7, color='595959'), style='Pieddepage',
                  jc='center', bdr=pbdr(top=('single', 4, 4, '8D6E63'))) +
                P(R('Assurance décennale n° D-000000 (exemple) – zone d’intervention : 50 km autour de Valmont', sz=7,
                    color='595959') + R('\t') + R('Page ', sz=7) + FLD('PAGE', '1', sz=7) + R('/', sz=7) +
                  FLD('NUMPAGES', '1', sz=7), style='Pieddepage', tabs=[(W, 'right')]))
    hf = d.header(hdr_first)
    hd = d.header(hdr)
    ft = d.footer(ftr)
    d.final_sect = SECT(margins=(cm(4.2), cm(1.5), cm(2.2), cm(1.5), cm(0.8), cm(0.8), 0),
                        headers={'first': hf, 'default': hd}, footers={'first': ft, 'default': ft}, titlePg=True)
    # customer block in a frame (framePr) + references on the left
    fr = FRAME(cm(8), cm(3.4), x=cm(11.5), y=cm(4.6), hAnchor='page', vAnchor='page')
    d.add(P('M. et Mme Bertrand Exemple', b=True, framePr=fr, sa=0, bdr=pbdr(box=('single', 4, 6, 'A1887F')), shd='EFEBE9'))
    d.add(P('8 allée des Charmes', framePr=fr, sa=0, bdr=pbdr(box=('single', 4, 6, 'A1887F')), shd='EFEBE9'))
    d.add(P('Lotissement Les Hauts du Val', framePr=fr, sa=0, bdr=pbdr(box=('single', 4, 6, 'A1887F')), shd='EFEBE9'))
    d.add(P('99120 VALMONT-SUR-OURSE', framePr=fr, sa=0, bdr=pbdr(box=('single', 4, 6, 'A1887F')), shd='EFEBE9'))
    d.add(P(R('DEVIS N° 2026-0042', b=True, sz=18, color='FFFFFF'), shd='5D4037', ind_right=cm(8.5), sb=0, sa=120))
    for k, v in (('Date du devis', '9 mars 2026'), ('Validité', '3 mois (jusqu’au 9 juin 2026)'),
                 ('Référence client', 'CL-0318'), ('Objet', 'Remplacement de la porte d’entrée'),
                 ('Lieu des travaux', 'adresse du client')):
        d.add(P(R(k, b=True) + R('\t: ' + v), tabs=[(cm(3.4), 'left')], sa=30, ind_right=cm(8.5)))
    d.add(P('', sa=300))
    # services table with decimal tabs
    cols = [cm(8.6), cm(1.6), cm(1.6), cm(3.0), cm(3.2)]
    dec = lambda w: [(w - cm(1.1), 'decimal')]
    head = TROW([C(P(t, b=True, jc=j, sa=0)) for t, j in (('Désignation', 'left'), ('Qté', 'center'), ('Unité', 'center'),
                                                          ('P.U. HT (€)', 'right'), ('Total HT (€)', 'right'))],
                header=True, height=cm(0.7))
    rows = [head]
    items = [('Fourniture', None),
             ('Porte d’entrée en chêne massif, 215 × 90 cm, vitrage feuilleté 44.2 sablé, finition lasure incolore', (1, 'u', 1840.00)),
             ('Serrure de sûreté 3 points certifiée A2P*, 3 clés', (1, 'u', 245.00)),
             ('Seuil aluminium à rupture de pont thermique', (1, 'u', 89.50)),
             ('Pose', None),
             ('Dépose et évacuation de l’ancienne porte en déchetterie agréée', (1, 'forfait', 180.00)),
             ('Pose de la porte, calfeutrement, mousse expansive, réglages', (6, 'h', 52.00)),
             ('Habillage intérieur en chêne (tapées et chambranles)', (4.8, 'ml', 38.00)),
             ('Frais de déplacement', (1, 'forfait', 35.00))]
    total = 0.0
    for lab, v in items:
        if v is None:
            rows.append(TROW([C(P(R(lab, b=True, color='5D4037'), sa=0), span=5, shd='D7CCC8')]))
            continue
        q_, u, pu = v
        t = q_ * pu
        total += t
        qs = ('%g' % q_).replace('.', ',')
        rows.append(TROW([C(P(lab, sa=0)), C(P(qs, jc='center', sa=0)), C(P(u, jc='center', sa=0)),
                          C(P(R(money(pu)), tabs=dec(cols[3]), sa=0)),
                          C(P(R(money(t)), tabs=dec(cols[4]), sa=0))]))
    d.add(TBL(rows, cols, style='Tableausimple4-Accentuation1', borders=None, look='0420'))
    tva = round(total * 0.10, 2)
    ttc = total + tva
    d.add(P('', sa=120))
    tot = [('Total HT', money(total), False), ('TVA 10 %', money(tva), False), ('Total TTC', money(ttc), True),
           ('Acompte à la commande (30 %)', money(round(ttc * 0.3, 2)), False)]
    trs = []
    for lab, val, strong in tot:
        trs.append(TROW([C(P(R(lab, b=strong, color='FFFFFF' if strong else None), sa=0),
                           shd='5D4037' if strong else 'EFEBE9'),
                         C(P(R(val + ' €', b=strong, color='FFFFFF' if strong else None),
                             tabs=[(cm(2.6), 'decimal')], sa=0),
                           shd='5D4037' if strong else None)]))
    d.add(TBL(trs, [cm(5.6), cm(4.2)], jc='right', bcolor='A1887F'))
    d.add(P(md('*TVA au taux réduit de 10 % : travaux d’amélioration d’un logement achevé depuis plus de deux ans '
               '(attestation simplifiée à remettre avant le début des travaux).*', sz=8), sb=120))
    d.add(P('Conditions', b=True, sb=200, sa=60, color='5D4037'))
    n = d.numbering
    li = n.decimal(fmts=[('decimal', '%1.')], indent=284, hanging=284)
    for t in ('Délai de fabrication : 5 semaines à compter de la réception de l’acompte.',
              'Solde payable à réception de la facture, par virement ou chèque. Pas d’escompte pour paiement anticipé.',
              'En cas de retard de paiement : pénalités au taux légal majoré de 10 points et indemnité forfaitaire '
              'de recouvrement de 40 €.',
              'Les travaux non prévus au présent devis feront l’objet d’un avenant signé.'):
        d.add(P(t, numId=li, sa=30, sz=9))
    d.add(P('', sa=120))
    d.add(TBL([TROW([C([P('Bon pour accord', b=True, sa=60),
                        P('Date, signature et mention manuscrite « Bon pour accord » :', sz=8.5, i=True, sa=0)],
                       borders={'top': ('single', 8, '5D4037'), 'left': ('single', 8, '5D4037'),
                                'bottom': ('single', 8, '5D4037'), 'right': ('single', 8, '5D4037')}),
                     C(''),
                     C([P('Pour l’entreprise', b=True, sa=60), P('Le gérant', sz=8.5, i=True, sa=0)])],
                    height=cm(3.2), cantSplit=True)], [cm(8.5), cm(1), cm(8.5)], borders='none'))
    return d, dict(pages=1, features='en-tête 1re page différent (tableau logo + coordonnées) / pages suivantes; '
                   'filigrane texte VML (WordArt) dans l’en-tête; bloc destinataire en cadre (framePr) positionné '
                   'par rapport à la page avec bordure et trame; tableau style « Grille 4 Accent 1 » (mise en forme '
                   'conditionnelle 1re ligne, bandes); lignes de section fusionnées (gridSpan); taquets '
                   'DÉCIMAUX dans les cellules sans caractère tabulation (alignement automatique sur la virgule); espaces insécables de milliers; tableau des '
                   'totaux aligné à droite; mentions légales 7 pt avec bordure supérieure; liste numérotée; Arial',
                   notes='Identifiants SIRET/RCS/TVA volontairement factices (999…).')


# ---------------------------------------------------------------------------
def s02():
    d = Doc('Compte rendu de l’assemblée générale 2026 – ' + ASSO, theme='office2007', compat=14,
            styles=dict(body_sz=11, after=120, line=264, h={1: dict(sz=13, color='365F91', sb=280, sa=80, b=True),
                                                            2: dict(sz=11.5, color='4F81BD', sb=160, sa=40, b=True)}),
            subject='Compte rendu d’AG', keywords='association; AG; compte rendu')
    n = d.numbering
    outl = n.outline(['Titre1', 'Titre2', 'Titre3'],
                     [('decimal', '%1.'), ('decimal', '%1.%2.'), ('decimal', '%1.%2.%3.')],
                     indents=[432, 576, 720], hanging=[432, 576, 720])
    d.styles_kw['h'][1]['numId'] = outl
    d.styles_kw['h'][2]['numId'] = outl
    bul = n.bullet('disc')
    odj = n.decimal(fmts=[('decimal', '%1)')])
    W = cm(16)
    A1, A2, A3 = 'Martine Leroy', 'Karim Benali', 'Odile Ferrand'

    def hdr(part):
        return P(R(ASSO, sz=9, color='365F91', b=True) + R('\t') + R('Compte rendu – AG du 28 mars 2026', sz=9,
                                                                       color='365F91'),
                 style='En-tte', tabs=[(W, 'right')], bdr=pbdr(bottom=('single', 4, 1, '4F81BD')))

    def ftr(part):
        return P(R('Page ') + FLD('PAGE', '1') + R(' sur ') + FLD('NUMPAGES', '3'), style='Pieddepage', jc='center', sz=9)
    h = d.header(hdr)
    f = d.footer(ftr)
    m = (cm(2.5), cm(2.5), cm(2.2), cm(2.5), cm(1.1), cm(1), 0)
    d.final_sect = SECT(kind='continuous', margins=m, headers={'default': h}, footers={'default': f})
    d.add(P('Compte rendu de l’assemblée générale ordinaire', style='Titre'))
    d.add(PM('**Date :** samedi 28 mars 2026, de 14 h 30 à 17 h 15 – **Lieu :** salle polyvalente de Valmont-sur-Ourse'))
    c1 = d.comment(A1, 'ML', '2026-04-02T18:12:00Z', 'Penser à préciser le nombre exact de pouvoirs reçus (12 ou 13 ?).')
    c2 = d.comment(A2, 'KB', '2026-04-03T09:40:00Z', 'Vérifié sur la feuille d’émargement : 12 pouvoirs.', parent=c1)
    d.add(P(md('**Présidence de séance :** Odile Ferrand, présidente – **Secrétariat de séance :** Karim Benali. '
               'Nombre de membres à jour de cotisation : 87 ; présents : 41 ; ') + d.cstart(c1) + d.cstart(c2) +
            R('représentés : 12') + d.cend(c1) + d.cend(c2) +
            md('. Le quorum du quart des membres (22) étant atteint') +
            d.footnote('Article 10 des statuts : « L’assemblée générale ne délibère valablement que si le quart au '
                       'moins des membres est présent ou représenté. »') +
            R(', l’assemblée peut valablement délibérer.')))
    d.add(P('Membres du conseil d’administration présents ou excusés', b=True, sb=120, sa=60, keepNext=True))
    d.add(SECTBREAK(SECT(kind='continuous', margins=m, headers={'default': h}, footers={'default': f}), sa=0))
    for nm in ('Odile Ferrand (présidente)', 'Karim Benali (secrétaire)', 'Martine Leroy (trésorière)',
               'Paul Nguyen (vice-président)', 'Sabine Morel', 'Ahmed Haddad', 'Louise Garnier – excusée',
               'Thomas Petit – excusé, pouvoir à S. Morel'):
        d.add(P(nm, numId=bul, sa=20))
    d.add(SECTBREAK(SECT(kind='continuous', cols=(2, cm(1)), margins=m, headers={'default': h}, footers={'default': f}),
                    sa=0))
    d.add(P('Ordre du jour', style='Titre1'))
    for t in ('Rapport moral de la présidente', 'Rapport d’activité', 'Rapport financier et affectation du résultat',
              'Projets 2026 et budget prévisionnel', 'Montant de la cotisation 2027',
              'Renouvellement du tiers sortant du conseil d’administration', 'Questions diverses'):
        d.add(P(t, numId=odj, sa=20))
    d.add(P('Rapport moral', style='Titre1'))
    d.add(P('La présidente remercie les membres présents et rappelle que l’année 2025 a été marquée par l’ouverture '
            'de la deuxième parcelle, rue des Saules, et par l’arrivée de 23 nouveaux adhérents. Elle souligne '
            'l’implication des bénévoles lors des ateliers du mercredi et remercie la commune pour le prêt du local '
            'technique.', jc='both'))
    d.add(P('Rapport d’activité', style='Titre1'))
    d.add(P('Ateliers et animations', style='Titre2'))
    c3 = d.comment(A3, 'OF', '2026-04-02T21:05:00Z', 'Ajouter les chiffres de fréquentation des ateliers enfants.',
                   done=True)
    d.add(P(d.cstart(c3) + R('Quarante-deux ateliers ont été organisés') + d.cend(c3) +
            R(', dont dix-huit à destination des enfants de l’accueil de loisirs (312 participations au total). '
              'La fête des récoltes du 20 septembre a réuni environ 250 personnes.'), jc='both'))
    d.add(P('Partenariats', style='Titre2'))
    d.add(P('Le partenariat avec le collège des Trois-Rivières (club nature) a été reconduit ; une convention a été '
            'signée avec l’association Vélo Solidaire pour l’entretien des vélos-remorques.', jc='both'))
    d.add(P('Rapport financier', style='Titre1'))
    d.add(P('La trésorière présente les comptes 2025 : produits 14 860 €, charges 13 925 €, soit un excédent de '
            '935 €, qu’elle propose d’affecter au fonds de réserve.', jc='both'))
    d.add(P('Votes', style='Titre1'))
    rows = [TROW([C(P('Résolution', b=True, sa=0), vmerge='restart', shd='DBE5F1', valign='center'),
                  C(P('Votes', b=True, jc='center', sa=0), span=3, shd='DBE5F1'),
                  C(P('Résultat', b=True, sa=0), vmerge='restart', shd='DBE5F1', valign='center')], header=True),
            TROW([C('', vmerge='continue', shd='DBE5F1')] +
                 [C(P(t, b=True, jc='center', sa=0), shd='DBE5F1') for t in ('Pour', 'Contre', 'Abst.')] +
                 [C('', vmerge='continue', shd='DBE5F1')], header=True)]
    for r_, p_, c_, a_, res in (('1. Approbation du rapport moral', 53, 0, 0, 'Adoptée à l’unanimité'),
                                ('2. Approbation des comptes 2025', 51, 0, 2, 'Adoptée'),
                                ('3. Affectation du résultat', 52, 1, 0, 'Adoptée'),
                                ('4. Cotisation 2027 portée à 20 €', 38, 9, 6, 'Adoptée'),
                                ('5. Budget prévisionnel 2026', 50, 0, 3, 'Adoptée')):
        rows.append(TROW([C(P(r_, sa=0)), C(P(str(p_), jc='center', sa=0)), C(P(str(c_), jc='center', sa=0)),
                          C(P(str(a_), jc='center', sa=0)), C(P(res, sa=0, i=True))]))
    d.add(TBL(rows, [cm(6.4), cm(1.6), cm(1.6), cm(1.6), cm(4.8)], bcolor='95B3D7'))
    d.add(P('Élection au conseil d’administration', style='Titre2'))
    d.add(P('Sont élus pour trois ans : Sabine Morel, Ahmed Haddad (renouvellement) et Julie Lambert (nouvelle '
            'candidate), à la majorité des suffrages exprimés.', jc='both'))
    d.add(P('Questions diverses', style='Titre1'))
    d.add(P('Un adhérent demande l’installation d’un récupérateur d’eau de pluie supplémentaire ; le conseil étudiera '
            'un devis avant l’été. L’ordre du jour étant épuisé, la séance est levée à 17 h 15.', jc='both'))
    d.add(P('', sa=240))
    d.add(TBL([TROW([C([P('La présidente', b=True, jc='center', sa=600), P('Odile Ferrand', jc='center', sa=0)]),
                     C([P('Le secrétaire de séance', b=True, jc='center', sa=600), P('Karim Benali', jc='center', sa=0)])],
                    cantSplit=True)], [cm(8), cm(8)], borders='none'))
    return d, dict(pages=3, features='mode de compatibilité Word 2010 (compat 14); thème Office 2007 '
                   '(Cambria/Calibri); titres numérotés hiérarchiques liés aux styles (1. / 1.1.); section continue '
                   '2 colonnes (liste de présents); commentaires avec réponse (commentsExtended paraIdParent) et '
                   'commentaire résolu (done); note de bas de page; tableau de votes avec fusion horizontale et '
                   'verticale sur 2 lignes d’en-tête répétées; « Page X sur Y »; bloc de signatures en tableau sans bordure')


# ---------------------------------------------------------------------------
def s03():
    art_style = STYLE('paragraph', 'Article', 'Article', 'Titre2', 'Normal', None,
                      '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>',
                      '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:bCs/>'
                      '<w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>', q=True)
    d = Doc('Statuts de l’association ' + ASSO, styles=dict(body_font='Times New Roman', body_sz=12, after=120, line=240,
                                                            extra=art_style,
                                                            h={2: dict(font='Times New Roman', sz=12, color='000000', b=True)}),
            settings=dict(hyphen=True, even_odd=True, mirror=True), subject='Statuts', keywords='statuts; loi 1901')
    n = d.numbering
    art = n.outline(['Article'], [('decimal', 'Article %1 –')], indents=[0], hanging=[0], suff='space')
    lst = n.decimal(fmts=[('lowerLetter', '%1)')], indent=567, hanging=283)
    dash = n.bullet('dash', indent=567, hanging=283)

    def fodd(part):
        return P(R('Statuts – ' + ASSO, sz=9, i=True) + R('\t') + FLD('PAGE', '1', sz=10, b=True),
                 style='Pieddepage', tabs=[(cm(16), 'right')])

    def feven(part):
        return P(FLD('PAGE', '2', sz=10, b=True) + R('\t') + R('Statuts adoptés le 14 mars 2021, modifiés le 28 mars 2026',
                                                                sz=9, i=True), style='Pieddepage', tabs=[(cm(16), 'right')])
    fo = d.footer(fodd)
    fe = d.footer(feven)
    d.final_sect = SECT(margins=(cm(2.5), cm(2), cm(2.5), cm(2.5), cm(1.25), cm(1.25), cm(0.5)),
                        footers={'default': fo, 'even': fe})
    d.add(P('STATUTS', jc='center', b=True, sz=20, spacing=60, sa=60))
    d.add(P('de l’association « %s »' % ASSO, jc='center', sz=14, i=True, sa=60))
    d.add(P('Association déclarée régie par la loi du 1er juillet 1901', jc='center', sz=11, sa=360,
            bdr=pbdr(bottom=('single', 6, 12, '000000'))))
    J = dict(jc='both')

    def article(title, *paras):
        d.add(P(title, style='Article', numId=art))
        for p in paras:
            if isinstance(p, tuple):
                kind, items = p
                for it in items:
                    d.add(P(it, numId=lst if kind == 'a' else dash, sa=40, **J))
            else:
                d.add(P(p, **J))

    fn1 = d.footnote('Loi du 1er juillet 1901 relative au contrat d’association, publiée au Journal officiel du '
                     '2 juillet 1901.')
    fn2 = d.footnote('Décret du 16 août 1901 pris pour l’exécution de la loi du 1er juillet 1901.')
    article('Constitution et dénomination',
            R('Il est fondé entre les adhérents aux présents statuts une association régie par la loi du 1er juillet '
              '1901') + fn1 + R(' et le décret du 16 août 1901') + fn2 +
            R(', ayant pour titre : « %s ».' % ASSO))
    article('Objet',
            'Cette association a pour objet de créer, aménager et animer des jardins collectifs ouverts à tous les '
            'habitants, de favoriser les échanges entre générations et cultures, de sensibiliser le public au '
            'jardinage respectueux de l’environnement et de contribuer à la vie sociale du quartier.')
    article('Siège social',
            'Le siège social est fixé à la maison des associations, 3 chemin du Moulin, 99120 Valmont-sur-Ourse. '
            'Il pourra être transféré par simple décision du conseil d’administration ; la ratification par '
            'l’assemblée générale sera nécessaire.')
    article('Durée', 'La durée de l’association est illimitée.')
    article('Composition', 'L’association se compose de :',
            ('a', ['membres actifs ou adhérents : personnes qui versent annuellement la cotisation fixée par '
                   'l’assemblée générale et participent régulièrement aux activités ;',
                   'membres bienfaiteurs : personnes qui versent un don au moins égal à trois fois la cotisation ;',
                   'membres d’honneur : personnes qui ont rendu des services signalés à l’association ; ils sont '
                   'dispensés de cotisation.']))
    article('Admission',
            'Pour faire partie de l’association, il faut adhérer aux présents statuts et s’acquitter de la cotisation. '
            'Le conseil d’administration peut refuser une adhésion par décision motivée, notifiée à l’intéressé.')
    article('Cotisation',
            'Le montant de la cotisation annuelle est fixé chaque année par l’assemblée générale ordinaire, sur '
            'proposition du conseil d’administration. Un tarif réduit peut être prévu pour les étudiants, les '
            'demandeurs d’emploi et les mineurs.')
    article('Perte de la qualité de membre', 'La qualité de membre se perd par :',
            ('-', ['la démission adressée par écrit au président ;', 'le décès ;',
                   'le non-paiement de la cotisation trois mois après son échéance ;',
                   'la radiation prononcée par le conseil d’administration pour motif grave, l’intéressé ayant été '
                   'invité à fournir ses explications.']))
    article('Ressources',
            'Les ressources de l’association comprennent : le montant des cotisations ; les subventions de l’État, des '
            'collectivités territoriales et des établissements publics ; les dons manuels ; le produit des '
            'manifestations ; toute autre ressource autorisée par les lois et règlements en vigueur.')
    article('Assemblée générale ordinaire',
            'L’assemblée générale ordinaire comprend tous les membres de l’association à jour de leur cotisation. '
            'Elle se réunit une fois par an. Quinze jours au moins avant la date fixée, les membres sont convoqués '
            'par courrier électronique ou postal ; l’ordre du jour figure sur la convocation.',
            'Le président, assisté des membres du conseil, préside l’assemblée et expose la situation morale et '
            'l’activité de l’association. Le trésorier rend compte de sa gestion et soumet les comptes annuels à '
            'l’approbation de l’assemblée.',
            'L’assemblée ne délibère valablement que si le quart au moins des membres est présent ou représenté. '
            'Chaque membre présent ne peut détenir plus de deux pouvoirs. Les décisions sont prises à la majorité '
            'des voix des membres présents ou représentés.')
    article('Assemblée générale extraordinaire',
            'Si besoin est, ou sur la demande de la moitié plus un des membres inscrits, le président peut convoquer '
            'une assemblée générale extraordinaire, notamment pour une modification des statuts ou la dissolution. '
            'Les délibérations sont prises à la majorité des deux tiers des membres présents ou représentés.')
    article('Conseil d’administration',
            'L’association est dirigée par un conseil de six à douze membres, élus pour trois années par '
            'l’assemblée générale. Les membres sont rééligibles. Le conseil est renouvelé chaque année par tiers. '
            'Il se réunit au moins une fois tous les trois mois, sur convocation du président ou à la demande du '
            'quart de ses membres.')
    article('Bureau', 'Le conseil d’administration élit parmi ses membres un bureau composé de :',
            ('-', ['un président et, s’il y a lieu, un vice-président ;', 'un secrétaire et, s’il y a lieu, un '
                   'secrétaire adjoint ;', 'un trésorier et, si besoin est, un trésorier adjoint.']))
    article('Indemnités',
            'Toutes les fonctions, y compris celles des membres du conseil d’administration et du bureau, sont '
            'gratuites et bénévoles. Seuls les frais occasionnés par l’accomplissement de leur mandat sont '
            'remboursés sur justificatifs.')
    article('Règlement intérieur',
            'Un règlement intérieur peut être établi par le conseil d’administration, qui le fait alors approuver '
            'par l’assemblée générale. Il précise notamment les règles d’attribution et d’usage des parcelles.')
    fn3 = d.footnote('L’actif net ne peut en aucun cas être réparti entre les membres (article 9 de la loi du '
                     '1er juillet 1901).')
    article('Dissolution',
            R('En cas de dissolution prononcée selon les modalités prévues à l’article 11, un ou plusieurs '
              'liquidateurs sont nommés, et l’actif net, s’il y a lieu, est dévolu à une association poursuivant des '
              'buts similaires') + fn3 + R('.'))
    d.add(P(R('Fait à Valmont-sur-Ourse, le 28 mars 2026, en deux exemplaires originaux.'), sb=360, sa=240, keepNext=True))
    d.add(TBL([TROW([C([P('La présidente', b=True, jc='center', sa=60), P('Odile Ferrand', jc='center', sa=480),
                        P(R('\t'), tabs=[(cm(6.5), 'left', 'underscore')], sa=0)]),
                     C([P('Le secrétaire', b=True, jc='center', sa=60), P('Karim Benali', jc='center', sa=480),
                        P(R('\t'), tabs=[(cm(6.5), 'left', 'underscore')], sa=0)])], cantSplit=True)],
              [cm(8), cm(8)], borders='none'))
    return d, dict(pages=3, features='Times New Roman 12 justifié; COUPURE AUTOMATIQUE (autoHyphenation); marges en '
                   'miroir + reliure (gutter); pieds de page pairs/impairs différents (evenAndOddHeaders); style '
                   'personnalisé « Article » basé sur Titre 2 avec numérotation automatique « Article %1 – » '
                   '(suffixe espace); sous-listes a) et tirets; 3 notes de bas de page; espacement de caractères '
                   'du titre; ligne de signatures soulignée par tabulation')


# ---------------------------------------------------------------------------
def s04():
    d = Doc('La Gazette des Tilleuls – n° 18 – printemps 2026',
            styles=dict(body_font='Georgia', body_sz=9.5, after=80, line=250,
                        h={1: dict(font='Verdana', sz=12.5, color='006064', b=True, sb=120, sa=60),
                           2: dict(font='Verdana', sz=10, color='E65100', b=True, sb=80, sa=40)}),
            settings=dict(hyphen=True), subject='Lettre d’information de quartier', keywords='newsletter; colonnes')
    dr = d.draw
    m = (cm(1.4), cm(1.4), cm(1.4), cm(1.4), cm(0.7), cm(0.7), 0)
    W = cm(18.2)

    def ftr(part):
        return P(R('La Gazette des Tilleuls – Comité de quartier des Tilleuls – ', sz=7.5, font='Verdana') +
                 d.link('mailto:gazette@tilleuls.example.org', 'gazette@tilleuls.example.org', part=part, sz=7.5) +
                 R('\t') + FLD('PAGE', '1', sz=7.5, font='Verdana'), style='Pieddepage', tabs=[(W, 'right')],
                 bdr=pbdr(top=('single', 12, 4, '006064')))
    f = d.footer(ftr)
    logo = d.img(I('logo_jardin.png'))
    # title banner (table)
    d.add(TBL([TROW([C(P(dr.inline(logo, 2.2, 2.2, name='Logo'), jc='center', sa=0), shd='006064', valign='center'),
                     C([P(R('La Gazette des Tilleuls', font='Georgia', sz=34, b=True, color='FFFFFF'), sa=0),
                        P(R('Le journal des habitants du quartier des Tilleuls', font='Verdana', sz=9, color='B2EBF2',
                            i=True), sa=0)], shd='006064', valign='center'),
                     C([P(R('N° 18', font='Verdana', sz=16, b=True, color='FFAB40'), jc='right', sa=0),
                        P(R('Printemps 2026', font='Verdana', sz=9, color='FFFFFF'), jc='right', sa=0),
                        P(R('Gratuit', font='Verdana', sz=9, color='FFFFFF', b=True), jc='right', sa=0)],
                       shd='006064', valign='center')], height=cm(2.8))],
              [cm(2.8), cm(11.6), cm(3.8)], borders='none', cellMar=(60, 113, 60, 113)))
    d.add(P(R('Sommaire : ', b=True, font='Verdana', sz=8) +
            R('Les cinq ans du jardin · Travaux rue des Tilleuls · Portrait : l’atelier vélo · Agenda · Le coin des enfants',
              font='Verdana', sz=8), shd='E0F2F1', sb=60, sa=120))
    d.add(SECTBREAK(SECT(margins=m, footers={'default': f}), sa=0, line=120))
    # 3 columns
    d.add(P('Le jardin partagé fête ses cinq ans', style='Titre1'))
    d.add(DROPCAP('C', 3, font='Georgia', color='006064'))
    d.add(P(R('’était un terrain vague coincé entre le gymnase et la voie ferrée. Cinq ans plus tard, le jardin '
              'partagé du Moulin compte quarante-deux parcelles, une mare pédagogique, un poulailler et un '
              'composteur collectif qui recycle chaque année près de trois tonnes de déchets verts.'), jc='both'))
    d.add(P('« Au départ, nous étions six, avec deux bêches et beaucoup d’enthousiasme », se souvient la présidente '
            'de l’association. Aujourd’hui, les jardiniers viennent de toutes les rues du quartier ; certains n’avaient '
            'jamais semé une graine. Les écoles y organisent des sorties et le centre de loisirs y tient un atelier '
            'chaque mercredi.', jc='both'))
    pay = d.img(I('paysage1.png'))
    d.add(P(dr.inline(pay, 5.6, 3.5, name='Photo', descr='Vue du jardin partagé'), jc='center', sa=40, keepNext=True))
    d.add(P(R('Figure ', style=None) + FLD('SEQ Figure \\* ARABIC', '1') + R(' – Le jardin au printemps (illustration).'),
            style='Lgende', jc='center'))
    d.add(P('Pour fêter l’anniversaire, une journée portes ouvertes aura lieu le samedi 23 mai, avec bourse aux '
            'plants, visite guidée et goûter partagé. Chacun est invité à apporter une recette à base de légumes '
            'du jardin.', jc='both'))
    quote = (P(R('« On vient pour les tomates, on reste pour les gens. »', font='Georgia', i=True, sz=13,
                 color='006064'), jc='center', sa=60) +
             P(R('— une jardinière de la première heure', font='Verdana', sz=7.5, color='595959'), jc='right', sa=0))
    d.add(P(dr.shape(5.4, 3.0, x=6.4, y=0.6, relH='margin', relV='paragraph', geom='rect', fill='FFF3E0', line='E65100',
                     line_w=1.5, text=quote, wrap='square', anchor='ctr') +
            R('Travaux rue des Tilleuls'), style='Titre1'))
    d.add(P('Ce qui va changer', style='Titre2'))
    d.add(P('Du 13 avril au 26 juin, la rue des Tilleuls sera réaménagée entre la place du Marché et l’avenue des '
            'Peupliers : trottoirs élargis, plantation de quinze arbres, création d’une piste cyclable à double sens '
            'et de places de stationnement pour les personnes à mobilité réduite.', jc='both'))
    d.add(P('Circulation et stationnement', style='Titre2'))
    d.add(P('La circulation sera alternée par feux pendant la première phase. Le stationnement sera interdit côté '
            'pair. Les commerces resteront accessibles à pied pendant toute la durée du chantier. Une réunion '
            'd’information se tiendra le 2 avril à 18 h 30 à la maison de quartier.', jc='both'))
    d.add(P('Portrait : l’atelier vélo solidaire', style='Titre1'))
    pay2 = d.img(I('paysage2.jpg'))
    d.add(P(dr.anchor(pay2, 2.6, 2.6, x=0, y=0.1, relH='column', relV='paragraph', wrap='square', side='right',
                      name='Photo', crop=(10000, 0, 30000, 0), descr='Photo recadrée') +
            R('Chaque samedi matin, dans l’ancienne loge du gardien, une dizaine de bénévoles réparent des vélos '
              'abandonnés ou donnés. Une fois remis en état, ils sont prêtés pour un an à des familles, des '
              'étudiants ou des personnes en recherche d’emploi.'), jc='both'))
    d.add(P('« Ici, on n’est pas un garage : on apprend à chacun à réparer lui-même », explique le coordinateur. '
            'En 2025, cent dix-sept vélos ont été remis en circulation et quatre-vingts personnes ont suivi un '
            'atelier « crevaison » ou « freins ».', jc='both'))
    d.add(P(R('Plus d’informations : ') + d.link('https://velo-solidaire.example.org', 'velo-solidaire.example.org'),
            jc='left'))
    d.add(SECTBREAK(SECT(kind='continuous', cols=(3, cm(0.6), True), margins=m, footers={'default': f}), sa=0))
    # 2 unequal columns: narrow agenda
    d.add(P(R('Agenda du trimestre', font='Verdana', b=True, color='FFFFFF', sz=11), shd='E65100', sb=200, sa=80))
    for dt, ev in (('Jeu. 2 avril', 'Réunion travaux, 18 h 30'), ('Sam. 11 avril', 'Troc de graines'),
                   ('Mer. 22 avril', 'Atelier nichoirs (dès 7 ans)'), ('Sam. 23 mai', 'Portes ouvertes du jardin'),
                   ('Ven. 5 juin', 'Cinéma en plein air'), ('Sam. 20 juin', 'Fête de quartier')):
        d.add(P(R(dt, b=True, font='Verdana', sz=8.5, color='E65100') + R('\t') + R(ev, font='Verdana', sz=8.5),
                tabs=[(cm(2.2), 'left')], ind_left=cm(2.2), hanging=cm(2.2), sa=60,
                bdr=pbdr(bottom=('dotted', 4, 2, 'FFB74D'))))
    d.add(P(BR('column') + R('Le coin des enfants', font='Verdana', b=True, color='FFFFFF', sz=11), shd='006064',
            sb=200, sa=80))
    d.add(P('Devinette : je suis petite, je porte ma maison sur mon dos et j’adore les salades du jardin. '
            'Qui suis-je ?', i=True, jc='both'))
    d.add(P(R('Réponse : ', b=True) + R('l’escargot !', vanish=False, color='FFFFFF', hl='darkCyan')))
    d.add(P('Dessine ton légume préféré et dépose ton dessin dans la boîte aux lettres du comité : les plus beaux '
            'seront affichés à la fête de quartier !', jc='both'))
    d.final_sect = SECT(kind='continuous', cols=('custom', [(cm(5.6), cm(0.8)), (cm(11.8), 0)], True), margins=m,
                        footers={'default': f})
    return d, dict(pages=2, features='bandeau titre en tableau tramé avec marges de cellule; sections continues 1 → '
                   '3 colonnes avec ligne séparatrice → 2 colonnes de largeurs inégales; LETTRINE (framePr dropCap); '
                   'image inline + légende avec champ SEQ; citation en exergue (zone de texte wps habillage carré '
                   'chevauchant les colonnes); image recadrée (srcRect) flottante dans une colonne; liens hypertexte '
                   'http et mailto (dans le pied de page); coupure automatique; saut de colonne; tabulations agenda '
                   'avec retrait suspendu; bordures pointillées; Georgia/Verdana')


# ---------------------------------------------------------------------------
def s05():
    d = Doc('Flyer – Fête de quartier des Tilleuls 2026', styles=dict(body_font='Arial', body_sz=12, after=0, line=240),
            subject='Flyer', keywords='flyer; affiche; fond plein page')
    dr = d.draw
    bg = d.img(I('fond_flyer.jpg'))
    pic = d.img(I('paysage2.jpg'))
    d.final_sect = SECT(margins=(cm(1), cm(1), cm(1), cm(1), cm(0.5), cm(0.5), 0))
    w14 = ('<w14:textOutline w14:w="28575" w14:cap="flat" w14:cmpd="sng" w14:algn="ctr"><w14:solidFill>'
           '<w14:srgbClr w14:val="FFFFFF"/></w14:solidFill><w14:prstDash w14:val="solid"/><w14:round/>'
           '</w14:textOutline><w14:shadow w14:blurRad="63500" w14:dist="50800" w14:dir="2700000" w14:sx="100000" '
           'w14:sy="100000" w14:kx="0" w14:ky="0" w14:algn="tl"><w14:srgbClr w14:val="000000"><w14:alpha '
           'w14:val="50000"/></w14:srgbClr></w14:shadow>')
    objs = dr.anchor(bg, 21.0, 29.7, x=0, y=0, relH='page', relV='page', wrap='none', behind=True, name='Fond')
    objs += dr.shape(6.6, 6.0, x=13.4, y=1.0, relH='page', relV='page', geom='irregularSeal1', fill='FFEB3B',
                     line='E53935', line_w=2.5, rot=-12, wrap='none', anchor='ctr', ins=(0.1, 0.1, 0.1, 0.1),
                     text=P(R('Entrée', font='Arial Black', sz=14, color='E53935'), jc='center', sa=0) +
                     P(R('libre !', font='Arial Black', sz=14, color='E53935'), jc='center', sa=0))
    objs += dr.anchor(pic, 12.0, 7.5, x=4.5, y=11.2, relH='page', relV='page', wrap='none', name='Photo',
                      geom='roundRect', line=('FFFFFF', 6), rot=3, descr='Photo du quartier')
    prog = (P(R('Au programme', font='Arial Black', sz=16, color='BF360C'), jc='center', sa=120) +
            ''.join(P(R(h_, b=True, color='BF360C') + R('\t' + t_), tabs=[(cm(2.3), 'left')], sa=60, sz=12)
                    for h_, t_ in (('14 h', 'Vide-greniers et troc de jouets'), ('15 h', 'Spectacle de marionnettes'),
                                   ('16 h 30', 'Concours de gâteaux'), ('18 h', 'Concert de l’harmonie municipale'),
                                   ('20 h', 'Repas partagé – apportez un plat !'), ('22 h', 'Cinéma en plein air'))))
    objs += dr.shape(14.0, 7.2, x=3.5, y=18.9, relH='page', relV='page', geom='roundRect', fill='FFFFFF',
                     line='BF360C', line_w=2, text=prog, wrap='none', ins=(0.6, 0.3, 0.6, 0.3), shadow=True,
                     adj=[('adj', 8000)])
    d.add(P(objs + R('FÊTE DE', font='Arial Black', sz=44, color='BF360C', w14=w14), jc='left', sb=cm(1) // 1,
            ind_left=cm(1)))
    d.add(P(R('QUARTIER', font='Arial Black', sz=60, color='BF360C', w14=w14), ind_left=cm(1), sa=0))
    d.add(P(R('samedi 20 juin 2026', font='Impact', sz=34, color='FFFFFF'), ind_left=cm(1), sa=0))
    d.add(P(R('place des Tilleuls · dès 14 h', font='Arial', sz=18, b=True, color='4E342E'), ind_left=cm(1), sa=0))
    for _ in range(36):
        d.add(P(''))
    d.add(P(R('Organisé par le comité de quartier des Tilleuls avec le soutien de la commune de Valmont-sur-Ourse. '
              'Ne pas jeter sur la voie publique.', sz=7, color='4E342E'), jc='center'))
    return d, dict(pages=1, features='image de fond pleine page DERRIÈRE le texte (behindDoc, relative à la page, '
                   'JPEG); titre WordArt (w14 contour blanc + ombre) en Arial Black et Impact; forme irregularSeal1 '
                   'pivotée (-12°) avec texte; photo flottante devant le texte avec géométrie roundRect, bordure '
                   'blanche 6 pt et rotation 3°; encadré roundRect avec ombre et tabulations; marges 1 cm; '
                   'nombreux paragraphes vides servant d’espacement (pratique courante)')


# ---------------------------------------------------------------------------
def s06():
    d = Doc('Courrier – demande de prêt de salle', theme='office2023',
            styles=dict(body_sz=11, after=160, line=278), subject='Lettre à en-tête', keywords='lettre; en-tête; Aptos')
    dr = d.draw
    W = cm(16.5)

    def hdr_first(part):
        rid = d.img(I('logo_jardin.png'), part)
        return P(dr.shape(21.0, 0.5, x=0, y=0, relH='page', relV='page', geom='rect', fill='2E7D32', line=None,
                          wrap='none', text=None, vml=False) +
                 dr.anchor(rid, 2.3, 2.3, x=0, y=0.3, relH='margin', relV='paragraph', wrap='square', name='Logo') +
                 R(ASSO, b=True, sz=16, color='2E7D32'), style='En-tte', jc='right', sb=200) + \
            P(R('Association loi 1901 – ' + ASSO_ADR, sz=9, color='595959'), style='En-tte', jc='right') + \
            P(R(ASSO_MAIL + ' – 01 99 00 27 15', sz=9, color='595959'), style='En-tte', jc='right')

    def hdr(part):
        return P(R(ASSO, sz=8, color='2E7D32', b=True) + R('\t') + R('Courrier du 9 mars 2026 – page ', sz=8) +
                 FLD('PAGE', '2', sz=8), style='En-tte', tabs=[(W, 'right')])

    def ftr_first(part):
        return P(R('Association déclarée en préfecture – RNA W999000000 – SIRET 999 000 000 00010', sz=7.5,
                   color='7F7F7F'), style='Pieddepage', jc='center', bdr=pbdr(top=('single', 4, 4, '2E7D32')))
    hf = d.header(hdr_first)
    hd = d.header(hdr)
    ff = d.footer(ftr_first)
    d.final_sect = SECT(margins=(cm(4.6), cm(2), cm(2.4), cm(2.5), cm(1.0), cm(1.0), 0),
                        headers={'first': hf, 'default': hd}, footers={'first': ff}, titlePg=True)
    fr = FRAME(cm(8.5), cm(3.6), x=cm(11), y=cm(5.2))
    for k, line in enumerate(('Monsieur le Maire', 'Mairie de Valmont-sur-Ourse', 'Service de la vie associative',
                              '1 place de la République', '99120 VALMONT-SUR-OURSE')):
        d.add(P(line, framePr=fr, sa=0, b=(k == 0)))
    d.add(P(R('Valmont-sur-Ourse, le 9 mars 2026'), jc='right', sb=cm(4.6), sa=360))
    d.add(PM('**Objet :** demande de mise à disposition de la salle polyvalente', sa=0))
    d.add(PM('**Réf. :** notre courrier du 12 janvier 2026', sa=0))
    d.add(PM('**P. J. :** attestation d’assurance, programme prévisionnel', sa=360))
    d.add(P('Monsieur le Maire,', sa=240))
    J = dict(jc='both')
    d.add(P('Comme chaque année, notre association organisera son assemblée générale et la traditionnelle fête des '
            'récoltes, qui réunit habituellement plus de deux cents habitants du quartier. Nous avons l’honneur de '
            'solliciter la mise à disposition gracieuse de la salle polyvalente aux dates suivantes :', **J))
    n = d.numbering
    b = n.bullet('arrow', color='2E7D32')
    for t in ('samedi 28 mars 2026, de 13 h à 18 h : assemblée générale ordinaire ;',
              'samedi 19 septembre 2026, de 9 h à 23 h : fête des récoltes (installation dès le vendredi 18 à 17 h).'):
        d.add(P(t, numId=b, sa=60, **J))
    d.add(P('Pour la fête des récoltes, nous aurions également besoin du matériel suivant, si les services techniques '
            'peuvent le prêter :', sb=120, **J))
    d.add(TBL([TROW([C(P(t, b=True, sa=0), shd='E8F5E9') for t in ('Matériel', 'Quantité', 'Remarque')], header=True)] +
              [TROW([C(P(a, sa=0)), C(P(q_, jc='center', sa=0)), C(P(r_, sa=0, i=True))]) for a, q_, r_ in
               (('Tables pliantes', '20', 'livraison le vendredi'), ('Chaises', '120', ''),
                ('Barnums 3 × 3 m', '4', 'montage par nos bénévoles'), ('Sonorisation portable', '1', 'avec micro sans fil'),
                ('Grilles d’exposition', '10', 'exposition photo'))],
              [cm(6.5), cm(2.5), cm(7.5)], style='Tableaulistelgre-Accentuation2', borders=None))
    d.add(P('', sa=60))
    d.add(P('Notre association est assurée en responsabilité civile pour l’ensemble de ses activités ; vous trouverez '
            'ci-joint l’attestation correspondante. Nous nous engageons à restituer la salle dans l’état où elle nous '
            'aura été confiée et à respecter les consignes de sécurité, notamment la capacité maximale d’accueil et '
            'l’heure de fin des nuisances sonores.', **J))
    d.add(P('Nous restons naturellement à la disposition de vos services pour toute précision, et serions heureux de '
            'vous compter parmi nous lors de ces deux événements.', **J))
    d.add(P('Nous vous prions d’agréer, Monsieur le Maire, l’expression de notre considération distinguée.', **J))
    sig = d.img(I('signature.png'))
    d.add(P('Pour le conseil d’administration,', ind_left=cm(9), sb=240, sa=0, keepNext=True))
    d.add(P('la présidente', ind_left=cm(9), sa=0, keepNext=True))
    d.add(P(dr.inline(sig, 4.0, 1.3, name='Signature'), ind_left=cm(9), sa=0, keepNext=True))
    d.add(P('Odile Ferrand', ind_left=cm(9), b=True))
    return d, dict(pages=2, features='THÈME Office 2023 (Aptos / Aptos Display) – police par défaut récente de Word, '
                   'absente de nombreux serveurs; en-tête de 1re page différent (bandeau forme pleine largeur '
                   'relative à la page + logo flottant) et en-tête de suite avec PAGE; pied de page uniquement en '
                   '1re page; bloc destinataire en cadre framePr (position fenêtre d’enveloppe); tableau style « liste '
                   'claire »; puces flèche Wingdings colorées; image de signature inline; retraits gauche; keepNext')


# ---------------------------------------------------------------------------
def s07():
    d = Doc('Rapport d’activité 2025 – ' + ASSO, settings=dict(even_odd=True),
            styles=dict(body_sz=11, after=120, line=264,
                        h={1: dict(sz=16, color='2E7D32', sb=360, sa=120), 2: dict(sz=13, color='558B2F', sb=200, sa=60)},
                        title=dict(sz=40, color='FFFFFF', b=True)),
            subject='Rapport d’activité', keywords='rapport; sommaire; graphiques')
    dr = d.draw
    n = d.numbering
    outl = n.outline(['Titre1', 'Titre2'], [('decimal', '%1.'), ('decimal', '%1.%2.')], indents=[432, 576],
                     hanging=[432, 576])
    d.styles_kw['h'][1]['numId'] = outl
    d.styles_kw['h'][2]['numId'] = outl
    bul = n.bullet('disc', color='2E7D32')
    W = cm(16)
    m = (cm(2.5), cm(2.5), cm(2.5), cm(2.5), cm(1.2), cm(1.2), 0)

    def hodd(part):
        return P(R('Rapport d’activité 2025', sz=9, color='2E7D32', smallcaps=True) , style='En-tte', jc='right',
                 bdr=pbdr(bottom=('single', 4, 1, '2E7D32')))

    def heven(part):
        return P(R(ASSO, sz=9, color='2E7D32', smallcaps=True), style='En-tte', jc='left',
                 bdr=pbdr(bottom=('single', 4, 1, '2E7D32')))

    def fodd(part):
        return P(FLD('PAGE', '1', sz=9), style='Pieddepage', jc='right')

    def feven(part):
        return P(FLD('PAGE', '2', sz=9), style='Pieddepage', jc='left')
    ho, he, fo, fe = d.header(hodd), d.header(heven), d.footer(fodd), d.footer(feven)
    empty_h = d.header(P('', style='En-tte'))
    empty_f = d.footer(P('', style='Pieddepage'))
    # cover
    logo = d.img(I('logo_jardin.png'))
    cover = dr.shape(21.0, 29.7, x=0, y=0, relH='page', relV='page', geom='rect', grad=('1B5E20', '66BB6A'), line=None,
                     wrap='none', behind=True, text=None, vml=False)
    d.add(P(cover + dr.inline(logo, 4, 4, name='Logo'), jc='center', sb=cm(3) // 1, sa=600))
    d.add(P('Rapport d’activité', style='Titre', jc='center'))
    d.add(P(R('2025', sz=72, b=True, color='C5E1A5'), jc='center', sa=600))
    d.add(P(R(ASSO, sz=16, color='FFFFFF'), jc='center', sa=0))
    d.add(P(R('Présenté à l’assemblée générale du 28 mars 2026', sz=11, i=True, color='E8F5E9'), jc='center'))
    d.add(SECTBREAK(SECT(margins=m, headers={'default': empty_h, 'first': empty_h, 'even': empty_h},
                         footers={'default': empty_f, 'first': empty_f, 'even': empty_f}, titlePg=True)))
    # table of contents + foreword (roman)
    d.add(P('Sommaire', style='En-ttedetabledesmatires'))
    entries = [(1, '1.\tL’association en 2025', '_Toc190001', 1), (2, '1.1.\tNos adhérents', '_Toc190002', 1),
               (2, '1.2.\tLes parcelles', '_Toc190003', 2), (1, '2.\tActivités et animations', '_Toc190004', 2),
               (2, '2.1.\tAteliers', '_Toc190005', 2), (2, '2.2.\tÉvénements', '_Toc190006', 3),
               (1, '3.\tFinances', '_Toc190007', 3), (1, '4.\tPerspectives 2026', '_Toc190008', 4)]
    d.add(TOC(entries, width=W))
    d.add(P(R('Le mot de la présidente', b=True, sz=13, color='558B2F'), sb=480, sa=120))
    d.add(P(md('*Chers adhérents, chers partenaires,*'), jc='both'))
    d.add(P('L’année 2025 restera celle de la croissance : une deuxième parcelle, vingt-trois nouveaux adhérents et '
            'des ateliers qui affichent complet. Rien de tout cela n’aurait été possible sans l’engagement de nos '
            'bénévoles, que je remercie chaleureusement. Ce rapport retrace une année riche, et dessine les chantiers '
            'qui nous attendent en 2026 : la mare pédagogique, l’accueil des scolaires et la recherche d’un local.',
            jc='both'))
    d.add(P(R('Odile Ferrand, présidente', i=True), jc='right'))
    d.add(SECTBREAK(SECT(margins=m, headers={'default': ho, 'even': he}, footers={'default': fo, 'even': fe},
                         pgNum=('lowerRoman', 1))))
    # body (arabic, restart)
    T = lambda bm, txt, st: P(d.bm(bm, R(txt)), style=st)
    d.add(T('_Toc190001', 'L’association en 2025', 'Titre1'))
    d.add(T('_Toc190002', 'Nos adhérents', 'Titre2'))
    # "key figures" box: FLOATING TABLE (tblpPr) wrapped by the text
    kp = '<w:tblpPr w:leftFromText="227" w:rightFromText="0" w:vertAnchor="text" w:horzAnchor="margin" w:tblpXSpec="right" w:tblpY="57"/>'
    d.add(TBL([TROW([C(P(R('Chiffres clés 2025', b=True, color='FFFFFF'), jc='center', sa=0), shd='2E7D32')])] +
              [TROW([C(P(R(v, b=True, sz=16, color='2E7D32') + R('  ' + l, sz=9), sa=0), shd='F1F8E9')])
               for v, l in (('87', 'adhérents'), ('46', 'parcelles'), ('42', 'ateliers'), ('250', 'visiteurs à la fête'))],
              [cm(4.6)], tblpPr=kp, overlap='never', bcolor='A5D6A7'))
    d.add(P(R('Au 31 décembre 2025, l’association comptait ') + R('87 adhérents', b=True) +
            R(' à jour de cotisation, contre 64 un an plus tôt (voir ') +
            FLD('REF fig_adh \\h', 'Figure 1') + R(')') +
            d.endnote('Sont comptés les adhérents ayant réglé leur cotisation entre le 1er janvier et le 31 décembre.') +
            R('. La part des moins de 30 ans progresse nettement grâce au partenariat avec le collège.'), jc='both'))
    d.add(P(d.chart('bar', 'Évolution du nombre d’adhérents', ['2021', '2022', '2023', '2024', '2025'],
                    [('Adhérents', [21, 38, 52, 64, 87]), ('dont moins de 30 ans', [3, 6, 9, 12, 25])],
                    colors=('2E7D32', 'FFA000'), w=15, h=7), jc='center', keepNext=True, sa=0))
    d.add(P(d.bm('fig_adh', R('Figure ') + FLD('SEQ Figure \\* ARABIC', '1')) + R(' – Adhérents de 2021 à 2025'),
            style='Lgende', jc='center'))
    d.add(T('_Toc190003', 'Les parcelles', 'Titre2'))
    d.add(P('Les 42 parcelles individuelles (15 m² en moyenne) sont toutes attribuées ; la liste d’attente compte '
            '11 foyers. Quatre parcelles collectives sont cultivées par les écoles, le centre de loisirs, l’EHPAD '
            'et le foyer de jeunes travailleurs.', jc='both'))
    d.add(TBL([TROW([C(P(t, b=True, sa=0)) for t in ('Site', 'Parcelles', 'Surface (m²)', 'Ouverture')], header=True)] +
              [TROW([C(P(a, sa=0)), C(P(b_, jc='center', sa=0)), C(P(c_, jc='center', sa=0)), C(P(e_, sa=0))])
               for a, b_, c_, e_ in (('Chemin du Moulin', '30', '620', '2021'), ('Rue des Saules', '12', '240', '2025'),
                                     ('Parcelles collectives', '4', '160', '2022'))] +
              [TROW([C(P('Total', sa=0)), C(P('46', jc='center', sa=0)), C(P('1 020', jc='center', sa=0)), C('')])],
              [cm(6), cm(3), cm(3.5), cm(3.5)], style='Tableausimple4-Accentuation1', borders=None, look='06A0'))
    d.add(P(R('Tableau ') + FLD('SEQ Tableau \\* ARABIC', '1') + R(' – Répartition des parcelles'), style='Lgende',
            jc='center'))
    d.add(T('_Toc190004', 'Activités et animations', 'Titre1'))
    d.add(T('_Toc190005', 'Ateliers', 'Titre2'))
    for t in ('18 ateliers enfants avec l’accueil de loisirs (312 participations) ;',
              '12 ateliers « jardiner au naturel » ouverts à tous ;', '8 ateliers compostage avec le syndicat de collecte ;',
              '4 chantiers participatifs (mare, abri à outils, haie, nichoirs).'):
        d.add(P(t, numId=bul, sa=40))
    d.add(T('_Toc190006', 'Événements', 'Titre2'))
    d.add(P(R('La fête des récoltes du 20 septembre a accueilli environ 250 visiteurs') +
            d.footnote('Estimation des bénévoles à partir du nombre de verres de jus de pomme servis.') +
            R('. Le troc de graines d’avril et la soirée « soupe et contes » de novembre ont également rencontré un '
              'beau succès.'), jc='both'))
    d.add(T('_Toc190007', 'Finances', 'Titre1'))
    d.add(P('Les produits de l’exercice s’élèvent à 14 860 € et les charges à 13 925 €. La subvention communale '
            'représente un peu moins du tiers des ressources ; les cotisations et la fête des récoltes en assurent '
            'près de la moitié.', jc='both'))
    d.add(P(d.chart('pie', 'Origine des recettes 2025', ['Cotisations', 'Subvention communale', 'Fête des récoltes',
                                                         'Dons', 'Ventes de plants'],
                    [('Recettes', [1740, 4500, 5120, 1900, 1600])],
                    colors=('2E7D32', '66BB6A', 'FFA000', 'FFD54F', '8D6E63'), w=12, h=7.5), jc='center', sa=0,
            keepNext=True))
    d.add(P(R('Figure ') + FLD('SEQ Figure \\* ARABIC', '2') + R(' – Origine des recettes') +
            d.endnote('Comptes arrêtés par le conseil d’administration du 21 février 2026, avant approbation par '
                      'l’assemblée générale.'), style='Lgende', jc='center'))
    d.add(T('_Toc190008', 'Perspectives 2026', 'Titre1'))
    for t in ('Achever la mare pédagogique et accueillir trois classes par trimestre.',
              'Trouver un local de stockage plus grand, en lien avec la commune.',
              'Créer un groupe « jeunes jardiniers » animé par des lycéens.'):
        d.add(P(t, numId=bul, sa=40))
    d.final_sect = SECT(margins=m, headers={'default': ho, 'even': he}, footers={'default': fo, 'even': fe},
                        pgNum=(None, 1))
    return d, dict(pages=5, features='page de couverture (forme dégradée pleine page derrière le texte, en-têtes '
                   'vides); TABLE DES MATIÈRES (champ TOC précalculé, liens internes + PAGEREF imbriqués, signets '
                   '_Toc); numérotation des pages en chiffres romains puis redémarrage en arabe; en-têtes et pieds '
                   'PAIRS/IMPAIRS; titres numérotés liés à une liste hiérarchique; graphiques histogramme groupé et '
                   'SECTEURS (étiquettes en %) avec classeurs incorporés; légendes SEQ Figure/Tableau; renvoi REF '
                   'vers signet; notes de bas de page et NOTES DE FIN; tableau style avec ligne de total; petites '
                   'capitales; TABLEAU FLOTTANT (tblpPr, aligné à droite, habillage du texte)', notes='Le résultat des champs (TOC, PAGEREF, REF) est précalculé : ne pas mettre à jour '
                   'les champs avant la comparaison.')


# ---------------------------------------------------------------------------
def s08():
    d = Doc('CV – Camille Fournier', styles=dict(body_font='Century Gothic', body_sz=9.5, after=60, line=252),
            subject='Curriculum vitae', keywords='CV; tableau de mise en page; photo')
    dr = d.draw
    av = d.img(I('avatar.jpg'))
    d.final_sect = SECT(margins=(cm(1), cm(1.2), cm(1), cm(1), cm(0.5), cm(0.5), 0))
    WHITE = 'FFFFFF'
    side = []
    side.append(P(dr.inline(av, 3.6, 3.6, name='Photo', geom='ellipse', crop=(0, 0, 0, 0), line=('FFFFFF', 3),
                            descr='Photo (silhouette)'), jc='center', sb=240, sa=240))
    hd_ = lambda t: P(R(t.upper(), b=True, color=WHITE, sz=10.5, spacing=30), sb=240, sa=80,
                      bdr=pbdr(bottom=('single', 6, 2, '90CAF9')))
    side.append(hd_('Contact'))
    for sym, t in (('☎', '01 99 00 58 32'), ('✉', 'camille.fournier@example.org'),
                   ('⌂', 'Valmont-sur-Ourse (99)'), ('★', 'Permis B – véhiculée')):
        side.append(P(R(sym + '  ', font='Segoe UI Symbol', color='90CAF9', sz=11) + R(t, color=WHITE), sa=60))
    side.append(hd_('Compétences'))
    for sk, lv in (('Gestion de projet', 5), ('Animation de réunions', 4), ('Comptabilité associative', 3),
                   ('Communication / réseaux', 4), ('Pack bureautique', 5)):
        dots = ''.join(SYM('F06C' if k < lv else 'F0A1', 'Wingdings', color='90CAF9', sz=9) for k in range(5))
        side.append(P(R(sk, color=WHITE) + R('\t') + dots, tabs=[(cm(5.6), 'right')], sa=40))
    side.append(hd_('Langues'))
    for t in ('Anglais : courant (C1)', 'Espagnol : intermédiaire (B1)', 'LSF : notions'):
        side.append(P(t, color=WHITE, sa=40))
    side.append(hd_('Centres d’intérêt'))
    side.append(P('Jardinage collectif, randonnée, photographie argentique, chorale.', color=WHITE))
    main = []
    main.append(P(R('Camille ', font='Century Gothic', sz=30, color='1F3864') +
                  R('FOURNIER', font='Century Gothic', sz=30, b=True, color='1F3864'), sb=200, sa=0))
    main.append(P(R('Chargée de projets associatifs', sz=13, color='2E75B6', smallcaps=True, spacing=20), sa=200))
    main.append(P('Douze ans d’expérience dans la gestion administrative, puis cinq ans de bénévolat actif dans le '
                  'secteur associatif : je souhaite aujourd’hui mettre mes compétences d’organisation et d’animation au '
                  'service d’un projet d’intérêt général.', jc='both', i=True, color='404040'))
    sec = lambda t: P(R(t, b=True, sz=12, color='1F3864', caps=True), sb=240, sa=100,
                      bdr=pbdr(bottom=('single', 12, 2, '2E75B6')))
    main.append(sec('Expérience professionnelle'))
    exps = [('Depuis 2021', 'Coordinatrice bénévole – Les Jardins partagés du Moulin', [
        'Pilotage de l’ouverture d’un second site (12 parcelles) : budget, convention avec la commune, chantier participatif.',
        'Animation d’une équipe de 25 bénévoles ; organisation de la fête des récoltes (250 visiteurs).',
        'Montage de deux dossiers de subvention (8 500 € obtenus).']),
        ('2014 – 2025', 'Assistante de direction – Coopérative agricole (fictive) des Trois Vallées', [
            'Gestion des agendas de la direction, organisation des conseils d’administration et assemblées générales.',
            'Suivi administratif des adhérents (1 200 exploitations) et des contrats.',
            'Mise en place d’un outil partagé de suivi des réunions.']),
        ('2012 – 2014', 'Secrétaire administrative – Mairie (fictive) de Saint-Exemple', [
            'Accueil du public, état civil, gestion des salles municipales.'])]
    bl = d.numbering.bullet('disc', indent=227, hanging=227, color='2E75B6')
    for dt, title, items in exps:
        main.append(P(R(title, b=True) + R('\t') + R(dt, color='2E75B6', b=True, sz=9), tabs=[(cm(12.3), 'right')],
                      sa=40, keepNext=True))
        for it in items:
            main.append(P(it, numId=bl, sa=20, jc='both'))
        main.append(P('', sa=40, line=120))
    main.append(sec('Formation'))
    for dt, t in (('2024', 'Certificat de formation à la gestion associative (CFGA)'),
                  ('2011', 'BTS Assistant de manager'), ('2009', 'Baccalauréat économique et social')):
        main.append(P(R(t) + R('\t') + R(dt, color='2E75B6', b=True, sz=9), tabs=[(cm(12.3), 'right')], sa=60))
    main.append(sec('Engagements'))
    main.append(P('Trésorière de l’association de parents d’élèves (2018-2021) ; membre du conseil de quartier des '
                  'Tilleuls depuis 2022.', jc='both'))
    d.add(TBL([TROW([C(side, shd='1F3864', mar=(113, 284, 113, 284)), C(main, mar=(0, 400, 0, 200))],
                    height=cm(27.4), rule='atLeast')],
              [cm(6.4), cm(12.6)], borders='none', cellMar=(0, 108, 0, 108)))
    return d, dict(pages=1, features='mise en page en tableau 2 colonnes pleine hauteur (barre latérale tramée, marges '
                   'de cellule spécifiques); photo recadrée en ELLIPSE (pic prstGeom) avec contour; symboles Unicode '
                   'Segoe UI Symbol (☎ ✉ ⌂ ★); jauges de compétences en puces Wingdings (●○); petites capitales et '
                   'capitales; titres de rubrique avec bordure inférieure; tabulations droites pour les dates; '
                   'Century Gothic', notes='Personne fictive, photo = silhouette dessinée.')


# ---------------------------------------------------------------------------
def s09():
    d = Doc('Convocation à l’assemblée générale 2026', styles=dict(body_font='Times New Roman', body_sz=12, after=100,
                                                                   line=240),
            settings=dict(no_shade_forms=False), subject='Convocation et pouvoir', keywords='convocation; formulaire hérité')
    dr = d.draw
    n = d.numbering
    odj = n.decimal(fmts=[('decimal', '%1.')], indent=567, hanging=283, bold=True)
    logo = d.img(I('logo_jardin.png'))
    m1 = (cm(2), cm(2.2), cm(1.6), cm(2.2), cm(1), cm(0.8), 0)
    m2 = (cm(2), cm(1.4), cm(1.6), cm(1.4), cm(1), cm(0.8), 0)
    d.add(P(dr.anchor(logo, 2.2, 2.2, x=0, y=0, relH='margin', relV='paragraph', wrap='square', name='Logo') +
            R(ASSO, b=True, sz=15, color='2E7D32'), sa=0, ind_left=cm(2.6)))
    d.add(P(ASSO_ADR, sz=9.5, ind_left=cm(2.6), sa=0))
    d.add(P(ASSO_MAIL, sz=9.5, ind_left=cm(2.6), sa=480))
    d.add(P(R('Valmont-sur-Ourse, le 9 mars 2026'), jc='right'))
    d.add(P(R('CONVOCATION', b=True, sz=16, spacing=40), jc='center', sb=200, sa=0))
    d.add(P(R('à l’assemblée générale ordinaire', sz=13, i=True), jc='center', sa=240))
    d.add(P('Chère adhérente, cher adhérent,'))
    d.add(P('Conformément à l’article 10 de nos statuts, nous avons le plaisir de vous convier à l’assemblée '
            'générale ordinaire de l’association, qui se tiendra :', jc='both'))
    d.add(P(R('le samedi 28 mars 2026 à 14 h 30', b=True, sz=13) + BR() +
            R('salle polyvalente – place de la Mairie – Valmont-sur-Ourse', sz=12),
            jc='center', shd='E8F5E9', bdr=pbdr(box=('single', 12, 8, '2E7D32')), ind_left=cm(2), ind_right=cm(2),
            sb=120, sa=240))
    d.add(P(R('Ordre du jour', b=True, u='single'), sa=60))
    for t in ('Rapport moral de la présidente', 'Rapport d’activité 2025', 'Rapport financier et approbation des comptes',
              'Budget prévisionnel et cotisation 2027', 'Élection du tiers sortant du conseil d’administration',
              'Questions diverses (à transmettre au bureau avant le 21 mars)'):
        d.add(P(t, numId=odj, sa=20))
    d.add(P('Les documents seront consultables sur place à partir de 14 h. Si vous ne pouvez pas être présent(e), '
            'vous pouvez vous faire représenter par un autre membre en remplissant le pouvoir ci-dessous (deux '
            'pouvoirs au maximum par membre présent).', jc='both', sb=200))
    d.add(P(R('Comptant sur votre présence, nous vous adressons nos cordiales salutations.'), jc='both'))
    d.add(P(R('Le conseil d’administration', i=True), jc='right', sa=360))
    d.add(SECTBREAK(SECT(margins=m1), sa=0))
    # tear-off slip: continuous section with different margins + legacy form fields
    d.add(P(SYM('F022', 'Wingdings', sz=14) + R('  à découper et à remettre à la personne qui vous représente', sz=8,
                                               i=True, color='7F7F7F'),
            bdr=pbdr(bottom=('dashed', 6, 1, '7F7F7F')), sa=200))
    d.add(P(R('POUVOIR', b=True, sz=14, spacing=60), jc='center', sa=120))
    lab = dict(tabs=[(cm(4.2), 'left')], sa=120)
    d.add(P(R('Je soussigné(e)') + R('\t') + d.ff_text('Nom', maxlen=60) +
            R('   membre ') + d.ff_drop('Qualite', ['actif', 'bienfaiteur', 'd’honneur']), **lab))
    d.add(P(R('donne pouvoir à') + R('\t') + d.ff_text('Mandataire', maxlen=60), **lab))
    d.add(P('pour me représenter à l’assemblée générale ordinaire du 28 mars 2026 et prendre part aux votes en mon nom.',
            sa=120))
    d.add(P(R('Consignes de vote (facultatif) : ') + d.ff_check('VoteLibre', True) + R(' vote libre du mandataire   ') +
            d.ff_check('Consignes', False) + R(' selon les consignes jointes'), sa=120))
    d.add(P(R('Fait à') + R('\t') + d.ff_text('Lieu', 'Valmont-sur-Ourse') + R('   le ') + d.ff_text('Date') +
            R('\t'), tabs=[(cm(4.2), 'left'), (cm(17.6), 'left', 'underscore')], sa=240))
    d.add(P(R('Signature précédée de la mention « Bon pour pouvoir » :', i=True, sz=10), sa=900))
    d.final_sect = SECT(kind='continuous', margins=m2)
    return d, dict(pages=2, features='CHAMPS DE FORMULAIRE HÉRITÉS (FORMTEXT avec longueur max et valeur par défaut, '
                   'FORMCHECKBOX cochée/non cochée, FORMDROPDOWN) avec signets; ligne de découpe en bordure tiretée '
                   'et ciseaux Wingdings; section CONTINUE changeant les marges gauche/droite en milieu de page; '
                   'logo flottant habillage carré + retraits; encadré tramé à bordure; liste numérotée en gras',
                   notes='Pas de protection de formulaire active (les champs restent éditables comme texte).')


# ---------------------------------------------------------------------------
def s10():
    d = Doc('Bulletin d’adhésion 2026 – ' + ASSO, styles=dict(body_sz=10.5, after=60, line=252),
            settings=dict(protect_forms=True), subject='Bulletin d’adhésion', keywords='formulaire; contrôles de contenu')
    dr = d.draw
    W = cm(18)
    logo = d.img(I('logo_jardin.png'))
    d.final_sect = SECT(margins=(cm(1.5), cm(1.5), cm(1.3), cm(1.5), cm(0.7), cm(0.6), 0))
    d.add(TBL([TROW([C(P(dr.inline(logo, 2.0, 2.0, name='Logo'), sa=0), valign='center'),
                     C([P(R('Bulletin d’adhésion 2026', sz=20, b=True, color='2E7D32'), sa=0),
                        P(R(ASSO + ' – ' + ASSO_ADR, sz=9, color='595959'), sa=0)], valign='center')])],
              [cm(2.6), cm(15.4)], borders='none'))
    d.add(P(R('Merci de compléter ce bulletin (à l’écran ou à la main) et de le retourner avec votre règlement.',
              i=True, sz=9), sb=120, sa=120))
    F = 'F2F2F2'
    lab = lambda t: C(P(t, b=True, sa=0), valign='center', shd='E8F5E9')
    fld = lambda x, span=1: C(P(x, sa=0), shd=F, valign='center', span=span)
    rows = [TROW([C(P(R('VOS COORDONNÉES', b=True, color='FFFFFF'), sa=0), span=4, shd='2E7D32')]),
            TROW([lab('Nom'), fld(d.sdt_text('Nom')), lab('Prénom'), fld(d.sdt_text('Prénom'))], height=cm(0.8)),
            TROW([lab('Date de naissance'), fld(d.sdt_date('Date de naissance')), lab('Civilité'),
                  fld(d.sdt_drop('Civilité', ['Madame', 'Monsieur', 'Ne se prononce pas']))], height=cm(0.8)),
            TROW([lab('Adresse'), fld(d.sdt_text('Adresse', 'Numéro, rue, complément', multiline=True), 3)],
                 height=cm(1.4)),
            TROW([lab('Code postal'), fld(d.sdt_text('Code postal', '_ _ _ _ _')), lab('Ville'), fld(d.sdt_text('Ville'))],
                 height=cm(0.8)),
            TROW([lab('Téléphone'), fld(d.sdt_text('Téléphone')), lab('Courriel'), fld(d.sdt_text('Courriel'))],
                 height=cm(0.8))]
    d.add(TBL(rows, [cm(3.4), cm(5.6), cm(2.4), cm(6.6)], bcolor='A5D6A7', cellMar=(40, 100, 40, 100)))
    d.add(P('', sa=120))
    trow = lambda lab_, price, note: TROW([C(P(d.sdt_check('Adhésion ' + lab_, sz=12), jc='center', sa=0), valign='center'),
                                          C(P(R(lab_, b=True) + R(note, i=True, sz=9), sa=0), valign='center'),
                                          C(P(R(price + ' €'), tabs=[(cm(1.9), 'decimal')], sa=0), valign='center')],
                                         height=cm(0.75))
    rows = [TROW([C(P(R('TYPE D’ADHÉSION', b=True, color='FFFFFF'), sa=0), span=3, shd='2E7D32')]),
            trow('Individuelle', '15,00', ''), trow('Famille', '25,00', '  (même adresse)'),
            trow('Tarif réduit', '8,00', '  (étudiant, demandeur d’emploi, mineur)'),
            trow('Parcelle individuelle', '35,50', '  (en plus de l’adhésion, selon disponibilité)'),
            TROW([C(P('Don complémentaire (facultatif)', i=True, sa=0), span=2),
                  C(P(d.sdt_text('Don', '…') + R(' €'), jc='right', sa=0), shd=F)], height=cm(0.75))]
    d.add(TBL(rows, [cm(1.4), cm(13.2), cm(3.4)], bcolor='A5D6A7'))
    d.add(P('', sa=120))
    d.add(P(R('Comment avez-vous connu l’association ? ', b=True) +
            d.sdt_drop('Origine', ['Bouche-à-oreille', 'La Gazette des Tilleuls', 'Site internet', 'Fête des récoltes',
                                   'Mairie', 'Autre'], combo=True), sa=120))
    d.add(P(R('Vos centres d’intérêt et compétences que vous aimeriez partager :', b=True), sa=40))
    d.add(d.sdt_block('Centres d’intérêt', P(R('Cliquez ici pour décrire vos centres d’intérêt (bricolage, cuisine, '
                                               'animation enfants, photo…).', style='Textedelespacerserv'),
                                             bdr=pbdr(box=('single', 4, 4, 'A5D6A7')), shd=F) +
                      P('', bdr=pbdr(box=('single', 4, 4, 'A5D6A7')), shd=F)))
    d.add(P(R('Droit à l’image : ', b=True) + R('j’autorise l’association à utiliser des photos où je figure, pour '
                                                 'ses publications non commerciales.  Oui ') + d.sdt_check('Image oui') +
            R('   Non ') + d.sdt_check('Image non'), sb=120))
    d.add(P(R('Règlement : ', b=True) + R('espèces ') + d.sdt_check('Especes') + R('   chèque à l’ordre de '
                                                                       'l’association ') + d.sdt_check('Cheque') +
            R('   virement ') + d.sdt_check('Virement')))
    d.add(P(R('Fait le ', b=True) + d.sdt_date('Date signature') + R('     Signature :', b=True), sb=200, sa=600))
    d.add(P(R('Les informations recueillies sont nécessaires à la gestion de votre adhésion. Elles sont conservées '
              'pendant la durée de l’adhésion puis trois ans, et ne sont jamais transmises à des tiers. Vous pouvez '
              'exercer vos droits d’accès, de rectification et d’effacement en écrivant à ' + ASSO_MAIL +
              ' (règlement (UE) 2016/679).', sz=7.5, color='595959'),
            bdr=pbdr(box=('single', 4, 4, 'BFBFBF')), jc='both'))
    return d, dict(pages=1, features='CONTRÔLES DE CONTENU : texte simple (avec texte d’espace réservé), texte '
                   'multiligne, date (format jj/MM/aaaa, fr-FR), liste déroulante, zone de liste modifiable, cases à '
                   'cocher w14:checkbox (MS Gothic), bloc de texte enrichi; protection « formulaires » déclarée '
                   '(non appliquée); tableau-formulaire avec cellules grisées, fusion gridSpan, lignes de titre '
                   'tramées; taquet décimal en cellule (sans tabulation); mention RGPD encadrée 7,5 pt')
