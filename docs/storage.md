# Storage: Nextcloud and Murena Workspace

Session of 2026-10-06. Two complementary ways of working on one's real files instead of
the sample application's test storage:

- **A. "Inside Nextcloud"**: the ElixirOffice Nextcloud application (`elixiroffice-nextcloud`),
  renamed ElixirOffice, connected to an ElixirOffice document server. In Files, a
  click on a .docx/.xlsx/.pptx opens ElixirOffice; saving, sharing and
  co-editing are Nextcloud's. For an organization that has its own Nextcloud.
- **B. "From ElixirOffice"**: the ElixirOffice start page connects to any Nextcloud
  server (murena.io by default) with Nextcloud Login Flow v2; you browse your
  folders, your recent files, open, create, upload, and saving goes back to
  Nextcloud. For a user who has a Murena or Nextcloud account, with nothing to install on the
  Nextcloud side.

Murena Workspace remains a natural integration, not a dependency: B works with any
Nextcloud ≥ 16 (Login Flow v2) and A with Nextcloud 33 to 36 (constraint of the upstream
application).

Branches (nothing is pushed): `elixir/nc` in the DocumentServer superproject, web-apps and
document-server-integration (worktree `/srv/elixiroffice/wt/nc`); `feat/nc` here; fork of the
Nextcloud application in `/srv/elixiroffice/upstream-extra/elixiroffice-nextcloud`, branch
`elixir/nc`. Patch series: `patches/elixiroffice-nextcloud/`,
`patches/document-server-integration/nc/`, `patches/web-apps/nc/`.

## 1. Architecture

### A. ElixirOffice application for Nextcloud

```
browser ──► Nextcloud (Files, app "elixiroffice") ──► signed editor config (JWT)
     │                                                           │
     └──── ElixirOffice editor (iframe) ◄── document server ┘
                     document server ──GET /apps/elixiroffice/download──► Nextcloud
                     document server ──POST /apps/elixiroffice/track────► Nextcloud
```

- Fork of `Euro-Office/eurooffice-nextcloud` (main 654aab93). The change is **generated** by
  `tools/nextcloud-app/rebrand.py` (deterministic, to be replayed at each rebase): visible names
  ("Nextcloud Office", "ElixirOffice", "ElixirOffice" → "ElixirOffice"), application
  identifier, PHP and JS namespaces (`elixiroffice` → `elixiroffice`, hence
  `/apps/elixiroffice/…`), l10n catalogs (keys and values), `info.xml` (name, description,
  upstream links removed), icons (`tools/nextcloud-app/icons/`, provisional brand). Copyright
  notices, SPDX, authors and licenses are not touched.
- Build: `tools/nextcloud-app/build.sh <checkout>` (Vite for `js/`, Composer in a
  container for `lib/Vendor`). No functional change in the app: saving,
  locks, versions, sharing and co-editing are the upstream's.

### B. Nextcloud connector of the start page

Code: `document-server-integration/web/documentserver-example/nodejs/helpers/`:

| File | Role |
|---|---|
| `elixirSession.js` | server-side browser session (opaque cookie), encryption at rest, signed tokens |
| `elixirIdentity.js` | identity: Nextcloud user, otherwise local profile; test users in developer mode |
| `elixirNextcloud.js` | Login Flow v2, WebDAV (PROPFIND, SEARCH, GET, PUT with If-Match), opening, saving, conflicts, creation, upload, logout |
| `elixirHome.js`, `views/home.ejs`, `public/elixir/home.js` | start page: "Connect" card, Nextcloud view (folders, breadcrumb, New), Nextcloud recents, account menu, profile |

Routes (all under `/example/`):

