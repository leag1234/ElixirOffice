# Unpublished desktop updater QA flavor

Scope: release review/296, **preparer, guards and tests only**. This does not build a
native candidate, allocate a production number, enable ordinary updates or
publish anything. D performs actual AppImage/NSIS old-to-new qualification only
after independent review and explicit authorization. No macOS route is provided.

## Identity and trust boundaries

QA uses appId **org.elixiroffice.desktop.updateqa**, productName **ElixirOffice
Update QA**, executable **elixiroffice** and its own builder26.15.3 UUID.v5 NSIS
registry identity. The uninstaller is **Uninstall elixiroffice.exe**.
File associations are empty. Window titles, native app name and About identify
QA. Its profile is below appData/ElixirOffice Update QA/<sealed-run-id>; the
update cache is signed-updates-qa-v1. EO_DESKTOP_PROFILE cannot override it.
Old/new packages share one approved run ID/profile and QA appId; no ordinary
installed app or profile is selected.

The reserved version family is **0.0.0-rc.<n>**, old < new, entirely outside the
production build ledger. Test build numbers still fit1..65535. The chosen
canonical test tag is never created on GitHub or published. Wire metadata
retains the exact canonical ElixirOffice artifact basenames. This is not a
public release candidate even if every test passes.

Only a generated copy has an enabled test policy and local notice/transport.
Ordinary main, production policy, runtime, transport, private-address deny and
installer modules are unchanged. Generated QA copies minimally select their
own uninstaller/registry profile; permission, lease, hash and acknowledgement
checks stay intact. Real adapters are used, with automatic installation OFF
by default. No native mock is selected by the preparer.

## Review a manifest before preparing source

Start from the exact reviewed product checkout on development host. The host-only API
tools/desktop-updates/qa/prepare.cjs exports inventory(sourceRoot), which hashes
public desktop source and QA tool inputs. It skips assets, dependencies,
dist, environment/npm credential files and key formats; it never follows
source links. It does not read a signing directory or accept a private key.
Unrecognized source directories fail closed.

A manifest is canonical compact JSON plus one LF, maximum1MiB, with exactly:

    {
      "schema": 1,
      "flavor": "elixiroffice-update-qa",
      "role": "old",
      "platform": "linux",
      "currentBuild": 1,
      "nextBuild": 2,
      "productRevision": "<reviewed product 40-hex revision>",
      "documentserverRevision": "<reviewed DocumentServer 40-hex revision>",
      "endpoint": {
        "host": "127.0.0.1",
        "port": 18765,
        "prefix": "/eo-update-qa/<32 lowercase hex run ID>/"
      },
      "tag": "v0.0.0-rc.2",
      "trust": {
        "keyId": "eo-qa-<the same 32 lowercase hex run ID>",
        "pem": "<public Ed25519 SPKI PEM>",
        "fingerprint": "<independently reviewed SPKI-DER SHA256>"
      },
      "inputs": { "<source-relative path>": "<SHA256>", "...": "..." }
    }

The displayed formatting is explanatory; serialize the actual object with
JSON.stringify(object) + LF. For Windows use platform win32. For the new
role use role new and currentBuild equal to nextBuild. Old must be lower.
Populate inputs using inventory(), then independently review every source
revision, source hash, public pin, server, tag and test identity. Revisions are
trusted freeze-receipt provenance, not a rebuild inferred by this tool.

The authority is the externally reviewed manifest SHA256, not a checksum
automatically fetched or recomputed next to untrusted replacement inputs.
Use the approved seal with pinned Node22.23.3:

    node tools/desktop-updates/qa/prepare.cjs \
      --source /absolute/reviewed/product-checkout \
      --output /absolute/owned-qa-work/old-linux \
      --manifest /absolute/owned-qa-work/old-linux.manifest.json \
      --seal <independently-reviewed-manifest-SHA256>

The output must not exist and its canonical parent must be owned, without
group/other write. All selected inputs are rehashed; exact source-anchor
counts refuse drift. Files are created exclusively0600 under0700 directories,
with per-file fsync. A failed attempt removes only its own newly created tree.
The output receipt carries the compiled manifest and entry hashes. Retain it
outside the package as the review receipt; never promote it to release-ready.

The compiled source includes a QA entry and compiled manifest. The entry checks
all runtime source hashes before loading the generated main process. Build
configuration and lock/ignore files are additionally hashed during source
preparation; the pinned builder legitimately strips them from runtime ASAR.
Runtime package metadata is normalized to the actual builder26.15.3 contract;
the complete source package metadata is also checked before packing. A modified
runtime file, entry, manifest, profile, build config or added source file fails.

