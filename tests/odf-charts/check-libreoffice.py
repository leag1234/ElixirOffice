#!/usr/bin/env python3
"""Owner-run headless LibreOffice check, isolated profile; requires UNO-enabled Python."""
import argparse,hashlib,json,os,socket,subprocess,sys,tempfile,time,zipfile,xml.etree.ElementTree as E
from pathlib import Path
def compare_xlsx(file,expected):
    ns={'c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
    found=[]
    with zipfile.ZipFile(file)as z:
        for name in sorted(z.namelist()):
            if not name.startswith('xl/charts/chart')or not name.endswith('.xml'):continue
            for series in E.fromstring(z.read(name)).findall('.//c:ser',ns):
                ref=series.find('c:val/c:numRef',ns)
                if ref is None:raise AssertionError('Expected a worksheet-bound numeric series')
                formula=ref.findtext('c:f',namespaces=ns)or''
                points=sorted(ref.findall('c:numCache/c:pt',ns),key=lambda p:int(p.get('idx')))
                found.append({'sheet':formula.split('!')[0].strip("'").replace("''","'"),'values':[float(p.findtext('c:v',namespaces=ns))for p in points]})
    if found!=expected:raise AssertionError('Chart worksheet/value mismatch: '+json.dumps({'actual':found,'expected':expected}))
    return found
def worker(args):
    import uno
    resolver=uno.getComponentContext().ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',uno.getComponentContext())
    context=None
    for attempt in range(150):
        try:context=resolver.resolve('uno:socket,host=127.0.0.1,port='+str(args.port)+';urp;StarOffice.ComponentContext');break
        except Exception:time.sleep(.2)
    if context is None:raise RuntimeError('Owned LibreOffice endpoint did not become ready')
    desktop=context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',context)
    def prop(name,value):
        p=uno.createUnoStruct('com.sun.star.beans.PropertyValue');p.Name=name;p.Value=value;return p
    rows=[]
    try:
        for item in json.loads((args.fixtures/'expected.json').read_text()):
            doc=None;r={'file':item['file'],'pass':False}
            try:
                source=args.fixtures/item['file'];assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256'],'Fixture hash mismatch'
                props=[prop('Hidden',True),prop('ReadOnly',True)]
                if item['password']:props.append(prop('Password',item['password']))
                doc=desktop.loadComponentFromURL(source.resolve().as_uri(),'_blank',0,tuple(props))
                if doc is None:raise RuntimeError('LibreOffice did not load the fixture')
                target=args.out/(source.stem+'.xlsx')
                doc.storeAsURL(target.resolve().as_uri(),(prop('FilterName','Calc MS Excel 2007 XML'),prop('Overwrite',True)))
                r['series']=compare_xlsx(target,item['series']);r['pass']=True
            except Exception as e:r['error']=str(e)
            finally:
                if doc is not None:doc.close(True)
            rows.append(r)
    finally:desktop.terminate()
    report={'result':'PASS'if len(rows)==3 and all(r['pass']for r in rows)else'FAIL','cases':rows,'qualification':'Native LibreOffice headless load (including supplied test password), XLSX export and exact ordered chart values plus worksheet identities; separate from native GUI/printing.'}
    (args.out/'libreoffice-result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));return 0 if report['result']=='PASS'else 1
def main():
    p=argparse.ArgumentParser();p.add_argument('--lo',type=Path);p.add_argument('--python',default=os.environ.get('LO_PYTHON',sys.executable));p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--worker',action='store_true');p.add_argument('--port',type=int)
    a=p.parse_args()
    if a.worker:return worker(a)
    if not a.lo or not a.lo.is_file():p.error('--lo must name the LibreOffice executable (Mac Contents/MacOS/soffice or soffice.bin)')
    ready=subprocess.run([a.python,'-c','import uno'],capture_output=True,text=True)
    if ready.returncode:p.error('--python / LO_PYTHON must name a Python interpreter configured with the LibreOffice UNO module; no check was run')
    a.out.mkdir(parents=True,exist_ok=False)
    with socket.socket()as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='eo-lo-profile-',dir=a.out)as profile:
        command=[str(a.lo.resolve()),'-env:UserInstallation='+Path(profile).resolve().as_uri(),'--headless','--nologo','--nodefault','--norestore','--nofirststartwizard','--accept=socket,host=127.0.0.1,port='+str(port)+';urp;StarOffice.ServiceManager']
        (a.out/'command.json').write_text(json.dumps(command,indent=2)+'\n')
        with(a.out/'libreoffice.log').open('w')as log:
            server=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
            try:
                result=subprocess.run([a.python,str(Path(__file__).resolve()),'--worker','--port',str(port),'--fixtures',str(a.fixtures.resolve()),'--out',str(a.out.resolve())],timeout=180)
                return result.returncode
            finally:
                if server.poll()is None:
                    server.terminate()
                    try:server.wait(timeout=15)
                    except subprocess.TimeoutExpired:server.kill();server.wait(timeout=10)
if __name__=='__main__':raise SystemExit(main())
