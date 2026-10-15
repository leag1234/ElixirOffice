#!/usr/bin/env node
// Deterministic checks of the Word tools, without any model: each tool is called with fixed
// arguments on the task inputs, inside one undo group with assistant tracking, and the
// resulting document structure, revisions and single-step undo are verified.
//   node tools/eval/tools-check.mjs
import path from "node:path";
import { REPO, launch, uploadDocx, openEditor, snapshot, selectBlocks, focusEditor, sameStructure } from "./lib.mjs";

const TASKS = path.join(REPO, "eval/tasks");
const checks = [];
const ok = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); };

async function withDoc(task, fn) {
  const { browser, page, errors } = await launch();
  try {
    const frame = await openEditor(page, await uploadDocx(path.join(TASKS, task, "input.docx")));
    await frame.evaluate(() => { window.__ts = Common.ElixirAI.toolsets.word.create(Asc.editor); });
    await fn(frame, page);
    ok(task + ": no page/console error", errors.length === 0, errors.map(e => e.text.slice(0, 200)).join(" | "));
  } finally { await browser.close(); }
}

// Runs one action the way the orchestrator does: init, begin (group + tracking), tools, end
async function action(frame, calls) {
  return frame.evaluate(async (calls) => {
    const ctx = await __ts.init(); window.__ctx = ctx;
    await __ts.begin(ctx);
    const out = [];
    for (const [name, args] of calls) out.push(__ts.validate(name, args, ctx) || await __ts.execute(name, args, ctx));
    await __ts.end(ctx, true);
    return { ctx: { scope: ctx.scope, from: ctx.from, to: ctx.to }, out };
  }, calls);
}

async function undo(frame, page) {
  await focusEditor(frame);
  await page.keyboard.press("Control+z");
  await frame.waitForTimeout(800);
  return snapshot(frame);
}

