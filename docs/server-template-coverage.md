# Server Arabic template qualification

Z6 (release review) starts at Product5094ee2a, DS cb57b4ca and SDK9a06b24c.
The requested Arabic upright rule was already integrated by A in the shared
server/desktop generator and template data. There is no additional template
patch to apply on this base.

The four server Arabic DOCX contain zero effective Arabic italic runs and
regenerate byte-identically. The original pre64b46d8 sources reproduce nine
Arabic italic runs (3 assessment,4 letterhead,1 resume,1 worksheet) and missing
glyphs in every document. This historical source is a reproducer, not certified
as the exact published0.1.1 artifact. Existing release notes keep their date/scope.

## Actual server font mapping

The desktop-only coverage helper assumed file index1 meant fonts/001.
The server AllFonts metadata instead declares a filename array: DejaVu Sans
Regular index1 selects fonts/083. Ignoring that array caused false misses and
wrong physical style selection during qualification. The helper now follows
the declared filename and rejects unsafe or absent filename lists. Existing
sequential desktop inventories retain their behavior; no font or runtime changes.

An intact existing server beta1.1 image,
sha256:225f57e991237e8cf6d4d8a851684cedfab400743e77f5f8b79f201176d70b62,
was used in owned network-none containers without host mounts or public ports.
All233 client encoded font files were independently decoded and compared with
the exact native paths selected by the same image's native AllFonts metadata:
233/233 byte-identical. All native/client family/physical-face indices agree.
The server font profile is separate from desktop fallback overlays.

The maintained gate passes all156 offered shared templates with zero missing
characters using the actual generated character picker and physical style.
All four Arabic templates also have strict primary-face zero missing,
zero effective Arabic italic and exact source reproduction. Bold is preserved;
the Arabic-script rule already covers ar/ur/fa while Hebrew/Latin italic remains
unchanged. New filename/style/unsafe-name controls exercise real font bytes.

## Regeneration and regression

Four Arabic DOCX were explicitly regenerated with the existing generator.
The existing native server thumbnail pipeline regenerated all four PNGs at
264×374. Every byte matches the integrated files, including all312 provenance
records; all316 shared brand files remain unchanged. There is no duplicate
data-only commit or desktop template change. The desktop-only24 variants,
server39-language offer list, font files and published runtime pins are unchanged.

All244 existing desktop tests pass on both the unchanged current base and the
candidate. The new gate is run separately:

python3 tests/templates/server-arabic.test.py /path/to/server-font-assets --output /owned/work/server-template-gate.json

The explicit snapshot must contain sdkjs/common/AllFonts.js and its matching
encoded fonts directory from the same server profile. The gate checks actual
filename mapping, rendered coverage, strict Arabic coverage, DOCX reproduction
and every shipped DOCX/PNG hash. Use tools/example/localized-thumbnails.py with
an explicitly selected owned native converter container for PNG regeneration.

External receipts are under /srv/elixiroffice/wt/server-arabic-Z6-work:
baseline-correct-server-coverage.json, all233-native-web-identity.json,
regeneration-byte-equality.json, server-template-gate-final.json,
baseline/candidate desktop logs, native render logs, seven page images and
visual-qa.json. Final exact source/evidence manifests, independent review and
local head are recorded on the Z bus.

## Scope and limits

All seven native PDF pages were inspected individually. Glyph coverage and
identical native preview reproduction pass. This is not comprehensive layout
approval: the unchanged letterhead header decoration overlaps contact text,
the resume retains a blank second page, and the worksheet reminder box has
mixed-direction fraction/text crowding. These baseline layout issues are
recorded rather than silently changed in this narrow glyph task.

Earlier mismatched study-image metadata, numeric-filename assumptions, and a
read-only/tmpfs Docker-copy rendering attempt are retained as fixture negatives.
The accepted proof uses the intact server image, declared filename mapping,
exact native/client byte identity and a normal private writable container layer.

No live hosted-editor/OS/native package acceptance, new server release identity,
full backend/conversion fidelity or public deployment is certified. The native
font/render profile is explicit; the lead owns release packaging and integration.
