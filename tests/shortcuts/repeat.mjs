#!/usr/bin/env node
// Repeat (F4, and Ctrl+Y when there is nothing to redo), as in Word: the last command is applied again
// to the current selection. Playwright against a running editor, real key presses and toolbar clicks.
//
//   node tests/shortcuts/repeat.mjs [--out results.json] [--only id,id]
import fs from "node:fs";
import path from "node:path";
import { launch, openEditor, setDoc, caret, select, state, focusDoc, resetUi, cmd, HERE } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = opt("--out", path.join(HERE, "results", "repeat-latest.json"));
const only = opt("--only", null) ? new Set(opt("--only").split(",")) : null;

const results = [];
const record = (id, ok, reason = "") => {
  results.push({ id, status: ok === true ? "pass" : "fail", reason: ok === true ? "" : reason });
  console.log((ok === true ? "PASS " : "FAIL ") + id + (ok === true ? "" : " " + reason));
};

let env = await launch({});
env.frame = await openEditor(env.page);

// ---- helpers --------------------------------------------------------------------------------
const doc = () => env.frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument);
const text = async p => (await state(env.frame)).paras.map(x => x.text !== undefined ? x.text : "[table]");
// Ctrl shortcuts in their Word form for the host: Ctrl on Windows/Linux, Cmd on a real Mac (Cmd+Y repeats
// there, Cmd+Option+1 is Heading 1...); with Playwright, ControlOrMeta is Meta on macOS only
const key = async k => { await env.page.keyboard.press(k.replace(/^Control\+/, "ControlOrMeta+")); await env.frame.waitForTimeout(150); };
// character formatting of characters [from, to) of paragraph p
async function props(p, from, to) {
  await select(env.frame, p, from, to);
  return env.frame.evaluate(() => { const tp = Asc.editor.WordControl.m_oLogicDocument.GetCalculatedTextPr() || {}; return { bold: tp.Bold === true, italic: tp.Italic === true, size: tp.FontSize, color: tp.Color && !tp.Color.Auto ? [tp.Color.r, tp.Color.g, tp.Color.b].join(",") : "auto", highlight: tp.HighLight && tp.HighLight !== -1 ? [tp.HighLight.r, tp.HighLight.g, tp.HighLight.b].join(",") : "none", vert: tp.VertAlign, caps: tp.Caps === true }; });
}
const paraInfo = p => env.frame.evaluate(p => { const d = Asc.editor.WordControl.m_oLogicDocument; const el = d.Content[p]; el.MoveCursorToStartPos(); d.CurPos.ContentPos = p; d.Selection.Use = false; d.Document_UpdateSelectionState(); const pp = d.GetCalculatedParaPr(); const st = pp.PStyle ? d.Styles.Get(pp.PStyle).GetName() : "Normal"; return { style: st, jc: pp.Jc, before: pp.Spacing && pp.Spacing.Before, after: pp.Spacing && pp.Spacing.After, line: pp.Spacing && pp.Spacing.Line, numbered: !!pp.NumPr, left: pp.Ind && pp.Ind.Left }; }, p);
const tables = () => env.frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.filter(e => e.IsTable && e.IsTable()).length);
const canRepeat = () => env.frame.evaluate(() => Asc.editor.asc_CanRepeat());
const historyDepth = () => env.frame.evaluate(() => { const h = Asc.editor.WordControl.m_oLogicDocument.History; return h.Index; });
const setup = async spec => { await resetUi(env.frame, env.page); await env.frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.RepeatCommand = null; d.History.Clear && d.History.Clear(); Asc.editor.sync_CanUndoCallback(false); Asc.editor.sync_CanRedoCallback(false); Asc.editor.sync_CanRepeatCallback(false); }); await setDoc(env.frame, spec); await focusDoc(env.frame); };
const api = (name, ...a) => env.frame.evaluate(([n, a]) => Asc.editor[n].apply(Asc.editor, a), [name, a]);
const click = sel => env.frame.evaluate(s => { const b = $(s).first(); b.click(); return b.length; }, sel);
const color = (r, g, b) => env.frame.evaluate(([r, g, b]) => { const c = new Asc.asc_CColor(); c.put_r(r); c.put_g(g); c.put_b(b); c.put_a(255); return null; }, [r, g, b]);

const tests = [];
const test = (id, fn) => tests.push([id, fn]);

