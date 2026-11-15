# Microsoft Office feature gap

Inventory of the Microsoft Office desktop ribbons (Word, Excel, PowerPoint) compared with ElixirOffice 0.8.0, to drive the next development months. Date: 2026-11-15. Branch `eo/office-gap`, not merged.

## How it was made

- **Microsoft side.** Word, Excel and PowerPoint desktop (Microsoft 365, Office 16.0 build 20326, English interface, on the dedicated Windows 10 test PC) were driven with UI Automation. For each app a blank document was opened, every ribbon tab was selected, and tab > group > control was dumped with name, AutomationId (the idMso), control type, split or dropdown flags, and the items of dropdowns and galleries one level deep. Contextual tabs were triggered through COM: table, picture, shape, text box, chart, SmartArt, equation, header and footer, outline (Word); table, slicer, chart, picture, shape, sparkline, pivot table (Excel); table, picture, shape, text box, chart, SmartArt, slide master, handout master, notes master (PowerPoint). The File page list was dumped for the three apps and the Options categories for Word and PowerPoint. The raw JSON dumps are kept outside the repository.
- **ElixirOffice side.** The ribbon DOM of the 0.8.0 Linux desktop build (`rc75`, English, 1360 px wide) was extracted for docx, xlsx and pptx, including the hidden contextual panels. The ribbon audit tool (`tools/qa/ribbon-audit.cjs`) reports layout findings only, not controls, so a copy of it was extended to dump the panels. Features without a ribbon button were checked in the code (web-apps, sdkjs) before being called missing; those checks are cited in the notes. Parity docs used: `docs/parity-roadmap.md`, `docs/differences.md`, `docs/shortcuts.md`.
- **Matching** is by function, not by label. Status: **present** (same function, even if the layout or the number of presets differs), **partial** (part of the function, the note says what is missing), **missing**, **n/a** (Microsoft cloud services or legacy features; the note says whether a local or optional equivalent makes sense).
- **Effort** follows `docs/parity-roadmap.md`: S = hours to 1 day of agent work, M = 2 to 4 days, L = 1 to 2 weeks. **Value** is for typical office users, teachers and SMEs (H, M, L). **Layer**: `ui` web-apps only, `sdk` sdkjs engine, `fmt` x2t file format, `desk` desktop shell, `svc` external service, combinations with `+`.
- **Limits.** The ribbon was dumped at the widest window the PC allowed, so no group was collapsed except where noted. Developer and Draw tabs of Word, the Header & Footer tab of Excel, video and audio tabs of PowerPoint, and ink tools are hidden by default or need user actions and were not dumped (see "Not dumped"). The 0.8.0 ribbon predates later commits on main (Read Aloud and Thesaurus buttons in Word Review are counted as present).

## Summary

| App | Controls compared | Present | Partial | Missing | n/a | Present or partial |
|---|---|---|---|---|---|---|
| Word | 408 | 272 | 33 | 90 | 13 | 77% of the 395 controls that are not n/a |
| Excel | 391 | 180 | 72 | 104 | 35 | 70% of the 356 controls that are not n/a |
| PowerPoint | 392 | 183 | 40 | 148 | 21 | 60% of the 371 controls that are not n/a |
| Total | 1191 | 635 | 145 | 342 | 69 | |

A control counts once per tab (the same Arrange group repeated in several contextual tabs is counted in each tab). Spin-box helpers (More / Less) are not counted. "Present" means the function exists, not that it is identical: galleries usually have fewer presets, and some controls live in the side panel or a dialog instead of the ribbon.

Per tab:

| App | Tab | Present | Partial | Missing | n/a |
|---|---|---|---|---|---|
| Word | Home | 35 | 4 | 3 | 2 |
| Word | Insert | 21 | 4 | 3 | 1 |
| Word | Design | 8 | 0 | 2 | 0 |
| Word | Layout | 19 | 2 | 0 | 0 |
| Word | References | 17 | 1 | 4 | 1 |
| Word | Mailings | 9 | 2 | 10 | 0 |
| Word | Review | 14 | 4 | 2 | 1 |
| Word | View | 12 | 2 | 11 | 1 |
| Word | Help | 0 | 1 | 0 | 5 |
| Word | Table Design | 12 | 0 | 3 | 0 |
| Word | Table Layout | 32 | 0 | 3 | 0 |
| Word | Picture Format | 16 | 3 | 7 | 0 |
| Word | Shape Format | 18 | 3 | 7 | 0 |
| Word | Chart Design | 3 | 3 | 2 | 1 |
| Word | Format | 15 | 3 | 9 | 0 |
| Word | SmartArt Design | 0 | 0 | 13 | 0 |
| Word | Equation | 17 | 0 | 2 | 0 |
| Word | Header & Footer | 11 | 1 | 7 | 1 |
| Word | Outlining | 13 | 0 | 2 | 0 |
| Excel | Home | 43 | 3 | 1 | 0 |
| Excel | Insert | 17 | 3 | 5 | 2 |
| Excel | Draw | 4 | 4 | 5 | 4 |
| Excel | Page Layout | 20 | 3 | 4 | 0 |
| Excel | Formulas | 21 | 0 | 3 | 4 |
| Excel | Data | 10 | 6 | 9 | 4 |
| Excel | Review | 5 | 2 | 8 | 3 |
| Excel | View | 11 | 2 | 16 | 1 |
| Excel | Automate | 0 | 0 | 0 | 3 |
| Excel | Help | 0 | 1 | 0 | 7 |
| Excel | Table Design | 13 | 0 | 1 | 5 |
| Excel | Slicer | 5 | 9 | 2 | 0 |
| Excel | Chart Design | 3 | 3 | 2 | 0 |
| Excel | Format | 7 | 8 | 10 | 0 |
| Excel | Picture Format | 1 | 2 | 11 | 0 |
| Excel | Shape Format | 7 | 9 | 7 | 0 |
| Excel | Sparkline | 0 | 13 | 4 | 0 |
| Excel | PivotTable Analyze | 4 | 4 | 16 | 2 |
| Excel | Design | 9 | 0 | 0 | 0 |
| PowerPoint | Home | 41 | 3 | 5 | 2 |
| PowerPoint | Insert | 17 | 2 | 7 | 0 |
| PowerPoint | Draw | 5 | 4 | 6 | 3 |
| PowerPoint | Design | 4 | 1 | 3 | 1 |
| PowerPoint | Transitions | 8 | 0 | 1 | 0 |
| PowerPoint | Animations | 11 | 0 | 1 | 0 |
| PowerPoint | Slide Show | 5 | 0 | 7 | 4 |
| PowerPoint | Record | 0 | 1 | 9 | 1 |
| PowerPoint | Review | 8 | 0 | 2 | 3 |
| PowerPoint | View | 10 | 2 | 12 | 0 |
| PowerPoint | Help | 0 | 1 | 0 | 5 |
| PowerPoint | Table Design | 7 | 2 | 11 | 0 |
| PowerPoint | Table Layout | 18 | 8 | 4 | 0 |
| PowerPoint | Picture Format | 12 | 3 | 10 | 1 |
| PowerPoint | Shape Format | 14 | 4 | 6 | 0 |
| PowerPoint | Chart Design | 2 | 1 | 5 | 1 |
| PowerPoint | Format | 12 | 4 | 9 | 0 |
| PowerPoint | SmartArt Design | 0 | 0 | 14 | 0 |
| PowerPoint | Notes Master | 0 | 0 | 16 | 0 |
| PowerPoint | Handout Master | 0 | 0 | 15 | 0 |
| PowerPoint | Slide Master | 9 | 4 | 5 | 0 |

Reading the numbers: Word is the closest (home, insert, layout, references, review and the table, header and footer and outline tabs are largely there). Excel is strong on the Home, Formulas and Pivot Design tabs and weak on Data (Power Query, What-If, Consolidate, Advanced Filter), view windows, and the contextual tabs of sparklines, slicers and pivot tables. PowerPoint is weak on the Record and Slide Show recording features, the master views, picture editing and the table, picture, chart and SmartArt contextual tabs. Across the three apps the same families recur: gallery-style controls (shape, picture, chart and WordArt styles), the effects beyond shadow, the accessibility checker, and window management.

## Prioritized backlog (top 40)

Order: high value with small or medium effort first, then medium value, then the large items. Items 1 to 15 are the suggested next batch.

