# AI layer of the Word editor (Elixir AI)

Updated: 2026-10-06 ("ai2" redesign). Replaces `docs/ai-v0.md` (v0 of 2026-10-05, whose history stays in git).

Branches:
- `elixir/ai2` in `web-apps` and `sdkjs` (worktree `/srv/elixiroffice/wt/ai2`);
- `feat/ai2` in this repository (worktree `/srv/elixiroffice/wt/ai2-repo`).

Reliability work ("aistab" work item, §6.6): `elixir/aistab` in `web-apps` (worktree `/srv/elixiroffice/wt/aistab`) and `feat/aistab` in this repository (`/srv/elixiroffice/wt/aistab-repo`), integrated into `elixir/dev` and `main` on 2026-10-06.

Integrated into `elixir/dev` (sdkjs and web-apps) and `main` on 2026-10-06: the main dev instance (`eo`, port **8080**, `make ai-proxy`) carries the redesign; the test instance `eo-ai2` (port 8092) is stopped. Since the integration, the "Search or ask Elixir" search lives in the shared title bar (`apps/common/main/lib/elixir-chrome/TitleBar.js`): the "Ask Elixir" row only appears there if Elixir AI is loaded in the editor (Word only for now); Excel and PowerPoint keep command search alone.

## 0. In brief

- **Entry points**: there is no longer any need to go to the Elixir tab. You ask Elixir from the title bar search ("Search or ask Elixir"), from the sparkle of the mini toolbar and of the right-click menu (suggestions depending on the selection + free field), or by typing "/" on an empty line. Alt+I (⌃⌥I on macOS) and the Elixir tab remain.
- **Tools**: 35 tools on the document (8 in v0), plus 7 orchestration tools (plan, verification, question, refusal). All validate their arguments, return structured errors and have a deterministic Playwright test (`tools/eval/tools-check.mjs`, 97 checks with the safeguards of §6.6).
- **Planner**: to make the task easy for the model (including, later, a small local model) rather than taking a big model: mandatory structured plan on the first turn, analysis tools that pre-digest the document, recipes for compound requests, verification of the final state with a repair turn.
- **Clear failure**: if the request is impossible, one sentence says what Elixir cannot do and a button offers the closest action. Never a silent "nothing happened". What was done is said plainly ("Heading 1 style applied to 3 paragraphs").
- **Evaluation**: 32 tasks (the 10 from the brief, the 2 real requests from the test user, 20 common teacher requests in French and English), each played 3 times per configuration. Results in §6: **97%** success with gpt-4.1-mini and the scaffolding (84% without), median latency 4.0 s; default model unchanged. Then measured 10 times per task (§6.6): 90% before the reliability work, **98%** after (temperature 0, plan safeguards), no task under 8/10, median latency 3.8 s.

## 1. Entry points

| Entry | Gesture | What happens |
|---|---|---|
| Command bar | **Alt+I** (⌃⌥I on macOS), **Elixir › Ask Elixir** tab | unchanged since v0 |
| Title bar search | **Alt+Q** then type | ribbon commands first; then "Search in the document"; as the last row "**Ask Elixir: "…"**". **Enter** runs the first command found, or sends the request to Elixir if there is no command; **Shift+Enter** always sends to Elixir. The text goes into the command bar with the current selection as context (plan, progress, Accept / Undo changes, revisions, single undo). |
| Mini toolbar | sparkle at the head of the first row | "Ask Elixir" menu: suggestions depending on the selection + free field |
| Right click | "Ask Elixir" after Cut / Copy / Paste (text, table, image menus) | same menu, opened at the context menu's location |
| Empty line | discreet hint "Type / for commands, or ask Elixir" in the only empty paragraph that holds the cursor | typing "/" at the start of an empty paragraph opens a quick menu: Heading 1, Heading 2, Bulleted list, Numbered list, Table, Image, Page break, Ask Elixir…; ↑/↓ and Enter (or Tab) choose; **Esc or any other key closes the menu and the "/" stays typed**; a "/" in the middle of a text opens nothing |

Suggestions of the "Ask Elixir" menu (the label is sent as is as the instruction):
- image selected: Align with text, Center, Place to the right of the text;
- cursor or selection in a table: Add a header row, Sort by… (prefills the field);
- list selected: Turn into a table;
- several paragraphs: Put in two columns, Harmonize the headings, Turn into a bulleted list;
- text: Rephrase, Shorten, Fix spelling and grammar, Translate… (prefills "Translate to").

Screenshots (`docs/screenshots/ai2/`): `search-1-commands-then-ask`, `search-2-ask-elixir`, `search-3-bar-running`, `ask-1-mini-toolbar-menu`, `ask-2-context-menu`, `aEXAMPLE_TOKEN_NOT_VALID`, `aEXAMPLE_TOKEN_NOT_VALID`, `slash-1-hint`, `slash-2-menu`, and the `result-*` results (table of contents, 2×A5, refusal with suggestion).

Test: `node tools/eval/entry-check.mjs [screenshots-folder]` (22 checks: order of the search rows, Enter / Shift+Enter, suggestions by selection type, mini toolbar, right click, hint, "/" menu, Esc, "/" in a text, Alt+I).

Strings: `apps/common/main/lib/elixir-ai/Strings.js`, in 12 languages (en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh). The settings box stays in English and French.

## 2. Architecture

```
web-apps/apps/common/main/lib/elixir-ai/
  Core.js        Settings, Journal, Connector (OpenAI, SSE, tool_choice), Orchestrator (scaffold / direct modes)
  Strings.js     texts of the bar, the entry points and the plain-language summaries, 12 languages
  View.js        command bar (plan, plain-language steps, refusal + suggestion, question, notes), settings + journal
  Controller.js  Elixir tab, Alt+I, ask(text) for the other entry points
web-apps/apps/documenteditor/main/app/elixir-ai/
  WordTools.js   42 tools (schemas, validation, normalization, builder code run by callCommand)
  EntryPoints.js "Ask Elixir" menu, "/" menu, empty-line hint
web-apps/apps/documenteditor/main/app/elixir-chrome/TitleBar.js   "Search or ask Elixir" search
web-apps/apps/documenteditor/main/app/{view,controller}/MiniToolbar.js, controller/WordContextMenus.js   sparkle, menu entry
```

The tools only use the public builder API through `api.callCommand` (ADR `docs/decisions/0001-ai-host.md`). Exceptions, all **read-only** and in a try/catch: the effective font size (`Get_CompiledPr`), the wrapping and alignment of an image (`ParaDrawing`), the revision type of a run (to read the "final" text), the position of a paragraph on the page (`GetPageBounds`) and the format of a list. The entry points read the current paragraph (`GetCurrentParagraph`) and the cursor position (`#id_target_cursor`); they act through ribbon commands (`put_Style`, `onMarkers`, `put_AddPageBreak`…).

### 2.1 Orchestrator

Two modes (`settings.mode`):

**`scaffold` (default)**, the scaffolding that makes the task easy for the model:
1. **Structured plan**: the first turn forces the `submit_plan` tool (`tool_choice` imposed): reformulated goal with its end condition, preconditions to check, ordered steps each tied to a tool. The orchestrator validates the plan (existing tools) and returns a structured error otherwise; the model corrects.
2. **Analysis tools** that pre-digest the document instead of making the model guess from raw text:
   - `get_outline_candidates`: the lines that look like headings, with style, bold, effective size, numbering ("1.", "1.1", Roman, letters) and its depth, capitals, list, and a **suggested level** (0 = document title, 1 = Heading 1…);
   - `get_layout_summary`: pages, format and text area of each section, tables, images (size, wrapping), large texts, overflowing elements;
   - `find_overflowing_elements`: images and tables wider than the text column.
