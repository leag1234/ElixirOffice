# Owner signing CLI (experimental, unshipped)

Approved scope: release review/271, owner-signing step3 of the design. This command is for a trusted Linux/development host operator, not the desktop app. It makes no network request, runs no package/build/installer hook, adds no dependency and does not publish. The owner has now created and approved his production key (release review); agents have not opened it and must never access its private directory or passphrase. Only the separately approved public PEM is embedded in the application; installation remains closed pending native qualification. Tests generate only encrypted synthetic keys in private temporary directories.

## One owner session for a real release

The opt-in release driver now writes signing-batch.json and
OWNER-SIGNING.txt after the final qualified NSIS/AppImage bytes are frozen.
The canonical batch plan contains every eligible candidate, in Windows then
Linux order, with its exact independent inventory seal and common release/
source identity. The independently retained BUILD-INFO seal binds the batch
seal and the exact owner command. Check those trusted receipts; do not replace
their seal with one recomputed beside untrusted inputs.

Set EO_OWNER_SIGNING_KEY locally to the owner-selected encrypted-key FILEPATH.
It contains a path, never a password or private-key bytes. The driver does not
guess a key filename, inspect a signing directory or open a key. Then run the
one exact line from the reviewed OWNER-SIGNING.txt in your controlling terminal
on development host. The command selects pinned Node, the reviewed sign-batch.cjs, complete
plan seal, artifact directory, approved public key ID/fingerprint and a fresh
private output bundle. From a Mac, first enter your own interactive SSH
terminal on development host; this is an owner operation.

A direct illustrative invocation is:

    node tools/desktop-updates/sign-batch.cjs --batch /canonical/candidate/signing-batch.json --seal <trusted-batch-SHA256> --artifacts /canonical/candidate --key "$EO_OWNER_SIGNING_KEY" --key-id eo-2026-1 --fingerprint 68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd --output /canonical/candidate/.owner-signing/<trusted-batch-SHA256>

The generated command already supplies its exact public paths and seals.
It asks for ONE hidden passphrase and ONE hidden SIGN confirmation for the
complete set. An inherited private FD may supply that one secret; approval
always needs the controlling TTY. There is no argv/environment passphrase,
automatic approval or bypass flag. The whole displayed JSON token binds the
plan seal, every platform/artifact name/size/SHA512, tag/build/sequence/expiry,
source/metadata/inventory seals, and the independently expected public key
ID/fingerprint, displayed last. Candidate files cannot select their trust root.

Every candidate is validated before secret input. All candidate file identities
and bytes are checked after approval and before complete publication. Each
envelope is self-verified by the existing signer, then its actual staged bytes
are checked again. A master secret stays only in memory, supplies temporary
copies to the unchanged signer, and is erased immediately after its last use
and again on failure. No passphrase or private key is written to outputs.
The existing best-effort memory-erasure and trusted-host limits still apply.

The output directory must NOT exist, even if empty. Its canonical owned parent
must be 0700. The tool exclusively reserves an empty destination and holds its
directory FD, signs into private same-parent staging, verifies the entire set
and BATCH-RECEIPT.json, then atomically renames that directory onto its own
reservation. Readers see an empty reservation or the complete set, never one
final platform signature at a time. Parent/stage/reservation descriptors remain
held to prevent inode reuse; pre-existing files and unknown/tampered staging
entries are preserved, not overwritten or blindly deleted.

Ordinary failure or mismatch before commit publishes no final signatures.
SIGKILL can leave private staging or an empty reservation; it cannot create
a partial final set. If parent sync or terminal cleanup fails AFTER the
atomic commit, exit 2 explicitly reports a COMPLETE bundle with uncertain
durability/cleanup. Inspect and public-verify it; do not retry automatically.
Real power-loss durability is not claimed by injected fault tests.

The complete bundle contains the platform .yml.sig.json envelopes and a public
BATCH-RECEIPT.json with plan/approval/envelope hashes. No key path or secret is
in that receipt. Use the generated owner_signing.output as --envelopes in the
existing public finalization command. All prior completeness, source, signature,
expiry, artifact, no-overwrite and publication gates remain mandatory.

signing-batch.json, OWNER-SIGNING.txt and the private signature workspace are
review inputs, not publication assets. Without the signed-update opt-in the
driver's output bytes remain unchanged. This tool never builds, installs,
publishes or enables application updating. Real production-key invocation
remains an owner-only operation; tests use encrypted ephemeral keys.

The single-candidate command below remains available for compatibility and
D's separately approved private QA path. QA keys/versions cannot enter the
real-release batch command.

