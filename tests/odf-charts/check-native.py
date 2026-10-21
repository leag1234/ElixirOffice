#!/usr/bin/env python3
"""Check synthetic chart behavior from a compiled native.cpp driver."""
import argparse,json,subprocess,re,hashlib,resource,time,xml.etree.ElementTree as ET
from pathlib import Path
NS={p:'urn:oasis:names:tc:opendocument:xmlns:'+n+':1.0' for p,n in [
    ('office','office'),('chart','chart'),('table','table'),('text','text'),('draw','drawing')]}
NS['xlink']='http://www.w3.org/1999/xlink'
NS['svg']='urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0'
NS['calcext']='urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0'
def attr(node,prefix,name): return node.get('{'+NS[prefix]+'}'+name)
def writer_check(data,mode):
    root=ET.fromstring(('<test '+ ' '.join('xmlns:'+p+'="'+v+'"' for p,v in NS.items())+'>').encode()+data+b'</test>')
    tables=root.findall('.//table:table',NS)
    assert len(tables)==1,'expected one embedded cache table'
    table=tables[0]
    if mode.startswith('provided-'):
        assert attr(table,'table','name')=='provided-cache','existing table replaced'
        cells=table.findall('.//table:table-cell',NS)
        assert len(cells)==1 and attr(cells[0],'office','value')=='99','existing cache data modified'
        return {'existing_table_preserved':True,'range_values':{}}
    assert attr(root.find('.//chart:chart',NS),'xlink','href')=='..','missing ordinary parent worksheet link'
    assert attr(root.find('.//chart:chart',NS),'xlink','type')=='simple','missing standard link type'
    cache_name='local-table-1' if mode.startswith('reserved') else 'local-table'
    assert attr(table,'table','name')==cache_name,'cache name collides with a bound worksheet'
    grid={};ranges={};row=0
    for r in table.findall('.//table:table-row',NS):
        repeat=int(attr(r,'table','number-rows-repeated')or'1');col=0
        for c in r.findall('table:table-cell',NS):
            cols=int(attr(c,'table','number-columns-repeated')or'1')
            value=attr(c,'office','value')
            if value is None:value=attr(c,'office','string-value')
            value=value if value is not None else ''
            for rr in range(row,row+repeat):
                for cc in range(col,col+cols):grid[rr,cc]=(value,attr(c,'office','value-type'))
            desc=c.find('draw:g/svg:desc',NS)
            if desc is not None:
                assert desc.text not in ranges,'duplicate range descriptor'
                ranges[desc.text]=(row,col)
            col+=cols
        row+=repeat
    series=root.findall('.//chart:series',NS)
    expected=[['1','2','3'],['11','12','13']]
    if mode in ('literal-first','reserved-literal-first'):expected.insert(0,['31','32','33'])
    if mode in ('bound-first','reserved-bound-first','reserved-relative','reserved-case'):expected.append(['31','32','33'])
    if mode in ('sparse','sparse-idx'):expected.append(['4','','9'])
    assert len(series)==len(expected)
    columns=[];cache_expectations={}
    for s,values in zip(series,expected):
        ref=attr(s,'chart','values-cell-range-address')
        literal=values[0]=='31'
        if literal:
            assert ref.startswith(cache_name+'.'),'literal reference uses wrong cache table'
            if mode in ('bound-first','reserved-bound-first','reserved-relative','reserved-case'):
                assert ref.split(':')[-1].startswith(cache_name+'.'),'existing literal second-endpoint spelling changed'
            first=ref.split(':')[0].rsplit('.',1)[-1]
            match=re.fullmatch(r'\$?([A-Z]+)\$?(\d+)',first)
            assert match,'invalid literal cache reference'
            col=0
            for letter in match[1]:col=col*26+ord(letter)-ord('A')+1
            pos=(int(match[2])-1,col-1)
        else:
            assert ref in ranges,'missing bound range descriptor: '+ref
            pos=ranges[ref];columns.append(pos[1]);cache_expectations[ref]=values
            source='Second' if values[0]=='11' else 'Local-Table' if mode=='reserved-case' else 'local-table' if mode.startswith('reserved') else 'First'
            assert ref.split('.')[0].strip("$'")==source,'bound formula was remapped'
        got=[grid.get((pos[0]+i,pos[1]),('',None))[0] for i in range(len(values))]
        assert got==values,(mode,ref,got,values)
    if mode in ('strings','strings-sparse','scatter'):
        references=root.findall('.//chart:categories',NS) if mode.startswith('strings') else root.findall('.//chart:domain',NS)
        assert references,'missing category/domain reference'
        ref=attr(references[0],'table','cell-range-address')
        assert ref in ranges,'category/domain cache descriptor missing'
        pos=ranges[ref]
        wanted=['001','','<three>',''] if mode=='strings-sparse' else ['001','A&B','<three>'] if mode=='strings' else ['101','102','103']
        assert [grid[pos[0]+i,pos[1]][0]for i in range(len(wanted))]==wanted
        if mode.startswith('strings'):assert all(grid[pos[0]+i,pos[1]][1]=='string'for i,value in enumerate(wanted)if value)
        cache_expectations[ref]=wanted
        columns.append(pos[1])
    if mode in ('reserved-scatter','reserved-bubble'):
        domains=root.findall('.//chart:domain',NS)
        assert len(domains)==2,'expected one literal domain per series'
        for domain in domains:
            ref=attr(domain,'table','cell-range-address')
            assert ref.startswith(cache_name+'.'),'literal domain retained stale cache name: '+ref
            first=ref.split(':')[0].rsplit('.',1)[-1];m=re.fullmatch(r'\$?([A-Z]+)\$?(\d+)',first)
            assert m,'invalid literal domain reference'
            col=0
            for letter in m[1]:col=col*26+ord(letter)-ord('A')+1
            assert [grid[int(m[2])-1+i,col-1][0]for i in range(3)]==['101','102','103'],'literal domain no longer resolves to its cache'
    assert len(set(columns))==len(columns),'bound sheet cache coordinate collision'
    # Cached numeric cells must not contain invalid float="" or textual float values.
    for value,kind in grid.values():
        if kind=='float':float(value)
    return {'series':len(series),'cached_ranges':len(ranges),'cells':len(grid),
        'range_values':cache_expectations}
