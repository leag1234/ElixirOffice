# Word editor document API: what the AI orchestrator can do

> Read-only, done on 2026-10-05 on `<build-host>:$EO_WORK/upstream/DocumentServer` (submodules at tag `v9.3.5-rc.1`) and on `upstream/plugin-aiautofill`.
> Paths are relative to `DocumentServer/`. A `file:N` reference designates a line that was read. A range `N-M` designates a block that was read.
> "Not verified" means: nothing was executed, and the code read is not enough to conclude. "Deduced" means: conclusion drawn from several readings, without a test.

## 0. Summary for the decision

1. **Changes made by the builder can arrive as tracked changes, but not all of them.** Tracking depends on the method called, not on the editor's mode.
   - **Tracked**: insertions (new runs, paragraphs, table rows created *after* tracking is activated), deletions made via `ApiRange.Delete`, formatting and style application made via `ApiRange.*`.
   - **Not tracked**: the setters `ApiRun.SetBold`, `ApiParagraph.SetStyle`, etc., the deletions `ApiParagraph.Delete` and `RemoveElement`, sections, columns and margins, and image placement. Detail in §3.10.
2. **A multi-step AI action can form a single undo step.**
   - Each `callCommand` already forms a history point.
   - `executeMethod("StartAction", ["GroupActions"])` … `executeMethod("EndAction", ["GroupActions"])` merges into a single point all the `callCommand`s and `PasteHtml`s executed between the two.
   - An `EndAction` with a non-empty status (`"cancel"`) undoes the whole group.
   - The official AI plugin does exactly this (§2.2, §5).
3. **The plugin layer is enough for a prototype.** The real limits are:
   - no tracking for page layout;
   - very little public layout information;
   - a global lock during groups;
   - `callCommand` silently ignored during a `StartAction("Block")`.
4. **Upstream-specific bug**: the `Api.asc_GetLocalTrackRevisions` bridge is overwritten by the setter (`sdkjs/word/apiBuilder.js:32300-32308`). With the Terser build without renaming, the call probably disables local tracking (deduced, §4).

---

## 1. The three API layers

### 1.a "Builder" API (Office JS / Document Builder)

- **Where**: `sdkjs/word/apiBuilder.js` (32,322 lines). `var Api = {}` (l.36) is an object of static methods, exported as `AscBuilder.Word.Api` (l.32284).
- **Classes** (constructors l.200-3929):
  - content: `ApiDocument` (inherits from `ApiDocumentContent`, l.3112), `ApiParagraph` (inherits from `ApiParaPr`, l.3145), `ApiRun` (inherits from `ApiTextPr`, l.3191), `ApiRange` (l.1189), `ApiHyperlink`, `ApiBookmark`;
  - tables: `ApiTable` (inherits from `ApiTablePr`), `ApiTableRow`, `ApiTableCell`, `ApiTableStylePr`;
  - styles and lists: `ApiStyle` (l.3549), `ApiNumbering`, `ApiNumberingLevel`;
  - page layout: `ApiSection` (l.3558);
  - graphic objects: `ApiDrawing` (l.3651), with the subclasses `ApiImage`, `ApiShape`, `ApiChart`, `ApiGroup`, `ApiOleObject` and `ApiSmartArt`;
  - content controls and forms: `ApiInlineLvlSdt` and `ApiBlockLvlSdt` (content controls), `ApiFormBase` and its derivatives;
  - comments: `ApiComment`, `ApiCommentReply`;
  - miscellaneous: `ApiDocumentVisitor` (l.29200), `ApiCustomXmlPart*`, `ApiCore`.
- **Volume**: 1,164 definitions `X.prototype.M = function` (counted with grep). `ApiDocument` has 111, `ApiParagraph` 81, `ApiRange` 42, `ApiDrawing` 45, `ApiSection` 30, `ApiStyle` 24 and `ApiTable` 40.
- **Static `Api.*` methods** (l.4528-5975): `GetDocument`, `GetByInternalId` (l.4541), `CreateParagraph` (l.4575), `CreateRange`, `CreateTable` (l.4620), `CreateRun`, `CreateImage` (l.4674), `CreateShape`, `CreateNumbering`, `CreateInlineLvlSdt`, `CreateBlockLvlSdt`, `FromJSON` (l.5596), `AddComment` (l.5863), `ReplaceTextSmart` (l.26927), `CreateTextPr` and `CreateParaPr` (l.27443-27454), `ConvertDocument` (l.27424), as well as unit conversions (l.27562-27803).
- **Bridges to the internal API added to `Api`** (l.32300-32318): `asc_GetLocalTrackRevisions`, `asc_SetLocalTrackRevisions`, `sendEvent` and `AI`.
- **`sdkjs/common/apiBase.js`** is not the builder: it is `baseEditorsApi`, the parent class of `asc_docs_api`. `getJsApi()` returns `this` there (l.6162). Word overrides it to return `AscBuilder.Word.Api` (`sdkjs/word/api.js:14886-14889`).

### 1.b Plugin API (`executeMethod`)

- **Resolution**: `executeMethod(name, args)` calls `api["pluginMethod_" + name]` (`sdkjs/common/plugins.js:1645-1650`).
- **Exceptions**: `SendEvent` and `SendEventInternal` are handled separately, synchronously (`plugins.js:1811-1828`).
- **Queue**: commands and methods go through a single FIFO queue, `queueCommands` (`plugins.js:1530-1563`). An "async" method calls `setPluginMethodReturnAsync` then `onPluginMethodReturn` (l.1624-1643).

**Common to the editors (`sdkjs/common/apiBase_plugins.js`)**