| Route | Called by | Effect |
|---|---|---|
| `POST elixir/nc/connect` | page | `POST <server>/index.php/login/v2`, returns the login URL |
| `POST elixir/nc/connect/poll` | page (every 2 s) | polls Nextcloud; at the end, receives `loginName` + app password, reads the profile (`ocs/v2.php/cloud/user`) and the avatar |
| `POST elixir/nc/disconnect` | page | `DELETE ocs/v2.php/core/apppassword` on Nextcloud, then local forgetting |
| `GET elixir/nc/list?path=` | page | `PROPFIND Depth: 1` |
| `GET elixir/nc/recent` | page, editor | WebDAV `SEARCH`: office files sorted by date |
| `GET elixir/nc/open?path=` | page | `PROPFIND`, then the sample's editor with a config whose download and callback URLs point to the two routes below |
| `GET elixir/nc/download?t=` | document server | WebDAV `GET` stream to the document server |
| `POST elixir/nc/track?t=` | document server | status 2/6: fetches the file, WebDAV `PUT` with `If-Match: <ETag>`; 412 → `"name (conflict).ext"` + notice to the user |
| `GET elixir/nc/new`, `POST elixir/nc/upload` | page, editor | `PUT` with `If-None-Match: *` on a free name (`Document (2).docx`…) |
| `GET elixir/nc/file?path=` | page | download by the user |
| `GET elixir/api/me`, `POST elixir/api/profile`, `POST elixir/api/dev`, `GET elixir/api/notices`, `GET elixir/avatar/<id>` | page | identity, developer mode, notices |

Document key: `nc` + sha256(server, fileid, ETag); the same as long as the file is
open, hence co-editing between two connected users who open the same shared
file. A `Ctrl+S` triggers a *forcesave* (`customization.forcesave`): the file goes to
Nextcloud right away, without waiting for the close.

"This server" storage: the ElixirOffice server's own storage (per profile/address, list of
recents) **always** works, with or without a connection (regression fixed on 2026-10-07: creating or
opening a document never requires a cloud). Without a connection: New, templates, Open, drag and drop
and recents as before the connector, plus a discreet, dismissible "Connect Murena
Workspace / Nextcloud…" banner that blocks nothing (dismissed: `localStorage` `elx-connect-dismissed`). Connected:
New/Open go to the cloud by default; a "This server" / "Murena Workspace" choice stays
visible (remembered, `elx-target`), the left bar keeps the cloud and adds "This server", the
recents mix both ("On this server" label). Only the test user selector stays
reserved for developer mode. Test: `tests/nextcloud/home.mjs`.

## 2. Security model

**What flows and where** (promise "no data to the publisher"):

| Data | Where it goes | Where it never goes |
|---|---|---|
| Main Nextcloud password | typed **only** on the Nextcloud server's page (Login Flow window) | ElixirOffice (page, server, logs) |
| App password | Nextcloud → ElixirOffice server (encrypted session) | browser, URL, logs, document server |
| File content | Nextcloud ↔ ElixirOffice server ↔ document server (the same deployment) ↔ browser | third parties, publisher (Murena or other) |
| Name, email, avatar | Nextcloud → ElixirOffice session → editor (author of comments and revisions, presence) | third parties |
| Telemetry | none | |

- **No password in our interface**: Login Flow v2; the page only offers the server
  address (prefilled `https://murena.io`). The polling token stays on the server side.
- **App password**: specific to this connection, named "ElixirOffice" in
  Nextcloud's *Settings → Security → Devices & sessions*. Scope: that of a
  user's WebDAV client (Nextcloud offers no finer scope for Login Flow). Revocable
  in two ways: "Sign out" (deleted on the server by `DELETE
  ocs/v2.php/core/apppassword`, verified by the test) or from Nextcloud; a password revoked
  on the Nextcloud side is forgotten here at the first 401 answer.
- **Session**: random 256-bit `elx_sid` cookie, `HttpOnly`, `SameSite=Lax`, `Secure` over
  https. On disk, the session is stored under sha256(cookie): the file alone does not allow
  impersonating the browser.
- **Encryption at rest**: AES-256-GCM, random 32-byte key
  (`<folder>/secret.key`, 0600), subkeys derived by HMAC for sessions and for
  tokens. `elixir/` folder (0700) next to the sample's storage (configurable:
  `elixir.dataFolder`). Files 0600. Verified by the test (modes, no data in the clear).
- **URLs given to the document server**: HMAC token (hashed session, path, ETag, 7 days),
  plus the document server's usual JWT; no credentials inside.
