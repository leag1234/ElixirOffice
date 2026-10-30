# ElixirOffice

**An open source office suite for people used to Microsoft Office.**

ElixirOffice edits Word, Excel and PowerPoint documents (and their OpenDocument equivalents) with the ribbon, menus, dialogs and keyboard shortcuts of Microsoft Office. It runs as a desktop app that works entirely offline, or in the browser on your own server. It is free software (AGPLv3), private by design, and fast.

> Status: **beta**. Expect rough edges, and please [report them](../../issues). Known limitations are listed in the release notes.

## Why this project

My partner is a teacher. Like many of her colleagues, she has been offered the open source office suites at school again and again, and every time she went back to Microsoft Office. Not out of brand loyalty: the alternatives felt unfamiliar, documents from colleagues did not look right, and the habits of years (the ribbon, the shortcuts, where things are) did not work anymore.

They would love an office suite that is open source **and** easy to use. ElixirOffice is an attempt at exactly that: keep the strong, mature engine of an existing open source suite, and rebuild everything people touch so that a Word, Excel or PowerPoint user feels at home on the first day, with documents that look the same as in Microsoft Office.

## What makes it different

- **It behaves like Microsoft Office.** Same ribbon tabs and groups, KeyTips (Alt), mini toolbar, quick access toolbar and contextual tabs, and the same keyboard shortcuts: 228 Word shortcuts on Windows and 171 on macOS, plus Excel and PowerPoint habits. Muscle memory keeps working.
- **Your documents look right.** We measure layout against Microsoft Word on a corpus of real public documents and fix what differs. Free metric-compatible fonts keep line and page breaks without Microsoft fonts, and the fonts installed on your computer are used when you allow it. School fonts (Marelle and Seyes-ruled cursive) are included.
- **Private by design.** No telemetry, no account, nothing sent to the publisher. In the desktop app, documents are converted and edited entirely on your computer.
- **AI only if you want it.** The suite is complete without AI. Ask Elixir can rewrite and restructure documents, write formulas, build charts and pivot tables, or draft slides, with the service of your choice, including one you host yourself. It is off by default and nothing is sent without your consent and an explicit request.
- **Your own cloud.** The server version connects to Murena Workspace and Nextcloud (secure Login Flow, revocable app password): browse, open, save with conflict protection, and co-edit under your real name.
- **International.** 45 interface languages, chosen independently of the document language; 49 spelling dictionaries; a thesaurus in 17 languages; Chinese, Japanese and Korean text.

### More things you will like

- **Signed updates**: the Windows installer and the AppImage install verified updates from inside the app; automatic installation stays off unless you turn it on.
- **Interface size** from 80 % to 200 %, separate from the document zoom.
- **Mail merge** from a CSV or Excel file to one document, one PDF or one PDF per recipient.
- **Comments in the margin** like Word, Track Changes, Outline, Read Mode, Draft view, split window, block selection and fields.
- **AutoCorrect while typing**, spelling suggestions on right-click and an offline thesaurus (Shift+F7).
- **Excel and PowerPoint habits**: Flash Fill (Ctrl+E), Quick Analysis (Ctrl+Q), Auto Fill Options, chart galleries by type; Slide Sorter, sections, Selection pane and Presenter View.
- **PDF made on your computer**, with the fonts you see on screen.
- **Pictures that stay where you put them**, and tables that behave.
- **An optional compact title bar** on Linux/X11.

The complete comparison: [docs/differences.md](docs/differences.md).

## Fast, thanks to an optimised WebAssembly converter

The document converter (the C++ engine that reads and writes .docx, .xlsx, .pptx, .odt, .ods and .odp) is compiled to **WebAssembly** and runs inside the browser or the desktop app:

- native WebAssembly exceptions and a reworked static initialisation halved the module (106 MB to 53 MB) and made large documents open about ten times faster than a plain build;
- a 97-page Word document is converted in about **0.4 s**; saving it takes **0.08 s**;
- the module downloads once, **3.1 MB compressed** (Brotli), then stays in the browser cache;
- PDF export uses the same native PDF writer as the server, in the browser: same quality and same file size as a server-made PDF, with no upload;
- only the fonts a document uses are loaded.

On a modest laptop (Intel i5-8265U), a 97-page document becomes editable in about 3.5 s, layout continues in the background, and typing latency stays around 30 ms. Measurements and methods: [docs/wasm.md](docs/wasm.md), [docs/perf.md](docs/perf.md), [docs/desktop-options.md](docs/desktop-options.md).

## Screenshots

| Word | Excel | PowerPoint |
|---|---|---|
| ![Document editor](docs/screenshots/readme/word-en.png) | ![Spreadsheet editor](docs/screenshots/readme/excel-en.png) | ![Presentation editor](docs/screenshots/readme/powerpoint-en.png) |

![Comments in the margin](docs/screenshots/readme/comments-en.png)

In your language (here French, German and Japanese):

| Français | Deutsch | 日本語 |
|---|---|---|
| ![Word in French](docs/screenshots/readme/word-fr.png) | ![Excel in German](docs/screenshots/readme/excel-de.png) | ![PowerPoint in Japanese](docs/screenshots/readme/powerpoint-ja.png) |