await withDoc("two-columns", async (frame, page) => {
  const before = await snapshot(frame);
  await selectBlocks(frame, 2, 6);
  const r = await action(frame, [["set_columns", { from: 2, to: 6, count: 2 }]]);
  ok("init: selection 2-6 is the scope", r.ctx.scope === "selection" && r.ctx.from === 2 && r.ctx.to === 6, JSON.stringify(r.ctx));
  const a = await snapshot(frame);
  ok("set_columns: blocks 2-6 in 2 columns, others in 1", a.blocks.every(b => b.cols === (b.i >= 2 && b.i <= 6 ? 2 : 1)), a.blocks.map(b => b.cols).join(""));
  ok("set_columns: continuous breaks", a.blocks[2].secType === "continuous" && a.blocks[7].secType === "continuous", "");
  ok("set_columns: reported as not tracked", r.out[0].ok && r.out[0].tracked === false, "");
  ok("set_columns: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("list-to-table", async (frame, page) => {
  const before = await snapshot(frame);
  await selectBlocks(frame, 2, 6);
  const r = await action(frame, [["list_to_table", { from: 2, to: 6, header: ["Accompagnateur", "Groupe", "Salle"] }]]);
  const a = await snapshot(frame);
  const t = a.blocks[2];
  ok("list_to_table: separator auto-detected", r.out[0].separator === " – ", JSON.stringify(r.out[0].separator));
  ok("list_to_table: 6x3 table at block 2 with header row", t.type === "table" && t.rows === 6 && t.header && t.cells[1].join("|") === "Mme Martin|Groupe A|Salle 12", JSON.stringify(t.cells && t.cells.slice(0, 2)));
  const rev = a.revisions["Elixir AI"] || [];
  ok("list_to_table: tracked insertion + deletion by Elixir AI", rev.includes("RowsAdd") && rev.includes("ParaRem"), rev.length + " revisions");
  ok("list_to_table: one undo restores", sameStructure(await undo(frame, page), before), "");
  // validation errors are structured
  await selectBlocks(frame, 2, 6);
  const v = await frame.evaluate(async () => {
    const ctx = await __ts.init();
    return [__ts.validate("list_to_table", { from: 2, to: 9, header: true }, ctx), __ts.validate("list_to_table", { from: 2, to: 6 }, ctx),
      __ts.validate("set_columns", { from: 2, to: 6, count: 9 }, ctx), __ts.validate("nope", {}, ctx), __ts.validate("apply_style", { from: 2, to: 2, style: "Heading 1", color: "red" }, ctx)];
  });
  ok("validate: out of scope, missing arg, max, unknown tool, unknown arg", v.every(x => x && x.ok === false && x.error && x.error.code), v.map(x => x && x.error.code + ":" + (x.error.field || "")).join(", "));
  // accept keeps the table and removes the list
  await selectBlocks(frame, 2, 6);
  await action(frame, [["list_to_table", { from: 2, to: 6, header: true }]]);
  await frame.evaluate(() => __ts.accept(__ctx));
  await frame.waitForTimeout(500);
  const acc = await snapshot(frame);
  ok("accept: table kept, list gone, no revision left", acc.blocks.filter(b => b.type === "table").length === 1 && !acc.blocks.some(b => /Mme Martin –/.test(b.text || "")) && Object.keys(acc.revisions).length === 0, acc.blocks.map(b => b.type).join(","));
});

await withDoc("cleanup", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["apply_style", { from: 0, to: 0, style: "Title", clear_direct_formatting: true }],
    ["apply_style", { from: 2, to: 2, style: "Heading 1" }],
    ["apply_style", { from: 5, to: 5, style: "Heading 2" }],
    ["apply_style", { from: 3, to: 3, style: "Normal" }],
    ["apply_style", { from: 6, to: 6, style: "Bogus" }],
    ["replace_text", { block: 1, find: "Saint-Michel", text: "Saint-Michel (Rennes)" }],
    ["insert_paragraphs", { after: 12, items: [{ style: "Normal", text: "Un paragraphe pour tester import et insertion." }] }]
  ]);
  ok("init: no selection -> whole document", r.ctx.scope === "document" && r.ctx.from === 0, JSON.stringify(r.ctx));
  const a = await snapshot(frame);
  ok("apply_style: styles applied", a.blocks[0].style === "Title" && a.blocks[2].style === "Heading 1" && a.blocks[5].style === "Heading 2" && a.blocks[3].style === "Normal", a.blocks.map(b => b.style).slice(0, 6).join(", "));
  ok("apply_style: unknown style rejected with the list of styles", r.out[4].ok === false && r.out[4].error.available.includes("Heading 1"), r.out[4].error && r.out[4].error.code);
  ok("replace_text: tracked deletion + insertion", r.out[5].ok && (a.revisions["Elixir AI"] || []).includes("TextRem"), a.blocks[1].text);
  ok("insert_paragraphs: text containing the word 'import' is accepted", r.out[6].ok && a.blocks[13] && /import/.test(a.blocks[13].text), a.blocks[13] && a.blocks[13].text);
  ok("apply_style: tracked as ParaPr revisions", (a.revisions["Elixir AI"] || []).includes("ParaPr"), "");
  ok("tracking restored after the action", a.track === false, String(a.track));
  ok("one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("cleanup", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["apply_styles", { changes: [{ from: 0, to: 0, style: "Title", clear_direct_formatting: true }, { from: 2, to: 2, style: "Heading 1" }, { from: 3, to: 3, style: "Normal" }, { from: 5, to: 5, style: "Heading 2" }] }],
    ["apply_styles", { changes: [{ from: 6, to: 6, style: "Normal" }, { from: 7, to: 7, style: "Nope" }] }]
  ]);
  const a = await snapshot(frame);
  ok("apply_styles: all changes applied in one call", r.out[0].ok && r.out[0].changes === 4 && a.blocks[0].style === "Title" && a.blocks[2].style === "Heading 1" && a.blocks[3].style === "Normal" && a.blocks[5].style === "Heading 2", JSON.stringify(r.out[0]));
  ok("apply_styles: an unknown style is rejected before anything runs", r.out[1].ok === false && r.out[1].error.field === "changes[1].style" && a.blocks[6].style === "Heading 3", JSON.stringify(r.out[1].error));
  ok("apply_styles: one undo restores", sameStructure(await undo(frame, page), before), "");
});

// ---- tools added with the AI rework (docs/ai.md §4) ----
const rev = a => a.revisions["Elixir AI"] || [];
const P = a => a.final.filter(b => b.type === "paragraph");