- **CSRF**: every modifying action (login, logout, profile, upload) requires the header
  `X-Elixir: 1` (impossible without a CORS preflight from another site) or a session token
  (the editor's "New" links). The `elixir/*` routes do not return
  `Access-Control-Allow-Origin: *` (unlike the rest of the sample).
- **Allowed servers**: https mandatory (`elixir.nextcloud.allowHttp` only for a dev
  container, set by `make example`), optional whitelist
  `elixir.nextcloud.allowedServers`, default `elixir.nextcloud.defaultServer`. The URLs returned
  by Login Flow must have the same origin as the entered server; no redirect following
  with the app password.
- **Conflicts**: `If-Match` on the ETag; if the file changed in Nextcloud meanwhile, nothing
  is overwritten: the ElixirOffice version goes to `"name (conflict).docx"` and the start page
  announces it (with a link to open it).

Known limits: the app password has the scope of a sync client;
the encryption key is on the same disk as the sessions (protects a copy of the sessions
alone, not full access to the server); an inactive session does not expire by itself (365
days of cookie); opened files go through the document server's cache as for
any storage.

## 3. Identity

No more "John Smith". The editor's identity (`editorConfig.user`: id, name, image) comes from:

1. **connected to Nextcloud**: the Nextcloud user (`display-name`, email, avatar
   `index.php/avatar/<id>/128`, copied at login and served by
   `/example/elixir/avatar/<random id>`). The editor id is `nc-` + hash (server, Nextcloud
   id): stable, the same for all co-authors;
2. **otherwise**: a **local profile** (random `local-…` id). At first visit, the page
   asks for a name (optional, "Me" by default, editable through "Change name");
   avatar with initials, stable color drawn from the id;
3. **developer mode**: the sample's test user selector (account menu,
   and `?userid=` of the test bench).

Account menu (avatar at the top right, start page **and** editor title bar,
Office-style): name, email and server if connected, "Manage my account on …", "Connect
Nextcloud / Murena" or "Sign out", "Change name", "Developer mode" toggle
and, in developer mode, the test user. In the editor, the account actions open the
start page on the action (`#connect`, `#profile`, `#account`), the test user
reloads the editor.

AI is not concerned: "Elixir AI" remains the author of its revisions (docs/ai.md), AI
does not use `editorConfig.user`.

Mode A: Nextcloud identity, managed by the upstream app.

## 4. Setup (development, development host)

```bash
# isolated document server (worktree wt/nc) and start page from the sources
cd /srv/elixiroffice/wt/nc/develop && ./eo.sh up nc 8190
cd /srv/elixiroffice/wt/nc-repo && make example CONTAINER=eo-nc UPSTREAM=/srv/elixiroffice/wt/nc
# ElixirOffice Nextcloud app (fork) and local Nextcloud (compose project "elixir-nc", port 8191)
tools/nextcloud-app/build.sh /srv/elixiroffice/upstream-extra/elixiroffice-nextcloud
tools/nextcloud-app/setup.sh eo-nc http://localhost:8190/
```

`setup.sh` creates the users `admin`, `alice` (Alice Martin), `bob` (Bob Durand); passwords
generated in `~/.config/elixiroffice/nc-dev.env` (0600, outside the repository). It connects the
document server container to the `elixir-nc` network, configures the app (addresses, JWT secret read
from the container) and disables the first-run wizard and rate limiting
(test instance only).

Address to enter in "Connect" for the local Nextcloud: `http://172.17.0.1:8191`
(reachable both by the browser on development host and by the container). From the Mac:
`ssh -fN -L 8190:localhost:8190 -L 8191:localhost:8191 dev-host`, then
http://localhost:8190/example/ (mode B, connecting `http://localhost:8191` does not work because the
container cannot reach it: use Nextcloud in the browser for mode A,
http://localhost:8191/).

Production: nothing to configure for B (https, murena.io by default); options in the
sample's config: `elixir.nextcloud.defaultServer`, `elixir.nextcloud.allowedServers`,
`elixir.dataFolder`, `elixir.documentServerInternalUrl`. For A: install the built app
in `custom_apps/elixiroffice` and set `DocumentServerUrl`, `DocumentServerInternalUrl`,
`StorageUrl`, `jwt_secret` (see `setup.sh`).

## 5. Tests

