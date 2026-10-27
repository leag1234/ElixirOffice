// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),cp=require('node:child_process');
function fixture(){
 const button=(name,key,focused)=>({pid:123,key,role:'push button',name,enabled:true,sensitive:true,visible:true,showing:true,focused,children:[]});
 const bounds=[12,20,500,140],body='Save a PDF copy with possible format loss?';
 return {expected:{pid:123,window:'0x123',bounds,body,cancel:'Cancel',saveCopy:'Save a Copy',choose:'saveCopy'},focused:true,
 snapshot:{pid:123,window:'0x123',mapped:true,bounds,dialogs:[{pid:123,key:'0',role:'alert',name:'',rect:bounds,visible:true,showing:true,children:[
 {pid:123,key:'0/0',role:'label',name:body,visible:true,showing:true,children:[]},button('Cancel','0/1',false),button('Save a Copy','0/2',true)]}]}};
}
function run(data){return cp.spawnSync('python3',[path.join(__dirname,'native-dialog.py'),'--match'],{input:JSON.stringify(data),encoding:'utf8',timeout:5000});}
test('native warning selects the exact enabled focused copy choice',()=>{const result=run(fixture());assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout),'0/2');});
test('native warning selects Cancel with the same strict body/buttons',()=>{const data=fixture();data.expected.choose='cancel';data.snapshot.dialogs[0].children[1].focused=true;data.snapshot.dialogs[0].children[2].focused=false;const result=run(data);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout),'0/1');});
for(const [label,mutate] of [
 ['foreign process',d=>d.snapshot.pid++],
 ['foreign descendant',d=>d.snapshot.dialogs[0].children[1].pid++],
 ['changed native window',d=>d.snapshot.window='0x456'],
 ['unmapped warning',d=>d.snapshot.mapped=false],
 ['moved native geometry',d=>d.snapshot.bounds=[13,20,500,140]],
 ['accessible geometry differs',d=>d.snapshot.dialogs[0].rect=[12,21,500,140]],
 ['missing native warning',d=>d.snapshot.dialogs=[]],
 ['extra native warning',d=>d.snapshot.dialogs.push(structuredClone(d.snapshot.dialogs[0]))],
 ['wrong warning text',d=>d.snapshot.dialogs[0].children[0].name='Overwrite an existing file?'],
 ['ambiguous warning text',d=>d.snapshot.dialogs[0].children.push(structuredClone(d.snapshot.dialogs[0].children[0]))],
 ['missing choice',d=>d.snapshot.dialogs[0].children.pop()],
 ['duplicate choice',d=>d.snapshot.dialogs[0].children[1].name='Save a Copy'],
 ['extra choice',d=>d.snapshot.dialogs[0].children.push({...d.snapshot.dialogs[0].children[1],name:'Replace'})],
 ['wrong choice label',d=>d.snapshot.dialogs[0].children[2].name='Replace'],
 ['disabled choice',d=>d.snapshot.dialogs[0].children[2].enabled=false],
 ['insensitive choice',d=>d.snapshot.dialogs[0].children[2].sensitive=false],
 ['hidden choice',d=>d.snapshot.dialogs[0].children[2].showing=false],
 ['changed focus',d=>{d.snapshot.dialogs[0].children[2].focused=false;d.snapshot.dialogs[0].children[1].focused=true;}],
 ['ambiguous focus',d=>d.snapshot.dialogs[0].children[1].focused=true],
 ['unknown choice',d=>d.expected.choose='replace'],
 ['hidden warning body',d=>d.snapshot.dialogs[0].children[0].showing=false],
 ['unexpected editable control',d=>d.snapshot.dialogs[0].children.push({pid:123,role:'entry',name:'',children:[]})],
 ['empty warning expectation',d=>d.expected.body=''],
 ['ambiguous choice expectation',d=>d.expected.cancel=d.expected.saveCopy]
])test('native warning rejects '+label,()=>{const data=fixture();mutate(data);const result=run(data);assert.notEqual(result.status,0,'Unexpected native acceptance: '+result.stdout);assert.match(result.stderr,/AssertionError/);});
test('localized native text is compared exactly',()=>{const data=fixture();data.expected.body='Save a PDF copy?';data.expected.cancel='Abbrechen';data.expected.saveCopy='Kopie speichern';data.snapshot.dialogs[0].children[0].name=data.expected.body;data.snapshot.dialogs[0].children[1].name=data.expected.cancel;data.snapshot.dialogs[0].children[2].name=data.expected.saveCopy;const result=run(data);assert.equal(result.status,0,result.stderr);});

for(const scenario of ['missing-config','foreign-address','regular-file','foreign-peer','session-fallback'])test('private native bus rejects '+scenario+' before accessibility enumeration',()=>{
 const script=String.raw`import os,sys,tempfile,pathlib,json,socket,runpy
module=runpy.run_path(sys.argv[1])
if sys.platform!="linux":
 try:module["owned_bus"]()
 except AssertionError as error:assert str(error)=="Native dialog guards require Linux";raise SystemExit(0)
 raise AssertionError("Unsupported platform accepted")
with tempfile.TemporaryDirectory(prefix="eo-a11y-policy-") as folder:
 root=pathlib.Path(folder);parent=root/"a11y";parent.mkdir(mode=0o700);runtime=root/"runtime";runtime.mkdir(mode=0o700)
 manifest=parent/"identity.json";manifest.write_text(json.dumps({"daemon":{"pid":-1},"registry":{}}));manifest.chmod(0o600)
 for key in ["EO_NATIVE_A11Y","AT_SPI_BUS_ADDRESS"]:os.environ.pop(key,None)
 os.environ.update(EO_DESKTOP_ROOT=str(root),ATSPI_DISABLE_P2P="1",ACCESSIBILITY_ENABLED="1",XDG_RUNTIME_DIR=str(runtime),DBUS_SESSION_BUS_ADDRESS="unix:path="+str(root/"no-session-bus"))
 scenario=sys.argv[2]
 if scenario!="missing-config":
  os.environ["EO_NATIVE_A11Y"]=str(manifest);os.environ["AT_SPI_BUS_ADDRESS"]="unix:path="+str(parent/"bus")
 if scenario=="foreign-address":os.environ["AT_SPI_BUS_ADDRESS"]="tcp:host=127.0.0.1,port=1"
 if scenario=="regular-file":(parent/"bus").touch()
 server=None
 if scenario in ("foreign-peer","session-fallback"):
  server=socket.socket(socket.AF_UNIX);server.bind(str(parent/"bus"));server.listen(1)
 if scenario=="session-fallback":os.environ["DBUS_SESSION_BUS_ADDRESS"]="unix:path="+str(root/"unused")+";unix:path=/run/user/1000/bus;unix:path="+str(root/"no-session-bus")
 try:
  try:module["owned_bus"]()
  except (KeyError,AssertionError) as error:
   if scenario=="foreign-address":assert "exact owned Unix bus" in str(error)
   if scenario=="foreign-peer":assert "Foreign accessibility bus peer" in str(error)
   if scenario=="session-fallback":assert "canonical disabled session endpoint" in str(error)
  else:raise AssertionError("Invalid private bus accepted")
 finally:
  if server:server.close()
`;
 const result=cp.spawnSync('python3',['-c',script,path.join(__dirname,'native-dialog.py'),scenario],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);
});
