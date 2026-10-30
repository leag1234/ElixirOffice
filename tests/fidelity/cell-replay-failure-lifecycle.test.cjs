// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Execute the actual scheduler and output entry points with controlled callees.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),
 assert=require('node:assert/strict'),{test}=require('node:test');
assert(process.env.EO_SDKJS,'Explicit SDK source required');
const read=f=>fs.readFileSync(path.join(process.env.EO_SDKJS,f),'utf8');
function method(file,name,replacement=name){
 const source=read(file),start=source.indexOf(name+' = function');
 assert(start>=0,name);let end=source.indexOf('{',start)+1,depth=1;
 for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 return source.slice(start,end).replace(name,replacement)+';';
}
function fixture(){
 class CDocument{
  constructor(){this.Content=[];this.RecalcId=1;this.MainDocument=true;this.PrintSelection=false;
   this.FullRecalc={Id:7,PageIndex:0,Continue:true};this.ends=[];this.events=[];this.restarts=[];
   this.DrawingDocument={OnEndRecalculate:(...args)=>this.ends.push(args)};
   this.RecalcInfo={Set_NeedRecalculateFromStart:v=>this.restarts.push(v)};
   this.Api={sendEvent:(...args)=>this.events.push(args)};}
  GetRecalcId(){return this.RecalcId;}IsDocumentEditor(){return true;}
 }
 class CDocumentContent{}class CBlockLevelSdt{}class Drawing{}
 const timers=[],cleared=[];
 const c=vm.createContext({window:{AscWord:{},Asc:{linerule_Exact:1}},CDocument,CDocumentContent,CBlockLevelSdt,
  Drawing,performance:{now:()=>0},setTimeout:fn=>{timers.push(fn);return 7;},clearTimeout:id=>cleared.push(id),
  vmerge_Continue:2,recalcresult_PrevPage:2,recalcresult2_CellReplayRequested:8,
  recalcresult2_End:0,recalcresult2_NextPage:1,recalcresult2_CurPage:2,
  recalcresultflags_Column:0x10000,recalcresultflags_Page:0x20000,
  Asc:{c_oAscError:{ID:{EditingError:42,Unknown:43},Level:{NoCritical:0}}},
  AscCommon:{CDocumentRenderer:class Renderer{}}});
 for(const f of ['CellWidowReplay.js','CellWidowReplayController.js'])
  vm.runInContext(read('word/Editor/'+f),c);
 c.AscWord=c.window.AscWord;c.window.Asc.c_oAscError=c.Asc.c_oAscError;
 for(const name of ['ContinueRecalculationLoopTimer','ContinueRecalculationLoop'])
  vm.runInContext(method('word/Editor/Document.js','CDocument.prototype.'+name),c);
 const api=c.AscWord.CellWidowReplay,doc=new CDocument();
 const error=new c.AscWord.CCellWidowReplayProtocol.QualificationError('controlled failure');
 return{api,doc,error,c,timers,cleared};
}
const typed=e=>e?.name==='CellWidowQualificationError';
function failed(s){assert.equal(s.doc.FullRecalc.Id,null);assert.equal(s.doc.FullRecalc.Continue,false);
 assert.deepEqual(s.doc.ends,[[false,true]]);assert.deepEqual(s.doc.restarts,[true]);
 assert.equal(s.api.isLayoutFailed(s.doc),true);assert.throws(()=>s.api.assertLayoutReady(s.doc),typed);}
