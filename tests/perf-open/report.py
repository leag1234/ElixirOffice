# SPDX-License-Identifier: AGPL-3.0-only
"""Aggregate the matched D4 visits; retain outliers and report sample ranges."""
import json,statistics,sys
from pathlib import Path
def median(xs):return statistics.median(xs) if xs else None
def quantile(xs,q):
 xs=sorted(xs)
 if not xs:return None
 i=(len(xs)-1)*q;lo=int(i);hi=min(lo+1,len(xs)-1)
 return xs[lo]+(xs[hi]-xs[lo])*(i-lo)
rows=[]
for label,root,prefix in zip(sys.argv[1::3],sys.argv[2::3],sys.argv[3::3]):
 root=Path(root);groups={}
 for folder in sorted(root.glob(prefix+'*')):
  if not folder.is_dir():continue
  validity=folder/'validity.json'
  if validity.exists() and not json.loads(validity.read_text())['accepted']:continue
  for file in sorted(folder.glob('[01].json')):
   r=json.loads(file.read_text());e=next(f for f in r['frames'] if f and f.get('pages'));t=r['t0']
   doc='large' if e['pages']==97 else 'ten';regime='cold' if r['visit']==0 else 'reused'
   bg=[x['ms'] for x in r['typed'] if x['backgroundAtSend']]
   keys=[x['key']['t'] for x in r['typed']]
   spans=e['perf']['spans']
   def duration(name):
    vals=[s['d'] for s in spans if s['name']==name]
    return sum(vals) if vals else None
   entry={'file':str(file),'visible_ms':e['perf']['visibleFrame']-t,'editable_ms':r['accepted']['t']-t,
    'background_keys':len(bg),'typing_bg_p50_ms':quantile(bg,.5),'typing_bg_p95_ms':quantile(bg,.95),
    'typing_hz':(len(keys)-1)*1000/(keys[-1]-keys[0]) if len(keys)>1 else None,
    'parse_ms':duration('OpenDocumentFromBin'),'fonts_end_cpu_ms':duration('asyncFontsDocumentEndLoaded'),
    'reader_main_ms':duration('BinaryFileReader.ReadMainTable'),'reader_post_ms':duration('BinaryFileReader.PostLoadPrepare'),
    'conversion':e.get('conversion'),'exact':r.get('typingValidation',{}).get('exact'),
    'load_before':r['loadBefore'],'load_after':r['loadAfter']}
   groups.setdefault((doc,regime),[]).append(entry)
 for (doc,regime),samples in groups.items():
  result={'host_phase':label,'doc':doc,'regime':regime,'n':len(samples),'samples':samples}
  for key in ['visible_ms','editable_ms','typing_bg_p50_ms','typing_bg_p95_ms','typing_hz','parse_ms','fonts_end_cpu_ms','reader_main_ms','reader_post_ms']:
   vals=[s[key] for s in samples if s[key] is not None]
   result[key]=median(vals)
   if vals:result[key+'_range']=[min(vals),max(vals)]
  result['background_keys']=sum(s['background_keys'] for s in samples)
  rows.append(result)
print(json.dumps(rows,indent=2))
