// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.env.EO_PRODUCT_ROOT||path.join(__dirname,'../..'));
const source=fs.readFileSync(path.join(root,'desktop/renderer.js'),'utf8');
const start=source.indexOf('async function showOptions(){'),end=source.indexOf('\nasync function',start+2);
assert(start>=0&&end>start,'Load the complete production Options function');

function fixture({home=false,bodyInvoker=false,closedInvoker=false,pending=false,customTitleBar=false,customTitleBarAvailable=false,openInTabs=false,showHomeTab=false}={}){
 const focused=[],boxes=[],windowSaved=[];let release,opened;const opening=new Promise(r=>opened=r);
 const document={activeElement:null,createTextNode:text=>({text}),createElement:tag=>element(tag),querySelector:selector=>selector==='dialog[open]'?boxes.find(b=>b.open)||null:null};
 function element(tag,doc=document){
  const e={tagName:tag.toUpperCase(),ownerDocument:doc,isConnected:true,children:[],listeners:{},parentElement:null,
   append(...children){for(const c of children){this.children.push(c);c.parentElement=this;}},
   setAttribute(){},contains(other){return other===this||this.children.some(c=>c.contains?.(other));},
   closest(selector){if(selector!=='dialog.desktop-options:not([open])')throw Error('Unsupported fixture selector: '+selector);let n=this;while(n){if(n.tagName==='DIALOG'&&!n.open&&n.className?.split(/\s+/).includes('desktop-options'))return n;n=n.parentElement;}return null;},
   addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},
   focus(){focused.push(this);doc.activeElement=this;if(doc!==document)document.activeElement=target;},
   close(){this.open=false;document.activeElement=document.body;},
   dispatchClose(){this.isConnected=false;for(const fn of this.listeners.close||[])fn();}
  };return e;
 }
 document.body=element('body');const inner={body:{},activeElement:null},child=element('textarea',inner),target=element(home?'button':'iframe');
 target.contentDocument=inner;inner.activeElement=child;
 const originalFrame=home?null:{frameElement:target},originalFile=home?null:{format:'docx'},originalController=home?null:{};
 let invoker=target;
 if(bodyInvoker)invoker=document.body;
 if(closedInvoker){const old=element('dialog');old.className='desktop-options';old.open=false;invoker=element('button');old.append(invoker);}
 document.activeElement=invoker;
 const context={document,frame:originalFrame,file:originalFile,controller:originalController,main:null,
  t:x=>x,eoDesktop:{releaseOptions:async()=>({enabled:true}),releaseSettings:async()=>{},windowOptions:async()=>({customTitleBar,customTitleBarAvailable,openInTabs,showHomeTab,effectiveFrame:'native'}),windowSettings:async value=>windowSaved.push(value),recoveryOptions:async()=>({enabled:false,seconds:30}),author:()=>pending?new Promise(r=>release=r):Promise.resolve('Public author'),recoverySettings:async()=>{},authorSave:async v=>v},
  modal:()=>{const box=element('dialog');box.className='desktop-options';box.open=true;boxes.push(box);document.activeElement=document.body;opened();return box;},
  addFontOptions:async()=>{},modalButton:(box,label,fn)=>{const b=element('button');b.textContent=label;b.action=fn;box.append(b);return b;}
 };
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.runOptions=showOptions;',context);
 const open=async()=>{const result=context.runOptions();await opening;return {box:boxes.at(-1),result};};
 const clear=()=>focused.splice(0);const close=box=>{box.close();clear();box.dispatchClose();};
 return {windowSaved,document,inner,child,target,context,boxes,focused,originalFrame,originalFile,originalController,element,open,clear,close,release:()=>release('Public delayed author')};
}

