#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Reuse the web home assets and editor catalogs for the local desktop shell."""
import json, shutil, html, re
from pathlib import Path
def save_as_strings(translated, extra):
    """Use existing translated editor descriptions and concise loss disclosures."""
    clean=lambda value: html.unescape(re.sub('<[^>]*>', ' ', value)).strip()
    result={'saveFormat':extra['saveFormat']}
    for suffix,editor,prefix in [
        ('Docx','documenteditor','DE'),('Odt','documenteditor','DE'),
        ('Rtf','documenteditor','DE'),('Txt','documenteditor','DE'),
        ('Xlsx','spreadsheeteditor','SSE'),('Ods','spreadsheeteditor','SSE'),
        ('Csv','spreadsheeteditor','SSE'),('Pptx','presentationeditor','PE'),
        ('Odp','presentationeditor','PE'),('Pdf','documenteditor','DE')]:
        key=prefix+'.Views.ElixirBackstage.txtFmt'+suffix
        result['saveFormat'+suffix]=clean(translated[editor][key])
        result['saveFormat'+suffix+'Desc']=clean(translated[editor][key+'Desc'])
    for suffix,editor,key in [
        ('Rtf','documenteditor','DE.Controllers.LeftMenu.warnDownloadAsRTF'),
        ('Txt','documenteditor','DE.Controllers.LeftMenu.warnDownloadAs'),
        ('Csv','spreadsheeteditor','SSE.Controllers.LeftMenu.warnDownloadCsv')]:
        value=extra.get('saveLoss'+suffix) or translated[editor].get(key)
        if not value and suffix=='Csv':value=translated[editor]['SSE.Views.ElixirBackstage.txtFmtCsvDesc']
        if not value:raise ValueError('Missing translated loss disclosure: '+key)
        result['saveLoss'+suffix]=clean(re.split(r'<br\s*/?>',value,flags=re.I)[0])
    result['saveLossPdf']=extra['saveLossPdf']
    if any(not value for value in result.values()):
        raise ValueError('Missing Save As locale field')
    return result