def main():
    p=argparse.ArgumentParser();p.add_argument('--binary',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True);results=[]
    r=subprocess.run([a.binary,'reader'],capture_output=True,timeout=30)
    (out/'reader.stdout').write_bytes(r.stdout);(out/'reader.stderr').write_bytes(r.stderr)
    results.append({'case':'reader-matrix','pass':r.returncode==0,'exit':r.returncode,'output':r.stdout.decode(errors='replace')})
    for mode,sheet,bound in [('formula-prefix','local-table-report',True),('formula-exact','local-table',True),('formula-ordinary','Ordinary',True),('formula-literal','local-table',False)]:
        r=subprocess.run([a.binary,mode],capture_output=True,timeout=30)
        (out/(mode+'.xml')).write_bytes(r.stdout);(out/(mode+'.stderr')).write_bytes(r.stderr)
        result={'case':mode,'pass':False,'exit':r.returncode}
        try:
            assert r.returncode==0,'native formula conversion failed'
            xml=ET.fromstring(r.stdout)
            refs=[element.text or ''for element in xml.iter('{http://schemas.openxmlformats.org/drawingml/2006/chart}f')]
            assert len(refs)==(3 if bound else 0),('formula roles',refs)
            if bound:assert all(sheet in ref for ref in refs)and any('C1'in ref for ref in refs),('worksheet formula identity',refs)
            result['formulas']=refs;result['pass']=True
        except (AssertionError,ValueError,ET.ParseError)as e:result['error']=str(e)
        results.append(result)
    for mode in ['bound','literal-first','bound-first','strings','strings-sparse','scatter','sparse','sparse-idx','reserved','reserved-literal-first','reserved-bound-first','reserved-relative','reserved-case','reserved-scatter','reserved-bubble','provided-before','provided-after']:
        r=subprocess.run([a.binary,mode],capture_output=True,timeout=30)
        (out/(mode+'.xml')).write_bytes(r.stdout);(out/(mode+'.stderr')).write_bytes(r.stderr)
        result={'case':mode,'pass':False,'exit':r.returncode}
        try:
            assert r.returncode==0,'native driver failed'
            result.update(writer_check(r.stdout,mode))
            package=out/(mode+'-package');package.mkdir(exist_ok=True)
            (package/'META-INF').mkdir(exist_ok=True)
            declarations=' '.join('xmlns:'+p+'="'+v+'"'for p,v in NS.items())
            xml=('<office:document-content '+declarations+' office:version="1.3"><office:body>').encode()+r.stdout+b'</office:body></office:document-content>'
            (package/'content.xml').write_bytes(xml)
            (package/'mimetype').write_text('application/vnd.oasis.opendocument.chart')
            (package/'META-INF'/'manifest.xml').write_text('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.chart"/></manifest:manifest>')
            for ref,wanted in result['range_values'].items():
                parsed=subprocess.run([a.binary,'parsed',str(package),ref],capture_output=True,timeout=30)
                probe=hashlib.sha256(ref.encode()).hexdigest()[:16]
                (out/(mode+'-parsed-'+probe+'.stdout')).write_bytes(parsed.stdout)
                (out/(mode+'-parsed-'+probe+'.stderr')).write_bytes(parsed.stderr)
                got=[line[6:]for line in parsed.stdout.decode().splitlines()if line.startswith('point\t')]
                assert parsed.returncode==0 and got==wanted,('parsed cache roundtrip',mode,ref,got,wanted,parsed.stderr.decode(errors='replace'))
            result['parsed_cache_roundtrip']=bool(result['range_values']);result['pass']=True
        except (AssertionError,ValueError,ET.ParseError)as e:result['error']=str(e)
        results.append(result)
    def memory_bound():
        resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
        resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    for mode in ['limit-root-all','limit-root-size','limit-root-repeat','limit-root-boundary','limit-mapped-all','limit-mapped-size','limit-num-count','limit-num-index','limit-str-count','limit-str-index']:
        start=time.monotonic();result={'case':mode,'pass':False}
        try:
            r=subprocess.run([a.binary,mode],capture_output=True,timeout=5,preexec_fn=memory_bound)
            (out/(mode+'.stdout')).write_bytes(r.stdout);(out/(mode+'.stderr')).write_bytes(r.stderr)
            result['exit']=r.returncode
            result['pass']=r.returncode==0 and (b'limit PASS' in r.stdout if mode.startswith(('limit-root-','limit-mapped-'))else b'<table:table 'not in r.stdout)
        except subprocess.TimeoutExpired:result['timeout']=5
        result['seconds']=time.monotonic()-start;result['addressSpaceBytes']=512*1024*1024;results.append(result)
    budget_cases=['writer-budget-num','writer-budget-str','writer-budget-direct','writer-budget-roles','writer-budget-reset',
        'writer-boundary-num-count','writer-boundary-str-count','writer-boundary-num-index','writer-boundary-str-index',
        'writer-boundary-num-overcount','writer-boundary-str-overcount','writer-boundary-num-overindex','writer-boundary-str-overindex',
        'writer-reject-values','writer-reject-label','writer-reject-category','writer-reject-domain','writer-reject-bound-name','reader-budget-many','reader-budget-roles','reader-budget-shared-within','reader-budget-shared-limit','reader-budget-pivot']
    for mode in budget_cases:
        start=time.monotonic();result={'case':mode,'pass':False,'addressSpaceBytes':512*1024*1024}
        try:
            r=subprocess.run([a.binary,mode],capture_output=True,timeout=5,preexec_fn=memory_bound)
            (out/(mode+'.stdout')).write_bytes(r.stdout);(out/(mode+'.stderr')).write_bytes(r.stderr);result['exit']=r.returncode
            assert r.returncode==0,'native cache-admission process failed'
            if mode.startswith('reader-budget-'):assert b'reader-budget PASS' in r.stdout
            else:
                root=ET.fromstring(('<test '+' '.join('xmlns:'+p+'="'+v+'"'for p,v in NS.items())+'>').encode()+r.stdout+b'</test>')
                series=root.findall('.//chart:series',NS);refs=[attr(s,'chart','values-cell-range-address')for s in series];present=[ref for ref in refs if ref]
                if mode.startswith('writer-boundary-'):
                    assert len(present)==(0 if '-over' in mode else 1),('writer boundary rejected/accepted wrongly',refs)
                    if present:assert present[0].endswith('A1000000'),('writer boundary length',present)
                    result['scope']='Real cache admission/retention and resulting literal range, before table materialization'
                elif mode.startswith('writer-budget-'):
                    expected=3 if mode=='writer-budget-roles'else 1
                    assert len(present)==expected,('aggregate accepted cache ranges',len(present),expected)
                    if mode in ['writer-budget-num','writer-budget-str','writer-budget-direct']:assert len(series)==64
                    result['scope']='Real converter cache ingestion and retained metadata; no million-cell table expansion'
                else:
                    if mode=='writer-reject-bound-name':
                        tables=root.findall('.//table:table',NS)
                        assert len(tables)==1 and attr(tables[0],'table','name')=='local-table-1','rejected worksheet name collided with literal cache'
                        assert len(present)==2 and present[0].startswith('local-table-1.') and 'local-table' in present[1] and 'local-table-1' not in present[1],('worksheet formula not preserved',present)
                        charts=root.findall('.//chart:chart',NS)
                        assert len(charts)==1 and attr(charts[0],'xlink','href')=='..' and attr(charts[0],'xlink','type')=='simple','rejected bound cache lost parent source link'
                    if mode=='writer-reject-values':assert not present and not root.findall('.//table:table',NS),'rejected cache retained a local reference/table'
                    if mode=='writer-reject-label':assert not any(attr(s,'chart','label-cell-address')for s in series),'rejected label reference retained'
                    if mode in ['writer-reject-category','writer-reject-domain']:
                        kind='categories'if mode.endswith('category')else'domain'
                        assert not root.findall('.//chart:'+kind,NS),'rejected category/domain reference retained'
                    result['scope']='Complete finalized chart; rejected cache-only reference roles omitted'
                    package=out/(mode+'-package');(package/'META-INF').mkdir(parents=True)
                    decl=' '.join('xmlns:'+p+'="'+v+'"'for p,v in NS.items())
                    (package/'content.xml').write_bytes(('<office:document-content '+decl+' office:version="1.3"><office:body>').encode()+r.stdout+b'</office:body></office:document-content>')
                    (package/'mimetype').write_text('application/vnd.oasis.opendocument.chart')
                    (package/'META-INF/manifest.xml').write_text('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.chart"/></manifest:manifest>')

                result['acceptedRanges']=len(present)
            result['pass']=True
        except subprocess.TimeoutExpired:result['timeout']=5
        except (AssertionError,ValueError,ET.ParseError)as e:result['error']=str(e)
        result['seconds']=time.monotonic()-start;results.append(result)
    package=out/'mapping-counter-package';(package/'META-INF').mkdir(parents=True)
    decl=' '.join('xmlns:'+p+'="'+v+'"'for p,v in NS.items())
    data='<office:document-content '+decl+' office:version="1.3"><office:body><office:chart><chart:chart chart:class="chart:bar"><chart:plot-area/><table:table table:name="local-table"><table:table-columns><table:table-column table:number-columns-repeated="4294967295"/><table:table-column/></table:table-columns><table:table-row table:number-rows-repeated="4294967295"><table:table-cell table:number-columns-repeated="4294967295" office:value-type="float" office:value="7"/><table:table-cell table:number-columns-repeated="2" office:value-type="float" office:value="8"/><table:table-cell office:value-type="float" office:value="9"/></table:table-row><table:table-row table:number-rows-repeated="2"><table:table-cell office:value-type="float" office:value="10"/></table:table-row></table:table></chart:chart></office:chart></office:body></office:document-content>'
    (package/'content.xml').write_text(data);(package/'mimetype').write_text('application/vnd.oasis.opendocument.chart')
    (package/'META-INF/manifest.xml').write_text('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.chart"/></manifest:manifest>')
    r=subprocess.run([a.binary,'parsed',str(package),'__mapping__'],capture_output=True,timeout=5,preexec_fn=memory_bound)
    (out/'mapping-counter.stdout').write_bytes(r.stdout);(out/'mapping-counter.stderr').write_bytes(r.stderr)
    results.append({'case':'mapping-counter','pass':r.returncode==0 and b'mapping PASS'in r.stdout,'exit':r.returncode})
    (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(results,indent=2));return 0 if all(x['pass']for x in results)else 1
if __name__=='__main__':raise SystemExit(main())
