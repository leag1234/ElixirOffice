# PDF page-order core repair for the combined 0.2.2 runtime

Core branch: elixir/pdf-page-order-core-A at
39ca5772b45dacfcd17ef1ea45eea8ee5d178a32, based on 528e920e4f34.
The neutral pdf-page-order-inherited-attributes.patch mirrors that eight-line
source change. D assigns the integration order with the phase-3 security and
RTL core work. Apply the core commit OR the patch once; it is deliberately
outside the automatic numbered patches directory.

The local runtime's positive reorderSafe attestation requires this core repair.
Do not pair the new inspector with an unfixed core. Older published runtimes
lack the attestation and keep thumbnail reordering disabled.

The isolated c81d87243164 qualification module was built from product
580786f914f4ede3c4e7dae99b5eb3a1583ba3d8, where the same patch still had its
temporary 0012 name. Its PdfEditor.cpp hash is identical to the core branch:
849fc87903737f0cf2074283eb5589861071c6b69664ebe0c0cb15a0e5fda4ea.
That binary is a qualification artifact only, never a published runtime pin.
D builds ONE new full/PDF pair from the combined source and reruns these checks.

Regression files in this product branch:
- tests/pdf-local/page-order-fixtures.py generates only synthetic public inputs.
- tests/pdf-local/policy-runtime.cjs checks 33 inspect/edit policy fixtures and
  three malformed jobs with EO_PDF_RELEASE and EO_PDF_POLICY set explicitly.
- tests/pdf-local/page-order-browser.cjs uses EO_BASE (an isolated instance,
  never port 8080), EO_PDF_WORK, EO_LOCALE and optional EO_DPR. EO_PDF_PIN may
  select an explicit candidate artifact/manifest hash without changing the
  published pin; the exact runtime manifest checksum remains mandatory.
- tests/pdf-local/page-order-structure.py checks every effective page attribute,
  stable original object IDs, Names/Dests targets, internal links and widget /P.
  Install tests/pdf-local/requirements.txt in EO_PDF_STRUCTURE_PYTHON's environment.
- tests/pdf-local/page-order-poppler.py independently compares all 90 reordered
  pages to their logical source identities, including the raster image.

Run browser qualification in English at DPR2 and French, then run the Poppler
script on each output folder. Default mode requires all six positive variants.
EO_EXPECT_REORDER_CLOSED=yes is a separate negative gate for an old runtime; its
explicit result mode cannot be treated as positive preservation qualification.
Run desktop/local-mode units with EO_UPSTREAM and EO_WEB_APPS pointing at the
owned source trees. Source fixture files, original input bytes and refusal
assertions must remain intact. No runtime pin or release promotion is authorized
by this review bundle.
