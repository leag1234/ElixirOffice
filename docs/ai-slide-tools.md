# Presentation AI tools (0.4 held design)

release review authorizes a presentation-specific toolset on the reviewed Word/Cell
architecture. It remains off until configured and consented, uses the existing
approved transport and encrypted native credentials, and sends no context before
consent. No new discovery, endpoint, theme download, image generation or arbitrary
code path is introduced.

## Contract before implementation

The assistant can return a read-only outline or grounded deck summary; append up
to ten new slides from a topic, selected content or explicitly supplied text;
rewrite bounded existing text paragraphs; choose an already embedded layout or
theme; align selected ordinary drawings; and add or replace speaker notes.
Existing slides are never deleted or silently replaced by generation.

Use static serialized public builder commands and the same pure schema policy
before and inside callCommand. A sticky explicit read-only plan prohibits edits.
Start one native group before capture, verify actual public state after each
mutation, and end once; cancel on failure without automatic mutation retries.
Unconfirmed completion/cancellation is reported conservatively, using the
existing Cell safety semantics without changing Word behavior. Later user edits
block one-click discard. Public Undo is used, with actual presentation testing
required before a claim.

Capture selected slide indexes, selected drawing IDs and bounded text; indexes
are zero-based internally but tools expose one-based slide numbers. Recheck slide
count and a public serialized structure signature before every operation. Added
slides extend only this action's scope. Do not serialize model-selected property
paths or access editor internals. Limit deck reads to 100 slides, 200 drawings per
slide and 64 KiB text context per action, with explicit clipping and bounded reads.
Each new slide has one title, at most eight plain body paragraphs and optional
notes; ten slides and 40,000 text characters per action. Existing text targets
must match captured IDs and expected text; unsupported rich objects fail closed.

Planned tools: read_slides, create_slides, rewrite_text, set_layout, apply_theme,
align_shapes, set_notes, summarize_deck, plus submit_plan, verify_result, ask_user
and cannot_do. Schema descriptions, strict validation, safe integer/finite
geometry checks, string/array budgets and unknown-field rejection are mandatory.
No theme is inferred from an arbitrary name: enumerate embedded masters/layouts
and choose only a verified identifier. Alignment keeps dimensions/rotation and
moves only explicitly scoped ordinary shapes, with locks/bounds preflight.

## Public API reconnaissance and risks

Current sdkjs source exposes GetPresentation, GetSelection.GetSlides/GetShapes,
CreateSlide, AddSlide, ApplyLayout/ApplyTheme, shape position/size/ID and lock
methods, and notes APIs. Availability in the actual compiled runtime must be
probed. Public GetContent on an empty shape creates a text body; notes
GetBodyShape/GetBodyShapeText can create a missing body. Read-only capture must
therefore inspect public serialization without those getters, and call content
getters only after a real text body is established. Never treat those names as
proof that the methods are side-effect free.

Public AddNotesText appends; it is not a replacement primitive, and the missing
notes-page path has a suspicious implementation in source. Notes replacement must
preflight actual public body content, change through public paragraph operations
inside the native group, and verify exact resulting text. Missing/unsupported
notes paths fail explicitly. Rewriting must retain existing paragraph formatting
and reject unsupported rich inline objects rather than flattening them silently.
Selection text versus whole-shape scope must be disclosed and checked.

## Qualification

Tests first for policy, serialized public command adapters, planner/read-only and
rollback faults, Word/Cell compatibility and UI routing. Then actual private
sandboxed Linux public API, one Undo, no-op/read-only history, scope/lock refusal,
notes/text/layout/theme and Save/reopen tests. Compiled UI setup must remain
consent-gated. Author approximately thirty independent FR/EN teacher/business
tasks with explicit expected state; run three repeats via the existing development host
managed gpt-4.1-mini/scaffold only after ai-check. Report latency, failures and
safe refusals honestly; do not combine diagnostic runs into a perfect result.

Freeze English strings for Z after the UI contract stabilizes. Complete the
required-builder strict suite and branding checks, record exact review heads,
then REPORT and wait. No integration or package/platform claim.


## Implemented scope and safeguards

The held source adds four presentation modules (policy, static public commands,
controller and English strings). Shared UI changes only select the slide-specific
labels; Word and Cell routing/consent stay covered by the combined regression
suite. Presentation Ask is available from the ribbon, title search, existing
context menus and File AI. No extra toolbar is introduced.

Generation appends plain title/body shapes and optional speaker notes. It uses
explicit theme text color and 32 pt/20 pt title/body sizes; the public API accepts
half points. Layout and theme tools select only existing embedded masters and
layouts. Theme copying isolates unrelated slides. Alignment uses public setters
that materialize inherited transforms, then verifies geometry after recalculation.
Text replacement keeps paragraph/run properties and requires exact expected text.
Appending notes preserves existing paragraph formatting; replacement reuses
existing paragraph properties. Missing notes bodies and unsupported rich inline
content fail explicitly. A partial selected text fragment can be generation
context but cannot silently authorize rewriting the whole shape.

An explicit read-only plan cannot become an editing plan. Editing starts one
native group before context capture, checks scope and current serialized state,
then ends once. Read-only capture avoids public getters that create missing text
or notes bodies. Derived rendering caches are ignored only where their canonical
source remains checked. Lost commit/cancel callbacks produce a warning rather
than claiming unchanged or reverted data. A later user edit blocks automatic
discard. The shared Word orchestrator is unchanged.

Limits include 100 slides, 200 drawings per slide, ten new slides per action,
eight body paragraphs per new slide, twelve editing calls and 40,000 written text
characters. Document context is cumulatively limited to 64 KiB UTF-8, including
returned states and verification. Tool text/notes limits and geometry bounds are
validated before public writes. Summaries describe captured text/notes, not image
content, chart data or arbitrary embedded objects. Review model output before use.

