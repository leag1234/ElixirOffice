# -*- coding: utf-8 -*-
"""Administrative documents of a FICTIONAL local authority (commune of Valmont-sur-Ourse).
No State branding (brand block, Marianne logo) is reproduced; fictional people."""
from ooxml import *  # noqa

IMG = None


def I(name):
    return '%s/%s' % (IMG, name)


COMMUNE = 'Commune de Valmont-sur-Ourse'
MAIRIE_ADR = 'Hôtel de ville – 1 place de la République – 99120 Valmont-sur-Ourse'


# ---------------------------------------------------------------------------
def a01():
    d = Doc('Courrier – demande de pièces complémentaires DP 099 120 26 00018',
            styles=dict(body_font='Marianne', body_sz=10, after=120, line=264),
            settings=dict(track=True), subject='Courrier officiel (projet en relecture)',
            keywords='courrier; révisions; commentaires')
    dr = d.draw
    A1 = 'Service urbanisme – instructrice'
    A2 = 'DGS – relecture'
    D1 = '2026-03-16T10:12:00Z'
    D2 = '2026-03-17T08:47:00Z'
    W = cm(16.5)

    def hdr_first(part):
        rid = d.img(I('logo_commune.png'), part)
        return (P(dr.anchor(rid, 2.0, 2.0, x=0, y=0, relH='margin', relV='paragraph', wrap='square', name='Blason') +
                  R(COMMUNE.upper(), b=True, sz=11, color='1F3864'), style='En-tte', ind_left=cm(2.4)) +
                P(R('Direction générale des services', sz=9), style='En-tte', ind_left=cm(2.4)) +
                P(R('Pôle aménagement – Service urbanisme', sz=9), style='En-tte', ind_left=cm(2.4)))

    def hdr(part):
        return P(R('DP 099 120 26 00018 – suite', sz=8, color='7F7F7F') + R('\t') + FLD('PAGE', '2', sz=8) +
                 R('/', sz=8) + FLD('NUMPAGES', '2', sz=8), style='En-tte', tabs=[(W, 'right')])

    def ftr(part):
        return (P(R(MAIRIE_ADR, sz=7.5, color='595959'), style='Pieddepage', jc='center',
                  bdr=pbdr(top=('single', 4, 4, '1F3864'))) +
                P(R('Accueil du public : du lundi au vendredi, 8 h 30 – 12 h et 13 h 30 – 17 h · Tél. 01 99 00 12 00 · '
                    'urbanisme@valmont-sur-ourse.example.org', sz=7.5, color='595959'), style='Pieddepage', jc='center'))
    hf, hd, ft = d.header(hdr_first), d.header(hdr), d.footer(ftr)
    d.final_sect = SECT(margins=(cm(3.6), cm(2), cm(2.3), cm(2.5), cm(1), cm(0.8), 0),
                        headers={'first': hf, 'default': hd}, footers={'first': ft, 'default': ft}, titlePg=True)
    # references + addressee in a frame
    fr = FRAME(cm(8.2), cm(3.4), x=cm(11.3), y=cm(5.0))
    for k, l in enumerate(('Madame Claire Exemple', '27 rue des Coquelicots', '99120 VALMONT-SUR-OURSE')):
        d.add(P(l, framePr=fr, sa=0, b=(k == 0), sz=10.5))
    for k, v in (('Affaire suivie par', 'Service urbanisme'), ('Nos réf.', 'DGS/URB/2026-118'),
                 ('Dossier', 'DP 099 120 26 00018'), ('Tél.', '01 99 00 12 34')):
        d.add(P(R(k, sz=8.5, color='595959') + R('\t: ' + v, sz=8.5), tabs=[(cm(2.8), 'left')], sa=0))
    d.add(P(R('Valmont-sur-Ourse, le 18 mars 2026'), jc='right', sb=cm(2.6), sa=240))
    d.add(PM('**Objet :** déclaration préalable de travaux – demande de pièces complémentaires', sa=0))
    d.add(P(R('Lettre recommandée avec accusé de réception', i=True, sz=9), sa=240))
    d.add(P('Madame,', sa=200))
    c0 = d.comment(A2, 'DGS', D2, 'Vérifier : le délai d’instruction est-il bien interrompu jusqu’à réception ?')
    c1 = d.comment(A1, 'URB', '2026-03-17T09:15:00Z',
                   'Oui : article R. 423-39 du code de l’urbanisme, le délai court à compter de la réception des pièces.',
                   parent=c0)
    J_old = '<w:jc w:val="left"/>'
    d.add(P(R('Vous avez déposé le 2 mars 2026 une déclaration préalable pour la ') +
            d.dele('construction', A1, D1) + d.ins(R('réalisation'), A1, D1) +
            R(' d’un abri de jardin et le remplacement de votre clôture. Après examen, votre dossier est ') +
            d.dele('complet mais ', A2, D2) + R('incomplet. ') + d.cstart(c0) + d.cstart(c1) +
            R('Le délai d’instruction ne commencera à courir qu’à réception de l’ensemble des pièces manquantes') +
            d.cend(c0) + d.cend(c1) + R('.'),
            jc='both', change=d.ppr_change(A2, D2, J_old)))
    d.add(P(R('Je vous remercie de bien vouloir nous transmettre, dans un délai de ') +
            '<w:r>%s<w:t xml:space="preserve">trois mois</w:t></w:r>' % rpr(b=True, change=d.rpr_change(A2, D2)) +
            R(' à compter de la réception du présent courrier, les pièces suivantes :'), jc='both'))
    n = d.numbering
    li = n.decimal(fmts=[('decimal', '%1.')], indent=567, hanging=283)
    d.add(P('un plan de situation du terrain (pièce DP1) ;', numId=li, sa=40))
    d.add(P('un plan de masse coté dans les trois dimensions (pièce DP2) ;', numId=li, sa=40))
    d.add('<w:p>%s%s</w:p>' % (ppr(numId=li, sa=40, mark=d.mark_ins(A1, D1)),
                               d.ins(R('une représentation de l’aspect extérieur de la clôture, avec indication des '
                                       'matériaux et des couleurs (pièce DP4) ;'), A1, D1)))
    d.add(P('deux photographies permettant de situer le terrain dans le paysage proche et lointain (pièces DP7 et DP8).',
            numId=li, sa=120))
    d.add('<w:p>%s%s</w:p>' % (ppr(jc='both', mark=d.mark_del(A2, D2)),
                               d.dele('Nous vous rappelons que tout dossier incomplet sera systématiquement classé '
                                      'sans suite.', A2, D2)))
    d.add(P(d.move('move_a', 'Les pièces peuvent être déposées à l’accueil de la mairie ou transmises par voie '
                   'électronique sur le guichet numérique des autorisations d’urbanisme. ', A2, D2, to=True) +
            R('Faute de production de l’ensemble de ces pièces dans le délai indiqué, votre demande fera l’objet d’une '
              'décision tacite d’opposition. ') +
            d.move('move_a', 'Les pièces peuvent être déposées à l’accueil de la mairie ou transmises par voie '
                   'électronique sur le guichet numérique des autorisations d’urbanisme.', A2, D2, to=False),
            jc='both'))
    d.add(P('Le service urbanisme se tient à votre disposition pour tout renseignement complémentaire.', jc='both'))
    d.add(P('Je vous prie d’agréer, Madame, l’expression de mes salutations distinguées.', jc='both', sa=360))
    c2 = d.comment(A1, 'URB', D1, 'Signature : adjoint délégué ou maire ? À confirmer avec le cabinet.', done=True)
    d.add(P(R('Pour le Maire et par délégation,'), ind_left=cm(8.5), sa=0, keepNext=True))
    d.add(P(d.cstart(c2) + R('L’adjoint délégué à l’urbanisme') + d.cend(c2), ind_left=cm(8.5), sa=720, keepNext=True))
    d.add(P(R('Jean-Marc Exemple', b=True), ind_left=cm(8.5)))
    d.add(P(md('*Voies et délais de recours : la présente demande ne constitue pas une décision susceptible de recours.*',
               sz=8), sb=360, jc='both'))
    return d, dict(pages=2, features='SUIVI DES MODIFICATIONS actif (trackRevisions) : insertions, suppressions, '
                   'changement de mise en forme (rPrChange), changement de paragraphe (pPrChange), paragraphe inséré '
                   '(marque de paragraphe w:ins), paragraphe supprimé, DÉPLACEMENT (moveFrom/moveTo) — 2 auteurs; '
                   'COMMENTAIRES avec réponse et commentaire résolu; police Marianne (absente des postes standard); '
                   'en-tête 1re page avec blason flottant / en-tête de suite; destinataire en cadre framePr; bloc de '
                   'références avec tabulations; pied de page institutionnel',
                   notes='Comparer en mode d’affichage des révisions identique des deux côtés (Word « Toutes les '
                         'marques » vs version finale).')


