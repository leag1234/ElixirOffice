# ElixirOffice desktop beta 2 — release candidate template

Do not publish this template without lead approval. BUILD-INFO.json identifies
the exact source pins, builder images, Wasm manifests, resources and gate logs.
The package version follows the selected product revision. Checksums verify
transport/integrity; builds are not claimed to be byte-identical across hosts.

## Integrated changes

Replace this section using the reviewed integrated revisions; do not infer
feature availability from a completed installer build.

## Not yet available

Mission F items below may be removed only after their source integration and
acceptance evidence are recorded:

- A1: offline spelling, supplied thesauri and hyphenation.
- A2: periodic separate recovery copies and next-start restoration; web-local
  IndexedDB recovery is separately tracked.
- A3: validated native external hyperlinks.
- D1: single-user comments and Word Track Changes, preserving read-only hosted
  permissions; author-name setting belongs to A6.
- D2: clipboard, dropped and supported file pictures; explicit URL errors under
  the existing local network policy.
- A4 / E D3: other-format Save As, additional input formats, local PDF/Print.
- A5: AI configuration and consent; hidden when unconfigured.
- A6: localized Help, slide media, author-name setting, extra picture types and
  offline chart Edit Data.
- E D4: Protect range; insert-text/link actions hidden or clearly labelled.

Already integrated items should be trimmed by the lead for the chosen revisions,
not by a packaging script guessing from branch names.

Outside beta 2 scope: mail merge, compare/combine, version history,
password-protected files, plugins/macros, digital signatures, PDF open/edit,
external workbook-link refresh and co-editing.

## Acceptance and platform limits

Fill exact results from BUILD-INFO.json and the raw six-format reports. A failed,
missing or unavailable gate remains visible; partial builds are not ready for
release. Linux/Mac tests use actual packaged apps and public temporary documents.
Mac all-format PDF checks follow the existing unattended Wasm PDF path; native
Mac save/print sheets remain separate acceptance, not silently passed here.
Windows payload/resource checks do not establish native Windows behavior.

Unsigned installers, macOS arm64-only, native Windows acceptance, installed
associations, Gatekeeper, notarization and native Print remain explicit until
separately verified. No public demo change or publication is performed by this
pipeline.
