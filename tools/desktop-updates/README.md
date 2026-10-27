# Experimental signed-update helpers (verification, owner signer and driver)

The shared pure wire verifier now lives in desktop/update-metadata.cjs; this
directory exposes the same module through a thin host-tool wrapper, so app and
CLI results share one private provenance boundary. Desktop bundles the pure
policy/handoff foundations, but main/IPC/UI do not import or activate a new
updater feature. The production policy has no qualified runtime or embedded key
and fails closed. The pinned updater dependency uses the original AGPL Lazy
shim; check-packaged-updater.cjs verifies its runtime closure and notices.
App startup never imports that library. No automatic-update network path or
installer is enabled. The standalone [owner signer](SIGNING.md) and opt-in
release driver remain host tools and are not shipped in the application.

The finite metadata interpreter and verification/replay helpers remain pure.
release review/271 authorize the separate signing CLI; release review/274 add the explicit
[prepare/verify driver flow](SIGNING.md#opt-in-release-driver-slice-4), whose
default still forbids feeds. release review permits the first pure app foundations,
with the E238 dependency/runtime/acknowledgement gates mandatory. See
[the app proposal](../../docs/desktop-updater-app-proposal.md).


## Wire format v1

An envelope is a UTF-8 Buffer of exactly JSON.stringify({context,signatures}) followed by one LF. No BOM, extra whitespace, reordered fields, duplicate keys, unknown fields or invalid UTF-8. Maximum16KiB. Context property order is:

schema, repository, tag, version, build, sequence, channel, platform, arch, packageType, issuedAt, expiresAt, metadataName, metadataSha512, artifact.

The artifact property order is name, size, sha512. Each signature property order is keyId, signature. One or two signature entries are accepted, with distinct ASCII key ids; at least one must verify against an explicitly supplied trusted public Ed25519 key. Additional unknown keys do not become trusted. Both checksum and signature strings use canonical padded Base64 for64bytes.

Signing bytes are the UTF-8 domain string followed by the fixed-order JSON array below, without a trailing LF:

    ElixirOffice signed update v1\n
    [schema, repository, tag, version, build, sequence, channel,
     platform, arch, packageType, issuedAt, expiresAt, metadataName,
     metadataSha512, [artifact.name, artifact.size, artifact.sha512]]

The displayed line breaks/indentation inside the array are illustrative only; signingBytes uses compact JSON.stringify. The domain contains one actual newline after v1. Ed25519 signs these bytes directly with Node crypto.sign(null, ...); verification uses crypto.verify(null, ...). Key id is a selector into the caller's trusted keyring, not a downloaded trust root. Detached signatures permit an old/new-key transition over identical context bytes.

Schema is1, repository is leag1234/elixiroffice, tag is v plus the exact canonical semantic version. Channel is stable or prerelease according to that version. Build/sequence are positive safe integers. Times are positive safe-integer UTC epoch milliseconds; expiry is after issue and at most90days later. The injected current time must be within this interval.

Only win32/x64/nsis with latest.yml and ElixirOffice-<version>-win-x64.exe, or linux/x64/AppImage with latest-linux.yml and ElixirOffice-<version>-x86_64.AppImage, is accepted. Artifact size is1..2GiB. No path, arbitrary URL or installer arguments are accepted. The expected tag/platform/arch/packageType must come from trusted caller state and match exactly.

verifyMetadata checks the owner signature and exact raw metadata SHA-512, then decodes bounded UTF-8 metadata (maximum128KiB). It returns immutable context, metadataText, checkedAt and a SHA-256 identity of the signed bytes. describeUpdate implements the separate finite YAML interpretation and exact descriptor matching described below, before any future downloader/provider may act. This result alone is never permission to install.

encodeEnvelope and signingBytes are formatting helpers, not validators or an owner signing CLI. They intentionally allow tests to sign structurally invalid contexts and prove verification rejects them.

## Slice 2: finite authenticated metadata interpretation

describeUpdate accepts only the actual immutable object returned by this module's verifyMetadata, using the same private WeakSet provenance boundary. Copies, decoded JSON, proxies, lookalikes and the description itself are rejected before their properties are read. No envelope verification or replay assertion is weakened.

The accepted input is a deliberately small scalar subset of latest.yml / latest-linux.yml, not general YAML. Lines must appear in exactly this order and indentation:

    version: <exact signed version>
    files:
      - url: <exact signed artifact name>
        sha512: <exact signed artifact SHA-512>
        size: <exact signed artifact size in decimal>
    path: <exact signed artifact name>
    sha512: <exact signed artifact SHA-512>
    releaseDate: '<UTC ISO date with exactly three fractional digits and Z>'

The final path/sha512 pair is optional together; releaseDate is independently optional. There must be one final newline and no extra blank lines. LF and CRLF line terminators, including mixtures, are accepted; raw bytes are authenticated before interpretation, so changing terminators requires a new signature/context identity. A date must round-trip through Date.toISOString unchanged, rejecting impossible dates. The original five mandatory lines always remain mandatory: the shorter slice1 golden demonstrates cryptographic verification only and is deliberately rejected as an incomplete update description.

This grammar excludes aliases, anchors, tags, merge keys, flow/block/multiline constructs, directives, document markers, duplicate/unknown keys, comments, alternate order/indentation, arbitrary URLs/paths, multiple artifacts and noncanonical scalar representations. Unsupported but otherwise valid general YAML fails closed. There is no YAML coercion, URL decoding, field override or interpretation of unsigned text. The existing128KiB authenticated raw-byte budget applies; accepted metadata has at most eight content lines.

The output is a fresh frozen object with version, artifact, identity, checkedAt and optional releaseDate. Its artifact is a separate frozen name/size/sha512 record copied from the authenticated context after exact matching; no raw YAML is retained. identity and checkedAt retain verifier provenance. No network/file/installer operation is performed. This description does not authorize installation or replace assessCandidate replay policy, persistence, artifact hashing or later expiry rechecks.

## Replay policy

assessCandidate accepts only this module's verified results. Running version must parse and the candidate must be strictly newer. Missing state must be explicitly null; corrupt state is rejected. Persisted state has exactly sequence, identity and checkedAt.

Lower sequences and backwards checkedAt are rejected. An equal sequence is allowed only for the identical signed identity, so a failed download/install can retry. A higher signed sequence permits renewal of the same not-yet-installed version. The returned immutable next state must be atomically persisted by the caller BEFORE staging/installation; persistence and concurrency are intentionally not implemented here. No network replay policy prevents local state/clock rollback by a hostile local user or freeze during the signed validity interval.

## Tests and remaining gates

Run:

    node --test tests/desktop/signed-update.test.cjs tests/desktop/signed-update-description.test.cjs

The static golden fixture contains a public key derived from the public [RFC8032 section7.1 test vector](https://www.rfc-editor.org/rfc/rfc8032.html#section-7.1), synthetic metadata/payload and a deterministic signature over this protocol's exact signing bytes. The public test seed is in the tests only; it must never be used for a real release. The wire/semantic mismatch tests are signed with that synthetic key, not merely corrupted into invalid signatures. Tests flip every signature bit and each metadata byte, exercise strict framing, wrong key/type, platform/version/type, expiry, rotation and replay/clock conditions.

Whole-file hashes do not replace native platform qualification. Transport/cache/provider and installer mocks, dependency review, shipped app integration, owner trust-root approval and real Windows/AppImage acceptance remain separate future gates. Earlier transport/cache prototypes are not imported by these helpers. Signed negative YAML fixtures pass cryptographic verification before testing semantic rejection; Windows/Linux, expiry-independent parsing, immutable output, exact scalar bounds and forged verifier records are covered. The existing no-updater guard must continue to pass.

## Owner batch signing

The opt-in public driver emits one canonical signing-batch.json and one
OWNER-SIGNING.txt for the complete NSIS/AppImage candidate set. The new host-only
sign-batch.cjs composes the unchanged encrypted-key signer/TTY protocol, with
one hidden secret and one complete-set approval, strict post-review checks and
atomic complete-directory output. The public driver never opens a key or
invokes a signer. QA retains its separately stamped neverPublish standalone
metadata path; it does not emit a real-owner batch.

See [owner invocation, faults and retained gates](SIGNING.md#one-owner-session-for-a-real-release).
No batch tool, key or private command is part of the desktop application.
