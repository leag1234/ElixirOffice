#!/usr/bin/env node
// AI is OFF unless configured (docs/ai.md §0): three configurations of the same instance, each in a fresh
// browser with no stored settings, against a local mock OpenAI-compatible server (no real provider, no key).
//   A  no configuration: the editor works, no AI entry point, a discreet "Set up AI…", zero AI network calls, no console error
//   B  server configuration (ELIXIR_AI_* applied with tools/ai-proxy/install.sh): entry points on, the key stays on the server
//   C  user configuration in File > AI (own endpoint and key in the browser): direct calls to that endpoint, notice, Test connection,
//      CORS hint, Remove settings
// Needs docker access to the instance container (CONTAINER, default eo-aiconfig) and a host the container can reach (MOCK_HOST,
// default 172.17.0.1). Playwright: PW_DIR (see tools/eval/lib.mjs).
//   EO_BASE=http://localhost:8117 node tests/ai-config/config.mjs
import http from "node:http";
import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { REPO, BASE, launch, openEditor, uploadDocx, focusEditor, chromium } from "../../tools/eval/lib.mjs";

const CONTAINER = process.env.CONTAINER || "eo-aiconfig";
const MOCK_HOST = process.env.MOCK_HOST || "172.17.0.1";
const PORT = Number(process.env.MOCK_PORT || 18999);
const SERVER_KEY = "srv-secret-key-0001", USER_KEY = "usr-own-key-0002";
const results = [];
const record = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log((ok ? "pass " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

// ---- mock OpenAI-compatible server -----------------------------------------------------------------------------------
const calls = [];
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", d => body += d);
  req.on("end", () => {
    const cors = !req.url.startsWith("/nocors");
    if (cors) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "authorization,content-type"); res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS"); }
    if (req.method === "OPTIONS") { res.writeHead(cors ? 204 : 404); return res.end(); }
    if (req.method === "POST" && /\/chat\/completions$/.test(req.url)) {
      let j = {}; try { j = JSON.parse(body); } catch (e) {}
      calls.push({ url: req.url, auth: req.headers.authorization || "", model: j.model, host: req.headers.host, cookie: req.headers.cookie || "" });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    }
    res.writeHead(404); res.end("{}");
  });
});
await new Promise(r => mock.listen(PORT, "0.0.0.0", r));

const install = env => execFileSync(path.join(REPO, "tools/ai-proxy/install.sh"), [CONTAINER], { env: { ...process.env, ELIXIR_AI_ENV: "/dev/null", ELIXIR_AI_BASE_URL: "", ELIXIR_AI_MODEL: "", ELIXIR_AI_API_KEY: "", OPENAI_API_KEY: "", ...env }, stdio: "pipe" });

