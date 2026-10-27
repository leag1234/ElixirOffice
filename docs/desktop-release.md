# Desktop beta release pipeline

Run on development host using explicit integrated product and DocumentServer revisions. The pipeline builds isolated review outputs; it never integrates, pushes or publishes.

For the local Mac builder workflow used by session A:

```sh
tools/release/desktop-beta.sh \
  --product-rev <integrated-product-commit> \
  --build-number <new-monotonic-number> --channel <rc-or-final> \
  --published-versions <fresh-complete-inventory.json> \
  --build-ledger <canonical-allocation-ledger.json> \
  --documentserver-rev <integrated-DocumentServer-commit> \
  --node <installed-node-22.23.3-executable> \
  --playwright-core <installed-playwright-core-directory> \
  --mac-export-only --build-only
```

For 0.2.1 and later, follow the [build identity and publication guard](desktop-build-identity.md): planning does not allocate N; actual builds reserve it under a lock. Failed builds consume N. About, platform package metadata, BUILD-INFO and MAC-INPUT carry one identity. The historical records below remain historical.

The product revision must be an ancestor of main and DocumentServer an ancestor of elixir/dev. All eleven gitlinks are checked out at exact hashes in fresh detached worktrees under /srv/elixiroffice/wt/. Source repositories are never reset.

## Public corresponding-source archives

The private Mac input export and a public corresponding-source archive have different scopes. Create the public archive only from independently qualified public bare Git exports at exact selected revisions. Never stream the private repositories or filter a private source tarball into a public asset.

Use the release driver's separate source command after public Git qualification:

    tools/release/desktop-beta.sh public-source create \
      --selection public-source-selection.json --selection-sha256 <reviewed-selection-sha256> \
      --policy archive-privacy-policy.json --policy-sha256 <reviewed-policy-sha256> \
      --node <installed-node-22.23.3-executable> \
      --archive owned-output/elixiroffice-desktop-source.tar.gz \
      --proof owned-output/source-archive-proof.json

The selection records public repository paths, exact public commits, credential-free public HTTPS origins, fingerprinted qualification receipts, source roots, separately pinned build-support files and required source/legal/runtime paths. Every nested Gitlink must be present at its exact revision. A separately reviewed historical-to-public revision mapping is accepted only with a fingerprinted exact-tree-equivalence receipt and a newly verified public tree ID; the archive manifest discloses this mapping.

The external privacy policy carries the reviewed operator-specific patterns rather than copying private identifiers into source code. It must provide all required marker classes. An inherited canonical fixture allowance is limited to the exact reviewed path, full-file fingerprint and marker class. Internal instruction files, internal handoff directories, coordination markers, private hosts and private corpus paths fail closed. The scanner examines actual member names and bytes, including link targets, rather than trusting the source manifest. Exact encoded-data coincidences require a separately fingerprinted approval tuple. A classified Brotli runtime is decoded with pinned Node and checked against the actual raw archive pair. A classified canonical public GIF binds its public revision/origin and published baseline blob, complete GIF structure, exact marker count wholly inside image LZW data, and an independently measured, fingerprinted all-frame decode receipt with its explicit RGBA framing. The GIF bytes must remain exactly identical to that measured proof; metadata, changed payloads and other findings remain forbidden. No general binary or image exclusion is provided.

Creation checks source Git blob integrity, modes, nested closure, legal/runtime requirements and pinned supplemental bytes, then independently reads and checks the completed archive before committing a fresh output. Verification requires the same fingerprinted external selection; it re-enumerates the qualified public trees and compares every actual payload to its expected Git blob, mode and type. It rejects unsafe paths, symlink chain escapes, duplicate members and members beneath file or symlink ancestors. No build number is allocated, package is rebuilt, application pin is changed, or publication performed by this command.

Use the same command with verify and a fresh proof path for an independently supplied archive. The artifact collector refuses to checksum a source archive without its fingerprinted policy and selection. Keep historical rejected assets and receipts outside the publication folder, update the public archive metadata and checksums coherently, and obtain an independent review before replacing an asset or announcing readiness.

Regression fixtures: python3 tests/release/public-source.test.py.

## Source-pinned runtimes