| # | App | Feature | What is missing | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| 1 | Excel | Pivot Group Field / Group Selection / Ungroup (dates by month, quarter, year; numeric ranges) | Engine has `asc_groupPivot` and `asc_ungroupPivot`; no ribbon button or dialog | S | H | ui |
| 2 | Word, Excel, PowerPoint | Chart ribbon: Add Chart Element menu (axes, titles, labels, legend, gridlines, trendline, error bars), Quick Layout, Change Colors, Chart Styles gallery | Done in 0.9.0 except the data table (stored but not drawn by the engine) and, in Word and PowerPoint, Switch Row/Column and Select Data (they need the data editor) | M | H | ui |
| 3 | Word, Excel, PowerPoint | Accessibility Checker (Review): missing alt text, heading order, table headers, merged cells, contrast, document language | No checker anywhere (only alt-text buttons); relevant for schools and public-sector customers | L | H | sdk+ui |
| 4 | Excel | Review tab proofing: Spelling and Thesaurus buttons, Workbook Statistics; Previous/Next Comment and Show Comments | Spell check works (F7, context menu) but has no ribbon entry; the Review tab has only comments, protect and history | S | H | ui |
| 5 | PowerPoint | Table ribbon: Borders menu, pen style/weight/colour, Draw Table, Eraser, Row Height and Column Width boxes, Cell Margins, Text Direction, Table Size | All of it is only in the Format pane today; Word already has most of these controls | S | H | ui |
| 6 | Word | Sort (paragraphs, lists, table rows by text, number, date) | Done on branch eo/word-sort: Home > Paragraph and Table Layout > Data; not sorted yet: tables with merged cells or nested tables (clear message), fields chosen by regular expression | M | H | sdk+ui |
| 7 | Word, Excel, PowerPoint | WordArt text styles in Shape Format and chart Format: Quick Styles, Text Fill, Text Outline | Insert > Text Art exists; the contextual group is absent (settings only in the side panel) | S | M | ui |
| 8 | Word, Excel, PowerPoint | Shape Styles gallery and Picture Styles gallery | Fill, outline and effects are buttons; no preset gallery (also listed in the older UI backlog) | M | M | ui |
| 9 | Excel, PowerPoint | Picture adjustments: Transparency, Corrections (brightness, contrast, sharpen), Color; Reset Picture | Word has Transparency and Reset only; Excel and PowerPoint picture tabs have almost nothing | M | M | sdk+fmt |
| 10 | Word, Excel, PowerPoint | Compress Pictures (resolution, delete cropped areas) | Documents with large pictures cannot be reduced from the UI; matters for e-mail attachments | M | M | desk |
| 11 | PowerPoint | Design tab: theme Fonts gallery, Background Styles gallery, Variants gallery; same in the Slide Master tab | Only Colors, Slide Size and Format Background exist | S | M | ui |
| 12 | PowerPoint | Reading View (slide show inside the window) and Notes Page view | Neither view exists; Normal and Slide Sorter only | M | M | ui+sdk |
| 13 | PowerPoint | Outline View (edit slide titles and text as an outline) | Missing from View; Word has an outline view | M | M | sdk+ui |
| 14 | PowerPoint | Rehearse Timings, Use Timings, Play Narrations, Show Media Controls | Transitions have per-slide timing, but there is no recording of timings or a "use timings" switch | M | M | ui+sdk |
| 15 | PowerPoint | Photo Album (one slide per picture, layouts, captions) | Missing; frequent in schools | M | M | ui+sdk |
| 16 | PowerPoint | Replace Fonts across the deck | Missing; useful when a deck arrives with fonts the machine lacks | S | M | ui+sdk |
| 17 | Word | Styles pane (Manage Styles, Style Inspector) and larger Styles gallery tiles | Only the gallery menu (Create a Style, Apply Styles); there is no Styles task pane | M | M | ui |
| 18 | Word | Focus mode and Learning Tools (text spacing, column width, page colour, line focus, read aloud) | Read Aloud exists; Focus, Immersive Reader and Page Movement do not; local implementations are possible | M | M | ui+sdk |
| 19 | Word | Header & Footer tab: Go To Header/Footer, Previous/Next Section, Show Document Text, Document Info, Insert Alignment Tab | Engine has GoToHeader and section navigation; the tab has 13 of 24 controls | S | M | ui |
| 20 | Word | Table Layout and Design: Split Table, Insert Cells, Border Styles gallery, Pen Style, Border Painter | Engine has SplitTable (57 references in sdkjs); no ribbon buttons | S | M | ui |
| 21 | Word, Excel | Selection Pane button in Layout (Word) and Page Layout (Excel) and in the contextual Arrange groups | The pane exists in Word and Slides (Alt+F10); Calc has none | S | M | ui |
| 22 | Word | Underline style menu (double, thick, dotted, dashed, wavy, colour); Excel double underline | Underline is a single button; double underline only by Ctrl+Shift+D in Word | S | M | ui |
| 23 | Word, Excel, PowerPoint | Crop to Shape and Aspect Ratio in Crop | Crop, Fill and Fit exist; Excel has no crop button | S | M | ui |
| 24 | Excel | Go To Special and Select formulas, constants, blanks, notes, objects | Find, Replace and Go To only | M | M | sdk+ui |
| 25 | Excel | Table Name box; Slicer and Sparkline contextual tabs (style gallery, group, clear, hidden cells) | Settings are in the side panel; Slicer and Sparkline have no ribbon tab | S | M | ui |
| 26 | Excel | Create Names from Selection, Error Checking (trace error, circular references), Evaluate Formula | No equivalent; errors only show as cell values | M | M | sdk+ui |
| 27 | Excel | Data > Subtotal, Consolidate, Advanced Filter, Reapply Filter | Not in the Data tab or the engine API | M | M | sdk |
| 28 | Excel | What-If: Data Table and Scenario Manager; Forecast Sheet | Only Goal Seek exists | M | M | sdk |
| 29 | Excel | Data From Picture (table OCR) | Missing; a local OCR (WASM) could be offered as an option | M | M | svc+ui |
| 30 | Excel | Recommended PivotTables and PivotChart | Pivot tables exist; no suggestions and no pivot charts | M | M | sdk |
| 31 | Excel | Create Waterfall, Funnel, Treemap, Sunburst, Histogram, Pareto and Box and Whisker charts | These are displayed and kept on save but cannot be created from Insert > Charts | M | M | sdk+ui |
| 32 | Word | Mail merge completion: Address Block, Greeting Line, Rules, Match Fields, Find Recipient, Check for Errors, Print Documents, Type a New List | Core merge (CSV/XLSX, preview, PDF, e-mail) works; the helpers around it do not | M | M | ui+sdk |
| 33 | Word | Envelopes and Labels | Missing; common for associations and small businesses | M | M | ui+sdk |
| 34 | Word | Quick Parts and Building Blocks gallery; gallery of ready-made text boxes | AutoText is a localStorage starter (Alt+F3); text boxes insert blank | M | M | ui+sdk |
| 35 | Word | More bibliography styles (Chicago, IEEE, Harvard, ISO 690, Turabian, GB/T) | APA and MLA only | M | M | ui |
| 36 | Word | Grammar and style check (offline, for example LanguageTool, or optional through Ask Elixir) | Spelling only | L | H | sdk+svc |
| 37 | Word, PowerPoint, Excel | Dictate, Translate: local or optional equivalents (browser/OS speech recognition, whisper.cpp; LibreTranslate or Argos) | Microsoft versions need a Microsoft account; an optional local version is possible | M | M | svc |
| 38 | Word, Excel, PowerPoint | Effects beyond shadow for shapes, pictures, tables and text: glow, soft edges, reflection, bevel, 3-D rotation | Drawing format in sdkjs carries glow, softEdge and reflection; there are no API calls or UI for them | L | M | sdk+fmt |
| 39 | Word, PowerPoint | SmartArt Design tab (Add Shape, Text Pane, Promote/Demote, layouts, colours, styles, Reset) | SmartArt is inserted and drawn but not editable from the ribbon; Convert to SmartArt missing | L | M | sdk+ui |
| 40 | Excel | Page Layout view with in-place header and footer, and the Header & Footer tab | The sheet engine draws one continuous grid; needs a page renderer (already noted in `docs/parity-roadmap.md`) | L | M | sdk |

### Large or strategic items (L/XL, not in the top 40)

- **Power Query** (Data > Get Data, transform editor, Queries & Connections, refresh): value H for SMEs, effort XL; only text, CSV and XML import exist.
- **Python in cells**: Microsoft runs it in the cloud; a local version would use Pyodide (WASM), L, value M.
- **Master Document** (Word Outlining): L, low value.
- **Web Layout, Side-to-Side page movement, page gridlines** (Word View): M each, low value.
- **3D Models and Online Videos** insertion (Word, PowerPoint): L, low value.
- **Window management** (New Window, Arrange All, Side by Side, Synchronous Scrolling, Cascade): desktop shell, L overall, low value.
- **Ink**: Lasso Select, Ink to Shape, Ink Replay, Ruler stencil in the Draw tab: M to L, low value (value rises with tablet users).
- **Export to Video, Record narration, Cameo, Screen Recording** (PowerPoint Record tab): L together, value M for teachers.


## Word

### Word: Home

44 controls: 35 present, 4 partial, 3 missing, 2 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Clipboard | Office Clipboard... | missing | Office Clipboard task pane (24 items); only Spike exists | M | L | mix |
| Font | Underline | partial | plain Underline button only; no style/colour menu (double underline only by Ctrl+Shift+D) | S | M | ui |
| Font | Text Effects and Typography | missing | text outline, shadow, glow, reflection, ligatures and number styles on ordinary text; only Text Art has fills/outlines | L | M | sdk+fmt |
| Paragraph | Sort... | present | Sort paragraphs/list/table rows by text, number or date | M | M | sdk |
| Styles | Styles... | partial | only the gallery menu (Create a Style, Apply Styles); no Styles task pane with Manage Styles/Style Inspector | M | M | ui |
| Editing | Select | partial | Select All only; Select Objects and Select Text With Similar Formatting missing | S | L | mix |
| Voice | Dictate | n/a | speech-to-text through a Microsoft cloud service; local equivalent (browser or OS dictation, optional whisper.cpp) makes sense | M | M | svc |
| Editor | Editor | n/a | Microsoft Editor (cloud grammar and style); local equivalent: Ask Elixir AI (optional) and an offline grammar checker such as LanguageTool | L | H | svc |
| Add-ins | Add‑ins | partial | Plugins tab exists but is hidden and has no store or add-in manager | M | L | ui |

Present: Paste, Cut, Copy, Format Painter, Font, Font Size, Grow Font, Shrink Font, Change Case, Clear Formatting, Bold, Italic, Strikethrough, Subscript, Superscript, Text Highlight Color, Font Color, Font..., Bullets, Numbering, Multilevel List, Decrease Indent, Increase Indent, Show All, Align Left, Center, Align Right, Justify, Line and Paragraph Spacing, Shading, Borders, Paragraph..., QuickStylesGallery, Find, Replace....

### Word: Insert

29 controls: 21 present, 4 partial, 3 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Illustrations | 3D Models | missing | 3D models (glTF/GLB) with rotate controls | L | L | sdk+fmt |
| Illustrations | Screenshot | missing | Screenshot and Screen Clipping (web: getDisplayMedia, desktop: native capture) | M | L | desk |
| Media | Online Videos... | missing | Online Videos (embedded video by link) | M | L | sdk+fmt |
| Text | Text Box | partial | text box inserted blank (horizontal/vertical); no gallery of ready-made text boxes (quotes, sidebars) | M | M | ui |
| Text | Quick Parts | partial | Field only; AutoText is a localStorage starter via Alt+F3, no Building Blocks gallery or Organizer | M | M | mix |
| Text | Signature Line | partial | digital signatures exist under Review > Protect; no Signature Line object insertion | M | L | mix |
| Text | Object... | partial | Text from File/URL/Storage only; no OLE object (Object...) creation | L | L | sdk+fmt |
| eSignature | eSignature fields | n/a | Microsoft Syntex eSignature service | - | - | svc |

Present: Cover Page, Blank Page, Page Break, Table, Pictures, Shapes, Icons, SmartArt..., Chart..., Link, Bookmark..., Cross-reference..., Comment, Header, Footer, Page Number, WordArt, Drop Cap, Date & Time..., Equation, Symbol.

### Word: Design

10 controls: 8 present, 0 partial, 2 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Document Formatting | Effects | missing | theme effect schemes (shadow, bevel, line styles) | M | L | sdk+fmt |
| Document Formatting | Set as Default | missing | Set as Default (save the style set and theme as default template) | S | L | mix |

Present: Themes, QuickStylesSets, Colors, Fonts, Paragraph Spacing, Watermark, Page Color, Page Borders....

### Word: Layout

21 controls: 19 present, 2 partial, 0 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Page Setup | Hyphenation | partial | None, Automatic and options; Manual hyphenation missing | S | L | ui |
| Arrange | Selection Pane... | partial | pane exists (Alt+F10, Selection pane) but no button in Layout > Arrange | S | M | ui |

Present: Margins, Orientation, Size, Columns, Breaks, Line Numbers, Page Setup..., Indent Left, Indent Right, Spacing Before, Spacing After, Paragraph..., Position, Wrap Text, Bring Forward, Send Backward, Align, Group, Rotate.

### Word: References