# ---------------------------------------------------------------------------
STREETS = ['rue de la Gare', 'avenue des Peupliers', 'rue des Tilleuls', 'place du Marché', 'impasse des Lilas',
           'rue Victor-Hugo', 'rue Jean-Jaurès', 'boulevard de la Liberté', 'chemin du Moulin', 'rue des Écoles',
           'allée des Charmes', 'rue du Stade', 'route de Saint-Exemple', 'rue Pasteur', 'quai de l’Ourse',
           'rue des Jardins', 'rue de la Fontaine', 'place de l’Église', 'rue des Saules', 'avenue du Général-Leclerc']


def a02():
    d = Doc('Arrêté municipal n° 2026-047 – circulation et stationnement',
            styles=dict(body_font='Times New Roman', body_sz=12, after=120, line=240),
            subject='Arrêté municipal', keywords='arrêté; numérotation des lignes; tableau multi-pages')
    dr = d.draw
    W = cm(16)

    def ftr(part):
        return P(R('Arrêté n° 2026-047', sz=9, i=True) + R('\t') + R('Page ', sz=9) + FLD('PAGE', '1', sz=9) +
                 R(' sur ', sz=9) + FLD('NUMPAGES', '3', sz=9), style='Pieddepage', tabs=[(W, 'right')])
    f = d.footer(ftr)
    d.final_sect = SECT(margins=(cm(2), cm(2), cm(2), cm(3), cm(1), cm(1), 0), footers={'default': f},
                        lnNum=(5, 'newPage', 283))
    logo = d.img(I('logo_commune.png'))
    d.add(TBL([TROW([C([P(dr.inline(logo, 1.8, 1.8, name='Blason'), jc='center', sa=0),
                        P('RÉPUBLIQUE FRANÇAISE', b=True, sz=9, jc='center', sa=0),
                        P(COMMUNE, sz=9, jc='center', sa=0)]),
                     C([P('ARRÊTÉ MUNICIPAL', b=True, sz=14, jc='right', sa=0),
                        P('N° 2026-047', b=True, sz=12, jc='right', sa=0),
                        P('Service : police municipale', sz=9, i=True, jc='right', sa=0)], valign='center')])],
              [cm(6), cm(10)], borders='none'))
    d.add(P(R('portant réglementation temporaire de la circulation et du stationnement pendant les travaux de '
              'réaménagement de la rue des Tilleuls', b=True), jc='center', sb=240, sa=360,
            bdr=pbdr(top=('single', 6, 6, '000000'), bottom=('single', 6, 6, '000000')), ind_left=cm(1), ind_right=cm(1)))
    d.add(P('Le Maire de la commune de Valmont-sur-Ourse,', b=True, sa=200))
    J = dict(jc='both', ind_left=cm(0.8), hanging=cm(0.8), sa=80)
    for v in (md('**VU** le code général des collectivités territoriales, notamment ses articles L. 2212-1, L. 2212-2 '
                 'et L. 2213-1 à L. 2213-6 ;'),
              md('**VU** le code de la route, notamment ses articles R. 411-8, R. 411-25 et R. 417-10 ;'),
              md('**VU** l’instruction interministérielle sur la signalisation routière, livre I, huitième partie, '
                 'relative à la signalisation temporaire') + d.footnote('Instruction interministérielle sur la '
                                                                        'signalisation routière, approuvée par arrêté '
                                                                        'du 6 novembre 1992 modifié.') + R(' ;'),
              md('**VU** la demande présentée le 2 mars 2026 par l’entreprise chargée des travaux ;')):
        d.add(P(v, **J))
    d.add(P(md('**CONSIDÉRANT** que les travaux de réaménagement de la rue des Tilleuls (élargissement des trottoirs, '
               'plantations, création d’une piste cyclable) nécessitent de réglementer la circulation et le '
               'stationnement afin d’assurer la sécurité des usagers et des personnels du chantier ;'), **J))
    d.add(P(R('A R R Ê T E', b=True, sz=13, spacing=80), jc='center', sb=240, sa=240))
    arts = [
        ('Article 1er', 'Du lundi 13 avril 2026 au vendredi 26 juin 2026 inclus, de 7 h 30 à 18 h, la circulation de '
                        'tous les véhicules sera alternée par feux tricolores rue des Tilleuls, dans sa section comprise '
                        'entre la place du Marché et l’avenue des Peupliers.'),
        ('Article 2', 'Pendant la même période, le stationnement sera interdit et considéré comme gênant, au sens de '
                      'l’article R. 417-10 du code de la route, sur les emplacements énumérés en annexe au présent '
                      'arrêté. Les véhicules en infraction pourront être mis en fourrière.'),
        ('Article 3', 'La vitesse sera limitée à 30 km/h aux abords du chantier. Le dépassement y est interdit.'),
        ('Article 4', 'Les dispositions des articles 1 à 3 ne s’appliquent pas aux véhicules de secours, de police, '
                      'de collecte des déchets ni aux véhicules de l’entreprise chargée des travaux.'),
        ('Article 5', 'La signalisation réglementaire sera mise en place, entretenue et déposée par l’entreprise '
                      'chargée des travaux, sous le contrôle des services techniques municipaux.'),
        ('Article 6', 'Le présent arrêté sera affiché en mairie et sur les lieux des travaux, et publié sous forme '
                      'électronique sur le site internet de la commune') ,
        ('Article 7', 'Monsieur le Directeur général des services, Monsieur le chef de la police municipale et '
                      'Monsieur le commandant de la brigade de gendarmerie sont chargés, chacun en ce qui le concerne, '
                      'de l’exécution du présent arrêté.'),
    ]
    for t, body in arts:
        d.add(P(R(t, b=True, u='single'), keepNext=True, sb=120, sa=60))
        extra = ''
        if t == 'Article 6':
            extra = d.footnote('Article L. 2131-1 du code général des collectivités territoriales.') + R('.')
        d.add(P(R(body) + extra, jc='both'))
    d.add(P(R('Fait à Valmont-sur-Ourse, le 30 mars 2026'), ind_left=cm(8), sb=360, sa=0, keepNext=True))
    stamp = d.img(I('cachet.png'))
    sig = d.img(I('signature.png'))
    d.add(P(R('Le Maire,'), ind_left=cm(8), sa=0, keepNext=True))
    d.add(P(dr.anchor(stamp, 3.2, 3.2, x=7.0, y=-0.2, relH='margin', relV='paragraph', wrap='none', name='Cachet',
                      descr='Cachet de la mairie (fictif)') +
            dr.anchor(sig, 4.2, 1.35, x=9.0, y=0.4, relH='margin', relV='paragraph', wrap='none', name='Signature'),
            ind_left=cm(8), sa=900, keepNext=True))
    d.add(P(R('Pierre-Yves Exemple', b=True), ind_left=cm(8), sa=360))
    d.add(P(R('Le présent arrêté peut faire l’objet d’un recours contentieux devant le tribunal administratif '
              'territorialement compétent dans un délai de deux mois à compter de sa publication. Le tribunal peut être '
              'saisi par l’application « Télérecours citoyens ».', i=True, sz=9), jc='both',
            bdr=pbdr(box=('single', 4, 4, '7F7F7F')), suppressLineNumbers=True))
    # appendix: multi-page table with repeated header row
    d.add(P(R('Annexe à l’arrêté n° 2026-047', b=True, sz=13), jc='center', pageBreakBefore=True, sa=60,
            suppressLineNumbers=True))
    d.add(P(R('Liste des emplacements de stationnement neutralisés', i=True), jc='center', sa=200,
            suppressLineNumbers=True))
    rows = [TROW([C(P(t, b=True, jc='center', sa=0), shd='D9D9D9', valign='center') for t in
                  ('N°', 'Voie', 'Côté', 'Emplacement (au droit du n°)', 'Période')], header=True, height=cm(0.8))]
    k = 0
    for street in STREETS[:12]:
        for side, nums in (('pair', (2, 8)), ('impair', (1, 9)), ('pair', (10, 16))):
            k += 1
            per = 'phase 1' if k % 3 else 'phases 1 et 2'
            rows.append(TROW([C(P(str(k), jc='center', sa=0)), C(P(street, sa=0)), C(P(side, jc='center', sa=0)),
                              C(P('du %d au %d' % nums, sa=0)), C(P(per, sa=0, i=(per != 'phase 1')))],
                             cantSplit=True))
    d.add(TBL(rows, [cm(1.2), cm(5.8), cm(1.8), cm(4.2), cm(3)], bcolor='000000'))
    return d, dict(pages=3, features='NUMÉROTATION DES LIGNES (lnNumType tous les 5, redémarrage par page) avec '
                   'paragraphes exclus (suppressLineNumbers); en-tête en tableau sans bordure; titre encadré '
                   'haut/bas; « VU / CONSIDÉRANT » en retrait suspendu; espacement de caractères (A R R Ê T E); '
                   'notes de bas de page; cachet et signature flottants SUPERPOSÉS au texte (wrapNone, devant); '
                   'annexe après saut de page avec TABLEAU DE 37 LIGNES sur plusieurs pages et ligne d’en-tête '
                   'répétée; Page X sur Y; Times New Roman', notes='Cachet et signature : images dessinées, fictives.')


