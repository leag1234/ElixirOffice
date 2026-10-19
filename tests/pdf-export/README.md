# Desktop PDF export progress

Run the generator on a public sample DOCX to create a document with 300 explicit pages:

    python3 tests/pdf-export/generate-public.py public-sample.docx fixtures/public-export-300.docx

Use a private desktop stage and a packaged Linux executable with the normal sandbox enabled. Set EO_DESKTOP_ROOT, EO_PACKAGE_EXECUTABLE, EO_PLAYWRIGHT, EO_DESKTOP_DISPLAY and EO_XVFB_PID, then run:

    node tests/pdf-export/desktop.cjs

The test uses the actual File export control, actual conversion progress, actual native save dialog and actual resulting PDF. Native input checks ownership of the private display and app PID before every event. The generated output stays under the test root; fixtures are never installed or packaged.

It waits for 300-page background pagination before measuring export, verifies intermediate counts against a visible progress element, checks the final Open file/Show in folder actions, independently checks all 300 public page labels and preserves the original DOCX. It does not click those actions or claim a new physical-print test.
