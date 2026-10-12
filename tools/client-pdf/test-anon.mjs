// SPDX-License-Identifier: AGPL-3.0-only
// Private corpus, bench side (docs/client-pdf.md): no file name in bench output, forced error included.
// Run: node --test tools/client-pdf/test-anon.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { anonId, makeScrubber } from "./anon.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARKER = "ZZPRIVMARK";
const REL = `${MARKER}-fiche-maths.docx`;

test("anonId matches the Python and shell vector", () => {
  assert.equal(anonId("a/Fiche maths.docx"), "doc-c97d1be596");
  assert.equal(anonId("a\\b.docx"), anonId("a/b.docx"));
});

test("makeScrubber removes plain, base, stem and URL-encoded forms", () => {
  const scrub = makeScrubber([`sub/${REL}`]);
  const text = `x sub/${REL} ${REL} ${encodeURIComponent(REL)} ${MARKER}-fiche-maths`;
  const out = scrub(text);
  assert.ok(!out.includes(MARKER), out);
  assert.ok(out.includes(anonId(`sub/${REL}`)));
});

test("bench in private mode leaks no file name, even on a forced error", (t) => {
  const pw = process.env.PW_MODULE || path.join(os.homedir(), "elixiroffice/pw/node_modules/playwright/index.mjs");
  if (!fs.existsSync(pw)) { t.skip("playwright not installed; PW_MODULE unset"); return; }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-private-"));  // "corpus-private" marks the corpus private
  const corpus = path.join(root, "corpus");
  fs.mkdirSync(corpus);
  fs.writeFileSync(path.join(corpus, REL), "synthetic test document");
  const out = path.join(root, "bench");
  const r = spawnSync(process.execPath, [path.join(HERE, "bench.mjs"), out, corpus], {
    env: { ...process.env, EO_BASE: "http://127.0.0.1:9", PW_MODULE: pw }, encoding: "utf8", timeout: 240000,
  });
  const text = (r.stdout || "") + (r.stderr || "");
  assert.ok(!text.includes(MARKER), text);
  const leaked = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.name.includes(MARKER)) leaked.push(p);
    if (e.isDirectory()) walk(p);
    else if (!fs.readFileSync(p).includes(MARKER)) return;
    else leaked.push(p);
  });
  if (fs.existsSync(out)) walk(out);
  assert.deepEqual(leaked, []);
});