# ---------------------------------------------------------------------------
def a03():
    d = Doc('Note de service n° 2026-12 – Plan de continuité informatique',
            styles=dict(body_sz=11, after=100, line=264,
                        h={1: dict(sz=12.5, color='1F3864', b=True, sb=240, sa=60),
                           2: dict(sz=11, color='2E75B6', b=True, sb=120, sa=40),
                           3: dict(sz=11, color='404040', b=False, i=True, sb=80, sa=20)}),
            subject='Note de service', keywords='note de service; filigrane; plan administratif')
    dr = d.draw
    n = d.numbering
    plan = n.outline(['Titre1', 'Titre2', 'Titre3'], [('upperRoman', '%1.'), ('upperLetter', '%2.'), ('decimal', '%3.')],
                     indents=[567, 851, 1134], hanging=[567, 425, 283])
    for k in (1, 2, 3):
        d.styles_kw['h'][k]['numId'] = plan
    arr = n.bullet('arrow', color='1F3864')
    W = cm(17)

    def hdr(part):
        return P(dr.watermark('DOCUMENT DE TRAVAIL', font='Calibri', color='D9D9D9', w=17, h=3.2), style='En-tte')

    def ftr(part):
        return P(R('Note de service n° 2026-12 – diffusion interne', sz=8, color='7F7F7F') + R('\t') +
                 FLD('PAGE', '1', sz=8), style='Pieddepage', tabs=[(W, 'right')])
    h, f = d.header(hdr), d.footer(ftr)
    d.final_sect = SECT(margins=(cm(1.8), cm(2), cm(1.8), cm(2), cm(0.8), cm(0.8), 0), headers={'default': h},
                        footers={'default': f})
    logo = d.img(I('logo_service.png'))
    d.add(TBL([TROW([C(P(dr.inline(logo, 1.6, 1.6, name='Logo'), jc='center', sa=0), valign='center'),
                     C([P(R('NOTE DE SERVICE', b=True, sz=20, color='1F3864', spacing=20), sa=0),
                        P(R(COMMUNE + ' – Direction des systèmes d’information', sz=9, color='595959'), sa=0)],
                       valign='center'),
                     C(P(R('N° 2026-12', b=True, sz=12, color='FFFFFF'), jc='center', sa=0), shd='1F3864',
                       valign='center')], height=cm(2))],
              [cm(2.2), cm(11.8), cm(3)], borders='h', bcolor='1F3864', bsz=12))
    d.add(P('', sa=60))
    mrow = lambda k, v: TROW([C(P(k, b=True, sa=0), shd='DEEAF6'), C(P(v, sa=0) if not is_xml(v) else v)])
    d.add(TBL([mrow('Émetteur', 'Direction des systèmes d’information (DSI)'),
               mrow('Destinataires', 'Ensemble des agents des services administratifs et techniques'),
               mrow('Copie', 'Directeur général des services ; responsables de pôle'),
               mrow('Date', '23 mars 2026'),
               mrow('Objet', P(R('Coupure programmée du réseau et ', b=True) +
                               R('procédure de continuité de service', b=True, hl='yellow'), sa=0))],
              [cm(3.4), cm(13.6)], bcolor='9DC3E6'))
    J = dict(jc='both')
    d.add(P('Contexte', style='Titre1'))
    d.add(P(md('Dans le cadre du remplacement des équipements du cœur de réseau, une **coupure générale** du système '
               'd’information est programmée le **samedi 11 avril 2026 de 7 h à 19 h**. Pendant cette période, '
               'aucun service informatique ne sera disponible : messagerie, logiciels métiers, téléphonie sur IP, '
               'accès internet et imprimantes partagées.'), **J))
    d.add(P('Mesures à prendre', style='Titre1'))
    d.add(P('Avant la coupure', style='Titre2'))
    d.add(P('Postes de travail', style='Titre3'))
    for t in ('enregistrer et fermer tous les documents ouverts le vendredi 10 avril avant 17 h ;',
              'éteindre complètement les postes (et non les mettre en veille) ;',
              'ne pas débrancher les écrans ni les stations d’accueil.'):
        d.add(P(t, numId=arr, sa=40, **J))
    d.add(P('Services accueillant du public', style='Titre3'))
    d.add(P(md('Les services de l’état civil et de la police municipale, ouverts le samedi, disposeront de '
               '==registres papier== et d’un téléphone portable de secours. Les formulaires de secours sont '
               'disponibles sur l’intranet : ') + d.link('http://intranet.valmont-sur-ourse.example/dsi/continuite',
                                                         'intranet / DSI / continuité') + R('.'), **J))
    d.add(P('Après la coupure', style='Titre2'))
    d.add(P(md('Le lundi 13 avril, allumer son poste **à partir de 8 h** seulement, afin d’échelonner les mises à jour. '
               'Tout dysfonctionnement doit être signalé au support (poste 4400) en précisant le numéro d’inventaire '
               'du matériel.'), **J))
    d.add(P('Contacts', style='Titre1'))
    d.add(TBL([TROW([C(P(t, b=True, color='FFFFFF', sa=0), shd='2E75B6') for t in ('Rôle', 'Joignable', 'Contact')],
                    header=True)] +
              [TROW([C(P(a, sa=0)), C(P(b, sa=0)), C(P(c, sa=0, sz=9.5))]) for a, b, c in (
                  ('Support informatique', 'lundi – vendredi, 8 h – 18 h', 'poste 4400 – support@valmont-sur-ourse.example.org'),
                  ('Astreinte DSI', 'samedi 11 avril, 7 h – 19 h', '01 99 00 44 01'),
                  ('Responsable du projet', 'heures ouvrées', 'dsi@valmont-sur-ourse.example.org'))],
              [cm(5), cm(5.5), cm(6.5)], style='Tableausimple4-Accentuation1', borders=None, look='0420'))
    d.add(P(R('Le directeur des systèmes d’information', i=True), jc='right', sb=360))
    return d, dict(pages=2, features='FILIGRANE VML « DOCUMENT DE TRAVAIL » (en-tête); plan administratif '
                   'NUMÉROTÉ I. / A. / 1. lié aux styles Titre 1-3 (liste multiniveau); en-tête en tableau avec '
                   'bordures horizontales épaisses et cellule tramée; tableau « mémo » (émetteur, destinataires...); '
                   'surlignage jaune; puces flèches; lien hypertexte intranet; tableau style Grille 4 sans 1re '
                   'colonne (tblLook 0420)')


