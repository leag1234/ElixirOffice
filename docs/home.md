# ElixirOffice start page

## What it is

The page served on `/example/`: a start screen modeled on Microsoft 365 / Word,
in front of the upstream's sample application (whose whole plumbing we keep: storage by
IP address, upload, conversion, JWT, callbacks, editor opening).

- **Left bar**: Home, New, Open, then Document, Workbook, Presentation,
  PDF form; at the bottom, "Developer" (discreet link to the test bench).
- **Home**: "Create" (empty document, workbook, presentation, then the templates), then
  "Recent": type icon, name, modification date, size; filters by type; search
  in the header (shortcut `/`); click on a row = open; `…` menu = Open, Download,
  Delete (with confirmation). No renaming: the sample server cannot rename a
  stored file.
- **New**: all the empty files (including PDF form) and all the templates.
- **Open**: drop zone + "Browse this device". Drag and drop also works on
  the whole page. Formats to convert (odt, doc, rtf…) go through the sample's `/convert`
  before opening. Files open in a new tab, as in Microsoft 365.
- **Per-application views**: empty files and templates of the type, filtered recents.
- **Tab titles**: "ElixirOffice" on the start page, "<file> - ElixirOffice" in
  the editor (upstream's `editor.ejs`, from `server.appName`).
- **Language**: English by default; `?lang=xx` then `Accept-Language`. Catalogs
  `public/elixir/i18n/<language>.json` (en, fr). The language is passed to the editor (`&lang=`).
- **Test bench** (user selector, languages, roles, WOPI…): `/example/?dev=1`, unchanged.
- **Performance** (development host, headless Chromium, page served locally): first paint ~50 ms,
  136 KB in total of which 112 KB of thumbnails, HTML 38 KB (11 KB gzip). No web font, no
  framework, no external call.

## Where the code is

| What | Where |
|---|---|
| Router, view, CSS, JS, icons, translations | `document-server-integration` submodule, local branch `elixir/home` (3 commits); patch series: `patches/document-server-integration/` |
| Hook into the sample | 2 lines in `app.js` (`require` + `app.use(elixirHome())`) |
| Logo, favicon, templates + thumbnails | `branding/example/nodejs/public/elixir/brand/` (the logo is copied from the web-apps theme) |
| Tools | `tools/example/run-from-source.sh`, `tools/example/thumbnails.js`, `tools/fluent-sprite.mjs` |
| Architecture choice | `docs/decisions/2026-10-05-home-start-page.md` |

Icons: Microsoft Fluent UI System Icons (MIT), 24 icons as an SVG sprite
(`public/elixir/icons.svg`), license and list in `public/elixir/fluent/`. Regenerate:
`node tools/fluent-sprite.mjs <output.svg> <commit>`.

Templates: 4 CC0 documents generated for the provisional corpus (t01, t02, s06, s08), copied and
renamed; titles per language in `templates.json`. The `document-templates` samples
(Apache-2.0) have no thumbnails and talk about ONLYOFFICE: not retained. Thumbnails rendered
by the document server's converter: `make example-thumbnails`.

## How the image ships the sample

In the `latest-dev` image, the sample is a **pkg binary** built at image build time
(`document-server-integration/.docker/example.bake.Dockerfile`: `npm install`, copy of the
sources, copy of the `brand-icons` context onto `/app`, `sed ElixirOffice -> $COMPANY_NAME` in
`config/*.json`, then `pkg`). It is installed in `/var/www/elixiroffice/documentserver-example/example`
and launched by supervisor (`/etc/supervisor/conf.d/ds-example.conf`, program `example`,
`NODE_CONFIG_DIR=/etc/elixiroffice/documentserver-example`, `NODE_ENV=production-linux`);
nginx serves it under `/example/` (`/etc/nginx/includes/ds-example.conf`). Nothing is mounted:
changing the sources changes nothing until we switch to the sources.

## Running in dev

The container must mount a checkout where `document-server-integration` is on `elixir/home`.

```bash
# standard dev container (make up):
make example
# isolated instance launched by develop/eo.sh (e.g. eo-home, worktree /srv/elixiroffice/wt/home):
make example CONTAINER=eo-home UPSTREAM=/srv/elixiroffice/wt/home
```

`make example` = `make example-brand` (copy of the brand into the submodule) then
`tools/example/run-from-source.sh` in the container: `npm ci --omit=dev` in the submodule,
replacement of `ds-example.conf` by `node bin/www` on `/develop/...`, displayed name
"ElixirOffice" (`local-production-linux.json`), restart of the program. The effect holds
until the container is recreated (then rerun `make example`).

Redeploying after a change:

- `views/*.ejs`, `public/**` (CSS, JS): nothing to do, reload the page (no view cache
  outside `NODE_ENV=production`);
- `helpers/*.js`, `app.js`, translations: `make example-restart` (same variables);
- brand (logo, templates): `make example-brand`, then `make example-thumbnails` if the templates
  changed.

Working instance: `eo-home`, http://localhost:32769/example/ on development host (port assigned by
`eo.sh up home`, `./eo.sh ls` to find it again; `ssh -fN -L 32769:localhost:32769 dev-host`
from the Mac).

## Image build (untested)

1. point the submodule to `elixir/home` (done in the `elixir/home` branch of the
   superproject, commit `chore(example): point document-server-integration to elixir/home`);
2. `COMPANY_NAME=ElixirOffice`;
3. in a brand HCL, a `brand-icons` target that contains the tree of
   `branding/example/` under `/document-server-integration/web/documentserver-example/` and the
   logo:

