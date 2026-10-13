# Desktop beta release pipeline

Run on <dev-host> using explicit integrated product and DocumentServer revisions. The pipeline builds isolated review outputs; it never integrates, pushes or publishes.

For the local Mac builder workflow used by session A:

```sh
tools/release/desktop-beta.sh \
  --product-rev <integrated-product-commit> \
  --documentserver-rev <integrated-DocumentServer-commit> \
  --node <installed-node-22.23.3-executable> \
  --playwright-core <installed-playwright-core-directory> \
  --mac-export-only --build-only
```

The product revision must be an ancestor of main and DocumentServer an ancestor of elixir/dev. All eleven gitlinks are checked out at exact hashes in fresh detached worktrees under $EO_WORK/wt/. Source repositories are never reset.

## Source-pinned runtimes

The full converter pin is read from the selected SDK commit's common/wasm-convert/runtime-release.json. The PDF-only pin is read from the selected product commit's tools/wasm/pdf-runtime-release.json. For older revisions where that file is absent, tools/wasm/runtime-release.json is accepted only if its matched manifest identifies a PDF-only module. A present malformed or wrong-kind dedicated pin fails; it never falls back. BUILD-INFO records the selected PDF pin path. Both releases are resolved under $EO_WORK/wasm-artifacts (override the directory with --wasm-artifacts). There is no hardcoded release version. Missing releases, manifest SHA mismatches, mismatched versions, incorrect kinds or any of the six artifact byte/hash mismatches stop the build.

--full-runtime and --pdf-release may select another location for the same recorded releases. They cannot change the source pins. --full-manifest-sha256 is an optional assertion of the source SHA, not an override. No SDK pin or generated selector overlay is used.

## Artifacts and inputs

Output is /data/elixiroffice/release/beta2-YYYY-MM-DD/. --date and --label select a fresh directory; existing outputs are refused. Linux AppImage/DEB, Windows x64 installer, checksums, provenance and release notes are produced. Local Mac mode also produces MAC-INPUT.tar, while explicitly retaining state partial-unverified and exit2.

Build inputs include exact upstream test sources: AI Core.js, View.js and Strings.js; FileMenu.js for each editor; all135locale JSONs (45per editor); and tracked licence notices, exported from recorded Git blobs. tools/release/desktop-test-inputs.json is the shared inventory used by the exporter and a desktop unit test. The selected product inventory is used when present; older products use the frozen driver inventory. INPUTS.json and BUILD-INFO.json record source revisions, blob ids and hashes; BUILD-INFO records the manifest SHA separately. INPUTS.json also binds the inventory SHA, and the remote helper verifies the archived inventory matches it. The inventory is included among the pinned driver files and explicitly preserved in test archives. <dev-host> runs the full desktop unit suite with an isolated HOME and EO_UPSTREAM. The existing Mac/Windows builders clean the environment; their exact HOME/elixiroffice/DocumentServer fallback contains these exported inputs. No test is removed or skipped.

Archive exclusions are anchored to source build outputs, including desktop/dist and desktop/node_modules. Every checksum-listed resource, including mobile/dist/js, must survive with the same size and hash; archive generation validates all of them.

Node22.23.3, Python/pip, Docker access and installed immutable builder images are required on <dev-host>. Public locked dependency/font downloads use owned caches. Source exports contain no Git checkout or credentials.

## A's local Mac workflow

Verify MAC-INPUT.tar against SHA256SUMS, extract it into an authorized owned folder, and obtain TEST_UPSTREAM_MANIFEST_SHA from BUILD-INFO.json's test_upstream.manifest_sha256. Run:

```sh
/bin/bash tools/release/remote-build.sh mac "$PWD" yes "$TEST_UPSTREAM_MANIFEST_SHA"
```

The helper uses /bin/bash explicitly and reexecutes under /usr/bin/arch -arm64 on Apple Silicon. Wrong platform/architecture failures print a clear error. It uses owned cache/profile/temp directories, verifies the separately supplied source manifest hash and every source file, then runs the existing mac.sh builder, artifact audit and packaged tests. MAC_BUILD_CACHE is fixed to "$PWD/cache", matching the exported source HOME; if invoking mac.sh directly, use this same cache.

Mac packaging is ad-hoc signed and not notarized. Return the DMG and actual evidence for lead review; the export mode never infers a Mac pass.