These hashes check a reviewed preparation and detect drift; they are not a
signature protecting a wholly replaced executable. Public signature validation
of final artifact bytes, plus the external freeze receipt, is the update trust
boundary. No final artifact hash is embedded in its own new package: that would
be self-referential.

## Handoff to D after review

This slice produces source only. D must separately provision the existing
qualified assets and exact dependency closure in the owned output tree.
The generated configuration includes only qa:package:linux and
qa:package:windows scripts, both --publish never. Its beforePack guard verifies
the compiled source and all original numeric build-identity assertions.
Ordinary release scripts and macOS packaging are unavailable. Producing native
packages is a later explicitly authorized step; do not run the regular release
driver or consume its ledger for QA.

After the **final** new AppImage repack or NSIS build, freeze actual bytes and
prepare exact YAML/inventory with the existing unshipped public-only
driver-metadata helper in an explicitly QA-marked test folder. Keep
QA-DO-NOT-PUBLISH.json and neverPublish provenance. The ordinary Python release
driver and verify-signed-updates deliberately reject QA; do not try to promote
QA through them. The existing standalone signing inventory and wire schema
still apply. D/lead must review this test-only final-byte preparation and its
seal before QA signing. No signer is invoked by the preparer.

For QA runs, D uses its own ephemeral per-run encrypted Ed25519 key and the
existing signer through an owned pseudo-terminal, as described below. Owner
signatures are needed only for real releases. The earlier production-key
dry run already proved the owner-signed rc.1 -> rc.2 path (D validation report);
it is historical evidence, not a continuing QA requirement.
Retain only public envelopes, hashes and receipts. Verify exact metadata with
the sealed QA public pin, then serve those reviewed bytes and the final package
from the isolated numeric-loopback endpoint; never publish the tag.

## Transport and native acceptance

QA transport uses **only127.0.0.1**, an integer port1024..65535 and the sealed
exact run prefix. IPv6 is deliberately unsupported. Metadata/envelope and
artifact basenames come only from the fixed platform names and verified strict
candidate. It uses core HTTP with agent:false, fixed headers, numeric IPv4 and
an explicit rejecting lookup callback. No DNS, proxy, credentials, redirect,
hostname fallback or arbitrary endpoint is accepted; response socket peer
address/port must match. HTTP is limited to this distinct QA-only loopback
transport, never a TLS-disable or production transport option.

Limits retain16KiB envelope,128KiB YAML,2GiB artifact,16KiB headers, shared8s
metadata total/2s idle and30min artifact total/30s idle through sink publication.
Cancel/dispose close active sockets and timers. Signed provenance, expiry,
selected tag, exact size and SHA512 are rechecked, including before publication.
A bad signature or hash cannot finish a cache sink.

