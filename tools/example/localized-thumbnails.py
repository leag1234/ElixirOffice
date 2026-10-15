#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Render localized public templates using an explicitly selected dev container."""
import argparse, hashlib, json, subprocess, sys, xml.sax.saxutils
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from blank_templates import LANGUAGES

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

def render(brand, container, work, converter, locales=None, ids=None):
    scratch='/tmp/eo-localized-home-thumbnails-'+hashlib.sha256(str(work.resolve()).encode()).hexdigest()[:12]
    run('docker','exec',container,'mkdir','-p',scratch)
    run('docker','exec',container,'mkdir','-p',scratch+'/templates')
    run('docker','cp',str(brand)+'/.',container+':'+scratch+'/templates')
    manifest=json.loads((brand/'templates.json').read_text())
    results=[]
    for entry in manifest['templates']:
        if ids and entry['id'] not in ids: continue
        for language in entry['languages']:
            if locales and language not in locales: continue
            version={'file':language+'/'+entry['file'],'thumb':language+'/'+entry['thumb']}
            file=version['file'];source=scratch+'/templates/'+file
            params=('<TaskQueueDataConvert><m_sFileFrom>'+xml.sax.saxutils.escape(source)+
                    '</m_sFileFrom><m_sFileTo>'+scratch+'/output.pdf</m_sFileTo>'+
                    '<m_nFormatTo>513</m_nFormatTo><m_sFontDir>/usr/share/fonts</m_sFontDir></TaskQueueDataConvert>')
            subprocess.run(['docker','exec','-i',container,'sh','-c','cat > '+scratch+'/params.xml'],
                           input=params,text=True,check=True,capture_output=True)
            run('docker','exec',container,converter,scratch+'/params.xml')
            pdf=work/(entry['id']+'-'+language+'.pdf')
            run('docker','cp',container+':'+scratch+'/output.pdf',str(pdf))
            prefix=work/(entry['id']+'-'+language)
            run('pdftoppm','-f','1','-singlefile','-scale-to-x','264','-scale-to-y','374','-png',str(pdf),str(prefix))
            png=prefix.with_suffix('.png')
            with Image.open(png) as image:
                assert image.size==(264,374)
                assert image.convert('RGB').getextrema()!=((255,255),(255,255),(255,255))
                image.save(brand/version['thumb'],optimize=True)
            text=run('pdftotext',str(pdf),'-').stdout
            (prefix.with_suffix('.txt')).write_text(text)
            results.append({'id':entry['id'],'locale':language,'pngBytes':(brand/version['thumb']).stat().st_size,
                            'pdfBytes':pdf.stat().st_size,'textCharacters':len(text)})
            print('PASS render '+entry['id']+' '+language,flush=True)
    sources=[]
    for entry in manifest['templates']:
        for language in entry['languages']:
            for field in ['file','thumb']:
                relative=language+'/'+entry[field];file=brand/relative
                sources.append({'file':relative,'language':language,'languageTag':LANGUAGES[language],'license':'CC0-1.0','fictional':True,
                                'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
                                'layoutSource':'tools/example/template-layouts/'+entry['id']+'.docx'})
    (brand/'template-sources.json').write_text(json.dumps({'license':'CC0-1.0','description':'Generated fictional multilingual examples; no real person or organisation. Layouts derive from the public provisional corpus t01,t02,s06,s08.','files':sources},ensure_ascii=False,indent=2)+'\n')
    (work/'thumbnail-results.json').write_text(json.dumps(results,indent=2)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('brand',type=Path);parser.add_argument('container');parser.add_argument('work',type=Path)
    parser.add_argument('--converter',required=True,help='Absolute x2t executable path inside the selected container')
    parser.add_argument('--locales',help='Comma-separated subset for preview regeneration')
    parser.add_argument('--ids',help='Comma-separated template IDs for regeneration')
    args=parser.parse_args();args.work.mkdir(parents=True,exist_ok=True)
    render(args.brand,args.container,args.work,args.converter,args.locales.split(',') if args.locales else None,args.ids.split(',') if args.ids else None)