await withDoc("g-toc-unstyled", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["get_outline_candidates", {}],
    ["apply_styles", { changes: [{ from: 2, to: 2, style: "Heading 1", clear_direct_formatting: true }, { from: 4, to: 4, style: "Heading 2", clear_direct_formatting: true }, { from: 8, to: 8, style: "Heading 1", clear_direct_formatting: true }] }],
    ["insert_table_of_contents", { before: 2 }],
    ["insert_table_of_contents", { before: 999 }]
  ]);
  const oc = r.out[0];
  const lv = Object.fromEntries((oc.candidates || []).map(c => [c.block, c.suggested_level]));
  ok("get_outline_candidates: title 0, sections 1, sub-sections 2", lv[0] === 0 && lv[2] === 1 && lv[4] === 2 && lv[14] === 1 && !(3 in lv), JSON.stringify(lv));
  const a = await snapshot(frame);
  const toc = a.final.find(b => b.toc);
  ok("insert_table_of_contents: a TOC field with the headings", toc && toc.entries.filter(e => /toc [12]/.test(e.style)).length === 3, toc && JSON.stringify(toc.entries));
  ok("insert_table_of_contents: placed before block 2", a.final.indexOf(toc) === 2, a.final.map(b => b.type).join(","));
  ok("insert_table_of_contents: out-of-document block rejected", r.out[3].ok === false && r.out[3].error.code === "invalid_argument", JSON.stringify(r.out[3]));
  ok("TOC action: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("e-number-exercises", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["format_text", { from: 0, to: 0, size_pt: 24, color: "#1F3864", font: "Arial", italic: true }],
    ["format_text", { from: 3, to: 3, find: "1/4", bold: true, highlight: "yellow" }],
    ["format_paragraphs", { from: 0, to: 0, align: "center", space_after_pt: 12 }],
    ["format_paragraphs", { from: 3, to: 9, space_after_pt: 2, line_spacing: 1.15, indent_left_mm: 5 }],
    ["set_list", { from: 2, to: 2, kind: "numbered" }],
    ["set_list", { from: 5, to: 7, kind: "bullet" }],
    ["change_list_level", { from: 5, to: 7, delta: 1 }],
    ["format_text", { from: 3, to: 3, color: "blue" }],
    ["format_paragraphs", { from: 0, to: 0, align: "middle" }],
    ["set_list", { from: 1, to: 1, kind: "roman" }]
  ]);
  const a = await snapshot(frame), p = P(a);
  ok("format_text: size, font, colour, italic on a range", p[0].run.size === 24 && p[0].run.font === "Arial" && p[0].run.italic && JSON.stringify(p[0].run.color) === "[31,56,100]", JSON.stringify(p[0].run));
  ok("format_text: only the occurrences of `find`", r.out[1].ok && r.out[1].ranges === 1, JSON.stringify(r.out[1]));
  ok("format_paragraphs: alignment and spacing", p[0].jc === "center" && p[0].spaceAfter === 240 && p[3].spaceAfter === 40 && p[3].indLeft === 283, [p[0].jc, p[0].spaceAfter, p[3].spaceAfter, p[3].indLeft].join(","));
  ok("format_paragraphs: tracked as paragraph revisions (sdkjs fix)", rev(a).includes("ParaPr") && rev(a).includes("TextPr"), rev(a).join(","));
  ok("set_list: numbered / bullet lists", p[2].list === "numbered" && p[5].list === "bullet" && p[7].list === "bullet" && !p[6].list === false, p.map(b => b.list).join(","));
  ok("change_list_level: level +1", p[5].level === 1, p[5].level);
  ok("validation: bad colour, bad enum", r.out[7].ok === false && r.out[7].error.field === "color" && r.out[8].ok === false && r.out[8].error.allowed && r.out[9].ok === false, [r.out[7], r.out[8], r.out[9]].map(x => x.error && x.error.code + ":" + x.error.field).join(" "));
  ok("formatting action: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("e-heading2-exercises", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["apply_styles", { changes: [{ from: 2, to: 2, style: "Heading 1" }, { from: 4, to: 4, style: "Heading 2" }] }],
    ["change_heading_level", { from: 2, to: 4, delta: 1 }],
    ["find_text", { text: "fraction", whole_word: false }],
    ["find_replace", { find: "Exercice", replace: "Exo", match_case: true, whole_word: true }],
    ["replace_text", { block: 3, find: "1/4", text: "un quart" }],
    ["delete_blocks", { from: 9, to: 9 }],
    ["rewrite_blocks", { from: 5, to: 5, items: [{ text: "Complète avec <, > ou =." }, { text: "Exemple : 1/2 = 2/4." }] }],
    ["document_info", {}],
    ["find_replace", { find: "zzz", replace: "y" }],
    ["change_heading_level", { from: 7, to: 7, delta: 1 }]
  ]);
  const a = await snapshot(frame), p = P(a);
  ok("change_heading_level: Heading 1 -> 2, Heading 2 -> 3", p[2].style === "Heading 2" && p[4].style === "Heading 3", p[2].style + "/" + p[4].style);
  ok("find_text: blocks containing the text", r.out[2].ok && r.out[2].total >= 1, JSON.stringify(r.out[2]).slice(0, 120));
  ok("find_replace: whole words, match case, tracked", r.out[3].ok && r.out[3].replaced === 4 && p.filter(b => /^Exo :/.test(b.text)).length === 4 && rev(a).includes("TextRem"), JSON.stringify(r.out[3]));
  ok("replace_text: one occurrence", /un quart/.test(p[3].text), p[3].text);
  ok("rewrite_blocks: 1 paragraph -> 2, old one a tracked deletion", p.some(b => b.text === "Exemple : 1/2 = 2/4.") && !p.some(b => /^Complète avec <, > ou = : 1\/2/.test(b.text)), "");
  ok("delete_blocks: tracked deletion", !p.some(b => /^Range dans/.test(b.text)) && rev(a).includes("TextRem"), "");
  ok("document_info: words, pages, outline, sections", r.out[7].ok && r.out[7].words > 20 && r.out[7].pages === 1 && r.out[7].sections[0].paper === "A4", JSON.stringify(r.out[7]).slice(0, 200));
  ok("not found / no heading -> structured errors", r.out[8].error.code === "not_found" && r.out[9].error.code === "no_heading", r.out[8].error.code + "/" + r.out[9].error.code);
  ok("text action: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("e-sort-table", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["table_sort", { table: 1, column: 0 }],
    ["table_rows", { table: 1, action: "insert", row: 5, position: "after", cells: [["Yanis", "10", "C"]] }],
    ["table_rows", { table: 1, action: "delete", row: 1 }],
    ["table_set_cells", { table: 1, cells: [{ row: 0, column: 2, text: "Groupe" }] }],
    ["table_format", { table: 1, header_row: true, width_percent: 80, align: "center", banded_rows: true }],
    ["table_columns", { table: 1, action: "insert", column: 2, position: "after", cells: [["Note"], ["12"], ["15"], ["9"], ["14"], ["18"]] }],
    ["table_merge_cells", { table: 1, from_row: 4, from_column: 0, to_row: 5, to_column: 0 }],
    ["table_sort", { table: 0, column: 0 }],
    ["table_rows", { table: 1, action: "delete", row: 40 }],
    ["table_format", { table: 1, style: "No Such Style" }]
  ]);
  const a = await snapshot(frame), t = a.final.find(b => b.type === "table");
  ok("table_sort: rows sorted, header kept", r.out[0].ok && r.out[0].header_kept, JSON.stringify(r.out[0]));
  ok("table_rows: insert with texts + delete (tracked)", rev(a).includes("RowsAdd") && t.cells.some(c => c[0] === "Yanis") && !t.cells.some(c => c[0] === "Adam"), t.cells.map(c => c[0]).join(","));
  ok("table_set_cells + table_format header row", t.cells[0][2] === "Groupe" && t.header, t.cells[0].join("|"));
  ok("table_columns: a column inserted", t.cells[0].length === 4, t.cells[0].join("|"));
  ok("table_merge_cells: merged", r.out[6].ok && r.out[6].merged === 2, JSON.stringify(r.out[6]));
  ok("table tools: not a table / bad row / unknown style -> structured errors", r.out[7].error.code === "not_a_table" && r.out[8].error.field === "row" && r.out[9].error.field === "style", [r.out[7], r.out[8], r.out[9]].map(x => x.error.code).join(","));
  ok("table action: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("g-a4-to-2xa5", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["get_layout_summary", {}],
    ["set_page_setup", { paper: "A5", all_margins_mm: 15, fit_content: false }],
    ["find_overflowing_elements", {}],
    ["fit_content", {}],
    ["find_overflowing_elements", {}],
    ["set_image_layout", { block: 2, wrap: "square", align: "right", width_mm: 60 }],
    ["insert_image", { after: 0, url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZGBgAJfcE/K2AxXcAAAAASUVORK5CYII=", width_mm: 40, align: "center" }],
    ["insert_break", { after: 4, kind: "page" }],
    ["set_header_footer", { part: "footer", text: "Page {PAGE} / {NUMPAGES}", align: "center" }],
    ["set_header_footer", { part: "header", text: "Sortie scolaire", align: "right" }],
    ["add_comment", { block: 4, find: "car", text: "Vérifier l'horaire" }],
    ["set_page_setup", { orientation: "landscape" }],
    ["insert_image", { after: 0, url: "file:///etc/passwd" }],
    ["set_page_setup", {}]
  ]);
  ok("get_layout_summary: A4, wide picture and table reported", r.out[0].ok && r.out[0].sections[0].paper === "A4" && r.out[0].drawings.length === 1, JSON.stringify(r.out[0]).slice(0, 200));
  ok("set_page_setup A5 + margins; overflow then found", r.out[1].ok && r.out[1].sections[0].paper === "A5" && r.out[2].count >= 1, JSON.stringify(r.out[2]).slice(0, 200));
  ok("fit_content: nothing overflows afterwards", r.out[3].ok && r.out[3].fitted >= 1 && r.out[4].count === 0, JSON.stringify(r.out[4]));
  const a = await snapshot(frame), p = P(a);
  const pic = p.flatMap(b => b.drawings);
  ok("set_image_layout: square wrap, right, 60 mm", pic.some(d => d.wrap === "square" && d.halign === "right" && Math.abs(d.w - 60) < 0.6), JSON.stringify(pic));
  ok("insert_image: data URI picture, 40 mm, aspect kept (2:1), centred", p[1].drawings.length === 1 && Math.abs(p[1].drawings[0].w - 40) < 0.6 && Math.abs(p[1].drawings[0].h - 20) < 0.6 && p[1].jc === "center", JSON.stringify(p[1]));
  ok("insert_break: page break paragraph", p.some(b => b.hasPageBreak), "");
  ok("set_header_footer: footer page field, header text", a.secs[0].footerHasPage && a.secs[0].header === "Sortie scolaire", JSON.stringify(a.secs[0]));
  ok("add_comment: on the found text", a.comments.length === 1 && /car/.test(a.comments[0].quote), JSON.stringify(a.comments));
  ok("set_page_setup: landscape", a.secs.every(s => s.w > s.h), "");
  ok("insert_image: non-http URL / empty page setup rejected", r.out[12].error.field === "url" && r.out[13].ok === false, "");
  ok("layout action: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("r-explain-image-jump", async (frame) => {
  const r = await action(frame, [["explain_layout", { block: 10 }]]);
  const e = r.out[0];
  ok("explain_layout: picture on page 2, too tall for the space left on page 1", e.ok && e.page === 2 && e.previous_block_page === 1 && e.drawings[0].h > e.space_left_after_previous_block_mm, JSON.stringify(e).slice(0, 300));
});

