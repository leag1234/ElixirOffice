# Changelog

All notable changes to ElixirOffice. The desktop app and the server version are released separately and have their own version numbers. Newest first. Full notes, checksums and downloads are on each release page.

## Desktop 0.2.0 beta (2026-10-15)

[Release page](https://github.com/leag1234/elixiroffice/releases/tag/v0.2.0)

- Open, read, search, copy, annotate, fill in forms, print and export PDF files, entirely on your computer. Save edited PDFs to the same file or as a copy: the original content is preserved, and PDFs that cannot be saved safely (signed, encrypted, XFA, scripted) stay read-only with a "Save a copy" offer.
- Open and save password-protected Word, Excel, PowerPoint and OpenDocument files; keep, change or remove the password; no plaintext recovery copies for protected documents.
- Rename a document and choose the destination folder of "Save a copy".
- Computer fonts: status and on/off switch in Options.
- New AppImage name, update information and `.zsync` file (updates are checked only by the external AppImageUpdate tool, never by the app).

- Fixed: choosing Discard when closing an unsaved document no longer leaves the app stuck (reported in issue 1)

## Server 0.1.1 beta 1.1 (2026-10-15)

[Release page](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.1)

- File > Rename now renames the stored file; Save a copy lets you choose the destination folder; stricter file names. Existing documents in "This server" storage get a new key once on upgrade: save, close and reopen them.

## Desktop 0.1.0 beta 2

[Release page](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.0-beta.2) (2026-10-13)

- First downloadable desktop apps: Windows, macOS (Apple Silicon), Linux (AppImage, .deb). 100 % local: Word, Excel, PowerPoint and OpenDocument files, spelling and thesaurus, comments, Track Changes, local PDF export, automatic recovery, Save As, optional AI with your own endpoint.

## Server 0.1.0 beta 1

[Release page](https://github.com/leag1234/elixiroffice/releases/tag/v0.1.0-beta.1) (2026-10-12)

- First public version: self-hosted server (Docker, HTTPS with Caddy), editing in the browser, real-time co-editing, Murena Workspace and Nextcloud connection, optional "convert locally" mode, AI off by default.
