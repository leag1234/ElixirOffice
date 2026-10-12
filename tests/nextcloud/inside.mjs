// SPDX-License-Identifier: AGPL-3.0-only
// Mode A, "inside Nextcloud": the ElixirOffice app for Nextcloud (fork of eurooffice-nextcloud)
// with an ElixirOffice document server. Upload a .docx to Nextcloud, open it from Files, edit,
// save (close), reopen and see the edit, then co-edit with a second user.
// Needs tools/nextcloud-app/setup.sh (users alice and bob). Usage: node tests/nextcloud/inside.mjs
import fs from "node:fs";
import os from "node:os";
import * as L from "./lib.mjs";

const CORPUS = process.env.CORPUS || os.homedir() + "/elixiroffice/elixiroffice/corpus/provisional/teachers/t01-fiche-fractions-cm1.docx";
const res = [], errors = [];
const ok = (what, v, detail) => res.push([what, !!v, detail]);
const stamp = Date.now().toString(36);
const file = `/elixir-inside-${stamp}.docx`;
const browser = await L.chromium.launch();
try {
  // 1. upload in Nextcloud
  const put = await L.dav("alice", "PUT", file, fs.readFileSync(CORPUS));
  ok("upload .docx to Nextcloud (WebDAV)", put.status === 201, "HTTP " + put.status);
  const { id } = await L.fileId("alice", file);

  // 2. open from Files: the default action is ElixirOffice
  const A = await L.newPage(browser, errors, "alice");
  await L.ncLogin(A.page, "alice");
  await A.page.goto(L.NC + "/index.php/apps/files/?dir=/", { waitUntil: "domcontentloaded" });
  const link = A.page.locator(`[data-cy-files-list-row-name="${file.slice(1)}"] [data-cy-files-list-row-name-link]`);
  await link.waitFor({ timeout: 60000 });
  const label = await link.getAttribute("title");
  ok("Files: default action is \"Open in ElixirOffice\"", /Open in ElixirOffice/.test(label || ""), label);
  const leaksFiles = await L.brandLeaks(A.page);
  ok("Files: no upstream brand visible", leaksFiles.length === 0, leaksFiles.join(" | "));
  await link.click();
  let f = await L.editorFrame(A.page);
  ok("opens in the ElixirOffice editor", !!f);
  const leaksEditor = await L.brandLeaks(f);
  ok("editor: no upstream brand visible", leaksEditor.length === 0, leaksEditor.join(" | "));
  const me = await f.evaluate(() => DE.getController("Main").appOptions.user.fullname);
  ok("editor user is the Nextcloud user", me === "Alice Martin", me);

  // 3. edit, close, wait for the save into Nextcloud
  const before = await L.fileId("alice", file);
  await L.typeAtStart(A.page, f, `ALICE-${stamp} `);
  await A.page.waitForTimeout(2500);
  await A.page.goto(L.NC + "/index.php/apps/files/?dir=/", { waitUntil: "domcontentloaded" });
  const saved = await L.waitFor(async () => (await L.fileId("alice", file)).etag !== before.etag, 90000);
  ok("closing the editor saves to Nextcloud (new ETag)", saved);
  ok("saved file contains the edit", (await L.davText("alice", file)).includes(`ALICE-${stamp}`));

  // 4. reopen: the edit is there
  await A.page.goto(L.NC + "/index.php/apps/elixiroffice/" + id, { waitUntil: "domcontentloaded" });
  f = await L.editorFrame(A.page);
  ok("reopen shows the edit", (await L.docText(f)).includes(`ALICE-${stamp}`));

  // 5. co-editing with bob
  const sh = await L.share("alice", file, "bob");
  ok("share with bob", sh && sh.ocs && sh.ocs.meta && sh.ocs.meta.statuscode === 200, sh && sh.ocs && sh.ocs.meta && sh.ocs.meta.message);
  const B = await L.newPage(browser, errors, "bob");
  await L.ncLogin(B.page, "bob");
  await B.page.goto(L.NC + "/index.php/apps/elixiroffice/" + id, { waitUntil: "domcontentloaded" });
  const fb = await L.editorFrame(B.page);
  const both = await L.waitFor(async () => {
    const a = await L.coUsers(f), b = await L.coUsers(fb);
    return a.includes("Bob Durand") && b.includes("Alice Martin") ? { a, b } : null;
  }, 30000);
  ok("co-editing: each sees the other by name", !!both, JSON.stringify(both || [await L.coUsers(f), await L.coUsers(fb)]));
  await L.typeAtStart(B.page, fb, `BOB-${stamp} `);
  const seen = await L.waitFor(async () => (await L.docText(f)).includes(`BOB-${stamp}`), 30000);
  ok("co-editing: alice sees bob's typing live", seen);
  await A.page.goto("about:blank");
  await B.page.goto("about:blank");
  const final = await L.waitFor(async () => {
    const t = await L.davText("alice", file);
    return t.includes(`BOB-${stamp}`) && t.includes(`ALICE-${stamp}`);
  }, 90000);
  ok("co-edited version saved to Nextcloud", final);
} catch (e) {
  ok("run", false, String((e && e.stack) || e).slice(0, 400));
} finally {
  await browser.close();
}
process.exit(L.report(res, errors) ? 1 : 0);
