// SPDX-License-Identifier: AGPL-3.0-only
// Regression: creating and opening documents never needs a cloud connection (docs/storage.md).
// Fresh profile, no Nextcloud: blank document, template, upload, open recent, dismissible connect
// banner, zero console errors. Then connected to the local Nextcloud demo: the location choice
// ("This server" / the cloud) appears and both targets work; disconnect returns to server-only.
//   EO_BASE       ElixirOffice instance (default http://localhost:8190)
//   NC_LOGIN_URL  Nextcloud address typed in the connect dialog (default http://172.17.0.1:8191)
// Usage: node tests/nextcloud/home.mjs
import fs from "node:fs";
import os from "node:os";
import * as L from "./lib.mjs";

const SERVER = process.env.NC_LOGIN_URL || "http://172.17.0.1:8191";
const CORPUS = os.homedir() + "/elixiroffice/elixiroffice/corpus/provisional/";
const DOCX = CORPUS + "teachers/t01-fiche-fractions-cm1.docx";
const res = [], errors = [];
const ok = (what, v, detail) => res.push([what, !!v, detail]);
const stamp = Date.now().toString(36);

async function homePage(browser, name) {
  const { ctx, page } = await L.newPage(browser, errors, name);
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(name + " console: " + m.text().slice(0, 200)); });
  return { ctx, page };
}
async function openTab(ctx, action) {
  const [tab] = await Promise.all([ctx.waitForEvent("page"), action()]);
  tab.on("pageerror", e => errors.push("editor pageerror: " + String(e).slice(0, 300)));
  await tab.waitForLoadState("domcontentloaded");
  return tab;
}
const title = (f) => f.evaluate(() => DE.getController("Main").document.title);
const noConnectDialog = (page) => page.evaluate(() => !document.getElementById("connect-dialog").open);
const serverFiles = (page) => page.evaluate(() => fetch("elixir/api/files").then(r => r.json()).then(j => j.files.map(f => f.name)));

