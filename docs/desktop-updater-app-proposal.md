# Signed application updater: step 5a proposal

Status: **implemented with a reviewed 0.3.3 production activation candidate**.
The historical slices and their original qualification boundaries remain below.
Original dependency snapshot: private product55701bb. Proposal rebased onto
integrated9cef116 (test-only PTY correction). Review captured 2026-10-24 on development host with
Node22.23.3/npm10.9.9. No application dependency, lock, source, package or build
number changed. No production key, Mac activity or publication.
The [approved design](desktop-signed-updates-design.md) and integrated wire,
signer and opt-in driver remain the baseline.

## 0.3.3 production activation candidate

The production source qualification records `reviewed: true`, pins Electron
**44.9.1**, and enables the **x64 AppImage** and **Windows x64 NSIS** paths.
`desktop/update-production-nsis-qualification.cjs` remains the single explicit
source boolean and is true after the lead reviewed D's native Windows QA PASS
in validation report. Renderer data, preferences, environment
variables, command-line fields and downloaded metadata cannot change either
platform decision.

Eligible packages expose manual **Install** after both production policy and
physical-package checks succeed. **Install updates automatically** remains OFF
by default and requires a durable explicit opt-in. macOS, DEB, Flatpak, Snap,
Windows Store, development and unknown packages keep the release-page download.
Native last-window close, shutdown, crash and unclassified exits never install;
only the guarded explicit Quit path can complete an already authorized automatic
installation.

The production public trust is unchanged: key ID `eo-2026-1`, Ed25519 SPKI
fingerprint
`68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd`.
The Windows installer keeps its reviewed wizard behavior; silent installation
is deferred to 0.4. The QA flavor retains its separate compile-time identity, trust, profile,
transport and publication rejection. Tests exercise both NSIS source variants,
the active AppImage capability, unsupported-package fallbacks, the default-OFF
preference and the existing close/fault guards. No private key is present or
read, and this source change does not build, sign or publish a release.

## Mandatory E238 implementation and release gates

Lead release review accepts APPROVE-WITH-CHANGES. These are blocking gates, not optional
follow-ups:

1. **Dependency gate:** resolve and review distributable lazy-val1.0.5
   attribution/notice treatment **before adding the production dependency**.
   An authoritative upstream text/attribution route or a separately reviewed
   equivalent dependency-free shim must be proposed first. A manifest MIT
   declaration alone is not recorded as complete notice compliance.
2. **Runtime/network gate:** no release-capable updater network path until D's
   qualified Electron44.9.1 refresh is integrated. Until then keep this feature
   disabled or make release-capable builds fail closed. No ad-hoc runtime pin
   update or certificate bypass. Track undici7.30.0 and fast-uri3.1.8 separately;
   rerun production and full audits at the actual dependency pin.
3. **Acknowledgement gate:** construct and retain a separate adapter-owned
   Promise **before** calling synchronous BaseUpdater.install/doInstall. The
   transaction controller already holds its resolve/reject capability when
   install begins. A true return is only synchronous initiation, never success.
   Await that Promise before app.quit; an asynchronous spawn/commit error must
   prevent quit, discard the one-shot adapter and restore normal app operation.
   Deterministic tests inject delayed rejection after true return and prove zero
   quits, adapter invalidation and a usable application.

Slice5b may start behind these gates on a fresh branch from this proposal head;
no dependency or release-capable network/installer path may bypass them.

## Dependency decision and reproducible evidence

Candidate: electron-updater **6.8.9**, paired with existing electron-builder
**26.15.3**; retain exact pins, reviewed lock integrities and no lifecycle scripts.
This is a conditional technical recommendation, not permission to ship today:
the Electron advisory and license-notice item below need closure.

[Machine-readable evidence](reviews/electron-updater-6.8.9.json) records every
production version, dependency edge, SRI, archive SHA256 and license-file hash.
Resolve a private, throwaway manifest outside the application using
install --package-lock-only --ignore-scripts --no-audit --no-fund, then audit
that lock with and without --omit=dev. Isolated empty user/global npm configs
and HOME prevent inherited credentials/configuration; registry is explicitly
https://registry.npmjs.org. No node_modules was installed. Archive bodies were
checked against lock SHA512 before reading only regular bounded members.

The isolated updater graph has16 packages,15 transitives. The prospective
combined lock has289 packages,16 production packages and273 dev-labelled
packages; five lock paths are new, while four name/version tuples are new.
All pre-existing name/version tuples remain; some existing build dependencies
become runtime dependencies. No existing package is upgraded by this experiment.
The nested updater semver7.7.4 is intentional; do not deduplicate it outside its
declared range. Root builder remains26.15.3.

| Parent | Exact resolved runtime children |
| --- | --- |
| electron-updater6.8.9 | builder-util-runtime9.7.0; fs-extra10.1.0; js-yaml4.3.2; lazy-val1.0.5; lodash.escaperegexp4.1.2; lodash.isequal4.5.0; semver7.7.4; tiny-typed-emitter2.1.0 |
| builder-util-runtime9.7.0 | debug4.4.3; sax1.6.1 |
| debug4.4.3 | ms2.1.3 |
| fs-extra10.1.0 | graceful-fs4.2.11; jsonfile6.2.1; universalify2.0.1 |
| jsonfile6.2.1 | universalify2.0.1; graceful-fs4.2.11 (optional) |
| js-yaml4.3.2 | argparse2.0.1 |
| Remaining leaves | no runtime children |

All16 published manifests have no preinstall/install/postinstall/prepare hook.
The exact updater archive is136914 bytes, SHA256
0b95d12dde27a0979eb8911f29559daab89580d884904dcf7b4a78b89513288b.

### Licenses and notices

