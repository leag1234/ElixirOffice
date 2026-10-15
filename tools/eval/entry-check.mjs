#!/usr/bin/env node
// Checks of the Elixir AI entry points of the Word editor (docs/ai.md §1), with screenshots:
//  - title bar "Search or ask Elixir": commands first, last row "Ask Elixir: …", Enter when no
//    command matches, Shift+Enter always;
//  - "Ask Elixir" on the mini toolbar and in the context menus, with suggestions that depend on
//    the selection (text, several paragraphs, list, table, picture) and a free-text field;
//  - "/" on an empty paragraph: faint hint, quick menu, Escape / other keys keep the "/" typed,
//    a real "/" elsewhere is untouched;
//  - Alt+I still opens the bar.
// A request sent from an entry point is stopped right away (Escape): no model answer is needed.
//   node tools/eval/entry-check.mjs [screenshot dir]
import fs from "node:fs";
import path from "node:path";
import { REPO, launch, openEditor, uploadDocx, cmd, focusEditor, selectBlocks } from "./lib.mjs";

const out = process.argv[2];
out && fs.mkdirSync(out, { recursive: true });
const res = {};
const shot = (page, name, clip) => out ? page.screenshot({ path: `${out}/${name}.png`, clip }) : null;
// AI is off unless configured: a placeholder endpoint is stored in the browser (a request sent from an entry point is stopped
// right away, nothing is ever answered), so the entry points are on. Set EO_MANAGED=1 to use the server's configuration instead.
const { browser, page, errors } = await launch(process.env.EO_MANAGED ? {} : { settings: { endpoint: "http://127.0.0.1:9/v1", model: "entry-check", apiKey: "unused" } });
const frame = await openEditor(page, await uploadDocx(path.join(REPO, "eval/tasks/e-image-right/input.docx")));
const bar = () => frame.evaluate(() => { const b = document.getElementById("elixir-ai-bar"); return b ? { state: b.getAttribute("data-state"), shown: b.style.display !== "none", text: b.querySelector(".elixir-ai-input").value } : null; });
const stopBar = async () => { await page.keyboard.press("Escape"); await frame.waitForTimeout(300); await page.keyboard.press("Escape"); await frame.waitForTimeout(300); };
// page position (in the top window) of a point of body paragraph `block`, dx/dy in mm from its top left
const at = (block, dx, dy) => frame.evaluate(([i, x, y]) => {
  const ld = Asc.editor.WordControl.m_oLogicDocument, dd = Asc.editor.WordControl.m_oDrawingDocument, p = ld.Content[i], b = p.GetPageBounds(0);
  const c = dd.ConvertCoordsToCursorWR(b.Left + x, b.Top + y, p.GetAbsolutePage(0)), s = document.getElementById("editor_sdk").getBoundingClientRect();
  return { x: c.X + s.left, y: c.Y + s.top };
}, [block, dx, dy]);
const paraText = i => cmd(frame, `Api.GetDocument().GetElement(${i}).GetText().replace(/[\\r\\n]+$/, "")`);

// ---- title bar search ----
await frame.click("#editor_sdk", { position: { x: 700, y: 300 } });
res["search: placeholder says Search or ask Elixir"] = /ask Elixir|demander à Elixir/i.test(await frame.getAttribute(".elx-search-input", "placeholder"));
await page.keyboard.press("Alt+q");
await frame.waitForTimeout(300);
await page.keyboard.type("bold");
await frame.waitForTimeout(400);
const rowsBold = await frame.evaluate(() => Array.from(document.querySelectorAll(".elx-search-pop .elx-sr")).map(r => ({ ask: r.classList.contains("elx-sr-ask"), active: r.classList.contains("active"), t: r.textContent })));
res["search: commands first, Ask Elixir last"] = rowsBold.length > 2 && !rowsBold[0].ask && rowsBold[rowsBold.length - 1].ask && /bold/i.test(rowsBold[0].t);
res["search: a matching command is the default (Enter)"] = rowsBold[0].active;
await shot(page, "search-1-commands-then-ask", { x: 300, y: 0, width: 840, height: 420 });
await page.keyboard.press("Shift+Enter");
await frame.waitForTimeout(600);
let b = await bar();
res["search: Shift+Enter sends the text to Elixir"] = !!b && b.shown && b.text === "bold" && ["running", "idle", "review"].includes(b.state);
if (!res["search: Shift+Enter sends the text to Elixir"]) console.log("bar after Shift+Enter:", JSON.stringify(b));
await stopBar();
await page.keyboard.press("Alt+q");
await page.keyboard.type("mets le titre en gros et centré");
await frame.waitForTimeout(400);
const rowsAsk = await frame.evaluate(() => Array.from(document.querySelectorAll(".elx-search-pop .elx-sr")).map(r => ({ ask: r.classList.contains("elx-sr-ask"), active: r.classList.contains("active") })));
res["search: no matching command -> Ask Elixir is the default"] = rowsAsk.some(r => r.ask && r.active);
await shot(page, "search-2-ask-elixir", { x: 300, y: 0, width: 840, height: 300 });
await page.keyboard.press("Enter");
await frame.waitForTimeout(500);
b = await bar();
res["search: Enter sends the request to the command bar"] = !!b && b.shown && /titre en gros/.test(b.text);
await shot(page, "search-3-bar-running");
await stopBar();