test('Options focuses its attached first recovery control before delayed author IPC',async()=>{
 const f=fixture({pending:true}),{box,result}=await f.open();
 const controls=node=>(node.children||[]).flatMap(child=>['INPUT','SELECT','BUTTON'].includes(child.tagName)?[child]:controls(child));
 const first=controls(box)[0];
 assert.equal(first.id,'recovery-enabled');assert.equal(f.document.activeElement,first);assert(box.contains(first));
 f.close(box);f.clear();f.release();await result;
 assert.deepEqual(f.focused,[],'Late detached content must not retake focus');
});
test('Ordinary close restores the captured frame and its actual child',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;f.close(box);
 assert.deepEqual(f.focused,[f.target,f.child]);
});
for(const mode of ['bodyInvoker','closedInvoker'])test(mode+' close recovers the current document owner',async()=>{
 const f=fixture({[mode]:true}),{box,result}=await f.open();await result;f.close(box);
 assert.deepEqual(f.focused,[f.target,f.child]);
});
test('Home preserves its connected ordinary invoker',async()=>{
 const f=fixture({home:true}),{box,result}=await f.open();await result;f.close(box);assert.deepEqual(f.focused,[f.target]);
});
for(const key of ['frame','file','controller'])test('A replaced '+key+' cancels stale restoration',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;f.context[key]={};f.close(box);assert.deepEqual(f.focused,[]);
});
test('A newer modal keeps ownership',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;box.close();const newer=f.element('dialog');newer.open=true;f.boxes.push(newer);f.clear();box.dispatchClose();assert.deepEqual(f.focused,[]);
});
test('Another top-level control keeps ownership',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;box.close();f.document.activeElement=f.element('input');f.clear();box.dispatchClose();assert.deepEqual(f.focused,[]);
});
test('Another inner control keeps ownership even with BODY as the top-level owner',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;box.close();f.inner.activeElement=f.element('input',f.inner);f.clear();box.dispatchClose();assert.deepEqual(f.focused,[]);
});
test('A replaced iframe Document cancels the old child restoration',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;f.target.contentDocument={activeElement:f.child,body:{}};f.close(box);assert.deepEqual(f.focused,[]);
});
for(const key of ['target','child'])test('A detached '+key+' cannot receive stale focus',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;f[key].isConnected=false;f.close(box);assert.deepEqual(f.focused,[]);
});


for(const [customTitleBar,customTitleBarAvailable] of [[false,false],[true,false],[false,true]])test('grouped Options retains native-frame preference '+customTitleBar+'/'+customTitleBarAvailable,async()=>{
 const f=fixture({customTitleBar,customTitleBarAvailable}),{box,result}=await f.open();await result;
 const all=node=>[node,...(node.children||[]).flatMap(all)],nodes=all(box),checkbox=nodes.find(e=>e.id==='custom-title-bar');
 assert(checkbox);assert.equal(checkbox.checked,customTitleBar);assert.equal(checkbox.disabled,!customTitleBarAvailable&&!customTitleBar);
 assert(nodes.some(e=>e.id==='custom-title-bar-description'));assert(nodes.some(e=>e.id==='custom-title-bar-note'));
 checkbox.checked=false;await nodes.find(e=>e.className==='btn btn-primary').action();
 assert.equal(f.windowSaved.length,1);assert.equal(f.windowSaved[0].customTitleBar,false);
});

test('Window Options defaults to A and enables Home only for tab modes without forgetting its stored choice',async()=>{
 const f=fixture(),{box,result}=await f.open();await result;
 const all=node=>[node,...(node.children||[]).flatMap(all)],nodes=all(box);
 const tabs=nodes.find(n=>n.id==='open-documents-in-tabs'),home=nodes.find(n=>n.id==='show-home-tab');
 assert(tabs&&home);assert.equal(tabs.checked,false);assert.equal(home.checked,false);assert.equal(home.disabled,true);
 tabs.checked=true;for(const fn of tabs.listeners.change||[])fn();assert.equal(home.disabled,false);
 home.checked=true;tabs.checked=false;for(const fn of tabs.listeners.change||[])fn();assert.equal(home.disabled,true);assert.equal(home.checked,true);
 await nodes.find(n=>n.className==='btn btn-primary').action();assert.equal(f.windowSaved[0].openInTabs,false);assert.equal(f.windowSaved[0].showHomeTab,true);
});