// A fresh browser session on a new document; returns helpers
async function session() {
  const s = await launch();
  const seen = [];
  s.page.on("request", r => seen.push({ url: r.url(), method: r.method(), auth: r.headers()["authorization"] || "" }));
  const frame = await openEditor(s.page);   // blank document, a line of text typed in
  await focusEditor(frame);
  await s.page.keyboard.type("Hello AI configuration test");
  await frame.waitForTimeout(800);
  return { ...s, frame, seen };
}
const aiCalls = seen => seen.filter(r => /\/chat\/completions|\/elixir-ai\/v1/.test(r.url) || (!r.url.startsWith(BASE) && !/^(data|blob|about):/.test(r.url)));
const tabVisible = frame => frame.evaluate(() => { const a = document.querySelector('a[data-tab="elixir"]'); return !!a && a.offsetParent !== null && getComputedStyle(a.parentElement).display !== "none"; });
async function typeInSearch(frame, page, text) {
  await page.keyboard.press("Alt+q");
  await frame.waitForTimeout(300);
  await page.keyboard.type(text);
  await frame.waitForTimeout(400);
  return frame.evaluate(() => ({ ask: !!document.querySelector(".elx-sr-ask"), setup: !!document.querySelector(".elx-sr-setup"), ph: (document.querySelector(".elx-search-input") || {}).placeholder || "" }));
}
async function selectWord(frame, page) {
  await frame.click("#editor_sdk", { position: { x: 300, y: 200 } });
  await page.keyboard.press("Control+a");
  await frame.waitForTimeout(700);
}
const miniVisible = frame => frame.evaluate(() => { const b = document.querySelector("#mini-elixir button, #mini-elixir .btn"); return !!b && b.offsetParent !== null; });
async function ctxHasAsk(frame, page) {
  await frame.click("#editor_sdk", { position: { x: 300, y: 200 }, button: "right" });
  await frame.waitForTimeout(600);
  const r = await frame.evaluate(() => Array.from(document.querySelectorAll(".dropdown-menu li")).some(li => li.offsetParent !== null && /Ask Elixir/i.test(li.textContent)));
  await page.keyboard.press("Escape");
  return r;
}
async function slashMenu(frame, page) {
  await frame.click("#editor_sdk", { position: { x: 300, y: 200 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await frame.waitForTimeout(600);
  await page.keyboard.type("/");
  await frame.waitForTimeout(500);
  const r = await frame.evaluate(() => { const m = document.getElementById("elixir-slash-menu"); return !!m && m.getClientRects().length > 0; });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  return r;
}
async function openAiPage(frame, page) {
  await frame.evaluate(() => DE.getController("Common.Controllers.ElixirAI").openSetup());
  await frame.waitForTimeout(800);
}
const pageVisible = frame => frame.evaluate(() => { const p = document.getElementById("panel-elx-ai"); return !!p && p.offsetParent !== null && !!p.querySelector("#elixir-ai-endpoint"); });

try {
  // ---- generator (shell): invalid values keep AI off, a valid configuration never leaks into config.json ------------------
  const gen = path.join(process.env.DS_SRC || path.join(process.env.HOME, "elixiroffice/wt/aiconfig"), "build/scripts/standalone/elixir-ai-conf.sh");
  const run = env => execSync(`sh ${gen}`, { env: { PATH: process.env.PATH, ...env } }).toString();
  record("generator: nothing set gives enabled:false", run({}).includes('{"enabled":false}'));
  record("generator: a base URL with an injection attempt keeps AI off", run({ ELIXIR_AI_BASE_URL: "http://x/v1;}location /", ELIXIR_AI_MODEL: "m" }).includes('{"enabled":false}'));
  record("generator: a non-OpenAI endpoint needs a model", run({ ELIXIR_AI_BASE_URL: "http://ollama:11434/v1" }).includes('{"enabled":false}'));
  const g = run({ ELIXIR_AI_BASE_URL: "http://ollama:11434/v1/", ELIXIR_AI_MODEL: "llama3.1" });
  record("generator: keyless Ollama (no Authorization header, host in config.json)", g.includes("proxy_pass http://ollama:11434/v1/chat/completions") && !g.includes("Authorization") && g.includes('"host":"ollama"'));
  const g2 = run({ ELIXIR_AI_BASE_URL: "https://api.mistral.ai/v1", ELIXIR_AI_MODEL: "mistral-small-latest", ELIXIR_AI_API_KEY: SERVER_KEY });
  record("generator: the key is only in the proxy block, not in config.json", g2.includes("Bearer " + SERVER_KEY) && !/return 200[^\n]*srv-secret/.test(g2));
  record("generator: legacy OPENAI_API_KEY means OpenAI + gpt-4.1-mini", run({ OPENAI_API_KEY: SERVER_KEY }).includes("proxy_pass https://api.openai.com/v1/chat/completions"));

  // ---- A: no configuration -------------------------------------------------------------------------------------------
  install({});
  let s = await session();
  const cfg = await s.frame.evaluate(() => fetch("/elixir-ai/config.json", { cache: "no-store" }).then(async r => ({ status: r.status, text: await r.text() })));
  record("A config.json answers 200 {enabled:false} (no 404 in the console)", cfg.status === 200 && /"enabled":false/.test(cfg.text), JSON.stringify(cfg));
  await selectWord(s.frame, s.page);
  record("A editor works: text typed and selectable", await s.frame.evaluate(() => Asc.editor.asc_GetSelectedText().length > 0));
  record("A Elixir tab hidden", !(await tabVisible(s.frame)));
  record("A mini toolbar sparkle hidden", !(await miniVisible(s.frame)));
  await s.page.keyboard.press("Escape");
  record("A right-click has no Ask Elixir", !(await ctxHasAsk(s.frame, s.page)));
  record('A "/" opens no menu', !(await slashMenu(s.frame, s.page)));
  const sr = await typeInSearch(s.frame, s.page, "zzqq");
  record('A search box: no "Ask Elixir" row, a discreet "Set up AI…" row, plain placeholder', !sr.ask && sr.setup && !/ask|elixir/i.test(sr.ph), JSON.stringify(sr));
  await s.frame.click(".elx-sr-setup");
  await s.frame.waitForTimeout(800);
  record('A "Set up AI…" opens the File > AI page', await pageVisible(s.frame));
  await s.page.keyboard.press("Escape");
  const ai = aiCalls(s.seen).filter(r => !/\/elixir-ai\/config\.json$/.test(r.url));
  record("A no AI network call (only same-origin config.json)", ai.length === 0, JSON.stringify(ai.slice(0, 3)));
  record("A no console or page error", s.errors.length === 0, JSON.stringify(s.errors.slice(0, 3)));
  record("A the mock never heard from the browser or the server", calls.length === 0);
  await s.browser.close();

  // ---- B: server configuration ---------------------------------------------------------------------------------------
  install({ ELIXIR_AI_BASE_URL: `http://${MOCK_HOST}:${PORT}/v1`, ELIXIR_AI_MODEL: "mock-server-model", ELIXIR_AI_API_KEY: SERVER_KEY });
  s = await session();
  const cfgB = await s.frame.evaluate(() => fetch("/elixir-ai/config.json", { cache: "no-store" }).then(r => r.text()));
  record("B config.json: enabled, same-origin endpoint, host, no key", /"enabled":true/.test(cfgB) && /"endpoint":"\/elixir-ai\/v1"/.test(cfgB) && !cfgB.includes(SERVER_KEY), cfgB);
  record("B Elixir tab visible", await tabVisible(s.frame));
  const srB = await typeInSearch(s.frame, s.page, "zzqq");
  record('B search box offers "Ask Elixir", no "Set up AI…"', srB.ask && !srB.setup && /elixir/i.test(srB.ph), JSON.stringify(srB));
  await s.page.keyboard.press("Escape");
  await selectWord(s.frame, s.page);
  record("B mini toolbar sparkle visible", await miniVisible(s.frame));
  record("B right-click has Ask Elixir", await ctxHasAsk(s.frame, s.page));
  record('B "/" opens the menu', await slashMenu(s.frame, s.page));
  const reply = await s.frame.evaluate(() => { const A = Common.ElixirAI; return A.Connector.chat({ settings: A.Settings.get(), messages: [{ role: "user", content: "hi" }] }).then(r => r.message.content, e => "ERR " + e.message); });
  record("B a request goes through the server proxy with the server's key and model", reply === "ok" && calls.length === 1 && calls[0].auth === "Bearer " + SERVER_KEY && calls[0].model === "mock-server-model" && calls[0].cookie === "", JSON.stringify({ reply, calls }));
  const browserAuth = s.seen.filter(r => /chat\/completions/.test(r.url));
  record("B the browser sent no Authorization header and only talked to the editor host", browserAuth.length === 1 && browserAuth[0].auth === "" && browserAuth[0].url.startsWith(BASE + "/elixir-ai/v1/"), JSON.stringify(browserAuth));
  const stored = await s.frame.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + document.documentElement.innerHTML.length);
  record("B the key is nowhere in the browser", !stored.includes(SERVER_KEY));
  record("B no console or page error", s.errors.length === 0, JSON.stringify(s.errors.slice(0, 3)));
  await s.browser.close();

  // ---- C: user configuration, no server configuration ----------------------------------------------------------------
  install({});
  calls.length = 0;
  s = await session();
  record("C starts with AI off", !(await tabVisible(s.frame)));
  await openAiPage(s.frame, s.page);
  record("C File > AI page shows the form", await pageVisible(s.frame));
  const f = s.frame;
  await f.selectOption("#panel-elx-ai #elixir-ai-preset", "ollama");
  record("C Ollama preset fills the local URL and a model, shows the CORS note", await f.evaluate(() => document.querySelector("#panel-elx-ai #elixir-ai-endpoint").value === "http://localhost:11434/v1" && document.querySelector("#panel-elx-ai #elixir-ai-model").value !== "" && /OLLAMA_ORIGINS/.test(document.querySelector("#panel-elx-ai .elixir-ai-cors").textContent) && document.querySelector("#panel-elx-ai .elixir-ai-cors").offsetParent !== null));
  // not reachable (no CORS on the mock): a clear hint
  await f.fill("#panel-elx-ai #elixir-ai-endpoint", `http://127.0.0.1:${PORT}/nocors/v1`);
  await f.fill("#panel-elx-ai #elixir-ai-model", "mock-user-model");
  await f.click("#panel-elx-ai [data-act=test]");
  await f.waitForTimeout(1500);
  record("C Test connection with a blocked (CORS) endpoint explains how to fix it", await f.evaluate(() => /OLLAMA_ORIGINS/.test(document.querySelector("#panel-elx-ai .msg").textContent) && document.querySelector("#panel-elx-ai .msg").classList.contains("error")));
  await f.fill("#panel-elx-ai #elixir-ai-endpoint", `http://127.0.0.1:${PORT}/v1`);
  await f.fill("#panel-elx-ai #elixir-ai-key", USER_KEY);
  record('C notice says "Your text is sent to <host>"', await f.evaluate(p => document.querySelector("#panel-elx-ai #elixir-ai-notice").textContent === "Your text is sent to 127.0.0.1:" + p + ".", PORT));
  record("C key field is masked", await f.evaluate(() => document.querySelector("#panel-elx-ai #elixir-ai-key").type === "password"));
  await f.click("#panel-elx-ai [data-act=test]");
  await f.waitForTimeout(1500);
  record("C Test connection reaches the endpoint directly", await f.evaluate(() => /Connection OK/.test(document.querySelector("#panel-elx-ai .msg").textContent)) && calls.length === 1 && calls[0].auth === "Bearer " + USER_KEY && calls[0].model === "mock-user-model" && calls[0].host === `127.0.0.1:${PORT}`, JSON.stringify(calls));
  await f.click("#panel-elx-ai [data-act=save]");
  await f.waitForTimeout(800);
  record("C Save turns the AI entry points on without reload", await tabVisible(f));
  const stC = await f.evaluate(() => JSON.parse(localStorage.getItem("elixir-ai-settings") || "{}"));
  record("C the key is stored in this browser (localStorage) only", stC.apiKey === USER_KEY && stC.endpoint === `http://127.0.0.1:${PORT}/v1`);
  await s.page.keyboard.press("Escape");
  const srC = await typeInSearch(f, s.page, "zzqq");
  record('C search box offers "Ask Elixir"', srC.ask && !srC.setup, JSON.stringify(srC));
  await s.page.keyboard.press("Escape");
  const replyC = await f.evaluate(() => { const A = Common.ElixirAI; return A.Connector.chat({ settings: A.Settings.get(), messages: [{ role: "user", content: "hi" }] }).then(r => r.message.content, e => "ERR " + e.message); });
  const direct = s.seen.filter(r => /chat\/completions/.test(r.url) && r.method === "POST");
  record("C requests go straight from the browser to the configured endpoint, none through the editor server", replyC === "ok" && direct.length >= 1 && direct.every(r => r.url.startsWith(`http://127.0.0.1:${PORT}/`)), JSON.stringify(direct));
  await openAiPage(f, s.page);
  await f.click("#panel-elx-ai [data-act=clear]");
  await f.waitForTimeout(800);
  record("C Remove settings turns AI off again", !(await tabVisible(f)) && await f.evaluate(() => localStorage.getItem("elixir-ai-settings") === null));
  record("C no console or page error", s.errors.every(e => /Access-Control|Failed to load resource|ERR_FAILED/.test(e.text)), JSON.stringify(s.errors.slice(0, 3)));
  await s.browser.close();

  // ---- D: the demo's client configuration (no "enabled" field) is read as a server configuration -------------------------
  const demoConf = `location = /elixir-ai/config.json {\n  default_type application/json;\n  add_header Cache-Control "no-store" always;\n  return 200 '{"endpoint":"/elixir-ai/v1","model":"gpt-4.1-mini","managed":true}';\n}\nlocation /elixir-ai/v1/ { return 404; }\n`;
  execFileSync("docker", ["exec", "-i", CONTAINER, "sh", "-c", "umask 077; cat > /etc/nginx/includes/ds-elixir-ai.conf && nginx -t -q && service nginx reload >/dev/null"], { input: demoConf, stdio: ["pipe", "pipe", "pipe"] });
  s = await session();
  record("D demo configuration (no enabled field): AI on, tab visible, server notice", await tabVisible(s.frame) && await s.frame.evaluate(() => Common.ElixirAI.Settings.isConfigured() && Common.ElixirAI.dataNotice("") !== "" && Common.ElixirAI.Settings.managed.managed === true));
  record("D no console or page error", s.errors.length === 0, JSON.stringify(s.errors.slice(0, 3)));
  await s.browser.close();
} catch (e) {
  record("script error", false, e.stack || e);
} finally {
  mock.close();
  try { install({}); } catch (e) {}
}
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} pass`);
process.exit(failed ? 1 : 0);
