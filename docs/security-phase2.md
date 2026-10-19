# Document hyperlink and review-text hardening candidate

This phase2 JavaScript candidate starts from integrated product abc00be3cf, DocumentServer fcc4d89568, SDK9a8e6db15d and web-apps1a06e7b6c5. It does not change the converter or the pinned runtimes.

The shared SDK helper accepts HTTP, HTTPS, FTP, mailto, tel and internal fragment URLs, and rejects other schemes, nonstrings and ASCII controls. Thirteen actual external-opener callbacks use it: Word/Excel/PowerPoint main and mobile, their three embeds, Word forms, and diagram main/mobile/embed. Warning messages encode the document URL. Mobile presentation internal slide actions retain their anchored allowlist and use internal navigation; the spreadsheet empty-link alert is preserved. The diagram warning also uses its existing captured controller rather than the timeout callback's unrelated receiver, preserving allowed warning flows.

The Review panel encodes imported tracked font-family and style names before placing them in markup. Existing inserted-text and comment linkification already kept the tested hostile values inert; no speculative comment change was made.

## Evidence and limits

The current-source baseline of139tests gave14pass/125fail. After protecting the initial ten handlers, the expanded165test suite gave139pass/26fail because the repository-wide callback search found two diagram entry points. The r1 final165/165 pass with no skips; current r2 results are recorded below. Tests execute the actual handler bodies with confirmation automatically accepted, plus actual review/comment methods and the review template in headless Chromium. The browser route aborts all network requests.

A public synthetic DOCX with seven relationship targets and tracked hostile font/style text was actually converted DOCX -> editor -> DOCX using the unchanged full pinned runtime 528e920e4f34-bd14d110aa08-st. Relationship and tracked-format values survive. The verifier checks those XML values; actual callback/rendering tests are separate. This is not a complete imported-document editor UI acceptance run. This rebase re-verifies the retained synthetic conversion output; it does not claim a new conversion or runtime build.

Headers are unchanged. No post-cutoff upstream code was imported. There is no production bundle rebuild, packaged/native acceptance or complete hosted editor gate in this candidate.

## Core path audit: unresolved, not covered by the JavaScript fix

At unchanged core528e920e4f34, OfficeUtils/src/ZipUtilsCP.cpp do_extract_currentfile creates directory entries before its file traversal check; the 4096-byte filename path also merits explicit length validation. EpubFile/src/CEpubFile.cpp takes container.xml rootfile full-path and spine href values into filesystem paths without one unconditional root-containment rule. The existing traversal logic depends in part on the private-IP setting. These are concrete source findings, not a demonstrated native exploit or a tested runtime fix.

HWP/HML lookup resolves to HwpFile/HwpDoc/HWPMLFile.cpp and HWPXFile.cpp. The inspected HWPML path reads embedded base64 BinData into memory, and HWPX uses CZipFolderMemory entry lookup rather than writing entries to an extraction directory. This limited inspection does not establish parser/resource safety. XML parser hardening remains part of the separately scheduled libxml/core work.

A core follow-up needs one consistent extraction-root containment policy before any directory/file creation, explicit archive-name length validation, unconditional EPUB OPF/resource containment, hostile traversal fixtures and allowed nested-resource controls against native conversion, followed by the scheduled wasm rebuild and corpus gates. No archive, EPUB or HWP safety claim is made here. Lead review must decide/schedule this core follow-up with phase3 before phase2 is described as complete.


## release review policy and compatibility correction (r2)

Bare targets beginning with www. (case-insensitive) receive http:// before scheme validation. Other scheme-less document paths are not sent to an external opener: the existing invalid-link warning is displayed without an approval-to-open action. Anchors and existing internal slide/bookmark handling retain their prior dispatch; the slide-action allowlist stays anchored. The diagram mobile callback now has the same guard and escaped warning text.

Forms integrator-config saveUrl/fullscreenUrl are a separate input: relative configured values resolve against the page origin, then use the safe opener. Absolute executable schemes still fail validation. A relative target contained in a document does not gain that integrator-config permission.

The non-opening warning reuses the existing spreadsheet invalid-link translations (43 source languages). Corresponding main/embed/forms/mobile locale entries are added without altering any existing parsed value; unavailable translations use the existing English fallback. No new machine-generated translations are introduced.

r2 scoped regressions:208/208,0skip, including thirteen callback bodies, www normalization, visible relative-link warnings, forms configured URLs, both converted-DOCX target cases and actual Chromium review/comment rendering. The same208tests on r1 give165pass/43fail. No production bundle, complete imported-editor UI or native/runtime acceptance is established here.