// ---- tests ----------------------------------------------------------------------------------
test("repeat.nothing-to-repeat", async () => {
  await setup(["alpha beta gamma", "delta"]);
  const before = JSON.stringify(await text()), h = await historyDepth();
  await select(env.frame, 0, 0, 5);
  await key("F4"); await key("Control+y");
  const none = (await canRepeat()) === false && JSON.stringify(await text()) === before && (await historyDepth()) === h;
  return none || `F4 / Ctrl+Y changed something (can ${await canRepeat()}, text ${JSON.stringify(await text())}, history ${h} -> ${await historyDepth()})`;
});

test("repeat.bold-word-f4", async () => {
  await setup(["alpha beta gamma", "delta epsilon"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const a = await props(0, 0, 5), b = await props(1, 0, 5), c = await props(1, 6, 13);
  return (a.bold && b.bold && !c.bold) || `bold: first ${a.bold}, repeated ${b.bold}, untouched ${c.bold}`;
});

test("repeat.bold-ribbon-button", async () => {
  await setup(["alpha beta gamma", "delta epsilon"]);
  await select(env.frame, 0, 6, 10);
  if (!(await click("#id-toolbar-btn-bold"))) return "no Bold button";
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const b = await props(1, 0, 5);
  return b.bold || "F4 after the Bold button did not bold the word";
});

test("repeat.bold-collapsed-cursor-word", async () => {
  // Word formats the word under the cursor, and so does Repeat
  await setup(["alpha beta gamma", "delta epsilon"]);
  await caret(env.frame, 0, 2);
  await key("Control+b");
  await caret(env.frame, 1, 8);
  await key("F4");
  const a = await props(0, 0, 5), b = await props(1, 6, 13), c = await props(1, 0, 5);
  return (a.bold && b.bold && !c.bold) || `first word ${a.bold}, word under the cursor of the repeat ${b.bold}, other word ${c.bold}`;
});

test("repeat.ctrl-y-redo-has-priority", async () => {
  await setup(["alpha beta gamma", "delta epsilon"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  await key("Control+z");
  const undone = !(await props(0, 0, 5)).bold;
  await select(env.frame, 1, 0, 5);
  await key("Control+y");                       // redo: bold on the first word, the second is untouched
  const redone = (await props(0, 0, 5)).bold && !(await props(1, 0, 5)).bold;
  await select(env.frame, 1, 0, 5);
  await key("Control+y");                       // nothing left to redo: repeat
  const repeated = (await props(1, 0, 5)).bold;
  return (undone && redone && repeated) || `undone ${undone}, redone ${redone}, repeated ${repeated}`;
});

test("repeat.heading-ctrl-y", async () => {
  await setup(["first", "second", "third"]);
  await caret(env.frame, 0, 1);
  await key("Control+Alt+1");
  await caret(env.frame, 2, 1);
  await key("Control+y");
  const s = (await state(env.frame)).paras.map(p => p.style);
  return (/^Heading 1/.test(s[0]) && /Normal|Default/.test(s[1]) && /^Heading 1/.test(s[2])) || `styles ${JSON.stringify(s)}`;
});

test("repeat.style-gallery", async () => {
  await setup(["first", "second", "third"]);
  await caret(env.frame, 0, 1);
  await api("put_Style", "Heading 2");          // what the style gallery calls
  await caret(env.frame, 1, 1);
  await key("F4");
  const s = (await state(env.frame)).paras.map(p => p.style);
  return (/^Heading 2/.test(s[0]) && /^Heading 2/.test(s[1]) && !/^Heading/.test(s[2])) || `styles ${JSON.stringify(s)}`;
});

test("repeat.highlight", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await api("SetMarkerFormat", true, true, 255, 255, 0);   // the highlight button with a selection
  await api("SetMarkerFormat", false);
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const a = await props(0, 0, 5), b = await props(1, 0, 5), c = await props(1, 6, 11);
  return (a.highlight === "255,255,0" && b.highlight === "255,255,0" && c.highlight === "none") || `highlight ${a.highlight} / ${b.highlight} / ${c.highlight}`;
});

test("repeat.paragraph-spacing", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 0, 1);
  await api("put_LineSpacingBeforeAfter", 1, 12 * 20 / 20 * 0.3527);   // after = 12 pt (in mm)
  const first = (await paraInfo(0)).after;
  await key("F4"); // from the cursor in the first paragraph
  await caret(env.frame, 2, 1);
  await key("F4");
  const p = await Promise.all([0, 1, 2].map(paraInfo));
  return (first > 0 && p[2].after === first && p[1].after !== first) || `after ${p.map(x => x.after)}`;
});

test("repeat.line-spacing-dialog-api", async () => {
  await setup(["one", "two"]);
  await caret(env.frame, 0, 1);
  await api("put_PrLineSpacing", 1, 2);       // Asc.linerule_Auto, double
  await caret(env.frame, 1, 1);
  await key("F4");
  const p = await Promise.all([0, 1].map(paraInfo));
  return (p[0].line === 2 && p[1].line === 2) || `line ${p.map(x => x.line)}`;
});

test("repeat.alignment-is-applied-not-toggled", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 1, 1);
  await key("Control+e");                       // the second paragraph is centred
  await caret(env.frame, 0, 1);
  await key("Control+e");                       // Ctrl+E on the first one: centred, and the command to repeat
  await key("F4");                              // F4 on the same paragraph must not toggle it back
  await caret(env.frame, 2, 1);
  await key("F4");
  await caret(env.frame, 1, 1);
  await key("F4");                              // already centred: stays centred
  const p = await Promise.all([0, 1, 2].map(paraInfo));
  return (p[0].jc === 2 && p[1].jc === 2 && p[2].jc === 2) || `jc ${p.map(x => x.jc)}`;
});

