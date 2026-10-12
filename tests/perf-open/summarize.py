# SPDX-License-Identifier: AGPL-3.0-only
"""Summarize D4 raw load profiles and opening/typing evidence."""
import json,sys,collections
from pathlib import Path
for folder in map(Path,sys.argv[1:]):
 for file in sorted(folder.glob('[0-9].json')):
  r=json.loads(file.read_text());ed=next((f for f in r['frames'] if f and f.get('pages')),None)
  if not ed:continue
  p=ed['perf'];t=r['t0'];a=r['accepted']
  print(str(file),json.dumps({'visible_ms':p['visibleFrame']-t,'editable_ms':a['t']-t,'pages':ed['pages'],
   'background_keys':sum(x['backgroundAtSend'] for x in r['typed']),'inserted':r.get('typingValidation',{}).get('inserted',sum(x.get('inserted',0) for x in r['typed'])),
   'spans':[{**s,'t':round(s['t']-t),'d':round(s['d'])} for s in p['spans'] if s['name'] not in ['Recalculate_Page','ContinueRecalculationLoop','Recalculate']][:20]}))
  profile=file.with_suffix('.cpuprofile')
  if not profile.exists():continue
  q=json.loads(profile.read_text());nodes={n['id']:n for n in q['nodes']};parents={c:n['id'] for n in q['nodes'] for c in n.get('children',[])}
  own=collections.Counter();incl=collections.Counter()
  for i,n in enumerate(q.get('samples',[])):
   dt=q['timeDeltas'][i]/1000
   own[n]+=dt
   seen=set()
   while n in nodes:
    f=nodes[n]['callFrame'];key=(f['functionName'],f['url'],f['lineNumber'])
    if key not in seen:incl[key]+=dt;seen.add(key)
    n=parents.get(n)
  print('self',[(round(ms),nodes[n]['callFrame']) for n,ms in own.most_common(15)])
  print('inclusive',[(round(ms),fn,line) for (fn,url,line),ms in incl.most_common(25)])