// ---- mini toolbar and context menus ----
await focusEditor(frame);
await selectBlocks(frame, 2, 3);
const r2 = await frame.evaluate(() => { const ep = Common.ElixirAI.entryPoints.word; return ep.suggestions(ep.probe(Asc.editor)).map(s => s.label).filter(Boolean); });
res["suggestions: several paragraphs -> two columns, headings, rewrite, translate"] = r2.some(l => /colonnes|columns/i.test(l)) && r2.some(l => /titres|headings/i.test(l)) && r2.some(l => /Reformuler|Rewrite/i.test(l)) && r2.some(l => /Tradu|Transl/i.test(l));
// select text with the mouse: the mini toolbar shows its sparkle
const p1 = await at(2, 1, 2.5), p2 = await at(2, 70, 2.5);
await page.mouse.click(p1.x, p1.y);
await frame.waitForTimeout(300);
await page.mouse.move(p1.x, p1.y);
await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 8 }); await page.mouse.up();
await frame.waitForTimeout(600);
const mini = await frame.evaluate(() => { const b = document.querySelector("#mini-toolbar.visible .mini-elixir"); return !!b && b.offsetParent !== null; });
res["mini toolbar: Ask Elixir sparkle shown"] = mini;
if (mini) {
  await frame.hover("#mini-toolbar .mini-elixir");
  await frame.click("#mini-toolbar .mini-elixir");
  await frame.waitForTimeout(400);
}
const menu1 = await frame.evaluate(() => { const m = document.getElementById("elixir-ask-menu"); return m ? Array.from(m.querySelectorAll(".elixir-pop-it")).map(i => i.textContent) : null; });
res["mini toolbar: Ask Elixir menu with text suggestions and a field"] = !!menu1 && menu1.some(l => /Reformuler|Rewrite/i.test(l)) && await frame.evaluate(() => !!document.querySelector("#elixir-ask-menu input"));
await shot(page, "ask-1-mini-toolbar-menu");
if (menu1) {
  await frame.fill("#elixir-ask-menu input", "Mets ce passage en italique");
  await page.keyboard.press("Enter");
  await frame.waitForTimeout(500);
  b = await bar();
  res["ask menu: free text goes to the command bar"] = !!b && b.shown && /italique/.test(b.text);
  await stopBar();
}
// right click on the selection: "Ask Elixir" in the context menu
await page.mouse.move(p1.x, p1.y);
await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 8 }); await page.mouse.up();
await frame.waitForTimeout(300);
await page.mouse.click((p1.x + p2.x) / 2, p1.y, { button: "right" });
await frame.waitForTimeout(700);
const ctxItem = await frame.evaluate(() => {
  const it = Array.from(document.querySelectorAll(".dropdown-menu.show li a, .dropdown-menu li a")).find(a => a.offsetParent !== null && /Demander à Elixir|Ask Elixir/.test(a.textContent));
  if (it) { it.setAttribute("data-elx-test", "1"); return true; } return false;
});
res["context menu: Ask Elixir item"] = ctxItem;
await shot(page, "ask-2-context-menu");
if (ctxItem) {
  await frame.click("[data-elx-test='1']");
  await frame.waitForTimeout(500);
  res["context menu: opens the Ask Elixir menu"] = await frame.evaluate(() => !!document.getElementById("elixir-ask-menu"));
  await shot(page, "aEXAMPLE_TOKEN_NOT_VALID");
  await page.keyboard.press("Escape");
}
// picture selected
await cmd(frame, `(function(){ Api.GetDocument().GetElement(1).GetAllDrawingObjects()[0].Select(); return 1; })()`);
await frame.waitForTimeout(300);
const rp = await frame.evaluate(() => { const ep = Common.ElixirAI.entryPoints.word; return ep.suggestions(ep.probe(Asc.editor)).map(s => s.label); });
res["suggestions: picture -> inline, center, right of the text"] = rp.length === 3 && rp.some(l => /Centrer|Center/.test(l));
await frame.evaluate(() => { const ep = Common.ElixirAI.entryPoints.word; ep.openAskMenu(500, 300); });
await frame.waitForTimeout(300);
await shot(page, "aEXAMPLE_TOKEN_NOT_VALID");
await page.keyboard.press("Escape");

