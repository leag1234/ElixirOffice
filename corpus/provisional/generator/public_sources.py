# -*- coding: utf-8 -*-
"""Selected public documents (open licence, published by the producing organisation on data.gouv.fr).
Retrieved on 2026-10-05. pages = <Pages> property of docProps/app.xml (computed by Word). sha256 = digest of the ORIGINAL downloaded file (before metadata anonymisation)."""

RETRIEVED = '2026-10-05'
LO1 = 'Licence Ouverte / Open Licence v1.0 (Etalab) – fr-lo'
LO2 = 'Licence Ouverte / Open Licence v2.0 (Etalab) – lov2'

PUBLIC = [
    dict(id='t09', file='teachers/t09-projet-classe-solidarite-les-lilas.docx', category='teachers',
         url='https://static.data.gouv.fr/resources/deliberations-2016/20190710-102413/d106-16-annexe-projet-avec-pas-sans-toit-1-.docx',
         dataset='https://www.data.gouv.fr/datasets/deliberations-2016', publisher='Ville des Lilas (Les Lilas)',
         license=LO1, sha256='d87b85f073a75bfc753330107a7a2a7615283b3d6e74f55529f363751c6a6864', pages=2,
         features='document réel rédigé par une équipe enseignante (projet de classe annexé à une délibération); '
                  'texte brut, mise en forme directe, alignements obtenus par espaces multiples; thème Office; compat 15'),
    dict(id='t10', file='teachers/t10-programme-emc-terminale-eduscol.docx', category='teachers',
         url='https://static.data.gouv.fr/resources/programmes-denseignement-de-terminale-generale-reforme-du-baccalaureat-2021/20200623-144344/02-emc-normene1921244a.docx',
         dataset='https://www.data.gouv.fr/datasets/programmes-denseignement-de-terminale-generale-reforme-du-baccalaureat-2021',
         publisher='Ministères de l’Éducation nationale (DGESCO)', license=LO1,
         sha256='c7239d6a527b62fb8cb2eb001dc665b1477b3956a8f4a20962ec0f74d0e0c46a', pages=5,
         features='programme officiel (annexe d’arrêté) servant de référence aux enseignants; sommaire manuel, '
                  'en-têtes/pieds pairs-impairs (2+2), image en en-tête, nombreux paragraphes tramés (43 w:shd), '
                  'polices Arial/Book Antiqua/Cambria/Calibri/Tahoma; compat 14'),
    dict(id='a07', file='admin/a07-formulaire-pret-vehicule-les-lilas.docx', category='admin',
         url='https://static.data.gouv.fr/resources/reglement-vehicules/20250819-083901/demande-de-pret.docx',
         dataset='https://www.data.gouv.fr/datasets/reglement-vehicules', publisher='Ville des Lilas (Les Lilas)',
         license=LO2, sha256='39344e10cd76b4447194bff92703ddcede59382966b3a4a25c53b9f9b84b8268', pages=1,
         features='formulaire administratif réel: zones de texte wps + repli VML (mc:AlternateContent), images '
                  'ancrées et inline (logo), cases à cocher dessinées, cadres « réservé à l’administration »; '
                  'Arial/Trebuchet MS; NB : identifiants wp:docPr dupliqués tels que produits par Word '
                  '(signalés par validate.py, conservés volontairement)'),
    dict(id='a08', file='admin/a08-debat-orientation-budgetaire-2016-noe.docx', category='admin',
         url='https://static.data.gouv.fr/resources/debat-dorientation-budgetaire-2016/20161029-112842/DOB_2016_Mairie_de_Noe_31410.docx',
         dataset='https://www.data.gouv.fr/datasets/debat-dorientation-budgetaire-2016', publisher='Mairie de Noé',
         license=LO1, sha256='6faf6942740572380593041a9e049619bfe39bdff9bb37c622df281c2a834701', pages=6,
         features='rapport de collectivité réel: 4 GRAPHIQUES Word natifs (chartN.xml) avec images de repli EMF, '
                  'tableau financier à fusions verticales, images ancrées et VML, 41 paragraphes en liste, '
                  'en-tête/pied, trames; Calibri/Tahoma; compat 14'),
    dict(id='a09', file='admin/a09-documentation-inspection-du-travail.docx', category='admin',
         url='https://static.data.gouv.fr/resources/referentiel-des-unites-de-controle-de-linspection-du-travail/20250528-083101/documentationservicesinspectiondutravail.docx',
         dataset='https://www.data.gouv.fr/datasets/referentiel-des-unites-de-controle-de-linspection-du-travail',
         publisher='Ministère du Travail (DGT)', license=LO2,
         sha256='e7d2eddc16e902086e150fcdf3011b5ed85793c41caede5587fe150343642571', pages=6,
         features='note documentaire ministérielle récente: 6 tableaux (dont historique des versions), listes, '
                  'polices Marianne et Roboto (substitution), 3 pieds de page avec marquage de classification '
                  'MSIP « C1 - Public », vignette EMF, propriétés personnalisées'),
    dict(id='a10', file='admin/a10-notice-programme-vacances-travail-meae.docx', category='admin',
         url='https://static.data.gouv.fr/resources/programme-vacances-travail-pvt/20210323-105134/notice-daccompagnement-pvt.docx',
         dataset='https://www.data.gouv.fr/datasets/programme-vacances-travail-pvt',
         publisher='Ministère de l’Europe et des Affaires étrangères', license=LO1,
         sha256='738738353aa03fd454e503bc4749269641d7064f949e0a2a794c80a7708b5c88', pages=5,
         features='notice ministérielle: tableaux descriptifs, image ancrée (bloc-marque), pied de page « n / N », '
                  'police Marianne + Arial/Calibri/Tahoma'),
]

for p in PUBLIC:
    p['source_url'] = '%s (jeu de données : %s ; producteur : %s)' % (p['url'], p['dataset'], p['publisher'])
    p['retrieved'] = RETRIEVED
    p['notes'] = ('Fichier original sha256=%s ; seules les métadonnées auteur de docProps/core.xml (dc:creator, '
                  'cp:lastModifiedBy : noms d’agents) ont été vidées, contenu inchangé.' % p['sha256'])