| Method | Line | Role |
|---|---|---|
| GetVersion | 196 | editor version |
| AddOleObject / EditOleObject / GetSelectedOleObjects | 207/217/228 | OLE |
| GetFontList | 278 | font list |
| InputText | 292 | emulated keyboard input (in `executeGroupActions`) |
| **PasteHtml** | 318 | pastes HTML at the selection. Asynchronous, goes through the clipboard and is inserted within the group (l.324-411) |
| PasteText | 420 | pastes plain text (asynchronous) |
| GetMacros / SetMacros / GetVBAMacros | 454/467/481 | macros |
| **StartAction** | 495 | `"GroupActions"` calls `startGroupActions()`. Otherwise, displays a `Block` or `Information` indicator |
| **EndAction** | 513 | `"GroupActions"` calls `endGroupActions()`, or `cancelGroupActions()` if `status` is set |
| OnEncryption | 587 | end-to-end encryption |
| SetProperties | 700 | document properties |
| SetPluginsOptions | 921 | plugin options |
| ShowInputHelper / UnShowInputHelper | 941/1027 | typing assistant popup |
| CoAuthoringChatSendMessage | 1069 | co-editing chat |
| GetSelectionType | 1089 | selection type |
| **ConvertDocument** | 1183 | document → Markdown or HTML |
| **GetSelectedText** | 1205 | selected text (configurable separators) |
| GetSelectedContent | 1242 | selection as `text` or `html` |
| ReplaceTextSmart | 1262 | replaces each paragraph of the selection with a string from an array |
| GetFileToDownload | 1305 | file in a given format |
| GetImageDataFromSelection / PutImageDataToSelection | 1350/1364 | image of the selected drawing |
| GetInstalledPlugins / RemovePlugin / InstallPlugin / UpdatePlugin | 1708-1876 | plugin management |
| ShowButton | 1913 | header buttons |
| Get/SetKeychainStorageInfo, OnSignWithKeychain | 1922-1942 | key chain (desktop) |
| OnDropEvent | 1962 | emulated drag and drop |
| GetDocumentLang | 2004 | document language |
| AddContextMenuItem / UpdateContextMenuItem | 2076/2092 | context menu |
| AddContentControlButtons | 2108 | buttons on a content control |
| AddToolbarMenuItem / UpdateToolbarMenuItem | 2177/2193 | toolbar tab or menu |
| ShowWindow / ActivateWindow / CloseWindow / SendToWindow / ResizeWindow / MouseUp/MoveWindow | 2210-2390 | plugin windows |
| ShowError | 2405 | error message |
| OnWindowDockChangedCallback | 2419 | panel docking |
| **AI** | 2438 | AI request forwarded to the registered AI plugin (`onAIRequest`) |
| onAIRequest | 2481 | AI plugin response |
| getLocalImagePath | 2501 | URL to local path |
| FocusEditor | 2528 | gives focus back to the editor |

**Word-specific (`sdkjs/word/api_plugins.js`)**

| Method | Line | Role |
|---|---|---|
| OpenFile / GetFields | 155/175 | opens a file with fields / fields as text |
| **InsertAndReplaceContentControls** | 188 | inserts or replaces content controls whose content is a builder script |
| RemoveContentControls / RemoveContentControl | 201/245 | removal of content controls |
| GetAllContentControls / GetCurrentContentControl / GetCurrentContentControlPr | 214/257/270 | reading content controls |
| SelectContentControl / MoveCursorToContentControl | 318/335 | navigation |
| RemoveSelectedContent | 350 | deletes the selection |
| **AddComment** | 397 | `asc_addComment(CCommentData)`, at the selection |
| MoveCursorToStart / MoveCursorToEnd | 417/437 | cursor |
| **SearchAndReplace** | 459 | replaces all (`Search` + `ReplaceSearchElement`) |
| SearchNext | 485 | selects the next occurrence |
| **GetFileHTML** | 511 | document as HTML (`ContentToHTML`) |
| GetAllComments / RemoveComments / ChangeComment / MoveToComment | 523-592 | comments |
| SetDisplayModeInReview | 609 | display: final, original or markup |
| AddContentControl / …CheckBox / …Picture / …List / …DatePicker | 634-739 | creation of content controls |
| Get/Remove/Select/Insert/ChangeOleObject(s) | 792-920 | OLE |
| **AcceptReviewChanges / RejectReviewChanges** | 1016/1032 | accepts or rejects, all or the selection |
| MoveToNextReviewChange | 1048 | navigation in revisions |
| Get/Update/Add/Select/RemoveAddinField(s), RemoveFieldWrapper | 1064-1197 | "add-in" fields |
| SetEditingRestrictions | 1214 | editing restrictions |
| Get/ReplaceCurrentWord, Get/ReplaceCurrentSentence | 1244-1300 | current word or sentence |
| **Undo / Redo / CanUndo / CanRedo** | 1319-1357 | history |
| GetCurrentBookmark | 1370 | current bookmark |
| AnnotateParagraph / SelectAnnotationRange / RemoveAnnotationRange | 1396-1431 | visual annotations ("text annotator" layer) |
| **InsertStreamedContent** | 1509 | streamed HTML insertion, `stable` part then `tail` part (undocumented, 9.2) |
| IsFillingFormMode / IsFillingOFormMode / IsEditingOFormMode | 1569-1604 | form modes |

**Forms (`sdkjs-forms/apiPlugins.js`)**: `GetAllForms` (l.67), `GetFormsByTag` (l.90), `SetFormValue` (l.116), `GetFormValue` (l.129) and `IsFormSigned` (l.180).

**Plugin events**:
- Word (`sdkjs/word/plugin-events.js`): `onAddComment`, `onChangeCommentData`, `onRemoveComment`, `onChangeCurrentPage`, `onSubmitForm`, `onFocus/Blur/ChangeContentControl`, `onShow/HideContentControlTrack`, `onInsertOleObjects`, `onFocus/Blur/ClickAnnotation` and `onParagraphText` (l.74-241).
- Common (`sdkjs/common/base-plugin-events.js`): `onClick`, `onTargetPositionChanged`, `onDocumentContentReady`, `onChangeRestrictions`, etc.
- **There is no "the selection changed" event**. Only `onTargetPositionChanged` exists, and it concerns the cursor.

### 1.c Internal API `asc_docs_api` (`sdkjs/word/api.js`), used by web-apps

This API is not officially exposed to plugins. Relevant methods:

