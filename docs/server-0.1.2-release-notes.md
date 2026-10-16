# ElixirOffice server 0.1.2 release notes (draft)

Review against the selected integrated source, image and runtime before publication. Build identity and acceptance evidence are pending.

## Security

- Hosted/server hardening: downloads retain network filtering when JWT authentication is disabled, require verified WOPI token metadata and reject mismatched signed URL fields; unsigned URLs receive no outbox credentials. AI proxy authentication and destination checks are strengthened.
- Hosted/server and editor text handling: WOPI conversion status and /baseurl output are escaped or plain text; privileged cache hashes are validated under the C locale; spreadsheet Formula Wizard values are encoded.
- Document links use an explicit scheme allowlist across main, mobile, embed and forms interfaces, including diagrams. Bare www. targets receive http://; unsupported relative document links show a non-opening warning. Forms integrator-config relative links retain their configured-origin behavior.
- Imported tracked font/style names are encoded in the Review panel.

Upstream security-fix attribution: server download/WOPI commits [a82922ed](https://github.com/ONLYOFFICE/server/commit/a82922ed2349d06495bfb85bed924be17fb71740), [fba41289](https://github.com/ONLYOFFICE/server/commit/fba41289d55fee1a90d34df41fa115b7de8f4f1d); AI proxy commits [ae8eb764](https://github.com/ONLYOFFICE/server/commit/ae8eb764354f75539fbb3c1ca12e0d967d02cdf0), [b98384e6](https://github.com/ONLYOFFICE/server/commit/b98384e6524fbc0376c8db4332ca0398e00abf67); WOPI text commit [4927e10d](https://github.com/ONLYOFFICE/web-apps/commit/4927e10d44b9f9f2ee6f9656d96be4a950fdd707). Only code hunks dated before 2026-05-14 were ported; original licence headers are retained. Base-URL, cache, Formula Wizard, hyperlink policy and Review-panel corrections are ElixirOffice changes.

Converter and macro-sandbox hardening follows in desktop 0.2.2, with the corresponding server 0.1.2 runtime work. The 0.2.1 build retains its existing converter runtime; the source branch and regression results do not certify the later rebuilt converter.

## Pending acceptance

The server image, one-host bundle, own-instance regression gates and converter runtime/corpus acceptance must be recorded for the final selected revisions. This draft does not announce publication or certify an image. Converter and macro work remains scheduled with the lead.