test("repeat.list", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 0, 1);
  await api("put_ListType", 0, 1);     // bullets
  await caret(env.frame, 2, 1);
  await key("F4");
  const p = await Promise.all([0, 1, 2].map(paraInfo));
  return (p[0].numbered && !p[1].numbered && p[2].numbered) || `numbered ${p.map(x => x.numbered)}`;
});

test("repeat.font-size-and-colour", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await api("put_TextPrFontSize", 20);
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const a = await props(1, 0, 5);
  await select(env.frame, 0, 6, 10);
  await env.frame.evaluate(() => { const c = new Asc.asc_CColor(); c.put_r(255); c.put_g(0); c.put_b(0); c.put_a(255); Asc.editor.put_TextColor(c); });
  await select(env.frame, 1, 6, 11);
  await key("F4");
  const b = await props(1, 6, 11);
  return (a.size === 20 && b.color === "255,0,0") || `size ${a.size}, colour ${b.color}`;
});

test("repeat.insert-table", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 0, -1);
  await api("put_Table", 2, 3);
  const n1 = await tables();
  const last = await env.frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.length - 1);
  await caret(env.frame, last, -1);
  await key("F4");
  const n2 = await tables();
  return (n1 === 1 && n2 === 2) || `tables ${n1} -> ${n2}`;
});

test("repeat.insert-page-break", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 0, -1);
  await key("Control+Enter");
  const p1 = await env.frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.GetPagesCount());
  await caret(env.frame, 2, -1);
  await key("F4");
  await env.frame.waitForTimeout(300);
  const p2 = await env.frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.GetPagesCount());
  return (p2 > p1) || `pages ${p1} -> ${p2}`;
});

test("repeat.insert-symbol", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 0, -1);
  await api("asc_insertSymbol", "Arial", 0x263A);
  await env.frame.waitForTimeout(600);
  await caret(env.frame, 1, -1);
  await key("F4");
  await env.frame.waitForTimeout(600);
  const t = await text();
  return (t[0].endsWith("☺") && t[1].endsWith("☺")) || `text ${JSON.stringify(t)}`;
});

test("repeat.hyperlink", async () => {
  await setup(["one", "two", "three"]);
  await caret(env.frame, 0, -1);
  await env.frame.evaluate(() => { const h = new Asc.CHyperlinkProperty(); h.put_Value("https://example.org/"); h.put_Text("site"); Asc.editor.add_Hyperlink(h); });
  await env.frame.waitForTimeout(300);
  await caret(env.frame, 2, -1);
  await key("F4");
  await env.frame.waitForTimeout(300);
  const links = await env.frame.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.Content.map(p => p.Content.filter(e => e.GetValue && e.GetValue() === "https://example.org/").length));
  return (links[0] === 1 && links[1] === 0 && links[2] === 1) || `hyperlinks per paragraph ${JSON.stringify(links)}`;
});

