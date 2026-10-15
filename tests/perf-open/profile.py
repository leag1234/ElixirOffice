"""Exclusive CPU sample categories and function stacks (not additive wall phases)."""
import json,sys,collections
from pathlib import Path
for folder in map(Path,sys.argv[1:]):
 for file in sorted(folder.glob('*.cpuprofile')):
  q=json.loads(file.read_text());nodes={n['id']:n for n in q['nodes']};parents={c:n['id'] for n in q['nodes'] for c in n.get('children',[])}
  categories=collections.Counter();inclusive=collections.Counter();selftime=collections.Counter()
  for i,leaf in enumerate(q.get('samples',[])):
   dt=q['timeDeltas'][i]/1000;n=leaf;stack=[]
   while n in nodes:
    stack.append(nodes[n]['callFrame']);n=parents.get(n)
   names=[f['functionName'] for f in stack];text=' '.join(names)
   if '(idle)' in names:cat='idle'
   elif '(garbage collector)' in names:cat='gc'
   elif '(program)' in names:cat='vm/native'
   elif any('Recalculate_Page' in n for n in names):cat='layout'
   elif any(n in ('Read','ReadFromStream','ReadMainTable') for n in names) and any('OpenDocumentFromBin' in n for n in names):
    if 'PostLoadPrepare' in names:cat='model fixup'
    elif any(n in ('CRunText','ParaRun','Paragraph','CTable','CTableRow','CTableCell') or n.endswith('.Add_ToContent') for n in names):cat='model construction'
    else:cat='binary decoding'
   elif any('StylePreviewGenerator' in n or 'GenerateStyles' in n for n in names):cat='style previews'
   elif any('OnPaint' in n or n.endswith('.Draw') or 'DrawPage' in n for n in names):cat='drawing'
   elif any('/web-apps/' in f['url'] for f in stack):cat='web-apps/bootstrap'
   else:cat='other SDK'
   categories[cat]+=dt
   f=stack[0];selftime[(f['functionName'],f['url'],f['lineNumber'],f['columnNumber'])]+=dt
   for key in {(f['functionName'],f['url'],f['lineNumber'],f['columnNumber']) for f in stack}:inclusive[key]+=dt
  def top(c):
   return [{'ms':round(ms,2),'name':k[0],'url':k[1],'line':k[2]+1,'column':k[3]+1} for k,ms in c.most_common(60)]
  print(json.dumps({'file':str(file),'categories_ms':dict(categories),'top_self':top(selftime),'top_inclusive':top(inclusive)}))