await withDoc("two-columns", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [["insert_break", { after: 6, kind: "section_continuous" }], ["insert_break", { after: 1, kind: "section_next_page" }]]);
  const a = await snapshot(frame);
  ok("insert_break: section breaks", r.out.every(x => x.ok) && a.sections === 3, a.sections);
  ok("section breaks: one undo restores", sameStructure(await undo(frame, page), before), "");
});

await withDoc("e-add-header-row", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [
    ["table_add_header_row", { table: 1, titles: ["Title", "Author", "Borrower"] }],
    ["apply_style", { blocks: [0, 2], style: "Heading 2" }],
    ["modify_style", { style: "Normal", font: "Arial", size_pt: 12, color: "#1F3864" }],
    ["table_add_header_row", { table: 1, titles: ["A", "B"] }],
    ["modify_style", { style: "No Such Style" }]
  ]);
  const a = await snapshot(frame), t = a.final.find(b => b.type === "table"), p = P(a);
  ok("table_add_header_row: bold repeated header row with the titles", t.header && t.firstRowBold && t.cells[0].join("|") === "Title|Author|Borrower" && t.cells.length === 4, JSON.stringify(t.cells[0]));
  ok("apply_style with `blocks`: only the listed blocks", p[0].style === "Heading 2" && p[p.length - 1].style === "Heading 2", p.map(b => b.style).join(","));
  ok("modify_style: Normal follows (font, size, colour)", t && r.out[2].ok, JSON.stringify(r.out[2]));
  ok("table_add_header_row / modify_style errors are structured", r.out[3].error.field === "titles" && r.out[4].ok === false, "");
  ok("header row action: one undo restores (report included)", sameStructure(await undo(frame, page), before), "");
  const v = await frame.evaluate(async () => { const ctx = await __ts.init(); const a = __ts.normalize("format_text", { block: 2, bold: true }); return [a, __ts.validate("format_text", a, ctx)]; });
  ok("normalize: `block` accepted for a from/to tool", v[0].from === 2 && v[0].to === 2 && v[1] === null, JSON.stringify(v));
});