## Graphical tests and limits

The existing Linux packaged Word test covers native PDF save; a six-format matrix on Linux/Mac covers real packaged open/edit/save/fresh-reopen/Wasm-PDF for docx/xlsx/pptx/odt/ods/odp. ODF fixtures are derived from public samples using the converter. Originals remain hashed and unchanged. PDF text, page count and backend are checked.

Mac native save/print sheets and Windows hardware acceptance remain separate. pdfinfo/pdftotext and existing graphical test dependencies are required on the hosts. Report a locked Venus session; do not unlock it or change settings.

The SSH mode remains available for already-authorized endpoints: --mac-host/--mac-root and --test-desktop-host/--test-desktop-root. Remote roots are explicit absolute directories whose final component is release-beta2 or release-beta2-<label>; no personal machine path is built in. EO_RELEASE_MAC_ROOT, EO_RELEASE_TEST_DESKTOP_HOST and EO_RELEASE_TEST_DESKTOP_ROOT can supply these values. --playwright-core (or EO_RELEASE_PLAYWRIGHT_CORE) is required for the installed test dependency; --node (or EO_RELEASE_NODE) selects the pinned executable, with neutral PATH lookup by default. Dedicated roots are confined, user-owned, marked and checked for symlinks/fresh jobs; no new keys, private-key copying, authorized_keys edits or sudo. The lead-approved relay can stage tests under $EO_WORK/bench/ without direct <dev-host>-to-Venus SSH. Only app children started by the harness are stopped.

Only four actual artifacts and successful Linux/Mac packaged gates yield review-candidate/exit0. Explicit partial/local-export builds remain exit2; failed phases retain logs/state failed/exit1. A completed installer is never a feature or platform acceptance.

## Validation records

2026-10-12 previews are retained as historical partial outputs; their old runtime overrides and frozen drivers are recorded, not current defaults. Their Venus matrix was5/6 and native PDF failed.

2026-10-13 source-resolution plans select98317b47cc65 for the older source pins and9aa540d2fd30 for6241519/DocumentServer1c743e72be, retaining the selected PDF-only pin. The empty-HOME unit baseline was50/52. Actual corrected archive units are52/52 with HOME fallback and52/52 with explicit EO_UPSTREAM. Ten pipeline tests cover source export,45locale completeness, archive resource coverage and architecture error reporting.

Current6241519 already includes14add05's lazy backstage PDF event-routing fix. The real source-pinned Linux package passes native Word edit/save/PDF/offline/no-Node/fresh-reopen on unlocked Venus. The initial ODT saved-clean failure was corrected by integrated web-apps926119ca8b / DocumentServerdbb08c17b8. The exact Linux candidate passes six formats and the targeted save-state cases; full final beta acceptance still requires the lead-selected integrated revisions and platform tests.

2026-10-13 MSG7 follow-up: eleven pipeline tests pass, including explicit/environment tool paths and configured archive input. The real current-source plan succeeds with explicit inputs; missing graphical host arguments fail closed. Eight real-Wasm packaged Word save-state cases pass, adding paste during save, undo back to an unchanged saved file with no conversion in flight, and disposal of exact callbacks verified by actual SDK dispatch with a positive control. No final beta2 build was started; wait for lead-selected heads after E.

2026-10-13 MSG11 source-pin alignment: thirteen pipeline tests pass for dedicated and legacy layouts, strict PDF-kind rejection and malformed-new-pin failure. Actual --plan exits0 for product56c93e8/DocumentServer6bdd048487 (full769ba807df31/PDFa6337ac5034f) and legacy4714b3c/dbb08c17b8. This is input validation only; no final beta2 package was built.

2026-10-13 MSG13 inventory extension: fourteen pipeline tests PASS. Exact A product960ac83/web-apps95c1c59cf2 source tests fail7of64 with the old47-file export. With142recorded files/135locales and the new shared-inventory unit,65/65 pass with zero skips under both strict empty HOME plus EO_UPSTREAM and the isolated HOME fallback. Seven actual hash-verified asset prerequisites and their unchanged manifest were supplied to the unit-only checkout; initial missing-asset failures are retained. These are source/unit input proofs, not final package or native platform acceptance. No A worktree or feature code changed.
