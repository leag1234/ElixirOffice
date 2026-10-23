# Desktop release notices — 0.3.2 candidate

The desktop can notify you about a newer ElixirOffice release. **Check for updates** is on by default and can be disabled in File > Options > Updates. This is the owner's 0.3.2 policy decision; the earlier releases made no release-metadata request.

The app contacts github.com through its fixed public GitHub API endpoint. It sends no document content, names, locations, keys, user identity or recent-file data. The request has a constant user agent and no authentication, cookies or referrer. GitHub receives the ordinary connection information needed to serve HTTPS, including the IP address.

## Behavior

- One background attempt on startup, at most once per 24 hours across app relaunches. The attempt time is saved before networking; failed attempts also count. Opening another document makes no additional request.
- The fixed release-list API includes prereleases. Among the latest 20 entries, the app chooses the greatest valid SemVer newer than its running version; drafts and malformed entries are ignored. Build metadata does not affect precedence. An invalid development version makes no request.
- The non-modal message bar reserves its own height, so it covers neither the ribbon nor document/status controls. Existing important warnings and print progress remain above it. It follows the existing theme, RTL direction and keyboard focus.
- **Release notes** and **Download** open the matching release page in the system browser. No asset is downloaded by the app and no installation runs.
- **Remind me later** hides that release for at least 24 hours; it is offered again on a later startup or new document view after that interval, without a session-interrupting reminder timer. **Skip this version** persists for that version. A different newer version is not suppressed by either choice.
- Turning checks off aborts an in-flight request and discards its late result. Saving unchanged Options does not interrupt a check. Offline, HTTP/rate-limit, invalid response and storage failures stay silent.

## Bounds and ownership

Only `https://api.github.com/repos/leag1234/elixiroffice/releases?per_page=20` is requested. The response has an 8 second total deadline and a 512 KiB cap, including an early Content-Length check. Redirects, compressed responses and non-JSON responses are refused.

Browser destinations are restricted to HTTPS release-tag pages under `github.com/leag1234/elixiroffice`. The main process derives and revalidates the destination; renderers supply only a named action and the expected displayed version. Stale actions cannot skip or open a replacement candidate. The document-main-frame IPC guard remains mandatory.

The private settings record stores only the enabled flag, attempt/reminder times, the reminder/skipped versions and a bounded validated candidate version/URL. It shares the existing serialized atomic settings writer. Renderer resource networking, automatic updater dependencies, background component updates and automatic application installation remain blocked.

## Evidence and limits

- `release-notice.test.cjs`: SemVer, malformed URL/state, prereleases, mocked HTTP bounds/errors/abort, persistence/rate limit, reminder/skip and disable/shutdown races.
- `release-notice-main.test.cjs`, `release-preload.test.cjs`, `no-updates.test.cjs`: real main with mocked API, exact document ownership, named browser actions, no other network/updater boundary, nonblocking startup and unchanged dirty documents.
- `release-locales.test.cjs`: all eight labels/privacy fields in 45 desktop locales. Linguistic review remains separate from presence checks.
- `release-banner.cjs`: actual Chromium gestures, light/dark contrast, RTL, focus, stale results/actions and warnings/print layout; no network.
- `tabs-native.py --suite release`: actual sandboxed Electron main/preload/Home/Word and Options on a private authenticated Linux display. It uses a versioned test-launch package, mocked API and browser action, and temporary copies of public blanks. Skip/rate limit survive a relaunch; the independent reminder case resets only its runner-owned settings. Synthetic app.exit cleanup is not normal Quit qualification.

Linux source UI evidence is separate from packaged acceptance. Real system-browser opening, macOS and Windows qualification remain unverified by these tests. No personal-machine test window is implied.

Protocol references: [GitHub list releases](https://docs.github.com/en/rest/releases/releases#list-releases) and [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).