| Suite | Content | Result (2026-10-06) |
|---|---|---|
| `tests/nextcloud/inside.mjs` (A) | WebDAV upload, "Open in ElixirOffice" by default, no visible upstream brand (Files, editor), user = Nextcloud, edit, close → saved (ETag, content), reopen, share, alice/bob co-editing (names, live typing, co-edited version saved) | see § 7 |
| `tests/nextcloud/connector.mjs` (B) | local profile (requested name, initials, author of comments and revisions), developer mode, end-to-end Login Flow v2, cookie, recents, folders, New, upload, opening, Nextcloud identity (name, avatar, author of comments and revisions), Ctrl+S, close, reopen, conflict (copy + notice), co-editing between two connected users (names, comment), session files (modes, no data in the clear), logout (app password deleted on the server) | see § 7 |

```bash
cd /srv/elixiroffice/wt/nc-repo
node tests/nextcloud/inside.mjs
node tests/nextcloud/connector.mjs     # NC_LOGIN_URL, EO_BASE, EO_CONTAINER if another instance
```

## 6. murena.io: operator checklist

Not tested on murena.io (no connection to a real account during development). To be done
with your account, on an ElixirOffice instance reachable over https or locally:

1. Open the ElixirOffice start page, account menu (avatar at the top right) → "Connect
   Nextcloud / Murena". Check that the proposed address is `https://murena.io`.
2. "Continue": a murena.io window opens. Check that the window's address really is
   murena.io (padlock) and that you type your password **there**, never in ElixirOffice.
   Accept "Grant access".
3. The window closes; the avatar and the name at the top right are those of your Murena account;
   "Recent" shows your documents.
4. Left bar "murena.io": browse your folders, go back through the breadcrumb.
5. Open an existing .docx: the title and the name at the top of the editor are correct; add a
   comment: the author is your Murena name.
6. Edit, `Ctrl+S`, then check on https://murena.io/apps/files that the file's date
   changed and that the change is there (and in *Versions*).
7. Conflict: reopen the file in ElixirOffice, also edit it in Murena (or drop
   another version there), then `Ctrl+S` in ElixirOffice: a "… (conflict).docx" file
   appears and the start page flags it; the original is not overwritten.
8. "New" in a folder → Blank document: the file appears in that folder on
   murena.io. Upload a file from the computer: same.
9. On murena.io, *Settings → Security → Devices & sessions*: an "ElixirOffice" entry
   exists.
10. In ElixirOffice: account menu → "Sign out". Check that the
    "ElixirOffice" entry has disappeared from the list in point 9, and that the start page offers
    "Connect" again.
11. Revocation on the Murena side: reconnect, delete the entry from murena.io, reload the
    ElixirOffice start page: it must go back to "not connected".

Points to watch: Murena may restrict Login Flow v2 or WebDAV searches (`SEARCH`)
on its infrastructure; if the recents stay empty while the folders work, it is the
search. Note the exact error messages.

## 7. Results

Runs of 2026-10-06 on development host (instance `eo-nc` :8190, local Nextcloud 35.0.1 :8191, headless Chromium):

- **A, `inside.mjs`: 13/13.** "Open in ElixirOffice" by default in Files; no visible upstream
  brand (Files, editor); editor user = Nextcloud user;
  saving at close (new ETag, content verified); reopening; alice/bob
  co-editing: names visible on both sides, live typing, co-edited version saved.