async function connect(ctx, page, user) {
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

const browser = await L.chromium.launch();
const cleanup = [];
try {
  // ---------- not connected, fresh profile ----------
  {
    const { ctx, page } = await homePage(browser, "fresh");
    await page.goto(L.EO + "/example/?lang=en", { waitUntil: "load" });
    ok("first use: name dialog is shown", await page.evaluate(() => document.getElementById("profile-dialog").open));
    await Promise.all([page.waitForNavigation(), page.click("#profile-skip")]);
    ok("not connected: connect banner shown", await page.isVisible("#connect-card"));
    ok("not connected: banner has a dismiss button, no location choice", await page.isVisible("#connect-dismiss") && !(await page.isVisible("#loc-pick")));
    ok("not connected: no cloud dialog on load", await noConnectDialog(page));

    // blank document
    let tab = await openTab(ctx, () => page.click('#tiles .tile-blank[data-type="word"]'));
    let f = await L.editorFrame(tab);
    const blank = await title(f);
    ok("blank document opens without a connection", /\.docx$/.test(blank) && !/elixir\/nc/.test(tab.url()), blank + " " + tab.url());
    ok("blank document: no connect dialog on the start page", await noConnectDialog(page));
    await tab.close();
    ok("blank document is stored on this server", (await serverFiles(page)).includes(blank));

    // template
    await page.goto(L.EO + "/example/?lang=en#new", { waitUntil: "load" });
    const tpl = page.locator("#tiles .tile-template:visible").first();
    tab = await openTab(ctx, () => tpl.click());
    f = await L.editorFrame(tab);
    ok("template opens without a connection", /\.docx$/.test(await title(f)), await title(f));
    await tab.close();
    ok("template: no connect dialog", await noConnectDialog(page));

    // upload via the Open view
    await page.goto(L.EO + "/example/?lang=en#open", { waitUntil: "load" });
    ok("Open view: drop zone visible, banner not in the way", await page.isVisible("#dropzone") && !(await page.isVisible("#connect-card")));
    tab = await openTab(ctx, () => page.setInputFiles("#file-input", DOCX));
    f = await L.editorFrame(tab);
    const up = await title(f);
    ok("uploaded .docx opens without a connection", /fractions/.test(up) && (await L.docText(f)).length > 20, up);
    await tab.close();
    ok("upload is stored on this server", (await serverFiles(page)).includes(up));

    // open recent
    await page.goto(L.EO + "/example/?lang=en#home", { waitUntil: "load" });
    await page.waitForSelector("#files-body .file-link", { timeout: 20000 });
    ok("recent list shows the documents of this server", (await page.locator("#files-body .file-link").count()) >= 3);
    tab = await openTab(ctx, () => page.click(`#files-body .file-link:has-text("fractions")`));
    f = await L.editorFrame(tab);
    ok("open from recent works", /fractions/.test(await title(f)));
    await tab.close();
    ok("no rail entry for the server view, no cloud dialog", !(await page.isVisible('.rail-item[data-view="local"]')) && await noConnectDialog(page));

    // dismiss the banner: stays dismissed, never blocks
    await page.click("#connect-dismiss");
    ok("banner dismisses", !(await page.isVisible("#connect-card")));
    await page.reload({ waitUntil: "load" });
    ok("dismissal persists", !(await page.isVisible("#connect-card")));
    await page.click("#account-btn");
    ok("account menu still offers Connect", await page.isVisible("#account-panel [data-connect]"));
    ok("no developer-only storage wording, no test-user switcher", (await page.locator("[data-test-user]").count()) === 0 && !/test (files|storage)/i.test(await page.content()));
    await ctx.close();
  }

  // ---------- connected: location choice ----------
  {
    const A = await homePage(browser, "alice");
    const { ctx, page } = A;
    await page.goto(L.EO + "/example/?lang=en", { waitUntil: "load" });
    await Promise.all([page.waitForNavigation(), page.click("#profile-skip")]);
    await connect(ctx, page, "alice");
    ok("connected: location choice visible, cloud is the default", await page.isVisible("#loc-pick") && (await page.getAttribute('#loc-pick [data-loc="nc"]', "aria-checked")) === "true");
    ok("connected: rail has the cloud and This server", await page.isVisible('.rail-item[data-view="cloud"]') && /This server/.test(await page.textContent('.rail-item[data-view="local"]')));
    ok("connected: banner gone", !(await page.isVisible("#connect-card")));

    // default: the cloud
    let tab = await openTab(ctx, () => page.click('#tiles .tile-blank[data-type="word"]'));
    let f = await L.editorFrame(tab);
    const inCloud = await title(f);
    const dav = (await L.dav("alice", "PROPFIND", "/" + inCloud, undefined, { Depth: "0" })).status;
    ok("connected: New defaults to the cloud", dav === 207, inCloud + " dav " + dav);
    if (dav === 207) cleanup.push("/" + inCloud);
    await tab.close();

    // This server
    await page.click('#loc-pick [data-loc="local"]');
    tab = await openTab(ctx, () => page.click('#tiles .tile-blank[data-type="word"]'));
    f = await L.editorFrame(tab);
    const onServer = await title(f);
    ok("connected: New on This server works", /\.docx$/.test(onServer) && (await L.dav("alice", "PROPFIND", "/" + onServer, undefined, { Depth: "0" })).status === 404, onServer);
    await tab.close();
    ok("This server document is stored on the server", (await serverFiles(page)).includes(onServer));
    await page.reload({ waitUntil: "load" });
    ok("the choice is remembered", (await page.getAttribute('#loc-pick [data-loc="local"]', "aria-checked")) === "true");

    // upload to this server
    await page.goto(L.EO + "/example/?lang=en#open", { waitUntil: "load" });
    tab = await openTab(ctx, () => page.setInputFiles("#file-input", DOCX));
    f = await L.editorFrame(tab);
    const upName = await title(f);
    ok("connected: upload to This server", (await serverFiles(page)).includes(upName) && (await L.dav("alice", "PROPFIND", "/" + upName, undefined, { Depth: "0" })).status === 404, upName);
    await tab.close();

    // browse This server, and the cloud
    await page.click('.rail-item[data-view="local"]');
    await page.waitForSelector("#files-body .file-link", { timeout: 20000 });
    ok("This server view lists the server documents", (await page.locator("#files-body .file-link").count()) >= 2 && await page.locator(`#files-body .file-link:has-text("${upName.replace(/\.docx$/, "")}")`).count() > 0);
    await page.click('.rail-item[data-view="cloud"]');
    await page.waitForSelector("#files-body tr .t-folder", { timeout: 30000 });
    ok("cloud view still browses Nextcloud", (await page.locator("#crumbs").isVisible()) && !(await page.locator("#loc-pick").isVisible()), "crumbs " + await page.locator("#crumbs").isVisible() + " loc " + await page.locator("#loc-pick").isVisible());

    // disconnect
    await page.goto(L.EO + "/example/?lang=en#home", { waitUntil: "load" });
    await page.click("#account-btn");
    await Promise.all([page.waitForNavigation(), page.click("#acct-disconnect")]);
    ok("disconnect: server-only again (no location choice, no server rail entry)", !(await page.isVisible("#loc-pick")) && !(await page.isVisible('.rail-item[data-view="local"]')));
    await page.waitForSelector("#files-body .file-link", { timeout: 20000 });
    ok("disconnect: documents of this server still listed", (await page.locator("#files-body .file-link").count()) >= 3);
    tab = await openTab(ctx, () => page.click('#tiles .tile-blank[data-type="word"]'));
    await L.editorFrame(tab);
    ok("disconnect: New works without the cloud", await noConnectDialog(page));
    await tab.close();
    await ctx.close();
  }
} catch (e) {
  ok("run", false, String((e && e.stack) || e).slice(0, 600));
} finally {
  for (const p of cleanup) { try { await L.dav("alice", "DELETE", p); } catch (e) { /* ignore */ } }
  await browser.close();
}
process.exit(L.report(res, errors) ? 1 : 0);
