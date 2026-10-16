# Hosted security phase 1 regression tests

Run against the exact DocumentServer worktree containing the server, web-apps and document-server-package checkouts:

    DS_ROOT=/absolute/DocumentServer node --test tests/security/phase1.cjs

The browser tests additionally require Playwright (with Chromium) and EJS 3.1.10. Set PLAYWRIGHT_MODULE and EJS_MODULE to absolute module paths when they are installed in an isolated test directory:

    DS_ROOT=/absolute/DocumentServer node --test tests/security/phase1-browser.cjs

The HTTP baseurl test also needs Express 4.21.2 (EXPRESS_MODULE may be an absolute module path); it starts an owned ephemeral loopback server, sends a hostile forwarded-prefix request through the real Express route and request-baseurl utility, and verifies the response MIME type and bytes.

The Node tests execute the actual getRequestParams and downloadFile function bodies and the complete AI proxy module, with configuration, JWT verification and transport boundaries stubbed. Chained tests also use the actual WOPI shape detector and FileUrl builder; JWT-disabled unsigned WOPI metadata and valid unrelated tokens cannot authenticate request-body URLs/file metadata, including when tokenRequiredParams is false. Verified root/payload/query claims preserve the signed paths. They verify trust propagation and rejection before transport; they are not a complete running-service or cryptographic JWT test. The baseurl test executes the actual route handler. The shell test executes only the validation prefix before privileged writes, never the root operations. A fake XMLHttpRequest verifies the actual PDF probe uses POST for the server download route.

Chromium loads the actual FormulaWizard, jQuery and Underscore sources. It exercises initial rendering, argument controls, live results, selected descriptions and height recalculation with hostile text, while preserving intended bold formatting. WOPI is rendered by the real EJS implementation before loading in Chromium. No personal desktop session is used.

The initial phase1 review recorded5/38passes on the original release and38/38on its candidate. After the export-feedback rebase, the same38checks passed. The current suite retains them, tightens four unsigned-field cases to403, and adds three outbox/locale regressions: before the additional hardening35/41pass, after41/41pass, with no skips. Missing dependencies are errors, not skipped tests. The full hosted server, Nextcloud/WOPI end-to-end flow and native desktop acceptance remain separate integration gates. These changes do not rebuild or alter x2t.

## Phase2 JavaScript and synthetic document checks

Set DS_ROOT to the phase2 DocumentServer checkout, PLAYWRIGHT_MODULE to an installed Playwright module and EO_SECURITY_DOCX_JSON to a verified synthetic fixture JSON, then run:

    node --test tests/security/phase2-links.cjs tests/security/phase2-render.cjs

Historical r1 scoped result:165/165,0skip. The r1 harness executes twelve actual callback bodies, including embeds/forms/diagrams, and actual review/comment/template code. It is not a complete editor GUI acceptance test.

To reproduce the public synthetic conversion proof in an owned temporary directory:

    python3 tests/security/make-hostile-docx.py "$EO_SECURITY_FIXTURES"
    EO_X2T_RELEASE=/path/to/the/pinned/full-release EO_X2T_PIN=tools/wasm/runtime-release.json node tests/security/docx-provenance.cjs
    python3 tests/security/verify-hostile-docx.py "$EO_SECURITY_FIXTURES"

EO_SECURITY_FIXTURES must be exported for the conversion script. The pin and release manifest are verified before conversion. Set EO_SECURITY_DOCX_JSON to "$EO_SECURITY_FIXTURES/verified.json" for the sink tests. No remote targets are requested. See docs/security-phase2.md for unresolved core path findings and acceptance limits.

MSG95 r2 extends the same two phase2 suites to208/208 (r1baseline165pass43fail), with EO_SECURITY_DOCX_JSON still required for both converted-DOCX cases. The thirteen callbacks include diagram mobile. Tests exercise www normalization, real English locale warning bindings for relative targets, and forms integrator URL resolution/rejection. Existing archive/native/runtime limits remain.