Twelve packages declare MIT; graceful-fs/semver declare ISC, argparse declares
Python-2.0, and sax declares BlueOak-1.0.0. Preserve complete applicable notice
texts, attribution, manifest provenance and license identifiers in the packaged
third-party inventory and source export. This review adds no copyleft
dependency. SPDX provides the [Python license](https://spdx.org/licenses/Python-2.0.html)
and [Blue Oak text](https://spdx.org/licenses/BlueOak-1.0.0.html); the latter needs
its text or specified license link distributed with the software.

Fifteen verified npm archives contain notice/license files. **Open item:
lazy-val1.0.5** declares MIT but its archive and exact upstream gitHead
b69ad4119f1b19bdab13c61ee2fcc88d46b89071 contain no license text. Retain the
manifest declaration and author provenance, but do not invent a copyright
notice or silently mark complete. Resolve an attributable notice source or
have the lead review a documented notice treatment before shipping. A later
package check must compare the exact production module set with its notices.
Build-tool notices remain separate; dev labels do not decide runtime exposure.

### Advisory snapshot and shipping gates

npm audit returned0 for the updater-only graph and combined production graph.
The complete combined graph has three alerted packages (2high,1moderate),
all already present in the existing desktop lock:

| Package | Finding and required disposition |
| --- | --- |
| Electron44.7.0 | HIGH [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9): compromised eMudhra intermediates; maintainer fixes include44.9.1. It ships as the browser/runtime despite npm dev classification. Request a separate qualified runtime refresh before shipping this network feature; do not change the pin here. |
| undici7.30.0 | HIGH: EventSource memory exhaustion, SRI algorithm casing and excessive content-encoding handling. npm recommends a patched range including7.30.1. [Maintainer advisory](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685). It is not in the new updater production closure; review the existing build-tool path separately. |
| fast-uri3.1.8 | MODERATE: scheme/host/path normalization issues, fixed3.1.9 per the audit. [Maintainer advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg). Existing build dependency; not the updater URL validator. |

The runtime alert matters to release checks, asset TLS and optional AI as well
as this proposal. Ed25519 authenticates update payloads but does not repair TLS
for other requests. No application workaround is claimed.

Known upstream update advisories were also checked: the
[Windows signing bypass](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-9jxc-qjr9-vjxq)
was fixed before6.8.9;
[credential redirects](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797)
are fixed in the selected builder-util-runtime9.7.0;
[AppImage search paths](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-7g7r-gx96-252g)
are fixed in builder26.15.0 and later. These conclusions cover those advisory
ranges only. Audit is a dated registry snapshot, not proof of no vulnerabilities;
rerun against the final reviewed lock before release. No audit fix or upgrade ran.

## Separate current-app assessment: possible 0.3.3 runtime refresh

**Reachable today, independently of auto-update.** Renderer navigation and
network hardening block remote documents/popups and renderer HTTP in
tabs-host.cjs and main.cjs. They do not cover main-process Node HTTPS.
The default-on release check runs from main.cjs:1107 through
release-notice.cjs:50-62 using node:https. Consented external AI runs through
main.cjs:1024-1029 and ai.cjs:24-38 using node:https with certificate validation.
Both cross the vulnerable TLS path; the CA revocation defect is not a bypass of
our navigation allowlist or sandbox.

A network attacker still needs the certificate/interception conditions in the
[maintainer advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9).
For the release check, a forged response can falsify the notice, but the existing
app has no auto-installer and its release URL remains fixed to our repository.
For an enabled remote AI endpoint, TLS confidentiality/integrity matters to the
explicitly sent prompt and API authorization header. Local editing/font access
and loopback HTTP AI do not use this TLS path. Checks OFF and no remote AI reduce
these request paths but are not a general runtime fix. External links opened in
the system browser use that browser's TLS implementation.

| Component | Current44.7.0 | Candidate44.9.1 |
| --- | --- | --- |
| Chromium | 152.0.7977.130 | 152.0.7977.167 |
| Embedded Node | 24.21.0 | 24.22.0 |
| V8 | 15.2.124.28 | 15.2.124.43 |

Versions come from the official
[44.7.0](https://releases.electronjs.org/release/v44.7.0) and
[44.9.1](https://releases.electronjs.org/release/v44.9.1) release records.
A separately authorized refresh changes desktop/package.json dev pin and
build.electronVersion, the corresponding package-lock entries/integrity, then
qualified platform binaries/checksums/evidence. Update the build-identity fixture
that actually packages44.7.0; retain historical receipts and historical
diagnostic-example versions. Builder26.15.3 and external test Node22.23.3 need
not change merely for this Electron refresh.

No converter/Wasm rebuild is inherently required: retain exact full/PDF runtime
pins, x2t bytes, fonts and source selections. Requalify conversion workers,
rendering, fonts, PDF export/print and six-format open/save under the newer V8/
Chromium/embedded Node. Keep sandbox/contextIsolation enabled,
nodeIntegration disabled, navigation/permission/network guards and current
preload IPC constraints unchanged. There is no proposed sandbox relaxation.

Estimated qualification, not a measured result: roughly1-2 engineer-hours on
development host for pin review, full strict/resource gates, Linux package smoke and
six-format/PDF/save/close checks; cached Windows cross-build plus owner manual
save/print/UAC/association checks needs a separate build/test slot. A Mac rebuild
and native checks need a fresh owner GO/window, typically allow30-45minutes
plus review; no Mac task is started here. Use fresh isolated profiles and a new
allocated build only after the lead freezes scope. TLS regression tests must
prove HTTPS remains validated without contacting a malicious server or using a
compromised certificate. Recommend the lead consider this as an independent
security maintenance release; no pin or release decision is made by this
proposal.

## Pinned import and API review

Use the published6.8.9 archive and its
[tagged source](https://github.com/electron-userland/electron-builder/tree/electron-updater%406.8.9/packages/electron-updater/src),
not current v27 documentation. The [6.8.9 release](https://github.com/electron-userland/electron-builder/releases/tag/electron-updater%406.8.9)
identifies the matching runtime helper.

Inspection of the updater's entrypoints finds class/module loading but no
explicit update request or installer at plain import. The main module exposes a lazy autoUpdater getter; accessing
it constructs a platform updater. Never access that singleton. Explicit
construction creates adapters/executor state, with network session use deferred.
This is source analysis; step5b must prove import/construction side effects
dynamically under fail-closed mocks before packaging.

Proposed narrow integration: explicitly named NsisUpdater/AppImageUpdater
subclasses and the exported Provider base. Keep autoDownload=false,
autoInstallOnAppQuit=false, autoRunAppAfterInstall=false, allowDowngrade=false,
disableWebInstaller=true, disableDifferentialDownload=true and
forceDevUpdateConfig=false for their entire lifetime. The application's
preference never changes these flags; our controller owns all automatic work.
Do not call checkForUpdatesAndNotify or use built-in GitHub/Generic providers.
Do not set channel: its setter can enable downgrade.

A custom provider alone is insufficient: stock
[getUpdateInfoAndProvider](https://github.com/electron-userland/electron-builder/blob/electron-updater%406.8.9/packages/electron-updater/src/AppUpdater.ts)
creates a persisted staging ID and supplies an x-user-staging-id header.
Override that protected seam to return only our prepared provider/description;
never enter the stock path or evaluate its staging ID lazy value. No rollout
percentage is accepted. Tests must assert no identifier file and no identifying
header, even after repeated checks and restarts.

The provider receives only an actual verified, immutable descriptor with
private provenance and a live controller generation. Its getLatestVersion
returns that exact prepared candidate, with no I/O; resolveFiles accepts only
that candidate and constructs one fixed release-asset URL from the authenticated
tag/basename. Ignore arbitrary URLs, packages, arguments and admin flags.
setRequestHeaders accepts only our constant allowlist. Never call the library's
general metadata parser. js-yaml is an unavoidable transitive dependency here;
it is not allowed to interpret downloaded update metadata.

Use the supported updateConfigPath setter for a fixed, packaged local
cache-only resource, containing only a constant updaterCacheDirName.
This is not app-update.yml and contains no provider, URL, token or channel.
The package contract tests pin its exact bytes. Custom provider selection is
mandatory and fallback configuration loading is a hard failure. This lets the
library create its bookkeeping cache without introducing an unsigned feed or
patching private getOrCreateDownloadHelper/staging methods.

## Transport, cache and install authority

The application controller owns discovery, bounded transport, cancellation,
durable replay state and install authorization. The existing0.3.2 banner selects
the exact newer release, including prereleases; a forged renderer message
cannot choose a tag, key, URL, destination or command. Embedded trust starts
empty/disabled until the owner approves the production key/fingerprint. Never
ship a synthetic key or fetch a replacement trust root.

Bring the already reviewed pure verifier into one authoritative shipped module;
keep host-tool imports as wrappers and preserve every existing vector. Do not
ship the owner signer or reuse the earlier unreviewed broad transport prototype.

Network policy remains the approved design: fixed repository, exact HTTPS
hosts, no credentials/cookies/staging ID/document data, manual allowlisted
redirects, no private IP destination, bounded headers and16KiB/128KiB responses,
8-second metadata deadlines. Full artifact only, authenticated size/SHA512,
2GiB maximum,30-minute total and idle bounds, abort and disk-space checks.
Do not log signed CDN queries. Checks OFF cancels all update traffic; automatic
OFF prevents binary background downloads. Manual Install authorizes one
candidate, not future automatic updates.

Override protected doDownloadUpdate with a controlled full-download task routed
through our transport and bounded exclusive file writer. Reuse BaseUpdater's
executeDownload bookkeeping/events, but not stock platform HTTP/differential/web
tasks. Precreate and validate the owner-controlled cache, reject links/reparse
paths and unexpected files; Windows needs profile ACL checks, not a POSIX mode
assumption. Library cache hints are never install authority: even a cache hit
must pass our complete verification after executeDownload returns. Its early
downloaded event is only a hint; the UI becomes ready only after our controller
returns a verified cache capability. No quit hook can be armed.

Re-verification is mandatory at these points:

1. Before accepting metadata: verify embedded-key signature, raw YAML digest,
   strict descriptor/context, exact selected tag/platform/build and expiry.
2. Before staging a payload: stream signed size/SHA512; fsync and exclusive
   promotion; atomically persist highest sequence/identity. Equal sequence is
   retryable only for the identical signed candidate.
3. On cache reuse or restart: distrust every JSON hint; repeat signature,
   time/replay and complete file verification before any ready state.
4. After all close/write/job barriers, immediately before install handoff:
   repeat envelope/time/context and full size/SHA512 from stable owned handles;
   compare descriptor/path identity and current controller generation.
5. Inside the platform install adapter: require the fresh capability and
   unchanged file/destination identities. Any gap or mutation fails closed.
   AppImage verifies the actual same-filesystem replacement copy again.

Use public BaseUpdater.install only after barriers, with a protected doInstall
adapter that validates/captures the guarded launch transaction. Do not use
quitAndInstall: the pinned implementation launches before its own quit request.
The controller awaits the adapter's explicit launch/commit acknowledgement,
then owns app.quit. It never treats install's synchronous boolean as proof of
spawn success. No private downloadedUpdateHelper monkey-patch, shell execution,
uncaught fallback or stock on-quit installer is allowed. After a failed install
attempt discard that adapter instance (its one-shot install flag may remain
set); retry only through fresh verified cache initialization, never by resetting
private library flags.

### Windows NSIS

Support only the identified installed x64 full-NSIS package. The sole payload
is the signed complete .exe from private staging. Reject packageInfo/web
installers, differential downloads, arbitrary install-directory values, command
arguments or elevation instructions in metadata. Build arguments from app-owned
policy only: --updated and reviewed silent/relaunch choices. Launch with an
absolute path and argument array, no shell; wait for spawn/error acknowledgement
before quitting. Cancellation/error releases the lease and keeps the app usable.
No stock shell.openPath/elevate fallback is accepted after a failed launch.

Unsigned beta remains unsigned: Ed25519 is no Authenticode identity. Preserve
Windows/UAC/SmartScreen behavior; never suppress it. For a future certificate,
retain an additional native publisher check. Do not promise unattended
machine-wide upgrades; installation needing extra rights remains OS-mediated or
falls back to the manual release route until a real Windows qualification.
[Tested platform code](https://github.com/electron-userland/electron-builder/blob/electron-updater%406.8.9/packages/electron-updater/src/NsisUpdater.ts)
is a reference, not permission to execute an unverified cache path.

### Linux AppImage

Require the running packaged AppImage and an owner-controlled, writable regular
destination captured from startup identity. Missing APPIMAGE, DEB, Flatpak,
read-only/system-owned directories, symlinks or identity changes mean
notification/manual download only. Never sudo.

Bypass stock
[AppImage doInstall](https://github.com/electron-userland/electron-builder/blob/electron-updater%406.8.9/packages/electron-updater/src/AppImageUpdater.ts):
it unlinks the current image then invokes mv, so move failure can lose the
launcher. Our install adapter stages an exclusive sibling on the destination
filesystem, streams/copies and re-verifies it, fsyncs, creates a verified backup,
then atomically renames the new sibling over the current path and fsyncs the
directory. Preserve the user's existing filename. Any failure before the commit
keeps the old image; failure after commit keeps a recoverable backup. No mv
lookup, shell command or old-file unlink-first path. Refuse installation if the
filesystem cannot provide the required safe transaction.

Space checks cover download plus sibling/backup, including separate filesystems.
Clean only owned transaction files, retain the old backup until an authenticated
successful next-start receipt, and test crash points/rollback. Automatic ordinary
exit does not relaunch. Explicit Restart and install schedules only the validated
destination, with inherited mount variables/arguments sanitized and a real
packaged upgrade test proving the next launch uses the new image.

## Close barriers and user interface

One main-process coordinator and one lease serve all windows. States:
notice → verifying → downloading → ready → closing → installing; errors/cancel
return to a usable state. Freeze new opens only for final handoff; never block
editing during download. Capture the open/job generation, close every document
through existing Save/Discard/Cancel, wait for saves, recovery/settings writes,
exports, print and worker jobs. Cancel, a failed write, a newly opened document,
shutdown/session-end, forced exit or crash disarms installation. Restore normal
opening on failure. No unattended timer restarts the application.

Keep the existing Fluent banner and its Notes/Download/Later/Skip actions.
Eligible verified candidates get Install update, then progress with Cancel and
Restart and install / Install on next ordinary exit. A bad/missing signature
leaves only the manual release-page route and actionable status for explicit
requests; silent background failures stay silent.

Options adds Install updates automatically, **OFF by default**, disabled while
Check for updates is OFF and on unsupported packages. Enabling authorizes
background download and installation only after an ordinary user-requested exit
and all barriers. Disabling cancels pending automatic work; explicit one-shot
authorization is tracked separately and never converts into a saved opt-in.
Explain space requirements, GitHub/CDN contact and absence of document data.

Step5b adds real translated values to all45 source catalogs through the existing
tools/desktop/i18n-extra.json/resource pipeline and OS-locale loader, with
English fallback only for unsupported OS languages. Proposed keys cover Install,
automatic-install label/help, verifying, download progress, cancel, ready,
restart/next-exit, verification failure, disk/permissions, retry/manual route.
All45 catalogs need key/placeholder/plural checks and nonempty translations,
including RTL; English and French screenshots plus long-string/RTL layouts are
review gates. No new toolbar above the ribbon.

## Implementation and qualification plan

After proposal approval, small reviewed branches:

1. Ship only the pure verifier, empty trusted-key gate, preferences/IPC/state
   coordinator and mock provider. Pin package/lock/notices only after the
   dependency/runtime issues above are resolved. Existing banner remains usable.
2. Add bounded transport/private cache, replay persistence and cancellation,
   with no real network in units and no installer execution.
3. Add guarded NSIS/AppImage transactions and close integration; installer and
   filesystem fault mocks first, then isolated packaged Linux upgrade/rollback.
4. Qualify actual Windows install/UAC/SmartScreen/locked-file paths with the
   owner; require fresh Mac GO for any Mac work (Mac stays notification-only).
   Enable platform capability only after its gate. A real owner key approval
   and a separately signed test release are additional release gates.

Test matrix:

| Area | Required proof before shipping |
| --- | --- |
| Dependency/import | Exact lock, SRI, complete notices, fresh audits; no lifecycle; no request/session/UUID/installer at import; flags fixed before first call; unsupported packages never construct updater. |
| Provider | Reject forged/copied/proxied records, wrong tag/build/platform, altered YAML, unknown fields/URLs, stale generation; no general parser/feed fallback or extra request. Preserve all integrated vectors and signer/driver tests. |
| Transport | Mock GitHub/CDN redirects, credentials/cookies/headers, private IP/DNS redirects, query-log redaction, size/deadline/idle/abort/status/encoding failures; no document/session material. |
| Cache/replay | Rehash every hit and restart; damaged JSON, links/junctions, permissions, disk full, interrupted fsync/rename, sequence rollback/equality, expired signatures, changed key/source, shared-window/process races. |
| Install boundary | Mutation after download, cache-hit bypass, stale capability and file swap just before launch; zero installer calls on failure; spawn acknowledgement and barrier order. |
| Document safety | Dirty Save/Discard/Cancel across windows; save/export/print/settings/recovery failure or delay; new-open race; session-end, force/crash; opt-out and cancellation at every stage. |
| NSIS | Fake installer argv/path/no shell and no fallback; retain OS prompts; real Windows per-user and rights-needed results separately recorded, no silent unverified claim. |
| AppImage | Same-filesystem atomic commit, backup, EXDEV/ENOSPC/EACCES, crash at each boundary, custom names, no APPIMAGE, symlink/system install, free-space accounting, verified next start and rollback. |
| UI/locales | OFF default/migration, all45 translations/placeholder parity, OS language, RTL/long text, en/fr captures, no ribbon toolbar, keyboard/accessibility and manual-download fallback. |
| Regression/package | Complete builder-required strict suite plus release Python, Linux package smoke and upgrade; real Windows gate; Mac notification behavior only with fresh GO. Compare packaged production modules, notices and embedded key fingerprint. |

This document is the review deliverable. None of these new app paths has been
implemented, executed or qualified yet.

## Current review checks and open harness finding

The application/package/lock are byte-identical to55701bb. E's integrated
baseline was1022/1022 strict and112/112 release Python. A fresh unchanged
signed-helper run initially had213/214: the denial PTY fixture reported timeout
after99ms. On EIO/EOF it can break before waitpid observes exit and then kills
immediately, instead of waiting to its existing12-second deadline. The full
diagnostic rerun passed214/214; the first failure is retained and reported to
the lead. No fixture was changed in this proposal-only scope. release review separately authorized the deterministic bounded-reaping fix; E237
approved it and release review integrated9cef116, with217/217 signed and1025/1025 full
strict cases. The earlier failure remains recorded; no assertion/time budget
was weakened. Structural dependency/diff checks and branding
passed. New app/import/install behavior remains entirely unverified.

## First 5b core status (gates remain closed)

The first implementation branch introduces only shared pure verification,
a closed production policy and an injected acknowledgement coordinator.
Host tools re-export the same verifier instance; driver source freezes include
its authoritative desktop file. No main/IPC/UI wiring, updater dependency,
network provider, file cache or platform installer is enabled.

Production has neither qualified runtime nor embedded key. Factory-injected
synthetic qualification/public pins exist solely to exercise the pure boundary
in tests; they are not a runtime preference or downloaded trust configuration.
A candidate must pass both the signature and strict description boundary.
The adapter owns a pre-created Promise; true initiation alone cannot quit,
early success cannot override a false/throwing initiation, and async failure,
timeout, abort or failed barriers restore operation without quitting.
Actual close/byte checks and launch/commit callbacks remain integration gates,
not mocked proof of real Windows/AppImage installation.

The original dependency-free Lazy shim route is proposed to the lead before
any production dependency addition; no shim or npm override has been applied.
The integrated qualified runtime, approved notice route and real key are still
separate prerequisites. This core does not complete the full5b UI/transport/
install scope.

## release review dependency route implementation (feature remains disabled)

Lead-approved route: an original dependency-free AGPL Lazy API shim, scoped only
to electron-updater's lazy-val edge. See the [owned vendor package](../desktop/vendor/lazy-val-shim/README.md)
and [implementation evidence](reviews/electron-updater-shim.json).
No upstream implementation was copied or guessed copyright notice added.
The complete owned AGPL text/code/manifest are checked in the package.

Before modifying application dependencies, a throwaway exact lock/install and
real electron-builder26.15.3 directory/asar probe proved the updater resolves only
the owned shim, even with original build-only lazy-val1.0.5 present on disk.
The asar contains no original registry Lazy or builder modules. Both owned
aliases and all15 registry notice files match reviewed hashes. The probe is
version0.0.0, uses a checksum-verified cached Electron44.7.0, never executes that
native runtime or app, and allocates no real build number.

Only afterward were exact updater6.8.9, the local private vendor dependency and
consumer-relative scoped override added. Fresh npm ci with scripts disabled
passes. Import/construction tests deny network, writes, installer and quit-hook
access, prove no identifier, and resolve the library's Lazy instances to our
class. Production policy remains closed; main/IPC/UI never import the library.
The library's initial true defaults are set false in the synthetic constructor
probe before any operation; actual production factory/wiring remains pending.

The historical blanket dependency-absence test now validates the exact reviewed
runtime closure (version/SRI/license and owned aliases) plus the closed production
policy. Its original no-dependency helper/negative fixtures, source forbidden-API
scan, publish-null/no-feed guards and real-main anonymous-only network/injection
assertions are retained. Six new drift/override/foreign-module cases fail closed.

Fresh production audit is0. Complete audit still has the already disclosed
Electron44.7.0/undici7.30.0/fast-uri3.1.8 findings; D's integrated runtime refresh
is still mandatory before enabling this feature. npm also reports the deprecated
runtime lodash.isequal; remaining deprecation warnings concern existing build
tools. No silent dependency replacement/upgrade was made.

Recheck any asar without executing artifact code:

    node tools/desktop-updates/check-packaged-updater.cjs --desktop /source/desktop --asar /output/resources/app.asar

The checker loads only the trusted build-tool asar reader, verifies every
reviewed runtime version and notice, and rejects original Lazy, unknown modules,
shadowing aliases, altered owned code/manifest/license and embedded app-update.yml.
E review of the implementation is required before integration. No production
key, network/provider/cache/install/UI path or Mac action is enabled.

## Slice 5c implementation (dormant, 2026-10-24)

The application entry point still imports none of these modules. Production
policy has neither a qualified runtime nor a trusted key. This slice adds no
UI, IPC, setting, quit hook or release-capable updater. D's runtime refresh,
owner-approved embedded key, close/job controller, UI consent and real platform
qualification remain separate gates.

The candidate module owns raw envelope/YAML copies in a private WeakMap.
Provider consumers must present the actual candidate, its owner policy and the
same platform/architecture/package identity. Every boundary verifies the
signature and time again. The provider exposes immutable library descriptions
and fresh URL hints; transport reconstructs its own fixed release URL. The
protected retrieval override bypasses staging-ID/config/feed discovery, with
three actual pinned-library starts proving no identifier access or quit hook.

Transport allows HTTPS only to github.com, release-assets.githubusercontent.com
and objects.githubusercontent.com. Resolve all addresses, reject private,
special/documentation or mixed destinations, and copy/pin a validated address
for TLS with the original hostname. Redirects share a three-hop budget over the
envelope/YAML operation; relative redirects resolve against the current CDN,
while GitHub paths remain scoped to the original asset. There are no cookies,
authorization, user identifier or signed-query logs. Bounds: 16KiB envelope,
128KiB YAML, 16KiB headers, 8s combined metadata deadline/2s idle; full artifact
at most2GiB, 30min total/30s idle. Only a full size/SHA512 match can finish the
exclusive writer. Abort, disposal and the library cancellation token also
invalidate late cache or library results.

The private cache uses owner-only directories/files (0700/0600 on Linux),
regular single-link handles, inode/path comparisons, trusted non-writable
ancestor chains (with sticky-directory ownership protection), bounded reads, free-space
checks, fsync and atomic promotion. Signed envelope/YAML and replay state are
persisted before readiness. Reuse, restart and install leases repeat signature,
time/version/sequence and the complete payload hash. Successful reuse advances
the durable clock high-water. Old accepted generations are retired only after
the new state commits. Abort during publication retains the exclusive lease
until pending I/O quiesces. Crash-residue lease files deliberately fail closed;
there is no unsafe PID-based stale deletion. A future controller must offer an
explicit reset/manual-download recovery route after checking that no update
job is active. Unknown pending entries are refused and preserved.

Library bookkeeping is initialized from our verified file lease, not from an
unsigned or user-supplied hint. Seed the exact private payload and fixed
three-field private JSON before Base.executeDownload; its controlled cache-only
path supplies bookkeeping without its default-permission JSON writer or
unsafe JSON-supplied file path. Hash and verify the returned file independently,
including after its early downloaded event. The bridge returns ready authority
only afterward; its public download result alone is not install authority.
A cache-only source resource, update-cache.yml, contains exactly one fixed
directory name, never a feed. No private downloaded-helper field is changed.

The platform adapter owns its acknowledgement Promise before installation.
Only its one-shot authorization callback can invoke public Base.install and
the protected doInstall hook. A true boolean initiates work; an independently
observed spawn/commit is required before the controller may quit. Failed public
install consumes that library instance; retry requires a fresh verified
instance, never resetting private flags. The bridge is disposed when its
controller generation becomes invalid, and held leases become unusable.

NSIS accepts only an actual fresh Windows/NSIS cache lease, repeats validation,
checks its executable prefix, and spawns the absolute staged executable with
fixed arguments: --updated, optionally /S and --force-run from application
policy. Environment forwarding is limited to necessary OS/profile/temp fields;
no shell, arbitrary directory, elevation/open-path fallback or stock
quit-and-install call is used. Wait for the child spawn event; an async error
keeps the application open. Unsigned/UAC/SmartScreen behavior is unchanged.

Windows file security is checked through a fixed, noninteractive encoded
PowerShell program using .NET ACLs, current-user ownership and only current
user/SYSTEM/Administrators allow entries. Reparse points fail closed. Paths
are environment data, never interpolated source; no inherited API-key/PATH
environment or stderr is copied. Promotions use
[MoveFileExW with REPLACE_EXISTING and WRITE_THROUGH](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
after file fsync. Node has no Windows directory-fsync equivalent; this relies
on native write-through semantics, not a simulated POSIX chmod. ACL and native
move calls are mocked in Linux units. Actual Windows behavior, group policy,
power-loss durability and NSIS install success are unverified release gates;
any helper failure leaves the feature closed/manual-only.

Linux captures a private startup identity of the actual owner-writable
AppImage and directory, refusing links, hardlinks, public write and special
mode bits. An [AppImage type2 marker](https://github.com/AppImage/AppImageSpec/blob/master/draft.md),
ELF64 little-endian header and x64 machine field are format preflights, not a
native execution qualification. Under an exclusive destination lease, copy the
signed payload to an exclusive same-directory sibling and fully hash that
actual copy. Copy/fsync the old image to a private backup, then recheck the
source lease, destination and expiry. Preserve ordinary execute permissions,
fsync, atomically rename over the old image without first unlinking it, and
fsync the directory. Acknowledge only after own-handle/lock cleanup.
Pre-commit failures preserve the old file; post-commit failure retains the
fsynced old backup and prevents quit. Successful backups remain for a future
authenticated next-start confirmation/cleanup. The15s handoff budget can reject
slow disks safely; packaged/native qualification must establish acceptable
copy latency before enablement. No image or installer is executed by units.

Qualification uses only synthetic public test-vector keys and local temporary
files. Deny-all guards reject real HTTP, DNS, sockets, Electron network and
process launches; request/DNS/spawn and native security calls are explicitly
mocked. Fault tests cover disk-full/state publication, bad hashes/expiry,
unsafe paths, clock rollback, stale locks, cancelled barriers and late mutation,
including every AppImage copy/sync/rename boundary. No owner key, real account,
Mac session, installed binary or release allocation is used.

## Slice 5d controller and UI (production closed)

This source candidate wires the existing release notice to one main-process
job shared by every document window. Production policy now embeds the approved public
key, but has no enabled install capability (see slice6 below). Current builds retain browser release-page
downloads; the automatic-install checkbox is OFF and unavailable. Neither a
preference, renderer message nor environment variable opens that gate.

With a separately qualified policy and package, the existing banner can
prepare an update, show bounded download progress and offer **Install update**
when ready. Finishing a download never closes the app. A fresh ready click or
explicit File/native-menu **Quit** may request installation. Automatic
installation is OFF by default; opting in permits background preparation and
installation at a later explicit Quit. Turning update checks OFF aborts and
revokes the job. Cancelling Options changes no preference.

Native window close, including the last window, never installs in this slice.
Shutdown, session end, renderer failure and unclassified app quit cannot confer
install authority. This deliberately means that closing the last Windows or
Linux window is insufficient to apply a prepared update. On Windows/Linux,
the localized app-owned Quit command has no keyboard accelerator and records
explicit intent when selected; Ctrl+Q remains owned by the editor. macOS retains
Electron's built-in Quit role, Dock and Cmd+Q behavior;
macOS updates remain release-page downloads. Electron documents that a built-in
[menu role ignores its click callback](https://www.electronjs.org/docs/latest/api/menu-item).

Before handoff, every document must complete Save/Discard/Cancel, pending file
work must settle, and strict preference and recovery barriers must acknowledge
their actual writes. These barriers supplement the existing tolerant drains.
Cancel, a failed save, an unknown forced close, failed persistence, changed
candidate or revocation prevents installer launch. A failed handoff restores a
usable window. Independent adapter acknowledgement must precede app quit;
a true initiation return is insufficient.

The preload reuses release state/options/settings/action messages. Main
validates fixed settings fields, registered senders and the exact displayed
version; renderer paths, URLs, trust keys and installer arguments are never
accepted. The sole dependency loader is behind both production capability and
physical-package checks, with source drift and cold-import tests. NSIS
eligibility checks only the exact pinned-builder application registry keys;
AppImage eligibility preserves the initial verified file identity. DEB,
Flatpak, Snap, development, unknown and macOS builds retain manual downloads.

Ten English source strings are present in all 45 catalogs. release maintainer supplied
and reviewed the 44 non-English translations (release review). Their verified source
SHA256 and review status are recorded in
the Z review inventory.
Linguistic review does not qualify native installation or activate production.

Qualification uses synthetic public test keys, mocked release/artifact
transport and installer effects. Actual sandboxed Linux X11 source UI covers
Options Cancel, preparation/progress, Checks OFF, ready without quit, native
last-window close without install, and the app-owned native File Quit command
with no Ctrl+Q accelerator and an acknowledged mock adapter. The separate
native shortcut gate verifies that Ctrl+Q reaches Word paragraph formatting
without quitting. No actual NSIS installer or AppImage
replacement, pristine packaged UI, Windows or Mac runtime was exercised here.
Native install qualification, reviewed production activation, crash-lock reset and
authenticated backup cleanup remain activation gates.

## Slice 6: public trust, closed activation and native qualification plan

release review authorizes public trust, not activation. The owner created the encrypted
production signing key himself. Agents must never access, enumerate, copy or
open its private directory or handle its passphrase. Only the separately
approved public PEM was read, with regular-file/no-symlink checks, and its
Ed25519 SPKI independently fingerprinted before embedding:

- key ID: eo-2026-1;
- SPKI Base64: MCowBQYDK2VwAyEAtc5YPgC0XcAMSifWKmwQ6LHkrwslk2Zq226kkNoANK4=;
- SHA-256 of the 44-byte SPKI DER:
  68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd.

desktop/update-production-trust.cjs contains only this public pin.
desktop/update-production-qualification.cjs is an explicit source-owned
activation switch requiring a **separate reviewed change**. It ships with
reviewed:false, electronVersion:null and both nsis and AppImage false.
The policy validates and copies approval inputs. Preferences, renderer fields,
environment variables and downloaded metadata cannot set them. The exact runtime
pin and each native-platform approval are independent gates. Integrating
Electron44.9.1 and a public key does not certify native updating. No UI, feed,
installation or publication is enabled by this slice.

### Remaining gates and proposed order (not executed)

1. **Freeze an isolated test release.** Obtain explicit owner/lead authorization
   for a throwaway, never-published prerelease tag, build number, monotonic
   sequence, expiry and exact source revisions. Do not allocate a build or
   create a Git tag during this task. Build actual final Windows x64 NSIS and
   Linux x64 AppImage candidates outside production and installed-app paths.
   Retain package, sandbox, Wasm, source/privacy and notice checks. Freeze exact
   post-repack artifacts, YAML, candidate inventory seals and pending BUILD-INFO
   SHA-256 in an independent reviewed receipt. Fake package bytes cannot
   qualify native installation.
2. **Owner-signed dry run on development host.** The owner alone runs the existing
   tools/desktop-updates/sign-update.cjs for each sealed platform inventory,
   using the approved public ID/fingerprint above, reviewed source/tag/build
   arguments, and his own selected private-key path and output directory.
   [Owner invocation and TTY approval](../tools/desktop-updates/SIGNING.md#owner-invocation)
   apply unchanged: no agent opens the key or passphrase, no signing inside a
   driver, no unattended approval. The owner reviews the displayed actual
   artifact hash/size, tag, build, sequence, expiry and key fingerprint.
   Verify each public envelope, exact YAML and final artifact using
   verify-signed-updates and the pinned public PEM. Retain public hashes,
   envelopes and receipts only. Nothing is uploaded or published.
3. **Real signatures through an isolated harness.** Feed the reviewed signed
   bytes from step2 through a test-only local transport explicitly injected
   into a throwaway qualification harness. Do not loosen production host
   allowlists, fetch trust from the fixture or change the shipped switch.
   Check invalid signatures, unknown keys, expiry, replay, metadata/artifact
   mutation, bounded transport, Cancel and checks OFF before any installer
   runs. Existing mocked tests remain mandatory; this adds actual owner
   signatures without a production feed or public release.
4. **Windows NSIS native gate.** In an owner-approved disposable Windows
   environment and separate install/profile, verify actual ownership/ACL and
   reparse checks, staged final-byte hash, real NSIS launch acknowledgement,
   install/relaunch/version and document recovery. Exercise refused ACL,
   changed artifact, spawn failure, Cancel/failed Save, persistence failure and
   multiple windows. Record real UAC/SmartScreen behavior; unsigned prompts
   cannot be called transparent. Do not replace the user's installed app.
5. **AppImage native gate on linux.** Obtain a fresh personal-machine test
   window before acting. Use only an owned isolated image, destination and
   profile. Verify actual sibling copy/fsync/hash, backup, atomic replacement,
   parent-directory fsync, acknowledgement and successful new-image launch.
   Check unwritable/link destinations, cancellation before commit and injected
   copy/fsync/rename failures: the old image survives pre-commit failure;
   post-commit uncertainty retains the verified backup and prevents quit.
   Establish whether the handoff deadline is realistic. Mocked syscall faults
   do not prove power-loss behavior; retain that limitation.
6. **Close, faults and next-start recovery.** Prove Cancel, failed Save,
   unresolved document work, settings/recovery failure, changed candidate and
   uncertain/late acknowledgement yield no unauthorized install or quit.
   Native last-window close, session shutdown and crash remain non-install
   exits. Qualify safe stale-lock recovery and authenticated backup
   cleanup/rollback before exposing installs; do not silently delete a backup
   on an unverified startup. Repeat with checks OFF and automatic installation
   OFF.
7. **Independent review and separate activation.** E/lead review exact sources,
   receipts and owner-signed envelopes. Runtime qualification, each native
   platform flag and the reviewed switch change only in a new explicitly
   authorized source commit. Unqualified platforms stay closed. Approval of
   this public-pin slice cannot authorize activation. macOS, DEB/Flatpak/Snap
   and unknown packages retain manual release-page downloads.

This proposal creates no build, release tag, native installation, Mac action or
publication. Windows NSIS installation, actual AppImage replacement on linux,
cancellation and fault handling in those native paths, and real owner-signed
metadata for the never-published synthetic release remain **unverified**.

### release review: test-only route for D's packaged native QA

**Current seam and its limit.** createRuntimeSession already accepts an explicit
policy, transport and adapter factory from a trusted main-process caller. Source
tests use these arguments; the actual main-process composition uses production
policy and default transport. There is no renderer, preference, environment,
CLI or downloaded-field bypass. This source seam can exercise a real adapter
under an owned harness, but it cannot certify a packaged app's actual
startup/controller/installer wiring. No packaged local-server route currently
exists. Neither changing hosts nor disabling TLS is an acceptable substitute.

**Recommended separately reviewed next implementation:** build a compile-time
distinct, never-published **QA flavor**, old and new, from frozen sources.
Keep its manifest and resulting hashes in private test receipts. Packaging
must select an explicit QA source entry/composition and fail unless its
test manifest is sealed; ordinary builds keep the existing production entry
and closed qualification module. No runtime flag changes an ordinary package
into QA. A post-packaging assertion must prove normal packages exclude the QA
entry, transport, fixtures and enabled test policy; the QA package must visibly
identify itself as such, have a distinct app ID/user-data/cache namespace, and
be rejected by ordinary publication/export inventories. Release eligibility
for QA artifacts must never be described as production activation.

The test manifest pins the exact old/new source/version/build identities,
test tag, public key/fingerprint, signed metadata and artifact hashes, package
profile and loopback server port. The proposed loopback-only HTTP transport is
a **separate QA-only implementation**, using no secret traffic or credentials:
numeric127.0.0.1 (and only an explicitly tested ::1 route), exact pinned port
and paths, no DNS/proxy/redirects or other addresses, ordinary size/deadline/
cancel limits. It supplies only the chosen test notice and signed candidate
to the existing verifier/cache/provider and **real** installer adapters.
Use synthetic fixture keys first, then the owner's dry-run signature against
the approved public key. Each tag stays unpublished. The GitHub tag-shaped
signed identity can remain canonical; it is never looked up on GitHub in QA.
Do not parameterize or weaken the production GitHub-only HTTPS transport or
its private-address deny. No global hosts edit, TLS disable, root or public
release is needed.

Windows QA must not impersonate the production install: a distinct builder
appId yields distinct NSIS registry identities. Its exact compiled package
profile must carry the reviewed product name, uninstaller basename and
builder26.15.3 registry UUID. The existing production profile/UUID and checks
stay unchanged. Use a disposable Windows VM/profile anyway. This profile
separation needs its own code review and negative tests before native QA;
merely pointing the current hardcoded production eligibility at a QA install
would not pass and must not be bypassed. The old and new QA packages share
their own appId/profile so an actual old-to-new update can occur.

| Boundary | Exact observations/inputs for the native receipt |
| --- | --- |
| Runtime target | Actual process platform and arch x64, process.versions.electron44.9.1, app.isPackaged; Windows non-Store or Linux with absolute APPIMAGE and no SNAP/Flatpak. Record the separately embedded test qualification identity; never supply it from the renderer. |
| Windows eligibility | Absolute elixiroffice.exe path, canonical real install directory, ordinary single-link non-symlink uninstaller of positive size; exact compiled QA registry install/uninstall entries and DisplayName/location/command; current-user owner, only current-user/SYSTEM/Administrators allow ACLs, no reparse points. Keep the production equivalents covered by unchanged units. |
| AppImage eligibility | Actual APPDIR realpath and process.execPath inside it, executable basename elixiroffice; canonical absolute APPIMAGE, bounded basename, owner-writable image and parent, no links/hardlinks/special or group/other-write bits, real ELF64 little-endian x64 type2 marker, unchanged captured inode/device/size/time identity through handoff. Ordinary extracted-directory launch cannot substitute for this gate. |
| Signed artifact | Verified exact test tag/version/build/sequence/expiry and key fingerprint, final artifact size/SHA512 and YAML hash, cache lease and revalidation immediately before launch/replacement. Log public hashes/state only. |
| Windows acknowledgement | Fixed absolute staged executable, shell:false, --updated plus /S only for automatic mode; current runtime requests no --force-run. The acknowledgement Promise exists before initiation; a true return does not count. Observe actual spawn/error event before app quit. Spawn acknowledgement proves launch, **not installation completion**; separately record installer result and manually relaunch the installed new app. |
| AppImage acknowledgement | Verified sibling, old backup, exclusive lease, copied-file hash, modes, atomic rename, directory sync and owned-handle/lock cleanup; acknowledgement only after successful commit and cleanup. No quit before acknowledgement. Preserve old SHA/backup path and new target SHA; no automatic restart is currently implemented, so launch the new image explicitly and verify actual version/source/profile/recovery. |
| Next-start/backup | Successful launch is not authenticated backup cleanup. Verify retained backup bytes independently; cleanup/rollback and crash-stale lease recovery remain separate qualification/implementation gates before production activation. Record any manual test cleanup explicitly. |

**Native negative matrix to retain:** wrong runtime/package/profile; portable,
Store, extracted AppImage, DEB/Flatpak and unknown formats; unwritable/public/
wrong-owner/linked/reparse/hardlinked targets; missing or mismatched exact NSIS
registry/uninstaller; changed startup identity or mounted executable outside
APPDIR; stale destination lease; expired/replayed/wrong-key/changed metadata
or artifact; interrupted or oversized download; user Cancel/failed Save/
settings or recovery failure; checks OFF; native last-window close and shutdown;
Windows async spawn failure/timeout and real SmartScreen/UAC refusal; AppImage
insufficient space, copy/sync/backup/rename/pre-commit and post-commit faults.
For physical faults that cannot safely be induced, use reviewed QA-only syscall
injection and label the case **injected**, not real power-loss acceptance.
Every pre-commit failure leaves the original runnable image intact; uncertainty
after rename retains the backup and prevents quit. No forced or broad process
kill. These observations complement strict units, not replace them.

No QA flavor or local transport is implemented by slice6. The proposed route,
its profile constants and artifact exclusion guards require their own lead/E
review before D builds/runs it. Source-only injection remains useful for
adapter fault coverage, but is insufficient by itself for packaged native
acceptance. The production qualification switch remains CLOSED throughout QA.

### Repository private-material guard

The test scans every tracked and nonignored Git source file in this checkout,
without following symlinks, reading ignored environment/dependency files, Git
objects or any host signing directory. It rejects serialized private PEM,
OpenSSH framing, raw private DER and quoted hex/Base64 DER, including encrypted
PKCS8; errors report source paths only. It does not claim to distinguish an
arbitrary unlabelled32-byte secret from ordinary random data, nor scan Git
history or excluded host files. Runtime-generated ephemeral test keys remain
outside the repository.

release review explicitly permits only the exact published RFC8032 PKCS8 vector hash,
and only in its four pre-existing verifier fixture paths. A new key in any of
those files, the published vector in production/a new path, or a changed vector
fails. No production key or broad test-directory exception exists.

## Slice 7: distinct unpublished QA preparation

release review/296 approves only the preparer, guards and tests. The source candidate
now provides a separately generated old/new QA flavor, reserved0.0.0-rc.n
versions, a sealed public-only manifest and entry, isolated identity/profile/
cache/NSIS registry, a separate numeric-loopback transport, and ordinary
package/publication rejection. Production qualification remains CLOSED and
its transport/private-address policy is byte-unchanged. Native packages are
not produced here; D builds after review outside the production ledger.
See [QA preparation, seals and remaining native checks](desktop-updater-qa.md).

## Cache lease and pending-generation cleanup (2026-10-25 source candidate)

release review/301 follows the successful isolated native QA run. Previously the app
could quit after the independent install acknowledgement but before its
controller finally released an asynchronous O_EXCL cache lease. The consumed
library pending file also prevented a later filename from being accepted.

The controller now records a terminal acknowledgement, awaits the prepared
cleanup/release before app.quit, and never retries that installer. Cleanup
failure preserves the acknowledgement, records fixed safety codes
update-install-acknowledged and update-lease-release-failure, restores the
usable app and blocks automatic quit. A later ordinary exit remains possible.
Payload-close failure still attempts kernel-lock release; repeated release
observes the same result.

On Linux, guard-v2 is a persistent owned0600 single-link regular inode. Its
existence grants nothing: the main process holds the open file description
locked through the fixed /usr/bin/flock --exclusive --nonblock 3 helper.
There is no shell, downloaded argument or path discovery; the root-owned helper
is checked, its lifetime is bounded, and its inherited fd is the main-owned
handle. Release or process death drops kernel ownership; the guard is never
unlinked. Symlinks, unsafe ownership/modes, hardlinks and simultaneous holders
are refused. Legacy zero-byte lease removal additionally requires the trusted
Electron profile single-instance lock; age or PID guesses grant no authority.
A missing/unsafe helper fails closed. The deny-all process test fixture allows
only this exact invocation, counts it separately, tests drift, and retains
zero-helper calls for the closed production policy.

The Windows source candidate opens the same persistent guard with libuv's
unexported UV_FS_O_EXLOCK flag (0x10000000), only when the actual runtime is
exactly Node24.22.0/libuv1.52.1. The flag is applied to the first guard open,
so Windows CreateFile sharing is denied for the lifetime of the handle. Runtime
drift, open failure or any later identity/ACL check fails closed; there is no
ordinary O_EXCL, retry, PID recovery or stale-file fallback. The production
NSIS policy remains CLOSED until the Windows-only concurrent-holder, graceful
release and killed-holder native test passes in the owner window. Linux flock
behavior is unchanged.

Before retiring a signed cache generation, the cache saves its exact public
envelope and YAML in fixed owned retired-proof.json under the same lock.
Historical signature verification at its authenticated issue time yields only
a cleanup descriptor, never an install candidate or receipt. Installation
still requires current expiry, replay, capability and full payload checks.
The bridge removes an older pending artifact only if the signed basename,
size and full hash match owned regular bytes; unknown files, links, hardlinks,
tamper or missing provenance fail closed. After acknowledgement it verifies
and purges the exact consumed pending artifact plus fixed bookkeeping while
the cache lease is held, then releases before quit.

Tests cover a real child-process crash, simultaneous holders, legacy migration,
quit ordering/failure, two sequential updates through the actual library and
cache, expired cleanup-only proof, close failure and unsafe stale artifacts.
Native next-update confirmation remains D's post-review gate. The separate
AppImage destination O_EXCL lease and retained backups are unchanged and
remain their existing crash/fault gates. Specifically, a process death after
destination lease creation can leave the zero-byte0600 sibling named
.eo-update-<first32 SHA256 hex of the image basename>.lease. A later install's
O_EXCL open refuses while that exact residue exists; this slice does not infer
staleness, remove it, or qualify recovery. Successful ordinary completion still
cleans its own destination lease. This is a known follow-up before activation.
Production activation stays CLOSED;
this source candidate neither builds nor publishes a package.

## QA trust separation supersedes owner-signature test proposals (release review)

Owner signatures remain required for real releases only. The first native
owner-key QA update (D validation report) already proved that path. Future QA runs use
D's ephemeral per-run encrypted key, public-only run-bound sealed trust and
the unchanged protected signer through an owned PTY. No production key access,
activation or publication is authorized. Production trust bytes remain fixed;
QA public keys/IDs cannot replace the production root, including with a forged
production ID. Earlier owner-signed QA dry-run proposals above are historical
and superseded by [the independent QA trust contract](desktop-updater-qa.md#independent-qa-trust-root-msg306).

## Real-release batch signing (release review source candidate)

After final NSIS/AppImage qualification the opt-in public driver emits a sealed
complete batch and exact one-command owner handoff. A host-only CLI asks once
for the secret and once for complete-set approval; the unchanged single signer
checks each candidate and self-verifies each envelope. Held-directory staging
and atomic rename publish a complete private output bundle. Before commit,
mismatch publishes nothing; postcommit sync uncertainty retains the complete
set with an explicit diagnostic and no automatic retry.

The default unsigned driver stays byte-identical, production trust/activation
and signer/TTY implementations stay unchanged, and the private neverPublish
QA path remains separate. No production key was accessed or used by the agent.
Actual owner signing/native/publication is outside this source candidate.
See [protocol and qualification limits](../tools/desktop-updates/SIGNING.md#one-owner-session-for-a-real-release).