test('actual synchronous scheduler preserves failure and finishes calculation lifecycle',()=>{
 const s=fixture();s.doc.Recalculate_Page=()=>{throw s.error;};
 assert.throws(()=>s.doc.ContinueRecalculationLoop(7),e=>e===s.error);failed(s);
 assert.deepEqual(s.cleared,[7]);assert.deepEqual(s.doc.events,[]);
});
test('actual timer reports a typed failure without generic global error fallback',()=>{
 const s=fixture();s.doc.Recalculate_Page=()=>{throw s.error;};
 assert.equal(s.doc.ContinueRecalculationLoopTimer(),7);
 assert.doesNotThrow(()=>s.timers[0]());failed(s);
 assert.deepEqual(s.doc.events,[['asc_onError',43,0]]);
});
test('unrelated scheduler errors are not consumed or relabeled',()=>{
 const s=fixture(),error=new Error('unrelated');s.doc.Recalculate_Page=()=>{throw error;};
 s.doc.ContinueRecalculationLoopTimer();
 assert.throws(()=>s.timers[0](),e=>e===error);
 assert.equal(s.doc.FullRecalc.Id,7);assert.deepEqual(s.doc.ends,[]);
 assert.equal(s.api.isLayoutFailed(s.doc),false);
});
test('failure cleanup is idempotent through nested scheduler boundaries',()=>{
 const s=fixture();assert.equal(s.api.failLayout(s.doc,s.error),true);
 assert.equal(s.api.failLayout(s.doc,s.error),true);failed(s);
});
test('same generation cannot turn a failed layout into success',()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);
 assert.throws(()=>s.api.beginGeneration(s.doc),typed);
 assert.throws(()=>s.api.completeLayout(s.doc),typed);
 assert.throws(()=>s.api.assertLayoutReady(s.doc),typed);
});
test('fresh-generation recovery keeps output blocked until full layout completion',()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);s.doc.RecalcId++;
 assert.equal(s.api.beginGeneration(s.doc),true);
 assert.throws(()=>s.api.assertLayoutReady(s.doc),typed);
 s.api.completeLayout(s.doc);
 assert.equal(s.api.isLayoutFailed(s.doc),false);assert.doesNotThrow(()=>s.api.assertLayoutReady(s.doc));
});
for(const property of ['MainDocument','PrintSelection'])test(property+' excluded document cannot acquire a scheduler capability',()=>{
 const s=fixture();s.doc[property]=property==='PrintSelection';
 const table={Parent:s.doc,Index:0,LogicDocument:s.doc,Content:[],HeaderInfo:{Count:0},
  Is_Inline:()=>true},row={Index:0,Table:null,Content:[],Get_Height:()=>({HRule:0})};
 const cell={Index:0,Row:row,Content:null,GetTable:()=>table,IsVerticalText:()=>false,IsInHeader:()=>false,GetVMerge:()=>1};
 const owner=new s.c.CDocumentContent();owner.Parent=cell;owner.Content=[];
 owner.RecalcInfo={WidowControlParagraph:null,WidowControlLine:-1,WidowControlReset:false};
 owner.GetDocumentContentForRecalcInfo=()=>owner;
 owner.Pages=[{X:0,Y:0,XLimit:100,YLimit:100}];
 let called=false;owner.Recalculate_Page=()=>{called=true;assert.equal(s.api.getOwner(owner),null);return 0;};
 cell.Content=owner;row.Content=[cell];table.Content=[row];s.doc.Content=[table];
 assert.equal(s.api.beginGeneration(s.doc),false);
 s.api.withDocument(s.doc,table,0,0,1,()=>s.api.calculateCell(table,cell,0,0));
 assert.equal(called,true);assert.equal(s.api.snapshot(s.doc).workUsed,0);
});
for(const name of ['RenderDocument','ToRenderer','ToRenderer2','ToRendererPart','GenerateSelectionPrint'])
 test('failed layout refuses actual '+name+' before output-side effects',()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);
 vm.runInContext(method('word/Drawing/DrawingDocument.js','this.'+name,'Drawing.prototype.'+name),s.c);
 const drawing=new s.c.Drawing();drawing.m_oLogicDocument=s.doc;
 drawing.m_oWordControl={m_oLogicDocument:s.doc,m_oApi:{ShowParaMarks:true}};
 assert.throws(()=>drawing[name](),typed);
 assert.equal(drawing.m_oWordControl.m_oApi.ShowParaMarks,true);
 });
