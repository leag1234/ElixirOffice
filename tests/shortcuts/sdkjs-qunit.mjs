#!/usr/bin/env node
// Runs a QUnit page of sdkjs (default: the Word shortcut tests) in headless Chromium.
//   node tests/shortcuts/sdkjs-qunit.mjs <sdkjs dir> [tests/word/shortcuts/shortcuts.html]
// Generate develop/sdkjs/word/scripts.js first: node build/scripts/build-develop.cjs (in sdkjs).
import path from "node:path";
import { chromium } from "./lib.mjs";

const sdkjs = path.resolve(process.argv[2] || ".");
const page = process.argv[3] || "tests/word/shortcuts/shortcuts.html";
const browser = await chromium.launch();
const p = await (await browser.newContext()).newPage();
const failures = [];
await p.exposeFunction("__qunitLog", d => { if (!d.result) failures.push(d); });
await p.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    if (!window.QUnit) return;
    QUnit.log(d => window.__qunitLog({ result: d.result, module: d.module, name: d.name, message: d.message, actual: String(d.actual).slice(0, 200), expected: String(d.expected).slice(0, 200) }));
    QUnit.done(d => { window.__qunitDone = d; });
  });
});
await p.goto("file://" + path.join(sdkjs, page));
await p.waitForFunction(() => window.__qunitDone, null, { timeout: 180000 });
const done = await p.evaluate(() => window.__qunitDone);
for (const f of failures) console.log(`FAIL ${f.module} > ${f.name}: ${f.message || ""} (actual ${f.actual}, expected ${f.expected})`);
console.log(`${done.passed}/${done.total} assertions passed, ${done.failed} failed`);
await browser.close();
process.exit(done.failed ? 1 : 0);
