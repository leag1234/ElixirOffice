# Experimental signed-update helpers (slice 1)

These tools are not imported or packaged by the desktop application. No production key, updater dependency, network request, YAML parser, disk writer or installer is included. They implement only the pure verification/replay boundary approved in release review, after0.3.2. The separately reviewed design branch is codex/desktop-auto-update-A, commit99eaed4.

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

verifyMetadata checks the owner signature and exact raw metadata SHA-512, then decodes bounded UTF-8 metadata (maximum128KiB). It returns immutable context, metadataText, checkedAt and a SHA-256 identity of the signed bytes. Raw YAML interpretation and matching its artifact descriptors to this context belong to slice2, before any downloader/provider may act. This result alone is never permission to install.

encodeEnvelope and signingBytes are formatting helpers, not validators or an owner signing CLI. They intentionally allow tests to sign structurally invalid contexts and prove verification rejects them.

## Replay policy

assessCandidate accepts only this module's verified results. Running version must parse and the candidate must be strictly newer. Missing state must be explicitly null; corrupt state is rejected. Persisted state has exactly sequence, identity and checkedAt.

Lower sequences and backwards checkedAt are rejected. An equal sequence is allowed only for the identical signed identity, so a failed download/install can retry. A higher signed sequence permits renewal of the same not-yet-installed version. The returned immutable next state must be atomically persisted by the caller BEFORE staging/installation; persistence and concurrency are intentionally not implemented here. No network replay policy prevents local state/clock rollback by a hostile local user or freeze during the signed validity interval.

## Tests and remaining gates

Run:

    node --test tests/desktop/signed-update.test.cjs

The static golden fixture contains a public key derived from the public [RFC8032 section7.1 test vector](https://www.rfc-editor.org/rfc/rfc8032.html#section-7.1), synthetic metadata/payload and a deterministic signature over this protocol's exact signing bytes. The public test seed is in the tests only; it must never be used for a real release. The wire/semantic mismatch tests are signed with that synthetic key, not merely corrupted into invalid signatures. Tests flip every signature bit and each metadata byte, exercise strict framing, wrong key/type, platform/version/type, expiry, rotation and replay/clock conditions.

Whole-file hashes do not replace native platform qualification. Slice2 transport/cache/provider and installer mocks, dependency review, shipped app integration, owner trust-root approval and real Windows/AppImage acceptance remain unverified. The existing no-updater guard must continue to pass.