23 controls: 17 present, 1 partial, 4 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Footnotes | Show Notes | missing | Show Notes (jump between body and note area) | S | L | ui |
| Citations & Bibliography | Style | partial | APA and MLA only; Chicago, IEEE, Harvard, ISO 690, Turabian, GB/T missing | M | M | ui |
| Citations & Bibliography | Change Provider | n/a | third-party reference-manager add-ins (Mendeley, EndNote) | - | - | svc |
| Table of Authorities | Mark Citation... | missing | Table of Authorities: mark citation (TA field) | L | L | sdk |
| Table of Authorities | Insert Table of Authorities... | missing | Table of Authorities | L | L | sdk |
| Table of Authorities | Update Table | missing | Table of Authorities update | S | L | sdk |

Present: Table of Contents, Add Text, Update Table..., Insert Footnote, Insert Endnote, Next Footnote, Footnote and Endnote Dialog..., Insert Citation, Manage Sources..., Bibliography, Insert Caption..., Insert Table of Figures..., Update Table, Cross-reference..., Mark Entry..., Insert Index..., Update Index.

### Word: Mailings

21 controls: 9 present, 2 partial, 10 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Create | Envelopes... | missing | Envelopes (page sizes exist, no dialog or address layout) | M | M | mix |
| Create | Labels... | missing | Labels (Avery-style grid sheets) | M | M | mix |
| Start Mail Merge | Start Mail Merge | missing | document type menu (letters, e-mail, envelopes, labels, directory) | S | L | ui |
| Start Mail Merge | Select Recipients | partial | existing list from CSV/XLSX only; Type a New List and Outlook contacts missing | S | L | ui |
| Write & Insert Fields | Address Block... | missing | Address Block with country and name formats | M | M | mix |
| Write & Insert Fields | Greeting Line... | missing | Greeting Line | S | M | mix |
| Write & Insert Fields | Rules | missing | IF, ASK, FILLIN, NEXT, SET and SKIPIF rules | M | L | sdk |
| Write & Insert Fields | Match Fields... | missing | Match Fields (map columns to address fields) | S | L | ui |
| Write & Insert Fields | Update Labels | missing | needs Labels | S | L | ui |
| Preview Results | Find Recipient... | missing | Find Recipient | S | L | ui |
| Preview Results | Check for Errors... | missing | Check for Errors | S | L | ui |
| Finish | Finish & Merge | partial | Edit Individual Documents, PDF, one PDF per record, e-mail; Print Documents missing | S | L | ui |

Present: Edit Recipient List..., Highlight Merge Fields, Insert Merge Field, Preview Results, First, Previous, Record, Next, Last.

### Word: Review

21 controls: 14 present, 4 partial, 2 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Proofing | Editor | n/a | Microsoft Editor (cloud); see Home | L | H | svc |
| Proofing | Spelling and Grammar | partial | spelling only; no grammar or style check | L | H | sdk+svc |
| Accessibility | Check Accessibility | missing | Accessibility checker (missing alt text, headings order, table headers, contrast, language) | L | H | mix |
| Markup | Show Markup | partial | AllMarkup menu only; per-type, per-reviewer markup filters partial | S | L | ui |
| Markup | Change Tracking Options... | partial | options inside Track Changes menu but no dialog for balloons, colours, moved text | S | L | ui |
| Compare | Compare | partial | Compare and Combine; Show Source Documents missing | S | L | ui |
| Ink | Hide Ink | missing | Hide Ink (Draw tab exists but no ink visibility toggle) | S | L | ui |

Present: Thesaurus..., Word Count, Read Aloud, Language, New Comment, Delete, Previous, Next, Show Comments, Filter All Markup, Display for Review, Reviewing Pane, Tracking, Protect.

### Word: View

26 controls: 12 present, 2 partial, 11 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Views | Web Layout | missing | Web Layout view | M | L | sdk |
| Immersive | Focus | missing | Focus mode (hide ribbon and title bar, exit pill) | M | M | ui |
| Immersive | Immersive Reader | missing | Immersive Reader / Learning Tools (column width, text spacing, page colour, line focus, syllables, read aloud); local equivalents possible | M | M | mix |
| Page Movement | Vertical | missing | vertical vs side-to-side page movement | M | L | sdk |
| Page Movement | Side to Side | missing | Side to Side page movement | M | L | sdk |
| Show | Gridlines | missing | page gridlines (document grid) | M | L | sdk |
| Window | New Window | missing | New Window on the same document (risky with co-editing) | L | L | desk |
| Window | Arrange All | missing | Arrange All windows | S | L | desk |
| Window | View Side by Side | missing | View Side by Side | M | L | desk |
| Window | Synchronous Scrolling | missing | Synchronous Scrolling | S | L | desk |
| Window | Reset Window Position | missing | Reset Window Position | S | L | desk |
| Window | Switch Windows | partial | desktop tabs and windows list, no Switch Windows menu | S | L | desk |
| Macros | Macros | partial | JavaScript macros dialog; VBA preserved in files but never executed (policy) | - | M | sdk |
| SharePoint | Properties | n/a | SharePoint document properties panel | - | - | svc |

Present: Read Mode, Print Layout, Outline, Draft, Ruler, Navigation Pane, Zoom..., 100%, One Page, Multiple Pages, Page Width, Split.

### Word: Help

6 controls: 0 present, 1 partial, 0 missing, 5 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Help | Help | partial | no in-app Help pane (docs site only) | M | M | ui |
| Help | Contact Support... | n/a | Microsoft support | - | - | svc |
| Help | Feedback | n/a | Microsoft feedback | - | - | svc |
| Help | Show Training | n/a | Microsoft training videos | - | - | svc |
| Help | What's New | n/a | Microsoft What's New | - | - | svc |
| Mobile | Get Word Mobile App | n/a | Microsoft mobile app | - | - | svc |

### Word: Table Design (contextual, table)

15 controls: 12 present, 0 partial, 3 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Borders | Border Styles | missing | Border Styles gallery (pen presets) | S | M | ui |
| Borders | Pen Style | missing | pen style (dashes, dots, double) | S | M | ui |
| Borders | Border Painter | missing | Border Painter | S | L | ui |

Present: Header Row, Total Row, Banded Rows, First Column, Last Column, Banded Columns, TableStylesGalleryWord, Shading, Pen Weight, Pen Color, Borders, Borders and Shading....

### Word: Table Layout (contextual, table)

35 controls: 32 present, 0 partial, 3 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Rows & Columns | Insert Cells... | missing | Insert Cells (shift right/down) | S | L | ui |
| Merge | Split Table | missing | Split Table at the cursor | S | M | ui |
| Data | Sort... | present | Sort table rows | M | M | sdk |

Present: Select, View Gridlines, Properties..., Draw Table, Eraser, Delete, Insert Row Above, Insert Row Below, Insert Column Left, Insert Column Right, Merge Cells, Split Cells..., AutoFit, Table Row Height, Table Column Width, Distribute Rows, Distribute Columns, Align Top Left, Align Top Center, Align Top Right, Align Center Left, Align Center, Align Center Right, Align Bottom Left, Align Bottom Center, Align Bottom Right, Text Direction, Cell Margins..., Repeat Header Rows, Convert to Text..., Formula....

### Word: Picture Format (contextual, picture)

26 controls: 16 present, 3 partial, 7 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Adjust | Remove Background | missing | Remove Background (foreground marking) | L | M | sdk |
| Adjust | Corrections | missing | brightness, contrast, sharpen and soften presets | M | M | sdk+fmt |
| Adjust | Color | missing | saturation, tone, recolor | M | M | sdk+fmt |
| Adjust | Artistic Effects | missing | artistic effects (marker, pencil, blur...) | L | L | sdk+fmt |
| Adjust | Compress Pictures... | missing | Compress Pictures (resolution, delete cropped areas) | M | M | desk |
| Picture Styles | PictureStylesGallery | missing | Picture Styles gallery (frames, shadows, rounded, reflected) | M | M | mix |
| Picture Styles | Picture Effects | partial | shadow only; reflection, glow, soft edges, bevel and 3-D rotation missing | L | M | sdk+fmt |
| Picture Styles | Picture Layout | missing | Picture Layout (convert to SmartArt) | L | L | sdk |
| Arrange | Selection Pane... | partial | pane exists (Alt+F10) but no contextual button | S | M | ui |
| Size | Crop | partial | Crop, Fill, Fit present; Crop to Shape and Aspect Ratio missing | S | M | ui |

Present: Transparency, Change Picture, Reset Picture, Picture Border, Picture..., Alt Text, Position, Wrap Text, Bring Forward, Send Backward, Align, Group, Rotate, Shape Height, Shape Width, Size and Position....

### Word: Shape Format (contextual, shape)

28 controls: 18 present, 3 partial, 7 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Insert Shapes | Edit Shape | partial | Change Shape and Edit Points; Reroute Connectors missing | S | L | ui |
| Shape Styles | ShapeStylesGallery | missing | Shape Styles gallery (preset fills and outlines) | M | M | ui |
| Shape Styles | Shape Effects | partial | shadow only; preset, reflection, glow, soft edges, bevel, 3-D rotation missing | L | M | sdk+fmt |
| WordArt Styles | Quick Styles | missing | WordArt Quick Styles in the ribbon (settings only in side panel) | S | M | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | M | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | M | ui |
| WordArt Styles | Text Effects | missing | Text Effects (shadow, reflection, glow, bevel, transform) | L | M | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects pane | M | L | ui |
| Text | Create Link | missing | Create Link (flow text between text boxes) | L | L | sdk |
| Arrange | Selection Pane... | partial | pane exists (Alt+F10) but no contextual button | S | M | ui |

Present: ShapesInsertGallery, Draw Text Box, Shape Fill, Shape Outline, Format Object..., Text Direction, Align Text, Alt Text, Position, Wrap Text, Bring Forward, Send Backward, Align, Group, Rotate, Shape Height, Shape Width, Size and Position....

### Word: Chart Design (contextual, chart)

9 controls: 3 present, 3 partial, 2 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Chart Layouts | Add Chart Element | partial | axes, titles, labels, legend, gridlines, trendlines exist in the chart side panel, not as a ribbon menu | M | H | ui |
| Chart Layouts | Quick Layout | missing | Quick Layout presets | M | M | mix |
| Chart Styles | Change Colors | partial | colors inside the Chart Styles gallery, no separate Change Colors menu | S | M | ui |
| Data | Switch Row/Column | missing | Switch Row/Column | S | M | mix |
| Data | Select Data... | partial | Edit Data opens the data editor; no Select Data dialog in Word charts | M | M | ui |
| Data | Refresh Data | n/a | refresh linked workbook data | - | - | - |

Present: ChartStylesGallery, Edit Data, Change Chart Type....

### Word: Format (contextual, chart)