| Domain | Methods (line) |
|---|---|
| History | `Undo` (2257), `Redo` (2268) |
| Search | `asc_findText` (3319), `asc_replaceText` (3379) |
| Styles | `put_Style` (4605), `asc_AddNewStyle` (9954), `asc_GetStyleFromFormatting` (9950) |
| Page layout | `change_PageOrient` (5227), `asc_SetSectionProps` / `asc_GetSectionProps` (5280/5284), `asc_SetColumnsProps` (5304) |
| Tables and images | `put_Table` (5705), `ImgApply` (6377) |
| Comments | `asc_addComment` / `asc_removeComment` / `asc_changeComment` (7455-7506) |
| Tracked changes | `asc_SetTrackRevisions` equals `asc_SetLocalTrackRevisions` (9981-9999). `asc_SetGlobalTrackRevisions` (10009). `asc_AcceptChanges` / `asc_RejectChanges` / `asc_AcceptAllChanges` / `asc_RejectAllChanges` (10050-10112). `asc_GetNext/PrevRevisionsChange` (10096/10100) |
| Reading | `asc_GetSelectedText` (12797), `asc_GetSelectionBounds` (14263, selection coordinates) |
| Builder | `canRunBuilderScript` (10297), `_onEndBuilderScript` (10310) |

Example of use on the web-apps side: the tracking button calls `asc_SetLocalTrackRevisions(null)` then `asc_SetGlobalTrackRevisions` in "for everyone" mode, or `asc_SetLocalTrackRevisions` in "for me" mode (`web-apps/apps/common/main/lib/controller/ReviewChanges.js:631-642`). At load, the local flag is forced if `isReviewOnly` or if `customization.review.trackChanges` is defined (l.948-952).

### 1.d How a `callCommand` runs

1. **Plugin side** (`sdkjs/common/plugins/plugin_base_api.js:519-533`):
   - the function is **serialized by `toString()`**, preceded by `var Asc = {}; Asc.scope = <JSON>; var scope = Asc.scope;`;
   - there is therefore **no closure**: parameters go through `Asc.scope`, as JSON;
   - the `isCalc` argument gives `info.recalculate`;
   - `callCommandAsync` is a Promise wrapper (l.608).
2. **Editor side** (`sdkjs/common/plugins.js:1572-1617`):
   - **if `api.isLongAction()` is true, the code is not executed** (l.1588) and the callback receives `undefined`;
   - otherwise `canRunBuilderScript()` (`word/api.js:10297-10308`) unlocks the group and calls `logicDocument.StartAction(historydescription_BuilderScript)` then `CheckActionLock()`;
   - `_beforeEvalCommand` locks the styles panel (`apiBase.js:4581-4592`);
   - the code is evaluated **synchronously** by `AscCommon.safePluginEval` (`common/macros.js:434-505`);
   - if `recalculate` is true and the last history point is not empty, `_afterEvalCommand` loads fonts and images before the end (`apiBase.js:4607-4635`);
   - `onEndBuilderScript` calls `_onEndBuilderScript`: `Recalculate()`, `UpdateSelection()`, `UpdateInterface()`, then `FinalizeAction()` (`word/api.js:10310-10322`);
   - the return value is only passed on if `Asc.checkReturnCommand` accepts it: primitive types, arrays and simple objects (`common/apiCommon.js:9554-…`).
3. **Evaluation context** (`macros.js:433, 452, 485`):
   - `eval` in strict mode, with `Function`, `window`, `document`, `self`, `globalThis` and `AscDesktopEditor` masked by empty objects;
   - `XMLHttpRequest` is replaced by a filtered version; `setTimeout` and `setInterval` are wrapped;
   - `import` is forbidden (l.476-482);
   - **`Api` is `AscBuilder.Word.Api`**, i.e. the builder, not `asc_docs_api`.
4. **Access to internal objects**:
   - **In fact**, unmasked globals remain resolvable by their bare name. This is the JS semantics of an `eval` in a `Function`: `AscCommon`, `AscWord`, `editor` (set by `word/api.js:922-925`). `Asc` is masked by the preamble's `var Asc = {}`. None of this is supported, and it is untested.
   - **In the upstream**, the Terser build does not use `mangle` (`sdkjs/build/webpack.sdk.factory.mjs:385-389`). Internal names are therefore not renamed: `apiPara.Paragraph`, `apiDoc.Document`, `apiDrawing.getParaDrawing()` and `ApiDocument.ForceRecalculate` are callable. This is a difference from ONLYOFFICE's Closure ADVANCED build (`sdkjs/build/DEVELOPER-GUIDE.md:219-223`).
5. **JSDoc note** (`plugin_base_api.js:503-504`): it states that builder commands should only be used to create content then `InsertContent`, "because of co-editing". The code does however allow modifying existing content: the comment at `word/api.js:10302-10303` says it always executes and checks the locks at the end. The exact behavior of `CheckActionLock` in co-editing is not verified.

---

## 2. Undo and grouping

### 2.1 A `callCommand` produces a history point

- `CDocument.StartAction` creates a point (`History.Create_NewPoint`) when no action is in progress (`sdkjs/word/Editor/Document.js:1996-2010`).
- `FinalizeAction` closes the action (`Document.js:2203-…`). It undoes everything if `Action.CancelAction`, because of a lock (l.2228-2238).
- Nested actions (`ReplaceSearchElement`, `Document.js:27735-27790`, etc.) only increment `Depth`, they do not create a new point.
- `ApiDocument.CreateNewHistoryPoint()` forces an extra point in the middle of a script (`apiBuilder.js:7078-7082`). To be avoided if a single Ctrl+Z is wanted.

### 2.2 Several calls in a single step

- `startGroupActions` (`apiBase.js:6061-6073`):
  - calls `History.startGroupPoints()`, which creates a `GroupPointsOpen` point (`word/Editor/History.js:1804-1807`);
  - sets `CollaborativeEditing.Set_GlobalLock(true)` and `Set_GlobalLockSelection(true)`;
  - Word also turns off the spell checker (`word/api.js:14859-14865`).