# ---------------------------------------------------------------------------
def a04():
    d = Doc('Procès-verbal – comité technique du 12 février 2026 (projet)', compat=12,
            styles=dict(body_font='Arial', body_sz=10.5, after=100, line=252,
                        h={1: dict(font='Arial', sz=11.5, color='000000', b=True, caps=True, sb=240, sa=80,
                                   pextra=pbdr(bottom=('single', 4, 1, '000000')))}),
            settings=dict(track=True), subject='Procès-verbal', keywords='PV; révisions; compatibilité Word 2007')
    n = d.numbering
    W = cm(17)
    A1, A2 = 'Secrétariat du comité', 'Représentant du personnel'
    D1, D2 = '2026-02-16T14:05:00Z', '2026-02-18T11:30:00Z'

    def ftr(part):
        return P(R('PV du comité technique du 12/02/2026 – projet soumis à approbation', sz=8) + R('\t') +
                 FLD('PAGE', '1', sz=8) + R('/', sz=8) + FLD('NUMPAGES', '2', sz=8), style='Pieddepage',
                 tabs=[(W, 'right')])
    f = d.footer(ftr)
    d.final_sect = SECT(margins=(cm(2), cm(2), cm(2), cm(2), cm(1), cm(1), 0), footers={'default': f})
    d.add(P(R(COMMUNE.upper(), b=True, sz=10), sa=0))
    d.add(P(R('Comité social territorial – formation spécialisée', sz=9), sa=360))
    d.add(P(R('PROCÈS-VERBAL DE LA SÉANCE DU 12 FÉVRIER 2026', b=True, sz=14), jc='center', sa=60))
    d.add(P(R('Séance ouverte à 9 h 35 – salle du conseil', i=True), jc='center', sa=240))
    d.add(P('Composition et présences', style='Titre1'))
    chk = lambda on: C(P(SYM('F0FC', 'Wingdings', sz=12) if on else R(''), jc='center', sa=0), valign='center')
    rows = [TROW([C(P(t, b=True, jc='center', sa=0), shd='D9D9D9') for t in
                  ('Nom', 'Collège', 'Présent', 'Excusé', 'Pouvoir à')], header=True)]
    people = [('Mme A. Exemple', 'employeur', 1, 0, ''), ('M. B. Exemple', 'employeur', 1, 0, ''),
              ('Mme C. Exemple', 'employeur', 0, 1, 'Mme A. Exemple'), ('M. D. Exemple', 'personnel', 1, 0, ''),
              ('Mme E. Exemple', 'personnel', 1, 0, ''), ('M. F. Exemple', 'personnel', 0, 1, '')]
    for nm, col, p_, e_, pw in people:
        rows.append(TROW([C(P(nm, sa=0)), C(P(col, sa=0, jc='center')), chk(p_), chk(e_), C(P(pw, sa=0))]))
    rows.append(TROW([C(P(d.ins(R('Mme G. Exemple'), A2, D2), sa=0)),
                      C(P(d.ins(R('personnel (suppléante)'), A2, D2), sa=0, jc='center')),
                      C(P(d.ins(SYM('F0FC', 'Wingdings', sz=12), A2, D2), jc='center', sa=0)), C(P('', sa=0)),
                      C(P('', sa=0))], ins=d.row_ins(A2, D2)))
    d.add(TBL(rows, [cm(4.5), cm(3.2), cm(2), cm(2), cm(5.3)], bcolor='7F7F7F'))
    d.add(P(md('Le quorum étant atteint, la présidente ouvre la séance. M. D. Exemple est désigné secrétaire adjoint '
               'de séance.'), sb=120, jc='both'))
    d.add(P('Approbation du procès-verbal précédent', style='Titre1'))
    d.add(P(R('Le procès-verbal de la séance du 14 novembre 2025 est approuvé ') + d.dele('à la majorité', A1, D1) +
            d.ins(R('à l’unanimité'), A1, D1) + R(' des membres présents.'), jc='both'))
    d.add(P('Points examinés', style='Titre1'))
    c0 = d.comment(A2, 'RP', D2, 'Merci d’ajouter la remarque sur le calendrier de consultation des agents.')
    d.add(P(md('**1. Organisation du temps de travail des services techniques.** ') + d.cstart(c0) +
            R('La collectivité présente le projet d’annualisation du temps de travail pour les agents des espaces '
              'verts, avec une saison haute de 39 heures hebdomadaires d’avril à septembre et une saison basse de 32 '
              'heures.') + d.cend(c0) +
            d.ins(R(' Les représentants du personnel demandent qu’une consultation des agents concernés soit organisée '
                    'avant la mise en œuvre.'), A2, D2), jc='both'))
    d.add(P(md('**2. Plan de formation 2026.** Le plan prévoit 412 jours de formation, dont 38 % consacrés à la '
               'prévention des risques professionnels.'), jc='both'))
    c1 = d.comment(A1, 'SEC', D1, 'Chiffre à confirmer par le service RH.')
    d.add(P(R('3. Rapport social unique. ', b=True) + R('Les effectifs au 31 décembre 2025 s’élèvent à ') +
            d.cstart(c1) + R('186 agents') + d.cend(c1) + R(', dont 141 titulaires.'), jc='both'))
    d.add(P('Relevé des avis', style='Titre1'))
    num = n.decimal(fmts=[('decimal', '%1')], indent=0, hanging=0)
    rows = [TROW([C(P(t, b=True, sa=0), shd='D9D9D9') for t in ('N°', 'Objet', 'Collège employeur', 'Collège personnel', 'Avis')],
                 header=True)]
    for obj, e_, p_, av in (('Annualisation du temps de travail (espaces verts)', 'favorable', 'défavorable',
                             'Avis partagé – nouvelle consultation'),
                            ('Plan de formation 2026', 'favorable', 'favorable', 'Avis favorable'),
                            ('Mise à jour du document unique (DUERP)', 'favorable', 'favorable', 'Avis favorable'),
                            ('Charte du télétravail', 'favorable', 'abstention', 'Avis favorable')):
        rows.append(TROW([C(P('', numId=num, jc='center', sa=0)), C(P(obj, sa=0)), C(P(e_, sa=0, jc='center')),
                          C(P(p_, sa=0, jc='center')), C(P(av, sa=0, b=True))]))
    d.add(TBL(rows, [cm(1.2), cm(6.3), cm(2.8), cm(2.8), cm(3.9)], bcolor='7F7F7F'))
    d.add(P('L’ordre du jour étant épuisé, la séance est levée à 11 h 50.', sb=200))
    d.add(TBL([TROW([C([P('La présidente du comité', b=True, jc='center', sa=720), P('Mme A. Exemple', jc='center', sa=0)]),
                     C([P('Le secrétaire de séance', b=True, jc='center', sa=720), P('M. B. Exemple', jc='center', sa=0)]),
                     C([P('Le secrétaire adjoint', b=True, jc='center', sa=720), P('M. D. Exemple', jc='center', sa=0)])],
                    cantSplit=True)], [cm(5.6), cm(5.7), cm(5.7)], borders='none'))
    return d, dict(pages=2, features='MODE DE COMPATIBILITÉ Word 2007 (compat 12); suivi des modifications : '
                   'LIGNE DE TABLEAU INSÉRÉE (trPr/w:ins), insertions/suppressions dans le texte; commentaires; '
                   'cases cochées Wingdings dans tableau; NUMÉROTATION AUTOMATIQUE DANS LES CELLULES (liste '
                   'numérotée sans texte); titres en capitales avec bordure inférieure; signatures en 3 colonnes; Arial',
                   notes='Noms de personnes réduits à des initiales fictives.')