```hcl
target "brand-icons" {
  context = "../../elixiroffice/branding"
  dockerfile-inline = <<EOT
FROM scratch
COPY example/nodejs /document-server-integration/web/documentserver-example/nodejs
COPY web-apps/theme/elixiroffice/assets/img/header/logo_light.svg /document-server-integration/web/documentserver-example/nodejs/public/elixir/brand/logo.svg
EOT
}
```

## Screenshots

`docs/screenshots/home/` (1440×900 and 1280×720, headless Chromium, script
`/srv/elixiroffice/pw/home/flow.mjs` on development host): empty start page, after creating an empty document,
editor, after uploading `t01-fiche-fractions-cm1.docx`, recents, search, menu, deletion,
drop, New / Open / Document views, interface in French, test bench. Titles verified:
`ElixirOffice`, `new.docx - ElixirOffice`, `t01-fiche-fractions-cm1.docx - ElixirOffice`.
No console error on the start page and in the editors; the test bench (`?dev=1`) keeps the
upstream's 404s (`preload.html`: `app.css`, `docserviceworker.js`).

## Known limits

- No renaming (the sample server does not allow it); no pinning nor "shared".
- Password-protected file, or format requiring a type choice at conversion:
  error message, opening to be done from the test bench.
- Recents = the sample's storage folder, by client IP address (upstream behavior).
- Displayed user = the sample's first test user ("John Smith").
- No dark theme.
- The upstream's `public/images/favicon.ico` (ONLYOFFICE logo) is still served on `/example/favicon.ico`
  (not referenced by our pages); the editor's tab icons are the upstream's
  (generic pictograms).
- pkg binary not rebuilt: reading the catalogs (`readdirSync` in the pkg snapshot) is
  to be verified at the first image build.

## Localized shared templates
All four CC0 Home examples (letterhead, two-column resume, fractions worksheet and skills-assessment grid) have generated content and proofing language for the 45 supported UI languages. The 0.2.0 bundled font pack covers 39 template languages; Japanese, simplified/traditional Chinese, Korean, Sinhala and Urdu use the English template until a Unicode font-pack update. These six generated variants remain under tools/example/template-layouts/localized, outside served and packaged assets. They contain only fictional details, example.org addresses and clearly fictional all-zero telephone numbers. School examples use a neutral fictional school and generic tasks/points, without a national curriculum or registry identifier. French school font aliases are confined to French; other variants use the existing free font pack.

Shared files are branding/example/nodejs/public/elixir/brand/templates/<language>/<id>.docx and .png. templates.json keeps file/thumb basenames, translated title and a languages list for each id; choose the UI language when listed, otherwise English. No flat default files remain. template-sources.json records CC0/fictional status, byte size and SHA256 per file. Text-free reproducible layout inputs live in tools/example/template-layouts and are not served or packaged as Home documents. Generate DOCX with tools/desktop/home_templates.py; render their actual first pages with tools/example/localized-thumbnails.py using an explicitly selected owned dev container. Desktop assembly follows this shared schema; matching server selection is owned by session E and must be integrated before an image refresh.

RTL variants (Arabic, Hebrew and the unshipped Urdu source) have paragraph direction,
complex-script run direction, visually reversed tables, mirrored alignment, indents,
tab stops and anchored headers. ASCII identifiers retain left-to-right run direction.
Complex-script and East Asian font slots explicitly name bundled DejaVu Sans.
The current pack renders Arabic, Hebrew and Lao without computer-font permission.
Owned Mac screenshots confirmed missing glyphs for CJK/Sinhala and three Urdu
characters (U+06C1, U+06D2, U+06D4); fallback to English avoids shipping broken
template text. Computer-font access remains optional and requires explicit consent.

Run tools/desktop/template_font_coverage.py against the actual desktop assets to
reproduce the complete 45-language/four-template matrix. Its standard-library cmap
reader was independently checked against fontTools for all 44 bundled regular faces.
The unit test checks each visible character against its declared font slot, so a
new manifest language fails when the pack cannot render its characters.
The 45 language keys match the desktop/editor locale set; Thai and Hindi are not
supported UI locales in this release. Layout inputs derive only from the public
synthetic corpus/provisional examples t01, t02, s06 and s08.

### 0.2.1 review candidate: styled glyph coverage

The follow-up candidate keeps Arabic complex-script text upright because bundled
DejaVu Sans Oblique/Bold Oblique lack Arabic glyphs. Nine previously italic runs
change; bold remains unchanged. Other languages retain their formatting.
Legacy symbol-encoded checkbox, circle, bullet and face characters become ordinary
Unicode with explicit bundled DejaVu Sans regular runs. The neutral face uses
U+1F610, which is present in the actual pack.

Coverage now selects regular/italic/bold/bold-italic from the real AllFonts indices
after resolving document defaults, basedOn chains, paragraph and character styles,
table styles/conditional first-row formatting and direct overrides. Number labels
and normalized symbols are checked too. Unsupported DrawingML text fails explicitly
rather than receiving an unverified pass. The 39-language offer list is unchanged.
This candidate is separate from frozen 0.2.0 and is not integrated.

The upright Arabic-script rule also covers Urdu and future Persian generation. The39offered languages are unchanged. Only the four unshipped Urdu source fixtures were regenerated for reproducibility; their remaining font gaps keep the existing English fallback. No Persian UI locale or new packaged language is introduced.
