// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../desktop/renderer.js"), "utf8");
const start = source.indexOf("function plainTextLanguage("), end = source.indexOf("\n}\n", start) + 2;

function run(language, current) {
 const lang = {Val: current}, calls = [];
 const doc = {GetStyles: () => ({Default: {TextPr: {Lang: lang}}}), RestartSpellCheck: () => calls.push("spell")};
 const frame = {Common: {util: {LanguageInfo: {getDefaultLanguageCode: l => ({fr: 1036, ja: 1041, en: 1033})[l]}}}};
 const fn = vm.runInNewContext("(" + source.slice(start, end) + ")", {info: {language}});
 return {ok: fn(frame, {api: {WordControl: {m_oLogicDocument: doc}}}), lang, calls};
}

test("Markdown and text documents are proofed in the interface language", () => {
 const r = run("fr", 1033);
 assert.equal(r.ok, true); assert.equal(r.lang.Val, 1036); assert.deepEqual(r.calls, ["spell"]);
 assert.equal(run("ja", 1033).lang.Val, 1041);
});
test("nothing changes when the language already matches or is unknown", () => {
 assert.deepEqual(run("en", 1033).calls, []);
 assert.equal(run("xx", 1033).lang.Val, 1033);
});
test("only Markdown and plain text opened in the document editor get it", () => {
 assert.match(source, /if\(kind==='word'&&\['md','markdown','txt'\]\.includes\(file\.sourceFormat\)\)plainTextLanguage\(frame,main\);/);
});
