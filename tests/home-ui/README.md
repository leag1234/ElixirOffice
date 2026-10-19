# Home locale and direction checks

<!-- SPDX-License-Identifier: AGPL-3.0-only -->

`locales.test.cjs` loads the real example Home helper and validates complete Arabic, Hebrew and Urdu catalogs, exact interpolation keys and unchanged editor-language policy. Set `UPSTREAM` to an owned DocumentServer worktree, with its integration child and generated public document-formats JSON. Use the existing example dependency directory through `NODE_PATH`; no new package is required.

`capture.cjs` serves production Home EJS/CSS/JS with the actual language resolver and public synthetic render locals. Browser routes intercept each modeled API response, block unexpected/external requests, and exercise account/profile/cloud forms, a localized connection error, upload error toast, file menus and cloud breadcrumbs. The account name and mixed-script filenames deliberately include literal markup-shaped text. It checks RTL geometry, logical menu anchors/viewport clamps at1366px/800px, keyboard focus/Escape/Tab, actual unchanged server request values, numeric-size isolation and overflow. `en,fr,ar,he,ur` run under both color preferences. All catalog/source/driver hashes and browser/Node versions are recorded; source inputs must remain unchanged throughout.

Example (paths supplied by the caller):

```sh
UPSTREAM=/absolute/owned/DocumentServer EO_PLAYWRIGHT=/absolute/playwright EO_HOME_OUT=/absolute/results node tests/home-ui/capture.cjs
```

`EO_HOME_OBSERVE=1` is explicitly baseline observation mode: it does not certify the new RTL assertions. Preserve its receipts and original failures. Run the same driver on an untouched baseline with `EO_HOME_LANGS=en,fr`, then use `compare-ltr.cjs baseline/results.json candidate/results.json paired.json`. The comparator requires identical executed drivers/runtime and compares exact existing catalogs, matched-state geometry/colors/text and unchanged form values; only intentional Unicode isolate characters are removed from displayed text. It does not claim complete DOM or screenshot identity.

`desktop.cjs` exercises the actual desktop Home renderer, including the full production backstage inline stylesheet, using the output of `tools/desktop/shell_assets.py`, current editor catalogs and public template assets. Set `EO_HOME_ASSETS` and `EO_HOME_OUT`. It captures20 standalone/embedded combinations over five languages and two preferences, checks BDI filename/folder isolation, localized labels and the actual recent-file action callback. Served assets and selected locale bytes are hashed. This is browser component coverage; it does not launch Electron or prove native lifecycle, OS dialogs, file operations, storage/authentication or a packaged application.

Set `EO_HOME_THEME_TEST=1` to require actual computed appearance and targeted contrast checks,14 captures/profile including keyboard danger/account focus. Desktop theme mode adds explicit opposite-OS choices for40 profiles and loads the production head theme-script tag. See [appearance checks](../home-theme/README.md). Requested preference alone is never dark-support proof.
