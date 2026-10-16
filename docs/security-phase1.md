# Hosted security hardening, phase 1

Review candidate based on the released product and DocumentServer revisions, without unmerged feature work. This phase changes no converter runtime.

Downloads keep private-network filtering when their URL was not authenticated by a decoded JWT. A supplied inbox/body token is validated even when mandatory JWT authentication is disabled. Verified token claims are retained separately from optional unsigned request parameters. Generic download trust additionally requires the selected URL to match its verified claim. The WOPI-specific branch is evaluated before generic URL fields and consumes only verified file metadata/authentication; unsigned WOPI metadata is rejected even when mandatory JWT authentication is disabled. The unused GET download route is removed; POST remains for the SDK original-file download and the PDF probe.

The AI proxy requires decoded session claims and checks the target origin before applying the configured provider URL prefix. The conversion-status page renders its URL through an escaped hidden input instead of interpolating it into JavaScript. The base-URL endpoint returns plain text. The privileged cache-flush script rejects hash values containing anything except ASCII letters and digits before configuration writes. Spreadsheet formula-wizard names, arguments, descriptions and results render as text, preserving deliberate bold labels.

## Source and attribution

Only code hunks were imported. Existing copyright/licence headers are unchanged. Upstream author and committer dates are before the 2026-05-14 cutoff.

| Component | Upstream commits | Dates |
|---|---|---|
| Server download/token checks | a82922ed2349d06495bfb85bed924be17fb71740; fba41289d55fee1a90d34df41fa115b7de8f4f1d | 2026-03-25; 2026-05-05 |
| Server AI proxy | ae8eb764354f75539fbb3c1ca12e0d967d02cdf0; b98384e6524fbc0376c8db4332ca0398e00abf67 | 2026-03-18 |
| WOPI conversion page | 4927e10d44b9f9f2ee6f9656d96be4a950fdd707 | 2026-03-24 |

Baseurl MIME type, cache-hash validation and FormulaWizard output handling are local fixes.

## Verification and limits

See [regression instructions](../tests/security/README.md). The same 38 checks give 5 passes / 33 failures against original release blobs and 38 passes / 0 failures against the candidate, without skips. Real Chromium exercises the view and rendered EJS; an owned ephemeral Express server receives a hostile forwarded-prefix HTTP request. Handler unit tests isolate JWT/configuration/network boundaries and assert trust flags and rejection before transport. They do not certify the underlying JWT verifier or network filtering agent.

The source caller audit found no download-route reference in the product desktop/example start page or web local-mode/API modules. The pinned SDK original-file download uses POST, and the actual PDF probe test confirms POST for the server route and GET only for a direct file URL.

Full hosted-service, Nextcloud/WOPI, native desktop and general regression gates remain unverified on this candidate. Rebrand checks have zero findings. No integration, deployment, public release, converter rebuild or private corpus run is included. Document hyperlink/rendering and converter/parser work remain separate later phases.

## Rebase and additional download hardening

The phase1 changes were rebased onto the integrated export-feedback sources. Unsigned downloads remain subject to their existing network filtering and never receive server-signed outbox authorization. A verified request whose selected URL is not present in the verified token fields now receives403 rather than a downgrade to unsigned transport. Legitimate signed root/payload/query and WOPI paths remain supported. Cache-hash validation sets and exports LC_ALL=C so its character class is strictly ASCII.

The unchanged38check suite passed after rebase. Four existing unrelated-token assertions were tightened from untrusted transport to403; three regressions were added for unsigned/signed outbox behavior and inherited locale. Before the additional hardening:35/41passed,6failed; after:41/41passed,0skips. The current desktop Node suite passed173/173,0skips. Its fresh owned asset fixture copies the accepted0.2.0 compiled payload and regenerates the desktop shell from current integrated sources; these are source-unit gates, not a new production SDK build or native package acceptance.
