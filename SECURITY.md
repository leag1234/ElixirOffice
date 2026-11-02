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
