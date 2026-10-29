# Public DOCX references: owner-operated Microsoft Graph export

Status: implementation tested offline; a live owner pilot is still required.
Agents must not sign in, register an application or upload documents.

The owner uploads the approved public batch. The script performs read-only
file operations in that supplied OneDrive folder. It creates PDF references
labelled **graph-onedrive-pdf**, not Word desktop. Word-web UI parity is unproven.

## 1. Upload the approved files

- Download and extract the ZIP supplied by the lead.
- Open your usual OneDrive website with the intended Microsoft account.
- Create a new private folder named **EO-reference60**.
- Open it. Upload the60DOCX inside the local **files** folder, not the ZIP,
  README or manifests. Preserve every filename. Add no other/private documents.

## 2. Register your own public-client application

You need access and permission to register applications in an existing Entra
directory. If this is unavailable, use the manual Word-web PDF flow below.

1. Sign in at https://entra.microsoft.com.
2. Open **Entra ID > App registrations > New registration**.
3. Name it **ElixirOffice public reference export**.
4. Choose the account type you will use:
   - Work/school: the appropriate organizational directory; record its tenant ID.
   - Personal Microsoft account: an application type that includes personal
     Microsoft accounts; use **consumers** as the script's tenant value.
5. Click **Register**. Copy **Application (client) ID** from Overview.
6. Open **Authentication**. Under Advanced settings enable
   **Allow public client flows**, then Save. Device flow needs no redirect URI.
7. Open **API permissions**. Remove the default User.Read permission if present.
   Add **Microsoft Graph > Delegated permissions > Files.Read**.
   Leave only that delegated Graph permission. Do not add application permissions.
8. Do not create a client secret or certificate.

Files.Read grants account file-read permission; this program restricts its
requests to the named batch folder. Microsoft may also request standard sign-in
and token-refresh consent. Tenant consent policies can block the flow.

## 3. Connect to development host and check the batch

Use your own terminal:

    ssh -t dev-host

The lead supplies the reviewed code and prepared batch paths. Set these public
configuration values; the client ID is an identifier, not a password:

    EO_REF_CODE=/path/to/reviewed/elixiroffice
    EO_REF_BATCH=/path/to/prepared/reference-batch-work
    EO_REF_CLIENT_ID=your-application-client-id
    EO_REF_TENANT=consumers
    EO_REF_FOLDER=EO-reference60
    export PYTHONPATH="$EO_REF_BATCH/deps"

For a work/school account replace consumers with the directory tenant GUID.

    python3 "$EO_REF_CODE/tools/fidelity/graph_references.py" \
      --manifest "$EO_REF_BATCH/selected60.jsonl" --plan

This verifies original hashes and reports the requested count without signing
in, reading an auth cache or making account requests.

Dependencies are pinned in requirements-graph.txt. The lead can prepare them
with pip --target outside Git; no system package installation is required.

## 4. Run the five-file pilot

    python3 "$EO_REF_CODE/tools/fidelity/graph_references.py" \
      --manifest "$EO_REF_BATCH/selected60.jsonl" \
      --pilot-file "$EO_REF_BATCH/PILOT.json" \
      --client-id "$EO_REF_CLIENT_ID" --tenant "$EO_REF_TENANT" \
      --folder-path "$EO_REF_FOLDER" \
      --cache-dir "$HOME/.cache/elixiroffice-reference-auth" \
      --out "$EO_REF_BATCH/graph-pdfs" --owner-run

The script requires your interactive terminal. It shows a short code only on
that terminal. Open the indicated Microsoft sign-in page in your own browser,
enter the code, sign in with the OneDrive account and grant the intended consent.
Do not paste authentication codes, tokens or cache contents into chat or reports.

The private cache is outside Git and the output directory, with0700directory/
0600file permissions and an exclusive lock. No secret is accepted on the
command line. Outputs also remain private and outside Git.

Check run-results.json for five successful/cached cases. Record actual timings.
Export the three UI control cases from PILOT.json separately using Word for the
web's PDF action, in viewing/reading mode. Do not edit, update fields or accept
a source-changing repair. Keep those UI PDFs separate from Graph PDFs.

## 5. Export the remaining cases

Run the same command without --pilot-file. Existing PDFs are reused only when
input, account/folder/item context, eTag, tool and PDF hashes still match.
Sign-in is reused while Microsoft policy permits; a later policy/MFA challenge
can require another owner interaction.

One worker is used. Throttling delays and bounded retries are respected.
Planning only:5–20seconds per file would mean5–20minutes serial for60plus
setup/upload. Reserve30–60minutes initially; replace that estimate with pilot
median/p95 measurements. Account/API behavior and throughput remain unverified.

## 6. Return results for comparison

- PDFs are named ID.pdf; each has a metadata sidecar.
- run-results.json preserves errors and not-requested cases.
- paired-manifest.jsonl points only to references verified in this run.
  Failed/unrequested entries have a null reference; an old PDF cannot silently
  become the current reference after a failed retry.
- The lead runs the differential harness when references are available.

The script never uploads/deletes cloud files. It validates cloud original bytes
against approved local originals and rejects input changes during conversion.
Only approved HTTPS Microsoft download hosts are followed; the bearer header
is never forwarded to download redirects. Tokens/signed URLs/account names are
not logged. The auth cache is not part of the reference packet.

Current conversion documentation limits inputs to2MB; the batch uses a
conservative2,000,000-byte cap. Downloads are bounded to64MiB and300PDF pages.
PDF glyph-font evidence is extracted when supported; otherwise it is marked
unverified while a structurally valid PDF is retained.

## If something fails

| Code | Action |
| --- | --- |
| OWNER_TTY_REQUIRED | Use an interactive ssh -t terminal. |
| DEVICE_FLOW_UNAVAILABLE | Check app ID, account type and public-client flow setting. |
| AUTH_OR_PERMISSION_REQUIRED | Check the account, tenant and delegated Files.Read consent. |
| FOLDER_CONTENTS_NOT_EXACT | Upload only the expected60DOCX, with their unchanged names. |
| CLOUD_INPUT_CHANGED | Close editing tabs and restore the approved original cloud copy. |
| DOWNLOAD_URL_REJECTED | Ask the lead to review only the hostname, never the signed URL. |
| THROTTLED_TRY_LATER | Wait and retry later; do not start parallel exporters. |
| AUTH_CACHE_IN_USE | Let the other owner export finish; use one cache per account. |

If Graph registration/consent is unavailable, use Word for the web's own PDF
download on each document and keep the same ID.pdf names. Downloading a OneDrive
folder as ZIP does not convert its DOCX files into PDFs. Record the reference
method/date/settings; do not label Graph outputs as desktop references.

## Sources and offline tests

- [Conversion API and permissions](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content-format?view=graph-rest-1.0)
- [Application registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Public-client/device-flow setting](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration)
- [MSAL Python token acquisition](https://learn.microsoft.com/en-us/entra/msal/python/getting-started/acquiring-tokens)
- [Throttling](https://learn.microsoft.com/en-us/graph/throttling)

    PYTHONPATH=/path/to/deps:tools/fidelity \
      python3 -m unittest discover -s tools/fidelity -p test_graph_references.py -v

All auth/HTTP tests use synthetic transports; the real MSAL constructor contract
also uses an in-memory metadata transport that forbids authentication calls.
No live account test is claimed.
