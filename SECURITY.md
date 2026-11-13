# Security policy

ElixirOffice opens documents that come from anywhere, so security is part of every release, not an
afterthought. This page says how to report a problem, what we commit to, how we follow the projects we
build on, and where we stand today.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub private vulnerability reporting on
[leag1234/ElixirOffice](https://github.com/leag1234/ElixirOffice/security/advisories/new). Include the
affected component and version, steps to reproduce (a sample file if needed), and the impact you observed.
Remove personal data and secrets from attachments.

| Step | Target |
|---|---|
| Acknowledgement | 5 working days |
| First assessment (severity, affected versions) | 10 working days |
| Fix released, critical (CVSS 9.0+) | 7 days after confirmation |
| Fix released, high (CVSS 7.0-8.9) | 30 days after confirmation |
| Fix released, medium and low | next regular release |

We publish a security advisory for every confirmed vulnerability once the fix is available, request a CVE
identifier when the issue is ours, and credit the reporter unless they ask otherwise.

## Supported versions

| Product | Supported |
|---|---|
| Desktop: latest release | yes |
| Desktop: previous releases | no, please update (Windows and AppImage update from inside the app) |
| Server: latest published image | yes |

## How we keep up with security fixes

ElixirOffice embeds many third-party components. Security fixes come from several sources, and we review
each one before taking it:

- **Various office projects.** We follow the security releases of various office projects and port the
  fixes that apply to our code.
- **Library maintainers and vulnerability databases.** We follow the advisories of the libraries we embed
  (CVE, GitHub and OSV databases), independently of when other office projects pick them up.
- **Our own work.** Fixes for issues found by our tests, our reviews and the reports we receive.

Every security update is checked against our layout regression set (74 Word documents plus PowerPoint and
Excel references) before it is integrated.
- **Dependencies.** An automated scan runs on our build machine: OSV-Scanner on every dependency manifest
  (npm, Python, C/C++ bundled libraries) and Trivy on the server image. A weekly report lists new findings by
  severity; findings in code we ship are handled with the targets above.
- **Desktop runtime.** The desktop app embeds Electron (Chromium and Node.js). We follow Electron security
  releases closely, because Chromium renders every opened document.
- **Converters.** Opening a crafted file is the main attack surface. In the desktop app converters run as
  WebAssembly inside the sandboxed renderer; on the server they run as separate processes. Fuzzing of the
  converters is planned.
- **Shipped vs. not shipped.** Scanners also report development tools, test fixtures and vendored lock files
  that are not part of any release. We triage those separately and say so when a finding does not affect a
  release.

## Security check before each release

### 2026-11-13 (desktop 0.8.0, published 2026-11-13)

- Dependency scan (OSV, nightly) of 2026-11-13: 6 new findings. The high ones (GHSA-xcvg-w56q-r89m, Pillow) concern
  the Python requirements of the desktop and fidelity test tools, which are not shipped. The shipped high finding
  (request-filtering-agent 1.0.5 in the server) stays reviewed as not affected.
- Bundled C/C++ libraries (vendored check of 2026-11-13): no new finding; the pending components
  (xpdf 4.03, dcraw 8.93, V8 8.9, ICU 74.2, HarfBuzz) stay on the plan.
- Electron 44.11.2 -> 44.11.3 (fixes backported from Chromium, V8, Skia, ANGLE, Dawn and ICU).
- Local file links (#77): the editor page cannot open a file itself; it asks the application through a dedicated
  bridge, which accepts local links only, refuses programs, scripts, installers and disk images (also behind a
  symbolic link), and asks a native question (Cancel by default) before the system opens the file.
- New code in this release that reads document data (style ids, WordArt text paths, extended chart data and labels)
  runs in the WebAssembly converter and the editor inside the sandboxed renderer.

### 2026-11-12 (desktop 0.7.3, published 2026-11-12)

- Dependency scan (OSV, nightly) of 2026-11-12: 18 new findings. Seven are in the libtiff copy under
  openjpeg-2.4.0/thirdparty (CVE-2023-52355, CVE-2023-52356, CVE-2025-61144, CVE-2025-9900, CVE-2026-4775,
  CVE-2026-52491, CVE-2026-52492): that folder only serves the openjpeg command-line tools and is not compiled
  (the converter builds lib/openjp2 only), so the product is not affected. PYSEC-2026-4363 (Pillow) concerns
  the Python requirements of the test and fidelity tools, not shipped. The remaining findings are medium or low
  in development dependencies.
- Bundled C/C++ libraries (vendored check of 2026-11-12): no new finding; the pending components
  (xpdf 4.03, dcraw 8.93, V8 8.9, ICU 74.2, HarfBuzz) stay on the plan.
- Electron 44.11.1 -> 44.11.2 (stops trusting revoked eMudhra RSA intermediate certificates).
- New code in this release reads data from documents: positional tabs, compatibility flags, the autoSpaceDE /
  autoSpaceDN paragraph properties and VML stroke widths. All of it runs in the WebAssembly converter and the
  editor inside the sandboxed renderer, with fixed-size values only.

### 2026-11-11 (desktop 0.7.2, published 2026-11-11)

- Dependency scan (OSV, nightly) of 2026-11-11: 15 new findings, all in JavaScript dependencies of the
  server (node-forge and fast-xml-parser, advisories published on 2026-11-10 and 2026-11-11). Two are
  rated high (GHSA-6qrw-m8cv-hcxf, RSA signature forgery; GHSA-rhr8-3pm8-cq29, ASN.1 resource
  exhaustion), the others medium or low. node-forge in the server dependencies (1.4.2, pulled by
  win-ca) and fast-xml-parser 5.11.2 (pulled by the Azure storage client) are updated to node-forge 1.4.3
  and fast-xml-parser 5.12.0. The server code itself does not use node-forge (it verifies certificates with
  the Node.js crypto module).
- Findings in the AdminPanel client lock file (node-forge 1.3.1) concern the webpack development server
  only; the client is built to static files and node-forge is not part of the shipped client. The lock
  file is updated to 1.4.3 anyway. fast-xml-parser 4.5.0 in the document server example application
  (a sample, not part of the desktop app) is not changed.
- Bundled C/C++ libraries (vendored check of 2026-11-11): no new finding; the pending components
  (xpdf 4.03, dcraw 8.93, V8 8.9, ICU 74.2, HarfBuzz) stay on the plan.
- Electron 44.10.2 -> 44.11.1 (44.11.0 and 44.11.1 carry backported Chromium, V8, PDFium, Skia, ANGLE and
  FFmpeg fixes).
- New code in this release reads data from documents: fonts embedded in Word files (the converter
  de-obfuscates them, checks the font signature, limits sizes and keeps only files inside the document's
  media folder) and picture bullets. Both run in the WebAssembly converter inside the sandboxed renderer.

### 2026-11-10 (desktop 0.7.1, server 0.7.1, published 2026-11-10)

- Dependency scan (OSV, nightly) and bundled C/C++ library check of 2026-11-10: no new finding since
  0.7.0; the pending components (xpdf 4.03, dcraw 8.93, V8 8.9, ICU 74.2, HarfBuzz) stay on the plan.
- Electron 44.10.2 is still the latest 44.x release.
- Public source packets: the filter that removes secrets matched CSS custom properties starting with
  `--sk-` as API keys and rewrote them; it now only matches a key that is not part of a longer name,
  and the packet check fails if a placeholder token remains in the public trees.

### 2026-11-09 (desktop 0.7.0, published 2026-11-10)

- Dependency scan (OSV, nightly): no new finding in shipped JavaScript code. The scan now also lists the
  third-party copies bundled inside the OpenJPEG source tree (libtiff, libpng, zlib, lcms2 under
  `thirdparty/`); they are not built (OpenJPEG links our own libtiff 4.7.2, libpng 1.6.59 and zlib 1.4),
  so these findings do not apply.
- Bundled C/C++ libraries: the inventory used by the nightly CVE check was still describing the versions
  before the 0.6.6 update; it is corrected (libtiff 4.7.2, libpng 1.6.59, zlib 1.4, libxml2 2.15.4,
  FreeType 2.15.0, OpenJPEG 2.5.4, OpenSSL 4.0.3; JasPer and the unbuilt FreeType 2.5 copies removed).
  With the real versions the check reports 33 entries, all in the components already listed as pending
  (xpdf 4.03, dcraw 8.93, V8 8.9, ICU 74.2, HarfBuzz) plus CVE-2019-0190 matched on OpenSSL 4.0.3 by
  name only (an Apache httpd mod_ssl issue, not applicable). The pending components stay on the plan
  for the next releases.
- PDF viewer engine of the desktop app (the WebAssembly `drawingfile` module, previously a prebuilt
  binary from upstream) rebuilt from our converter sources with the updated libraries.
- Electron 44.10.1 -> 44.10.2 (backported Chromium, V8, Skia, PDFium and WebRTC fixes, Node.js 24.22.2).
- New binary property for character borders (run property type 57): older builds skip unknown
  properties, so documents saved by 0.7.0 still open in older versions.

### 2026-11-07 (desktop 0.6.6, server 0.6.6)

- Dependency scan (OSV): no new finding; the only high finding in shipped code (request-filtering-agent,
  GHSA-r3r9-wp5j-pq5g) stays verified not affected.
- Bundled C/C++ libraries: libxml2 2.9.14 -> 2.15.4, libtiff 3.9.4 -> 4.7.2, FreeType 2.10.4 -> 2.15.0,
  zlib 1.2.11 -> 1.4, libpng 1.5.26 -> 1.6.59, OpenJPEG 2.4.0 -> 2.5.4, OpenSSL 4.0.1 -> 4.0.3; JasPer
  1.900.1 removed (JPEG 2000 goes through OpenJPEG). This closes the known CVEs of these copies. The
  WebAssembly converters of the desktop app are rebuilt with them.
- Checked and not affected: curl (not built into the desktop app or the server converters; the server
  image uses the system package, covered by the image scan); FreeType 2.5.x copies (present in the source
  tree, not built).
- Still to update: xpdf 4.03, dcraw, V8 8.9, ICU, HarfBuzz (planned for the next releases).
- Electron 44.10.1: the newer 44.10.2 has the same Chromium and Node.js, so no security change is pending.

## Status (2026-11-02)

| Item | Status |
|---|---|
| October 2026 upstream security fixes (Brotli 1.2.1, converter format-string fix, Node.js 24, web editor fix) | merged |
| CVE-2026-111497, Brotli decoder (critical) | server converter fixed; WebAssembly converters and desktop Electron update in progress for desktop 0.6.3 |
| Server npm dependencies (socket.io-parser, engine.io, multer, express, axios, form-data, fast-xml-parser, nodemailer, sharp and others) | updated; no high or critical finding left in shipped server services |
| request-filtering-agent (GHSA-r3r9-wp5j-pq5g) | version in use verified **not affected** (blocks private addresses asynchronously); regression test added |
| Further upstream security fixes published in mid-October 2026 | being reviewed and ported |
| Server admin panel and example application | disabled by default (opt-in with `ADMINPANEL_ENABLED` / `EXAMPLE_ENABLED`) |

## Deploying the server safely

- Keep JWT enabled and use a long random secret.
- Serve the document server over HTTPS only.
- Keep the admin panel and example application disabled unless you need them.
- Keep the host's container runtime and operating system updated; use the latest image.
