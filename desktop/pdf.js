// SPDX-License-Identifier: AGPL-3.0-only
// Export actual native document drawing commands through the integrated W1 writer.
window.EODesktopPdf = async function(api, format, options={}) {
  const check=()=>{if(options.signal?.aborted)throw Object.assign(Error('PDF export cancelled'),{name:'AbortError',code:'aborted'});};
  const progress=value=>{try{const result=options.onProgress?.(value);if(result?.catch)result.catch(()=>{});}catch{}};
  const yieldWork=async()=>{await new Promise(resolve=>setTimeout(resolve,0));check();};
  check();
  if (['docx','odt'].includes(format)) return AscCommon.ClientPdf.build(api,options);
  const response = await fetch('/example/local-assets/sdkjs/common/clientpdf/runtime/current.json');
  if (!response.ok) throw Error('Bundled PDF runtime missing');
  const runtime = await response.json();
  const writer = new EOWasmPdf.Writer({getRawImage:AscCommon.ClientPdf.getRawImage,
    signal:options.signal,onProgress:options.onProgress,
    wasmRuntime:new URL('/example/local-assets/sdkjs/common/clientpdf/runtime/' + runtime.artifact_version + '/', location.origin).href});
  if (['xlsx','ods'].includes(format)) {
    progress({stage:'converting',cancellable:false});await yieldWork();
    const memory = api.asc_nativePrint(undefined, undefined, {adjustOptions:{printType:Asc.c_oAscPrintType.EntireWorkbook}});
    await yieldWork();await writer.feed(memory.GetDataUint8(0, memory.GetCurPosition()));
  } else {
    const renderer = new AscCommon.CDocumentRenderer();
    renderer.InitPicker(AscCommon.g_oTextMeasurer.m_oManager);
    renderer.VectorMemoryForPrint = new AscCommon.CMemory(); renderer.IsNoDrawingEmptyPlaceholder = true;
    renderer.DocInfo(api.asc_getCoreProps());
    const marks = api.ShowParaMarks; api.ShowParaMarks = false;
    try {const total=api.asc_nativePrintPagesCount();progress({stage:'converting',completed:0,total});for(let i=0;i<total;i++){await yieldWork();api.asc_nativePrint(renderer,i,{});progress({stage:'converting',completed:i+1,total});} }
    finally { api.ShowParaMarks = marks; }
    await writer.feed(renderer.Memory.GetDataUint8(0, renderer.Memory.GetCurPosition()));
  }
  check();const bytes = await writer.finish();check(); return {bytes, stats:{...writer.stats, backend:'wasm'}};
};