## Two ways to use it

| | Server version | Desktop app |
|---|---|---|
| For | organisations, Murena Workspace / Nextcloud, shared documents | individuals, offline use |
| How | your own server (Docker), in the browser | Windows, macOS (Apple Silicon), Linux |
| Documents | real-time co-editing, cloud storage; optional "convert locally" mode | 100 % local, no document server |
| Available | 0.1.1 beta 1.1 | 0.6.0 |
| Install | [docs/install-server.md](docs/install-server.md) | [docs/desktop.md](docs/desktop.md) |

## Get ElixirOffice

| Version | For whom | Why choose it | Get it |
|---|---|---|---|
| **Desktop app** 0.6.0 | Anyone, on their own computer | Local document editing: no server, no account, documents never leave your computer | [Windows](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-win-x64.exe)<br>[macOS (Apple Silicon)](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-mac-arm64.dmg)<br>[Linux AppImage](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-x86_64.AppImage)<br>[Debian/Ubuntu .deb](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-linux-amd64.deb) |
| **Server version** 0.1.1 (beta 1.1) | Teams, schools, organisations, self-hosters | Editing in the browser, real-time co-editing, Murena Workspace and Nextcloud accounts | [Install guide and files](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1) · Docker image `ghcr.io/leag1234/elixiroffice-server:beta1.1` |

