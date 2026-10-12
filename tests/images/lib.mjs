// SPDX-License-Identifier: AGPL-3.0-only
// Helpers of the multi-image layout stability suite (docs/images.md).
// The editor is driven like a user (file chooser, clipboard, mouse drags on the canvas);
// the layout is read back from the recalculated logic document (probe.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, launch, waitFrame } from "../shortcuts/lib.mjs";
export { BASE, launch };

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIX = process.env.IMG_FIXTURES || path.join(HERE, "fixtures");
const PROBE = fs.readFileSync(path.join(HERE, "probe.js"), "utf8");

export async function upload(file, name) {
  const fd = new FormData();
  fd.append("uploadedFile", new Blob([fs.readFileSync(file)]), name || path.basename(file));
  const r = await fetch(BASE + "/example/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!j.filename) throw new Error("upload failed: " + JSON.stringify(j));
  return j.filename;
}
let seq = 0;
export async function openFixture(page, docx = "worksheet.docx", lang) {
  const name = `img-${process.pid}-${Date.now().toString(36)}-${seq++}.docx`;
  const fname = await upload(path.join(FIX, docx), name);
  await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(fname)}${lang ? "&lang=" + lang : ""}`, { waitUntil: "load" });
  const frame = await waitFrame(page);
  await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 120000 });
  await frame.evaluate(PROBE);
  await frame.evaluate(() => { try { Asc.editor.zoom(100); } catch (e) {} });
  await idle(frame);
  return { frame, fileName: fname };
}

// Wait until the editor has no pending recalculation / image load and the layout is stable
export async function idle(frame, ms = 250) {
  let last = null;
  for (let i = 0; i < 80; i++) {
    await frame.waitForTimeout(ms);
    const s = await frame.evaluate(() => {
      const ld = Asc.editor.WordControl.m_oLogicDocument;
      const busy = (ld.FullRecalc && ld.FullRecalc.Id) || Asc.editor.isLongAction && Asc.editor.isLongAction();
      return busy ? null : JSON.stringify(window.__eoLayout());
    });
    if (s && s === last) return JSON.parse(s);
    last = s;
  }
  throw new Error("layout never settled");
}

export const layout = frame => frame.evaluate(() => window.__eoLayout());

// Document point (mm on page `pg`) -> viewport point of the top page, scrolling it into view
export async function toScreen(page, frame, pg, x, y) {
  const r = await frame.evaluate(([pg, x, y]) => {
    const wc = Asc.editor.WordControl, dd = wc.m_oDrawingDocument;
    const view = document.getElementById("id_viewer").getBoundingClientRect();
    let p = dd.ConvertCoordsToCursor(x, y, pg);
    // keep the point in the upper part of the view, so that a drag from it stays visible
    if (p.Y < view.height * 0.15 || p.Y > view.height * 0.55) {
      wc.m_oScrollVerApi.scrollToY(Math.max(0, wc.m_dScrollY + p.Y - view.height * 0.35));
      p = dd.ConvertCoordsToCursor(x, y, pg);
    }
    return { x: view.left + p.X, y: view.top + p.Y };
  }, [pg, x, y]);
  const fe = await frame.frameElement();
  const box = await fe.boundingBox();
  return { x: box.x + r.x, y: box.y + r.y };
}

// Put the caret at a document point by clicking it (like a user)
export async function clickAt(page, frame, pg, x, y) {
  const p = await toScreen(page, frame, pg, x, y);
  await page.mouse.click(p.x, p.y);
  await frame.waitForTimeout(150);
}

// Caret at the end of the paragraph whose text starts with `prefix` (or index i)
export async function caretInPara(frame, match, where = "end") {
  return frame.evaluate(([match, where]) => {
    const ld = Asc.editor.WordControl.m_oLogicDocument;
    const paras = ld.GetAllParagraphs({ All: true });
    const p = typeof match === "number" ? paras[match] : paras.find(p => p.GetText().includes(match));
    if (!p) throw new Error("no paragraph " + match);
    ld.RemoveSelection();
    if (where === "end") p.MoveCursorToEndPos(); else p.MoveCursorToStartPos();
    p.Document_SetThisElementCurrent(true);
    ld.UpdateSelection(); ld.UpdateInterface();
    Asc.editor.asc_enableKeyEvents(true); document.getElementById("area_id").focus();
    return true;
  }, [match, where]);
}

// Insert > Picture > From file, through the file chooser like a user
export async function insertPictureFromFile(page, frame, file) {
  const n0 = (await layout(frame)).images.length;
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), frame.evaluate(() => Asc.editor.asc_addImage())]);
  await chooser.setFiles(path.join(FIX, file));
  await frame.waitForFunction(n0 => window.__eoLayout().images.length > n0, n0, { timeout: 30000, polling: 100 });
  return idle(frame);
}

// Paste a picture file from the clipboard (Ctrl+V of a copied image file / screenshot)
export async function pastePicture(page, frame, file) {
  const n0 = (await layout(frame)).images.length;
  const b64 = fs.readFileSync(path.join(FIX, file)).toString("base64");
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  await frame.evaluate(([b64, mime, name]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([u], name, { type: mime }));
    const area = document.getElementById("area_id");
    area.focus();
    area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [b64, mime, path.basename(file)]);
  await frame.waitForFunction(n0 => window.__eoLayout().images.length > n0, n0, { timeout: 30000, polling: 100 });
  return idle(frame);
}

// Drop a picture file dragged from the desktop at a document point: a real drag and drop
// of the browser (CDP Input.dispatchDragEvent with a file), not synthetic DOM events
export async function dropPicture(page, frame, file, pg, x, y) {
  const n0 = (await layout(frame)).images.length;
  const pt = await toScreen(page, frame, pg, x, y);
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [path.join(FIX, file)], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "dragOver"]) await cdp.send("Input.dispatchDragEvent", { type, x: pt.x, y: pt.y, data });
  await page.waitForTimeout(100);
  await cdp.send("Input.dispatchDragEvent", { type: "drop", x: pt.x, y: pt.y, data });
  await cdp.detach();
  await frame.waitForFunction(n0 => window.__eoLayout().images.length > n0, n0, { timeout: 30000, polling: 100 });
  return idle(frame);
}

export async function selectImage(frame, id) {
  await frame.evaluate(id => {
    const ld = Asc.editor.WordControl.m_oLogicDocument;
    ld.Select_DrawingObject(id); ld.UpdateSelection(); ld.UpdateInterface();
  }, id);
  await frame.waitForTimeout(150);
}

// Properties of the selected picture, as the ribbon and the dialogs read them
const IMG_PROPS = `(function(){ var e = Asc.editor.getSelectedElements(); for (var i = e.length - 1; i >= 0; i--) if (e[i].get_ObjectType() === Asc.c_oAscTypeSelectElement.Image) return e[i].get_ObjectValue(); return null; })()`;

// Wrap Text menu of the ribbon (Layout > Wrap Text / Picture Format > Wrap Text): the very
// handler of the menu item, with the menu state it reads from the selection
export const WRAP = { inline: 0, square: 1, tight: 2, through: 3, topAndBottom: 4, behind: 5, inFront: 6 };
export async function setWrap(frame, id, style) {
  await selectImage(frame, id);
  await frame.evaluate(w => {
    const menu = DE.getController("Toolbar").toolbar.btnImgWrapping.menu;
    const item = menu.items.find(i => i.options.wrapType === w);
    menu.trigger("item:click", menu, item);
  }, WRAP[style]);
  return idle(frame);
}
// Layout > Position > More Layout Options > untick "Move object with text" (vertical
// position relative to the page, value converted so that the picture stays in place)
export async function fixOnPage(frame, id) {
  await selectImage(frame, id);
  await frame.evaluate(src => {
    const o = eval(src);
    const p = new Asc.asc_CImgProperty(), v = new Asc.CImagePositionV();
    v.put_UseAlign(false); v.put_Percent(false); v.put_RelativeFrom(Asc.c_oAscRelativeFromV.Page); v.put_Value(o.get_Value_Y(Asc.c_oAscRelativeFromV.Page));
    p.put_PositionV(v);
    Asc.editor.ImgApply(p);
  }, IMG_PROPS);
  return idle(frame);
}
// Picture Format > Size > Width (height follows: aspect ratio locked)
export async function setWidth(frame, id, mm) {
  await selectImage(frame, id);
  await frame.evaluate(([src, mm]) => {
    const o = eval(src);
    const p = new Asc.asc_CImgProperty();
    p.put_Width(mm); p.put_Height(mm * o.get_Height() / o.get_Width());
    Asc.editor.ImgApply(p);
  }, [IMG_PROPS, mm]);
  return idle(frame);
}

// Mouse drag of an image body from its centre by (dx, dy) mm, with intermediate moves
export async function dragImage(page, frame, id, dxmm, dymm, { steps = 12, shift = false, hold = 0 } = {}) {
  const L = await layout(frame);
  const im = L.images.find(i => i.id === id);
  const from = await toScreen(page, frame, im.page, im.x + im.w / 2, im.y + im.h / 2);
  const k = await frame.evaluate(() => Asc.editor.WordControl.m_nZoomValue / 100 * 96 / 25.4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (shift) await page.keyboard.down("Shift");
  for (let s = 1; s <= steps; s++) { await page.mouse.move(from.x + dxmm * k * s / steps, from.y + dymm * k * s / steps); await page.waitForTimeout(16); }
  if (hold) await page.waitForTimeout(hold);
  // where the user drops it: the ghost of the picture at the moment the button is released
  lastDrop = await frame.evaluate(() => {
    const d = Asc.editor.WordControl.m_oLogicDocument.DrawingObjects, t = d.arrTrackObjects[0];
    if (!t) return null;
    const b = t.getBounds();
    return { page: typeof t.pageIndex === "number" ? t.pageIndex : null, x: b.posX, y: b.posY };
  });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  return idle(frame);
}
export let lastDrop = null;

// Drag a resize handle: corner "br" (bottom-right), "r" (right edge) etc.
export async function resizeImage(page, frame, id, handle, dxmm, dymm, { shift = false, steps = 10 } = {}) {
  await selectImage(frame, id);
  const L = await layout(frame);
  const im = L.images.find(i => i.id === id);
  const hx = { tl: 0, t: 0.5, tr: 1, r: 1, br: 1, b: 0.5, bl: 0, l: 0 }[handle];
  const hy = { tl: 0, t: 0, tr: 0, r: 0.5, br: 1, b: 1, bl: 1, l: 0.5 }[handle];
  const from = await toScreen(page, frame, im.page, im.x + im.w * hx, im.y + im.h * hy);
  const k = await frame.evaluate(() => Asc.editor.WordControl.m_nZoomValue / 100 * 96 / 25.4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (shift) await page.keyboard.down("Shift");
  for (let s = 1; s <= steps; s++) { await page.mouse.move(from.x + dxmm * k * s / steps, from.y + dymm * k * s / steps); await page.waitForTimeout(16); }
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  return idle(frame);
}

// Id of the selected picture (a drag that moves the anchor to another paragraph re-creates
// the drawing, with a new id)
export const selectedImage = frame => frame.evaluate(() => {
  const o = Asc.editor.WordControl.m_oLogicDocument.DrawingObjects.getSelectedObjects();
  return o.length && o[0].parent ? o[0].parent.Id : null;
});

export async function typeText(page, frame, text) {
  await frame.evaluate(() => { Asc.editor.asc_enableKeyEvents(true); document.getElementById("area_id").focus(); });
  await page.keyboard.type(text, { delay: 5 });
  return idle(frame);
}
export async function pressKey(page, frame, key) {
  await frame.evaluate(() => { Asc.editor.asc_enableKeyEvents(true); document.getElementById("area_id").focus(); });
  await page.keyboard.press(key);
  return idle(frame);
}