27 controls: 15 present, 3 partial, 9 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Current Selection | Chart Elements | missing | Chart Elements selector | S | M | ui |
| Current Selection | Format Selection | partial | settings are in the side panel | S | M | ui |
| Current Selection | Reset to Match Style | missing | Reset to Match Style | S | L | mix |
| Insert Shapes | Change Shape | missing | Change Shape in a chart | S | L | ui |
| Shape Styles | ShapeStylesGallery | missing | Shape Styles gallery | M | M | ui |
| Shape Styles | Shape Effects | partial | shadow only | L | M | sdk+fmt |
| WordArt Styles | Quick Styles | missing | WordArt styles in chart Format | S | L | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | L | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | L | ui |
| WordArt Styles | Text Effects | missing | Text Effects | L | L | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects | M | L | ui |
| Arrange | Selection Pane... | partial | pane exists (Alt+F10) but no contextual button | S | M | ui |

Present: ShapesInsertGallery, Shape Fill, Shape Outline, Format Object..., Alt Text, Position, Wrap Text, Bring Forward, Send Backward, Align, Group, Rotate, Shape Height, Shape Width, Size and Position....

### Word: SmartArt Design (contextual, smartart)

13 controls: 0 present, 0 partial, 13 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Create Graphic | Add Shape | missing | no SmartArt Design tab: SmartArt can be inserted and displayed but not edited from the ribbon | L | M | sdk+ui |
| Create Graphic | Add Bullet | missing | SmartArt editing | M | M | sdk+ui |
| Create Graphic | Text Pane | missing | SmartArt text pane | M | M | sdk+ui |
| Create Graphic | Promote | missing | SmartArt editing | S | M | sdk+ui |
| Create Graphic | Demote | missing | SmartArt editing | S | M | sdk+ui |
| Create Graphic | Right to Left | missing | SmartArt editing | S | L | sdk+ui |
| Create Graphic | Move Before | missing | SmartArt editing | S | L | sdk+ui |
| Create Graphic | Move After | missing | SmartArt editing | S | L | sdk+ui |
| Create Graphic | Layout | missing | SmartArt editing | S | L | sdk+ui |
| Layouts | SmartArtLayoutGallery | missing | change SmartArt layout | M | M | sdk+ui |
| SmartArt Styles | Change Colors | missing | SmartArt colours | M | M | sdk+ui |
| SmartArt Styles | SmartArtStylesGallery | missing | SmartArt styles | M | M | sdk+ui |
| Reset | Reset Graphic | missing | Reset Graphic | S | L | sdk+ui |

### Word: Equation (contextual, equation)

19 controls: 17 present, 0 partial, 2 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Tools | Ink Equation | missing | Ink Equation (handwriting recognition) | L | L | svc |
| Conversions | Equation Options... | missing | Equation Options (math autocorrect list, math regions) | S | L | ui |

Present: Equation, Unicode, LaTeX, Text, Convert, EquationSymbolsInsertGallery, Fraction, Script, Radical, Integral, Large Operator, Bracket, Function, Accent, Limit and Log, Operator, Matrix.

### Word: Header & Footer (contextual, header)

20 controls: 11 present, 1 partial, 7 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Insert | Document Info | missing | Document Info (author, file name, path, title as fields) | S | M | mix |
| Insert | Quick Parts | partial | Field only | M | M | mix |
| Insert | Online Pictures... | n/a | Online Pictures (Bing/Microsoft) | - | - | svc |
| Navigation | Go to Header | missing | Go to Header | S | L | ui |
| Navigation | Go to Footer | missing | Go to Footer | S | L | ui |
| Navigation | Previous | missing | Previous section header/footer | S | M | ui |
| Navigation | Next | missing | Next section header/footer | S | M | ui |
| Options | Show Document Text | missing | Show Document Text | S | L | ui |
| Position | Insert Alignment Tab | missing | Insert Alignment Tab | S | L | sdk |

Present: Header, Footer, Page Number, Date & Time..., Pictures..., Link to Previous, Different First Page, Different Odd & Even Pages, Header Position from Top, Footer Position from Bottom, Close Header and Footer.

### Word: Outlining (contextual, outline)

15 controls: 13 present, 0 partial, 2 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Master Document | Show Document | missing | Master Document (subdocuments) | L | L | sdk |
| Master Document | Collapse Subdocuments | missing | Master Document | L | L | sdk |

Present: Promote to Heading 1, Promote, Outline Level, Demote, Demote to Body Text, Move Up, Move Down, Expand, Collapse, Show Level, Show Text Formatting, Show First Line Only, Close Outline View.

## Excel

### Excel: Home

47 controls: 43 present, 3 partial, 1 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Clipboard | Office Clipboard... | missing | Office Clipboard task pane | M | L | mix |
| Font | Underline | partial | single underline only; no Double Underline | S | L | sdk |
| Editing | Find & Select | partial | Find, Replace, Go To; Go To Special, Select formulas/notes/conditional formats/objects missing | M | M | mix |
| Add-ins | Add‑ins | partial | Plugins tab hidden, no add-in manager | M | L | ui |

Present: Paste, Cut, Copy, Format Painter, Font, Font Size, Increase Font Size, Decrease Font Size, Bold, Italic, Borders, Fill Color, Font Color, Format Cell Font, Top Align, Middle Align, Bottom Align, Orientation, Align Left, Center, Align Right, Decrease Indent, Increase Indent, Wrap Text, Merge & Center, Format Cell Alignment, Number Format, Accounting Number Format, Percent Style, Comma Style, Increase Decimal, Decrease Decimal, Format Cell Number, Conditional Formatting, Format as Table, Cell Styles, Insert, Delete, Format, AutoSum, Fill, Clear, Sort & Filter.

### Excel: Insert

27 controls: 17 present, 3 partial, 5 missing, 2 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Tables | Recommended PivotTables | missing | Recommended PivotTables | M | M | sdk |
| Tables | Forms | n/a | Microsoft Forms (cloud) | - | - | svc |
| Illustrations | Illustrations | partial | Pictures, Shapes, Icons, SmartArt present; 3D Models and Screenshot missing | L | L | mix |
| Charts | Insert Hierarchy Chart | missing | Treemap and Sunburst are displayed and kept on save but cannot be created from the ribbon | M | M | sdk+ui |
| Charts | Insert Statistic Chart | missing | Histogram, Pareto, Box and Whisker cannot be created | M | M | sdk+ui |
| Charts | Insert Waterfall, Funnel, Stock, Surface, or Radar Chart | partial | Stock and Radar present; Waterfall, Funnel and Surface cannot be created | M | M | sdk+ui |
| Charts | Maps | n/a | Map charts rely on Microsoft's Bing geography service | - | - | svc |
| Charts | PivotChart | missing | PivotChart | L | M | sdk |
| Filters | Timeline | missing | Timeline slicer for dates | M | M | sdk |
| Text | Text | partial | Text Box, Header & Footer, WordArt present; Signature Line missing | M | L | mix |

Present: PivotTable, Table, Checkbox, Recommended Charts, Insert Column or Bar Chart, Insert Line or Area Chart, Insert Pie or Doughnut Chart, Insert Scatter (X, Y) or Bubble Chart, Insert Combo Chart, Line, Column, Win/Loss, Slicer..., Link, Comment, Symbols.

### Excel: Draw

17 controls: 4 present, 4 partial, 5 missing, 4 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Undo | Can't Undo | n/a | Undo is in the title bar | - | - | - |
| Undo | Can't Repeat | n/a | Repeat is in the title bar | - | - | - |
| Drawing Tools | Lasso Select | missing | Lasso Select for ink | M | L | sdk |
| Drawing Tools | Pencil | partial | pens only | S | L | ui |
| Drawing Tools | Highlighter | partial | via pen types | S | L | ui |
| Drawing Tools | Fountain Pen | partial | via pen types | S | L | ui |
| Drawing Tools | Brush Pen | partial | via pen types | S | L | ui |
| Drawing Tools | Action Pen | n/a | Action Pen (handwriting into cells needs Microsoft ink recognition) | - | - | svc |
| Drawing Tools | Add | missing | Add Pen presets | S | L | ui |
| Convert | Ink to Shape | missing | Ink to Shape | L | M | sdk |
| Convert | Ink to Math | missing | Ink to Math | L | L | svc |
| Replay | Ink Replay | missing | Ink Replay | S | L | sdk |
| Help | Ink Help | n/a | Microsoft help | - | - | - |

Present: Select, Eraser, Pen.

### Excel: Page Layout

27 controls: 20 present, 3 partial, 4 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Themes | Themes | missing | Themes gallery (Colors only today) | M | M | mix |
| Themes | Fonts | missing | theme Fonts | S | M | ui |
| Themes | Effects | missing | theme Effects | M | L | sdk+fmt |
| Page Setup | Background... | missing | Background picture for a sheet | M | L | sdk+fmt |
| Scale to Fit | Scale | partial | no free percentage scale box in the ribbon | S | L | ui |
| Arrange | Selection Pane... | partial | pane exists in Word and Slides; not offered in Calc | M | M | ui |
| Arrange | Rotate | partial | rotate and flip in the side panel, no ribbon menu | S | L | ui |

Present: Colors, Margins, Orientation, Size, Print Area, Breaks, Print Titles, Page Setup, Width, Height, View, Print, Sheet Options, Bring Forward, Send Backward, Align, Group.

### Excel: Formulas

28 controls: 21 present, 0 partial, 3 missing, 4 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Python (Preview) | Insert Python | n/a | Python in Excel runs in the Microsoft cloud; local equivalent possible with Pyodide (WASM) but a large feature | L | M | svc |
| Python (Preview) | Reset | n/a | Python in Excel | - | - | svc |
| Python (Preview) | Editor | n/a | Python in Excel | - | - | svc |
| Python (Preview) | Initialization | n/a | Python in Excel | - | - | svc |
| Defined Names | Create from Selection... | missing | Create from Selection (names from row/column labels) | S | M | ui |
| Formula Auditing | Error Checking... | missing | Error Checking, Trace Error, Circular References | M | M | sdk |
| Formula Auditing | Evaluate Formula | missing | Evaluate Formula stepper | M | M | sdk |

Present: Insert Function..., AutoSum, Recently Used, Financial, Logical, Text, Date & Time, Lookup & Reference, Math & Trig, More Functions, Name Manager, Define Name, Use in Formula, Trace Precedents, Trace Dependents, Remove Arrows, Show Formulas, Watch Window, Calculation Options, Calculate Now, Calculate Sheet.

### Excel: Data

