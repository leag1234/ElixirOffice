# ElixirOffice {{VERSION}} desktop — build {{BUILD_NUMBER}}

Prepared from the source freeze candidate for 0.6.1.
Product source: {{PRODUCT_REVISION}}.
The final BUILD-INFO.json and corresponding source archive bind the exact
editor revisions and runtime inputs. {{RELEASE_STATUS}} Package checks, native
acceptance, owner signatures and publication remain pending.

## What's new

- PDF export of a Word document with tracked changes now shows the final
  revision: deleted text no longer appears in the PDF.
- Chinese, Japanese and Korean text in PDF export can use the native
  WebAssembly path when the runtime declares the capability, for the safe case
  described under known limitations.

AI stays optional and off by default. Sending document context requires your
configured service, consent and explicit request. Documents are not sent to the
publisher.

## Installation and updates

Use the package for your operating system and follow the
[desktop installation instructions](../desktop.md#using-the-app).
Exact download links and checksums accompany the qualified release.

Installers remain publisher-unsigned. macOS packages are arm64-only, ad-hoc
signed and not notarized; Gatekeeper may require the documented manual
approval. Update signatures authenticate update metadata and bytes; they do
not provide an OS publisher certificate. Silent updates are not available.

## Known limitations

- The table page-break change was tested on Linux and in Chromium. Its effects
  on macOS, Windows and system print dialogs have not been checked separately.
  One additional Word reference could not be exported and remains unverified.
  The measured page allocations do not certify every table type, vertical
  geometry or all documents.
- Chinese, Japanese and Korean text in PDF export now uses the native path only
  for the safe case (one character at a time, from the basic multilingual
  plane). Rare characters such as CJK Extension B, variation sequences and
  multi-character clusters still use the JavaScript fallback and can be missing
  from the PDF. Two existing cases that failed the strict WebAssembly-only PDF
  check in 0.6.0 are re-measured in the qualification record; a fallback is not
  counted as native success.
- Additional footnote-position regression guards remain deferred; the existing
  omitted position default remains page-bottom.
- Physical printing, downloaded-installer handling, Gatekeeper and all-users
  installation require separate native checks. Package construction and source
  tests do not certify them.
- On Linux hosts that restrict unprivileged user namespaces, the AppImage can
  run without Chromium's sandbox. Prefer the DEB on affected systems.
- Long-session memory growth, Windows CPU spikes/pauses on lower-end computers,
  and the historical forced-cleanup crash remain unresolved.
- Display density can affect a spreadsheet's derived noncustom default row
  height when saving. Explicit custom heights are a separate case.
- Font substitution cannot reproduce every missing typeface or glyph. CJK
  coverage is limited to the bundled and available fonts; italic is synthesized.
- Existing conversion, PDF, ODF, embedded-object and AI tool limits remain.
  Modern LibreOffice 26.8 encrypted ODS is not supported. AI can make mistakes.

## Qualification

Build 23 package and native qualification is pending. The combined web-source
unit suite passed 23 tests before this build. Earlier build 22 package and Mac
results are historical evidence only and are not build 23 native acceptance.
The previous unattended Mac harness failed with SIGKILL (-9), with its source
unverified; that failure has not been turned into a pass.
The final release packet must record exact package/source/runtime hashes,
actual platform results, owner signatures and remaining dispositions.
Existing failed checks remain failed even where the lead accepts a separately
documented known limitation for this release. No all-green suite, native
platform acceptance, performance improvement or Office-layout equivalence is
claimed here.

## Reporting problems

[Open an issue](https://github.com/leag1234/elixiroffice/issues) with the app
version, operating system, steps and expected/actual behavior. Prefer a small
synthetic reproducer; remove personal information, private content and API keys
before sharing attachments.
