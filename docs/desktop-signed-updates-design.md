# Signed desktop updates — design for review

Status: proposal for release review, after 0.3.2; no implementation or release change authorized by this document. Base: private product e2f7514. The 0.3.2 notification banner remains unchanged.

## Scope and user behavior

| Package | Proposed behavior |
| --- | --- |
| Installed Windows x64 NSIS | Verified full-installer update through electron-updater; retain OS elevation/SmartScreen prompts |
| Linux x64 AppImage | Verified full AppImage replacement through electron-updater, only for a writable installed AppImage |
| macOS, DEB, Flatpak, unpackaged/unknown | Existing notification and release-page download only |

Use the existing banner, Options and privacy text. Add “Install update” on eligible packages and “Install updates automatically”, OFF by default; translate all 45 locales. Existing Download/Notes/Later/Skip behavior remains. Checks OFF disables update network requests and cancels downloads; automatic-install OFF prevents background binary downloads and installation, while an explicit Install action authorizes one update. Explain that checks/downloads contact GitHub and its asset CDN, send no document data, and require disk space.

When opted in, download in the background and offer Restart and install. Never restart while editing. Automatic installation may occur only on an ordinary user-requested exit after every existing Save/Discard/Cancel and settings/recovery write barrier has completed; Cancel or a failed save cancels installation too. Shutdown/session-end, crashes, forced exit and unattended timers do not initiate installation. Disabling the preference cancels pending automatic work; it must not leave a library quit hook armed.

## Library boundary and signed data

The app currently has no electron-updater dependency, electron-builder26.15.3, publish:null, and a driver that rejects latest/beta/alpha feeds. Its AppImage is repacked after builder output. These are explicit migration boundaries, not checks to delete for 0.3.2.

Candidate baseline: pin electron-updater6.8.9, the version in the matching [builder26.15.3 tag](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/packages/electron-updater/package.json), subject to dependency/security review before implementation. Current online v27 documentation describes newer signing/install APIs; do not assume them in this baseline. Tagged APIs support a [custom provider](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/packages/electron-updater/src/providerFactory.ts) and explicit download/quit control. Set autoDownload=false, autoInstallOnAppQuit=false, allowDowngrade=false, disableWebInstaller=true and disable differential downloads. Our controller owns the opt-in and all install transitions, not the library defaults. The [tagged install implementation](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/packages/electron-updater/src/BaseUpdater.ts) launches the installer before requesting quit, so finish the app's close/write barriers and freeze new opens before calling it.

Owner signs a separate bounded JSON envelope alongside each latest.yml/latest-linux.yml, not a key downloaded from GitHub. Proposed schema1:

- Context: fixed repository leag1234/elixiroffice, tag, semantic version, build number, monotonic release sequence, channel, platform/architecture/package type, issued/expires UTC timestamps, metadata filename and SHA-512 of its exact bytes.
- Artifact: one final basename, exact byte length and SHA-512; no arbitrary executable arguments, absolute paths or external URLs.
- Key id and detached 64-byte Ed25519 signature. Sign a domain-prefixed UTF-8 JSON array with a fixed documented field order and strict integer/string types. Reject duplicate/unknown fields and noncanonical encodings; shared signer/verifier golden vectors define exact bytes.

