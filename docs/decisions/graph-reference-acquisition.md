# Owner-operated reference acquisition

The accepted differential harness needs independent references. Use a separate,
owner-operated Microsoft Graph downloader for an approved public DOCX batch.
Agents prepare code/data and offline tests; the owner alone registers the public
client, uploads to OneDrive and performs device-flow consent.

Use Microsoft's MSAL instead of implementing OAuth. Requests has separate
authenticated Graph, unauthenticated download and authentication sessions, with
ambient credentials disabled. Dependencies are pinned in requirements-graph.txt.
Private token persistence is outside Git/data outputs, owner-only and locked.

Preserve source byte identity and conversion failure evidence. Hash-bound resume
cannot silently reuse a stale reference after a failed verification. Treat
Graph/OneDrive conversion as its own reference source; Word-web UI/desktop
equivalence and actual throughput require the owner pilot.
