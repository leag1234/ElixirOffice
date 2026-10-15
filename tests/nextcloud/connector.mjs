// Mode B, "from ElixirOffice": the start page connects to a Nextcloud server with Login Flow v2
// and works on the user's files there (browse, recent, open, save with ETag check, conflict copy,
// new document, upload), with the real identity in the editor; then disconnects (app password
// deleted on the server). Also checks the local profile identity and the session store on disk.
//   NC_LOGIN_URL  Nextcloud address typed in the connect dialog; it must be reachable both from
//                 the browser and from the document server container (default http://172.17.0.1:8191)
//   EO_CONTAINER  document server container, for the on-disk checks (default eo-nc)
// Usage: node tests/nextcloud/connector.mjs
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import * as L from "./lib.mjs";

const SERVER = process.env.NC_LOGIN_URL || "http://172.17.0.1:8191";
const CONTAINER = process.env.EO_CONTAINER || "eo-nc";
const NC_CONTAINER = process.env.NC_CONTAINER || "elixir-nextcloud";
const CORPUS = os.homedir() + "/elixiroffice/elixiroffice/corpus/provisional/";
const res = [], errors = [];
const ok = (what, v, detail) => res.push([what, !!v, detail]);
const stamp = Date.now().toString(36);
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" });

// connect through the start page: the password is typed on the Nextcloud page only
async function connect(ctx, page, user) {
  await page.goto(L.EO + "/example/?lang=en", { waitUntil: "load" });
  if (await page.evaluate(() => document.getElementById("profile-dialog").open)) await page.click("#profile-skip");
  await page.click("#connect-card [data-connect]");
  await page.fill("#connect-server", SERVER);
  const [popup] = await Promise.all([ctx.waitForEvent("page"), page.click("#connect-submit")]);
  await popup.waitForURL(/login\/v2\/flow/, { timeout: 30000 });
  await popup.getByRole("button", { name: /log in/i }).first().click();
  await popup.waitForSelector("input[name=user]", { timeout: 30000 });
  await popup.fill("input[name=user]", user);
  await popup.fill("input[name=password]", L.password(user));
  await popup.press("input[name=password]", "Enter");
  await popup.getByRole("button", { name: /grant access/i }).click({ timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById("connect-card") || document.getElementById("connect-card").hidden, null, { timeout: 60000 });
  await page.waitForLoadState("load");
}
async function openTab(ctx, action) {
  const [tab] = await Promise.all([ctx.waitForEvent("page"), action()]);
  await tab.waitForLoadState("domcontentloaded");
  return tab;
}
const authors = (f) => f.evaluate(() => {
  const d = Asc.editor.WordControl.m_oLogicDocument, rev = [];
  d.Content.forEach(p => (p.Content || []).forEach(r => { if (r.GetReviewType && r.GetReviewType() !== 0) rev.push(r.GetReviewInfo().GetUserName()); }));
  return { comments: Object.values(d.Comments.GetAllComments()).map(c => c.Data.m_sUserName), revisions: rev };
});
async function commentAndTrack(page, f, text) {
  await f.evaluate(() => Asc.editor.WordControl.m_oLogicDocument.SelectAll());
  await page.keyboard.press("Control+Alt+m");
  await page.waitForTimeout(1200);
  await page.keyboard.type(text);
  await f.evaluate(() => { const b = Array.from(document.querySelectorAll(".btn-inner-edit")).find(x => x.offsetParent); b && b.click(); });
  await page.waitForTimeout(800);
  await f.evaluate(() => DE.getController("Main").api.asc_SetTrackRevisions(true));
  await L.typeAtStart(page, f, "Tracked " + text + " ");
  await page.waitForTimeout(800);
  await f.evaluate(() => DE.getController("Main").api.asc_SetTrackRevisions(false));
}
const ctrlS = async (page, f) => {
  await f.evaluate(() => { const ta = document.getElementById("area_id"); ta && ta.focus(); });
  await page.keyboard.press("Control+s");
};

const browser = await L.chromium.launch();
try {
  // ---- local profile (no storage connected)
  {
    const { ctx, page } = await L.newPage(browser, errors, "local");
    await page.goto(L.EO + "/example/?lang=en", { waitUntil: "load" });
    ok("first use asks for a display name", await page.evaluate(() => document.getElementById("profile-dialog").open));
    await page.fill("#profile-name", "Claire Locale");
    await Promise.all([page.waitForNavigation(), page.click("#profile-form .btn-primary")]);
    ok("avatar shows the initials", (await page.textContent("#account-btn .avatar")).trim() === "CL");
    ok("not connected: the connect card is shown", await page.isVisible("#connect-card"));
    await page.click("#account-btn");
    ok("account menu: name and Connect", (await page.textContent("#acct-name")).trim() === "Claire Locale" && await page.isVisible("#account-panel [data-connect]"));
    ok("account menu: no test-user switcher outside developer mode", (await page.locator("[data-test-user]").count()) === 0);
    await Promise.all([page.waitForNavigation(), page.click("#acct-dev")]);
    await page.click("#account-btn");
    ok("developer mode: test-user switcher", (await page.locator("[data-test-user]").count()) >= 3);
    ok("developer mode: no 'This server' rail entry while not connected (the server is already the default)", !(await page.isVisible('.rail-item[data-view="local"]')));
    await page.keyboard.press("Escape");
    const tab = await openTab(ctx, () => page.click('#tiles .tile-blank[data-type="word"]'));
    const f = await L.editorFrame(tab);
    await f.click(".elx-account-btn");
    const acct = await f.evaluate(() => { const el = document.querySelector(".elx-accflyout"); return el && el.offsetParent !== null ? el.innerText : ""; });
    ok("editor account menu: name, Connect, Change name, test users", /Claire Locale/.test(acct) && /Connect (Murena Workspace \/ )?Nextcloud/.test(acct) && /Change name/.test(acct) && /John Smith/.test(acct), acct.replace(/\s+/g, " "));
    await tab.keyboard.press("Escape");
    const user = await f.evaluate(() => DE.getController("Main").appOptions.user);
    ok("editor user = local profile", user.fullname === "Claire Locale" && /^local-/.test(user.id), JSON.stringify(user));
    await commentAndTrack(tab, f, "local");
    const a = await authors(f);
    ok("comment author = profile name", a.comments.length > 0 && a.comments.every(n => n === "Claire Locale"), JSON.stringify(a.comments));
    ok("tracked change author = profile name", a.revisions.length > 0 && a.revisions.every(n => n === "Claire Locale"), JSON.stringify(a.revisions));
    await ctx.close();
  }

  // ---- connect alice
  const file = `/elixir-b-${stamp}.docx`;
  ok("seed a file in alice's Nextcloud", (await L.dav("alice", "PUT", file, fs.readFileSync(CORPUS + "teachers/t01-fiche-fractions-cm1.docx"))).status === 201);
  const A = await L.newPage(browser, errors, "alice");
  A.page.on("console", m => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push("alice console: " + m.text().slice(0, 200)); });
  await connect(A.ctx, A.page, "alice");
  ok("connected: account shows the Nextcloud user", (await A.page.getAttribute("#account-btn", "title")) === "Alice Martin");
  const cookies = await A.ctx.cookies();
  const sid = cookies.find(c => c.name === "elx_sid");
  ok("session cookie is HttpOnly and SameSite=Lax", sid && sid.httpOnly && sid.sameSite === "Lax");
  ok("no app password in the page", !(await A.page.content()).match(/appPassword|loginName/));

  // recent files
  await A.page.waitForSelector(`#files-body .file-link:has-text("elixir-b-${stamp}")`, { timeout: 30000 });
  ok("recent: the Nextcloud file is listed", true);

  // browse
  await A.page.click('.rail-item[data-view="cloud"]');
  await A.page.waitForSelector('#files-body tr .t-folder', { timeout: 30000 });
  const folders = await A.page.$$eval("#files-body tr", rows => rows.filter(r => r.querySelector(".t-folder")).map(r => r.querySelector(".file-base").textContent));
  ok("browse: folders of the Nextcloud root", folders.includes("Documents"), folders.join(", "));
  await A.page.click('#files-body tr:has(.file-base:text-is("Documents")) .file-link');
  await A.page.waitForSelector('#crumbs [aria-current="location"]:text-is("Documents")', { timeout: 30000 });
  ok("browse: open a folder (breadcrumb)", true);

  // new document in the current folder
  const newTab = await openTab(A.ctx, async () => { await A.page.click("#new-button"); await A.page.click('#new-menu [data-new="docx"]'); });
  const fn = await L.editorFrame(newTab);
  const newTitle = await fn.evaluate(() => DE.getController("Main").document.title);
  ok("new document created in the folder", /^Document( \(\d+\))?\.docx$/.test(newTitle) && (await L.dav("alice", "PROPFIND", "/Documents/" + newTitle, undefined, { Depth: "0" })).status === 207, newTitle);
  await newTab.close();

  // upload into the current folder
  const upTab = await openTab(A.ctx, () => A.page.setInputFiles("#file-input", CORPUS + "smallorg/s07-rapport-activite-2025.docx"));
  await L.editorFrame(upTab);
  ok("upload goes to the current Nextcloud folder", (await L.dav("alice", "PROPFIND", "/Documents/s07-rapport-activite-2025.docx", undefined, { Depth: "0" })).status === 207);
  await upTab.close();

  // open, identity, edit, Ctrl+S (forcesave with If-Match), close (final save), reopen
  await A.page.goto(L.EO + "/example/?lang=en#home", { waitUntil: "load" });
  const edTab = await openTab(A.ctx, () => A.page.click(`#files-body .file-link:has-text("elixir-b-${stamp}")`));
  let f = await L.editorFrame(edTab);
  const user = await f.evaluate(() => DE.getController("Main").appOptions.user);
  ok("editor user = Nextcloud user", user.fullname === "Alice Martin" && /^nc-/.test(user.id), JSON.stringify(user));
  ok("editor avatar = Nextcloud avatar (served by ElixirOffice)", /\/elixir\/avatar\/[0-9a-f]{32}$/.test(user.image || ""), user.image);
  // account menu on the editor's avatar
  await f.click(".elx-account-btn");
  const acct = await f.evaluate(() => { const el = document.querySelector(".elx-accflyout"); return el && el.offsetParent !== null ? el.innerText : ""; });
  ok("editor account menu: name, server, Disconnect", /Alice Martin/.test(acct) && /172\.17\.0\.1:8191/.test(acct) && /Disconnect/.test(acct), acct.replace(/\s+/g, " "));
  await edTab.keyboard.press("Escape");
  await commentAndTrack(edTab, f, "nc");
  const a = await authors(f);
  ok("comment author = Nextcloud name", a.comments.length > 0 && a.comments.every(n => n === "Alice Martin"), JSON.stringify(a.comments));
  ok("tracked change author = Nextcloud name", a.revisions.length > 0 && a.revisions.every(n => n === "Alice Martin"), JSON.stringify(a.revisions));
  const e0 = (await L.fileId("alice", file)).etag;
  await L.typeAtStart(edTab, f, `SAVE1-${stamp} `);
  await ctrlS(edTab, f);
  ok("Ctrl+S saves to Nextcloud", await L.waitFor(async () => (await L.davText("alice", file)).includes(`SAVE1-${stamp}`), 60000));
  ok("Nextcloud ETag changed", (await L.fileId("alice", file)).etag !== e0);
  await L.typeAtStart(edTab, f, `SAVE2-${stamp} `);
  await edTab.waitForTimeout(2500); // let the editor send the last keystrokes (a closing tab would otherwise ask first)
  await edTab.close();
  ok("closing the editor saves to Nextcloud", await L.waitFor(async () => (await L.davText("alice", file)).includes(`SAVE2-${stamp}`), 90000));
  const reTab = await openTab(A.ctx, () => A.page.click(`#files-body .file-link:has-text("elixir-b-${stamp}")`));
  f = await L.editorFrame(reTab);
  const t2 = await L.docText(f);
  ok("reopen shows both edits", t2.includes(`SAVE1-${stamp}`) && t2.includes(`SAVE2-${stamp}`));

  // conflict: the file changes in Nextcloud while it is open here
  await L.dav("alice", "PUT", file, fs.readFileSync(CORPUS + "teachers/t01-fiche-fractions-cm1.docx"));
  await L.typeAtStart(reTab, f, `MINE-${stamp} `);
  await ctrlS(reTab, f);
  const conflictName = file.replace(/\.docx$/, " (conflict).docx");
  ok("conflict: edit saved as \"name (conflict).docx\"", await L.waitFor(async () => (await L.davText("alice", conflictName)).includes(`MINE-${stamp}`), 60000));
  ok("conflict: the other version is kept", !(await L.davText("alice", file)).includes(`MINE-${stamp}`));
  await reTab.close();
  await A.page.bringToFront();
  await A.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const toast = await L.waitFor(async () => { const t = await A.page.textContent("#toast-text"); return /conflict/.test(t || "") ? t : null; }, 20000);
  ok("conflict: the user is told on the start page", !!toast, toast);

  // co-editing between two connected users
  ok("share the file with bob", (await L.share("alice", file, "bob")).ocs.meta.statuscode === 200);
  const B = await L.newPage(browser, errors, "bob");
  await connect(B.ctx, B.page, "bob");
  ok("bob connected", (await B.page.getAttribute("#account-btn", "title")) === "Bob Durand");
  const aTab = await openTab(A.ctx, () => A.page.evaluate(p => window.open("elixir/nc/open?path=" + encodeURIComponent(p), "_blank"), file));
  const bTab = await openTab(B.ctx, () => B.page.evaluate(p => window.open("elixir/nc/open?path=" + encodeURIComponent(p), "_blank"), file));
  const fa = await L.editorFrame(aTab), fb = await L.editorFrame(bTab);
  const both = await L.waitFor(async () => {
    const x = await L.coUsers(fa), y = await L.coUsers(fb);
    return x.includes("Bob Durand") && y.includes("Alice Martin") ? { alice: x, bob: y } : null;
  }, 30000);
  ok("co-editing: each user sees the other's name", !!both, JSON.stringify(both || [await L.coUsers(fa), await L.coUsers(fb)]));
  await L.typeAtStart(bTab, fb, `BOB-${stamp} `);
  ok("co-editing: alice sees bob's typing", await L.waitFor(async () => (await L.docText(fa)).includes(`BOB-${stamp}`), 30000));
  await commentAndTrack(bTab, fb, "bob");
  const seenByAlice = await L.waitFor(async () => { const x = await authors(fa); return x.comments.includes("Bob Durand") ? x : null; }, 30000);
  ok("co-editing: bob's comment shows his name to alice", !!seenByAlice, JSON.stringify(seenByAlice));
  await bTab.waitForTimeout(2500);
  await aTab.close();
  await bTab.close();
  ok("co-edited version saved to Nextcloud", await L.waitFor(async () => (await L.davText("alice", file)).includes(`BOB-${stamp}`), 90000));

  // session store on disk: encrypted, 600, no credential in clear
  try {
    const listing = docker("exec", CONTAINER, "sh", "-c", "d=$(find / -path /proc -prune -o -type d -name sessions -path '*elixir*' -print 2>/dev/null | head -1); stat -c '%a %n' $d $d/*.bin $(dirname $d)/secret.key | head -5; cat $d/*.bin | grep -c -a -e alice -e bob || true");
    const lines = listing.trim().split("\n");
    const modes = lines.slice(0, -1).map(l => l.split(" ")[0]);
    ok("session files 600, folder 700, key 600", modes.length >= 3 && modes[0] === "700" && modes.slice(1).every(m => m === "600"), modes.join(","));
    ok("session files hold no clear-text user data", lines[lines.length - 1] === "0", "matches: " + lines[lines.length - 1]);
  } catch (e) {
    ok("session store checks", false, String(e).slice(0, 200));
  }

  // disconnect: app password deleted on the Nextcloud side
  const tokensBefore = docker("exec", "-u", "www-data", NC_CONTAINER, "php", "occ", "user:auth-tokens:list", "--output=json", "bob");
  await B.page.click("#account-btn");
  await Promise.all([B.page.waitForNavigation(), B.page.click("#acct-disconnect")]);
  ok("disconnect: connect card back", await B.page.isVisible("#connect-card"));
  const tokensAfter = docker("exec", "-u", "www-data", NC_CONTAINER, "php", "occ", "user:auth-tokens:list", "--output=json", "bob");
  const count = (s) => (JSON.parse(s) || []).filter(t => /ElixirOffice/.test(t.name || "")).length;
  ok("disconnect: the app password is deleted on the server", count(tokensBefore) >= 1 && count(tokensAfter) === count(tokensBefore) - 1, `${count(tokensBefore)} -> ${count(tokensAfter)}`);
} catch (e) {
  ok("run", false, String((e && e.stack) || e).slice(0, 600));
} finally {
  await browser.close();
}
process.exit(L.report(res, errors) ? 1 : 0);
