#!/usr/bin/env node
// UI checks of the Elixir AI host, without any model call:
//  - the Elixir tab is in the ribbon;
//  - Alt+I opens the command bar, types nothing in the document and shows no key tips;
//  - Escape closes the bar; Ctrl+K still opens Word's "Insert hyperlink" dialog;
//  - with nothing configured the bar says so and no request leaves the browser.
//   node tools/eval/ui-check.mjs [screenshot dir]
import fs from "node:fs";
import { launch, openEditor, cmd, focusEditor } from "./lib.mjs";

const out = process.argv[2];
out && fs.mkdirSync(out, { recursive: true });
const shot = (page, name, clip) => out ? page.screenshot({ path: `${out}/${name}.png`, clip }) : null;
// AI is off unless configured (the Elixir tab is hidden then, see tests/ai-config): a placeholder endpoint is stored in the browser
const { browser, page, errors, requests } = await launch({ settings: { endpoint: "http://127.0.0.1:9/v1", model: "ui-check", apiKey: "unused" } });
const frame = await openEditor(page, null);
const res = {};
const text = () => cmd(frame, `Api.GetDocument().GetElement(0).GetText()`);

await cmd(frame, `(function(){ Api.GetDocument().GetElement(0).AddText("Bonjour"); return 1; })()`);
await frame.click("#editor_sdk", { position: { x: 700, y: 300 } });

res["ribbon has the Elixir tab"] = await frame.evaluate(() => !!document.querySelector('a[data-tab="elixir"]') && document.querySelector('a[data-tab="elixir"]').offsetParent !== null);
await frame.click('a[data-tab="elixir"]');
await frame.waitForTimeout(400);
await shot(page, "ui-1-ribbon-tab", { x: 0, y: 0, width: 1440, height: 160 });
await frame.click('a[data-tab="home"]');

const before = await text();
await frame.click("#editor_sdk", { position: { x: 700, y: 300 } });
await page.keyboard.press("Alt+i");
await frame.waitForTimeout(500);
res["Alt+I opens the command bar"] = await frame.evaluate(() => { const b = document.getElementById("elixir-ai-bar"); return !!b && b.style.display !== "none"; });
res["Alt+I types nothing in the document"] = (await text()) === before;
res["Alt+I shows no key tips"] = await frame.evaluate(() => Array.from(document.querySelectorAll(".hint-div")).every(h => h.offsetParent === null));
// configured (placeholder endpoint in the browser): the bar is ready. Unconfigured behaviour: tests/ai-config
res["configured: the bar is ready"] = await frame.evaluate(() => document.getElementById("elixir-ai-bar").getAttribute("data-state") === "idle");
await shot(page, "ui-2-unconfigured");
await focusEditor(frame);
await page.keyboard.press("Escape");
await frame.waitForTimeout(300);
res["Escape closes the bar"] = await frame.evaluate(() => document.getElementById("elixir-ai-bar").style.display === "none");

await frame.click("#editor_sdk", { position: { x: 700, y: 300 } });
await page.keyboard.press("Control+a");
await page.keyboard.press("Control+k");
await frame.waitForTimeout(800);
res["Ctrl+K still opens Insert hyperlink"] = await frame.evaluate(() => Array.from(document.querySelectorAll(".asc-window")).some(w => w.getClientRects().length > 0 && getComputedStyle(w).display !== "none" && /link settings|paramètres du lien|hyperlink/i.test(w.textContent)));
await shot(page, "ui-3-ctrl-k");
await page.keyboard.press("Escape");

// Settings dialog, with placeholder values only (never the real key in a screenshot)
await frame.evaluate(() => DE.getController("Common.Controllers.ElixirAI").openSettings(false));
await frame.waitForTimeout(300);
await frame.fill("#elixir-ai-endpoint", "https://api.openai.com/v1");
await frame.fill("#elixir-ai-key", "EXAMPLE_TOKEN_NOT_VALID");
res["key field is masked"] = await frame.evaluate(() => document.getElementById("elixir-ai-key").type === "password");
await shot(page, "ui-4-settings");
await frame.evaluate(() => DE.getController("Common.Controllers.ElixirAI").dialog.close());

const external = [...new Set(requests.map(r => r.host))].filter(h => !/^localhost(:\d+)?$|^127\.0\.0\.1/.test(h));
res["no request outside the editor host"] = external.length === 0;
res["no page/console error"] = errors.length === 0;
let failed = 0;
for (const [k, v] of Object.entries(res)) { console.log((v ? "PASS " : "FAIL ") + k); if (!v) failed++; }
if (external.length) console.log("external hosts:", external.join(", "));
if (errors.length) console.log("errors:", errors.map(e => e.text.slice(0, 200)).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