test("repeat.comment", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await env.frame.evaluate(() => { const c = new Asc.asc_CCommentDataWord(null); c.asc_putText("check"); c.asc_putUserName("Tester"); Asc.editor.asc_addComment(c); });
  await env.frame.waitForTimeout(300);
  const n1 = (await state(env.frame)).comments;
  await select(env.frame, 1, 0, 5);
  await key("F4");
  await env.frame.waitForTimeout(300);
  const n2 = (await state(env.frame)).comments;
  return (n1 === 1 && n2 === 2) || `comments ${n1} -> ${n2}`;
});

test("repeat.typing", async () => {
  await setup(["one", "two"]);
  await caret(env.frame, 0, -1);
  await env.page.keyboard.type("abc");
  await env.frame.waitForTimeout(150);
  await caret(env.frame, 1, -1);
  await key("F4");
  const t = await text();
  return (t[0] === "oneabc" && t[1] === "twoabc") || `text ${JSON.stringify(t)}`;
});

test("repeat.typing-run-extends-and-backspace", async () => {
  await setup(["one", "two"]);
  await caret(env.frame, 0, -1);
  await env.page.keyboard.type("abx");
  await key("Backspace");
  await env.page.keyboard.type("cd");           // run is now "abcd"
  await caret(env.frame, 1, -1);
  await key("F4");
  const t = await text();
  return t[1] === "twoabcd" || `text ${JSON.stringify(t)}`;
});

test("repeat.typing-after-navigation-is-a-new-run", async () => {
  await setup(["one", "two"]);
  await caret(env.frame, 0, -1);
  await env.page.keyboard.type("ab");
  await key("ArrowLeft");
  await env.page.keyboard.type("Z");            // a new run: only "Z" repeats
  await caret(env.frame, 1, -1);
  await key("F4");
  const t = await text();
  return t[1] === "twoZ" || `text ${JSON.stringify(t)}`;
});

test("repeat.delete-selection", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await key("Delete");
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const t = await text();
  return (t[0] === " beta" && t[1] === " delta") || `text ${JSON.stringify(t)}`;
});

test("repeat.enter", async () => {
  await setup(["one", "two"]);
  await caret(env.frame, 0, -1);
  await key("Enter");
  await key("F4");
  const t = await text();
  return t.length === 4 || `paragraphs ${JSON.stringify(t)}`;
});

test("repeat.cut", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+x");
  await select(env.frame, 1, 0, 5);
  await key("F4");
  await env.frame.waitForTimeout(200);
  const t = await text();
  return (t[0] === " beta" && t[1] === " delta") || `text ${JSON.stringify(t)}`;
});

test("repeat.paste", async () => {
  await setup(["alpha beta", "one", "two"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+c");
  await env.frame.waitForTimeout(300);
  await caret(env.frame, 1, -1);
  await key("Control+v");
  await env.frame.waitForTimeout(600);
  await caret(env.frame, 2, -1);
  await key("F4");
  await env.frame.waitForTimeout(600);
  const t = await text();
  return (t[1] === "onealpha" && t[2] === "twoalpha") || `text ${JSON.stringify(t)}`;
});

test("repeat.not-recorded-navigation-selection-view", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  await key("ArrowRight"); await key("Control+a"); await key("Control+Home"); await key("Control+End");
  await api("zoom", 120);
  await api("zoom", 100);
  await select(env.frame, 1, 0, 5);
  await key("F4");
  return (await props(1, 0, 5)).bold || "navigation, select all or zoom replaced the bold command";
});

test("repeat.one-undo-step", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const h = await historyDepth();
  await key("Control+z");
  const h2 = await historyDepth();
  const a = (await props(0, 0, 5)).bold, b = (await props(1, 0, 5)).bold;
  return (h - h2 === 1 && a && !b) || `history ${h} -> ${h2}, first bold ${a}, repeated word bold after undo ${b}`;
});

test("repeat.track-changes", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await api("asc_SetTrackRevisions", true);
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  const changes = p => env.frame.evaluate(p => { const d = Asc.editor.WordControl.m_oLogicDocument; return d.GetTrackRevisionsManager().GetElementChanges(d.Content[p].GetId()).length; }, p);
  const c0 = await changes(0), c1before = await changes(1);
  await select(env.frame, 1, 0, 5);
  await key("F4");
  const c1 = await changes(1);
  await api("asc_SetTrackRevisions", false);
  return (c0 >= 1 && c1before === 0 && c1 >= 1) || `revisions: first paragraph ${c0}, second ${c1before} -> ${c1}`;
});