The full converter pin is read from the selected SDK commit's common/wasm-convert/runtime-release.json. The PDF-only pin is read from the selected product commit's tools/wasm/pdf-runtime-release.json. For older revisions where that file is absent, tools/wasm/runtime-release.json is accepted only if its matched manifest identifies a PDF-only module. A present malformed or wrong-kind dedicated pin fails; it never falls back. BUILD-INFO records the selected PDF pin path. Both releases are resolved under /srv/elixiroffice/wasm-artifacts (override the directory with --wasm-artifacts). There is no hardcoded release version. Missing releases, manifest SHA mismatches, mismatched versions, incorrect kinds or any of the six artifact byte/hash mismatches stop the build.

--full-runtime and --pdf-release may select another location for the same recorded releases. They cannot change the source pins. --full-manifest-sha256 is an optional assertion of the source SHA, not an override. No SDK pin or generated selector overlay is used.

## Artifacts and inputs

Output is /srv/elixiroffice/release/beta2-YYYY-MM-DD/. --date and --label select a fresh directory; existing outputs are refused. Linux AppImage/DEB, Windows x64 installer, checksums, provenance and release notes are produced. Local Mac mode also produces MAC-INPUT.tar, while explicitly retaining state partial-unverified and exit2.

Build inputs include exact upstream test sources: AI Core.js, View.js and Strings.js; FileMenu.js for each editor; all135locale JSONs (45per editor); and tracked licence notices, exported from recorded Git blobs. tools/release/desktop-test-inputs.json is the shared inventory used by the exporter and a desktop unit test. The selected product inventory is used when present; older products use the frozen driver inventory. INPUTS.json and BUILD-INFO.json record source revisions, blob ids and hashes; BUILD-INFO records the manifest SHA separately. INPUTS.json also binds the inventory SHA, and the remote helper verifies the archived inventory matches it. The inventory is included among the pinned driver files and explicitly preserved in test archives. development host runs the full desktop unit suite with an isolated HOME and EO_UPSTREAM. The existing Mac/Windows builders clean the environment; their exact HOME/elixiroffice/DocumentServer fallback contains these exported inputs. No test is removed or skipped.

Archive exclusions are anchored to source build outputs, including desktop/dist and desktop/node_modules. Every checksum-listed resource, including mobile/dist/js, must survive with the same size and hash; archive generation validates all of them.

Node22.23.3, Python/pip, Docker access and installed immutable builder images are required on development host. Public locked dependency/font downloads use owned caches. Source exports contain no Git checkout or credentials.

## Private Python build tools

The Mac and Windows builders provision Pillow==10.2.0 and lxml==6.1.3 from tools/desktop/requirements.txt into the caller-owned cache's python/ environment before resource checks or desktop unit tests. The private interpreter is placed first in PATH and verifies its prefix and both imported versions. The pinned Windows image has neither pip nor ensurepip, so build-python.py bootstraps pip 25.2 from a public wheel with a fixed URL, byte count and SHA256, installs it offline into the private environment, then runs that environment's pip with --isolated and a private pip cache. No system or user package installation is required; Python 3.9 or newer and HTTPS downloads are build prerequisites. Linux already creates an isolated environment from the same requirements, plus its explicitly pinned fonttools build prerequisite.

These are build tools kept outside desktop/; package rules select only the application files and assembled assets. The release audit must still verify that no Python environment, pip, Pillow or lxml library is present in the actual shipped payloads, and record the result rather than infer a native-platform pass. Mac execution and final package checks remain separate from Linux command-construction tests.

## A's local Mac workflow

Verify MAC-INPUT.tar against SHA256SUMS, extract it into an authorized owned folder, and obtain TEST_UPSTREAM_MANIFEST_SHA from BUILD-INFO.json's test_upstream.manifest_sha256. Run:

```sh
/bin/bash tools/release/remote-build.sh mac "$PWD" yes "$TEST_UPSTREAM_MANIFEST_SHA"
```

The helper uses /bin/bash explicitly and reexecutes under /usr/bin/arch -arm64 on Apple Silicon. Wrong platform/architecture failures print a clear error. It uses owned cache/profile/temp directories, verifies the separately supplied source manifest hash and every source file, then runs the existing mac.sh builder, artifact audit and packaged tests. MAC_BUILD_CACHE is fixed to "$PWD/cache", matching the exported source HOME; if invoking mac.sh directly, use this same cache.

Mac packaging is ad-hoc signed and not notarized. Return the DMG and actual evidence for lead review; the export mode never infers a Mac pass.

