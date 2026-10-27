// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
for(const scenario of ['reject-keydown','release-held','release-modifier'])test('trusted native warning guard '+scenario,()=>{
 const script=String.raw`import ast,sys,signal,types
source=ast.parse(open(sys.argv[1]).read())
selected=[]
for n in source.body:
 if isinstance(n,ast.FunctionDef) and n.name in ("raw","key"):selected.append(n)
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="warning_guard" for t in n.targets):selected.append(n)
 if isinstance(n,ast.Assert) and "warning_guard" in ast.unparse(n):selected.append(n)
events=[];calls=[]
def guard():
 calls.append(True)
 if sys.argv[2]!="release-modifier" or len(calls)>1:raise AssertionError("semantic warning changed")
x=types.SimpleNamespace(XFlush=lambda d:None,XKeysymToKeycode=lambda d,s:s,XkbKeycodeToKeysym=lambda d,c,g,l:c)
xt=types.SimpleNamespace(XTestFakeKeyEvent=lambda d,k,down,t:events.append((k,down)) or True)
scope={"_native_warning_guard":guard,"safe":lambda:True,"held":[],"signal":signal,"cleanup_signals":{signal.SIGTERM,signal.SIGINT},"x":x,"xt":xt,"d":None,"time":types.SimpleNamespace(sleep=lambda n:None)}
exec(compile(ast.Module(body=selected,type_ignores=[]),sys.argv[1],"exec"),scope)
assert scope["warning_guard"] is guard
scenario=sys.argv[2]
if scenario=="reject-keydown":
 try:scope["raw"](10,1)
 except AssertionError as e:assert str(e)=="semantic warning changed"
 else:raise AssertionError("Semantic denial ignored")
 assert events==[] and scope["held"]==[] and len(calls)==1
elif scenario=="release-held":
 scope["safe"]=lambda:False;scope["held"].append(10);scope["raw"](10,0)
 assert events==[(10,0)] and scope["held"]==[] and calls==[]
else:
 try:scope["key"](ord("s"),control=True)
 except AssertionError as e:assert str(e)=="semantic warning changed"
 else:raise AssertionError("Main keydown was not denied")
 assert events==[(0xffe3,1),(0xffe3,0)] and scope["held"]==[] and len(calls)==2
`;
 const result=cp.spawnSync('python3',['-c',script,path.join(__dirname,'native-input.py'),scenario],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);
});