- `endGroupPoints` (`History.js:1839-1855`) **concatenates the `Items` of all the following points into the opening point**, then truncates. The result is a single undoable point.
- `cancelGroupPoints` (`History.js:1808-1837`) undoes all points since the opening and empties the redo. The recalculation then happens in `_onEndGroupActions` (`word/api.js:14867-14884`).
- Groups are reentrant (counter `groupActionsCounter`, `apiBase.js:6063-6068, 6119-6131`).
- Between two commands, `executeGroupActionsStart/End` (`apiBase.js:6086-6100`) lifts then restores the lock around each `callCommand` (via `canRunBuilderScript`) and each `PasteHtml` (`apiBase_plugins.js:366, 386`).
- **Proof of use**: the official AI plugin chains `StartAction GroupActions`, `callCommand`s, `PasteText`s, then `EndAction GroupActions` (`server/AdminPanel/client/src/pages/AiIntegration/ai/scripts/helpers/word.js:88-151, 216-267`). It also uses `"cancel"` (l.434).

### 2.3 Pitfalls

- `StartAction("Block", …)` calls `sync_StartAction(BlockInteraction)`, which does `incrementCounterLongAction()` (`apiBase.js:804-814`). `isLongAction()` then becomes true (`apiBase.js:1232-1243`), and **any `callCommand` is ignored** (`plugins.js:1588`). The AI plugin closes its "Block" before the first write (`helpers/word.js:79-84, 237`).
- During a group, the global lock prevents the user from editing for the whole LLM latency. The group must therefore be opened **after** the model's answer, or this blocking accepted.
- Co-editing during a group (sending of changes, conflict handling) is not verified.
- `pluginMethod_InsertStreamedContent` undoes the previous group if `undo` is requested, then reopens `GroupActions` for the `tail` part (`api_plugins.js:1518-1545`). This is the "progressive rewriting" mechanism.

---

## 3. Capabilities by domain (layer → method)

### 3.1 Styles

- Reading: `ApiDocument.GetStyle(name)` (7091) and `GetAllStyles` (9421).
- Creation: `CreateStyle(name, type)` (7106). It **replaces** a style of the same name (JSDoc l.7101).
- Modification: `ApiStyle.SetTextPr`, `SetParaPr`, `SetBasedOn`, `SetName` (15424, 15451, 15559, 15378). These are style definitions: **no revision type exists for them** (§3.10).
- Applying a paragraph style:
  - `ApiRange.SetStyle(oStyle)` (2643-2681) calls `Document.SetParagraphStyle` (`Document.js:6823`), which ends in `Paragraph.SetPStyle` then `private_AddPrChange()` (`Paragraph.js:11481-11489`). **Tracked.**
  - `ApiParagraph.SetStyle`, inherited from `ApiParaPr.SetStyle` (16519), calls `private_OnChange`, then `Paragraph.Set_Pr`, then `SetDirectParaPr`, **without** `AddPrChange` (`Paragraph.js:236-252`). **Not tracked.**
- Applying a character style: go through `ApiRange.SetTextPr(textPr)`, with `textPr.SetStyle(...)`. The chain `Document.AddToParagraph(ParaTextPr)` (`apiBuilder.js:2706-2707`) leads to `Run.Apply_TextPr`, which handles tracking (`Run.js:8010-8025`). **Tracked**, by deduction.
- Equivalent internal layers: `put_Style` and `asc_AddNewStyle`.

### 3.2 Paragraphs and runs

- Creation: `Api.CreateParagraph` (4575), `ApiParagraph.AddText` (10146), `AddPageBreak` (10170), `AddLineBreak`, `AddColumnBreak` (10199), `AddTabStop`, `AddDrawing` (10486) and `AddHyperlink`.
- Insertion: `ApiParagraph.InsertParagraph(…, "after"|"before")` (11348), `ApiDocumentContent.AddElement(pos, el)` and `Push` (6052, 6074), which go through `Internal_Content_Add`.
- Insertion at the selection: `ApiDocument.InsertContent(arr, isInline)` (7274).
- Deletion: `ApiParagraph.Delete` (10369), `RemoveElement` (6110) and `ApiRange.Delete` (2740).
- Stable identifiers: `GetInternalId` (10134) with `Api.GetByInternalId` (4541), and `Get/SetParaId` (10102-10132).

### 3.3 Ranges and selection

- Getting the selection: `ApiDocument.GetRangeBySelect()` (8063-8097) returns an `ApiRange` built on `SaveDocumentState().StartPos/EndPos`, or `null`.
- From the selection to paragraphs: `ApiRange.GetAllParagraphs()` (1701) and `GetParagraph(i)` (1487).
- Positions: `GetStartPos` / `GetEndPos` (2958/3013, character offsets in the parent element) and `SetStartPos` / `SetEndPos` (2927/2943).
- Range operations: `ExpandTo` (1798), `IntersectWith` (1825) and `ApiRange.GetRange(s, e)` (2862).
- Programmatic selection: `ApiRange.Select()` (1737), `ApiParagraph.Select()` (11391), `ApiTable.Select`, `ApiDrawing.Select` and `ApiDocument.RemoveSelection` (8239).
- Cursor: `MoveCursorToPos`, `MoveCursorLeft`, `MoveCursorRight` (9738-9980) and `GoToPage` (10048).
- Current word and sentence: `GetCurrentWord`, `SelectCurrentWord`, `ReplaceCurrentWord`, `ReplaceCurrentSentence` (9527-9631).
- Ranges are tracked during edits **within a single script** (`arrApiRanges`, `private_TrackRangesPositions`, `apiBuilder.js:42-…`). From one `callCommand` to the next, the object no longer exists. One must then go back through `paraId` or `InternalId` plus offsets.

### 3.4 Search and replace

- Search: `ApiDocument.Search(text, matchCase)` (8253-8279) returns an array of `ApiRange`, via `Document.Search` then `ApiParagraph.Search` (11408). `ApiTable`, `ApiTableCell` and `ApiBlockLvlSdt` also have a `Search` method.
- Replacement:
  - `ApiDocument.SearchAndReplace({searchString, replaceString, matchCase})` (7598-7621). The paragraph mark `^p` is not handled (l.7613).
  - `pluginMethod_SearchAndReplace` (459) does the same.
  - Both go through `ReplaceSearchElement`, which opens a standard action (`Document.js:27735-27790`). Tracking goes through the UI's search engine: not verified.
- **Search by style**: no dedicated method. One must iterate `GetAllParagraphs()` with `GetStyle()` (16535), or use `ApiDocumentContent.GetDocumentVisitor()` (6373, visitor l.29200-29268).

### 3.5 Tables

