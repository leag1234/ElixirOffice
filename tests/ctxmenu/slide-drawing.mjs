// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';

// SDK cursor coordinates are relative to WordControl, not the editor iframe.
export async function selectLastDrawing(frame, page, frameBox, type) {
 const drawing = await frame.evaluate(type => {
  const wc = PE.getController('Main').api.WordControl, doc = wc.m_oLogicDocument;
  const obj = doc.Slides[doc.CurPage].cSld.spTree.at(-1);
  if (!obj || obj.getObjectType() !== AscDFH['historyitem_type_' + type])
   throw Error('Expected newly inserted ' + type);
  const point = wc.m_oDrawingDocument.ConvertCoordsToCursorWR(obj.x + obj.extX / 2, obj.y + obj.extY / 2, doc.CurPage, null, true);
  if (point.Error) throw Error('Drawing center conversion failed');
  return {id: obj.Id, type: obj.getObjectType(), x: wc.X + point.X, y: wc.Y + point.Y};
 }, type);
 const point = {x: frameBox.x + drawing.x, y: frameBox.y + drawing.y};
 assert(Number.isFinite(point.x) && Number.isFinite(point.y), 'Drawing center must be finite');
 await page.mouse.click(point.x, point.y);
 const selected = await frame.evaluate(() => PE.getController('Main').api.WordControl.m_oLogicDocument.GetCurrentController().selectedObjects.map(obj => ({id: obj.Id, type: obj.getObjectType()})));
 assert.deepEqual(selected, [{id: drawing.id, type: drawing.type}], 'Mouse must select the inserted ' + type);
 return point;
}