Perform the native matrix in the
[slice6 qualification plan](desktop-updater-app-proposal.md#msg294-test-only-route-for-ds-packaged-native-qa):
actual isolated installed NSIS profile/ACL/registry checks; true AppImage
mount/startup identity and writable owned destination; independent
acknowledgement; Cancel/failed Save/persistence, checks OFF, native window-close,
spawn and pre/post-commit fault controls. NSIS spawn is not install completion.
No automatic restart is currently requested: explicitly launch the new QA app,
record actual version/profile/document recovery, and verify retained AppImage
backup bytes. Authenticated backup cleanup, crash-stale lease recovery and
power-loss durability remain unqualified; injected faults are labelled injected.

## Ordinary package and publication defenses

Ordinary package selection excludes qa/** and QA-DO-NOT-PUBLISH.json, and the
beforePack guard refuses QA entry/identity/profile markers and reserved
versions before identity validation. The actual pinned-builder filter is tested.

The ordinary release driver, artifact inventory, check-publication and opt-in
signed-update prepare/finalize paths reject the reserved family and QA
provenance. Marker folders and renamed artifacts with QA BUILD-INFO remain
rejected. Frozen signed-update tool hashes include the rejection helper.
Stripping or forging all trusted provenance is outside this metadata guard's
guarantee: normal publication must still validate the independently sealed
artifact hashes and source selection. This tool never uploads.

Tests include generated old/new Linux/Windows source trees; seal/source-anchor,
input and output mutations; actual builder selection/metadata transformation
and a real ASAR read under Electron44.9.1; NSIS UUID derivation; production byte
pins; real loopback success/negative/cancel cases with deterministic stall
timers; ordinary closure and publication rejection. This is not native installer,
GUI startup, Windows hardware, AppImage replacement or production qualification.

## QA-only discovery between synthetic updates

An isolated rc.1 -> rc.2 -> rc.3 chain shares its QA profile. The ordinary
daily release-notice throttle intentionally persists across restarts; it can
therefore suppress discovery of the next synthetic target for 24 hours.

The generated QA composition now compares an exact synthetic rc candidate
and its canonical release URL with the NEXT sealed manifest tag. If those
targets differ, it copies initial discovery state with lastAttempt/candidate
cleared before calling the unchanged release-notice service. It preserves
checks-enabled, reminder/skip fields and the caller's original state. An
unchanged target retains daily caching; checks OFF never fetches or saves.
Missing, nonsynthetic or malformed candidates do not authorize a refresh.
Only the sealed synthetic release list is fetched. No real network request,
current clock, signature expiry/replay, signed cache, document or profile
identity changes; only the two discovery fields reset.
In particular, comparing with the running version would miss the reproduced
case: consumed candidate rc.2 equals running rc.2 while the next target is rc.3.

Production release-notice source SHA256 remains
b5a3226df9af69a80b165c7dfeb0bf8c88314cd62b45bb97fd873a6a52e7f9df.
A literal pinned-hash regression checks ordinary bytes and exact generated-copy
equality, and confirms that ordinary discovery with the same stale state still
honors the daily throttle. This is a QA composition seam, not a production
cadence change or a native second-update acceptance claim.


## Independent QA trust root (release review)

D generates a fresh Ed25519 key per run in its own private 0700 directory
outside every repository/build/export tree. Keep the encrypted PKCS8 key
single-link 0600; never commit, publish or place it in a package. The sealed QA
manifest contains only its public SPKI PEM, exact key ID eo-qa-<run32hex>, and
independently checked SPKI-DER SHA256. The ID must match the endpoint's sealed
run. Production eo-2026-1 and its public fingerprint are refused, including
relabelling the production public key under a QA ID. There is no exception
for owner trust in a QA manifest.

The production trust module remains byte-identical: only eo-2026-1 with
SPKI fingerprint 68be6435459c7a2082aa283c8b2e2726f174691d7d22301330129fe6d9bb84bd.
Ordinary beforePack and post-ASAR checks require its exact reviewed source
bytes without executing candidate trust code. QA IDs in ordinary package or
publication metadata and public finalization arguments are refused. A test
verifies an ephemeral signature in the sealed QA policy, then proves rejection
both by actual closed production and by a test-qualified policy containing
only the production root, even when the QA signer forges the production ID.

D may drive the existing signer CLI's hidden passphrase and exact approval
through its owned PTY for this QA key only. All normal protections remain:
private directory/key permissions, encrypted key, independent candidate seal
and public fingerprint, current expiry, final-byte hashes, no-clobber output,
self-verification, hidden secret and approval, no argv/environment secret or
bypass flag. Do not open the owner's production signing directory or passphrase.
No signer implementation change is part of this slice. Keep any QA harness
secret configuration private, temporary and removed after use; never log it.

The first owner-key QA proof is retained separately. Future QA signatures do
not require owner availability and cannot authorize production updating or
publication. Real release signatures remain owner-controlled. Actual native
qualification is still D's independently reviewed task; these source tests
neither build nor install a QA package.

### Explicit private metadata helper route (release review)

D may still invoke standalone tools/desktop-updates/driver-metadata.cjs
prepare and verify for the isolated QA chain. This is distinct from the
ordinary Python release driver, publication guard and verify-signed-updates
finalizer, which continue to reject every QA ID/provenance.

The private request's info must include:

    {
      "neverPublish": true,
      "flavor": "elixiroffice-update-qa",
      "qaRun": "<the same sealed 32 lowercase hex run>",
      "build_identity": {
        "version": "0.0.0-rc.2",
        "channel": "rc",
        "build_number": 2,
        "product_revision": "<reviewed 40-hex revision>",
        "documentserver_revision": "<reviewed 40-hex revision>"
      }
    }

These public fields accompany the existing schema1, inputs, artifacts and
owner-signed-v1 metadata configuration; they are not a private-key input or
publication bypass. Version must be reserved rc.N with matching build 1..65535.
prepare stamps neverPublish/qaRun into its receipt; retain that exact receipt
as info.signed_updates for verify. Verification requires the same private
provenance/run, exact eo-qa-<qaRun> ID and the explicitly pinned public SPKI
file/fingerprint from the reviewed QA manifest. Production ID/fingerprint and
ordinary-version candidates are refused in this path.

The verified result is also explicitly neverPublish, carries qaRun and never
returns a release-ready state. Missing, stripped, malformed or mixed private
context fails closed. Freeze the full request/receipt and public pin under
D's independently reviewed seals; do not infer any trust from downloaded data.
No signer, private-key operation, native execution or publication is performed
by this public-only helper.