3. **Recipes** in the system message for compound requests: table of contents from unstyled headings, format change (A4 → A5, "2×A5", booklet), fit on one page, apply a style guide, create a worksheet, clean up styles, number the exercises, add a header row, derive in two levels, correct / translate, image to the right of the text.
4. **Execution**: the tools of a turn are executed in order; a plan step left without a successful call is flagged once to the model.
5. **Verification**: after the changes, the orchestrator reads the document state (`document_info` + touched blocks) and gives it to the model with the request and the plan's goal; the model answers `verify_result` (goal reached or list of problems) and, if something is missing, calls **in the same turn** the tools that fix it: **one automatic repair turn**. A goal not reached is displayed to the user ("Not entirely done: …"), never presented as a success.

**`direct`**, the simple loop of v0 with the same tools on the document (no plan, no analysis tools, no recipes, no verification), kept to measure what the scaffolding brings.

In both modes:
- a turn whose calls all succeeded and modified the document ends the action without a concluding turn (`earlyStop`, unless a verification is due);
- the displayed summary is produced **locally** from the tools executed, in the interface language, not by the model;
- "forgiving" arguments: `block` accepted for a tool that expects `from`/`to` and vice versa, `functions.` prefix removed from the plan's tool names;
- the text shown to the model is the **final** text (tracked deletions are excluded): otherwise after a tracked replacement it read "old+new" and wrongly "corrected";
- an image can only be inserted from a URL written by the user (structured refusal otherwise: the model can neither generate nor search for images).

### 2.2 Clear failure mode

- `cannot_do(message, suggestion)`: one sentence in the language of the request, and the closest action, offered as a "Do instead: …" button that launches it.
- `ask_user(question, options)`: a single short question when the request is truly ambiguous, with 2 or 3 answers as buttons; the answer relaunches the clarified request.
- A question about the document ("how many words?", "why did the image jump?") gets an answer in one or two sentences, with no modification.
- No modification and no answer: "Elixir did not change anything."
- Deterministic notes: what is not trackable in Word (columns, layout, sections, header/footer, images, table columns, style definitions) and, after a switch to A5, "To print two A5 pages per A4 sheet, choose "2 pages per sheet" in the print dialog".

## 3. Settings, connector, server-managed mode

Unchanged since v0 (`docs/ai-v0.md` §3 in the history), with:
- `mode` (`scaffold` / `direct`), `earlyStop` (true), `verify` (`always` / `compound`), `maxRounds` (10);
- `sampling` (`deterministic` by default: `temperature: 0` sent, except to `o*` / `gpt-5*` reasoning models which reject it; a 400 refusal that names `temperature` removes it for that model during the session; `default`: nothing is sent, provider values). No `seed` (§6.6);
- `tool_choice` imposed on the first turn in `scaffold` mode;
- indicative prices added for `gpt-5.4` (2.50 / 15.00 $ per million tokens, to be verified).

Managed mode (server configuration, see §7): `make ai-proxy` or `tools/ai-proxy/install.sh <container> [model]` publishes `/elixir-ai/config.json` and an nginx proxy to the configured OpenAI-compatible endpoint with the key from the environment or `.env` (never sent to the browser). **The default model of this mode is `ELIXIR_AI_MODEL`** (or the argument of `install.sh`). Settings saved in the browser take precedence. Verified on `eo-ai2`: the whole evaluation and `entry-check.mjs` run without a key in the browser (`--endpoint managed`) or with the key injected.

## 4. Tools

Tracking: "yes" = Word revision in the name of "Elixir AI"; "no" = no revision type in Word, flagged in the bar and covered by the single undo.