# ---------------------------------------------------------------------------
def a05():
    d = Doc('Attestation de stage', styles=dict(body_font='Times New Roman', body_sz=12, after=160, line=300),
            subject='Attestation', keywords='attestation; bordure de page; cachet')
    dr = d.draw
    logo = d.img(I('logo_commune.png'))
    stamp = d.img(I('cachet.png'))
    sig = d.img(I('signature.png'))

    def ftr(part):
        return P(R(MAIRIE_ADR + ' – rh@valmont-sur-ourse.example.org', sz=8, color='595959'), style='Pieddepage',
                 jc='center')
    f = d.footer(ftr)
    d.final_sect = SECT(margins=(cm(2.5), cm(2.5), cm(2.5), cm(2.5), cm(1.2), cm(1.2), 0), footers={'default': f},
                        pgBorders=page_borders('thinThickSmallGap', 24, 24, '1F3864', offset='page'))
    d.add(P(dr.anchor(logo, 2.2, 2.2, x=0, y=0, relH='margin', relV='paragraph', wrap='square', name='Blason') +
            R('MAIRIE DE VALMONT-SUR-OURSE', b=True, sz=12, color='1F3864'), sa=0, ind_left=cm(2.8)))
    d.add(P(R('Direction des ressources humaines', sz=10), ind_left=cm(2.8), sa=0))
    d.add(P(R('Réf. : DRH/STG/2026-031', sz=9, color='595959'), ind_left=cm(2.8), sa=720))
    d.add(P(R('Attestation de stage', b=True, sz=22, smallcaps=True, spacing=30, color='1F3864'), jc='center',
            sb=360, sa=480, bdr=pbdr(bottom=('double', 6, 4, '1F3864'))))
    d.add(P('Je soussigné, Directeur général des services de la commune de Valmont-sur-Ourse, atteste que :', jc='both'))
    L = [(cm(5.5), 'left'), (cm(16), 'left', 'dot')]
    for k, v in (('Nom et prénom', 'Mme Léa EXEMPLE'), ('Établissement', 'Lycée professionnel des Trois-Rivières (fictif)'),
                 ('Formation', 'Baccalauréat professionnel AGOrA, 1re année'), ('Service d’accueil', 'Service état civil – élections'),
                 ('Période', 'du 5 janvier 2026 au 13 février 2026 inclus'), ('Durée effective', '6 semaines, soit 210 heures')):
        d.add(P(R(k, b=True) + R('\t: ') + R(v) + R('\t'), tabs=L, ind_left=cm(0.5), sa=80))
    d.add(P('a effectué un stage de formation en milieu professionnel au sein de nos services, dans le cadre de la '
            'convention signée avec son établissement. Au cours de ce stage, elle a notamment participé à l’accueil '
            'physique et téléphonique du public, à la préparation des listes électorales et à la mise à jour de '
            'registres.', jc='both', sb=200))
    d.add(P('La présente attestation est délivrée à l’intéressée pour servir et valoir ce que de droit.', jc='both'))
    d.add(P(R('Fait à Valmont-sur-Ourse, le 13 février 2026'), ind_left=cm(8.5), sb=360, sa=0, keepNext=True))
    d.add(P(R('Le Directeur général des services,'), ind_left=cm(8.5), sa=0, keepNext=True))
    d.add(P(dr.anchor(stamp, 3.6, 3.6, x=9.2, y=-0.6, relH='margin', relV='paragraph', wrap='none', behind=True,
                      name='Cachet') +
            dr.anchor(sig, 4.4, 1.4, x=10.0, y=0.5, relH='margin', relV='paragraph', wrap='none', name='Signature'),
            ind_left=cm(8.5), sa=1100, keepNext=True))
    d.add(P(R('Jean-Marc EXEMPLE', b=True, smallcaps=True), ind_left=cm(8.5)))
    return d, dict(pages=1, features='BORDURE DE PAGE double épaisse-fine (pgBorders, depuis le bord de la page); '
                   'blason flottant + retrait gauche; titre en petites capitales espacées avec double bordure '
                   'inférieure; champs « clé : valeur » avec tabulations et points de suite; interligne 1,25; cachet '
                   'DERRIÈRE le texte (behindDoc) chevauché par une signature DEVANT (wrapNone); Times New Roman',
                   notes='Personnes fictives (« Exemple »).')