await withDoc("g-a4-to-2xa5", async (frame, page) => {
  const before = await snapshot(frame);
  const r = await action(frame, [["set_page_setup", { paper: "A5" }]]);
  const o = await frame.evaluate(async () => __ts.execute("find_overflowing_elements", {}, __ctx));
  ok("set_page_setup: what no longer fits is shrunk at once", r.out[0].ok && r.out[0].fitted.length >= 2 && o.count === 0, JSON.stringify(o));
  ok("page setup action: one undo restores", sameStructure(await undo(frame, page), before), "");
});

// Plan and argument guards (docs/ai.md §6.6): structured refusals of the known small-model slips
await withDoc("cleanup", async (frame) => {
  const v = await frame.evaluate(async () => {
    const ctx = await __ts.init(); window.__ctx = ctx;
    const oc = await __ts.execute("get_outline_candidates", {}, ctx);
    return {
      body: ctx.body, oc,
      range: __ts.validate("apply_styles", { changes: [{ from: 5, to: 6, style: "Heading 2" }] }, ctx),
      single: __ts.validate("apply_styles", { changes: [{ from: 5, to: 5, style: "Heading 2" }, { from: 6, to: 6, style: "Normal" }] }, ctx)
    };
  });
  ok("init: body text blocks of the scope", JSON.stringify(v.body) === "[3,6,8,10,12]", JSON.stringify(v.body));
  ok("get_outline_candidates: body text in a heading style is reported apart, not a candidate",
    (v.oc.body_text_in_heading_style || []).some(b => b.block === 6) && !v.oc.candidates.some(c => c.block === 6), JSON.stringify(v.oc.body_text_in_heading_style));
  ok("apply_styles: a heading style over body text is refused", v.range && v.range.error.code === "invalid_argument" && JSON.stringify(v.range.error.body_blocks) === "[6]", JSON.stringify(v.range));
  ok("apply_styles: title lines only pass", v.single === null, JSON.stringify(v.single));
});

