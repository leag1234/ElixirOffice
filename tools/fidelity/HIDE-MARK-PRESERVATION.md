# DOCX cell marker property preservation

Integrated for0.6 development after lead review reference 448. SDK dc173b5fca adds40 lines in three property files on integrated4f3835fdca. It preserves explicit w:hideMark true/false through import, model copying/merging, internal property history, cell copying and DOCX export. An omitted value remains unset and does not override inheritance. Existing full-property history also preserves tracked revision metadata.

No layout, flow owner, paragraph fast path or table split code changes. The separate marker-height experiment remains held because its pagination and Undo geometry regressions need independent Word evidence.

## Evidence

Task receipts: /srv/elixiroffice/wt/hide-mark-preserve-A-work.

- Before:24 actual-source method tests,2 pass/22 fail. Actual SDK1267 Linux save/fresh reopen drops both true and false from emitted DOCX XML.
- After rebase:24 property tests and10 physical-model comparator tests pass, zero skips.
- Final compiled SDKdc173: three native probes, one each for omitted/true/false; all three actual property Undo/Redo/Undo cycles, internal cell clipboard copy/paste/Undo cycles, and save/fresh process reopen cycles pass.
- Saved DOCX XML retains exactly the original omitted/true/false flags. Every other observed text/model/geometry field matches the baseline; physical comparison tolerance is1e-9mm, other fields stay exact.
- Each native case checks full recalculation stability, errors and local-only requests. The native set uses one original plain table with trailing empty paragraph, auto height and12pt marker; it is not full geometry qualification across all table cases.
- Qualification uses a frozen sandboxed Linux0.4build20 QA shell with exact current Word bundles overlaid. It is code-level evidence, not current installer, macOS, Windows or Word-reference acceptance.

Run source units with explicit EO_SDKJS: node --test tests/fidelity/hide-mark.test.cjs tests/fidelity/native-model.test.cjs.

The real editor runner is tools/fidelity/measure-hide-mark-preservation.cjs CORPUS OUTPUT EXECUTABLE. Set explicit EO_FIDELITY_XVFB, Playwright and task-owned temporary paths. EO_HIDE_PRESERVE_ACTIONS=1 EO_HIDE_ROUNDTRIP=1 exercises history, cell clipboard and fresh reopen. The corpus manifest binds original synthetic DOCX bytes. Final native observations, emitted DOCX hashes, source/bundle provenance and failed setup attempts remain in the task receipts.

Core/WASM already transports the property; no converter or runtime rebuild is part of this candidate.

## Additional integration checks (release review reference 448)

Two source regression tests bring the total to36PASS with zero skips: all cell writer/reader masks are unique and match,524288 is reserved only for HideMark; explicit empty/populated legacy byte records load without the bit and leave a following sentinel unread. Generic ObjectProperty history uses separate outer flags and delegates cell payloads; PrChange aliases delegate the same cell reader/writer. This establishes reading old records with the new reader, not forward compatibility with mixed legacy clients.