# ---------------------------------------------------------------------------
def a06():
    d = Doc('Rapport annuel 2025 – Service de la petite enfance',
            styles=dict(body_sz=10.5, after=120, line=264,
                        h={1: dict(sz=16, color='1F3864', sb=360, sa=120),
                           2: dict(sz=13, color='2E75B6', sb=200, sa=60),
                           3: dict(sz=11, color='1F3864', sb=120, sa=40, b=True)},
                        title=dict(sz=30, color='1F3864')),
            subject='Rapport multi-sections', keywords='rapport; table des matières; notes; tableaux longs')
    dr = d.draw
    n = d.numbering
    outl = n.outline(['Titre1', 'Titre2', 'Titre3'], [('decimal', '%1.'), ('decimal', '%1.%2.'), ('decimal', '%1.%2.%3.')],
                     indents=[432, 576, 720], hanging=[432, 576, 720])
    for k in (1, 2, 3):
        d.styles_kw['h'][k]['numId'] = outl
    bul = n.bullet('disc')
    W = cm(16)
    LW = cm(25.7)
    mP = (cm(2.5), cm(2.5), cm(2.5), cm(2.5), cm(1.2), cm(1.2), 0)
    mL = (cm(2.5), cm(2), cm(2.2), cm(2), cm(1.2), cm(1.2), 0)

    def hdr(width):
        def b(part):
            return P(R(COMMUNE + ' – Rapport annuel 2025', sz=8.5, color='7F7F7F') + R('\t') +
                     FLD('STYLEREF "Titre 1" \\n', '1.', sz=8.5, color='1F3864') + R(' ', sz=8.5) +
                     FLD('STYLEREF "Titre 1"', 'Présentation du service', sz=8.5, color='1F3864', b=True),
                     style='En-tte', tabs=[(width, 'right')], bdr=pbdr(bottom=('single', 4, 1, 'A6A6A6')))
        return b

    def ftr(width, roman=False):
        def b(part):
            return P(R('Service de la petite enfance', sz=8.5, color='7F7F7F') + R('\t') +
                     FLD('PAGE', 'i' if roman else '1', sz=9), style='Pieddepage', tabs=[(width, 'right')])
        return b
    hP, hL = d.header(hdr(W)), d.header(hdr(LW))
    fR, fP, fL = d.footer(ftr(W, True)), d.footer(ftr(W)), d.footer(ftr(LW))
    eh = d.header(P('', style='En-tte'))
    ef = d.footer(P('', style='Pieddepage'))
    # 1. cover page, vertically centred
    logo = d.img(I('logo_commune.png'))
    d.add(P(dr.inline(logo, 3.5, 3.5, name='Blason'), jc='center', sa=480))
    d.add(P(COMMUNE, jc='center', sz=14, color='595959', sa=120))
    d.add(P('Rapport annuel d’activité 2025', style='Titre', jc='center'))
    d.add(P(R('Service de la petite enfance', sz=18, color='2E75B6'), jc='center', sa=480))
    d.add(P(R('Présenté au conseil municipal du 22 avril 2026', i=True), jc='center',
            bdr=pbdr(top=('single', 4, 8, '2E75B6')), ind_left=cm(3), ind_right=cm(3)))
    d.add(SECTBREAK(SECT(margins=mP, vAlign='center', headers={'default': eh}, footers={'default': ef})))
    # 2. tables of contents (roman page numbers)
    d.add(P('Sommaire', style='En-ttedetabledesmatires'))
    E = [(1, '1.\tPrésentation du service', '_Toc300001', 1), (2, '1.1.\tMissions', '_Toc300002', 1),
         (2, '1.2.\tÉquipements', '_Toc300003', 1), (1, '2.\tActivité 2025', '_Toc300004', 2),
         (2, '2.1.\tFréquentation', '_Toc300005', 2), (3, '2.1.1.\tAccueil collectif', '_Toc300006', 2),
         (3, '2.1.2.\tAccueil familial', '_Toc300007', 3), (2, '2.2.\tListe détaillée des places', '_Toc300008', 3),
         (1, '3.\tMoyens financiers', '_Toc300009', 5), (1, '4.\tPerspectives', '_Toc300010', 6),
         (1, 'Glossaire', '_Toc300011', 6)]
    d.add(TOC(E, width=W))
    d.add(P('Liste des tableaux', style='En-ttedetabledesmatires', sb=480))
    d.add(TOC([('Tabledesillustrations', 'Tableau 1 – Équipements d’accueil', '_Toc300101', 1),
               ('Tabledesillustrations', 'Tableau 2 – Places par structure et par tranche d’âge', '_Toc300102', 3),
               ('Tabledesillustrations', 'Tableau 3 – Exécution budgétaire mensuelle', '_Toc300103', 5)],
              instr='TOC \\h \\z \\c "Tableau"', width=W))
    d.add(SECTBREAK(SECT(margins=mP, headers={'default': eh}, footers={'default': fR}, pgNum=('lowerRoman', 1))))
    # 3. body
    T = lambda bm, txt, st: P(d.bm(bm, R(txt)), style=st)
    d.add(T('_Toc300001', 'Présentation du service', 'Titre1'))
    d.add(T('_Toc300002', 'Missions', 'Titre2'))
    d.add(P(R('Le service de la petite enfance organise l’accueil des enfants de moins de quatre ans dont les parents '
              'résident ou travaillent sur la commune') +
            d.footnote('Les familles extérieures sont accueillies dans la limite de 10 % des places, conformément au '
                       'règlement de fonctionnement adopté par le conseil municipal.') +
            R('. Il gère trois structures d’accueil collectif, un relais petite enfance et accompagne les assistantes '
              'maternelles agréées.'), jc='both'))
    d.add(T('_Toc300003', 'Équipements', 'Titre2'))
    d.add(P(R('Les équipements sont présentés dans le ') + FLD('REF _Ref_tab1 \\h', 'Tableau 1') + R(' ci-dessous ; la '
            'liste détaillée des places figure au ') + FLD('REF _Ref_tab2 \\h', 'Tableau 2') + R(', page ') +
            FLD('PAGEREF _Ref_tab2 \\h', '3') + R('.'), jc='both'))
    d.add(P(d.bm('_Toc300101', d.bm('_Ref_tab1', R('Tableau ') + FLD('SEQ Tableau \\* ARABIC', '1'))) +
            R(' – Équipements d’accueil'), style='Lgende', keepNext=True))
    d.add(TBL([TROW([C(P(t, b=True, sa=0)) for t in ('Structure', 'Type', 'Places', 'Ouverture')], header=True)] +
              [TROW([C(P(a, sa=0)), C(P(b, sa=0)), C(P(c, jc='center', sa=0)), C(P(e, sa=0))]) for a, b, c, e in (
                  ('Les Petits Loups', 'multi-accueil', '45', '7 h 30 – 18 h 30'),
                  ('La Maison des Lutins', 'crèche collective', '30', '7 h 30 – 19 h'),
                  ('Les Pitchouns', 'micro-crèche', '12', '8 h – 18 h'),
                  ('Relais petite enfance', 'information des familles', '—', 'lun., mar., jeu.'))],
              [cm(4.6), cm(4.4), cm(2.2), cm(4.8)], style='Tableausimple4-Accentuation1', borders=None, look='0420'))
    d.add(T('_Toc300004', 'Activité 2025', 'Titre1'))
    d.add(T('_Toc300005', 'Fréquentation', 'Titre2'))
    d.add(T('_Toc300006', 'Accueil collectif', 'Titre3'))
    d.add(P(R('Le taux d’occupation financier moyen des structures collectives atteint 72,4 %') +
            d.endnote('Taux d’occupation financier : heures facturées rapportées aux heures d’ouverture multipliées '
                      'par le nombre de places.') +
            R(', en hausse de 2,1 points. Les demandes non satisfaites concernent surtout les bébés de moins d’un an.'),
            jc='both'))
    d.add(P(d.chart('line', 'Taux d’occupation mensuel (%)', ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                                                              'juil.', 'sept.', 'oct.', 'nov.', 'déc.'],
                    [('2024', [68, 70, 71, 69, 70, 72, 60, 69, 71, 72, 66]),
                     ('2025', [70, 73, 74, 72, 73, 75, 63, 71, 74, 75, 68])],
                    colors=('A5A5A5', '2E75B6'), w=15, h=6.5), jc='center', keepNext=True, sa=0))
    d.add(P(R('Figure ') + FLD('SEQ Figure \\* ARABIC', '1') + R(' – Taux d’occupation (le service ferme en août)'),
            style='Lgende', jc='center'))
    d.add(T('_Toc300007', 'Accueil familial', 'Titre3'))
    d.add(P(R('Au 31 décembre 2025, 58 assistantes maternelles agréées exercent sur la commune') +
            d.footnote('Source : service de protection maternelle et infantile du département (données fictives).') +
            R(', pour une capacité théorique de 197 places. Le relais a organisé 96 ateliers d’éveil.'), jc='both'))
    d.add(T('_Toc300008', 'Liste détaillée des places', 'Titre2'))
    d.add(P(d.bm('_Toc300102', d.bm('_Ref_tab2', R('Tableau ') + FLD('SEQ Tableau \\* ARABIC', '2'))) +
            R(' – Places par structure et par tranche d’âge'), style='Lgende', keepNext=True))
    WH = 'FFFFFF'
    hdr1 = TROW([C(P('Structure', b=True, color=WH, sa=0), vmerge='restart', shd='1F3864', valign='center'),
                 C(P('Section', b=True, color=WH, sa=0), vmerge='restart', shd='1F3864', valign='center'),
                 C(P('Places par tranche d’âge', b=True, color=WH, jc='center', sa=0), span=3, shd='1F3864'),
                 C(P('Total', b=True, color=WH, jc='center', sa=0), vmerge='restart', shd='1F3864', valign='center')],
                header=True)
    hdr2 = TROW([C('', vmerge='continue', shd='1F3864'), C('', vmerge='continue', shd='1F3864')] +
                [C(P(t, b=True, color=WH, jc='center', sa=0), shd='2E75B6') for t in ('< 1 an', '1 – 2 ans', '2 – 4 ans')] +
                [C('', vmerge='continue', shd='1F3864')], header=True)
    rows = [hdr1, hdr2]
    secs = ['Bébés', 'Moyens', 'Grands', 'Passerelle', 'Accueil occasionnel']
    k = 0
    for st in ('Les Petits Loups', 'La Maison des Lutins', 'Les Pitchouns', 'Relais – accueil occasionnel',
               'Halte-garderie (projet)', 'Places réservées entreprises', 'Places d’urgence'):
        for j, sname in enumerate(secs):
            k += 1
            a = (k * 7) % 9 + 2 if j == 0 else 0
            b = (k * 5) % 8 + 3 if j in (1, 3) else 0
            c = (k * 3) % 10 + 4 if j >= 2 else 0
            rows.append(TROW([C(P(st, sa=0, b=True), vmerge='restart' if j == 0 else 'continue',
                                shd='DEEAF6'),
                              C(P(sname, sa=0)), C(P(str(a) if a else '–', jc='center', sa=0)),
                              C(P(str(b) if b else '–', jc='center', sa=0)), C(P(str(c) if c else '–', jc='center', sa=0)),
                              C(P(str(a + b + c), jc='center', sa=0, b=True))], cantSplit=True))
    d.add(TBL(rows, [cm(4.6), cm(3.6), cm(2), cm(2), cm(2), cm(1.8)], bcolor='8EAADB'))
    d.add(P(R('Note : les places « entreprises » sont financées par convention (voir ') +
            FLD('REF _Toc300009 \\r \\h', '3') + R(').'), sz=9, i=True, sb=80))
    d.add(SECTBREAK(SECT(margins=mP, headers={'default': hP}, footers={'default': fP}, pgNum=('decimal', 1))))
    # 4. landscape: wide table
    d.add(T('_Toc300009', 'Moyens financiers', 'Titre1'))
    d.add(P(R('Le tableau ci-dessous retrace l’exécution budgétaire mensuelle du service (fonctionnement, en milliers '
              'd’euros)') + d.footnote('Montants arrondis ; les totaux peuvent différer de la somme des arrondis.') +
            R('.'), jc='both'))
    months = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']
    lines = [('Personnel', [182, 180, 185, 184, 186, 188, 175, 120, 186, 189, 190, 196]),
             ('Alimentation', [9.8, 9.2, 10.1, 9.7, 10.0, 10.3, 6.1, 0.8, 9.9, 10.4, 10.2, 8.7]),
             ('Fournitures', [3.1, 2.4, 2.9, 2.2, 2.5, 3.6, 1.2, 0.3, 4.8, 2.7, 2.6, 2.2]),
             ('Fluides', [8.4, 8.1, 7.2, 5.9, 4.8, 4.5, 4.1, 3.2, 4.9, 6.2, 7.6, 8.3]),
             ('Recettes familles', [-61, -63, -64, -62, -63, -65, -48, -5, -62, -66, -65, -55]),
             ('Prestation CAF', [-95, -95, -95, -95, -95, -95, -95, -95, -95, -95, -95, -95])]
    fmt = lambda v: ('%.1f' % v).replace('.', ',').replace('-', '−')
    rows = [TROW([C(P('Poste', b=True, sz=8.5, sa=0), shd='D9E2F3')] +
                 [C(P(m_, b=True, sz=8.5, jc='center', sa=0), shd='D9E2F3') for m_ in months] +
                 [C(P('Total', b=True, sz=8.5, jc='center', sa=0), shd='B4C6E7')], header=True)]
    for lab, vals in lines:
        rows.append(TROW([C(P(lab, sz=8.5, sa=0, b=True))] +
                         [C(P(R(fmt(v), sz=8.5), tabs=[(cm(1.05), 'decimal')], sa=0)) for v in vals] +
                         [C(P(R(fmt(sum(vals)), sz=8.5, b=True), tabs=[(cm(1.3), 'decimal')], sa=0), shd='F2F2F2')]))
    d.add(P(d.bm('_Toc300103', R('Tableau ') + FLD('SEQ Tableau \\* ARABIC', '3')) +
            R(' – Exécution budgétaire mensuelle (k€)'), style='Lgende', keepNext=True))
    d.add(TBL(rows, [cm(3.1)] + [cm(1.7)] * 12 + [cm(2.2)], bcolor='8EAADB', bsz=4, layout='fixed'))
    d.add(P(md('*Le reste à charge communal s’établit à 1 093 k€, soit 7 210 € par place.*'), sb=120))
    d.add(SECTBREAK(SECT(landscape=True, margins=mL, headers={'default': hL}, footers={'default': fL})))
    # 5. portrait
    d.add(T('_Toc300010', 'Perspectives', 'Titre1'))
    for t in ('ouverture d’une halte-garderie de 15 places dans le quartier des Tilleuls (septembre 2026) ;',
              'mise en place d’un guichet unique d’inscription en ligne ;',
              'plan de formation des équipes à l’accueil des enfants en situation de handicap.'):
        d.add(P(t, numId=bul, sa=40))
    d.add(P(R('Ces projets s’inscrivent dans la convention territoriale globale') +
            d.endnote('Convention signée avec la caisse d’allocations familiales pour la période 2024-2028.') +
            R(' et seront évalués dans le rapport 2026') +
            d.endnote('Les indicateurs de suivi seront présentés à la commission enfance-jeunesse.') + R('.'),
            jc='both', sb=120))
    d.add(P(d.bm('_Toc300011', R('Glossaire')), style='Titre1', numId=0))
    for a, b in (('CAF', 'caisse d’allocations familiales'), ('EAJE', 'établissement d’accueil du jeune enfant'),
                 ('PMI', 'protection maternelle et infantile'), ('RPE', 'relais petite enfance'),
                 ('TOF', 'taux d’occupation financier')):
        d.add(P(R(a, b=True) + R('\t' + b), tabs=[(cm(2.5), 'left')], ind_left=cm(2.5), hanging=cm(2.5), sa=60))
    d.final_sect = SECT(margins=mP, headers={'default': hP}, footers={'default': fP})
    return d, dict(pages=7, features='5 sections : couverture CENTRÉE VERTICALEMENT (vAlign) / sommaires en chiffres '
                   'romains / corps (redémarrage en 1) / section PAYSAGE avec tableau large de 14 colonnes '
                   '(taquets décimaux en cellule, signe moins U+2212) / portrait; TABLE DES MATIÈRES 3 niveaux + TABLE DES TABLEAUX '
                   '(TOC \\c) précalculées avec liens et PAGEREF; en-tête avec champs STYLEREF (numéro et texte du '
                   'Titre 1 courant); titres numérotés 1 / 1.1 / 1.1.1; légendes SEQ; renvois REF, REF \\r, '
                   'PAGEREF; notes de bas de page ET notes de fin; TABLEAU LONG (37 lignes) avec DEUX lignes '
                   'd’en-tête répétées (fusions verticales et horizontales) et fusions verticales par structure; '
                   'graphique en courbes; glossaire en retrait suspendu',
                   notes='Plus long que la cible de 4 pages (rapport multi-sections). Champs précalculés : ne pas '
                         'mettre à jour avant comparaison.')
