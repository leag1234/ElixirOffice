# Desktop Home template overlay

Four fictional CC0 examples add ja, zh, zh-tw, ko, si and ur to the desktop Home catalog.
The shared web templates remain unchanged. CJK variants require eligible, covering local
system fonts and otherwise retain English fallback. Sinhala and Urdu can use the small
bundled fallback faces with Computer fonts disabled.

Generate DOCX with tools/desktop/desktop_templates.py. template-sources.json records
every DOCX and preview hash, proofing tag, public layout source and the actual pinned
native preview converter/font profile. Previews are first-page 264-by-374 PNGs.
Runtime Electron, thumbnail and cross-platform rendering acceptance is separate.

Only these new variants tighten letterhead text line spacing and gaps, leave room
for the resume end marker and compact the empty worksheet end marker. Urdu letterhead
decorations keep clear of RTL text and all recipient lines fit their fixed frame. Existing text, tables and images remain.

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/desktop-system-fonts.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.
