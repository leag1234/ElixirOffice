<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Desktop interface size (0.4 source candidate)

Open File > Options > General > Interface size and choose 80, 90, 100, 110,
125, 150, 175 or 200 percent, then Save. The default is 100 percent.
The choice applies to open windows and documents and persists for future windows
and restarts. On macOS the native View menu also offers Interface zoom in,
Interface zoom out and Reset interface zoom to 100%. These commands have no
default keyboard shortcuts: existing editor formatting shortcuts retain their
meaning. General is available on every desktop platform.

![Options > General with Interface size saved at 125%](screenshots/ui/interface-size-general-125-en.png)

Actual Linux source-app Options at the saved125% setting, captured with Electron
without image edits. The empty Home page remains behind the dialog. This illustrates
the0.4 source feature; it is not acceptance of a rebuilt package on other platforms.

Interface size scales the whole view, including the document's physical on-screen
size, like operating-system display scaling. It does not set the editor's document
zoom percentage. A larger interface leaves less room for the document.
The desktop SDK preserves actual fractional device density instead of rounding
167% down to 150%. Hosted browser scaling retains its existing policy.

Settings are validated in the main process and written before applying them.
A failed write retains the previous interface size. Capture mode stays at 100%
and cannot change the preference. Tab-strip and qualified compact-title-bar
bounds follow the selected size without rebuilding an editor.

## Qualification

Private sandboxed Linux X11 source checks cover Word, Spreadsheet, Presentation
and PDF at all eight sizes with actual DPR 1.671875, explicit document zoom100%,
unchanged dirty state and original fixture bytes. Each editor also passed an
Options save and a fresh-process persistence check. A separate native density
probe covers actual DPR1.671875 and2 at every preset. Hosted/default/cross-origin
source checks retain inherited scaling. Seven strings have reviewed translations
in all44non-English locales; source/projection seals accompany the catalog.

Word and Presentation PDF dimensions and marker positions are identical at80%
and200%. A spreadsheet with an explicitly custom default row height also retains
exact serialized bytes and PDF geometry. General/custom-frame/menu, preference
failure and existing keyboard paths have independent main-process tests.

These are source checks with rebuilt SDK JavaScript, not acceptance of a new
installer. macOS, Windows, Wayland, Windows Text size, physical monitor changes
and automatic document fit modes require separate native qualification.
Native macOS View commands have source coverage only.

## Known spreadsheet issue deferred to 0.5

A spreadsheet's automatically derived default row height can vary with display
density when saved. This predates Interface size: unmodified productb53fbbe saved
the same public XLSX with defaultRowHeight14.25 at DPR1,14 at DPR1.671875 and
13.88 at DPR2, with no customHeight flag and no interface-size API.
Lead release review(a) accepts comparison of this derived noncustom field separately;
explicit/custom heights, all other OOXML fields/parts and PDF geometry remain
strict. release review additionally allows only the validated core modification timestamp:
an unchanged-scale control proves that serialization advances it independently of
interface size. Author, revision and all other core-property bytes stay strict. The original raw-byte failure and baseline receipts are retained in the
task handoff. This does not establish byte-identical spreadsheet saves.
