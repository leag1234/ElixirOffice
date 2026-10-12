// SPDX-License-Identifier: AGPL-3.0-only
// Export actual native document drawing commands through the integrated W1 writer.
window.EODesktopPdf = async function(api, format) {
  if (['docx','odt'].includes(format)) return AscCommon.ClientPdf.build(api);
  const response = await fetch('/example/local-assets/sdkjs/common/clientpdf/runtime/current.json');
  if (!response.ok) throw Error('Bundled PDF runtime missing');
  const runtime = await response.json();
  const writer = new EOWasmPdf.Writer({getRawImage:AscCommon.ClientPdf.getRawImage,
    wasmRuntime:new URL('/example/local-assets/sdkjs/common/clientpdf/runtime/' + runtime.artifact_version + '/', location.origin).href});
  if (['xlsx','ods'].includes(format)) {
    const memory = api.asc_nativePrint(undefined, undefined, {adjustOptions:{printType:Asc.c_oAscPrintType.EntireWorkbook}});
    await writer.feed(memory.GetDataUint8(0, memory.GetCurPosition()));
  } else {
    const renderer = new AscCommon.CDocumentRenderer();
    renderer.InitPicker(AscCommon.g_oTextMeasurer.m_oManager);
    renderer.VectorMemoryForPrint = new AscCommon.CMemory(); renderer.IsNoDrawingEmptyPlaceholder = true;
    renderer.DocInfo(api.asc_getCoreProps());
    const marks = api.ShowParaMarks; api.ShowParaMarks = false;
    try { for (let i=0; i<api.asc_nativePrintPagesCount(); i++) api.asc_nativePrint(renderer, i, {}); }
    finally { api.ShowParaMarks = marks; }
    await writer.feed(renderer.Memory.GetDataUint8(0, renderer.Memory.GetCurPosition()));
  }
  const bytes = await writer.finish(); return {bytes, stats:{...writer.stats, backend:'wasm'}};
};
