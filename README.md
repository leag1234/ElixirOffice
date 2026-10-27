# ElixirOffice

## 0.4.0 corresponding-source candidate

This source candidate includes visible Ask Elixir/setup and optional Word,
Spreadsheet and Presentation actions. AI remains off by default: configuration,
consent and an explicit request are required. Interface size80–200% stays separate
from document zoom (#38). Word late-font layout preserves the reading view and
selection while newer editing/navigation takes priority (#37). Pinned Noto Sans
CJK Regular/Bold fallbacks add JP/SC/TC/KR coverage with installed-font priority;
italic is synthesized (#39).

These are source features, not a declaration that a new installer was published
or that every platform/native/performance check passed. The Word observations
are limited to sampled private Windows views and visible selection retention;
no micro-freeze/CPU gain or exact relayout overlap was measured. Mac/native,
provider/model, conversion and CJK typography limits remain separate.

Original product revision:52bf9a5426f343efa6b6be22e3d55d7938859c12.
Original DocumentServer revision:1bd3bc3989c3ac3ffc53fd6b1204171b8dc4cb4e.
The corresponding-source records declare all public adaptations and the public
SDK/Web child revisions. Original package bytes and runtime selections are not
changed by this source preparation; clean rebuild equivalence is not claimed.


## 0.3.3 corresponding-source snapshot

This source snapshot corresponds to ElixirOffice desktop 0.3.3, build 19, from original product `6a01f2a0f12e316df3a4ca4a4fdbe6c1bacca8de` and DocumentServer `adc905b591220200bd00907f66cc2d5b9e6144aa`. Electron is 44.9.1; external build Node stays 22.23.3 and the full/PDF converter pins are unchanged.

This is adapted public corresponding source under independent review. It does not announce publication or certify native platform acceptance. The published release information elsewhere in this document remains historical until the owner completes release review. Original package inputs and public source revisions are recorded separately; rebuilt bytes may differ.


**An open source office suite for people used to Microsoft Office.**

ElixirOffice edits Word, Excel and PowerPoint documents (and their OpenDocument equivalents) with the ribbon, menus, dialogs and keyboard shortcuts of Microsoft Office. It runs as a desktop app that works entirely offline, or in the browser on your own server. It is free software (AGPLv3), private by design, and fast.

> Status: **beta**. Expect rough edges, and please [report them](../../issues). Known limitations are listed in the release notes.

## Get ElixirOffice

| Version | For whom | Why choose it | Get it |
|---|---|---|---|
| **Desktop app** 0.3.2 | Anyone, on their own computer | Local document editing: no server, no account, documents never leave your computer | [Windows](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-win-x64.exe)<br>[macOS (Apple Silicon)](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-mac-arm64.dmg)<br>[Linux AppImage](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-x86_64.AppImage)<br>[Debian/Ubuntu .deb](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-linux-amd64.deb) |
| **Server version** 0.1.1 (beta 1.1) | Teams, schools, organisations, self-hosters | Editing in the browser, real-time co-editing, Murena Workspace and Nextcloud accounts | [Install guide and files](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1) · Docker image `ghcr.io/leag1234/elixiroffice-server:beta1.1` |

Release notes, checksums and source archives: [desktop 0.3.2](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.2), [server 0.1.1](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1). Older versions: [desktop 0.3.1](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.1), [desktop 0.3.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.3.0), [desktop 0.2.4](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.4), [desktop 0.2.3](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.3), [desktop 0.2.2](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.2), [desktop 0.2.1](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.1), [desktop 0.2.0](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.0), [desktop beta 2](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.0-beta.2), [server beta 1](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.0-beta.1). The installers are not signed yet: see the first-launch tips in [Try it](#try-it).

Desktop documents stay on your computer. Check for updates is on by default: at most once per day the app requests release metadata from GitHub (including prereleases); GitHub receives normal HTTPS connection metadata, including your IP address. Disable it in File > Options > Updates. No documents, file names, paths, recent files or user identity are sent. Notes and Download open the release page in your system browser; the app does not download or install updates.

## Release history

| Version | Date | What it is |
|---|---|---|
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

## Why this project

My partner is a teacher. Like many of her colleagues, she has been offered the open source office suites at school again and again, and every time she went back to Microsoft Office. Not out of brand loyalty: the alternatives felt unfamiliar, documents from colleagues did not look right, and the habits of years (the ribbon, the shortcuts, where things are) did not work anymore.

They would love an office suite that is open source **and** easy to use. ElixirOffice is an attempt at exactly that: keep the strong, mature engine of an existing open source suite, and rebuild everything people touch so that a Word, Excel or PowerPoint user feels at home on the first day, with documents that look the same as in Microsoft Office.

## What makes it different

- **It behaves like Microsoft Office.** The same ribbon tabs and groups, KeyTips (Alt), mini toolbar, quick access toolbar, contextual tabs, and the same keyboard shortcuts: 228 Word shortcuts work on Windows and 171 on macOS, including Repeat (F4 / Ctrl+Y), Outline, Read and Draft views, fields, block selection, mail merge, Flash Fill, Quick Analysis, sections and the Slide Sorter. Muscle memory keeps working.
- **Your documents look right.** Layout fidelity to Word is measured on a document corpus, release after release. Free metric-compatible fonts keep line and page breaks without Microsoft fonts, and in Chrome or Edge one click lets the editor use the fonts installed on your computer. School fonts (Marelle and Seyes-ruled cursive substitutes) are included.
- **Private by design.** No telemetry, nothing sent to the publisher. In the desktop app and in the optional "convert locally" mode, documents never leave your computer: they are converted and edited entirely on your machine.
- **AI only if you want it.** The suite is complete without AI. If you configure a model (any OpenAI-compatible service, including Ollama on your own computer), it can work on the structure of your document (styles, lists, tables, table of contents, page setup), with every change shown as a tracked change and undone in one step.
- **Your own cloud: Murena Workspace and Nextcloud.** Connect your Murena Workspace or Nextcloud from the start page (secure Login Flow, revocable app password, nothing stored in the browser): browse, open, save back with conflict protection, recent files, new documents and uploads. Your real name appears on comments, tracked changes and co-editing. An app to edit directly from Nextcloud Files is coming in an upcoming beta, and the connection is coming to the desktop app later.
- **International.** Every feature works in many languages: 45 interface languages, 49 spelling dictionaries (39 languages), a thesaurus in 17 languages.

### More things you will like

- **A compact title bar when you want it**: opt in on Linux/X11 to combine the title or tabs with Quick Access and command search. It stays off by default; Windows, macOS and Wayland keep native frames. [Behavior and qualification](docs/desktop-compact-titlebar.md).
- **Less repeated font matching work**: cached normalized font names reduce the demonstrated large-font-list hot path. The effect on the Windows reporter machine remains unmeasured. [Computer fonts](docs/desktop-system-fonts.md).
- **Release notices under your control**: daily GitHub release metadata, reminders and per-version skipping, with an Options toggle and browser-only release links. [Privacy and checks](docs/desktop-release-notice.md).
- **PDF made on your computer**: Download as PDF and Print create the PDF locally, with the fonts you see on screen.
- **Your computer's fonts**: in Chrome or Edge, one click and the editor uses the fonts installed on your computer, nothing uploaded.
- **Comments in the margin**, like Word: balloons next to the text, reply and resolve in place.
- **Mail merge** from a CSV or Excel file to one document, one PDF or one PDF per recipient.
- **Outline, Read Mode, Draft view, split window, block selection, fields** and the Selection and Reveal Formatting panes.
- **AutoCorrect while typing** and **spelling suggestions on right-click**, in many languages; an offline **thesaurus** (Shift+F7).
- **Pictures that stay where you put them**, and tables that behave (grouped shapes stay in their cell, copied cells keep rotated text and colours).
- **Excel and PowerPoint habits**: Flash Fill (Ctrl+E), Quick Analysis (Ctrl+Q), Auto Fill Options, chart galleries by type, F4 for Repeat and absolute references; Slide Sorter, sections, Selection pane and Presenter View with the next slide.
- **Office keys the browser normally keeps** (Ctrl+W, Ctrl+N, Ctrl+Tab...): install ElixirOffice as an app or use full screen, or use the documented alternatives.
- **AI with your own model**: ask from the search box, a right-click or "/" in the text; any OpenAI-compatible service, including a model running on your own computer.

The complete list: [docs/features.md](docs/features.md).

## Fast, thanks to an optimised WebAssembly converter

The document converter (the C++ engine that reads and writes .docx, .xlsx, .pptx, .odt, .ods and .odp) is compiled to **WebAssembly** and runs inside the browser or the desktop app:

- built with native WebAssembly exceptions and a reworked static initialisation, which cut the module from 106 MB to 53 MB and made large documents open about ten times faster than a plain build;
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
| Available | 0.1.1 beta 1.1 | 0.3.2 |
| Install | [docs/install-server.md](docs/install-server.md) | [docs/desktop.md](docs/desktop.md) |

## Try it

**Desktop app (offline, nothing to install on a server)**

- **Windows**: download the [installer](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-win-x64.exe) and run it. It is not signed yet, so Windows SmartScreen shows a warning: click **More info**, then **Run anyway**.
- **macOS** (Apple Silicon): download the [disk image](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-mac-arm64.dmg), open it and drag ElixirOffice to Applications. It is not notarized yet: if macOS blocks it, open **System Settings > Privacy & Security** and click **Open Anyway**.
- **Linux**: download the [AppImage](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-x86_64.AppImage), make it executable (`chmod +x ElixirOffice-*.AppImage`) and run it; or install the [.deb](https://github.com/leag1234/elixiroffice/releases/download/v0.3.2/ElixirOffice-0.3.2-linux-amd64.deb) with `sudo apt install ./ElixirOffice-*.deb`.

Then create a document or open a .docx, .xlsx, .pptx, .odt, .ods or .odp file, edit it and save: the file stays on your computer.

**Server version (in the browser, for a team or an organisation)**

On a Linux host with Docker and a public DNS name, download the deployment bundle from the [server release](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1) and follow its install guide: an init script generates the secrets, `docker compose up -d` downloads the image from `ghcr.io/leag1234/elixiroffice-server` and starts the suite behind HTTPS. The start page (local files, Murena Workspace and Nextcloud accounts) is off by default and has no user accounts of its own: enable it on a trusted network, behind a VPN or behind your own authentication. AI is off unless you configure it.

## Features

The detailed, benefit-oriented list of what has been built (Word, Excel and PowerPoint parity, fidelity, privacy, AI) is kept up to date in [docs/features.md](docs/features.md). A comparison with LibreOffice and ONLYOFFICE is in [docs/differences.md](docs/differences.md).

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