await withDoc("list-to-table", async (frame) => {
  await selectBlocks(frame, 2, 6);
  const r = await action(frame, [["list_to_table", { from: 2, to: 6, header: ["Nom", "Groupe", "Salle"] }], ["table_add_header_row", { table: 2, titles: ["Nom", "Groupe", "Salle"] }]]);
  ok("table_add_header_row: refused on a table that already has a header row", r.out[1].ok === false && r.out[1].error.code === "already_has_header", JSON.stringify(r.out[1]));
  const p = await frame.evaluate(async () => __ts.execute("submit_plan", { goal: "g", steps: [{ tool: "list_to_table", purpose: "a" }, { tool: "table_add_header_row", purpose: "b" }] }, await __ts.init()));
  ok("submit_plan: list_to_table + table_add_header_row refused", p.ok === false && p.error.code === "invalid_plan", JSON.stringify(p));
});

await withDoc("r-brand", async (frame) => {
  const v = await frame.evaluate(async () => {
    const ctx = await __ts.init();
    await __ts.begin(ctx);
    await __ts.execute("modify_style", { style: "Heading 1", font: "Arial", color: "#1F3864" }, ctx);
    await __ts.execute("modify_style", { style: "Normal", font: "Calibri", size_pt: 11 }, ctx);
    const out = [__ts.validate("format_text", { from: 0, to: 8, font: "Calibri" }, ctx), __ts.validate("format_text", { from: 2, to: 2, font: "Calibri" }, ctx)];
    await __ts.end(ctx, false);
    return out;
  });
  ok("format_text: refused when it contradicts a style changed in the action", v[0] && v[0].ok === false && /Heading 1/.test(JSON.stringify(v[0].error.blocks)), JSON.stringify(v[0]));
  ok("format_text: consistent with the style passes", v[1] === null, JSON.stringify(v[1]));
});

for (const c of checks) console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass || !c.detail ? "" : "  -> " + c.detail));
const failed = checks.filter(c => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
