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
- **Performance** (<dev-host>, headless Chromium, page served locally): first paint ~50 ms,
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
# isolated instance launched by develop/eo.sh (e.g. eo-home, worktree $EO_WORK/wt/home):
make example CONTAINER=eo-home UPSTREAM=$EO_WORK/wt/home
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

Working instance: `eo-home`, http://localhost:32769/example/ on <dev-host> (port assigned by
`eo.sh up home`, `./eo.sh ls` to find it again; `ssh -fN -L 32769:localhost:32769 <dev-host>`
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

`screenshots/home/` (1440×900 and 1280×720, headless Chromium, script
`$EO_WORK/pw/home/flow.mjs` on <dev-host>): empty start page, after creating an empty document,
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
- Displayed user = the sample's first test user.
- No dark theme; template content in French (provisional corpus).
- The upstream's `public/images/favicon.ico` (ONLYOFFICE logo) is still served on `/example/favicon.ico`
  (not referenced by our pages); the editor's tab icons are the upstream's
  (generic pictograms).
- pkg binary not rebuilt: reading the catalogs (`readdirSync` in the pkg snapshot) is
  to be verified at the first image build.
