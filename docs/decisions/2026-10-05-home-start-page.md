# ADR: ElixirOffice start page in the sample application

Date: 2026-10-05. Status: accepted (proto).

## Context

The first page seen is the upstream's sample application
(`document-server-integration/web/documentserver-example/nodejs`, Express + EJS):
a test bench with the ElixirOffice logo, user and language selectors, a WOPI tab.
We want a Microsoft 365 / Word-style start page, without losing the sample's plumbing
(storage, upload, JWT, callbacks, conversion, editor opening) nor the test bench.

Constraints: survive upstream rebases; no upstream brand; no heavy framework;
the test bench stays accessible.

## Options

1. **Replace `views/index.ejs` with an override file** (`branding/` folder). Silently overwrites
   upstream changes to the page; the test bench disappears (or a copy has to be maintained);
   a server route is needed anyway to create a file from a template (`/create`
   downloads through the public URL, unreachable from the container behind a published port).
2. **Submodule branch with targeted commits.** The page code lives next to the upstream's,
   in new files; git handles the rebases.
3. **Full override + patch** of `app.js` applied by the Makefile: same surface as (2),
   but without git history, and the patch breaks at every context change.

## Choice

Mixed, on the model already adopted for web-apps (code in the upstream's tree, brand in `branding/`):

- **Code**: branch `elixir/home` of `document-server-integration`. Only new files
  (`helpers/elixirHome.js`, `views/home.ejs`, `public/elixir/**`) and **two lines** in `app.js`
  (`require` + `app.use(elixirHome())` before the upstream's `/` route). The router answers `/` and
  hands over to the upstream with `?dev=1`: the test bench is not modified. Expected rebase conflict:
  at worst these two lines. Since the branch only exists locally (nothing is pushed), the
  series is exported to `patches/document-server-integration/` (`git am` to replay it).
- **Brand**: logo, favicon, templates and thumbnails in `branding/example/nodejs/public/elixir/brand/`
  of our repository, copied into the submodule by `make example-brand` (excluded from git there). The
  code works without them (text wordmark, no templates). At image build, the same
  tree goes through the `brand-icons` context that the sample's Dockerfile already copies
  onto `/app` before `pkg`.
- **No framework**: server-rendered HTML, ~400 lines of dependency-free JS, CSS with
  variables (accent = `--accent`). Fluent icons (MIT) as an inline SVG sprite, 24 icons.

## Consequences

- The routes added are `GET /`, `GET /elixir/api/files`, `GET /elixir/new?template=<id>`.
  Everything else goes through the sample's routes.
- The displayed name comes from `server.appName` (config): replaced at image build by
  `COMPANY_NAME`, overridden in dev by `local-production-linux.json`.
- No renaming: the sample has no stored-file renaming (`/rename` only
  sends a `meta` command to an open editing session).