- Creation: `Api.CreateTable(cols, rows)` (4620-4631). The internal structure is `new CTable(..., rows, cols)`.
- Formatting: `ApiTable.SetStyle` (13666), `SetTableLook` (13694), `ApiTableRowPr.SetTableHeader` (18018, repeated header row), `SetHeight`, `ApiTablePr.SetWidth`, `SetJc` and borders (17556-17963).
- Structure: `GetCell` (13589), `MergeCells` (13609), `Split`, `AddRow(s)`, `AddColumn(s)`, `RemoveRow` and `RemoveColumn` (13755-13914).
- Cell content: `ApiTableCell.GetContent()` (14894), which returns an `ApiDocumentContent`.
- Tracking: a row created while tracking is active gets `ReviewInfo` as an addition (`word/Editor/Table/TableRow.js:85-93`). The `RowsAdd` type exists (`commonDefines.js:3146`). For table properties, see `Table.js:19191` (conditional `AddPrChange`). The path of the builder setters (`ApiTable.OnChangeTablePr` then `Table.Set_Pr`, `apiBuilder.js:31786-31788`) is not verified.

### 3.6 Images and shapes

- Creation: `Api.CreateImage(src, wEMU, hEMU)` (4674-4683) creates a `ParaDrawing`, which is **inline by default** (`ParaDrawing.js:52`, `DrawingType = drawing_Inline`). The drawing is inserted with `ApiParagraph.AddDrawing` (10486) or `ApiRun.AddDrawing`.
- Wrapping: `ApiDrawing.SetWrappingStyle("inline"|"square"|"tight"|"through"|"topAndBottom"|"behind"|"inFront")` (18651-18716).
- Position and anchor: `SetHorPosition` / `SetVerPosition(relativeFrom, EMU)` (18771/18805), `SetHorAlign` / `SetVerAlign` (18721/18737) and `SetDistances` (18824).
- Size: `SetSize` (18576), `ScaleWidth`, `ScaleHeight`, `SetRelativeWidth` and `SetRelativeHeight`.
- Anchoring to a page: `ApiDocument.AddDrawingToPage(d, page, x, y)` (8207-8237).
- Reading: `GetParentParagraph` (18836), `GetWidth`, `GetHeight`, `GetSelectedDrawings` (8924) and `ReplaceDrawing` (8986).
- Image loading: it is asynchronous, done at the end of the script by `Check_LoadingDataBeforePrepaste` (`apiBase.js:4620-4630`).
- Alternative: `executeMethod("PasteHtml", ['<img src=…>'])`, used by the AI plugin (`ai/scripts/engine/library.js:345`).

### 3.7 Sections and page layout

- Access: `ApiDocument.GetSections` (8161), `GetFinalSection` (7191), and `ApiParagraph.GetSection` / `SetSection` (11997/12013).
- Section break: `ApiDocument.CreateSection(oParagraph)` (7205-7224) sets a `SectPr` on the paragraph. The break type is set with `ApiSection.SetType("nextPage"|"continuous"|"oddPage"|"evenPage"|"nextColumn")` (12977-13008).
- Columns: `SetEqualColumns(n, spaceTwips)` (13038) and `SetNotEqualColumns` (13055).
- Page: `SetPageSize(w, h, isPortrait)` (13141, which also handles orientation) and `SetPageMargins` (13181).
- Headers and footers: `GetHeader(type, create)` / `GetFooter` (13289/13350), `SetTitlePage` (13410), `ApiDocument.SetEvenAndOddHdrFtr` (7237) and `SetStartPageNumber` (13501).
- Page breaks: `ApiParagraph.AddPageBreak`, `ApiParaPr.SetPageBreakBefore` (16741) and `ApiDocument.InsertBlankPage` (9884).
- Equivalent internal layer: `asc_SetSectionProps`, `asc_SetColumnsProps` and `change_PageOrient`.

### 3.8 Fields, lists and content controls

- **Fields**: `ApiRange.AddField(code)` (3091-3099) replaces the range then calls `AddComplexField`. There are also `ApiParagraph.AddPageNumber` and `AddPagesCount` (10213/10227), `ApiDocument.UpdateAllFields`, `UpdateAllTOC`, `AddTableOfContents` (8571, 8449, 9120), cross-references `AddHeadingCrossRef`… (11481-11781), and the add-in fields on the plugin side.
- **Lists**: `ApiDocument.CreateNumbering("bullet"|"numbered")` (7250) or `Api.CreateNumbering` (5190), `ApiNumbering.GetLevel` then `ApiNumberingLevel.SetTemplateType`, `SetCustomType`, `SetStart`, `SetRestart`, `LinkWithStyle` (17389-17529), and `ApiParagraph.SetNumbering(level)` (10287). `ApiParaPr.SetNumPr` and `SetBullet` also exist (17185/17207).
- **Content controls**: `Api.CreateBlockLvlSdt` and `CreateInlineLvlSdt` (5404/5260), `ApiDocument.GetAllContentControls` and `GetContentControlsByTag` (7630/7721), as well as `ApiInlineLvlSdt` (60 methods) and `ApiBlockLvlSdt` (52). Plugin side: `InsertAndReplaceContentControls`.

### 3.9 Comments

- Creation:
  - `ApiRange.AddComment(text, author, userId)` (2816-2849) selects the range then calls `AddCommentToDocument`, and returns an `ApiComment`;
  - same with `Api.AddComment(element|runs[], …)` (5863), `ApiParagraph.AddComment`, `ApiRun.AddComment` and `ApiTable.AddComment`;
  - on the plugin side, `AddComment(CommentData)` (`api_plugins.js:397`) acts at the selection.
- `ApiComment` (27820-28148): `SetText`, `SetAuthorName`, `SetUserId`, `SetSolved`, `AddReply(text, author, userId)` (28064), `GetQuoteText`, `Delete` and `SetPosition`.
- Reading and display: `ApiDocument.GetAllComments`, `GetCommentById` and `ShowComment([ids])` (8702-8741).
- **The author name is free**. The AI plugin passes the model's name (`helpers/word.js:128`).

### 3.10 Revisions (tracked changes)

**Enabling tracking**