// ---- "/" menu ----
// a new empty paragraph after the last one, made by typing
const p3 = await at(3, 5, 2.5);
await page.mouse.click(p3.x, p3.y);
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await frame.waitForTimeout(600);
const hint = await frame.evaluate(() => { const h = document.getElementById("elixir-slash-hint"); return h && h.style.display === "block" ? h.textContent : ""; });
res["hint: shown in the empty paragraph holding the cursor"] = /\//.test(hint);
await shot(page, "slash-1-hint");
await page.keyboard.type("/");
await frame.waitForTimeout(400);
let sm = await frame.evaluate(() => { const m = document.getElementById("elixir-slash-menu"); return m ? Array.from(m.querySelectorAll(".elixir-pop-it")).map(i => i.getAttribute("data-id")) : null; });
res["slash: '/' on an empty paragraph opens the quick menu"] = !!sm && ["h1", "h2", "bullets", "numbers", "table", "picture", "pagebreak", "ask"].every(i => sm.includes(i));
await shot(page, "slash-2-menu");
await page.keyboard.press("Escape");
await frame.waitForTimeout(300);
res["slash: Escape closes it and keeps the '/'"] = !(await frame.evaluate(() => !!document.getElementById("elixir-slash-menu"))) && (await paraText(4)) === "/";
await page.keyboard.type("a");
await frame.waitForTimeout(200);
res["slash: typing goes on normally ('/a')"] = (await paraText(4)) === "/a";
await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
await frame.waitForTimeout(200);
await page.keyboard.type("/");
await frame.waitForTimeout(400);
await page.keyboard.type("x");
await frame.waitForTimeout(300);
res["slash: any other key closes the menu, '/x' typed"] = !(await frame.evaluate(() => !!document.getElementById("elixir-slash-menu"))) && (await paraText(4)) === "/x";
await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
await page.keyboard.type("/");
await frame.waitForTimeout(400);
await page.keyboard.press("Enter"); // first item: Heading 1
await frame.waitForTimeout(700);
const h1 = await cmd(frame, `(function(){ var p = Api.GetDocument().GetElement(4); return JSON.stringify([p.GetText().replace(/[\\r\\n]+$/, ""), p.GetStyle().GetName()]); })()`);
res["slash: Enter runs the item (Heading 1) and removes the '/'"] = h1 === JSON.stringify(["", "Heading 1"]);
// a real "/" in a non-empty paragraph
await page.keyboard.type("Pages 1/2");
await frame.waitForTimeout(400);
res["slash: a '/' inside text is just typed"] = (await paraText(4)) === "Pages 1/2" && !(await frame.evaluate(() => !!document.getElementById("elixir-slash-menu")));

// ---- Alt+I ----
await page.keyboard.press("Alt+i");
await frame.waitForTimeout(400);
b = await bar();
res["Alt+I still opens the command bar"] = !!b && b.shown;
await page.keyboard.press("Escape");

res["no page error"] = !errors.some(e => e.kind === "pageerror");
let failed = 0;
for (const [k, v] of Object.entries(res)) { console.log((v ? "PASS " : "FAIL ") + k); if (!v) failed++; }
if (errors.length) console.log("errors:", errors.map(e => e.text.slice(0, 160)).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
