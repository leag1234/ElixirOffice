# Single-host server acceptance

Run on an owned standalone production installation, never the lead instance.
Python safety tests:

    PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/server-install -p '*_test.py'

Validate compose with its generated private env using config --quiet; never capture
rendered configuration. The init helper must generate a mode600 JWT and refuse to
replace existing configuration. Backup tests reject corrupt/mismatched manifests,
running projects and restore without explicit replacement.

Production browser lifecycle:

    EO_BASE=https://your-owned-office-host EO_SERVER_OUT=/outside-git/evidence       node tests/server-install/lifecycle.mjs

The test uploads the public teacher fixture, types a unique marker, waits for
synchronization, closes, downloads actual saved DOCX and reopens to verify the edit.
It requires AI off. For local-CA labs only, NODE_EXTRA_CA_CERTS trusts the public CA
for Node and EO_TEST_CA_SPKI scopes Chromium trust to the test leaf certificate;
the optional lab hostname mapping is local to the test processes. Normal public
certificates require no override. No system trust changes.

Actual backup acceptance: record the saved marker/file, run backup.py with a digest
helper, recreate services and verify stored edit, stop then restore the backup,
restart and verify the same stored edit again. Match actual installed project/ports.
Restore replaces only this owned test deployment's volumes, after checksum checks.

AI lifecycle uses a local mock only (no provider credentials), recreates the
production service off→managed→off, checks the key is absent from browser config,
Cookie and forwarded client IP are removed, and leaves the original env restored.
It is deliberately restricted to eo-server-d with explicit EO_SERVER_INSTALL,
EO_SERVER_LAB and EO_SERVER_PROJECT; preserve no real credentials in its evidence.

Report failures and unverified public ACME, current-source fresh-image, native
DEB/RPM, real external Nextcloud/Murena acceptance separately. An older standalone
image validates deployment plumbing, not every feature of current main.