| Means | Effect | Source |
|---|---|---|
| `ApiDocument.SetTrackRevisions(b)` | **global** flag (`Settings.TrackRevisions`), written to the history | `apiBuilder.js:7981-7985`, `Document.js` `SetGlobalTrackRevisions` |
| `ApiDocument.SetAssistantTrackRevisions(b, name)` | global flag, **plus temporary replacement of the identity** (`UserInfo` Id and FullName = `"uid-"+name` / `name`), plus a fixed color; restoration with `false` | `apiBuilder.js:8001-8028` |
| `Api.asc_SetLocalTrackRevisions(b)` | **local** flag ("for me" mode) | `apiBuilder.js:32305-32308`, `word/api.js:9993-9999` |
| `IsTrackRevisions()` | **returns the local flag if it is not `null`**, otherwise the global flag | `Document.js:17846-17852` |

- **Consequence**: if the UI set the local flag to `false` (`ReviewChanges.js:952`), `SetTrackRevisions(true)` or `SetAssistantTrackRevisions(true)` **does not enable** tracking (deduced). The AI plugin incidentally goes through the local flag (`engine/library.js:303-321`).
- `SetAssistantTrackRevisions` works because `ReviewInfo.Update()` reads `DocInfo.get_UserId()` and `get_UserName()` (`word/Editor/revisions/review-info.js`, `common/apiCommon.js:6484-6489`). Revisions therefore take the assistant's name. Possible side effects during the window: comments, co-editing locks (not verified).

**What is tracked?** Only the following revision types exist: `TextAdd`, `TextRem`, `ParaAdd`, `ParaRem`, `TextPr`, `ParaPr`, `TablePr`, `RowsAdd`, `RowsRem`, `TableRowPr` and `MoveMark` (`common/commonDefines.js:3138-3152`). There is **no type for a section, a style definition or the geometry of a drawing**.

| Builder operation | Tracked? | Why |
|---|---|---|
| Any new `ParaRun` created while tracking is active (`AddText`, `CreateParagraph` with its end mark, cells of `CreateTable`, `AddDrawing`) | yes | the constructor sets `ReviewInfo.createAdd()` if `IsTrackRevisions()` (`Run.js:94-104`); the paragraph mark is a run (`Paragraph.js:153-157`) |
| `ApiRange.AddText` | yes | `CheckRunBeforeAdd` then `private_CheckTrackRevisionsBeforeAdd` (`apiBuilder.js:1509-1580`, `Run.js:1194-1215, 860-880`) |
| `InsertContent` / `AddElement` of elements created **before** activation | no | `CSelectedContent.Insert` turns off local tracking during insertion (`SelectedContent.js:231-235, 269-270`) and `Internal_Content_Add` marks nothing (`Document.js:11157-11193`). Only the marking set when the runs were created counts (deduced) |
| `ApiRange.Delete` | yes | `Controller.Remove`, then `ParaRun.Remove` in review mode (`apiBuilder.js:2740-2756`, `Run.js:1343-1360`) |
| `ApiParagraph.Delete`, `RemoveElement`, `RemoveAllElements` | **no** | `Remove_FromContent` / `Internal_Content_Remove` delete physically (`apiBuilder.js:10369-10383, 6110-6115`, `Document.js:11195-11237`) |
| `ApiRange.SetBold`, `SetTextPr`, … | yes | `AddToParagraph(ParaTextPr)` then `Apply_TextPr` with `bReview` (`apiBuilder.js:1959-1990`, `Run.js:8010-8025`) |
| `ApiRun.SetBold`, `ApiTextPr.*` on a run, `ApiParagraph.Set*` (ParaPr) | **no** | `Run.SetPr` only updates an already present `PrChange` (`Run.js:7992-8008, 11069-11081`); `SetDirectParaPr` likewise (`Paragraph.js:236-252`) |
| `ApiRange.SetStyle` (paragraph style) | yes | `SetPStyle` then `private_AddPrChange` (`Paragraph.js:11481-11489`) |
| `ApiSection.*` (columns, margins, size, type) | **no** | no revision type |
| `ApiDrawing.SetWrappingStyle`, `SetSize`, `Set*Position` | **no** | no revision type (the `ParaDrawing` setters are called directly, l.18651-18805) |
| `ApiStyle.Set*` | **no** | no revision type |
| `PasteHtml` / `PasteText` with tracking active | yes | path used by `InsertAsReview` (`engine/library.js:303-321`); the pasted runs are created during tracking |

**Accepting and rejecting**:
- builder: `ApiDocument.AcceptAllRevisionChanges` and `RejectAllRevisionChanges` (8856/8869);
- plugin: `AcceptReviewChanges(isAll)` and `RejectReviewChanges(isAll)`, which act on all or on the selection (`api_plugins.js:1016-1038`), plus `MoveToNextReviewChange`;
- internal: `asc_AcceptChanges(change)` acts on a single revision.

**Report**: `ApiDocument.GetReviewReport()` (7483) returns the revisions by author. `ToJSON` also serializes the revision types (`word/fromToJSON.js:4288-4300`).

### 3.11 Reading the document for context

| Need | Method | Line |
|---|---|---|
| Plain text | `ApiDocumentContent.GetText(opts)`, `ApiRange.GetText`, `ApiParagraph.GetText` | 6300, 1665, 11261 |
| Markdown | `ApiDocument.ToMarkdown(htmlHeadings, base64img, demote, renderHTML)` (`CMarkdownConverter`); plugin `ConvertDocument("markdown")` | 8286; `apiBase_plugins.js:1183` |
| HTML | `ApiDocument.ToHtml(…)`; plugin `GetFileHTML` / `GetSelectedContent({type:"html"})` | 8311; `api_plugins.js:511` |
| Structural JSON (styles, numberings, sectPr) | `ApiDocument.ToJSON(…)`, `ApiRange.ToJSON`, `ApiParagraph.ToJSON`, … ; `Api.FromJSON` | 8589-8608, 2766, 11843; 5596 |
| Structure | `GetAllHeadingParagraphs`, `GetAllNumberedParagraphs`, `GetAllCaptionParagraphs`, `GetAllTablesOnPage`, `GetStatistics`, `GetDocumentInfo` | 8784, 8767, 8836, 8180, 9342, 9451 |
| Typed traversal | `GetDocumentVisitor()` | 6373 / 29200 |