- **B, `connector.mjs`: 42/42.** Local profile (requested name, initials, author of comments and
  revisions), account menu (start page and editor), developer mode; end-to-end Login Flow v2;
  HttpOnly/SameSite cookie; recents, folders, New, upload; Nextcloud
  identity in the editor (name, avatar, author of comments and revisions); Ctrl+S,
  close, reopen; conflict ("(conflict)" copy, original intact, notice); co-editing between
  two connected users (names, typing, Bob's comment seen by Alice, saved version);
  session files (700/600, nothing in the clear); logout (app password deleted
  on the server: 1 → 0).

Fixed along the way: document server save URL rewritten to the internal address;
`SEARCH` with exact MIME types (Nextcloud rejects partial wildcards); retry on 423
(locked file); editing sessions indexed by document key (a late callback from a
session ended in conflict overwrote the next session of the same file).

## 8. Rename and Save As folders (Session E review candidate)

This server remains example-app storage scoped by client address (including X-Forwarded-For), not an authenticated per-user boundary. Existing download/history addressing can target another address folder; the new file-operation session grants do not change that pre-existing limitation. Use the connected cloud account for account-based storage access.

The start-page connector (architecture B) supplies Rename and Save a Copy callbacks for its hosted editors. This server renames the stored file and its version/force-save history; subsequent callbacks continue to use the active document key and the new path. New editors join that active key until the document-server session ends. Local folder names are confined to the current client-address storage root; symlink folders, traversal, reserved history names and collisions are rejected. The existing delete validator remains in place.

Nextcloud/Murena Rename uses WebDAV MOVE with Overwrite:F and If-Match, after checking the open file's rename permission and saved ETag. A file changed externally must be reopened before renaming. The registry follows different folder-share mount paths and retains valid single-file aliases. File operations and callbacks serialize by file identity. Conflict/converted copies are resolved separately in each connected account’s mounted folder; an account without access to the new copy is removed from that copy’s registry. The provider protocol is documented in [Nextcloud's WebDAV API](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html).

Local/cloud registries bind Rename and copy grants to the authenticated browser and existing editor user policy. Direct requests cannot bypass the legacy restricted-user download policy. Cloud destination/provider permissions are checked separately. Reopen documents from older registry entries before these operations.

In Save As, the Save a Copy format cards convert the current editor content, then open a picker in the current storage. The separate Download copy cards retain browser downloads, including hosted PDF export. A copy has an independent destination and never silently replaces an existing file. This server can create a new folder; the cloud picker lists folders available to the connected account and checks destination file-creation permission (WebDAV C). The original editor remains open; use Open copy to continue with the new file. Zipped image/web-page exports offer Download copy instead. No app password is sent to the editor.

Desktop Rename operates on its selected stored file without discarding unsaved edits; saving later follows the new path. Case-only renames work on a case-insensitive filesystem. A new or converted document has no destination until its first native save. Native Save As uses the OS folder/file dialog and updates the active name for the current format. Other-format exports preserve the active source.

Browser-local input is an immutable selected File. Rename downloaded copy changes the name of future downloads; it cannot rename the original on disk. Save As downloads the chosen format; folder choice is controlled by the browser's download settings/dialog. This preserves the original-file boundary of local conversion.

Acceptance commands use owned instances and public fixtures:

- tests/fileops/copy-formats.mjs (EO_BASE): pending edits in PDF/RTF storage copies, including real RTF reopen.
- tests/fileops/hosted.mjs (EO_BASE; EO_FILEOPS_FORMAT and EO_FILEOPS_FIXTURE for Excel/PowerPoint).
- tests/fileops/nextcloud.mjs and nextcloud-aliases.mjs (EO_BASE, owned NC_BASE/NC_ENV); credentials are never printed.
- tests/fileops/callback-retry.cjs (inside an owned example environment, EO_EXAMPLE_ROOT/EO_CALLBACK_FIXTURE and normal Node config); tests a failed download, retry and actual delayed RTF conversion.
- tests/fileops/browser-local.mjs (EO_BASE, EO_LOCAL_FIXTURES, EO_LOCAL_OUT).
- tests/fileops/native.cjs (isolated EO_DESKTOP_ROOT, packaged executable, PID-scoped native input helper).
- tests/desktop/rename.test.cjs and tests/fileops/storage-paths.test.cjs (EO_UPSTREAM for the latter).

The review evidence and platform limits are recorded in the file operations handoff. Actual Murena, native Windows/macOS GUI dialogs and personal cloud documents are outside the automated fixture runs.

New Rename/copy/folder names normalize to NFC and reject Windows device names, bidi controls and names over 255 UTF-8 bytes; existing stored file/folder paths retain their previous lookup rules. Rename hashes stream under the active-key lock. Picker labels and common errors use English/French catalogs with the existing English fallback. On upgrade, This server keys change once; reopen documents that were open during deployment before shared editing resumes. Nextcloud keys are unaffected.
