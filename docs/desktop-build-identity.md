<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Desktop build identity (0.2.1 and later)

Every release build requires an explicit channel and unique positive build number N (1..65535), allocated monotonically across the desktop release stream. The product commit, DocumentServer commit and runtime manifests stay immutable. Identity is generated only in isolated build copies; it is bundled as desktop/build-info.json, recorded in BUILD-INFO.json and included byte-for-byte in MAC-INPUT.tar. About on macOS, Windows and Linux displays application version, build N and the first twelve product revision characters.

For base0.2.1, candidateN42 has application0.2.1-rc.42, DEB0.2.1~rc42, Windowsnumeric0.2.1.42, macOSshort0.2.1/build42. FinalN43 has application0.2.1, DEB0.2.1-43, Windowsnumeric0.2.1.43, macOSshort0.2.1/build43. NSIS retains semantic ProductVersion text and numeric fixed version resources. Existing AppImage version-based naming stays unchanged.

The custom dpkg-deb script sets the DEB version; electron-builder FPM iteration does not control it. Explicit builder config overrides ambient CI build numbers. Before packaging, missing or inconsistent identity fails closed. Platform audits check packaged identity, Mac plist versions and Windows fixed/string resources.

## Release preparation

Keep the allocation ledger outside Git under release-management ownership, at a canonical regular-file path without symlinks. Symlinked ledger/lock paths and existing temporary files fail closed. Initial schema is {"schema":1,"builds":[]}; existing allocations are preserved. Do not reset a populated ledger. Planning reads without allocating. Actual builds acquire a cooperating-process lock, reread the fresh publication inventory and ledger, reserve the number before building, then atomically replace the ledger. Failed builds consume their number. Separate manual tools must honor the same ledger and lock.

Fetch the public release list through all API pages, into a fresh output file:

    python3 tools/release/fetch-published-versions.py --output /srv/release/published-current.json

The complete inventory includes repository, fetched_at UTC and canonical application versions from both tags and desktop asset names. Historical beta tags can contain plain-version binaries; those binary versions are also refused if reused. It expires after one hour and rejects future timestamps, incomplete/wrong-repository lists and duplicate/malformed versions. API/pagination failures never create a complete inventory. Network access is release-time only; the application performs no update or publication lookup.

Add these required arguments to the normal immutable-source/runtime release command:

    --build-number 42 --channel rc
    --published-versions /srv/release/published-current.json
    --build-ledger /srv/release/build-ledger.json

The source package version supplies the base version. The driver must come from the approved identity-capable source and checks its identity module against the selected product. The existing pipeline still requires integrated source ancestors and isolated hosts/resources; these options do not relax that policy.

Immediately before owner-approved publication, fetch a NEW complete inventory and recheck the completed BUILD-INFO:

    python3 tools/release/check-publication.py --build-info /srv/release/build/BUILD-INFO.json --published-versions /srv/release/published-new.json

This command checks version freshness/reuse only. It does not publish, authorize publication, validate a release's privacy candidates or replace artifact acceptance. The publisher must serialize the final check and publication to avoid a race. No remote push is added here.

## Final rebuild and acceptance

A final release is a fresh build with a new N and final semantic version, never a relabelled candidate. Record the exact source/version-metadata diff and rerun fresh unit tests, strict resources/samples, actual package/ASAR identity and platform version audits, six-format open/edit/save/reopen/PDF, changed-path password/recovery/PDF-consent/Save As/close regressions, zsync block reconstruction, payload/source privacy with counts and scope, source reconstruction, checksums and independent review.

Only claim native GUI/install/Gatekeeper/association/printing results actually run on the final artifacts. Any unavailable native check stays unverified; earlier candidate evidence is historical. This implementation's unit/configuration and small synthetic DEB checks are not a new release build or native acceptance. The frozen0.2.0 artifacts remain unchanged.

Pinned implementation evidence and the approved study explain builder26.15.3 behavior. Official references: [common configuration](https://www.electron.build/configuration/), [Linux](https://www.electron.build/linux/), [macOS](https://www.electron.build/mac/).