Embed the owner-approved public key/fingerprint in the app, never accept a feed-supplied trust root. Verify with Node crypto.verify(null, bytes, key, signature), then match the raw YAML digest before parsing it. Node documents [Ed25519 verification](https://nodejs.org/api/crypto.html#cryptoverifyalgorithm-data-key-signature). Reject YAML aliases, duplicate keys and unsupported fields; validate the version, tag, platform and single artifact again. No unsigned provider fallback.

A narrow custom provider supplies only that verified immutable update description to electron-updater. It must never refetch unsigned latest metadata or broaden selection. Recheck the signature, expiry, version/sequence and full cached-file size/SHA-512 immediately before installation, including across restarts. Verify the exact bytes the installer will execute; tests must expose any library cache/TOCTOU bypass. A local attacker with this user's code-execution rights is outside this trust boundary.

Unsigned Windows packages remain unsigned: Ed25519 authenticates our update artifacts, not a Microsoft publisher identity. The [tagged NSIS custom-verifier hook](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/packages/electron-updater/src/NsisUpdater.ts) is a candidate additional payload gate, not sufficient alone: cached installs also need our pre-install validation. Keep native Authenticode verification if a certificate is introduced later. Prove the unsigned NSIS path on real Windows before enabling it.

## Fetch, replay and failure policy

The existing banner still includes prereleases. Select its exact newer tag; signed context must match it, with no channel-triggered downgrade. Reject any version at or below running and any sequence below the durable highest accepted sequence; an equal sequence must retain the same signed identity. Atomically record acceptance before staging installation. A failed install remains retryable for that identical candidate.

Proposed expiry:90days; owner may renew the signed envelope without changing artifact bytes, using a higher sequence and refreshed public checksums. A malicious mirror can freeze discovery until expiry, and can offer an older still-valid update newer than a fresh installation; disclose this residual limit. After expiry/clock inconsistency, keep notification/manual download, never bypass verification. Clock or state rollback by a local attacker is not prevented.

Bound envelope to16KiB and YAML to128KiB, fetch deadlines8seconds, redirects3. Construct release URLs from fixed repository/tag/basenames. HTTPS only, exact allowlist github.com and explicitly reviewed GitHub asset CDN hosts; no credentials, private-network redirects, wildcard domains or logged signed-CDN query strings. Each binary must match signed size, with an initial2GiB ceiling,30minute deadline, idle timeout, cancellation and free-space preflight. Future larger packages require a reviewed limit change.

Use an app-owned0700 staging directory, exclusive0600 temporary files, no symlinks, atomic promotion and one update job across windows. Reject AppImage paths that are missing, symlinked, read-only or inconsistent with the packaged identity; never sudo. Disk/network/signature errors preserve the running app and documents, show bounded actionable status for explicit actions, and retain a manual release-page route. No installer is executed on a verification failure.

## Owner signing and release-driver changes

1. Before the first updater-capable manual release, the owner creates an encrypted Ed25519 PKCS#8 key on development host in an owner-managed0700 directory outside repos/builds/exports, with0600 key permissions and an encrypted offline backup. Owner approves the public fingerprint embedded in the bootstrap app. No agent reads/generates this production key.
2. The release driver builds with --publish never, completes final AppImage repacking and platform gates, then generates/refreshes latest metadata from the FINAL installer/AppImage bytes. Pre-repack hashes are invalid. Introduce a separately reviewed post-0.3.2 mode; retain existing no-feed assertions for 0.3.2.
3. The owner runs a reviewed sign-update CLI on development host against the sealed candidate inventory. It independently hashes artifacts, checks source/build/tag/platform, displays those public details for approval, and signs only validated metadata. Passphrase comes from a TTY/inherited private FD, never argv, environment, logs or GitHub secrets. No package/build hook runs in the signing process.
4. Driver verification uses only the embedded public key, adds YAML/envelopes to BUILD-INFO/SHA256SUMS/publication inventory and requires both before release is ready. The owner/authorized publisher uploads them with the ordinary release assets; builds/signing never publish automatically. AppImage zsync remains a separate external mechanism, not a verification bypass.
5. Rotation requires an old-key-authorized transition app embedding old+new public keys, then dual signatures before retirement. Lost/compromised keys require an owner-reviewed recovery/manual release; no unauthenticated reset. development host/build compromise and a stolen unlocked signer remain outside the guarantee. Same-user file modes alone do not isolate the signer from hostile processes.

## Threat model and acceptance gates

| Threat | Required defense / remaining limit |
| --- | --- |
| Compromised GitHub account/CDN/TLS transport | Owner signature plus exact final artifact hash; attacker can deny service |
| Metadata/asset substitution, cross-platform or cross-repo replay | Domain/context binding, tag/package matching, no feed/key fallback |
| Downgrade, stale signed metadata, clock rollback | Version floor, durable sequence, expiry; bounded freeze/local rollback limits above |
| Cache corruption/races, unsigned Windows installer | Fresh payload verification at every install boundary; unsigned status disclosed |
| Renderer request forgery / malicious document | Main-process-only updater, authenticated top-frame IPC, fixed actions/candidate identity, no caller paths/URLs |
| Update during save/print/close/recovery/move | Existing operation/write barriers, cancel respected, no forced close or quit hook |
| Key leakage / compromised build | Owner interactive signing, no key in pipeline/export; trusted signing host/bootstrap still required |

Reviewable slices after design approval: (1) pure signed-schema/verifier + synthetic-key vectors and replay policy; (2) bounded transport/provider/cache with installer mocks; (3) banner/options/45locales and close-barrier integration; (4) driver final-byte metadata + owner signing CLI, unsigned rejection tests; (5) isolated packaged AppImage old-to-new test and real Windows NSIS acceptance, then release enablement. Each slice gets units and independent review; no production key or real installer in unit tests.

Negative gates include one-bit changes to context/YAML/binary, unknown key, missing signature, expired/future timestamps, duplicate fields/YAML aliases, platform mismatch, downgrade/replay, disallowed redirects, oversize/truncation, cache corruption before install, restart with stale staging, symlink/disk-full/read-only paths, opt-out mid-download, cancelled/failed Save As, stalled settings/recovery writes, multiple windows and session shutdown. Run the official desktop suite and existing release-driver guards. Verify macOS/DEB/Flatpak never load an install-capable updater.

Design decisions for lead review: detached context-bound envelope; pinned6.8.9 candidate instead of a builder-v27 migration;90day expiry/owner renewal; ordinary user-exit installation only. All implementation and real-platform updater acceptance are UNVERIFIED.