29 controls: 10 present, 6 partial, 9 missing, 4 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Get & Transform Data | Get Data | partial | text, CSV and XML import; no Power Query (databases, web, transform editor) | L | H | sdk |
| Get & Transform Data | From Web | partial | CSV and XML from a web address only | M | M | mix |
| Get & Transform Data | From Table/Range | missing | From Table/Range into Power Query | L | M | sdk |
| Get & Transform Data | From Picture | missing | Data From Picture (table OCR; local OCR possible) | M | M | mix |
| Get & Transform Data | Recent Sources | n/a | Power Query history | - | - | - |
| Get & Transform Data | Existing Connections | n/a | workbook connections | - | - | - |
| Queries & Connections | Refresh All | partial | refresh for pivot tables only | S | M | ui |
| Queries & Connections | Queries & Connections | missing | Queries & Connections pane | L | M | sdk |
| Queries & Connections | Properties | missing | external data range properties | M | L | sdk |
| Data Types | ConvertToLinkedEntity | n/a | Stocks and Geography data types (Microsoft cloud) | - | - | svc |
| Sort & Filter | Reapply | missing | Reapply filter | S | L | ui |
| Sort & Filter | Advanced... | missing | Advanced Filter (criteria range, copy to location) | M | M | sdk |
| Data Tools | Flash Fill | partial | Flash Fill only by Ctrl+E, no Data tab button | S | M | ui |
| Data Tools | Consolidate... | missing | Consolidate | M | M | sdk |
| Data Tools | Data Model | missing | Data Model / Power Pivot and 3D Map | L | L | sdk |
| Data Tools | Analyze Data | n/a | Analyze Data (Microsoft cloud AI); local equivalent: Ask Elixir and Quick Analysis | M | M | svc |
| Forecast | What-If Analysis | partial | Goal Seek only; Scenario Manager and Data Table missing | M | M | sdk |
| Forecast | Forecast Sheet | missing | Forecast Sheet | M | M | sdk |
| Outline | Outline | partial | Group and Ungroup; Subtotal and show/hide detail missing | M | M | sdk |

Present: From Text/CSV, Workbook Links, Sort A to Z, Sort Z to A, Sort..., Filter, Clear, Text to Columns..., Remove Duplicates, Data Validation....

### Excel: Review

18 controls: 5 present, 2 partial, 8 missing, 3 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Proofing | Spelling... | partial | spell checking by F7/context menu, no ribbon button in Calc | S | M | ui |
| Proofing | Thesaurus... | missing | Thesaurus in Calc | S | M | ui |
| Proofing | Workbook Statistics | missing | Workbook Statistics | S | L | ui |
| Performance | Check Performance | missing | Check Performance | M | L | sdk |
| Accessibility | Check Accessibility | missing | Accessibility checker | L | H | mix |
| Language | Translate | n/a | Microsoft Translator (cloud); local equivalent optional | M | M | svc |
| Changes | Show Changes | n/a | co-authoring change highlights of Microsoft 365 | - | - | svc |
| Comments | Previous Comment | missing | Previous Comment | S | M | ui |
| Comments | Next Comment | missing | Next Comment | S | M | ui |
| Comments | Show Comments | missing | Show Comments pane toggle (comments panel exists in left bar) | S | L | ui |
| Notes | Notes | partial | comments only; legacy Notes and conversion missing | M | M | sdk |
| Protect | Unshare Workbook | n/a | Unshare Workbook (legacy shared workbooks) | - | - | - |
| Ink | Hide Ink | missing | Hide Ink | S | L | ui |

Present: New Comment, Delete, Protect Sheet..., Protect Workbook..., Allow Edit Ranges.

### Excel: View

30 controls: 11 present, 2 partial, 16 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Sheet View | Keep | missing | Keep sheet view | S | L | ui |
| Sheet View | Options | missing | Sheet View Options | S | L | ui |
| Workbook Views | Page Layout | missing | Page Layout view (page-by-page, in-place header/footer, rulers) | L | M | sdk |
| Workbook Views | Custom Views... | missing | Custom Views | M | L | sdk |
| Show | Navigation | missing | Navigation pane (sheets, tables, named ranges, objects) | M | L | ui |
| Show | Ruler | missing | Ruler (Page Layout view only) | M | L | sdk |
| Show | Data Type Icons | n/a | Microsoft data type icons | - | - | svc |
| Show | Focus Cell | missing | Focus Cell (row/column highlight) | S | M | ui |
| Zoom | Zoom to Selection | missing | Zoom to Selection | S | M | ui |
| Window | New Window | missing | New Window | L | L | desk |
| Window | Arrange All | missing | Arrange All | S | L | desk |
| Window | Split | missing | Split panes | M | M | sdk |
| Window | Hide | missing | Hide window | S | L | desk |
| Window | Unhide... | missing | Unhide window | S | L | desk |
| Window | View Side by Side | missing | View Side by Side | M | L | desk |
| Window | Synchronous Scrolling | missing | Synchronous Scrolling | S | L | desk |
| Window | Reset Window Position | missing | Reset Window Position | S | L | desk |
| Window | Switch Windows | partial | desktop tabs and windows list | S | L | desk |
| Macros | Macros | partial | JavaScript macros; VBA preserved, never executed (policy) | - | M | sdk |

Present: Switch Sheet View, Exit, New, Normal, Page Break Preview, Gridlines, Formula Bar, Headings, Zoom..., 100%, Freeze Panes.

### Excel: Automate

3 controls: 0 present, 0 partial, 0 missing, 3 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Office Scripts | New Script | n/a | Office Scripts (Microsoft 365 cloud); local analogue: JS macros, Office Scripts only if demand | - | - | svc |
| Office Scripts | View Scripts | n/a | Office Scripts | - | - | svc |
| Office Scripts Gallery | OfficeScriptsGallery | n/a | Office Scripts gallery | - | - | svc |

### Excel: Help

8 controls: 0 present, 1 partial, 0 missing, 7 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Help | Help | partial | no in-app Help pane | M | M | ui |
| Help | Contact Support... | n/a | Microsoft support | - | - | svc |
| Help | Feedback | n/a | Microsoft feedback | - | - | svc |
| Help | Show Training | n/a | Microsoft training | - | - | svc |
| Help | What's New | n/a | Microsoft What's New | - | - | svc |
| Community | Community | n/a | Microsoft community | - | - | svc |
| Community | Excel Blog | n/a | Microsoft blog | - | - | svc |
| Mobile | Get Excel Mobile App | n/a | Microsoft mobile app | - | - | svc |

### Excel: Table Design (contextual, table)

19 controls: 13 present, 0 partial, 1 missing, 5 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Properties | Table Name | missing | Table Name box | S | M | ui |
| External Table Data | Export | n/a | export to SharePoint or Visio | - | - | svc |
| External Table Data | Refresh | n/a | refresh query-table data | - | - | - |
| External Table Data | Properties | n/a | external data properties | - | - | - |
| External Table Data | Open in Browser | n/a | SharePoint list | - | - | svc |
| External Table Data | Unlink | n/a | SharePoint list | - | - | svc |

Present: Resize Table, Summarize with PivotTable, Remove Duplicates, Convert to Range, Insert Slicer..., Header Row, Total Row, Banded Rows, First Column, Last Column, Banded Columns, Filter Button, TableStylesGalleryExcel.

### Excel: Slicer (contextual, slicer)

16 controls: 5 present, 9 partial, 2 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Slicer | Slicer Caption | partial | slicer caption in the side panel | S | M | ui |
| Slicer | Slicer Settings... | partial | slicer settings in the side panel | S | M | ui |
| Slicer | Report Connections... | missing | Report Connections (link a slicer to several pivots/tables) | M | M | sdk |
| Slicer Styles | SlicerStyles | missing | Slicer Styles gallery | S | M | ui |
| Arrange | Selection Pane... | partial | not offered in Calc | M | M | ui |
| Arrange | Rotate | partial | side panel only | S | L | ui |
| Buttons | Columns | partial | slicer settings in the side panel | S | M | ui |
| Buttons | Height | partial | side panel | S | M | ui |
| Buttons | Width | partial | side panel | S | M | ui |
| Size | Shape Height | partial | size in the side panel | S | M | ui |
| Size | Shape Width | partial | size in the side panel | S | M | ui |

Present: Bring Forward, Send Backward, Align, Group, Size and Properties....

### Excel: Chart Design (contextual, chart)

8 controls: 3 present, 3 partial, 2 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Chart Layouts | Add Chart Element | partial | chart elements in the side panel, no ribbon menu | M | H | ui |
| Chart Layouts | Quick Layout | missing | Quick Layout | M | M | mix |
| Chart Styles | Change Colors | partial | colours via the side panel | S | M | ui |
| Chart Styles | ChartStylesGallery | partial | styles via the side panel, no gallery in the ribbon | M | M | ui |
| Location | Move Chart... | missing | Move Chart (to another sheet) | S | M | sdk |

Present: Switch Row/Column, Select Data..., Change Chart Type....

### Excel: Format (contextual, chart)

25 controls: 7 present, 8 partial, 10 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Current Selection | Chart Elements | missing | Chart Elements selector | S | M | ui |
| Current Selection | Reset to Match Style | missing | Reset to Match Style | S | L | mix |
| Insert Shapes | ShapesInsertGallery | missing | insert shapes inside a chart | S | L | ui |
| Insert Shapes | Change Shape | missing | Change Shape | S | L | ui |
| Shape Styles | ShapeStylesGallery | missing | Shape Styles gallery | M | M | ui |
| Shape Styles | Shape Fill | partial | fill in the side panel | S | M | ui |
| Shape Styles | Shape Outline | partial | outline in the side panel | S | M | ui |
| Shape Styles | Shape Effects | partial | shadow only | L | M | sdk+fmt |
| WordArt Styles | TextStylesGallery | missing | WordArt styles | S | L | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | L | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | L | ui |
| WordArt Styles | Text Effects | missing | Text Effects | L | L | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects | M | L | ui |
| Accessibility | Alt Text | partial | alt text in the side panel | S | M | ui |
| Arrange | Selection Pane... | partial | not offered in Calc | M | M | ui |
| Arrange | Rotate | partial | side panel only | S | L | ui |
| Size | Shape Height | partial | size in the side panel | S | M | ui |
| Size | Shape Width | partial | size in the side panel | S | M | ui |

Present: Format Selection, Format Object..., Bring Forward, Send Backward, Align, Group, Size and Properties....

### Excel: Picture Format (contextual, picture)

14 controls: 1 present, 2 partial, 11 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Adjust | Place in Cell | missing | Place in Cell (picture inside a cell, IMAGE function) | M | M | sdk+fmt |
| Adjust | Remove Background | missing | Remove Background | L | M | sdk |
| Adjust | Corrections | missing | Corrections | M | M | sdk+fmt |
| Adjust | Color | missing | Color | M | M | sdk+fmt |
| Adjust | Artistic Effects | missing | Artistic Effects | L | L | sdk+fmt |
| Adjust | Transparency | missing | Transparency | S | M | ui |
| Adjust | Compress Pictures... | missing | Compress Pictures | M | M | desk |
| Adjust | Change Picture | partial | Change image in the side panel | S | M | ui |
| Adjust | Reset Picture | missing | Reset Picture | S | M | ui |
|  | PictureStylesGallery | missing | Picture Styles | M | M | mix |
|  | Picture Border | partial | outline in the side panel | S | M | ui |
|  | Picture Effects | missing | Picture Effects | L | M | sdk+fmt |
|  | Picture Layout | missing | Picture Layout (SmartArt) | L | L | sdk |

