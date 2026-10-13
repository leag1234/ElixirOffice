#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Reuse the web home assets and editor catalogs for the local desktop shell."""
import json, shutil, html, re
from pathlib import Path
def assemble(upstream, product, out):
    home=upstream/'document-server-integration/web/documentserver-example/nodejs/public/elixir'
    destination=out/'desktop-home';destination.mkdir()
    from blank_templates import LANGUAGES,localized
    (destination/'blanks').mkdir()
    for language in LANGUAGES:
        (destination/'blanks'/(language+'.docx')).write_bytes(localized(out/'templates/new.docx',language))
    for name in ['home.css','icons.svg']:shutil.copy2(home/name,destination/name)
    shutil.copytree(home/'fluent',destination/'fluent')
    shutil.copy2(upstream/'web-apps/apps/common/main/lib/elixir-localfonts/Core.js',destination/'localfonts-Core.js')
    css=(home/'home.css').read_text()
    (destination/'backstage-home.css').write_text('@scope (.eo-desktop-page) {\n'+css.replace(':root',':scope')+'\n}\n.eo-desktop-page {font:14px/20px var(--font);color:var(--text);background:var(--bg)}\n.eo-desktop-page .desktop-footer {padding:16px 40px;color:var(--text-2);font-size:12px}\n.eo-desktop-page .topbar {grid-template-columns:1fr}\n.eo-desktop-page .tiles {margin-top:20px}\n.eo-desktop-page button.tile {text-align:left;border:0;background:transparent;padding:0}\n')
    brand=product/'branding/example/nodejs/public/elixir/brand/templates'
    templates=[]
    (destination/'templates').mkdir()
    for key,file in [('letterhead','letterhead'),('resume','resume-two-columns')]:
        for suffix in ['.docx','.png']:shutil.copy2(brand/(file+suffix),destination/'templates'/(file+suffix))
        templates.append({'id':file,'format':'docx','titleKey':key,'file':file+'.docx','thumb':file+'.png'})
    (out/'licenses/home').mkdir(parents=True,exist_ok=True)
    shutil.copy2(brand/'templates.json',out/'licenses/home/template-sources.json')
    (out/'licenses/home/README.txt').write_text('The two Home templates and previews come from the ElixirOffice public start-page template set under CC0-1.0. The included template-sources.json records its public provisional-corpus provenance. Fluent UI System Icons are copyright Microsoft Corporation, MIT; see desktop-home/fluent/LICENSE.\n')
    (destination/'templates.json').write_text(json.dumps(templates,indent=2)+'\n')
    extra=json.loads((product/'tools/desktop/i18n-extra.json').read_text())
    editors={kind:upstream/'web-apps/apps'/kind/'main/locale' for kind in ['documenteditor','spreadsheeteditor','presentationeditor']}
    english={kind:json.loads((folder/'en.json').read_text()) for kind,folder in editors.items()}
    labels={'info':['Info','Information','Document Info','Document Information'],'home':['Home'],'new':['New'],'open':['Open'],'recent':['Recent','Recent files'],
        'name':['Name'],'modified':['Date modified','Modified'],'browse':['Browse','Browse...','Browse…'],
        'save':['Save'],'saveAs':['Save As'],'print':['Print'],'export':['Export'],'options':['Options'],
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
    print('PASS shared home CSS/Fluent assets, two approved templates and',len(supported),'complete desktop locales')

