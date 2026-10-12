# Contributing to ElixirOffice

Thank you for your interest. ElixirOffice is free software (AGPL-3.0-only, see [LICENSE](LICENSE) and [NOTICE](NOTICE)). Contributions from humans and AI-assisted tools are reviewed and tested the same way.

## Where the code lives

ElixirOffice is made of this repository and of forks of the Euro-Office components that we modify. This repository holds what is ours alone: branding (theme, icons, fonts), build and packaging tooling, the desktop app, the WebAssembly build scripts, tests, the evaluation suites and the documentation. `patches/` contains informational exports of our changes to the components.

The component repositories (branch `elixiroffice`; `main` follows Euro-Office) are published as `github.com/leag1234/<name>`:

| Repository | What it contains | Typical changes |
|---|---|---|
| `DocumentServer` | orchestrator: pins the components, build files | component bumps, build |
| `sdkjs` | editor engines (Word, Excel, PowerPoint logic in JavaScript) | editing features, shortcuts, layout, local conversion worker |
| `web-apps` | editor user interface (ribbon, dialogs, panes, dark mode, translations) | UI, interaction, local mode |
| `core` | C++ converter x2t (formats, PDF), built to WebAssembly | file formats, conversion |
| `server` | document server services and admin panel | server behaviour |
| `document-server-integration` | example app: start page, Nextcloud / Murena Workspace connector, local editor mode | start page, storage |
| `document-server-package` | packaging, nginx configuration | install layout |
| `document-templates`, `document-formats`, `dictionaries`, `core-fonts` | templates, format tables, spelling dictionaries and thesauri, fonts | data |

`sdkjs-forms` is not modified and comes from Euro-Office. Changes that are not specific to ElixirOffice may also be proposed upstream to Euro-Office.

## Building

- Development environment (container, rebuild commands): [docs/dev.md](docs/dev.md)
- WebAssembly converter: [docs/wasm.md](docs/wasm.md) (`tools/wasm/build.sh`)
- Desktop app: [docs/desktop.md](docs/desktop.md)
- Server installation and production image: [docs/install-server.md](docs/install-server.md)

The scripts read their locations from environment variables instead of fixed paths: `EO_WORK` (directory that holds the `DocumentServer` checkout and this repository), `EO_BASE` (URL of the instance under test, for example `http://localhost:8080`) and `HOST` (name or address of a test host).

## Tests

The browser test suites are in `tests/` (Playwright, one directory per area: shortcuts, ribbon, context menus, layout, clipboard, spelling, PDF, local mode, desktop...). Most of them run against a running instance:

    EO_BASE=http://localhost:8080 node tests/<suite>/<script>.mjs

Each suite documents its options in its header or README. Unit tests of the tooling run with `python3 -m unittest` or `node --test` in the directory concerned. Please add or update a test with every behaviour change, and run the suites of the area you touched. Fidelity (layout compared with Microsoft Word) and performance measurements are described in [docs/fidelity.md](docs/fidelity.md) and [docs/perf.md](docs/perf.md).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(word): ...`, `fix(cell): ...`, `perf(...)`, `docs: ...`, `test: ...`, `chore: ...`, with a body that says why.
- Keep a pull request to one subject, with the tests and, for a visible change, a screenshot made with synthetic content.
- Keep committed content in English. Never commit private documents, credentials or personal data; test documents must be synthetic or under an open licence recorded in `corpus/provisional/manifest.csv`.
- Add `SPDX-License-Identifier: AGPL-3.0-only` to new source files. Keep existing copyright notices and attributions.
- Update [docs/differences.md](docs/differences.md) when a user-visible difference with LibreOffice or ONLYOFFICE appears.

## Issues and discussions

- Bugs and "it does not work like Microsoft Office" reports: open an issue with the version, system, browser, steps, expected and actual result. Attach a document only if it contains nothing private.
- Ideas and questions: use Discussions.
- Security problems: do not open a public issue; use the private vulnerability reporting of the repository.
