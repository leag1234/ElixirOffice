# Desktop differential PDF diagnostics

The existing server fidelity harness measures raster/block flow, while desktop
font substitution and pagination need per-glyph positions and first divergence.
Keep its established metrics intact; add an independent, explicitly exploratory
desktop diagnostic under tools/fidelity.

Use pdfminer.six for actual glyph/line geometry and pypdf for page boxes, with
the existing Poppler/Pillow stack for raster evidence. Avoid writing a partial
PDF parser or adding another browser/rendering service. Dependencies are pinned
in requirements-differential.txt and actual versions enter each run identity.

Run sequentially with a systemd process-tree cap and owned Linux display/profile.
Never derive a Word fidelity claim from self references. Unique-word coverage,
errors, reference provenance and exploratory scoring remain separate. The owner
has not frozen these diagnostic weights as a fidelity acceptance gate.