Present: Picture....

### Excel: Shape Format (contextual, shape)

23 controls: 7 present, 9 partial, 7 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Insert Shapes | ShapesInsertGallery | missing | insert shapes inside a chart | S | L | ui |
| Insert Shapes | Edit Shape | partial | Change Shape / Edit Points by context menu | S | L | ui |
| Shape Styles | ShapeStylesGallery | missing | Shape Styles gallery | M | M | ui |
| Shape Styles | Shape Fill | partial | fill in the side panel | S | M | ui |
| Shape Styles | Shape Outline | partial | outline in the side panel | S | M | ui |
| Shape Styles | Shape Effects | partial | shadow only | L | M | sdk+fmt |
| WordArt Styles | TextStylesGallery | missing | WordArt styles | S | L | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | L | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | L | ui |
| WordArt Styles | Text Effects | missing | Text Effects | L | L | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects | M | L | ui |
| Accessibility | Alt Text | partial | alt text in the side panel | S | M | ui |
| Arrange | Selection Pane... | partial | not offered in Calc | M | M | ui |
| Arrange | Rotate | partial | side panel only | S | L | ui |
| Size | Shape Height | partial | size in the side panel | S | M | ui |
| Size | Shape Width | partial | size in the side panel | S | M | ui |

Present: Text Box, Format Object..., Bring Forward, Send Backward, Align, Group, Size and Properties....

### Excel: Sparkline (contextual, sparkline)

17 controls: 0 present, 13 partial, 4 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Sparkline | Edit Data | partial | sparkline settings in the side panel | S | M | ui |
| Type | Line | partial | type in the side panel | S | M | ui |
| Type | Column | partial | type in the side panel | S | M | ui |
| Type | Win/Loss | partial | type in the side panel | S | M | ui |
| Show | High Point | partial | side panel | S | M | ui |
| Show | Low Point | partial | side panel | S | M | ui |
| Show | Negative Points | partial | side panel | S | M | ui |
| Show | First Point | partial | side panel | S | M | ui |
| Show | Last Point | partial | side panel | S | M | ui |
| Show | Markers | partial | side panel | S | M | ui |
| Style | SparklineColorStyleGallery | missing | Sparkline Style gallery | S | L | ui |
| Style | Sparkline Color | partial | side panel | S | M | ui |
| Style | Marker Color | partial | side panel | S | L | ui |
| Group | Axis | partial | side panel | S | L | ui |
| Group | Group | missing | Group sparklines | S | L | ui |
| Group | Ungroup | missing | Ungroup sparklines | S | L | ui |
| Group | Clear | missing | Clear sparklines from the ribbon | S | L | ui |

### Excel: PivotTable Analyze (contextual, pivot)

26 controls: 4 present, 4 partial, 16 missing, 2 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| PivotTable | PivotTable Name | missing | PivotTable Name box | S | L | ui |
| PivotTable | Options | missing | PivotTable Options dialog | M | M | ui |
| Active Field | PivotField Name | missing | Active Field name | S | L | ui |
| Active Field | Field Settings | partial | field settings in the side panel | S | M | ui |
| Active Field | Show Details | missing | Show Details (drill through) | M | M | sdk |
| Group | Group Selection | missing | Group Selection (dates, numbers, text); engine has asc_groupPivot, no UI | S | H | ui |
| Group | Ungroup... | missing | Ungroup pivot items; engine has asc_ungroupPivot | S | M | ui |
| Group | Group Field | missing | Group Field (dates by month/quarter/year, numeric ranges); engine has asc_groupPivot | S | H | ui |
| Filter | Insert Slicer... | partial | slicers from Table Design, not from a pivot | S | M | ui |
| Filter | Insert Timeline... | missing | Timeline for pivots | M | M | sdk |
| Filter | Filter Connections... | missing | Filter Connections | M | M | sdk |
| Data | Change Data Source... | missing | Change Data Source | S | M | ui |
| Actions | Clear | missing | Clear (all, filters) | S | L | ui |
| Actions | Move PivotTable | missing | Move PivotTable | S | L | ui |
| Calculations | Fields, Items, & Sets | partial | Calculated Items; calculated fields, solve order, list formulas missing | M | M | sdk |
| Calculations | OLAP Tools | n/a | OLAP tools | - | - | - |
| Calculations | Relationships | n/a | Power Pivot data model relationships | - | - | - |
| Tools | PivotChart | missing | PivotChart | L | M | sdk |
| Tools | Recommended PivotTables | missing | Recommended PivotTables | M | M | sdk |
| Show | Field List | partial | Field list in the side panel, no toggle | S | L | ui |
| Show | +/- Buttons | missing | +/- Buttons toggle | S | L | ui |
| Show | Field Headers | missing | Field Headers toggle | S | L | ui |

Present: Expand Field, Collapse Field, Refresh, Select.

### Excel: Design (contextual, pivot)

9 controls: 9 present, 0 partial, 0 missing, 0 n/a.

Present: Subtotals, Grand Totals, Report Layout, Blank Rows, Row Headers, Column Headers, Banded Rows, Banded Columns, PivotTableStylesGallery.

## PowerPoint

### PowerPoint: Home

51 controls: 41 present, 3 partial, 5 missing, 2 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Clipboard | Office Clipboard... | missing | Office Clipboard task pane | M | L | mix |
| Font | Shadow | missing | text shadow | M | L | sdk+fmt |
| Font | Character Spacing | partial | spacing only in the advanced text settings, no preset gallery | S | M | ui |
| Paragraph | Convert to SmartArt | missing | Convert text to SmartArt | L | L | sdk |
| Drawing | Quick Styles | missing | Quick Styles gallery for shapes (preset fills and outlines) | M | M | ui |
| Drawing | Shape Effects | partial | shadow only; preset, reflection, glow, soft edges, bevel, 3-D rotation missing | L | M | sdk+fmt |
| Editing | Replace Fonts... | missing | Replace Fonts across the deck | S | M | mix |
| Voice | Dictate | n/a | Microsoft cloud dictation; local STT is possible | M | M | svc |
| Add-ins | Add‑ins | partial | Plugins tab hidden, no add-in manager | M | L | ui |
| Copilot | Design Suggestions | n/a | Microsoft Designer / Copilot design suggestions; local equivalent: layout suggestions from Ask Elixir (optional) | L | M | svc |

Present: Paste, Cut, Copy, Format Painter, New Slide, Layout, Reset, Section, Font, Font Size, Increase Font Size, Decrease Font Size, Clear Formatting, Bold, Italic, Underline, Strikethrough, Change Case, Text Highlight Color, Font Color, Font..., Bullets, Numbering, Decrease Indent, Increase Indent, Line Spacing, Align Left, Center, Align Right, Justify, Columns, Text Direction, Align Text, Paragraph..., Shapes, Arrange, Shape Fill, Shape Outline, Format Object..., Find and Replace, Select.

### PowerPoint: Insert

26 controls: 17 present, 2 partial, 7 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Images | Screenshot | missing | Screenshot and Screen Clipping | M | L | desk |
| Images | Photo Album... | missing | Photo Album (one slide per picture, layouts, captions) | M | M | mix |
| Camera | Cameo | missing | Cameo (webcam overlay), could use local camera | M | L | desk |
| Illustrations | 3D Models | missing | 3D models | L | L | sdk+fmt |
| Links | Zoom | missing | Summary, Section and Slide Zoom | L | L | sdk+fmt |
| Links | Action | partial | hyperlink to slide or URL; Action settings (mouse over, run program, sound) missing | M | L | sdk |
| Text | Object... | missing | OLE objects (Object...) | L | L | sdk+fmt |
| Media | Audio | partial | audio from the device; Record Audio missing | M | M | ui |
| Media | Screen Recording... | missing | Screen Recording (web getDisplayMedia, desktop capture) inserted as video | M | M | desk |

Present: New Slide, Table, Pictures, Shapes, Icons, SmartArt..., Chart..., Link, Comment, Text Box, Header & Footer..., WordArt, Date & Time..., Slide Number, Equation, Symbol..., Video.

### PowerPoint: Draw

18 controls: 5 present, 4 partial, 6 missing, 3 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Undo | Undo Last | n/a | Undo is in the title bar | - | - | - |
| Undo | Can't Repeat | n/a | Repeat is in the title bar | - | - | - |
| Drawing Tools | Lasso Select | missing | Lasso Select for ink | M | L | sdk |
| Drawing Tools | Pencil | partial | pens only (Pen, Highlighter, Pencil not separate) | S | L | ui |
| Drawing Tools | Highlighter | partial | via pen types | S | L | ui |
| Drawing Tools | Fountain Pen | partial | via pen types | S | L | ui |
| Drawing Tools | Brush Pen | partial | via pen types | S | L | ui |
| Drawing Tools | Add | missing | Add Pen (custom pen presets) | S | L | ui |
| Stencils | Ruler | missing | Ruler stencil | M | L | sdk |
| Convert | Ink to Shape | missing | Ink to Shape | L | M | sdk |
| Convert | Ink to Math | missing | Ink to Math | L | L | svc |
| Replay | Ink Replay | missing | Ink Replay | S | L | sdk |
| Help | Ink Help | n/a | Microsoft help | - | - | - |

Present: Select, Eraser, Pen.

### PowerPoint: Design

9 controls: 4 present, 1 partial, 3 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Customize | Variants | partial | Colors only; no variants gallery | S | M | ui |
| Customize | Fonts | missing | theme Fonts gallery (Colors only today) | S | M | ui |
| Customize | Effects | missing | theme Effects | M | L | sdk+fmt |
| Customize | Background Styles | missing | Background Styles gallery (Format Background exists) | S | M | ui |
| Edit | Design Suggestions | n/a | Microsoft Designer / Copilot design suggestions; local equivalent: layout suggestions from Ask Elixir (optional) | L | M | svc |

Present: SlideThemesGallery, Colors, Layout, Slide Size.

### PowerPoint: Transitions

9 controls: 8 present, 0 partial, 1 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Timing | Sound | missing | transition sound | M | L | sdk+fmt |

Present: Preview, AnimationTransitionGallery, Effect Options, Duration, Apply To All, On Mouse Click, After.

### PowerPoint: Animations

12 controls: 11 present, 0 partial, 1 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Advanced Animation | Animation Painter | missing | Animation Painter (absent in the shortcut matrix too) | M | M | sdk |

Present: Preview, AnimationGallery, Effect Options, Add Animation, Animation Pane, Trigger, Start, Animation Duration, Animation Delay, Move Earlier, Move Later.

### PowerPoint: Slide Show

