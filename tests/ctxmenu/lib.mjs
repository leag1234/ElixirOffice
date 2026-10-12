// SPDX-License-Identifier: AGPL-3.0-only
// Context-menu sweep engine (shared by the Word, Spreadsheet and Presentation sweeps).
//
// For every context a scenario opens the right-click menu with a real mouse event, lists
// every item (and submenu items) from the DOM, and then, from a fresh menu each time,
// clicks the item with a real mouse click. For each click it records:
//   - console errors / page errors raised by the click
//   - an error or warning popup (alert windows, "Error"/"Warning" titles)
//   - whether the item could be clicked at all (visible, not clipped, not covered)
//   - whether it had an effect (editor state signature, visible dialogs, panels, clipboard)
//   - whether the menu closed
// A menu is also checked for geometry: it has to be fully inside the browser window.
import fs from "node:fs";

// signature of what a click can change; evaluated inside the editor frame
export const sigSource = {
  word: `(() => { const d = Asc.editor.WordControl.m_oLogicDocument; return {
      hist: d.History && d.History.Index, text: d.GetText ? d.GetText({}) : "", sel: !!d.IsSelectionUse(), pos: d.GetDocPosType ? d.GetDocPosType() : 0,
      cmts: d.Comments ? Object.keys(d.Comments.m_arrCommentsById || d.Comments.CommentsById || {}).length : 0,
      page: Asc.editor.getCurrentPage && Asc.editor.getCurrentPage(), zoom: Asc.editor.WordControl.m_nZoomValue,
      spell: d.Spelling && d.Spelling.Use ? d.GetAllParagraphs().reduce((n, p) => n + p.SpellChecker.GetErrorsCount(), 0) : 0,
      drawSel: !!(d.DrawingObjects && d.DrawingObjects.getSelectedObjects && d.DrawingObjects.getSelectedObjects().length) }; })()`,
  cell: `(() => { const api = Asc.editor, ws = api.wb.getWorksheet(), s = ws.model.selectionRange; return {
      hist: AscCommon.History.Index, sheet: api.asc_getActiveWorksheetIndex(), sheets: api.asc_getWorksheetsCount(),
      sel: s ? s.ranges.map(r => [r.r1, r.c1, r.r2, r.c2]) : null, edit: !!api.asc_getCellEditMode(),
      a1: ws.model.getRange3(0, 0, 0, 0).getValue(), zoom: api.asc_getZoom && api.asc_getZoom() }; })()`,
  slide: `(() => { const api = PE.getController("Main").api, d = api.WordControl.m_oLogicDocument; return {
      hist: d.History && d.History.Index, slides: api.getCountPages(), cur: api.getCurrentPage(),
      sel: d.IsSelectionUse ? !!d.IsSelectionUse() : null }; })()`,
};