test("repeat.locked-paragraph-does-nothing", async () => {
  await setup(["alpha beta", "gamma delta"]);
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  await select(env.frame, 1, 0, 5);
  await env.frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; d.IsSelectionLocked = d.Document_Is_SelectionLocked = function() { return true; }; });
  const h = await historyDepth();
  await key("F4");
  await env.frame.evaluate(() => { const d = Asc.editor.WordControl.m_oLogicDocument; delete d.IsSelectionLocked; delete d.Document_Is_SelectionLocked; });
  const same = (await historyDepth()) === h && !(await props(1, 0, 5)).bold;
  return same || "a locked selection was changed by Repeat";
});

test("repeat.qat-button", async () => {
  // the Redo button of the quick access toolbar is Repeat when there is nothing to redo
  await setup(["alpha beta", "gamma delta"]);
  const state = () => env.frame.evaluate(() => { const b = $("#slot-btn-dt-redo"); const use = b.find("use").first(); return { icon: (use.attr("href") || use.attr("xlink:href") || ""), disabled: b.find("button, .btn-header").first().is(".disabled, :disabled") || b.find(".disabled").length > 0, hint: b.find("[data-original-title], [title]").first().attr("data-original-title") || b.find("[title]").first().attr("title") || "" }; });
  const idle = await state();
  await select(env.frame, 0, 0, 5);
  await key("Control+b");
  const withCommand = await state();
  if (!/btn-repeat/.test(withCommand.icon) || withCommand.disabled) return `after a command the button is ${JSON.stringify(withCommand)} (idle ${JSON.stringify(idle)})`;
  await select(env.frame, 1, 0, 5);
  const box = await env.frame.evaluate(() => { const r = $("#slot-btn-dt-redo button")[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const fb = await (await env.frame.frameElement()).boundingBox();
  await env.page.mouse.click(fb.x + box.x, fb.y + box.y);
  await env.frame.waitForTimeout(300);
  if (!(await props(1, 0, 5)).bold) return "the Repeat button did not repeat";
  await key("Control+z");                                    // something to redo: the button is Redo again
  await env.frame.waitForTimeout(200);
  const afterUndo = await state();
  return (/btn-redo/.test(afterUndo.icon) && !afterUndo.disabled) || `after undo the button is ${JSON.stringify(afterUndo)}`;
});

// ---- run -----------------------------------------------------------------------------------
async function runAll(platform) {
  if (platform === "mac") { await env.browser.close(); env = await launch({ platform: "mac" }); env.frame = await openEditor(env.page); }
  for (const [id, fn] of tests) {
    if (only && !only.has(id)) continue;
    if (platform === "mac" && !MAC.has(id)) continue;
    const nErr = env.errors.length;
    let r;
    try { r = await fn(); } catch (e) { r = "threw: " + String(e).slice(0, 200); }
    const pe = env.errors.slice(nErr).filter(e => e.kind === "pageerror");
    if (r === true && pe.length) r = "page error: " + pe[0].text.slice(0, 160);
    record((platform === "mac" ? "mac." : "") + id, r, typeof r === "string" ? r : "");
  }
}
const MAC = new Set(["repeat.bold-word-f4", "repeat.ctrl-y-redo-has-priority", "repeat.nothing-to-repeat"]);
await runAll("win");

// macOS: Cmd+Y is Redo (and Repeat when there is nothing to redo), F4 repeats
if (!only || [...only].some(i => i.startsWith("mac."))) {
  MAC.clear(); ["repeat.bold-word-f4", "repeat.nothing-to-repeat"].forEach(i => MAC.add(i));
  tests.push(["repeat.cmd-y", async () => {
    await setup(["alpha beta gamma", "delta epsilon"]);
    await select(env.frame, 0, 0, 5);
    await key("Meta+b");
    await key("Meta+z");
    await select(env.frame, 1, 0, 5);
    await key("Meta+y");
    const redone = (await props(0, 0, 5)).bold && !(await props(1, 0, 5)).bold;
    await select(env.frame, 1, 0, 5);
    await key("Meta+y");
    return (redone && (await props(1, 0, 5)).bold) || `redone ${redone}`;
  }]);
  MAC.add("repeat.cmd-y");
  await runAll("mac");
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
console.log(`${results.filter(r => r.status === "pass").length}/${results.length} pass`);
await env.browser.close();