test('failed layout refuses actual native page count before emitting an incomplete PDF',()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);
 const source=read('word/api.js'),prefix='window["asc_docs_api"].prototype["asc_nativePrintPagesCount"]';
 vm.runInContext(method('word/api.js',prefix,'Drawing.prototype.count'),s.c);
 const drawing=new s.c.Drawing();drawing.WordControl={m_oLogicDocument:s.doc,m_oDrawingDocument:{m_lPagesCount:7}};
 assert.throws(()=>drawing.count(),typed);
});
test('failed layout blocks renderer page output without breaking ordinary screen drawing',()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);let drawn=0;s.doc.Draw=()=>drawn++;
 const source=read('word/Editor/Document.js');
 const start=source.indexOf('CDocument.prototype.DrawPage '),end=source.indexOf('CDocument.prototype.CanDrawPage',start);
 vm.runInContext(source.slice(start,end),s.c);
 assert.throws(()=>s.doc.DrawPage(0,new s.c.AscCommon.CDocumentRenderer()),typed);
 assert.equal(drawn,0);s.doc.DrawPage(0,{});assert.equal(drawn,1);
});
test('failed layout marks screen pages unavailable until successful full recovery',()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);
 vm.runInContext(method('word/Editor/Document.js','CDocument.prototype.CanDrawPage'),s.c);
 assert.equal(s.doc.CanDrawPage(0),false);
});

test('failed recalculation cancels a queued print action without emitting output',()=>{
 const s=fixture(),ended=[];s.doc.DrawingDocument.m_arPrintingWaitEndRecalculate=[9];
 s.doc.DrawingDocument.isDisableEditBeforeCalculateLA=true;
 s.doc.Api.sync_EndAction=(...args)=>ended.push(args);
 s.c.window.Asc.c_oAscAsyncActionType={BlockInteraction:1};
 s.c.window.Asc.c_oAscAsyncAction={Waiting:2};
 s.api.failLayout(s.doc,s.error);failed(s);
 assert.equal(s.doc.DrawingDocument.m_arPrintingWaitEndRecalculate,null);
 assert.equal(s.doc.DrawingDocument.isDisableEditBeforeCalculateLA,false);
 assert.deepEqual(ended,[[1,9],[1,2]]);
});
for(const kind of ['error','rejection'])test('actual global '+kind+' boundary preserves editability only for the recorded typed failure',()=>{
 const s=fixture(),generic=[];s.api.failLayout(s.doc,s.error);
 const text=read('common/apiBase.js'),start=text.indexOf('var oldOnunhandledrejection = window.onunhandledrejection;');
 const end=text.indexOf('// disable mousewheel',start);assert(start>=0&&end>start);
 s.c.t={WordControl:{m_oLogicDocument:s.doc}};
 s.c.console={error(){}};
 s.c.shouldHandleError=()=>true;s.c.sendUnhandledError=(...args)=>generic.push(args);
 vm.runInContext(text.slice(start,end),s.c);
 const handler=kind==='error'?s.c.window.onerror:s.c.window.onunhandledrejection;
 const fire=error=>kind==='error'?handler(error.message,'http://same-origin/test.js',1,1,error):
  handler({reason:error,preventDefault(){}});
 assert.equal(fire(s.error),true);assert.equal(generic.length,0);
 assert.deepEqual(s.doc.events,[['asc_onError',43,0]]);
 fire(new Error('unrelated after layout failure'));assert.equal(generic.length,1);
});

for(const entry of ['private_Recalculate','RecalculateByChanges'])
 test('actual '+entry+' records a synchronous fast-path qualification failure',()=>{
 const s=fixture();
 vm.runInContext(method('word/Editor/Document.js','CDocument.prototype.'+entry),s.c);
 Object.assign(s.doc,{Is_OnRecalculate:()=>true,DocumentOutline:{Update(){}},MathTrackHandler:{Update(){}},
  private_ClearSearchOnRecalculate(){},Action:{Start:false},History:{GetNonRecalculatedChanges:()=>[]},
  private_RecalculateFastRunRange(){throw s.error;}});
 Object.assign(s.doc.RecalcInfo,{Paused:false,Is_NeedRecalculateFromStart:()=>false});
 assert.throws(()=>entry==='private_Recalculate'?s.doc[entry]():s.doc[entry]([],0,0),e=>e===s.error);
 failed(s);
 });
