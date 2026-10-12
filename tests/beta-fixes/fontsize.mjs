#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Home > Font size box is filled at the start of a document (new, generated .docx; ribbon and mini toolbar).
//   EO_BASE=http://localhost:PORT node tests/beta-fixes/fontsize.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launch, openEditor, setDoc, select, caret, waitFrame, BASE } from "../shortcuts/lib.mjs";
import { upload } from "../images/lib.mjs";

let fails = 0;
const rec = (id, ok, why = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + id + (ok ? "" : "  " + why)); };
const ribbon = f => f.evaluate(() => DE.getController("Toolbar").toolbar.cmbFontSize.$el.find("input").val());
const miniSize = f => f.evaluate(() => $("#mini-toolbar .form-control").map((i, e) => e.value).get());

// a .docx written by another program: Calibri 11 in docDefaults, a run without properties
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-"));
const py = `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],"w")
z.writestr("[Content_Types].xml",'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
z.writestr("_rels/.rels",'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
z.writestr("word/_rels/document.xml.rels",'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
z.writestr("word/styles.xml",'<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>')
z.writestr("word/document.xml",'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>First paragraph of the generated file</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>')
z.close()`;
const gen = path.join(dir, "generated.docx");
execFileSync("python3", ["-c", py, gen]);

const { browser, page } = await launch({});
let frame = await openEditor(page);
await frame.waitForTimeout(800);
rec("new-doc.size-at-start", (await ribbon(frame)) === "11", `ribbon "${await ribbon(frame)}"`);
await setDoc(frame, ["Hello world", "Second paragraph"]);
await caret(frame, 0, 0); await frame.waitForTimeout(500);
rec("new-doc.caret-start", (await ribbon(frame)) === "11", `ribbon "${await ribbon(frame)}"`);
await select(frame, 0, 0, 5); await frame.waitForTimeout(500);
rec("new-doc.selection", (await ribbon(frame)) === "11", `ribbon "${await ribbon(frame)}"`);
await frame.evaluate(() => DE.getController("MiniToolbar").syncState());
await frame.waitForTimeout(300);
const m = await miniSize(frame);
rec("new-doc.mini-toolbar", m.includes("11"), JSON.stringify(m));
// other size, then back
await frame.evaluate(() => Asc.editor.put_TextPrFontSize(14)); await frame.waitForTimeout(400);
rec("size-14", (await ribbon(frame)) === "14", `ribbon "${await ribbon(frame)}"`);

const fname = await upload(gen, `fs-${process.pid}.docx`);
await page.goto(`${BASE}/example/editor?fileName=${encodeURIComponent(fname)}`, { waitUntil: "load" });
frame = await waitFrame(page);
await frame.waitForFunction(() => { try { return DE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 120000 });
await frame.waitForTimeout(1500);
rec("generated.size-at-start", (await ribbon(frame)) === "11", `ribbon "${await ribbon(frame)}"`);
await caret(frame, 1, 2); await frame.waitForTimeout(500);
rec("generated.second-paragraph", (await ribbon(frame)) === "11", `ribbon "${await ribbon(frame)}"`);
await caret(frame, 0, 0); await frame.waitForTimeout(500);
rec("generated.back-to-start", (await ribbon(frame)) === "11", `ribbon "${await ribbon(frame)}"`);
await browser.close();
process.exit(fails ? 1 : 0);