16 controls: 5 present, 0 partial, 7 missing, 4 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Start Slide Show | Custom Slide Show | missing | Custom Slide Show (named subsets) | M | M | sdk+fmt |
| Rehearse | Rehearse with Coach | n/a | Rehearse with Coach (Microsoft cloud AI) | - | - | svc |
| Set Up | Rehearse Timings | missing | Rehearse Timings (record slide durations) | M | M | ui |
| Set Up | Record | missing | Record narration and timings | L | M | desk |
| Set Up | Keep Slides Updated | n/a | OneDrive/SharePoint live update | - | - | svc |
| Set Up | Play Narrations | missing | Play Narrations | M | L | sdk |
| Set Up | Use Timings | missing | Use Timings toggle (timings exist on transitions) | S | M | ui |
| Set Up | Show Media Controls | missing | Show Media Controls | S | L | ui |
| Monitors | Monitor | missing | choose the monitor for the show | M | M | desk |
| Captions & Subtitles | Always Use Subtitles | n/a | live subtitles (Microsoft cloud speech); local STT possible | L | L | svc |
| Captions & Subtitles | Subtitle Settings | n/a | subtitle settings | M | L | svc |

Present: From Beginning, From Current Slide, Set Up Slide Show..., Hide Slide, Use Presenter View.

### PowerPoint: Record

11 controls: 0 present, 1 partial, 9 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Preview | Preview | missing | Record tab | M | M | desk |
| Camera | Cameo | missing | Cameo | M | L | desk |
| Record | From Beginning... | missing | Record from beginning | L | M | desk |
| Record | From Current Slide... | missing | Record from current slide | L | M | desk |
| Record | Screen Recording | missing | Screen Recording | M | M | desk |
| Record | Audio | missing | Audio recording | M | M | desk |
| Edit | Clear Recording | missing | Clear Recording | S | L | sdk |
| Edit | Reset to Cameo | missing | Reset to Cameo | S | L | sdk |
| Export | Save as Show | partial | Save as .ppsx not offered in Save As | S | M | fmt |
| Export | Export to Video | missing | Export to Video (MP4) | L | M | desk |
| Help | Learn More | n/a | Microsoft help | - | - | - |

### PowerPoint: Review

13 controls: 8 present, 0 partial, 2 missing, 3 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Accessibility | Check Accessibility | missing | Accessibility checker | L | H | mix |
| Language | Translate | n/a | Microsoft Translator (cloud); local equivalent: optional LibreTranslate/Argos | M | M | svc |
| Activity | Mark All as Read | n/a | live co-authoring activity of Microsoft 365 | - | - | svc |
| Activity | Show Changes | n/a | live co-authoring activity of Microsoft 365 | - | - | svc |
| Ink | Hide Ink | missing | Hide Ink | S | L | ui |

Present: Spelling..., Thesaurus..., Language, New Comment, Delete, Previous, Next, Show Comments.

### PowerPoint: View

24 controls: 10 present, 2 partial, 12 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Presentation Views | Outline View | missing | Outline View of slide titles and text | M | M | sdk |
| Presentation Views | Notes Page | missing | Notes Page view | M | M | sdk |
| Presentation Views | Reading View | missing | Reading View | M | M | ui |
| Master Views | Handout Master | missing | Handout Master | M | L | sdk+fmt |
| Master Views | Notes Master | missing | Notes Master | M | L | sdk+fmt |
| Color/Grayscale | Color | missing | Color view | S | L | sdk |
| Color/Grayscale | Grayscale | missing | Grayscale view | S | L | sdk |
| Color/Grayscale | Black and White | missing | Black and White view | S | L | sdk |
| Window | New Window | missing | New Window | L | L | desk |
| Window | Arrange All | missing | Arrange All | S | L | desk |
| Window | Cascade | missing | Cascade | S | L | desk |
| Window | Move Split | missing | Move Split | S | L | desk |
| Window | Switch Windows | partial | desktop tabs and windows list | S | L | desk |
| Macros | Macros | partial | JavaScript macros; VBA never executed (policy) | - | M | sdk |

Present: Normal, Slide Sorter, Slide Master, Ruler, Gridlines, Guides, Notes, Grid Settings..., Zoom..., Fit to Window.

### PowerPoint: Help

6 controls: 0 present, 1 partial, 0 missing, 5 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Help | Help | partial | no in-app Help pane | M | M | ui |
| Help | Contact Support... | n/a | Microsoft support | - | - | svc |
| Help | Feedback | n/a | Microsoft feedback | - | - | svc |
| Help | Show Training | n/a | Microsoft training | - | - | svc |
| Help | What's New | n/a | Microsoft What's New | - | - | svc |
| Mobile | Get PowerPoint Mobile App | n/a | Microsoft mobile app | - | - | svc |

### PowerPoint: Table Design (contextual, table)

20 controls: 7 present, 2 partial, 11 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Table Styles | TableStylesGallery | partial | table styles in the side panel, not as a ribbon gallery | M | M | ui |
| Table Styles | Borders | partial | borders in the Format pane, no Borders menu in the ribbon | S | H | ui |
| Table Styles | Effects | missing | Cell bevel, shadow, reflection | M | L | sdk+fmt |
| WordArt Styles | Quick Styles | missing | WordArt Quick Styles on table text | S | L | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | L | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | L | ui |
| WordArt Styles | Text Effects | missing | Text Effects | L | L | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects | M | L | ui |
| Draw Borders | Pen Style | missing | pen style for table borders | S | M | ui |
| Draw Borders | Pen Weight | missing | pen weight for table borders | S | M | ui |
| Draw Borders | Pen Color | missing | pen colour for table borders | S | M | ui |
| Draw Borders | Draw Table | missing | Draw Table | M | M | ui |
| Draw Borders | Eraser | missing | Eraser | S | M | ui |

Present: Header Row, Total Row, Banded Rows, First Column, Last Column, Banded Columns, Shading.

### PowerPoint: Table Layout (contextual, table)

30 controls: 18 present, 8 partial, 4 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Table | View Gridlines | missing | View Gridlines | S | L | ui |
| Cell Size | Table Row Height | partial | row height in the Format pane, no ribbon spinner | S | M | ui |
| Cell Size | Table Column Width | partial | column width in the Format pane, no ribbon spinner | S | M | ui |
| Alignment | Align Left | partial | horizontal alignment from Home, not in the table tab | S | L | ui |
| Alignment | Center | partial | horizontal alignment from Home | S | L | ui |
| Alignment | Align Right | partial | horizontal alignment from Home | S | L | ui |
| Alignment | Text Direction | missing | cell text direction in the table tab | S | M | ui |
| Alignment | Cell Margins | missing | Cell Margins presets | S | M | ui |
| Table Size | Height | partial | table size in the Format pane | S | M | ui |
| Table Size | Width | partial | table size in the Format pane | S | M | ui |
| Table Size | Lock Aspect Ratio | missing | Lock Aspect Ratio | S | L | ui |
| Arrange | Rotate | partial | rotate and flip in the Format pane, no ribbon menu | S | M | ui |

Present: Select, Delete, Insert Row Above, Insert Row Below, Insert Column Left, Insert Column Right, Merge Cells, Split Cells..., Distribute Rows, Distribute Columns, Align Top, Center Vertically, Align Bottom, Bring Forward, Send Backward, Selection Pane..., Align, Group.

### PowerPoint: Picture Format (contextual, picture)

26 controls: 12 present, 3 partial, 10 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Edit | Edit Picture | n/a | Microsoft Designer picture editing (cloud AI) | - | - | svc |
| Edit | Remove Background | missing | Remove Background (AI or manual) | L | M | sdk |
| Edit | Erase | missing | Erase (background removal) | M | L | sdk |
| Adjust | Corrections | missing | Corrections | M | M | sdk+fmt |
| Adjust | Color | missing | Color | M | M | sdk+fmt |
| Adjust | Artistic Effects | missing | Artistic Effects | L | L | sdk+fmt |
| Adjust | Transparency | missing | Transparency (available for pictures in Word) | S | M | ui |
| Adjust | Picture Quality | missing | Compress Pictures and Upscale | M | M | desk |
| Picture Styles | PictureStylesGallery | missing | Picture Styles gallery | M | M | mix |
| Picture Styles | Picture Effects | missing | Picture Effects | L | M | sdk+fmt |
| Picture Styles | Picture Layout | missing | Picture Layout (SmartArt) | L | L | sdk |
| Accessibility | Alt Text | partial | alt text in the Format pane, no ribbon button | S | M | ui |
| Arrange | Rotate | partial | rotate and flip in the Format pane, no ribbon menu | S | M | ui |
| Size | Crop | partial | Crop, Fill, Fit; Crop to Shape and Aspect Ratio missing | S | M | ui |

Present: Change Picture, Reset Picture, Picture Border, Picture..., Bring Forward, Send Backward, Selection Pane..., Align, Group, Shape Height, Shape Width, Size and Position....

### PowerPoint: Shape Format (contextual, shape)

24 controls: 14 present, 4 partial, 6 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Insert Shapes | Edit Shape | partial | Change Shape and Edit Points via the context menu, no ribbon menu | S | L | ui |
| Shape Styles | ShapeStylesGallery | missing | Quick Styles gallery for shapes (preset fills and outlines) | M | M | ui |
| Shape Styles | Shape Effects | partial | shadow only; preset, reflection, glow, soft edges, bevel, 3-D rotation missing | L | M | sdk+fmt |
| WordArt Styles | TextStylesGallery | missing | WordArt Quick Styles in Shape Format | S | M | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | M | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | M | ui |
| WordArt Styles | Text Effects | missing | Text Effects | L | M | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects | M | L | ui |
| Accessibility | Alt Text | partial | alt text in the Format pane, no ribbon button | S | M | ui |
| Arrange | Rotate | partial | rotate and flip in the Format pane, no ribbon menu | S | M | ui |

Present: ShapesInsertGallery, Text Box, Merge Shapes, Shape Fill, Shape Outline, Format Object..., Bring Forward, Send Backward, Selection Pane..., Align, Group, Shape Height, Shape Width, Size and Position....

### PowerPoint: Chart Design (contextual, chart)

9 controls: 2 present, 1 partial, 5 missing, 1 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Chart Layouts | Add Chart Element | partial | chart elements in the side panel, no ribbon menu | M | H | ui |
| Chart Layouts | Quick Layout | missing | Quick Layout | M | M | mix |
| Chart Styles | Change Colors | missing | Change Colors | S | M | ui |
| Chart Styles | ChartStylesGallery | missing | Chart Styles gallery (present in Word and Excel) | M | M | ui |
| Data | Switch Row/Column | missing | Switch Row/Column | S | M | mix |
| Data | Select Data... | missing | Select Data | M | M | ui |
| Data | Refresh Data | n/a | refresh linked data | - | - | - |

Present: Edit Data, Change Chart Type....

### PowerPoint: Format (contextual, chart)