def assemble(upstream, product, out):
    home=upstream/'document-server-integration/web/documentserver-example/nodejs/public/elixir'
    destination=out/'desktop-home';destination.mkdir()
    from blank_templates import LANGUAGES,localized
    (destination/'blanks').mkdir()
    for language in LANGUAGES:
        (destination/'blanks'/(language+'.docx')).write_bytes(localized(out/'templates/new.docx',language))
    css=(home/'home.css').read_text()+'\n'+(product/'desktop/home.css').read_text()
    (destination/'home.css').write_text(css)
    for name in ['home-theme.js','icons.svg']:shutil.copy2(home/name,destination/name)
    shutil.copytree(home/'fluent',destination/'fluent')
    shutil.copy2(upstream/'web-apps/apps/common/main/lib/elixir-localfonts/Core.js',destination/'localfonts-Core.js')
    shutil.copy2(upstream/'web-apps/apps/common/main/lib/elixir-local/Operation.js',destination/'operation.js')
    shutil.copy2(upstream/'web-apps/apps/common/main/lib/elixir-local/FormatDialog.js',destination/'format-dialog.js')
    (destination/'backstage-home.css').write_text('@scope (.eo-desktop-page) {\n'+css.replace(':root',':scope')+'\n}\n.eo-desktop-page {font:14px/20px var(--font);color:var(--text);background:var(--bg)}\n.eo-desktop-page .desktop-footer {padding:16px 40px;color:var(--text-2);font-size:12px}\n.eo-desktop-page .topbar {grid-template-columns:1fr}\n.eo-desktop-page .tiles {margin-top:20px}\n.eo-desktop-page button.tile {text-align:start;border:0;background:transparent;padding:0}\n')
    brand=product/'branding/example/nodejs/public/elixir/brand/templates'
    catalog=json.loads((brand/'templates.json').read_text())
    templates=[]
    overlay=product/'branding/desktop-templates'
    additions=json.loads((overlay/'templates.json').read_text())
    extras={entry['id']:entry for entry in additions['templates']}
    (destination/'templates').mkdir()
    for entry in catalog['templates']:
        extra=extras[entry['id']]
        combined={**entry,'languages':list(dict.fromkeys(entry['languages']+extra['languages'])),
                  'fontRequirements':extra['fontRequirements'],'systemLocales':extra['systemLocales']}
        for language in LANGUAGES:
            chosen=language if language in combined['languages'] else 'en'
            source=overlay if chosen in extra['languages'] else brand
            for field in ['file','thumb']:
                relative=chosen+'/'+entry[field]
                target=destination/'templates'/relative;target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source/relative,target)
        templates.append(dict(combined,format='docx'))
    (out/'licenses/home').mkdir(parents=True,exist_ok=True)
    provenance=json.loads((brand/'template-sources.json').read_text())
    provenance['files']+=json.loads((overlay/'template-sources.json').read_text())['files']
    (out/'licenses/home/template-sources.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
    (out/'licenses/home/README.txt').write_text('The four localized Home templates and previews come from the ElixirOffice public start-page template set under CC0-1.0. The included template-sources.json records its public provisional-corpus provenance. Fluent UI System Icons are copyright Microsoft Corporation, MIT; see desktop-home/fluent/LICENSE.\n')
    (destination/'templates.json').write_text(json.dumps(templates,indent=2)+'\n')
    extra=json.loads((product/'tools/desktop/i18n-extra.json').read_text())
    editors={kind:upstream/'web-apps/apps'/kind/'main/locale' for kind in ['documenteditor','spreadsheeteditor','presentationeditor']}
    english={kind:json.loads((folder/'en.json').read_text()) for kind,folder in editors.items()}
    labels={'info':['Info','Information','Document Info','Document Information'],'home':['Home'],'new':['New'],'open':['Open'],'recent':['Recent','Recent files'],
        'name':['Name'],'modified':['Date modified','Modified'],'browse':['Browse','Browse...','Browse…'],
        'replace':['Replace'],'save':['Save'],'saveAs':['Save As'],'print':['Print'],'export':['Export'],'options':['Options'],
        'help':['Help'],'close':['Close'],'cancel':['Cancel'],'ok':['OK'],'error':['Error'],'warning':['Warning'],
        'file':['File'],'edit':['Edit'],'about':['About'],'settings':['Settings'],'undo':['Undo'],'redo':['Redo'],
        'copy':['Copy'],'cut':['Cut'],'paste':['Paste'],'selectAll':['Select All'],'untitled':['Untitled'],
        'autoRecover':['Save AutoRecover information'],'restore':['Restore'],'fontUse':['Fonts','Font'],'off':['Disabled','Off'],'saveCopy':['Save a Copy','Save copy']}
    choices={key:[(kind,name) for value in values for kind,doc in english.items() for name,text in doc.items() if text.casefold().strip().replace('&','')==value.casefold()] for key,values in labels.items()}
    def clean(text):return re.sub(r'\\s+',' ',html.unescape(re.sub('<[^>]*>',' ',text))).strip()
    supported=sorted(f.stem for f in editors['documenteditor'].glob('*.json'))
    assert set(supported)==set(extra),'Every editor locale needs desktop-specific strings'
    (destination/'i18n').mkdir()
    missing=[]
    for language in supported:
        translated={kind:json.loads((folder/(language+'.json')).read_text()) for kind,folder in editors.items()}
        strings=dict(extra[language])
        for key,candidates in choices.items():
            value=next((translated[kind][name] for kind,name in candidates if translated[kind].get(name)),None)
            if not value:
                if key in strings:continue
                if key=='saveCopy' and strings.get('saveAs'):strings[key]=strings['saveAs'];continue
                missing.append((language,key));continue
            strings[key]=clean(value)
        for key,kind,name in [('blankDoc','documenteditor','DE.Views.FileMenuPanels.CreateNew.txtBlank'),('blankBook','spreadsheeteditor','SSE.Views.FileMenuPanels.CreateNew.txtBlank'),('blankSlide','presentationeditor','PE.Views.FileMenuPanels.CreateNew.txtBlank'),('unsaved','documenteditor','DE.Controllers.LeftMenu.leavePageText'),('saveError','documenteditor','DE.Controllers.Main.saveErrorText')]:
            if not translated[kind].get(name):
                if key not in strings:missing.append((language,key))
            else:strings[key]=clean(translated[kind][name].split('<br>')[0]) if key=='unsaved' else clean(translated[kind][name])
        # Existing branded wording takes priority where its translated catalog exists.
        for key,kind,name in [('blankDoc','documenteditor','DE.Views.ElixirBackstage.txtBlankDocument'),('blankBook','spreadsheeteditor','SSE.Views.ElixirBackstage.txtBlankDocument'),('blankSlide','presentationeditor','PE.Views.ElixirBackstage.txtBlankDocument')]:
            if translated[kind].get(name):strings[key]=clean(translated[kind][name].split('<br>')[0]) if key=='unsaved' else clean(translated[kind][name])
        for key in ['open','new']:strings[key]=extra[language][key]
        web_file=home/'i18n'/((language if language!='pt-pt' else 'pt-PT')+'.json')
        if web_file.exists():
            web=json.loads(web_file.read_text())
            for key,name in {'home':'nav.home','new':'nav.new','open':'nav.open','blankDoc':'tile.blank.word','blankBook':'tile.blank.cell','blankSlide':'tile.blank.slide','recent':'recent.title','name':'col.name','modified':'col.modified'}.items():
                if web.get(name):strings[key]=web[name]
        strings['fonts']=strings['fontUse']
        if language=='en':strings['fontUse']='Use my fonts'
        if language=='fr':strings['fontUse']='Utiliser mes polices'
        strings['pdf']=strings.get('export','')+' PDF'
        strings.update(save_as_strings(translated,extra[language]))
        # The shortcut label can remain English in translated catalogs.
        strings['quitSave']=clean(translated['documenteditor']['DE.Views.FileMenu.btnSaveCaption'])
        if not strings['quitSave']:raise ValueError('Missing translated quit Save action: '+language)

        (destination/'i18n'/(language+'.json')).write_text(json.dumps(strings,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
    if missing:raise SystemExit('Missing translated labels: '+repr(missing))
    (destination/'locales.json').write_text(json.dumps(supported)+'\n')
    # Offline Help has a locale-matched index; unsupported help languages fall back to English.
    for editor in editors:
        help_root=out/'web-apps/apps'/editor/'main/resources/help'
        for contents in help_root.glob('*/Contents.json'):
            language=contents.parent.name
            rows=json.loads(contents.read_text(encoding='utf-8-sig'))
            links=[]
            for row in rows:
                source=row.get('src','')
                if not source or '..' in source or ':' in source or not (contents.parent/source).is_file():continue
                links.append('<li><a href="'+html.escape(source,quote=True)+'">'+html.escape(row.get('name',source))+'</a></li>')
            title=extra.get(language,extra['en']).get('help')
            if not title:
                catalog=json.loads((destination/'i18n'/((language if language in supported else 'en')+'.json')).read_text())
                title=catalog['help']
            (contents.parent/'index.htm').write_text('<!doctype html><html lang="'+html.escape(language)+'"><meta charset="utf-8"><title>ElixirOffice '+html.escape(title)+'</title><style>body{font:16px/1.6 system-ui;max-width:850px;margin:32px auto;padding:0 24px}a{color:#235f49}</style><h1>ElixirOffice '+html.escape(title)+'</h1><ul>'+''.join(links)+'</ul></html>')
    print('PASS shared home CSS/Fluent assets, four localized templates and',len(supported),'complete desktop locales')