## QA signatures use a separate key

Owner signatures are needed only for real releases. release review authorizes D to
generate its own fresh encrypted Ed25519 QA key per sealed run in a private
0700 directory outside repositories, builds and exports. Its key ID is
eo-qa-<run32hex>; only the public PEM/fingerprint enters the unpublished QA
manifest. Production trust refuses that root, and ordinary packaging/public
finalization reject the QA namespace. The owner production key and private
directory remain inaccessible to agents; the earlier owner-key QA proof does
not make them available for later tests.

For the QA key only, D may use the same CLI through its owned PTY harness.
Keep the hidden secret, exact displayed approval, independent seal, final-byte
recheck, encrypted single-link 0600 key, no-clobber output and self-verification.
There is no new flag, argv/environment secret, TTY bypass or relaxed clock.
Private QA harness configuration is temporary and removed after use. Do not
use that harness to operate the owner's real release key. See
[QA trust and boundaries](../../docs/desktop-updater-qa.md#independent-qa-trust-root-msg306).

## Release-driver output contract

The opt-in public driver produces these canonical inventories only after
qualification and FINAL AppImage post-repacking / NSIS production. The ordinary
unsigned mode retains its existing feed rejection and output behavior. The
batch plan groups these exact independently sealed candidate inventories.

A candidate is UTF-8 canonical compact JSON followed by one LF, at most32768bytes, with this exact property order:

    {"schema":1,"product_revision":"<40 lowercase hex>","documentserver_revision":"<40 lowercase hex>","context":<signed wire-v1 context>}

context has exactly the field order and schema defined in README.md: schema, repository, tag, version, build, sequence, channel, platform, arch, packageType, issuedAt, expiresAt, metadataName, metadataSha512, artifact; artifact order is name, size, sha512. No duplicate, reordered, missing or unknown fields. Construct the context and inventory explicitly in this order before JSON.stringify; do not serialize arbitrary build objects. This is one platform-specific artifact, not a collection with implicit selection.

The future driver must:

1. Derive the two source revisions, version/tag/build/platform/architecture/package type from the sealed, qualified BUILD-INFO identity; never from a neighboring unreviewed filename. Use win32/x64/nsis or linux/x64/AppImage and existing canonical artifact basenames.
2. Stream the FINAL artifact to obtain its exact positive byte length (maximum2GiB) and SHA-512, encoded as canonical padded Base64. Pre-repack AppImage checksums are invalid.
3. Write latest.yml or latest-linux.yml in the finite scalar format documented in README.md, naming that one artifact with exactly its size/hash/version. Optional legacy path/hash must agree; optional releaseDate is canonical quoted UTC ISO.
4. Hash the exact final metadata bytes (maximum128KiB) into context.metadataSha512. Set an owner-reviewed positive monotonic sequence, issue/expiry epoch milliseconds and at most90days validity. Stable/prerelease follows the exact canonical version.
5. Serialize the inventory above, compute its SHA-256 and freeze that seal together with independently reviewed expected tag/build/platform/source revisions. Hand the owner this trusted receipt separately from the mutable candidate directory. A seal recomputed from an untrusted replacement is not an approval or trust root.
6. After owner signing, verify the detached envelope and metadata using only the approved public key, recheck final artifact bytes and include the envelope in the normal sealed publication inventory/checksums. Public finalization remains separate from this signer and never publishes.

The signer compares all explicit expected identity/source arguments to the sealed inventory. Source revisions are provenance from that trusted freeze receipt; the signer does not rebuild, extract or execute binaries to infer their source. The existing wire-v1 signature binds the exact artifact and metadata hashes and release context; it does not add new source-attestation fields.

## Single-candidate invocation (compatibility and QA)

The owner completed key creation and public fingerprint approval under the design's step1 (release review). No agent generates or opens that key. Use a dedicated owner-managed0700 directory outside repositories/builds/exports, with a single-link0600 encrypted Ed25519 PKCS#8 PEM file. The signer enforces the private directory/file modes, no symlink components, encrypted single-key framing, Ed25519 type, expected SPKI-DER SHA-256 fingerprint and exclusion from artifact/output directories. The operator remains responsible for keeping the key outside all other build/export trees.

Select the trusted pinned Node22 runtime and pass public expected values:

    node tools/desktop-updates/sign-update.cjs \
      --inventory /canonical/candidate/candidate-win32.json \
      --seal <trusted-candidate-SHA256> \
      --artifacts /canonical/candidate \
      --key /canonical/private-key-directory/encrypted-key.pem \
      --key-id <approved-public-key-id> \
      --fingerprint <approved-SPKI-DER-SHA256> \
      --tag v0.4.0 --build 19 --platform win32 \
      --product <trusted-product-revision> \
      --documentserver <trusted-documentserver-revision> \
      --output /canonical/private-output-directory

Paths above are illustrative, not production paths. Output must already be a real owner0700 directory. Build must be1..65535. The public expected values and seal come from the reviewed freeze receipt, never an automatic trust-on-first-use read of the candidate.

After independent initial hashing, the command asks for the key passphrase on the controlling TTY without echo. It opens the controlling TTY before displaying anything and writes both the exact public details and approval prompt to that same TTY, even when stdout is redirected. Stdout carries only the success report. Public details have stable order: artifact name, size, SHA-512; tag; build; sequence; expiry epoch milliseconds; key fingerprint. A derived readable expiryUTC and remaining public source/seal/platform/metadata/key-id details follow. It asks the operator to type the exact displayed SIGN plus SHA-256 approval token. There is no --yes or environment approval bypass.

An inherited private descriptor may supply the passphrase with --passphrase-fd N, N>=3. Only owner0600 single-link regular files or owner0600 pipes are accepted; stdin/stdout/stderr, TTY descriptors and sockets are refused. Read one bounded line (maximum4096secret bytes, LF/CRLF or EOF); the CLI closes its inherited descriptor afterwards. Prefer an anonymous pipe from a trusted secret source, not a plaintext password file. Approval still requires the controlling TTY. Never place a passphrase in argv or environment variables; the CLI has no such option/fallback and never echoes invalid argument values.

TTY input is hidden for both secret and approval; Unicode/backspace works, and Ctrl+C or SIGTERM cancels with echo restoration. Secret and encrypted-key input buffers are erased immediately after key import and again on exit; this is best-effort buffer handling, not a guarantee that OpenSSL/OS memory is securely erased. Same-user hostile processes, a compromised signing host or an already unlocked stolen key remain outside the design guarantee.

## Checks and output

Inventory, metadata and artifact inputs must be real owner regular single-link files. Opens use NOFOLLOW/NONBLOCK; file identities and size/timestamps are checked around bounded reads, and artifacts are streamed. The unsigned validateSigningMetadata helper shares the exact context/YAML rules but creates no verified record: describeUpdate and assessCandidate continue to reject its result.

After approval, all candidate files are re-read/rehashed and their inode/time/size identities and public details must still match the reviewed snapshot. Expiry is rechecked. Only then is Ed25519 invoked. The result is self-verified through verifyMetadata and describeUpdate using the actual signing public key.

Output is latest.yml.sig.json or latest-linux.yml.sig.json, maximum16KiB. An exclusive0600 temporary file is fsynced and atomically hard-linked into place without overwrite, using an anchored Linux /proc/self/fd directory. Existing files/symlinks are refused; normal write/fsync failures remove only this invocation's own files. No release sidecars are changed and nothing is uploaded. Abrupt SIGKILL/host failure can leave a private temporary file, but cannot overwrite an existing envelope; owner inspection/cleanup is separate.

Failures emit only a fixed refusal, not crypto errors, private key paths, input data or passphrases. Check the documented seal/identity/file/permission/expiry/key/TTY requirements before retrying. Key generation/rotation, durable sequence management, app integration and real updater installs remain separate gates. The opt-in driver flow below handles metadata staging and public verification only.

## Tests

    node --test tests/desktop-updates/sign-update.test.cjs \
      tests/desktop/signed-update.test.cjs \
      tests/desktop/signed-update-description.test.cjs

Batch-specific checks also run on the pinned Node22 host:

    node --test tests/desktop-updates/batch-plan.test.cjs tests/desktop-updates/batch-signing.test.cjs tests/desktop-updates/batch-cli.test.cjs

New signer tests generate ephemeral encrypted keypairs only inside their private test directories. An owned Linux pseudo-terminal driver checks actual no-echo prompting, Ctrl+C/SIGTERM restoration, approval denial, Unicode/backspace, private regular/pipe descriptors, argv/environment refusal, post-review mutations, and redirected stdout with the actual TTY display matched to the signed envelope/key fingerprint. No user desktop or production key is touched. Existing synthetic RFC8032 verifier vectors remain unchanged.


These signing/PTY cases are Linux/development host host-tool tests, outside the portable desktop test glob. The full development host review command runs every portable desktop case and every owner-CLI case explicitly, with no platform skip:

    EO_RELEASE_REQUIRE_BUILDER=1 node --test --test-concurrency=2       tests/desktop/*.test.cjs tests/desktop-updates/*.test.cjs

This avoids making future macOS packaging execute a Linux /proc-based owner signer. No existing desktop case is moved or removed.

## Opt-in release driver (slice 4)

This is an unshipped release-tool gate, not application auto-update support.
The ordinary driver still rejects updater YAML and keeps publish:null and
--publish never; packaging must not embed app-update.yml. No dependency,
download, installer, signing call or network request is added to the app.

Add these flags to an otherwise qualified, explicitly authorized build invocation:

    --signed-updates owner-signed-v1
    --signed-update-sequence <owner-reviewed-positive-sequence>
    --signed-update-issued-at <UTC-epoch-milliseconds>
    --signed-update-expires-at <UTC-epoch-milliseconds-within-90-days>

Without the first flag, signing parameters are refused. The future release must
use the reviewed driver and matching selected product source. The plan freezes
the public helper, wire verifier, version helper and driver source hashes.
Ordinary anti-republish inventory and build-number rules still apply to actual
builds. Verifying a candidate never allocates a number or runs build hooks.

After packaging, including the AppImage update-information repack, the driver
hashes copies in the final release directory. It writes exact five-line
latest.yml / latest-linux.yml, plus canonical latest.yml.candidate.json /
latest-linux.yml.candidate.json using the inventory contract above.
Each inventory SHA256 and full context are recorded in
BUILD-INFO.json.signed_updates.candidates. Only requested NSIS/AppImage targets
get metadata. The directory is protected from group/other writes; final artifact
permissions lose group/other write bits without changing bytes.

The driver exits **3**, with state awaiting-owner-signatures. This is never a
ready release, even if every package gate passed. Initial artifact checksums
remain the package/notes set; unsigned feeds and candidate inventories are not
publication assets. Review and retain the SHA256 of pending BUILD-INFO.json in
an independent trusted freeze receipt. Do not trust a seal fetched beside
replaced candidate files. The seal binds sources, build, target/gate results,
helper hashes, package checksums and inventory seals.

The owner now uses the one generated batch command for **all** eligible
candidates, as described above. The legacy sign-update.cjs command still signs
one candidate with the same independent source/seal/public-pin protections.
The driver has no private-key/passphrase parameter and never invokes either
signer. Production public trust is now approved (release review); signing is still an owner-only operation, and native installation/activation need separate review.

From the exact reviewed tool checkout, finalize with:

    node_path=/absolute/path/to/node-v22.23.3
    python3 tools/release/desktop_beta.py verify-signed-updates \
      --folder /absolute/path/to/candidate \
      --seal <pending-BUILD-INFO-SHA256-from-trusted-receipt> \
      --public-key /approved/embedded-ed25519-public-spki.pem \
      --key-id <approved-key-id> \
      --fingerprint <approved-public-SPKI-DER-SHA256> \
      --envelopes /owner/private/signed-output \
      --node "$node_path"

The public key is explicitly supplied from the approved embedded trust root,
never a feed field or download. Only public SPKI Ed25519 PEM is accepted with
an independent fingerprint; private PEM is refused. Verification rechecks every
original artifact, inventories, exact YAML, source/build/tag/platform, signature,
issue/expiry interval and final publication bytes. Every requested supported
target needs its own valid envelope. Missing, extra, modified, symlinked,
hardlinked or group/other-writable release inputs are refused. Unexpected
additional packages/feeds also fail. Inputs must be owner-controlled; a seal
does not replace trusted local tooling or filesystem ownership.

Only after all checks pass are identical detached envelopes copied without
overwriting different bytes. BUILD-INFO.artifacts, SHA256SUMS and the new
publication_artifacts list include each YAML and .yml.sig.json. Inventories stay
private review inputs. The publication_inventory field still means fetched
release history. Verification records the public key fingerprint and the
original pending BUILD-INFO seal.

Original acceptance gates remain mandatory: a fully qualified candidate becomes
review-candidate (exit 0); a partial/build-only/Mac-export preview stays
partial-unverified (exit 2). Signatures cannot promote an incomplete build.
There is no publication command. Refusal leaves pending BUILD-INFO unchanged;
a partial write may need inspection before retrying with the same trusted seal.
Matching existing envelopes may be reused; different ones are never overwritten.

Tests use temporary synthetic keys and fake final package bytes only. The
default regression loads frozen integrated bab30a0 with identical synthetic
inputs, mocks every host/build/allocation hook, and compares every output byte,
including notes, BUILD-INFO and checksums.
