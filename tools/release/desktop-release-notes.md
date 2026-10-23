# ElixirOffice {{VERSION}} (desktop)

Build {{BUILD_NUMBER}}, application source {{PRODUCT_REVISION}}. {{RELEASE_STATUS}} Exact platform versions, runtime pins, resources, artifact hashes and acceptance limits are recorded in BUILD-INFO.json.

## Changes
- About identifies the application version, build number and source revision on every platform.
- Candidate and final package versions are distinct and ordered for upgrades.

Review this template before publication and list only changes present in the selected source.

## Security

- Hosted/server hardening: downloads retain network filtering when JWT authentication is disabled, require verified WOPI token metadata and reject mismatched signed URL fields; unsigned URLs receive no outbox credentials. AI proxy authentication and destination checks are strengthened.
- Hosted/server and editor text handling: WOPI conversion status and /baseurl output are escaped or plain text; privileged cache hashes are validated under the C locale; spreadsheet Formula Wizard values are encoded.
- Document links use an explicit scheme allowlist across main, mobile, embed and forms interfaces, including diagrams. Bare www. targets receive http://; unsupported relative document links show a non-opening warning. Forms integrator-config relative links retain their configured-origin behavior.
- Imported tracked font/style names are encoded in the Review panel.

Upstream security-fix attribution: server download/WOPI commits [a82922ed](https://github.com/ONLYOFFICE/server/commit/a82922ed2349d06495bfb85bed924be17fb71740), [fba41289](https://github.com/ONLYOFFICE/server/commit/fba41289d55fee1a90d34df41fa115b7de8f4f1d); AI proxy commits [ae8eb764](https://github.com/ONLYOFFICE/server/commit/ae8eb764354f75539fbb3c1ca12e0d967d02cdf0), [b98384e6](https://github.com/ONLYOFFICE/server/commit/b98384e6524fbc0376c8db4332ca0398e00abf67); WOPI text commit [4927e10d](https://github.com/ONLYOFFICE/web-apps/commit/4927e10d44b9f9f2ee6f9656d96be4a950fdd707). Only code hunks dated before 2026-05-14 were ported; original licence headers are retained. Base-URL, cache, Formula Wizard, hyperlink policy and Review-panel corrections are ElixirOffice changes.

Converter and macro-sandbox hardening follows in desktop 0.2.2, with the corresponding server 0.1.2 runtime work. The 0.2.1 build retains its existing converter runtime; the source branch and regression results do not certify the later rebuilt converter.

## Verification and limitations
The final release is rebuilt; candidate test results do not certify final bytes. Native GUI, installation, Gatekeeper, associations and physical printing are unverified unless actual final-artifact evidence is recorded. Keep backups and inspect saved documents and PDF output.

Tagged PDFs cannot currently be saved in place; use Save a copy. Automatic recovery is not available for PDF documents. Original PDF text editing, OCR, PDF-to-DOCX, offline digital signatures and real-time co-editing are unavailable. Six template languages use English fallback; bundled font coverage and RTL table layout remain limited. AI is optional and off by default. Release-metadata checks are on by default and can be disabled in File > Options > Updates. At most one bounded daily GitHub check sends no document content, names, paths or user identity; GitHub receives ordinary HTTPS connection metadata, including the IP address. Release notes and Download open the release page in the system browser; the app downloads or installs no update. External AppImageUpdate checks remain user initiated.

The unsigned Windows installer and ad-hoc-signed, unnotarized Apple Silicon Mac build retain platform security limitations. Flatpak is separate; no installation/native acceptance is implied by static preview checks.

Source and third-party notices accompany the build. Generic privacy scanner candidates require explicit scope/classification; no secret-free certification is implied.