function clientFunction(name){
 const source=read('common/clientpdf/clientpdf.js');
 const needle=name==='build'?'async function build(':'run: function (';
 const start=source.indexOf(needle);assert(start>=0);
 let end=source.indexOf('{',start)+1,depth=1;
 for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 return source.slice(start,end).replace(name==='build'?'async function build':'run: function',
  name==='build'?'async function build':'Drawing.prototype.run = function')+';';
}
test('actual client PDF build rejects failed layout before any backend or fallback',async()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);let captures=0;
 Object.assign(s.c,{preferredBackend:'wasm',backendId:'wasm',now:()=>0,
  discoverRuntime:async()=>true,buildOnce:async()=>{captures++;return{bytes:new Uint8Array([1]),stats:{}};}});
 vm.runInContext(clientFunction('build'),s.c);
 await assert.rejects(s.c.build({WordControl:{m_oLogicDocument:s.doc}},{}),e=>e===s.error);
 assert.equal(captures,0);
});
test('actual client PDF rejection releases action and never falls back to the server',async()=>{
 const s=fixture();s.api.failLayout(s.doc,s.error);let downloads=0;const ended=[];
 s.c.build=()=>Promise.reject(s.error);
 Object.assign(s.c.AscCommon,{changeFileExtention:()=> 'test.pdf'});
 s.c.Asc=s.c.window.Asc;
 s.c.window.Asc.c_oAscAsyncActionType={BlockInteraction:1};
 vm.runInContext(clientFunction('run'),s.c);
 const pdf=new s.c.Drawing(),api={WordControl:{m_oLogicDocument:s.doc},documentTitle:'test.docx',
  sendEvent:(...args)=>s.doc.events.push(args),sync_EndAction:(...args)=>ended.push(args),
  downloadAs:()=>downloads++};
 const options={fileType:0};assert.equal(pdf.run(api,9,options,0),true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(downloads,0);assert.equal(options.eoClientPdfSkip,undefined);
 assert.deepEqual(ended,[[1,9]]);
 assert(s.doc.events.some(row=>row[0]==='asc_onClientPdf'&&row[1].state==='error'));
 assert(!s.doc.events.some(row=>row[0]==='asc_onClientPdf'&&row[1].state==='fallback'));
});

test('actual editor alert dismissal does not disable editing after a layout failure',()=>{
 const s=fixture(),alerts=[],disabled=[],notifications=[];
 const web=process.env.EO_WEB_APPS||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer/web-apps');
 const source=fs.readFileSync(path.join(web,'apps/documenteditor/main/app/controller/Main.js'),'utf8');
 const start=source.indexOf('onError: function(id, level, errData) {');assert(start>=0);
 let end=source.indexOf('{',start)+1,depth=1;
 for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
 s.c.Main=class Main{};s.c.LoadingDocument=1;
 s.c.Asc=s.c.window.Asc;s.c.Asc.c_oAscAsyncActionType={BlockInteraction:1};
 s.c.Asc.c_oAscError.Level.Critical=1;
 s.c._={bind:(fn,receiver)=>fn.bind(receiver)};
 s.c.Common={Gateway:{reportWarning(){}},
  NotificationCenter:{trigger:(...args)=>notifications.push(args)},
  Utils:{ModalWindow:{isVisible:()=>false}},component:{Analytics:{trackEvent(){}}},
  UI:{alert:config=>{alerts.push(config);return{$window:{attr(){}}};}}};
 vm.runInContext(source.slice(start,end).replace('onError: function','Main.prototype.onError = function')+';',s.c);
 const main=new s.c.Main();Object.assign(main,{appOptions:{isDesktopApp:true,isOffline:true},
  hidePreloader(){},onLongActionEnd(){},onEditComplete(){},
  disableEditing:value=>disabled.push(value),unknownErrorText:'Unknown error',
  errorEditingSaveas:'Editing error',errorDefaultMessage:'Error %1'});
 s.doc.Api.sendEvent=(event,id,level)=>{if(event==='asc_onError')main.onError(id,level);};
 s.api.failLayout(s.doc,s.error);assert.equal(s.api.reportLayoutFailure(s.doc,s.error),true);
 assert.equal(alerts.length,1);assert.equal(alerts[0].iconCls,'warn');
 alerts[0].callback('ok');
 assert.deepEqual(disabled,[]);assert(!notifications.some(row=>row[0]==='api:disconnect'));
 assert.equal(s.api.isLayoutFailed(s.doc),true);
});
function actionFixture(){
 const s=fixture(),doc=s.doc,point={content:'public edited point'},events=[];
 s.historyCalls={undo:0,redo:0};s.undoUpdates=0;
 Object.assign(doc,{Action:{Start:false,Depth:0,PointsCount:0,Recalculate:false,CancelAction:false,
  CheckLock:false,UpdateStates:false,UpdateUndoRedo:true,UpdateInterface:true,UpdateSelection:true,
  UpdateRulers:true,UpdateTracks:true,UpdatePlaceholders:true,Redraw:{Start:0,End:0},Additional:{}},
  IsActionStarted:()=>doc.Action.Start,ResumeRecalculate(){},
  private_CheckAdditionalOnFinalize(){},private_CheckEmptyPointsInAction(){},private_CheckActionLock(){},
  Is_OnRecalculate:()=>true,DocumentOutline:{Update(){},UpdateAll(){}},MathTrackHandler:{Update(){}},
  Comments:{UpdateAll(){}},private_ClearSearchOnRecalculate(){},
  private_RecalculateFastRunRange(){throw s.error;},
  History:{Points:[point],Index:0,GetNonRecalculatedChanges:()=>[],Can_Undo:()=>true,Can_Redo:()=>true,
   Undo(){s.historyCalls.undo++;this.Index--;return[{}];},
   Redo(){s.historyCalls.redo++;this.Index++;return[{}];}},
  private_UpdateUndoRedo(){s.undoUpdates++;},sendEvent:event=>events.push(event),
  NumberingApplicator:{ResetLast(){}},BookmarksManager:{SetNeedUpdate(){}},
  IsFillingFormMode:()=>false,IsViewModeInReview:()=>false,
  DrawingObjects:{TurnOffCheckChartSelection(){},TurnOnCheckChartSelection(){}},
  UpdateSelection(){},UpdateInterface(){},UpdateRulers(){}});
 Object.assign(doc.RecalcInfo,{Paused:false,Is_NeedRecalculateFromStart:()=>false});
 doc.DrawingDocument.EndTrackTable=()=>{};
 s.c.AscCommon.CollaborativeEditing={Get_GlobalLock:()=>false};
 for(const name of ['private_Recalculate','RecalculateByChanges','FinalizeAction','StartUndoRedoAction',
  'Document_Undo','Document_Redo','UpdateAfterUndoRedo'])
  vm.runInContext(method('word/Editor/Document.js','CDocument.prototype.'+name),s.c);
 s.point=point;s.actionEvents=events;return s;
}
test('actual edit finalization releases the failed action while preserving its undo point',()=>{
 const s=actionFixture();Object.assign(s.doc.Action,{Start:true,PointsCount:1,Recalculate:true});
 assert.throws(()=>s.doc.FinalizeAction(),e=>e===s.error);
 assert.equal(s.doc.Action.Start,false);assert.equal(s.doc.Action.Depth,0);
 assert.equal(s.doc.Action.PointsCount,0);assert.equal(s.doc.Action.Recalculate,false);
 assert.deepEqual(s.doc.History.Points,[s.point]);assert.equal(s.doc.History.Index,0);
 assert.deepEqual(s.historyCalls,{undo:0,redo:0});assert.equal(s.undoUpdates,1);
 assert.deepEqual(s.actionEvents,['asc_onUserActionEnd']);failed(s);
});
for(const direction of ['Undo','Redo'])test('actual '+direction+' failure closes its action without repeating or reversing history',()=>{
 const s=actionFixture();
 assert.throws(()=>s.doc['Document_'+direction](),e=>e===s.error);
 assert.equal(s.doc.Action.UndoRedo,false);assert.equal(s.doc.Action.Start,false);
 assert.equal(s.doc.History.Index,direction==='Undo'?-1:1);
 assert.deepEqual(s.historyCalls,{undo:direction==='Undo'?1:0,redo:direction==='Redo'?1:0});
 assert.deepEqual(s.doc.History.Points,[s.point]);assert.equal(s.undoUpdates,1);
 assert.deepEqual(s.actionEvents,['asc_onBeforeUndoRedo','asc_onUndoRedo']);failed(s);
});
test('actual collaboration load failure releases ApplyChanges without disconnecting',()=>{
 const s=actionFixture(),ended=[],locks=[];s.c.CWordCollaborativeEditing=class{};
 s.c.Asc=s.c.window.Asc;s.c.Asc.c_oAscAsyncActionType={BlockInteraction:1};
 s.c.Asc.c_oAscAsyncAction={ApplyChanges:9};
 Object.assign(s.c.AscCommon.CollaborativeEditing,{Set_GlobalLock:v=>locks.push(v),Set_GlobalLockSelection:v=>locks.push(v)});
 s.doc.Api.sync_EndAction=(...args)=>ended.push(args);s.c.editor=s.doc.Api;
 vm.runInContext(method('word/Editor/CollaborativeEditing.js','CWordCollaborativeEditing.prototype.OnEnd_Load_Objects'),s.c);
 const collab=new s.c.CWordCollaborativeEditing();
 Object.assign(collab,{m_oLogicDocument:s.doc,Is_Fast:()=>false,CoHistory:{GetAllChanges:()=>[{}]}});
 assert.throws(()=>collab.OnEnd_Load_Objects(),e=>e===s.error);
 assert.deepEqual(locks,[false,false]);assert.deepEqual(ended,[[1,9]]);failed(s);
});
test('actual collaboration Undo failure restores chart selection without hiding layout failure',()=>{
 const s=actionFixture();let enabled=true;s.c.CWordCollaborativeEditing=class{};
 s.doc.TurnOffCheckChartSelection=()=>enabled=false;s.doc.TurnOnCheckChartSelection=()=>enabled=true;
 for(const name of ['_PreUndo','_PostUndo','private_RecalculateDocument'])
  vm.runInContext(method('word/Editor/CollaborativeEditing.js','CWordCollaborativeEditing.prototype.'+name),s.c);
 const collab=new s.c.CWordCollaborativeEditing(),state={};
 Object.assign(collab,{m_oLogicDocument:s.doc,private_SaveDocumentState:()=>state,private_RestoreDocumentState:value=>assert.equal(value,state)});
 assert.equal(collab._PreUndo(),state);assert.equal(enabled,false);
 assert.throws(()=>collab._PostUndo(state,[{}]),e=>e===s.error);
 assert.equal(enabled,true);failed(s);
});

test('unrelated edit errors retain the original failure policy and action state',()=>{
 const s=actionFixture(),error=new Error('unrelated edit fault');
 s.doc.private_RecalculateFastRunRange=()=>{throw error;};
 Object.assign(s.doc.Action,{Start:true,PointsCount:1,Recalculate:true});
 assert.throws(()=>s.doc.FinalizeAction(),e=>e===error);
 assert.equal(s.doc.Action.Start,true);assert.equal(s.api.isLayoutFailed(s.doc),false);
 assert.deepEqual(s.actionEvents,[]);assert.equal(s.undoUpdates,0);
});
test('unrelated collaboration errors are not converted to typed recovery',()=>{
 const s=actionFixture(),ended=[],error=new Error('unrelated collaboration fault');
 s.c.CWordCollaborativeEditing=class{};
 s.c.Asc=s.c.window.Asc;s.c.Asc.c_oAscAsyncActionType={BlockInteraction:1};
 s.c.Asc.c_oAscAsyncAction={ApplyChanges:9};
 Object.assign(s.c.AscCommon.CollaborativeEditing,{Set_GlobalLock(){},Set_GlobalLockSelection(){}});
 s.doc.RecalculateByChanges=()=>{throw error;};
 s.doc.Api.sync_EndAction=(...args)=>ended.push(args);s.c.editor=s.doc.Api;
 vm.runInContext(method('word/Editor/CollaborativeEditing.js','CWordCollaborativeEditing.prototype.OnEnd_Load_Objects'),s.c);
 const collab=new s.c.CWordCollaborativeEditing();
 Object.assign(collab,{m_oLogicDocument:s.doc,Is_Fast:()=>false,CoHistory:{GetAllChanges:()=>[{}]}});
 assert.throws(()=>collab.OnEnd_Load_Objects(),e=>e===error);
 assert.deepEqual(ended,[]);assert.equal(s.api.isLayoutFailed(s.doc),false);
});