export async function visibleWindows(frame) {
  return frame.evaluate(() => Array.from(document.querySelectorAll(".asc-window")).filter(w => w.getClientRects().length && getComputedStyle(w).display !== "none" && getComputedStyle(w).visibility !== "hidden").map(w => ({
    cls: w.className.replace(/\s+/g, " ").trim(),
    title: ((w.querySelector(".title") || {}).textContent || "").trim(),
    body: ((w.querySelector(".body") || w).textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    alert: /\balert\b/.test(w.className),
  })));
}

// items whose effect the signature cannot see: view switches, the side panel, print and file choosers, selection-only commands
export const NO_EFFECT_OK = /(^|> )(Print selection|Crop|Edit points|Toggle field codes|Bring forward|Send backward|Format Cells\.\.\.|Pick From Drop-down List\.\.\.|Slide settings|Show Guides|Show gridlines|Rulers|Select all|Select All Sheets|Start slideshow|Rename|Auto fit row height|Auto fit column width|Unhide|Clear > Links|Select > (Row|Column|Cell|Table))$/;

const ERR_RX = /\b(error|warning|failed|unable|cannot|can't|not available|undefined|NaN|exception)\b/i;
export const isErrorWindow = w => (w.alert && (w.cls.includes("error") || ERR_RX.test(w.title) || ERR_RX.test(w.body))) || /^(error|warning)/i.test(w.title);

// the open context menu as a list of DOM items; each li gets a data-sw tag.
// `rootSel` is evaluated in the frame and returns the menu root element.
export async function enumerate(frame, rootFn) {
  return frame.evaluate(rootFnSrc => {
    const root = (0, eval)("(" + rootFnSrc + ")")();
    if (!root) return null;
    document.querySelectorAll("[data-sw]").forEach(e => e.removeAttribute("data-sw"));
    let n = 0;
    const vis = e => e.getClientRects().length && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden";
    const walk = (ul, parentPath) => Array.from(ul.children).filter(li => li.tagName === "LI").map(li => {
      const a = li.querySelector(":scope > a");
      const sub = li.querySelector(":scope > ul.dropdown-menu");
      const isSep = li.classList.contains("divider");
      li.setAttribute("data-sw", String(++n));
      const text = (a ? Array.from(a.childNodes).filter(c => !(c.nodeType === 1 && c.classList.contains("menu-item-shortcut"))).map(c => c.textContent).join("").replace(/\s+/g, " ").trim() : "").replace(/^Update .+ style$/, "Update <style> style");
      const r = li.getBoundingClientRect();
      const o = { id: n, sep: isSep, hid: li.style.display === "none", text, vis: !!vis(li), disabled: li.classList.contains("disabled") || (a && a.classList.contains("disabled")), rect: [r.left, r.top, r.width, r.height].map(Math.round), path: parentPath.concat(text) };
      if (a) { const k = li.querySelector(":scope > a .menu-item-shortcut"); o.key = k ? k.textContent : ""; }
      if (sub) o.sub = walk(sub, o.path);
      return o;
    });
    const ul = root.matches && root.matches("ul.dropdown-menu") ? root : root.querySelector("ul.dropdown-menu");
    if (!ul || !vis(ul)) return null;
    const r = ul.getBoundingClientRect();
    return { rect: [r.left, r.top, r.right, r.bottom].map(Math.round), vp: [innerWidth, innerHeight], items: walk(ul, []) };
  }, rootFn.toString());
}

// run `scenario.open()` then click each item. Returns a list of result rows.
// cfg: { frame, page, errors, sig, rootFn, reset, maxSub, label }
export async function sweepContext(cfg, scenario, log = console.log) {
  const { frame, page, errors, sig, rootFn } = cfg;
  const rows = [];
  const mark = errors.length;
  const open = async () => {
    // a second attempt: a menu that does not open once may be the harness's setup racing the editor (caret, scroll)
    for (let attempt = 0; attempt < 2; attempt++) {
      await cfg.reset();
      await scenario.setup();
      const pt = await scenario.target();
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.click(pt.x, pt.y, { button: "right" });
      await frame.waitForTimeout(700);
      // a loaded machine opens the menu late: look again before reporting that it did not open
      // (scenario.waitFor(texts): items that arrive later than the menu, e.g. the spelling suggestions)
      for (let i = 0; i < (scenario.waitFor ? 25 : 8); i++) { const m = await enumerate(frame, rootFn); if (m && m.items.some(x => x.vis) && (!scenario.waitFor || scenario.waitFor(m.items.filter(x => x.vis).map(x => x.text)))) return m; if (process.env.CTX_DEBUG && i % 8 === 7) log("   open: " + (m ? m.items.filter(x => x.vis).map(x => x.text).join("|") : "no menu")); await frame.waitForTimeout(400); }
    }
    return null;
  };
  const first = await open();
  if (!first && cfg.shotDir) { fs.mkdirSync(cfg.shotDir, { recursive: true }); await page.screenshot({ path: `${cfg.shotDir}/${scenario.id}-noopen.png` }); }
  if (!first) { rows.push({ ctx: scenario.id, item: "(menu)", status: "fail", reason: "context menu did not open" }); log(`FAIL ${scenario.id} menu did not open`); return rows; }
  const [x0, y0, x1, y1] = first.rect, [vw, vh] = first.vp;
  const geo = x0 >= -1 && y0 >= -1 && x1 <= vw + 8 && y1 <= vh + 8;   // the editor leaves the menu's bottom padding (6 px) outside the window
  rows.push({ ctx: scenario.id, item: "(geometry)", status: geo ? "pass" : "fail", reason: geo ? "" : `menu rect ${first.rect} outside viewport ${first.vp}` });
  if (!geo) log(`FAIL ${scenario.id} geometry ${first.rect} vs ${first.vp}`);
  // flat list of targets: top-level items, plus up to maxSub items of each submenu
  const targets = [];
  const maxSub = cfg.maxSub ?? 4;
  const visible = list => list.filter(i => i.vis && !i.sep);
  for (const it of visible(first.items)) {
    if (it.sub) {
      const subs = it.sub.filter(s => !s.sep && !s.hid && s.text);   // gallery items (no caption) are not menu commands
      const picked = subs.length > maxSub ? [...subs.slice(0, maxSub - 1), subs[subs.length - 1]] : subs;
      targets.push({ path: it.path, parent: null, sub: true, disabled: it.disabled });
      for (const s of picked) targets.push({ path: s.path, parent: it.path, disabled: s.disabled || it.disabled });
    } else targets.push({ path: it.path, parent: null, disabled: it.disabled });
  }
  rows.push({ ctx: scenario.id, item: "(items)", status: "info", reason: targets.map(t => t.path.join(" > ")).join(" | ") });
  for (const t of targets) {
    const key = t.path.join(" > ");
    const row = { ctx: scenario.id, item: key };
    if (scenario.skip && scenario.skip(key)) { row.status = "skip"; rows.push(row); continue; }
    try {
      const m = await open();
      if (!m) { row.status = "fail"; row.reason = "menu did not reopen"; log(`FAIL ${scenario.id} > ${key} ${row.reason}`); rows.push(row); continue; }
      const find = (list, path) => { let cur = list; let hit = null; for (let i = 0; i < path.length; i++) { hit = cur.find(x => !x.sep && x.text === path[i] && x.vis !== false) || cur.find(x => !x.sep && x.text === path[i]) || (i === path.length - 1 && path[i].length > 4 ? cur.find(x => !x.sep && x.text.slice(0, 4) === path[i].slice(0, 4)) : null); if (!hit) return null; cur = hit.sub || []; } return hit; };
      const item = find(m.items, t.path);
      if (!item) { row.status = "fail"; row.reason = "item not found when reopening"; log(`FAIL ${scenario.id} > ${key} ${row.reason}`); rows.push(row); continue; }
      if (item.disabled || t.disabled) { row.status = "skip"; row.reason = "disabled"; rows.push(row); continue; }
      await installSpy(frame);
      const before = { winKey: (await visibleWindows(frame)).map(w => w.cls + w.title).join(), ex: await extras(frame), sig: await frame.evaluate(src => (0, eval)(src), sig), clip: await clipboard(frame) };
      const e0 = errors.length;
      const problems = [];
      // hover the ancestors so that submenus open, then click the item itself
      if (t.parent) {
        let up = [];
        for (let i = 0; i < t.path.length - 1; i++) {
          up = t.path.slice(0, i + 1);
          const anc = find(m.items, up);
          await frame.locator(`[data-sw="${anc.id}"] > a`).hover({ timeout: 3000 }).catch(() => {});
          await frame.waitForTimeout(350);
        }
        await frame.locator(`[data-sw="${item.id}"]`).first().scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
      }
      if (t.sub) { // a submenu parent: it has to open on hover and show items
        // the menu must stay still while a submenu opens (a handler that rearranges the items when the
        // submenu's 'show' event bubbles up re-opens it endlessly and swallows the clicks)
        await frame.evaluate(rootSrc => { const root = (0, eval)("(" + rootSrc + ")")(); window.__swMut = 0; if (window.__swMo) window.__swMo.disconnect(); window.__swMo = new MutationObserver(l => { window.__swMut += l.length; }); root && window.__swMo.observe(root, { childList: true, subtree: true }); }, rootFn.toString());
        await frame.locator(`[data-sw="${item.id}"] > a`).hover({ timeout: 3000 }).catch(e => problems.push("hover: " + String(e).split("\n")[0].slice(0, 100)));
        await frame.waitForTimeout(400);
        const shown = await frame.evaluate(id => { const ul = document.querySelector(`[data-sw="${id}"] > ul.dropdown-menu`); if (!ul) return -1; const vis = ul.getClientRects().length && getComputedStyle(ul).display !== "none"; const r = ul.getBoundingClientRect(); return vis ? [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight].map(Math.round) : 0; }, item.id);
        await frame.evaluate(() => { window.__swMut = 0; });
        await frame.waitForTimeout(600);
        const churn = await frame.evaluate(() => { const n = window.__swMut; window.__swMo && window.__swMo.disconnect(); return n; });
        if (churn > 4) problems.push(`menu DOM keeps being rewritten (${churn} changes in 0.6 s after the submenu opened: event loop)`);
        if (!shown) problems.push("submenu does not open");
        else if (shown !== -1 && (shown[0] < -1 || shown[1] < -1 || shown[2] > shown[4] + 1 || shown[3] > shown[5] + 1)) problems.push("submenu outside the window " + JSON.stringify(shown));
        row.status = problems.length ? "fail" : "pass"; row.reason = problems.join("; ");
        rows.push(row); if (problems.length) log(`FAIL ${scenario.id} ${key} ${row.reason}`);
        const pe = errors.slice(e0).filter(e => !/Failed to load resource/.test(e.text)); if (pe.length) { row.status = "fail"; row.reason += " errors: " + pe.map(e => e.text).join(" | ").slice(0, 200); }
        continue;
      }
      let clicked = true;
      try { await frame.locator(`[data-sw="${item.id}"] > a`).click({ timeout: 3500 }); }
      catch (e) { clicked = false; problems.push("not clickable: " + String(e).split("\n").slice(0, 3).join(" ").slice(0, 160)); }
      await frame.waitForTimeout(900);
      const after = { ex: await extras(frame), sig: await frame.evaluate(src => (0, eval)(src), sig), wins: await visibleWindows(frame), clip: await clipboard(frame) };
      const newErr = errors.slice(e0).filter(e => !/Failed to load resource/.test(e.text));
      const errWins = after.wins.filter(isErrorWindow);
      if (newErr.length) problems.push("errors: " + newErr.map(e => e.text.split("\n")[0]).join(" | ").slice(0, 300));
      if (errWins.length && !(scenario.expectPopup && scenario.expectPopup(key))) problems.push("error popup: " + errWins.map(w => `[${w.title}] ${w.body}`).join(" | ").slice(0, 200));
      const effect = JSON.stringify(before.sig) !== JSON.stringify(after.sig) || after.wins.map(w => w.cls + w.title).join() !== before.winKey || before.clip !== after.clip || JSON.stringify(before.ex) !== JSON.stringify(after.ex);
      const menuOpen = await enumerate(frame, rootFn);
      row.effect = effect; row.menuClosed = !menuOpen || !menuOpen.items.some(i => i.vis);
      row.windows = after.wins.map(w => w.title || w.cls).join(" | ");
      if (clicked && !effect && !NO_EFFECT_OK.test(key) && !(scenario.noEffectOk && scenario.noEffectOk(key))) problems.push("no visible effect");
      if (clicked && !row.menuClosed && !errWins.length && !(scenario.keepsOpen && scenario.keepsOpen(key))) problems.push("menu still open after click");
      row.status = problems.length ? "fail" : "pass"; row.reason = problems.join("; ");
      log(`${row.status.toUpperCase()} ${scenario.id} > ${key}${row.reason ? " :: " + row.reason : ""}${row.windows ? "  [win: " + row.windows + "]" : ""}`);
    } catch (e) { row.status = "fail"; row.reason = "exception " + String(e).split("\n")[0].slice(0, 200); log(`FAIL ${scenario.id} > ${key} ${row.reason}`); }
    rows.push(row);
    if (process.env.CTX_DEBUG) log(`   [errors so far: ${errors.filter(e => e.kind === "pageerror").length}]`);
  }
  await cfg.reset();
  const pe = errors.slice(mark).filter(e => e.kind === "pageerror");
  rows.push({ ctx: scenario.id, item: "(page errors outside the clicks)", status: "info", reason: pe.map(e => e.text.split("\n")[0]).join(" | ").slice(0, 250) });
  if (pe.length) log(`INFO ${scenario.id} page errors outside the clicks (harness reset, setup): ${rows[rows.length - 1].reason}`);
  return rows;
}

// side effects the editor state does not show: clipboard commands, file choosers, downloads, windows, Ask Elixir
async function installSpy(frame) {
  await frame.evaluate(() => {
    if (window.__swSpy) return;
    const spy = window.__swSpy = { n: 0 };
    const eo = document.execCommand.bind(document); document.execCommand = function (c) { if (/^(copy|cut|paste)$/.test(c)) spy.n++; return eo.apply(document, arguments); };
    const oc = HTMLElement.prototype.click; HTMLElement.prototype.click = function () { if (this.tagName === "INPUT" && this.type === "file" || this.tagName === "A" && (this.download || this.href)) spy.n++; return oc.apply(this, arguments); };
    const wo = window.open; window.open = function () { spy.n++; return null; };
    const wp = window.print; window.print = function () { spy.n++; };
    try { const cw = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = function () { spy.n++; return cw.apply(null, arguments); }; const cwr = navigator.clipboard.write.bind(navigator.clipboard); navigator.clipboard.write = function () { spy.n++; return cwr.apply(null, arguments); }; } catch (e) {}
  });
}
const extras = frame => frame.evaluate(() => ({ spy: window.__swSpy ? window.__swSpy.n : 0, ask: !!document.getElementById("elixir-ask-menu") }));

async function clipboard(frame) {
  try { return await frame.evaluate(() => navigator.clipboard.readText().then(t => t.slice(0, 80)).catch(() => "")); } catch (e) { return ""; }
}

export function summarize(rows, outFile) {
  const checked = rows.filter(r => r.status === "pass" || r.status === "fail");
  const fails = checked.filter(r => r.status === "fail");
  fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), pass: checked.length - fails.length, fail: fails.length, rows }, null, 1));
  console.log(`${checked.length - fails.length}/${checked.length} pass, ${fails.length} fail, ${rows.filter(r => r.status === "skip").length} skipped`);
  return fails.length;
}
