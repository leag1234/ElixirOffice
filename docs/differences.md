# ElixirOffice compared with LibreOffice and ONLYOFFICE

ElixirOffice is an open source office suite that looks and behaves like Microsoft Office. It is based on Euro-Office, itself based on ONLYOFFICE by Ascensio System SIA, and adds its own interface, fonts, privacy choices and optional AI. This page lists the differences a user is likely to notice. Each table compares the same feature in the three suites; a dash (—) means we make no claim. Descriptions of other products reflect what we know and may be out of date: this page is kept up to date as ElixirOffice evolves, and it only describes features that are in published releases (up to desktop 0.4.0). If you find something inaccurate, please [open an issue](https://github.com/leag1234/ElixirOffice/issues).

## In one minute

- **Office habits keep working.** Ribbon, KeyTips, mini toolbar, contextual tabs and the Word, Excel and PowerPoint keyboard shortcuts.
- **Fidelity is measured.** Layout is compared with Microsoft Word on a corpus of public documents, with free metric-compatible fonts and, if you allow it, the fonts installed on your computer.
- **Private by design.** No telemetry and no account. The desktop app converts and edits documents entirely on your computer.
- **AI only if you want it.** Off by default, with the service of your choice (including your own), and nothing is sent without your consent and an explicit request.
- **International.** 45 interface languages, 49 spelling dictionaries, a thesaurus in 17 languages, and Chinese, Japanese and Korean text.
- **Two ways to run it.** A desktop app for Windows, macOS (Apple Silicon) and Linux, or a server version with Murena Workspace and Nextcloud integration.

## Interface and habits

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Interface model | The ribbon of Microsoft Word, with the same tabs, groups, contextual tabs, KeyTips and backstage. | Its own menus and toolbars, with an optional tabbed interface. | A ribbon with its own structure and vocabulary. |
| Familiar title bar and mini toolbar | Word's title bar (AutoSave switch, saved state, command search, Share) and a mini toolbar in table cells in Word's order. | Own layout, no mini toolbar in tables. | Mini toolbar without table commands, no AutoSave switch. |
| Keyboard shortcuts | Every Word shortcut the editor can support works on Windows and macOS, including Repeat (F4), Spike and AutoText. | Partial, with its own defaults. | Partial. |
| Shortcuts the browser reserves | The server version offers alternatives that reach the page, a Keyboard Lock in full screen and a dialog listing them. | Desktop application: no such conflict. | No documented alternatives. |
| Editing objects from the ribbon | Charts, tables, pictures, shapes and equations are edited in their own ribbon tabs; the side panel opens only on request. | Sidebar decks. | A properties panel on the right for most objects. |
| Interface size | 80% to 200%, separate from the document zoom. | — | — |

Learn more: [Keyboard shortcuts](shortcuts.md) and [Interface notes](ui.md).

## Word documents

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Comments | Word-style balloons in the right margin with reply, resolve, edit and delete; a Comments pane on demand. | Comments in the margin (desktop app). | A Comments pane or a floating bubble on the text. |
| Document views | Read Mode, Print Layout, Outline view with level controls, and Draft view, with Word's keys. | Print, Web and outline views (Navigator); no Read Mode. | Print Layout and a read-only mode; no outline or draft view. |
| Fields | Insert an empty field (Ctrl+F9), show codes (Alt+F9), update (F9) and lock fields; locks are saved in .docx. | A Fields dialog. | A field dialog with a code toggle; no empty field or lock. |
| Task panes | Reveal Formatting (Shift+F1), Selection pane (Alt+F10) and an offline Thesaurus (Shift+F7). | A sidebar (Properties, Navigator) and a thesaurus dialog. | No Reveal Formatting or Selection pane; the thesaurus is a plugin. |
| Design tab | Themes, Style Sets, theme colors and fonts, paragraph spacing, watermark, page color and page borders. | Page and paragraph styles with limited document themes. | Color schemes and watermark only. |
| References | Cover pages, Quick Tables, citations and bibliography (APA, MLA), and an index. | A bibliography database and an index with its own interface. | No citations and no index. |
| AutoCorrect | Word's "Replace text as you type" with a typo list per language, plus capitals, quotes and symbols; Ctrl+Z restores what you typed. | An AutoCorrect replacement table. | First letter, quotes and dashes; no typo list. |
| Block selection and split window | Column selection (Alt+drag) and a split window with its own scroll (Ctrl+Alt+S). | Block selection and Window > New Window. | No block selection and no split view. |
| Mail merge | The Mailings tab: recipients from a CSV or XLSX file, preview, and merge to one document, one PDF or one PDF per recipient (server version). | A Mail Merge wizard and toolbar (database or spreadsheet). | Mail merge in the right panel. |

Learn more: [Interface notes](ui.md) and [Keyboard shortcuts](shortcuts.md).

## Spreadsheets

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Excel shortcuts | Every Excel shortcut the editor can serve works on Windows and macOS, including Repeat (F4), End mode, Extend and Add modes, Point mode and Paste Special. | Its own defaults, with partial Excel keys. | Partial, without Repeat, End or Extend modes. |
| Flash Fill and Quick Analysis | Ctrl+E fills a column from examples; Ctrl+Q offers data bars, color scales, icon sets, charts and totals. | No Flash Fill, no Quick Analysis. | None. |
| Auto Fill Options | After a drag, a button next to the filled cells offers Copy Cells, Fill Series, Fill Formatting Only and more. | The fill handle uses the default, with no options button. | None. |
| Chart galleries | Insert > Charts has one gallery button per chart family, with previews by sub-type. | A single Chart button with one long gallery. | — |

Learn more: [Excel shortcuts](shortcuts-excel.md).

## Presentations

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Selection pane | Alt+F10 lists the objects of a slide; you can select, hide, show and rename them. | No Selection pane. | — |
| Sections | Add, rename, collapse and remove sections, in the thumbnails and in the Slide Sorter; saved in PowerPoint files. | No sections: the slides are one list. | — |
| Slide Sorter and Presenter View | A thumbnail grid with drag reorder, and a Presenter View that shows the next slide beside the notes. | Impress has a Slide Sorter. | Neither the sorter nor the next-slide preview. |
| PowerPoint keyboard | PowerPoint keys in text, regroup, pane cycling, and pen, eraser and laser during the show. | Its own defaults. | Several PowerPoint keys missing. |

Learn more: [PowerPoint shortcuts](shortcuts.md) and [Interface notes](ui.md).

## Fonts and fidelity

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Layout fidelity | Measured against Microsoft Word on a corpus of public documents, and tracked as changes land. | Not measured publicly. | — |
| Fonts of your computer | With your consent, documents are laid out with the fonts installed on your computer (Calibri, Cambria, school fonts); nothing is uploaded. | Desktop app only. | Server fonts only in the web editor. |
| School fonts | The Marelle fonts and Seyes-ruled school cursive are included, so teachers' documents show the real letterforms. | Not shipped. | Not shipped. |
| PDF export | The PDF is written on your computer (browser or desktop) with the same fonts as on screen, selectable text and embedded fonts; no upload. | Desktop export with its own layout engine. | The server writes the PDF with its own fonts. |

Learn more: [Fidelity measurement](fidelity.md), [Fonts](fonts.md), [Computer fonts](localfonts.md) and [PDF made in the browser](client-pdf.md).

## Privacy and AI

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Telemetry | None, and no account. Nothing goes to the publisher. | No telemetry by default. | The upstream code has telemetry hooks (disabled in ElixirOffice). |
| Password-protected files | Open, save, change and remove passwords on Word, Excel and PowerPoint files and their OpenDocument equivalents, locally. | — | — |
| Ask Elixir (AI) | Optional. Ask from the search box, right-click or the mini toolbar; edits are proposed and can be undone in one step. | No built-in AI. | An AI plugin, oriented to text. |
| AI configuration | Off by default. You pick any compatible service, including your own; keys are never sent to the browser and consent is requested first. | No AI, or a service chosen by the build. | An AI plugin with a provider list. |

Learn more: [AI features](ai-features.md) and [Passwords](local-passwords.md).

## Desktop app

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Local editing | Documents are converted and edited on your computer, with no server and no account. | A desktop application. | — |
| Save As | A dialog that describes each format and warns before anything is lost or overwritten, in 45 languages. | Native format and destination controls. | A format-button chooser. |
| Windows and tabs | One window per document by default, with optional tabs. | — | One document per window. |
| PDF files | Open, annotate, fill forms and save PDFs. | — | — |
| Display language | Choose the interface language independently of the document language, with a temporary override at startup. | — | — |
| Updates | A daily check for new releases on GitHub (turn it off in Options); signed updates install from inside the app on Windows and Linux AppImage. | — | — |
| Compact title bar | Optional, on Linux/X11. | — | — |

Learn more: [Desktop app](desktop.md) and [Display language](desktop-display-language.md).

## Server and storage

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Your own cloud | Connect Murena Workspace or Nextcloud (secure Login Flow, revocable app password): browse, open, save with conflict copy, and your real name on comments and tracked changes. | Local files, and WebDAV through the file dialog. | Nextcloud, ownCloud and Seafile connectors inside the storage. |
| Convert locally | An opt-in mode in the browser that opens, edits and downloads six Office and OpenDocument formats without sending the file to a conversion server. | A desktop application. | Hosted conversion by default. |
| Self-hosting | A Docker deployment behind HTTPS with an install guide; AI is off unless you configure it. | — | — |

Learn more: [Storage](storage.md), [Server install guide](install-server.md) and [WebAssembly converter](wasm.md).

## Languages and writing tools

| Feature | ElixirOffice | LibreOffice | ONLYOFFICE |
|---|---|---|---|
| Interface and dictionaries | 45 interface languages, 49 spelling dictionaries and a thesaurus in 17 languages. | — | — |
| Spelling correction | Right-click gives up to five suggestions, Ignore All, Add to Dictionary and a Language menu; F7 jumps to the next error. | Suggestions in the context menu and a user dictionary (desktop only). | Three suggestions with "More variants"; add to dictionary in the desktop app only. |
| Language dialog | Word's Language dialog with recent languages, search and "Do not check spelling or grammar". | A Language dialog under Tools > Language. | A 250-entry language list. |

Learn more: [Thesaurus](thesaurus.md) and [Interface notes](ui.md).

## Not yet available / known limits

- **Installers are not signed by a publisher.** Windows SmartScreen warns on first launch; the macOS app is not notarized (use Open Anyway), and macOS support is Apple Silicon only.
- **AppImage on Ubuntu 24.04 and later** may need the Chromium sandbox allowed by the system; the .deb package sets this up.
- **Chinese, Japanese and Korean text** displays correctly when Computer fonts is allowed and such a font is installed; a bundled fallback without it is planned for 0.5.
- **Mail merge in the desktop app** is planned for 0.5; it works in the server version.
- **Offline gaps** in the desktop app: document compare and combine, version history, real-time co-editing, macros and plugins.
- **PDF**: editing the original text of a PDF, OCR and PDF to Word conversion are not supported.
- **Beta software.** The server version is 0.1.1 and complex formatting, fonts and embedded objects can still convert differently: check important documents.

Detailed engineering notes: [historical engineering log](handoff/differences-log.md).
