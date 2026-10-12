# ADR 0001: host the AI interface in web-apps, tools limited to the public builder API

Date: 2026-10-05. Status: accepted for v0 (to be reviewed with the owner: the brief left "plugin vs native" open).

## Context

The AI layer v0 of the Word editor requires:

- a floating command bar **above the document**, Copilot-style;
- a global keyboard shortcut (Alt+I), without breaking any Word shortcut;
- one AI action = a single undo step, result shown as tracked changes;
- code that could one day go back to a plugin or move upstream.

An OnlyOffice/ElixirOffice plugin cannot deliver the first two points:

- its windows are iframes placed by the editor (side panel, modal window, typing assistant); it cannot draw a free layer above the canvas;
- it does not receive keys typed in the document: no API allows registering a global shortcut. Only the typing assistant receives keys, and only while it is displayed.
- there is also no "the selection changed" event (`docs/document-api.md` §1.b).
- A plugin can, however, add a ribbon button (`AddToolbarMenuItem`). That is not the blocker.

## Options

1. **Pure plugin** (type `panel` or `window`): portable, but no bar over the document and no shortcut. Rejected for v0.
2. **Fully native**: UI in web-apps and tools that call the internal API directly (`asc_docs_api`, `CDocument`). More power (per-author revisions, layout), but strong coupling with sdkjs and no way back to a plugin.
3. **Hybrid**: native UI in web-apps; tools written **only** with the public builder API (`Api.*`, `ApiDocument`, `ApiRange`…) and executed by `api.callCommand` / `api.callMethod`, the internal counterparts of `Asc.plugin.callCommand` / `executeMethod` (same queue, same sandbox `AscCommon.safePluginEval`, same history handling, `sdkjs/common/apiBase.js:5876`).

## Decision

Option 3.

- The UI lives in an isolated module: `web-apps/apps/common/main/lib/elixir-ai/` (core, views, controller) and `apps/documenteditor/main/app/elixir-ai/WordTools.js` (Word tools).
- Hooking into the existing code is limited to two lines in `apps/documenteditor/main/app.js` and `app_dev.js` (declaration of the controller and modules). The ribbon tab and the shortcut are added by the controller itself, through the toolbar's public events.
- The tools are serialized functions (`toString()`), without closures, that only touch the builder API. They can therefore be copied as is into a plugin (`Asc.plugin.callCommand`).
- The only internal accesses concern the host, not the tools:
  - `asc_enableKeyEvents` (keyboard focus of the bar);
  - `AscCommon.History.Index`, used to know whether "Undo changes" can simply do a Ctrl+Z.
- Flaws of the public API that we met are fixed in sdkjs by tested `[upstreamable]` commits (branch `elixir/ai`), rather than worked around through the internal API.

## Consequences

- Going back to a plugin is possible: it would be enough to replace the bar with a plugin window and `api.callCommand` with `Asc.plugin.callCommand`. The shortcut and the layer would then be lost.
- Contributing upstream is conceivable as an optional web-apps module (no new dependency, no LESS file touched).
- The limits of the public API become our limits, and that is intended: they are listed in `docs/plugin-limits.md`. Examples: no acceptance of revisions per author, no public reset of direct size or font.
