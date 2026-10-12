# Plugin / builder API limits met by the AI layer

This document keeps the list of concrete blockers of the plugin API and of the public builder API (the one `callCommand` sees). The brief (phase 3, point 3) asks for it.

For each limit: the finding, the source, what we do in v0, the proposed follow-up.

Updated 2026-10-06, AI layer (`docs/ai.md`; v0 is in the history of `docs/ai-v0.md`), ADR `docs/decisions/0001-ai-host.md`.

## 1. Interface

| # | Limit | Source | v0 | Follow-up |
|---|---|---|---|---|
| 1.1 | A plugin cannot draw a free layer above the document: its windows are iframes placed by the editor. | `sdkjs/common/plugins.js` (ShowWindow, panel, input helper) | Native bar in web-apps (ADR 0001) | `type: window` window if going back to a plugin |
| 1.2 | No global keyboard shortcut API for a plugin. | `apiBase_plugins.js`: no method | Alt+I registered by the native controller (web-apps keymaster) | — |
| 1.3 | No "selection changed" event. Only `onTargetPositionChanged` exists, and it follows the cursor. | `docs/document-api.md` §1.b | The context is read when the command is sent | — |

## 2. Tracked changes and undo

| # | Limit | Source | v0 | Follow-up |
|---|---|---|---|---|
| 2.1 | Columns, sections, page setup, style definitions and drawing geometry: **no revision type**, neither in Word nor in sdkjs. | `sdkjs/common/commonDefines.js:3138-3152` | `set_columns` tells the user ("Not trackable in Word"); the single undo covers it | Summary of these changes as a margin comment (v1) |
| 2.2 | No acceptance or rejection **by author**. `AcceptReviewChanges` / `RejectReviewChanges` handle the whole document or the selection. | `sdkjs/word/api_plugins.js:1016-1038` | "Accept" accepts everything if the document had no revision before the action, otherwise only the modified range (which may contain other authors' revisions) | Builder method `AcceptRevisionsByAuthor(name)` to propose upstream |
| 2.3 | No public way to know whether the last history point is the AI's (no history index). | `api_plugins.js`: only `CanUndo` | The native host reads `AscCommon.History.Index`. "Undo changes" = one Ctrl+Z if nothing moved, otherwise rejection of the revisions | — |
| 2.4 | `GroupActions` takes a global lock for the whole group. The group opens at the first tool that modifies, so the user cannot type during the model's following turns (1 to 3 s measured). | `apiBase.js:6061-6073` | Accepted: the bar shows "Working…" and Esc interrupts (everything is then undone) | Run all the tools of a turn in a single `callCommand` |
| 2.5 | `ApiDocument.SetAssistantTrackRevisions` only touched the global flag. It had no effect if local tracking was off, and its restoration turned tracking on for everyone. **Fixed** | `sdkjs/word/apiBuilder.js` | sdkjs commit `3482cde727` `[upstreamable]` | To propose upstream |
| 2.6 | The `Api.asc_GetLocalTrackRevisions` bridge was overwritten by the setter: reading it turned tracking off. **Fixed** | `apiBuilder.js:32305` | same commit | To propose upstream |
| 2.7 | The color set by `SetAssistantTrackRevisions` (`setUserColorById`) had no `Normal` variant, which crashed the web-apps revision bubble (`Cannot read properties of undefined (reading 'r')`). **Fixed** | `sdkjs/common/editorscommon.js` | sdkjs commit `1a7084301b` `[upstreamable]` | To propose upstream |
| 2.8 | `ApiDocument.GetReviewReport` listed revisions of elements removed from the document, for example a table inserted then undone. **Fixed** | `sdkjs/word/api.js` (`asc_GetTrackRevisionsReportByAuthors`) | sdkjs commit `26ebab3b47` `[upstreamable]` | To propose upstream |
| 2.9 | The choice of method decides tracking: `ApiRange.SetStyle` / `SetTextPr` / `Delete` are tracked, `ApiParagraph.SetStyle`, `ApiRun.Set*` and `ApiParagraph.Delete` are not. | `docs/document-api.md` §3.10 | The tools only use the tracked methods, and create content after tracking is turned on | Document on the upstream side |

## 3. Command execution (`callCommand`)

| # | Limit | Source | v0 | Follow-up |
|---|---|---|---|---|
| 3.1 | The macro sanitizer rejects any source that contains `import` followed by a space, **even inside a string**: a document text such as "import des données" makes the command fail. A plugin's parameters go through `Asc.scope`, serialized into the source, so they are affected too. | `sdkjs/common/macros.js` (`_sanitizeCode`) | Arguments are escaped (`import`) before sending; a test covers it | Restrict the check to code outside strings (to propose upstream) |
| 3.2 | A command sent during a long action is not executed and the callback receives `undefined`, with no error. | `plugins.js:1588` | Two retries at 300 ms, then a structured `editor_busy` error returned to the model | — |
| 3.3 | An exception in the command is swallowed (`console.error`, returns `undefined`). | `macros.js` (`safePluginEval`) | Each tool is wrapped in a try/catch and returns `{ok:false, error}` | — |
| 3.4 | `ApiRange` objects do not survive from one command to the next. | `docs/document-api.md` §3.3 | The model addresses blocks by index; each tool returns the shifts it causes | Stable identifiers (`paraId`) if documents get long |
| 3.5 | `ApiTable.ToJSON` (and the other `ToJSON`) return a JSON **string**, not an object. | observed | The harness does a `JSON.parse` | — |

## 4. Formatting

| # | Limit | Source | v0 | Follow-up |
|---|---|---|---|---|
| 4.1 | No public reset of direct formatting for size, font or color. `ApiTextPr.SetBold(null)` (and italic, underline, strikethrough, caps) does reset, but `SetFontSize(null)` sets a size of 0. | `apiBuilder.js` (`private_GetHps`); `Run.js` `Apply_Pr` | `apply_style(clear_direct_formatting)` only removes bold, italic, underline, strikethrough and caps; a direct size or font stays visible | Builder method `ApiRange.ClearFormatting()` to propose upstream |
| 4.2 | Paragraphs deleted while tracking stay in the block numbering until acceptance. | observed | `list_to_table` tells the model in its result | — |

## 5. Network

- The browser can call `https://api.openai.com/v1/chat/completions` directly, SSE stream included (CORS allowed by OpenAI). Verified from the editor on 2026-10-05: HTTP 200 streaming, for `gpt-4.1-mini` and `gpt-5.4-mini`. There is no CSP in nginx.
- For a provider that would refuse CORS, the minimal fix is the `/ai-proxy` proxy already present in the server (`server/DocService/sources/ai/aiProxyHandler.js`). This proxy has its constraints:
  - it requires the editor's session JWT;
  - providers and their keys are declared server side (`aiSettings.providers`);
  - it expects a `{target, method, data}` body.
- This proxy would need a small adapter in `Connector`. It would also be the path for the "organization server" mode (key never in the browser). Not needed for OpenAI, hence not done in v0.
- Not tested in v0: Anthropic (OpenAI compatibility, browser access with the `anthropic-dangerous-direct-browser-access` header), Mistral, Ollama (no key, which the connector accepts).