Release notes, checksums and source archives: [desktop 0.6.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.6.0), [server 0.1.1](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1), [all releases](https://github.com/leag1234/elixiroffice/releases). The installers are not publisher-signed yet: see the first-launch tips in [Try it](#try-it).

**Updates.** Once a day at most, the desktop app checks GitHub for a new release (GitHub sees a normal HTTPS connection, including your IP address; no documents, file names or identity are sent). On Windows (installer) and Linux (AppImage), it can then download the update, verify its signature and install it when you choose **Install**; other packages open the release page. Turn checks off in File > Options > Updates.

## Try it

**Desktop app (offline, nothing to install on a server)**

- **Windows**: download the [installer](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-win-x64.exe) and run it. It is not signed yet, so Windows SmartScreen shows a warning: click **More info**, then **Run anyway**.
- **macOS** (Apple Silicon): download the [disk image](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-mac-arm64.dmg), open it and drag ElixirOffice to Applications. It is not notarized yet: if macOS blocks it, open **System Settings > Privacy & Security** and click **Open Anyway**.
- **Linux**: download the [AppImage](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-x86_64.AppImage), make it executable (`chmod +x ElixirOffice-*.AppImage`) and run it; or install the [.deb](https://github.com/leag1234/elixiroffice/releases/download/v0.6.0/ElixirOffice-0.6.0-linux-amd64.deb) with `sudo apt install ./ElixirOffice-*.deb`.

Then create a document or open a .docx, .xlsx, .pptx, .odt, .ods or .odp file, edit it and save: the file stays on your computer.

**Server version (in the browser, for a team or an organisation)**

On a Linux host with Docker and a public DNS name, download the deployment bundle from the [server release](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1) and follow its install guide: an init script generates the secrets, `docker compose up -d` downloads the image from `ghcr.io/leag1234/elixiroffice-server` and starts the suite behind HTTPS. The start page (local files, Murena Workspace and Nextcloud accounts) is off by default and has no user accounts of its own: enable it on a trusted network, behind a VPN or behind your own authentication. AI is off unless you configure it.

## Features

Feature by feature, compared with LibreOffice and ONLYOFFICE: [docs/differences.md](docs/differences.md).

## Release history

| Version | Date | What it is |
|---|---|---|
| [Desktop 0.6.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.6.0) | 2026-10-30 | Improved page breaks in tables; restored the Mailings tab and selection of installed fonts. |
| [Desktop 0.5.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.5.0) | 2026-10-29 | Desktop mail merge, installed and CJK font improvements, spreadsheet fill shortcuts, optional window placement, floating-table and document-opening fixes. |
| [Desktop 0.4.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.4.0) | 2026-10-28 | Optional AI in Word, Spreadsheet and Presentation (off by default); interface size; reading position kept while fonts load; Chinese/Japanese/Korean text with installed fonts. |
| [Desktop 0.3.3](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.3) | 2026-10-27 | Signed in-app updates (Windows installer, AppImage); display language choice; Ctrl+Q no longer quits by accident; Electron security update. |
| [Desktop 0.3.2](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.2) | 2026-10-23 | Optional Linux/X11 compact title bar, controlled release notices, aligned header icons, faster repeated font-name matching and reliable AppImage release tools |
| [Desktop 0.3.1](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.1) | 2026-10-22 | Separate document windows, optional tabs/Home, Office-style start and File commands, remembered placement, equation/menu fixes and opening diagnostics |
| [Desktop 0.3.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.0) | 2026-10-21 | Add document tabs and detach/move; improve dialogs, fonts, ODS chart caches and Linux dependencies |
| [Desktop 0.2.4 beta](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.4) | 2026-10-20 | Improve Windows saving and diagnostics; fix toolbar contrast, page shadows and print feedback |
| [Desktop 0.2.3 beta](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.3) | 2026-10-19 | Fix Debian sandbox permissions on Ubuntu 26.04; clarify platform download links |
| [Desktop 0.2.2 beta](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.2) | 2026-10-19 | Windows save and font fixes, native printing, keyboard and accessibility improvements, RTL Home layouts and converter hardening |
| [Desktop 0.2.1 beta](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.1) | 2026-10-16 | Fixes: opening files after a settings or network-share error, Office-identical shortcuts, Word-like close dialog, Save As redesign, export progress, PDF page rotation |
| [Desktop 0.2.0 beta](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.0) | 2026-10-15 | PDF open, annotate, fill and save; password-protected files; rename and Save a copy folder; computer fonts switch |
| [Server 0.1.1 beta 1.1](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1) | 2026-10-15 | Rename and Save a copy fixes for the server |
| [Desktop 0.1.0 beta 2](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.0-beta.2) | 2026-10-13 | First desktop apps for Windows, macOS and Linux |
| [Server 0.1.0 beta 1](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.0-beta.1) | 2026-10-12 | First public version: self-hosted server |

Details of every change: [CHANGELOG.md](CHANGELOG.md).

## Building from source

- Server image and development environment: [docs/dev.md](docs/dev.md), [docs/images.md](docs/images.md)
- WebAssembly converter: [docs/wasm.md](docs/wasm.md) (`tools/wasm/build.sh`)
- Desktop app: [docs/desktop.md](docs/desktop.md)

## Licence and attribution

ElixirOffice is free software, released under the **GNU Affero General Public License v3.0** ([LICENSE](LICENSE)), the same licence as the projects it derives from.

It is built on **[Euro-Office](https://github.com/Euro-Office)**, itself derived from **[ONLYOFFICE](https://www.onlyoffice.com/)** Docs by Ascensio System SIA. Their copyright notices, licence files and attributions are kept in the source code; see [NOTICE](NOTICE). Bundled fonts, dictionaries, thesauri and icons (Microsoft Fluent UI System Icons, MIT) keep their own free licences: [branding/fonts/LICENSES.md](branding/fonts/LICENSES.md), the dictionaries and thesaurus licence files, and [NOTICE](NOTICE).

ElixirOffice is not affiliated with or endorsed by Microsoft, Ascensio System SIA or the Euro-Office project. Microsoft, Word, Excel and PowerPoint are trademarks of Microsoft Corporation.

## Contributing, bug reports and feedback

Feedback from real users, especially anyone who switched from Microsoft Office, is the most valuable contribution.

- **Report a bug**: open an [issue](../../issues) with the version (Help > About, or the release name), your system and browser, what you did, what you expected and what happened. A screenshot helps. If a document triggers the problem, attach a small example **only if it contains nothing private**; otherwise describe it, or recreate the problem in a new document.
- **"It does not work like in Word / Excel / PowerPoint"**: these reports are welcome as issues too. Tell us what Microsoft Office does (the menu, the shortcut, the result) and what ElixirOffice does instead.
- **Ideas and questions**: use [Discussions](../../discussions).
- **Code**: pull requests are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) first (how to build, run the tests, commit conventions). Changes to the editor engine and interface live in the forked component repositories listed there.

## How it was made

ElixirOffice was initiated and supervised by **Gaël Duval**, and developed with various large language models working as coding agents under his direction. Every change goes through automated test suites, reviews and measurements before it is integrated.

## Corresponding source

Each release ships `elixiroffice-desktop-source.tar.gz` with its complete corresponding source, and the public repositories are tagged at the matching revisions.

| Release | Public tag | Original product revision | Original DocumentServer revision |
|---|---|---|---|
| 0.6.0 (build 23) | [v0.6.0](https://github.com/leag1234/elixiroffice/tree/v0.6.0) | `2b928204a2fd8c1506cd3db0ad4d2626dcdb9633` | `1ee04cad98d024e7054bff4554b53d483c035e40` |
| 0.5.0 (build 21) | [v0.5.0](https://github.com/leag1234/elixiroffice/tree/v0.5.0) | `1de7e6d05e33bf7a8deeb1b74c48e784d6378940` | `24bd9a0943fd6293f23d63a25e7002fe030703ab` |
| 0.4.0 (build 20) | [v0.4.0](https://github.com/leag1234/elixiroffice/tree/v0.4.0) | `52bf9a5426f343efa6b6be22e3d55d7938859c12` | `1bd3bc3989c3ac3ffc53fd6b1204171b8dc4cb4e` |
| 0.3.3 (build 19) | [v0.3.3](https://github.com/leag1234/elixiroffice/tree/v0.3.3) | `6a01f2a0f12e316df3a4ca4a4fdbe6c1bacca8de` | `adc905b591220200bd00907f66cc2d5b9e6144aa` |

The public sources are adapted (private test material removed); every adaptation is recorded in the source archive. Rebuilt binaries may differ byte for byte from the published ones.