### 3.12 Coordinates and layout

**Public API**
- `ApiRange.GetStartPage()` and `GetEndPage()` (2894-2915) call `Document.private_GetXYByDocumentPosition` (`Document.js:15777-15798`), which returns `{Page, Y, H}`. They **do not force** a recalculation.
- `ApiDocument.GetPageCount()` (9385) and `GetAllTablesOnPage(n)` (8180) call `ForceRecalculate`. That one does `RecalculateAllAtOnce` from the beginning: there is no incremental recalculation in the builder (comment `apiBuilder.js:31684-31708`).
- `GetCurrentPage` and `GetCurrentVisiblePages` (9398/9410).

**Internal** (accessible in the upstream for lack of renaming, but not supported)
- `ParaDrawing.PageNum`, `X`, `Y`, `PositionH`, `PositionV`, `DrawingType`, `Distance`, `LayoutInCell` and `AllowOverlap` (`word/Editor/Paragraph/ParaDrawing.js:47-140`), plus `GetPageNum()` (2736) and `Get_Bounds()` (909).
- `CDocumentContentElementBase.GetAbsolutePage` and `GetPageBounds` (`DocumentContentElementBase.js:1040, 1099`) and `Paragraph.GetPagesCount` (`Paragraph.js:16525`).
- `asc_GetSelectionBounds` (`word/api.js:14263`).

**Readable break causes**: `keepNext`, `keepLines`, `pageBreakBefore` and `widowControl` can be read via `ToJSON` (`ApiParaPr` only has the setters, 16709-17142). Wrapping and anchor can be read via the drawing's `ToJSON` (19357).

**Pitfall**: during a script, `StartAction` pauses recalculation (`Document.js:2013`, `PauseRecalculate`). Positions read after an edit, in the same `callCommand`, are stale unless `ForceRecalculate`. Layout reads must be done in a separate, read-only `callCommand`.

---

## 4. Foreseeable limits of plugin mode

1. **Incomplete tracking** (§3.10):
   - `set_columns`, `set_page_setup`, image placement and style modification **cannot** become revisions: Word itself has no type for these cases (`commonDefines.js:3138-3152`);
   - a substitute is needed, for example a margin comment plus the grouped Ctrl+Z;
   - for the rest, the `ApiRange.*` methods must be chosen and not the object setters, and **content must be created after enabling tracking**.
2. **Fragile tracking activation**:
   - local flag versus global flag (`Document.js:17846-17852`);
   - `SetAssistantTrackRevisions` only touches the global flag;
   - **the `Api.asc_GetLocalTrackRevisions` bridge is overwritten by the setter**: `apiBuilder.js:32305` writes `Api.asc_GetLocalTrackRevisions = Api["asc_SetLocalTrackRevisions"] = function(isTrack){…}`. With Terser without `mangle` (`webpack.sdk.factory.mjs:389`), `Api.asc_GetLocalTrackRevisions` and `Api["asc_GetLocalTrackRevisions"]` are the same property. The "get" call therefore sets `undefined` as the local flag, which makes `IsTrackRevisions()` false, and returns `undefined`. The AI plugin's `InsertAsReview` (`library.js:303-321`) is affected. Deduced, to confirm by a test. **This is a one-line fix to make in our fork.**
3. **Fine-grained selection**:
   - no selection change event;
   - `GetRangeBySelect` only lives for the duration of a script;
   - one must re-anchor through `paraId` / `InternalId` plus offsets (`GetStartPos`, `GetEndPos`).
   - Multiple selections and selections in text boxes: not verified.
4. **Undo grouping**:
   - feasible (`GroupActions`);
   - but a global lock during the group (`apiBase.js:6069-6072`);
   - and `callCommand` is silent if a `StartAction("Block")` is open (`plugins.js:1588`);
   - `CreateNewHistoryPoint` breaks the unity of the step.
5. **Layout**:
   - publicly, only the page number of a range (`GetStartPage`) and the page count are available;
   - nothing on the page or position of a drawing, nor on the reason for a break;
   - `explain_layout` requires either internal access (possible in the upstream, but fragile), or native code.
6. **Asynchrony**:
   - the code of a `callCommand` must be synchronous: a returned `Promise` is rejected by `checkReturnCommand` (deduced);
   - images and fonts load after the script (`apiBase.js:4607-4635`);
   - `PasteHtml` is asynchronous and goes through the clipboard, with the editor's HTML conversion rules.
7. **Co-editing**: lock verification happens at `FinalizeAction` (`CheckActionLock`, `word/api.js:10306`). The behavior if a paragraph is locked by another user (cancellation of the whole script?) is not verified.

---

## 5. Inventory of existing AI plugins and integrations

**plugin-aiautofill** (v1.0.0, `config.json`: panel, Word only, `minVersion` 9.2.0)
- Fills in form fields. It reads the forms with `callCommand(Api.GetDocument().GetAllForms())` (`scripts/form.js:300-302`).
- It writes with `executeMethod("SetFormValue")` and `GetFormValue` (l.25, 38), which come from `sdkjs-forms/apiPlugins.js:116-129`.
- It delegates the mapping to the LLM via `executeMethod("AI", [{type:"Chat", data}])` (l.52), and tests availability with `{type:"Actions"}` (l.878).
- It blocks the UI with `StartAction` / `EndAction("Block")` (l.61-67).
- The data comes from a third-party backend configured in `plugins.options` (README).
- **It calls no LLM directly**: it depends on the AI plugin.

