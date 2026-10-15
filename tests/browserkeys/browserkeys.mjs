#!/usr/bin/env node
// Browser-reserved keys (docs/shortcuts.md, "Browser-reserved keys"): Keyboard Lock request, install manifest, full screen,
// the one-time hint, the help dialog, the unsaved-changes guard, and the alternatives of the three editors.
//
//   EO_BASE=http://localhost:8115 node tests/browserkeys/browserkeys.mjs [--out file.json]
//
// What cannot be tested here: whether a real Chrome/Edge/Firefox window hands the reserved keys to the page. Playwright sends keys
// straight to the page, so the browser's own shortcuts never fire; see docs/shortcuts.md, "Checking in a real browser".
import fs from "node:fs";
import { launch, openEditor, BASE, setDoc, caret } from "../shortcuts/lib.mjs";
import { launch as launchX, openEditor as openX } from "../shortcuts-excel/lib.mjs";

const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const results = [];
const check = (id, ok, detail = "") => { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${id}${ok ? "" : "  " + detail}`); };

// ---- top-level page: lock, manifest, full screen ---------------------------------------------------------------
{
  const env = await launch({ platform: "win" });
  const { page } = env;
  const frame = await openEditor(page);
  await page.waitForFunction(() => window.__elixirBrowserKeys && window.__elixirBrowserKeys.status().lock !== "idle", null, { timeout: 10000 }).catch(() => {});
  const st = await page.evaluate(() => window.__elixirBrowserKeys && window.__elixirBrowserKeys.status());
  check("lock.api", st && st.lockApi === true, JSON.stringify(st));
  check("lock.requested", st && st.lock === "requested", JSON.stringify(st));
  const inFrame = await frame.evaluate(async () => { try { await navigator.keyboard.lock(["KeyW"]); return "ok"; } catch (e) { return e.name; } });
  check("lock.iframe-refused", inFrame === "InvalidStateError", inFrame);   // the reason the top-level page owns the lock

  // manifest and icons
  const man = await page.evaluate(async () => {
    const l = document.querySelector('link[rel="manifest"]');
    if (!l) return null;
    const j = await (await fetch(l.href)).json();
    const icons = await Promise.all(j.icons.map(async i => { const r = await fetch(new URL(i.src, l.href)); return { src: i.src, ok: r.ok, type: r.headers.get("content-type") }; }));
    return { href: l.href, j, icons, start: new URL(j.start_url, l.href).href, scope: new URL(j.scope, l.href).href, page: location.href };
  });
  check("manifest.linked", man && man.href.endsWith("/elixir/brand/manifest.webmanifest"), JSON.stringify(man && man.href));
  check("manifest.fields", man && man.j.display === "standalone" && man.j.name === "ElixirOffice" && man.j.icons.some(i => i.sizes === "192x192") && man.j.icons.some(i => i.sizes === "512x512"), JSON.stringify(man && man.j));
  check("manifest.icons-load", man && man.icons.every(i => i.ok), JSON.stringify(man && man.icons));
  check("manifest.scope", man && man.start.startsWith(man.scope) && man.page.startsWith(man.scope), `${man && man.start} ${man && man.scope}`);
  try {
    const cdp = await page.context().newCDPSession(page);
    const r = await cdp.send("Page.getInstallabilityErrors");
    check("manifest.installable", r.installabilityErrors.length === 0, JSON.stringify(r.installabilityErrors));
  } catch (e) { check("manifest.installable", false, String(e)); }

  // full screen asked by the editor, applied by the top page
  await page.mouse.click(300, 300);
  await frame.evaluate(() => window.parent.postMessage({ elixirBrowserKeys: { do: "fullscreen" } }, "*"));
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 }).catch(() => {});
  const fs1 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, st: window.__elixirBrowserKeys.status() }));
  check("fullscreen.from-editor", fs1.fs && fs1.st.fullscreen, JSON.stringify(fs1));
  await frame.waitForFunction(() => Common.ElixirBrowserKeys.status && Common.ElixirBrowserKeys.status.fullscreen === true, null, { timeout: 5000 }).then(() => check("fullscreen.status-in-editor", true), () => check("fullscreen.status-in-editor", false, "editor did not get the status"));
  await page.evaluate(() => document.exitFullscreen());

  // ---- hint -------------------------------------------------------------------------------------------------
  await frame.evaluate(() => { try { localStorage.removeItem("elixir-browserkeys-hint-seen"); } catch (e) {} });
  const blurFocus = async keys => {
    for (const k of keys) await page.keyboard.down(k);
    await frame.evaluate(() => window.dispatchEvent(new Event("blur")));
    for (const k of keys.slice().reverse()) await page.keyboard.up(k);
    await frame.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(900);
  };
  const hints = () => frame.evaluate(() => document.querySelectorAll("#elx-bk-hint").length);
  await page.keyboard.press("Control+b");    // another key was typed: not a reserved combination
  await frame.evaluate(() => window.dispatchEvent(new Event("blur")));
  await frame.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(900);
  check("hint.not-for-normal-keys", (await hints()) === 0);
  await blurFocus(["Control"]);               // Ctrl alone, then the window lost the focus: the browser kept the key
  check("hint.shown-once-detected", (await hints()) === 1);
  await frame.evaluate(() => document.querySelector("#elx-bk-hint .elx-bk-x").click());
  await blurFocus(["Control"]);
  check("hint.not-repeated", (await hints()) === 0);
  await frame.evaluate(() => { localStorage.removeItem("elixir-browserkeys-hint-seen"); });
  await frame.evaluate(() => { Common.ElixirBrowserKeys.controller.showHint(); });
  await frame.locator("#elx-bk-hint .elx-bk-btn").click();
  await frame.waitForSelector(".elx-bk-dlg", { timeout: 5000 });
  const dlg = await frame.evaluate(() => document.querySelector(".elx-bk-dlg").innerText);
  check("dialog.opens-from-hint", /Keyboard shortcuts in the browser/.test(dlg) && /Ctrl\+Shift\+W/.test(dlg) && /Ctrl\+Alt\+Shift\+W/.test(dlg), dlg.slice(0, 200));
  check("dialog.word-only-rows", !/sheet/i.test(dlg), "spreadsheet rows shown in Word");
  await frame.evaluate(() => $(".elx-bk-dlg .dlg-btn").click());

  // ---- link from the Keyboard Shortcuts options dialog -----------------------------------------------------
  const linkOk = await frame.evaluate(() => { const w = new Common.Views.ShortcutsDialog({ api: Asc.editor }); w.show(); const l = document.getElementById("browser-keys-btn"); const ok = !!l; l && l.click(); return ok; });
  check("dialog.link-in-shortcuts-options", linkOk);
  await frame.waitForSelector(".elx-bk-dlg", { timeout: 5000 }).then(() => check("dialog.opens-from-options", true), () => check("dialog.opens-from-options", false));

  // ---- unsaved changes: Ctrl+W asks first --------------------------------------------------------------------
  await frame.evaluate(() => { $(".asc-window:visible .dlg-btn, .asc-window:visible .tool.close").click(); });
  await setDoc(frame, ["alpha beta"]);
  await caret(frame, 0, 5);
  await page.keyboard.type(" edited");
  await page.waitForTimeout(500);
  const guard = await frame.evaluate(() => DE.getController("Main").onBeforeUnload());
  check("beforeunload.guard-when-modified", typeof guard === "string" && guard.length > 0, String(guard));

  // ---- Word: the alternatives are published as data ----------------------------------------------------------
  const alts = await frame.evaluate(() => Common.ElixirBrowserKeys.alts.word.map(a => a.code));
  check("word.alternatives", ["KeyW", "KeyT", "KeyN", "Tab"].every(c => alts.includes(c)), JSON.stringify(alts));
  await env.browser.close();
}

// ---- Spreadsheet: dialog rows and the sheet alternative ------------------------------------------------------------
{
  const env = await launchX({ platform: "win" });
  const frame = await openX(env.page);
  await frame.evaluate(() => Common.NotificationCenter.trigger("elixir:browserkeys:help"));
  await frame.waitForSelector(".elx-bk-dlg", { timeout: 5000 });
  const t = await frame.evaluate(() => document.querySelector(".elx-bk-dlg").innerText);
  check("excel.dialog-rows", /Ctrl\+Alt\+PageDown/.test(t) && /Ctrl\+Alt\+Shift\+PageDown/.test(t) && !/Underline words only/.test(t), t.slice(0, 200));
  await env.browser.close();
}

// ---- Presentation: Ctrl+Alt+Shift+N opens File > New, Ctrl+Alt+Shift+T the Font dialog --------------------------------
{
  const env = await launch({ platform: "win" });
  const { page } = env;
  await page.goto(`${BASE}/example/editor?fileExt=pptx`, { waitUntil: "load" });
  let frame;
  for (let i = 0; i < 400 && !frame; i++) { frame = page.frames().find(f => f.url().includes("/presentationeditor/main/")); await page.waitForTimeout(250); }
  await frame.waitForFunction(() => { try { return PE.getController("Main")._isDocReady === true; } catch (e) { return false; } }, null, { timeout: 120000 });
  await frame.waitForTimeout(1500);
  await frame.evaluate(() => { Asc.editor.asc_enableKeyEvents(true); });
  await page.keyboard.press("Control+Alt+Shift+n");
  await page.waitForTimeout(800);
  const open = await frame.evaluate(() => { try { return PE.getController("LeftMenu").leftMenu.menuFile.isVisible(); } catch (e) { return false; } });
  check("powerpoint.alt-new", open === true, String(open));
  await env.browser.close();
}

const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} pass`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