| Tool | Role | Builder API | Tracked |
|---|---|---|---|
| `read_context(from?, to?)` | reread the blocks (style, final text, list, alignment, effective size, images, tables, controls) | `GetElement`, `GetText`, `GetParaPr`… | — |
| `document_info()` | pages, words, characters (and of the selection), heading outline, section layout, header / footer (with `{PAGE}`), overflowing elements, comments | `GetPageCount`, `GetStatistics`, `GetSections` | — |
| `find_text(text, match_case?, whole_word?)` | which blocks contain a text | `ApiParagraph.Search` | — |
| `explain_layout(block)` | page of the block and the previous one, space left at the bottom of the page, keep with next / keep lines together / break before, images | `GetStartPage`, `ToJSON` (+ `GetPageBounds`) | — |
| `get_outline_candidates()` | probable headings and suggested level (§2.1) | read | — |
| `get_layout_summary()` | layout summary (§2.1) | read | — |
| `find_overflowing_elements()` | elements wider than the column | read | — |
| `insert_paragraphs(after, items[{style, text, align?}])` | insert paragraphs (`{DATE}` = today's date) | `CreateParagraph`, `AddElement` | yes |
| `replace_text(block, text, find?, all?)` | replace within a paragraph (all the text without the paragraph mark, or the occurrences) | `GetRange`, `Search`, `Delete`, `AddText` | yes |
| `find_replace(find, replace, match_case?, whole_word?)` | find / replace in the scope, tables included | `Search`, `Delete`, `AddText` | yes |
| `rewrite_blocks(from, to, items)` | replace paragraphs with others (shorten, merge); refuses a paragraph that carries an image | `AddElement`, `ApiRange.Delete` | yes |
| `delete_blocks(from, to)` | delete blocks | `ApiRange.Delete` | yes |
| `apply_style(from, to | blocks, style)` / `apply_styles(changes)` | paragraph style, ranges or exact blocks | `ApiRange.SetStyle` | yes |
| `modify_style(style, font, size_pt, color, bold, italic, align, spacing)` | definition of a style (style guide) | `ApiStyle.GetTextPr/GetParaPr` | no |
| `change_heading_level(from, to, delta)` | raise / lower headings | `ApiRange.SetStyle` | yes |
| `format_text(from, to, find?, bold, italic, underline, strikethrough, caps, font, size_pt, color, highlight)` | character formatting, on blocks or occurrences | `ApiRange.Set*` | yes |
| `format_paragraphs(from, to, align, indents mm, spacing pt, line spacing, keep with next, keep lines together, page break before)` | paragraph formatting | `ApiParaPr.Set*` | yes (sdkjs fix) |
| `set_list(from, to | blocks, kind, level?, format?, start?)` | bullets, numbering, list indent | `CreateNumbering`, `SetNumbering` | yes (sdkjs fix) |
| `change_list_level(from, to, delta)` | list level | `SetNumbering` | yes |
| `insert_table_of_contents(before, levels?)` | real table of contents (TOC field) | `AddTableOfContents` | yes (insertion) |
| `list_to_table(from, to, header, separator?)` | list to table; `header` = column titles, `"first_item"` or `"none"` | `CreateTable`, `SetTableHeader` | yes |
| `create_table(after, rows, header?)` | table | `CreateTable` | yes |
| `table_rows(table, action, row, count?, position?, cells?)` | insert / delete rows | `AddRows`, `RemoveRow` | yes |
| `table_add_header_row(table, titles)` | header row (bold, repeated) | `AddRows`, `SetTableHeader` | yes |
| `table_columns(table, action, column, …)` | insert / delete columns | `AddColumns`, `RemoveColumn` | no |
| `table_format(table, style, header_row, banded_rows, first_column, width_percent, align, column_widths_mm)` | table formatting | `SetStyle`, `SetTableLook`, `SetWidth`, `SetJc` | yes (sdkjs fix), except widths |
| `table_merge_cells(table, rectangle)` | merge | `MergeCells` | no |
| `table_sort(table, column, descending?, numeric?)` | sort rows, header kept | tracked rewrite of the cells | yes |
| `table_set_cells(table, cells)` | fill cells | `Delete`, `AddText` | yes |
| `insert_image(after, url, width_mm?, height_mm?, wrap?, align?)` | image from a URL or a `data:` given by the user, proportions kept | `CreateImage`, `AddDrawing`, `SetWrappingStyle` | yes (insertion) |
| `set_image_layout(block, drawing, wrap, align, width_mm, height_mm)` | wrapping, alignment, size | `SetWrappingStyle`, `SetHorAlign`, `SetSize` | no |
| `fit_content()` | shrink the images and tables that overflow | `SetSize`, `SetWidth` | no |
| `set_page_setup(section?, paper, orientation, all_margins_mm, margins_mm)` | format, orientation, margins | `SetPageSize`, `SetPageMargins` | no |
| `set_columns(from, to, count)` | columns per section | `CreateSection`, `SetEqualColumns` | no |
| `insert_break(after, kind)` | page / column break (tracked), section break (no) | `AddPageBreak`, `CreateSection` | depending on the case |
| `set_header_footer(part, text, align?)` | header / footer; `{PAGE}`, `{NUMPAGES}`, `{DATE}` | `GetHeader/GetFooter`, `AddPageNumber`, `AddPagesCount` | no |
| `add_comment(block, find?, text)` | margin comment in the name of Elixir AI | `ApiRange.AddComment` | — |
| `submit_plan`, `verify_result`, `ask_user`, `cannot_do` | orchestration (§2) | — | — |

Images: another work item works on the stability of their layout (`wt/images`); these tools only use the public API.

### 4.1 sdkjs fixes (`elixir/ai2`, `[upstreamable]`)

1. **The paragraph, table and row builder setters become revisions** (`apiBuilder.js`, `private_KeepPrChange`): with tracking active, `ApiParagraph.SetJc`, `SetSpacingAfter`, `SetIndLeft`, `SetNumbering`, `ApiTable.SetStyle`, `ApiTableRow.SetTableHeader`… replaced the properties with a copy without `PrChange`: nothing was tracked, and an already existing revision was lost.
2. **The revision report forgets undone rows** (`api.js`): after undoing a row insertion, `GetReviewReport` still listed the `RowsAdd`.

Observed and worked around, to be documented upstream: `ApiRange.SetFontSize` expects **points** (its JSDoc says half-points); `ApiParagraph.GetRange(0, n)` has an **exclusive** end; `GetRange()` of a whole paragraph includes the paragraph mark (deleting it in tracked mode merges the paragraph with the next one and the old `replace_text` without `find` lost the inserted text).

## 5. the owner's two real requests

**1. Table of contents from unstyled headings** (`eval/tasks/g-toc-unstyled`). the test user had selected headings and subheadings that were not in a Heading style (bold lines, numbered "1.", "1.1") and asked for a table of contents; v0 only inserted a "Table of contents" paragraph. Expected and obtained behavior: `submit_plan` → `get_outline_candidates` (levels deduced from numbering and formatting) → `apply_styles` Heading 1 / Heading 2 in revision → `insert_table_of_contents` before the first section → plan verification. Criteria: a real TOC field, 3 level-1 entries and 4 level-2 entries in order, headings styled, body still Normal, texts intact, one Ctrl+Z undoes everything.

**2. "Turn this A4 document into 2×A5"** (`eval/tasks/g-a4-to-2xa5`). Interpretation retained: A5 portrait format for all sections, so that "2 pages per sheet" printing gives two A5 on each A4; it is not a two-column layout (error of v0 and of direct mode). Behavior: `set_page_setup` A5 (margins ~15 mm) → `fit_content` (170 mm image and 4-column table brought back to the text column) → `get_layout_summary` to check → print note displayed. Clarification question (`ask_user`) only if the request is truly ambiguous; the evaluation would answer it with the first option. Criteria: all sections A5 portrait, no image nor table wider than the column, plausible page count, texts intact, print instruction displayed, one Ctrl+Z undoes everything.

## 6. Evaluation

### 6.1 Tasks

32 tasks in `eval/tasks/<id>/` (`input.docx` generated by `eval/tools/make_inputs.py` and `make_inputs2.py`, `task.json`, `check.mjs`). The instructions are intentionally French or English (evaluation data); the English meaning of the French ones is given in parentheses:

| Task | Origin | Language | Instruction | Selection |
|---|---|---|---|---|
| `cleanup` | brief (v0) | en | "Clean up this document: real headings for titles, Normal for body" | — |
| `e-add-header-row` | common | en | "Add a header row to this table" | cursor |
| `e-cannot-draw` | common | en | "Draw me an illustration of a cat" | — |
| `e-comment` | common | en | "Add a comment on the paragraph about Paris saying it needs a source" | — |
| `e-date-top-right` | common | fr | « Ajoute la date en haut à droite » (Add the date at the top right) | — |
| `e-fix-spelling` | common | fr | « Corrige les fautes » (Fix the mistakes) | — |
| `e-heading2-exercises` | common | fr | « Mets les titres des exercices en Titre 2 » (Put the exercise titles in Heading 2) | — |
| `e-image-right` | common | fr | « Mets l'image à droite du texte » (Put the image to the right of the text) | — |
| `e-landscape` | common | en | "Put the page in landscape" | — |
| `e-lines-to-bullets` | common | fr | « Transforme ces lignes en liste à puces » (Turn these lines into a bulleted list) | blocks 2-5 |
| `e-list-table-header` | common | fr | « Fais un tableau de cette liste avec en-tête » (Make a table from this list with a header) | blocks 1-4 |
| `e-margin-2cm` | common | fr | « Mets une marge de 2 cm » (Set a 2 cm margin) | — |
| `e-name-date-line` | common | fr | « Ajoute une ligne pour le nom et la date en haut » (Add a line for the name and date at the top) | — |
| `e-number-exercises` | common | fr | « Numérote les exercices » (Number the exercises) | — |
| `e-page-numbers` | common | en | "Add page numbers at the bottom of the page" | — |
| `e-reduce-spacing` | common | fr | « Réduis l'espace entre les paragraphes » (Reduce the space between paragraphs) | — |
| `e-replace-everywhere` | common | fr | « Remplace « Mme Durand » par « Mme Martin » partout » (Replace "Mme Durand" with "Mme Martin" everywhere) | — |
| `e-sort-table` | common | en | "Sort this table by name" | cursor |
| `e-title-big-center` | common | fr | « Mets le titre en gros et centré » (Make the title big and centered) | — |
| `e-two-columns-fr` | common | fr | « Mets ça en deux colonnes » (Put this in two columns) | blocks 2-6 |
| `e-word-count` | common | en | "How many words are in this document?" | — |
| `g-a4-to-2xa5` | the test user | fr | « Transforme ce document A4 en 2×A5 » (Turn this A4 document into 2×A5) | — |
| `g-toc-unstyled` | the test user | fr | « Fais une table des matières avec ces titres et sous-titres » (Make a table of contents with these headings and subheadings) | blocks 2-15 |
| `list-to-table` | brief (v0) | en | "Turn this list into a table with a header row" | blocks 2-6 |
| `r-brand` | brief | fr | « Applique notre charte : titres en bleu foncé #1F3864 et en Arial, texte courant en Calibri 11. » (Apply our style guide: headings in dark blue #1F3864 and in Arial, body text in Calibri 11.) | — |
| `r-exercise-sheet` | brief | fr | « Crée une fiche d'exercices d'une page sur les fractions pour des CM2, avec le corrigé à la fin. » (Create a one-page exercise sheet on fractions for CM2 pupils, with the answer key at the end.) | — |
| `r-explain-image-jump` | brief | fr | « Pourquoi l'image est-elle passée à la page suivante ? » (Why did the image move to the next page?) | — |
| `r-fit-one-page` | brief | fr | « Fais tenir ce document sur une page. » (Make this document fit on one page.) | — |
| `r-illustration` | brief | fr | « Insère cette image sous le titre, centrée, 8 cm de large : https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png » (Insert this image under the title, centered, 8 cm wide: …) | — |
| `r-translate` | brief | fr | « Traduis ce document en anglais en gardant la mise en page. » (Translate this document into English keeping the layout.) | — |
| `r-two-levels` | brief | fr | « Décline cette fiche en deux niveaux : ajoute à la suite une version plus facile pour les élèves en difficulté. » (Derive this sheet in two levels: add after it an easier version for struggling pupils.) | — |
| `two-columns` | brief (v0) | en | "Put this section in two columns" | blocks 2-6 |

The 10 reference tasks of the brief (phase 3, point 6): exercise sheet with answer key (`r-exercise-sheet`), clean-up into styles (`cleanup`), list → table (`list-to-table`), section in two columns (`two-columns`), fit on one page (`r-fit-one-page`), explain why an image jumped (`r-explain-image-jump`), two levels (`r-two-levels`), style guide (`r-brand`), translation keeping the layout (`r-translate`), illustration (`r-illustration`: the image is supplied by URL, no image model being plugged in; "draw me…" is tested as a clear refusal by `e-cannot-draw`).

A run is successful if (1) all the criteria of `check.mjs` pass, on the "final" view of the document (revisions accepted), (2) **a single Ctrl+Z** brings the document back identical as soon as it changed (blocks, texts, styles, sections, layout, comments, no revision left), (3) no console or page error. A clarification question would be answered by its first option (none was asked). The criteria describe what the user wanted, not what a model did; two criteria that were too narrow were widened after reading the answers ("fits" for "does not fit", English months for the date), none to make a substantive failure pass.

### 6.2 Comparison of models and scaffolding

`node tools/eval/run.mjs --tasks all --runs 3 --models gpt-4.1-mini,gpt-5.4-mini,gpt-5.4 --modes scaffold,direct --concurrency 6` (2026-10-06, `eval/results/2026-10-06/`). 6 configurations × 32 tasks × 3 runs = 576 runs. Latency = from Enter to the displayed result (all turns included), measured with 6 browsers in parallel on development host.

| Model | Mode | Success | Tasks 3/3 | Median latency | p90 | Turns (med.) | Tokens (med.) | Estimated cost (med.) |
|---|---|---|---|---|---|---|---|---|
| gpt-4.1-mini | **scaffold** | **93/96 (97%)** | 29/32 | 4.0 s | 7.2 s | 3 | 20,636 | $0.0084 |
| gpt-4.1-mini | direct | 81/96 (84%) | 25/32 | 1.8 s | 2.8 s | 1 | 5,229 | $0.0021 |
| gpt-5.4-mini | scaffold | 91/96 (95%) | 28/32 | 6.7 s | 8.9 s | 4 | 29,692 | $0.0238 |
| gpt-5.4-mini | direct | 90/96 (94%) | 28/32 | 2.0 s | 2.9 s | 1 | 5,316 | $0.0042 |
| gpt-5.4 | scaffold | 93/96 (97%) | 30/32 | 9.6 s | 13.3 s | 5 | 35,898 | $0.0960 |
| gpt-5.4 | direct | 88/96 (92%) | 29/32 | 2.3 s | 3.9 s | 1 | 5,315 | $0.0141 |

What the table shows:
- **The scaffolding makes the gain, not the model size**: gpt-4.1-mini goes from 84% to **97%**; it equals gpt-5.4 with scaffolding (97%) and exceeds gpt-5.4 without (92%). On the owner's two real requests, gpt-4.1-mini succeeds 1/6 without scaffolding and **6/6** with; gpt-5.4 without scaffolding also fails the 2×A5 (0/3: it puts the pages in A5 landscape).
- The 10 brief tasks with gpt-4.1-mini + scaffolding: 28/30 (93%), above the gate 3 threshold (80%).
- Cost of the scaffolding: about +2.2 s (one imposed plan turn and one verification turn) and 4 times more tokens, for 1 cent per action.

**Default choice: `gpt-4.1-mini` in `scaffold` mode** (success first: 97%, on par with gpt-5.4; then latency: 4.0 s against 9.6 s, and cost: 11 times lower). It is also the default model of `tools/ai-proxy/install.sh` and of managed mode. The model and mode remain configurable.

### 6.3 Results per task (successes / 3 · median latency)

| Task | gpt-4.1-mini scaffold | gpt-4.1-mini direct | gpt-5.4-mini scaffold | gpt-5.4-mini direct | gpt-5.4 scaffold | gpt-5.4 direct |
|---|---|---|---|---|---|---|
| `cleanup` | 3/3 · 4.7 s | 3/3 · 2.75 s | **2/3** · 9.62 s | 3/3 · 2.77 s | 3/3 · 12.17 s | 3/3 · 3.7 s |
| `e-add-header-row` | 3/3 · 2.98 s | 3/3 · 1.46 s | 3/3 · 4.3 s | 3/3 · 1.85 s | 3/3 · 7.09 s | 3/3 · 3.31 s |
| `e-cannot-draw` | 3/3 · 3.57 s | 3/3 · 2.17 s | **2/3** · 4.17 s | 3/3 · 1.24 s | 3/3 · 4.07 s | 3/3 · 2.06 s |
| `e-comment` | 3/3 · 3.07 s | 3/3 · 1.46 s | 3/3 · 4.56 s | 3/3 · 1.58 s | 3/3 · 7.94 s | 3/3 · 1.99 s |
| `e-date-top-right` | 3/3 · 3.29 s | 3/3 · 2.19 s | 3/3 · 5.25 s | 3/3 · 1.88 s | 3/3 · 6.15 s | 3/3 · 2.19 s |
| `e-fix-spelling` | 3/3 · 4.36 s | 3/3 · 2.43 s | 3/3 · 6.55 s | 3/3 · 2.16 s | 3/3 · 12.54 s | 3/3 · 2.89 s |
| `e-heading2-exercises` | 3/3 · 3.7 s | **0/3** · 1.67 s | 3/3 · 7.96 s | 3/3 · 2.87 s | 3/3 · 9.66 s | 3/3 · 2.29 s |
| `e-image-right` | 3/3 · 3.15 s | 3/3 · 1.39 s | 3/3 · 6.79 s | 3/3 · 1.95 s | 3/3 · 9.71 s | 3/3 · 2.07 s |
| `e-landscape` | 3/3 · 2.97 s | 3/3 · 1.45 s | 3/3 · 5.65 s | 3/3 · 1.74 s | 3/3 · 8.47 s | 3/3 · 2.14 s |
| `e-lines-to-bullets` | 3/3 · 3.06 s | 3/3 · 1.36 s | 3/3 · 6.8 s | 3/3 · 2.07 s | 3/3 · 7.66 s | 3/3 · 1.85 s |
| `e-list-table-header` | 3/3 · 3.88 s | 3/3 · 2.09 s | 3/3 · 7.4 s | 3/3 · 1.95 s | 3/3 · 10.23 s | 3/3 · 2.55 s |
| `e-margin-2cm` | 3/3 · 4.06 s | 3/3 · 1.55 s | 3/3 · 5.66 s | 3/3 · 1.65 s | 3/3 · 9.02 s | 3/3 · 2.16 s |
| `e-name-date-line` | 3/3 · 5.19 s | 3/3 · 1.69 s | 3/3 · 5.96 s | 3/3 · 1.75 s | 3/3 · 10.16 s | 3/3 · 2.05 s |
| `e-number-exercises` | 3/3 · 4.44 s | **2/3** · 2.1 s | 3/3 · 7.37 s | **1/3** · 1.99 s | 3/3 · 9.81 s | **1/3** · 2.28 s |
| `e-page-numbers` | 3/3 · 3.82 s | 3/3 · 1.37 s | 3/3 · 4.89 s | 3/3 · 1.76 s | 3/3 · 7.28 s | 3/3 · 2.1 s |
| `e-reduce-spacing` | 3/3 · 4.57 s | 3/3 · 1.58 s | 3/3 · 6.39 s | 3/3 · 1.57 s | 3/3 · 9.48 s | 3/3 · 1.96 s |
| `e-replace-everywhere` | 3/3 · 3.72 s | 3/3 · 1.46 s | 3/3 · 6.57 s | 3/3 · 1.76 s | 3/3 · 6.86 s | 3/3 · 2.04 s |
| `e-sort-table` | 3/3 · 3.58 s | 3/3 · 1.47 s | 3/3 · 6.96 s | 3/3 · 1.54 s | 3/3 · 9.79 s | 3/3 · 2.01 s |
| `e-title-big-center` | **2/3** · 3.82 s | **0/3** · 1.56 s | **2/3** · 7.58 s | **2/3** · 1.98 s | 3/3 · 11.32 s | **0/3** · 1.88 s |
| `e-two-columns-fr` | 3/3 · 3.77 s | 3/3 · 1.7 s | 3/3 · 5.55 s | 3/3 · 1.96 s | 3/3 · 9.46 s | 3/3 · 1.95 s |
| `e-word-count` | 3/3 · 2.49 s | 3/3 · 1.64 s | 3/3 · 3.65 s | 3/3 · 2.05 s | **2/3** · 5.66 s | 3/3 · 2.44 s |
| `g-a4-to-2xa5` | 3/3 · 6.56 s | **0/3** · 1.76 s | 3/3 · 8.3 s | 3/3 · 1.78 s | 3/3 · 9.6 s | **0/3** · 2.26 s |
| `g-toc-unstyled` | 3/3 · 7.79 s | **1/3** · 2.74 s | 3/3 · 8.01 s | 3/3 · 2.75 s | 3/3 · 9.42 s | 3/3 · 3.34 s |
| `list-to-table` | 3/3 · 5.76 s | 3/3 · 2.49 s | 3/3 · 7.32 s | 3/3 · 1.88 s | 3/3 · 9.33 s | 3/3 · 2.01 s |
| `r-brand` | 3/3 · 7.89 s | 3/3 · 2.17 s | **1/3** · 8.95 s | 3/3 · 2.92 s | 3/3 · 12.78 s | 3/3 · 3.5 s |
| `r-exercise-sheet` | 3/3 · 8.02 s | **2/3** · 7.11 s | 3/3 · 8.48 s | 3/3 · 3.97 s | 3/3 · 17.15 s | 3/3 · 8.75 s |
| `r-explain-image-jump` | 3/3 · 3.18 s | 3/3 · 2.06 s | 3/3 · 5.86 s | 3/3 · 3.07 s | **1/3** · 7.56 s | 3/3 · 3.87 s |
| `r-fit-one-page` | 3/3 · 5.23 s | 3/3 · 2.42 s | 3/3 · 8.58 s | **1/3** · 2.46 s | 3/3 · 13.47 s | 3/3 · 2.98 s |
| `r-illustration` | **2/3** · 4.99 s | 3/3 · 2.08 s | 3/3 · 7.36 s | 3/3 · 2.46 s | 3/3 · 8.59 s | 3/3 · 2.34 s |
| `r-translate` | **2/3** · 7.18 s | 3/3 · 2.65 s | 3/3 · 7.97 s | **2/3** · 2.51 s | 3/3 · 12.61 s | 3/3 · 3.07 s |
| `r-two-levels` | 3/3 · 4.9 s | **1/3** · 2.78 s | 3/3 · 9.68 s | 3/3 · 2.71 s | 3/3 · 11.94 s | 3/3 · 3.98 s |
| `two-columns` | 3/3 · 3.62 s | 3/3 · 1.45 s | 3/3 · 5.76 s | 3/3 · 1.8 s | 3/3 · 8.99 s | 3/3 · 1.97 s |

### 6.4 Remaining failures and why (retained configuration, gpt-4.1-mini scaffold)

- `e-title-big-center` (1/3): the title was set to the Title style and enlarged, but not centered; the verification did not read the alignment.
- `r-illustration` (1/3): after inserting the image, the model "rewrote" a neighboring paragraph identically; the final text changes by one character.
- `r-translate` (1/3): three tool sends refused by the editor (`editor_busy`, font loading) then replayed, and the single undo did not bring everything back. Fixed afterwards (`fix(ai): wait for the editor to be idle…`): 4/4 on the control rerun (`r-translate`, `r-fit-one-page`, `e-fix-spelling`, 4 runs each, `--runs 4`); `r-exercise-sheet` did 2/4 there (sheet too short, or answer key missing), to be watched.

Typical failures without scaffolding (`direct` mode), which justify the plan, the analysis tools and the recipes: 2×A5 understood as "two columns" (gpt-4.1-mini) or "A5 landscape" (gpt-5.4); table of contents without heading styles applied, or with one level too many; non-contiguous exercise titles styled or numbered over the whole range; title enlarged but not centered (the three models); "easy" version without its own title. With scaffolding, gpt-5.4-mini still asked for a URL instead of calling `cannot_do` (1/3) and missed the style guide (2/3); gpt-5.4 twice answered "why did the image jump?" without a visible answer text.

### 6.5 Latency

The 4.0 s median breaks down into: imposed plan (≈1 s), execution (≈1 to 1.5 s, tools included), verification (≈1 to 1.5 s). Leads if latency becomes the criterion: skip the verification for a plan with a single safe step (`verify: "compound"`, already configurable), group a turn's tools into a single `callCommand`, tool prefix cache (the prefix is already stable).

### 6.6 Reliability: measurement over 10 runs and stabilization (2026-10-06)

**Starting finding.** `cleanup`, `g-toc-unstyled` and `list-to-table` succeeded 3/3 on the test instance (8092) but 5/9 on the main instance (8080), with identical instructions and tools; the main instance additionally contains the fonts, images, spreadsheet and presentation work items.

**Method.**
- 32 tasks × 10 runs, gpt-4.1-mini, `scaffold` mode, 6 browsers in parallel (`run.mjs --runs 10 --concurrency 6 --log-requests 1`). Success per task with a 95% confidence interval (Wilson score, `tools/eval/stats.mjs`): 10/10 gives [72–100%], 8/10 [49–94%]; a difference of 3/3 against 5/9 is therefore not significant on its own.
- `--log-requests 1` records the full body of each request to the model (never the headers, hence never the key); each result keeps the sampling parameters actually sent and a fingerprint of the first request (system message without the date line, user message with the document context, tools).
- A run broken by the infrastructure (Docker network change, provider 5xx / 429) is replayed at most twice and counted (`infraRetries`); none was replayed in measurements C, D and E. In measurement A, 4 failures (`e-margin-2cm` ×3, `e-comment`, `e-sort-table`) come from an `ERR_NETWORK_CHANGED` caused by the startup of the working instance; they are left counted as failures.
- The task criteria were not modified.

**Cause of the 3/3 → 5/9 gap.**
- The connector sent **no** sampling parameter (neither `temperature`, nor `top_p`, nor `seed`, nor `parallel_tool_calls`): everything ran at the provider's temperature 1.
- The first requests are **byte-identical** (date aside) between 8080 and 8092 for the three tasks and `r-illustration`, and identical across all runs of the same task on 8080: same system message, same document context (styles, effective sizes, layout, block index), same tools. Tool results for the same call are identical on both instances (28 out of 28; the 2 differences come from different earlier actions). The body of a failed run on 8080 and of a successful run on 8092 diverges at the assistant's first message: the plan drawn at random.
- Rerun 10 times, the test instance also gets 8/10, 8/10 and 5/10 on these tasks. Fonts and images therefore change nothing in the context given to the model: the gap is temperature-1 sampling on samples of 3, on top of real defects that the 10-run measurement brought to light (below).
- Separately, `r-illustration` failed 4 times out of 10 on both instances: the document server downloads the image and Wikimedia answers it HTTP 429 (docservice log); the image becomes "error" (404 in the console) while Elixir announces a success.

**Systematic failures found (measurement A) and fixes.**

| Failure | Fix |
|---|---|
| `cleanup`: a body-text paragraph (one sentence) in Heading 3 in the original stayed in Heading 3; `get_outline_candidates` presented it as a level-3 heading | `get_outline_candidates` no longer retains a body-text sentence (≥ 50 characters ending with . ; ! …, or > 140 characters, not numbered, excluding "Exercice…", "Partie…"); it is listed separately in `body_text_in_heading_style`, to be set back to Normal; clean-up recipe: one entry per block |
| `g-toc-unstyled`: `apply_styles` on ranges (4-6 in Heading 2) that swept in the body-text paragraph between two subheadings; plan without `get_outline_candidates` | refusal of a heading style (Heading 1-9, Title) on a body-text block, with the offending blocks (body text computed at opening and after each insertion; a selection of one or two paragraphs remains the user's choice); refusal of a table-of-contents plan without `get_outline_candidates` when no heading exists; recipe: one entry per heading line |
| `list-to-table`: `list_to_table` with `header` then `table_add_header_row` (duplicate header, 7 rows) | refusal of the plan that chains the two; `table_add_header_row` refuses a table that already has a header row; recipe clarified |
| `r-brand`: after `modify_style`, `format_text` in Calibri on a range that contained headings (or Arial on text) | refusal of a `format_text` that contradicts a style modified in the same action; recipe: `modify_style` alone in most documents |
| `e-title-big-center`: Title style applied, but not centered (the context omitted the "left" alignment, the verification believed the title centered) | the verification shows `align: "left"` explicitly; "big and centered title" recipe: style + alignment + size |
| `r-exercise-sheet`: exercises as "a) …" lines without exercise titles, answer key missing | recipe: at least 3 exercises "Exercice n : …" in Heading 1, then "Corrigé" followed by the answers, one paragraph per item |
| `r-illustration`: Wikimedia HTTP 429 at download by the server | the browser fetches the image (CORS) and inserts it as `data:`; without CORS, the URL is passed as before |

Verification: after a style change, a deterministic check (`lint`) lists the body-text paragraphs left in a heading style; the orchestrator gives them to the model as "certain problems" (`automatic_checks`, logged).

**Sampling.** `temperature: 0` for gpt-4.1-mini; nothing for reasoning models (gpt-5.4-mini). `seed` rejected: on identical requests, 3 answers out of 8 with `seed` took 11 to 54 s instead of 1.5 to 2.5 s (one-off measurement, same request bodies), with no measurable stability gain over temperature 0. `parallel_tool_calls` left at its default (true): the verification and its corrections, and paragraph-by-paragraph translations, go through in a single turn. Temperature 0 is not strictly deterministic at OpenAI (plan lengths differing from one call to another), hence the safeguards. Self-consistency (several plans voted on) not retained: at temperature 0 the draws are almost identical and the cost would be multiplied.

**Results (successes / 10 [95% CI] · median latency).** A: `elixir/dev` before, on 8080. B: same code, `temperature: 0` alone (`--extra`), on 8080. C: safeguards and recipes, temperature 1 (`--sampling default`), working instance (8094, same base code, same fonts). D: safeguards and recipes + temperature 0, 8094. E: D integrated into `elixir/dev`, 8080 rebuilt.

| Task | A. before (:8080) | B. temperature 0 alone (:8080) | C. safeguards, temperature 1 | D. safeguards + temperature 0 | E. integrated (:8080) |
|---|---|---|---|---|---|
| `cleanup` | 9/10 [60–98%] 5.2 s | 10/10 [72–100%] 5.2 s | 10/10 [72–100%] 6.3 s | 10/10 [72–100%] 6.2 s | 10/10 [72–100%] 8.7 s |
| `e-add-header-row` | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.8 s |
| `e-cannot-draw` | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.4 s |
| `e-comment` | 9/10 [60–98%] 3.1 s | 10/10 [72–100%] 4.6 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.2 s |
| `e-date-top-right` | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.7 s |
| `e-fix-spelling` | 10/10 [72–100%] 3.9 s | 10/10 [72–100%] 4.8 s | 10/10 [72–100%] 4.1 s | 10/10 [72–100%] 3.8 s | 10/10 [72–100%] 4.1 s |
| `e-heading2-exercises` | 10/10 [72–100%] 3.5 s | 10/10 [72–100%] 4.1 s | 10/10 [72–100%] 3.5 s | 10/10 [72–100%] 3.7 s | 10/10 [72–100%] 3.5 s |
| `e-image-right` | 10/10 [72–100%] 3.5 s | 10/10 [72–100%] 3.8 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.4 s |
| `e-landscape` | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 2.9 s | 10/10 [72–100%] 3.0 s |
| `e-lines-to-bullets` | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.1 s |
| `e-list-table-header` | 10/10 [72–100%] 3.6 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.6 s |
| `e-margin-2cm` | 7/10 [40–89%] 3.4 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.8 s |
| `e-name-date-line` | 10/10 [72–100%] 3.8 s | 10/10 [72–100%] 3.5 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 4.5 s |
| `e-number-exercises` | 10/10 [72–100%] 4.8 s | 10/10 [72–100%] 4.2 s | 9/10 [60–98%] 4.3 s | 10/10 [72–100%] 3.4 s | 8/10 [49–94%] 4.9 s |
| `e-page-numbers` | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 2.9 s | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 3.6 s |
| `e-reduce-spacing` | 10/10 [72–100%] 3.8 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.6 s |
| `e-replace-everywhere` | 10/10 [72–100%] 3.9 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.2 s | 10/10 [72–100%] 3.4 s |
| `e-sort-table` | 9/10 [60–98%] 3.8 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.9 s |
| `e-title-big-center` | 6/10 [31–83%] 3.4 s | 3/10 [11–60%] 3.3 s | 10/10 [72–100%] 3.8 s | 10/10 [72–100%] 4.0 s | 10/10 [72–100%] 4.8 s |
| `e-two-columns-fr` | 10/10 [72–100%] 3.6 s | 10/10 [72–100%] 3.5 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.6 s |
| `e-word-count` | 10/10 [72–100%] 3.0 s | 10/10 [72–100%] 2.5 s | 10/10 [72–100%] 2.6 s | 10/10 [72–100%] 2.6 s | 10/10 [72–100%] 3.2 s |
| `g-a4-to-2xa5` | 10/10 [72–100%] 5.2 s | 10/10 [72–100%] 5.1 s | 10/10 [72–100%] 4.8 s | 10/10 [72–100%] 4.4 s | 10/10 [72–100%] 4.5 s |
| `g-toc-unstyled` | 8/10 [49–94%] 6.8 s | 9/10 [60–98%] 6.4 s | 10/10 [72–100%] 7.5 s | 10/10 [72–100%] 7.4 s | 10/10 [72–100%] 6.7 s |
| `list-to-table` | 4/10 [17–69%] 5.2 s | 8/10 [49–94%] 3.6 s | 10/10 [72–100%] 3.9 s | 10/10 [72–100%] 3.6 s | 10/10 [72–100%] 3.7 s |
| `r-brand` | 3/10 [11–60%] 7.3 s | 7/10 [40–89%] 6.3 s | 9/10 [60–98%] 6.5 s | 10/10 [72–100%] 5.5 s | 10/10 [72–100%] 4.9 s |
| `r-exercise-sheet` | 7/10 [40–89%] 9.2 s | 8/10 [49–94%] 12.2 s | 8/10 [49–94%] 11.4 s | 10/10 [72–100%] 8.9 s | 8/10 [49–94%] 10.8 s |
| `r-explain-image-jump` | 10/10 [72–100%] 3.6 s | 10/10 [72–100%] 3.1 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.9 s |
| `r-fit-one-page` | 9/10 [60–98%] 4.6 s | 9/10 [60–98%] 4.1 s | 10/10 [72–100%] 4.9 s | 9/10 [60–98%] 6.1 s | 9/10 [60–98%] 8.8 s |
| `r-illustration` | 6/10 [31–83%] 3.9 s | 7/10 [40–89%] 3.8 s | 8/10 [49–94%] 3.8 s | 10/10 [72–100%] 3.7 s | 10/10 [72–100%] 4.6 s |
| `r-translate` | 10/10 [72–100%] 5.4 s | 10/10 [72–100%] 5.2 s | 8/10 [49–94%] 5.1 s | 10/10 [72–100%] 5.0 s | 9/10 [60–98%] 5.2 s |
| `r-two-levels` | 10/10 [72–100%] 5.5 s | 10/10 [72–100%] 5.5 s | 10/10 [72–100%] 4.7 s | 10/10 [72–100%] 4.8 s | 10/10 [72–100%] 6.4 s |
| `two-columns` | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.4 s | 10/10 [72–100%] 3.3 s | 10/10 [72–100%] 3.7 s |
| **TOTAL** | 287/320 [86–93%] 3.7 s | 301/320 [91–96%] 3.5 s | 312/320 [95–99%] 3.5 s | 319/320 [98–100%] 3.5 s | 314/320 [96–99%] 3.8 s |
| **tasks under 80%** | 6 | 3 | 0 | 0 | 0 |

Reading:
- Temperature 0 alone (B) helps (90 → 94%) but degrades `e-title-big-center` (6 → 3/10: the model always takes the same wrong plan); it is only kept with the safeguards. The safeguards alone (C) give 98%; both together (D) 319/320, and each task holds or improves compared with C, except `r-fit-one-page` (10 → 9, within noise).
- Integrated on 8080 (E): **314/320 (98%, CI 96–99%)**, no task under 8/10, median latency 3.8 s (3.7 s before). Remaining failures: `e-number-exercises` 8/10 (one numbered text line in addition to the exercise titles), `r-exercise-sheet` 8/10 (exercise titles in Normal, or a single exercise before the answer key), `r-fit-one-page` 9/10 (body reduced to 8 pt instead of going through the margins first), `r-translate` 9/10 (a list style lost). `e-number-exercises` goes from 10/10 (A) to 8/10: to be watched (the difference is not significant over 10 runs).
- gpt-5.4-mini (3 runs per task, on 8080 after integration, without temperature): **94/96 (98%)**, median latency 5.9 s; failures on `e-fix-spelling` and `e-reduce-spacing` (once each). gpt-4.1-mini remains the default model (same success, lower latency and cost).

Results: `eval/results/2026-10-06-aistab/` (`summary-*.json` and `runs-*.json`, one line per run: task, success, latency, failed criteria, tools called; the request bodies, 50 MB per measurement, stay on development host in `/srv/elixiroffice/wt/aistab-work/*/requests/`).

## 7. Adding a task from a user's AI log

When the test user (or a tester) sends a failure:
1. They export their log: **Elixir › AI Log › Export (JSON)** tab; the file never contains the key. They attach the document (or an anonymized version).
2. Find the entry: `prompt` (the instruction), `scope` (selection or document, blocks `from`-`to`), `mode`, `model`, `plan`, `rounds[].tool_calls` (tools, arguments, results), `verification`, `outcome`.
3. Create `eval/tasks/<id>/`:
   - `input.docx`: the user's document, or a reconstruction in `eval/tools/make_inputs2.py` (standard library, see the functions `p()`, `table()`, `picture()`) if the document is private; never commit a real document (repository rule for `corpus/`);
   - `task.json`: `instruction` = the entry's `prompt`, `select` = `[from, to]` if `scope.kind` is `selection` (or `cursor`, `selectDrawing`), `kind: "user"`, `notes` = what was expected;
   - `check.mjs`: script-verifiable criteria on the snapshot (`tools/eval/lib.mjs`, `final` view = the document once revisions are accepted) with the helpers of `eval/tools/checks.mjs`; write the criterion of what the user wanted, not of what the model did.
4. Replay: `node tools/eval/run.mjs --tasks <id> --runs 3`, then the full suite to check nothing was broken.
5. If the failure comes from a tool (misunderstood argument, impossible operation), first fix the tool or its description, or add a recipe, before thinking of a bigger model.

## 8. Observed limits

- Columns, layout, sections, header / footer, style definitions and image geometry: **no revision type in Word**; flagged, and the single undo covers them.
- No acceptance by author (v0); no public reset of direct size or font (v0).
- The text of a partially selected paragraph is sent with the whole paragraph, plus the selected text separately.
- No image generation nor search: `cannot_do` with a suggestion (the image of a given URL can be inserted).
- "2 pages per sheet" printing belongs to the browser / system print dialog: the editor has no imposition setting; Elixir says so.
- The layout positions read for `explain_layout` are internal (read-only).
- Co-editing during an AI action: not tested; providers other than OpenAI: not tested in this redesign.

## 9. Running and testing

```bash
# instance
cd /srv/elixiroffice/wt/ai2/develop && ./eo.sh up ai2 8092
/srv/elixiroffice/wt/ai2-work/build.sh sdkjs-full web-apps-full example   # first time
/srv/elixiroffice/wt/ai2-work/build.sh sdkjs web-apps                     # afterwards
tools/ai-proxy/install.sh eo-ai2 [model]                               # server-managed mode

# tests (in this repository; EO_BASE defaults to http://localhost:8080, the main instance)
node tools/eval/ui-check.mjs            # bar, Alt+I, Ctrl+K, unconfigured or managed
node tools/eval/entry-check.mjs [dir]   # entry points (§1)
node tools/eval/tools-check.mjs         # 42 tools and safeguards without a model (97 checks)
node tools/eval/run.mjs --tasks all --runs 10 [--models m1,m2] [--modes scaffold,direct] [--concurrency 6] [--endpoint managed] [--log-requests 1] [--sampling default]
node tools/eval/stats.mjs [--md] <results A> [<results B> …]   # success per task, 95% CI, median latency
python3 eval/tools/make_inputs.py && python3 eval/tools/make_inputs2.py   # input documents
```

## 7. Configuration: AI is off unless configured (distribution without an API key)

Added 2026-10-09 (branches `elixir/aiconfig` in DocumentServer, web-apps and sdkjs; `feat/aiconfig` here; tests `tests/ai-config/config.mjs`). The product promise holds by default: **nothing is sent anywhere until someone configures a model**, and nobody has to: the editor works fully without AI.

### 7.1 States

| State | How | What the user sees |
|---|---|---|
| Off (default) | no server configuration, nothing saved in the browser | no Elixir tab, no sparkle on the mini toolbar, no "Ask Elixir" in the right-click menu, no "/" menu or hint, the search box is a plain "Search" with one discreet row "Set up AI…" (also on Alt+I's bar); **zero AI network calls**, no console error (the server answers `/elixir-ai/config.json` with `{"enabled":false}`) |
| Server | `ELIXIR_AI_*` (§7.2) | every entry point on, no key in the browser |
| User | File > AI page (§7.3) | every entry point on, requests go straight from the browser to the user's endpoint |

The user's own configuration takes precedence over the server's; when the user has one, the browser does not even request `/elixir-ai/config.json`.

### 7.2 Administrator (server)

Three variables, in the container environment (image: `docker run -e ...`, compose `environment:`), or in `.env` / the file named by `ELIXIR_AI_ENV` for the dev tooling (template: `.env.example`):

| Variable | Meaning |
|---|---|
| `ELIXIR_AI_BASE_URL` | base URL of an OpenAI-compatible API: `https://api.openai.com/v1`, `https://api.mistral.ai/v1`, `http://ollama-host:11434/v1`, a vLLM server, an internal gateway. `http://` or `https://`, letters, digits and `. _ : - / %` only |
| `ELIXIR_AI_MODEL` | model name sent with each request (default `gpt-4.1-mini` for `api.openai.com` only; required otherwise) |
| `ELIXIR_AI_API_KEY` | key for that endpoint; empty is fine for Ollama and keyless gateways |
| `OPENAI_API_KEY` | legacy: alone, means OpenAI with `gpt-4.1-mini` |

How it works: `build/scripts/standalone/elixir-ai-conf.sh` (in DocumentServer) turns the variables into the nginx include `/etc/nginx/includes/ds-elixir-ai.conf` (mode 600): `/elixir-ai/config.json` (`{"enabled":true,"endpoint":"/elixir-ai/v1","model":...,"managed":true,"host":...}`, **never the key**; `host` is only used for the notice "Your text is sent to this server, which forwards it to <host>") and `POST /elixir-ai/v1/chat/completions` proxied to `BASE_URL/chat/completions` with the `Authorization` header added, cookies and client IP removed. Invalid values keep AI off and are reported on stderr. The image entrypoint runs the script at each start when a variable is set; with none set it writes the "off" include only if there is none (an include written by an operator, or by `tools/demo/container-setup.sh`, is kept). The dev container uses `make ai-proxy` (`CONTAINER=eo-<item>` for another one), which feeds the same script.

Admin check: `make ai-check [SERVER=http://host:port]` (`tools/ai-proxy/check.sh`): prints the configuration (the key is never shown), calls the provider with a one-token request (reachability, key, model), then checks the server: `config.json` consistent with the configuration and free of the key, and a request through the proxy. "AI is OFF" is a valid answer (exit 0).

### 7.3 User (File > AI)

When the server has no configuration (or the user prefers their own service): **File > AI** (listed with Options; "Set up AI…" in the search box, on Alt+I's bar and in the Elixir tab's settings leads to the same page). Provider presets (OpenAI-compatible service, OpenAI, Mistral, **Ollama on this computer** `http://localhost:11434/v1`), service URL, model, API key, advanced (extra parameters, maximum rounds), **Test connection**, Remove settings. The key and settings are stored **only in this browser** (`localStorage`, `elixir-ai-settings`, labelled as such, in clear text on the user's computer); the key is sent only to the endpoint typed there. A live notice says where the text goes: "Your text is sent to <host>." (server mode: "…to this server, which forwards it to <host>."; off: "AI is off. No text leaves your computer.").

CORS: the browser calls the endpoint directly, so the endpoint must allow this site's origin. OpenAI and Mistral do. For **Ollama**, start it with `OLLAMA_ORIGINS` set to the address of the ElixirOffice site (for example `OLLAMA_ORIGINS=https://office.example.org ollama serve`); the page shows the reminder, and Test connection says so when the browser blocks the call. Mixed content: an `https://` ElixirOffice site cannot call an `http://` endpoint other than `localhost`; use a server configuration (the server then makes the call) or an `https://` endpoint.

Strings: `Strings.js`, 12 languages (en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh).

### 7.4 Public demo

Unchanged: `tools/demo/container-setup.sh` writes its own `ds-elixir-ai.conf` (client configuration `{"endpoint":"/elixir-ai/v1","model":...,"managed":true}`, no `enabled` field, read as enabled), the gateway in front holds the key and the limits. The new image entrypoint keeps an include that already exists. Checked by `tests/ai-config/config.mjs` (a configuration without `enabled` is a server configuration) and by the generator's tests.

### 7.5 Tests

`tests/ai-config/config.mjs` (42 checks, instance container with docker access, local mock OpenAI-compatible server, no real key): generator (invalid values keep AI off, key only in the proxy block, keyless Ollama, legacy variable); **A** no configuration (no AI entry point, "Set up AI…" opens the page, only same-origin `config.json`, no console error); **B** server configuration (entry points on, key and model added by the proxy, nothing secret in the browser); **C** user configuration (presets, notice, CORS hint, Test connection direct to the endpoint, Save without reload, Remove); **D** the demo's include (no `enabled` field) still means AI on. `tools/eval/entry-check.mjs` and `ui-check.mjs` now store a placeholder endpoint in the browser (they need AI on); `EO_MANAGED=1` makes entry-check use the server's configuration instead.