**ONLYOFFICE "AI" plugin** (GUID `asc.{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}`, v2.5.0, `type: background`, word/cell/slide/pdf editors)
- The source code is vendored in `server/AdminPanel/client/src/pages/AiIntegration/ai/` (583 files), with a `deploy/ai.plugin` package.
- **Providers**: `scripts/engine/providers/internal/` contains openai, anthropic, mistral, ollama, lmstudio, gpt4all, google-gemini, groq, deepseek, together, xAI, zhipu, stabilityai and proxy.
- **Textual pseudo tool-calling**: `[functionCalling (name)]: {json}` (`scripts/helperFuncs.js:26-79`, `code.js:127`).
- **Word tools**: `commentText`, `rewriteText`, `changeTextStyle`, `insertPage`, `checkSpelling` and `changeParagraphStyle` (`scripts/helpers/word.js:31-490`). Each combines a builder `callCommand` and `PasteText`, in `GroupActions`.
- **Rewriting** with `showDifference`: `SetTrackRevisions(true)`, then `ReplaceCurrentSentence("")`, then `PasteText`, then restoration (l.216-267). It therefore goes through the global flag, with the pitfall of §3.10.
- **Routing**: `editor.AI()` (`apiBase.js:6008-6017`) calls `_AI()`, which sends `onPluginEvent2("onAIRequest", …)` to any subscribed plugin (l.5987-6006, comment "only one AI plugin must be presented"). The AI plugin subscribes with `attachEditorEvent("onAIRequest")` (`code.js:316-325`) and answers with `SendEventInternal("ai_onRequest")` or `onAIRequest`.
- **Editor-side uses**: `MacrosAiDialog.js:163` (`api.AI` to generate macros) and `MacrosDialog.js:220` (`checkAI`).
- **Server**:
  - `aiSettings` in `server/Common/config/default.json:11-19` (providers, models, actions, timeout, `allowedCorsOrigins` to onlyoffice.github.io);
  - `/ai-proxy` proxy (`server/DocService/sources/server.js:344`, `ai/aiProxyHandler.js`);
  - settings sent to the interface (`DocsCoServer.js:3867`);
  - administration page (`AdminPanel/.../AiIntegration/hooks/useAiPlugin.js`).
- The AI plugin on the editor side is installed via `sdkjs-plugins` / pluginsmanager (`document-server-package/Makefile:64`). This directory is absent from the clone; the origin of the installed plugin is not verified.

---

## 6. Tool table

Assumption common to all tools:
1. open `StartAction("GroupActions")` after the LLM's answer;
2. enable tracking at the start: `Api.asc_SetLocalTrackRevisions(true)`, once the bridge is fixed, or `SetAssistantTrackRevisions(true, "ElixirAI")` combined with the local flag;
3. run one `callCommand` per tool;
4. restore tracking and identity, then `EndAction("GroupActions")`, or `"cancel"` on error.

| Tool | Best path | Plugin? | Blockers |
|---|---|---|---|
| `insert_paragraph(style,text,after)` | `Api.GetByInternalId(id)`, then `CreateParagraph`, `AddText`, `para.SetStyle(GetStyle)` **before** insertion, then `after.InsertParagraph(p,"after")` (11348) or `AddElement` | **yes** | create *after* enabling tracking; the style set on a new paragraph is part of the insertion (deduced) |
| `apply_style(range,style)` | `ApiRange.SetStyle` for a paragraph style; `ApiRange.SetTextPr(Api.CreateTextPr().SetStyle(cs))` for a character style | **yes** | do not use `ApiParagraph.SetStyle` nor `ApiRun.SetStyle` (not tracked) |
| `create_table(rows,cols,header,data)` | `Api.CreateTable`, filling `GetCell().GetContent()`, `SetStyle`, `GetRow(0).SetTableHeader(true)`, then `InsertParagraph` / `AddElement` | **yes** | tracking via `RowsAdd` (`TableRow.js:85-93`); table style and `TableLook` included in the insertion (deduced) |
| `set_columns(range,n)` | `CreateSection(firstPara)` and `CreateSection(lastPara)` with `SetType("continuous")`, then `ApiSection.SetEqualColumns(n, space)` | **partial** | **not trackable** (no revision type); grouped Ctrl+Z possible; margin comment instead |
| `insert_image(source,width,anchor)` | `Api.CreateImage(url,w,h)`, `para.AddDrawing`, then `SetWrappingStyle` and `SetHor/VerPosition` or `AddDrawingToPage` | **partial** | the insertion is tracked (new run, deduced) but not the wrapping nor the position; asynchronous image loading |
| `set_page_setup(...)` | `ApiSection.SetPageSize(w,h,isPortrait)`, `SetPageMargins`, `SetType`; internally, `asc_SetSectionProps` | **partial** | not trackable; grouped Ctrl+Z possible |
| `find(text\|style)` | `ApiDocument.Search(text)` to `[ApiRange]`; for a style, `GetAllParagraphs()` filtered by `GetStyle().GetName()`; return `{paraId/InternalId, start, end, text}` | **yes** | ranges do not survive the `callCommand`; no native regex search (not verified) |
| `replace_range(range,content)` | re-anchoring, then `range.AddText(new,"before")` and `range.Delete()` (both tracked); or `range.Select()` then `PasteHtml` for rich content | **yes** | `PasteHtml` is asynchronous and outside `callCommand` (within the group); the HTML is interpreted by the editor |
| `add_comment(range,text)` | `ApiRange.AddComment(text,"ElixirAI",uid)`, `ApiComment.AddReply` | **yes** | none |
| `explain_layout(element)` | read-only `callCommand` after recalculation: `GetStartPage` / `GetEndPage`, `GetPageCount`, `ToJSON` of the paragraph (keepNext…) and of the drawing (wrapping, anchor), plus the internal `getParaDrawing().PageNum/PositionV` and the page of the anchor paragraph | **partial** (native recommended) | no public API for the page or position of a drawing nor for the reasons of pagination; internal access not supported |
| Accept / reject | `AcceptReviewChanges(false)` on the selection, or `ApiDocument.AcceptAllRevisionChanges` | **yes** | "one revision" granularity only via the internal `asc_AcceptChanges` |
| Single undo | `StartAction("GroupActions")` … `EndAction("GroupActions")` | **yes** | global lock during the group; never `StartAction("Block")` during writes; no `CreateNewHistoryPoint` |

**Conclusion for phase 1.**
- We start as a plugin (type `panel`) following the AI plugin's pattern: `Asc.Editor.callCommand` / `callMethod` (`engine/library.js:26-64`) and `GroupActions`.
- We fix the `asc_GetLocalTrackRevisions` bridge in our fork (`apiBuilder.js:32305`).
- We go native for `explain_layout` (exposing the page, position and break cause of a drawing and a paragraph) and, if wanted, for an in-house "tracking" of section and drawing changes (log plus comment).
