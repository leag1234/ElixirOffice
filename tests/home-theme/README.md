# Home appearance checks

<!-- SPDX-License-Identifier: AGPL-3.0-only -->

Use existing Node22 and Playwright; no new dependency is required. Paths refer to owned worktrees/public fixture evidence.

The resolver test consumes the real shared production module. Set UPSTREAM to an owned DocumentServer tree containing the integration source, or assemble desktop/assets first. With assembled assets, node --test tests/home-theme/theme.test.cjs runs standalone without environment variables. A clean Product checkout without those external inputs must use UPSTREAM; a missing input reports this requirement explicitly.

- `theme.test.cjs`: pure resolver contracts for app IDs, system mode, live/custom types, malformed inputs and separate document content appearance.
- `../home-ui/capture.cjs` with `EO_HOME_THEME_TEST=1`: actual Home EJS/helper/CSS/JS and handlers in five languages × two preferences,14 states/profile. Public HTTP results, no live backend. Geometry, text, AX, actual appearance and screenshots are recorded.
- `preferences.cjs`:15 browser cases for OS changes, explicit overrides, stale system cache, custom/malformed cache, content-theme separation, same-origin storage events/clear and empty form placeholders. Sandboxed opaque-origin frames prove actual localStorage SecurityError fallback.
- `../home-ui/desktop.cjs` with theme mode:40 standalone/embedded public-asset profiles. Actual head script, renderer, assembled scoped CSS and full production backstage inline stylesheet; locale labels, BDI geometry, previews and recent callback.
- `embedded.cjs`: actual parent helper/renderer binds a child ownerDocument with no helper of its own. Controlled live UI state overrides saved preference and follows OS in system mode. Stable panel reuse, explicit disposer and unchanged host root/body are checked. No Options UI/general mount lifecycle claim.
- `compare-geometry.cjs`: same-driver/runtime baseline and candidate require exact geometry, locale/text, form values, direction, keyboard and fixture HTTP contracts. Colors intentionally differ; no pixel identity claim.

`contrast.cjs` measures named visible text against composed ancestor backgrounds using computed colors, including placeholder pseudo opacity. Text minimum4.5:1; field borders/focus outlines3:1. Keyboard-focused menu/account items missing an outline fail. Explicit inspected selectors do not constitute full-page accessibility certification. Runtime/source/inspector/served asset hashes are recorded and required unchanged throughout a run.

```sh
UPSTREAM=/absolute/owned/DocumentServer NODE_PATH=/absolute/existing/example/node_modules node --test tests/home-theme/theme.test.cjs tests/home-ui/locales.test.cjs
UPSTREAM=/absolute/owned/DocumentServer NODE_PATH=/absolute/existing/example/node_modules EO_PLAYWRIGHT=/absolute/playwright EO_HOME_OUT=/absolute/preferences node tests/home-theme/preferences.cjs
EO_HOME_ASSETS=/absolute/assembled EO_PLAYWRIGHT=/absolute/playwright EO_HOME_OUT=/absolute/embedded node tests/home-theme/embedded.cjs
node tests/home-theme/compare-geometry.cjs /absolute/baseline/results.json /absolute/candidate/results.json /absolute/paired.json
```

Browser servers/connections and HTTP fixtures close in finally blocks. Native Electron startup/close, OS dialogs/file operations, real cloud backends, mobile and final packages remain unverified.

The two rail cases enable the explicit public dev-mode render local and dispatch a synthetic beforeinstallprompt event only to reveal the existing install affordance, then measure actual hovered labels. They do not invoke installation or certify PWA/browser support. Both hover foregrounds already exceed4.5:1, so no additional rail CSS change is needed.