## Graphical tests and limits

The existing Linux packaged Word test covers native PDF save; a six-format matrix on Linux/Mac covers real packaged open/edit/save/fresh-reopen/Wasm-PDF for docx/xlsx/pptx/odt/ods/odp. ODF fixtures are derived from public samples using the converter. Originals remain hashed and unchanged. PDF text, page count and backend are checked.

Mac native save/print sheets and Windows hardware acceptance remain separate. pdfinfo/pdftotext and existing graphical test dependencies are required on the hosts. Report a locked test desktop session; do not unlock it or change settings.

The SSH mode remains available for already-authorized endpoints: --mac-host/--mac-root and --linux-host/--linux-root. Remote roots are explicit absolute directories whose final component is release-beta2 or release-beta2-<label>; no personal machine path is built in. EO_RELEASE_MAC_ROOT, EO_RELEASE_LINUX_HOST and EO_RELEASE_LINUX_ROOT can supply these values. --playwright-core (or EO_RELEASE_PLAYWRIGHT_CORE) is required for the installed test dependency; --node (or EO_RELEASE_NODE) selects the pinned executable, with neutral PATH lookup by default. Dedicated roots are confined, user-owned, marked and checked for symlinks/fresh jobs; no new keys, private-key copying, authorized_keys edits or sudo. The lead-approved relay can stage tests under /srv/elixiroffice/bench/ without direct development host-to-test desktop SSH. Only app children started by the harness are stopped.

Only four actual artifacts and successful Linux/Mac packaged gates yield review-candidate/exit0. Explicit partial/local-export builds remain exit2; failed phases retain logs/state failed/exit1. A completed installer is never a feature or platform acceptance.

## Validation records

2026-10-12 previews are retained as historical partial outputs; their old runtime overrides and frozen drivers are recorded, not current defaults. Their test desktop matrix was5/6 and native PDF failed.

2026-10-13 source-resolution plans select98317b47cc65 for the older source pins and9aa540d2fd30 for6241519/DocumentServer1c743e72be, retaining the selected PDF-only pin. The empty-HOME unit baseline was50/52. Actual corrected archive units are52/52 with HOME fallback and52/52 with explicit EO_UPSTREAM. Ten pipeline tests cover source export,45locale completeness, archive resource coverage and architecture error reporting.

Current6241519 already includes14add05's lazy backstage PDF event-routing fix. The real source-pinned Linux package passes native Word edit/save/PDF/offline/no-Node/fresh-reopen on unlocked test desktop. The initial ODT saved-clean failure was corrected by integrated web-apps926119ca8b / DocumentServerdbb08c17b8. The exact Linux candidate passes six formats and the targeted save-state cases; full final beta acceptance still requires the lead-selected integrated revisions and platform tests.

2026-10-13 release review follow-up: eleven pipeline tests pass, including explicit/environment tool paths and configured archive input. The real current-source plan succeeds with explicit inputs; missing graphical host arguments fail closed. Eight real-Wasm packaged Word save-state cases pass, adding paste during save, undo back to an unchanged saved file with no conversion in flight, and disposal of exact callbacks verified by actual SDK dispatch with a positive control. No final beta2 build was started; wait for lead-selected heads after E.

2026-10-13 release review source-pin alignment: thirteen pipeline tests pass for dedicated and legacy layouts, strict PDF-kind rejection and malformed-new-pin failure. Actual --plan exits0 for product56c93e8/DocumentServer6bdd048487 (full769ba807df31/PDFa6337ac5034f) and legacy4714b3c/dbb08c17b8. This is input validation only; no final beta2 package was built.

2026-10-13 release review inventory extension: fourteen pipeline tests PASS. Exact A product960ac83/web-apps95c1c59cf2 source tests fail7of64 with the old47-file export. With142recorded files/135locales and the new shared-inventory unit,65/65 pass with zero skips under both strict empty HOME plus EO_UPSTREAM and the isolated HOME fallback. Seven actual hash-verified asset prerequisites and their unchanged manifest were supplied to the unit-only checkout; initial missing-asset failures are retained. These are source/unit input proofs, not final package or native platform acceptance. No A worktree or feature code changed.

The public-source privacy regression suite constructs synthetic denied operator/process values at runtime. Its helper and test source must remain publishable under the same hard name/process/host guards, without suppressing those guards or changing the rejected runtime fixture bytes.