## Qualification ledger

- Complete required-builder desktop/update/AI union: 1,670 passed, zero failed
  or skipped. Source tests cover strict schemas, finite geometry, quotas, read-only plans,
  scope/expected-text checks, formatting, cancellation faults, derived caches,
  locale seals and unchanged Word/Cell UI behavior.
- Final compiled sandboxed Linux run: 16 public-tool/native cases, nine compiled
  UI/consent cases and one actual canvas/font-size regression passed. This includes
  one Undo, empty/read-only history, real lock refusal, notes formatting, theme
  isolation and actual File Save/reopen. The approved pinned sandbox helper was
  checked at every launch and restored afterward; no sandbox bypass was used.
- The rendered generation regression failed with zero visible dark text pixels
  before the fix and passed with 2,852 afterward. A separate black-color control
  produced 880. The final screenshot was inspected visually. Pixel qualification
  concerns the authored Linux fixture, not general slide aesthetics or all themes.
- Isolated hosted security/configuration suite: 45/45 passed. Private public-tool
  deterministic checks passed 30/30 on the final source. Compiled hosted smoke
  passed four presentation and four spreadsheet regression checks; these runs
  never call a real provider.
- The first model measurement was 86/90, median 4,204 ms, before the visible-text
  correction. It is diagnostic only, not corrected-source acceptance. Three
  French shortening requests were safely refused for exceeding an explicit
  character limit; one French generation produced an extra body paragraph and
  reported a failed goal. All 75 changed results restored with one Undo; 12
  read-only cases stayed unchanged and three refusals made no edit.
- The corrected-source real-model measurement completed once after direct owner
  confirmation on 2026-10-27: 86/90 tasks passed, median 3,691 ms and p90 5,041 ms.
  This is a separate measurement from the pre-fix diagnostic above; details follow.
- Fifteen English UI fields are sealed for release maintainer; translations remain pending.
  Actual Mac/Windows native behavior, packages, theme contrast beyond the authored
  fixture and provider quality outside this measured model are unverified.

## Corrected-source real-model measurement (2026-10-27)

One owner-authorized run used 30 independently authored teacher/small-business
tasks, 15 English and 15 French, each repeated three times through the existing
development host managed proxy with gpt-4.1-mini in scaffold mode. Keyless ai-check passed
(exit zero, HTTP 200). No key or private configuration was read or changed, no
new endpoint was added and no second measurement was run. Core, policy, adapter,
task, fixture and independent-criteria hashes stayed unchanged throughout.

**86/90 passed (95.6%); median 3,691 ms, p90 5,041 ms.** Latency covers managed
client settings load through action verification, excluding fixture upload and
editor startup. Scaffold planning, tools and verification used 302 chat requests
within those 90 actions.

| Category | Passed / attempts |
|---|---|
| Generate slides | 17 / 18 |
| Rewrite / shorten | 15 / 18 |
| Speaker notes | 12 / 12 |
| Layout | 12 / 12 |
| Alignment | 12 / 12 |
| Embedded theme | 6 / 6 |
| Deck summary | 6 / 6 |
| Outline | 6 / 6 |

English tasks passed 45/45; French tasks passed 41/45. All failures count against
success. Three repetitions of the French shortening task each proposed an
88-character replacement twice against an explicit 85-character limit. Validation
refused both writes, preserving the original text. One French generation added
three body paragraphs where two were requested. Its verification reported the
goal unmet; the extra paragraph remained visible until Undo. No automatic
truncation, silent acceptance or post-measurement quality fix was applied.

All 75 changed results restored the original public snapshot with one Undo.
Twelve read-only cases left it unchanged; three refusals made no edit. Renderer
errors and failed Undo checks were zero. The harness exits nonzero for the four
task failures; this is an honestly measured held candidate, not an all-green
model-quality gate. Results qualify this task set/model/configuration, not every
provider, document or platform. The compact receipt binds the exact hashes and
per-category outcomes.

## Reproduction and evidence

Use tests/ai-slide/*.test.cjs with EO_WEB_APPS pointing to the candidate web tree.
The full required-builder union also includes tests/desktop,
tests/desktop-updates, tests/ai-cell and tests/ai-config with explicit EO_UPSTREAM
and EO_RELEASE_REQUIRE_BUILDER=1. Native runners require an owned private X11
session, the approved sandbox helper and public fixtures copied into a temporary
root. The three native scripts are native.cjs, ui-native.cjs and render-native.cjs.

The eval harness independently authors 30 OOXML fixtures from the public blank
presentation. Its expected-state checker does not import the production policy.
It verifies exact requested slide/body counts, preserved facts/formatting,
foreground/font size/geometry, verification outcome and one Undo against the
original public snapshot. Real results are never replaced with deterministic
ones. Records bind Core/Policy/Tools and fixture/criteria/task SHA-256 hashes.

Deterministic mode is restricted to the labeled private instance on port 18368.
Real-model mode is restricted to the explicitly authorized existing development host proxy
on port 8080, model gpt-4.1-mini, scaffold mode, with explicit release review/release review flags.
Never read keys or private configuration, create a new endpoint, or change a
service to run the evaluation. Stop if keyless ai-check cannot pass or approval
is unavailable. Latency measures the AI action (managed settings load through
verification); fixture upload and editor startup are excluded. A failure or safe
refusal is counted as a failed task, not a successful mutation.

A compact qualification receipt binds the
held implementation web head and the measured source/test hashes. Full task receipts live outside Git in
/srv/elixiroffice/wt/ai-discover-A-work/. Failed diagnostics are retained with
hashes. No converter, SDK/runtime pin, production desktop main process, public
instance configuration, integration or publication belongs to this change.