25 controls: 12 present, 4 partial, 9 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Current Selection | Chart Elements | missing | Chart Elements selector | S | M | ui |
| Current Selection | Format Selection | partial | Format pane | S | M | ui |
| Current Selection | Reset to Match Style | missing | Reset to Match Style | S | L | mix |
| Insert Shapes | Change Shape | missing | Change Shape | S | L | ui |
| Shape Styles | ShapeStylesGallery | missing | Quick Styles gallery for shapes (preset fills and outlines) | M | M | ui |
| Shape Styles | Shape Effects | partial | shadow only; preset, reflection, glow, soft edges, bevel, 3-D rotation missing | L | M | sdk+fmt |
| WordArt Styles | TextStylesGallery | missing | WordArt Quick Styles in Shape Format | S | M | ui |
| WordArt Styles | Text Fill | missing | Text Fill | S | M | ui |
| WordArt Styles | Text Outline | missing | Text Outline | S | M | ui |
| WordArt Styles | Text Effects | missing | Text Effects | L | M | sdk+fmt |
| WordArt Styles | Format Text Effects... | missing | Format Text Effects | M | L | ui |
| Accessibility | Alt Text | partial | alt text in the Format pane, no ribbon button | S | M | ui |
| Arrange | Rotate | partial | rotate and flip in the Format pane, no ribbon menu | S | M | ui |

Present: ShapesInsertGallery, Shape Fill, Shape Outline, Format Object..., Bring Forward, Send Backward, Selection Pane..., Align, Group, Shape Height, Shape Width, Size and Position....

### PowerPoint: SmartArt Design (contextual, smartart)

14 controls: 0 present, 0 partial, 14 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Create Graphic | Add Shape | missing | SmartArt cannot be edited from the ribbon | L | M | sdk+ui |
| Create Graphic | Add Bullet | missing | SmartArt editing | M | M | sdk+ui |
| Create Graphic | Text Pane | missing | SmartArt text pane | M | M | sdk+ui |
| Create Graphic | Promote | missing | SmartArt editing | S | M | sdk+ui |
| Create Graphic | Demote | missing | SmartArt editing | S | M | sdk+ui |
| Create Graphic | Right to Left | missing | SmartArt editing | S | L | sdk+ui |
| Create Graphic | Move Before | missing | SmartArt editing | S | L | sdk+ui |
| Create Graphic | Move After | missing | SmartArt editing | S | L | sdk+ui |
| Create Graphic | Layout | missing | SmartArt editing | S | L | sdk+ui |
| Layouts | SmartArtLayoutGallery | missing | change layout | M | M | sdk+ui |
| SmartArt Styles | Change Colors | missing | colors | M | M | sdk+ui |
| SmartArt Styles | SmartArtStylesGallery | missing | styles | M | M | sdk+ui |
| Reset | Reset Graphic | missing | Reset Graphic | S | L | sdk+ui |
| Reset | Convert | missing | Convert to Text/Shapes | M | M | sdk+ui |

### PowerPoint: Notes Master (contextual, notesmaster)

16 controls: 0 present, 0 partial, 16 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Page Setup | Notes Page Orientation | missing | Notes Master view | M | L | sdk+fmt |
| Page Setup | Slide Size | missing | Handout Master | S | L | ui |
| Placeholders | Header | missing | Notes Master | S | L | sdk+fmt |
| Placeholders | Slide Image | missing | Notes Master | S | L | sdk+fmt |
| Placeholders | Footer | missing | Notes Master | S | L | sdk+fmt |
| Placeholders | Date | missing | Notes Master | S | L | sdk+fmt |
| Placeholders | Body | missing | Notes Master | S | L | sdk+fmt |
| Placeholders | Page Number | missing | Notes Master | S | L | sdk+fmt |
| Edit Theme | Themes | missing | Notes Master themes | S | L | ui |
| Background | Colors | missing | Notes Master colors | S | L | ui |
| Background | Fonts | missing | Notes Master fonts | S | L | ui |
| Background | Effects | missing | Notes Master effects | S | L | ui |
| Background | Background Styles | missing | Notes Master background | S | L | ui |
| Background | Hide Background Graphics | missing | Hide Background Graphics | S | L | ui |
| Background | Format Background... | missing | Format Background (Notes Master) | S | L | ui |
| Close | Close Master View | missing | Close Master View | S | L | ui |

### PowerPoint: Handout Master (contextual, handoutmaster)

15 controls: 0 present, 0 partial, 15 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Page Setup | Handout Orientation | missing | Handout Master view (print handouts, notes pages) absent | M | L | sdk+fmt |
| Page Setup | Slide Size | missing | Handout Master | S | L | ui |
| Page Setup | Slides Per Page | missing | Slides Per Page for handouts (also affects printing) | M | L | sdk+fmt |
| Placeholders | Header | missing | Handout Master | S | L | sdk+fmt |
| Placeholders | Footer | missing | Handout Master | S | L | sdk+fmt |
| Placeholders | Date | missing | Handout Master | S | L | sdk+fmt |
| Placeholders | Page Number | missing | Handout Master | S | L | sdk+fmt |
| Edit Theme | Themes | missing | Handout Master | S | L | ui |
| Background | Colors | missing | Handout Master | S | L | ui |
| Background | Fonts | missing | Handout Master | S | L | ui |
| Background | Effects | missing | Handout Master | S | L | ui |
| Background | Background Styles | missing | Handout Master | S | L | ui |
| Background | Hide Background Graphics | missing | Handout Master | S | L | ui |
| Background | Format Background... | missing | Handout Master | S | L | ui |
| Close | Close Master View | missing | Handout Master | S | L | ui |

### PowerPoint: Slide Master (contextual, slidemaster)

18 controls: 9 present, 4 partial, 5 missing, 0 n/a.

| Group | Office control | Status | ElixirOffice | Effort | Value | Layer |
|---|---|---|---|---|---|---|
| Edit Master | Delete | partial | delete master/layout from the thumbnail context menu, no ribbon button | S | L | ui |
| Edit Master | Rename | partial | rename from the context menu | S | L | ui |
| Edit Master | Preserve | missing | Preserve master | S | L | sdk |
| Master Layout | Master Layout... | partial | placeholders toggled via Title/Footers only | S | L | ui |
| Edit Theme | Themes | partial | Themes gallery on Design, not in the master tab | S | L | ui |
| Background | Fonts | missing | Fonts gallery missing in the master tab | S | M | ui |
| Background | Effects | missing | Effects missing | M | L | sdk+fmt |
| Background | Background Styles | missing | Background Styles missing | S | M | ui |
| Background | Hide Background Graphics | missing | Hide Background Graphics | S | L | ui |

Present: Insert Slide Master, Insert Layout, Insert Placeholder, Title, Footers, Colors, Format Background..., Slide Size, Close Master View.

## File menu (backstage) and Options

| Microsoft File page | ElixirOffice | Notes |
|---|---|---|
| Home | present | desktop start page with recent files and templates |
| New | present | |
| Open | present | local files, Murena Workspace, Nextcloud |
| Share | partial | sharing through Nextcloud/Murena; no OneDrive link sharing |
| Info | present | document info and Protect Document |
| Save, Save As | present | Save As with format warnings; Save a Copy |
| Print | present | own print preview |
| Export | partial | PDF and other formats through Save As; Create PDF/XPS, Change File Type and Create Video as separate pages are missing |
| Close | present | |
| Account | partial | local profile or Nextcloud identity; no Microsoft account (n/a) |
| Options | partial | see below |

Options categories on Microsoft side. Word: General, Display, Proofing, Copilot, Save, Language, Accessibility, Advanced, Customize Ribbon, Quick Access Toolbar, Add-ins, Trust Center. PowerPoint: the same without Display and Copilot. Excel was not dumped (probe failed); from the documentation it has General, Formulas, Data, Proofing, Save, Language, Accessibility, Advanced, Customize Ribbon, Quick Access Toolbar, Add-ins and Trust Center.

| Category | ElixirOffice | Gap |
|---|---|---|
| General (user name, themes, start page) | present | interface theme and size, user name in the account menu |
| Display, Advanced (editing options) | partial | editing options are scattered; no single Advanced page |
| Formulas, Data (Excel) | partial | calculation options in the Formulas tab; iterative calculation present; Data options (default layout, linked data types) absent |
| Proofing | present | dictionaries, AutoCorrect as you type, per-language options; grammar options absent |
| Save | present | autosave, recovery, default format; AutoRecover location not editable |
| Language | present | interface and document language |
| Accessibility | missing | no accessibility options and no checker (backlog 3) |
| Customize Ribbon | missing | no ribbon customization; Quick Access Toolbar customization exists (`CustomizeQuickAccessDialog`) | 
| Add-ins | partial | plugins infrastructure exists, the Plugins tab is hidden and has no store |
| Trust Center | partial | macro policy (VBA never executed), private-by-default network behaviour; no per-file Protected View banner for downloaded files |
| Copilot | n/a | Microsoft service; Ask Elixir is the optional AI equivalent |

## Not dumped

These Microsoft tabs or states were not dumped; they are listed so the backlog is not read as complete for them. Statuses come from Microsoft documentation, not from a dump.

| Tab or state | App | What it contains | ElixirOffice |
|---|---|---|---|
| Developer (hidden by default) | Word, Excel, PowerPoint | Code (VBA editor, macros, record), Add-ins, Controls (content controls, form controls), XML mapping, Restrict Editing, Templates | content controls exist (Insert > Controls); VBA is preserved and never executed (policy); XML mapping, form controls (Excel) and macro recording missing |
| Header & Footer tab | Excel | Page Layout view header editing, Header & Footer Elements, Navigation, Options | missing (needs Page Layout view, backlog 40) |
| Video Format, Audio Format, Playback, Animation of media | PowerPoint | trim, fade, bookmarks, volume, style | missing; insertion of video and audio exists |
| Ink tools, Ink Equation | all | pen settings after drawing, Ink to Math | partly (Draw tab has pens, select, eraser) |
| Query, Table Design (query tables), Power Pivot | Excel | Power Query and data model | missing (large item) |
| Mail merge Preview/Finish, Print Preview | Word | the preview options are in the dumped Mailings tab | see Mailings table |
| Backstage pages in detail (Info, Print, Save As) | all | sub-pages and options | not compared beyond the list above |
| Options dialog, Excel | Excel | categories | listed from documentation only |
| Right-click menus, mini toolbar, status bar | all | context commands | not dumped; the context menus were swept earlier (`tests/ctxmenu/`) |

## ElixirOffice controls with no Microsoft counterpart

- **Elixir tab** (Ask Elixir, AI actions, optional, off by default).
- **Mail merge to PDF and one PDF per record** in the Mailings Finish menu.
- **Content Controls** gallery in Word Insert (Microsoft puts them in the Developer tab).
- **Interface Theme and Dark Document**, interface size, **Left Panel / Right Panel / Status Bar** toggles in View.
- **Solver** (built in) and **External Links** in Calc Data.
- **Merge Shapes** in the Word and Excel Layout tabs.
- **Sharing, co-editing mode, chat, history and Mail Recipients** in Review (server version).

