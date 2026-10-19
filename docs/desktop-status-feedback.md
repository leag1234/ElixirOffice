# Desktop cancellation status and Word zoom layout

Review candidate for [public issue 2](https://github.com/leag1234/elixiroffice/issues/2).

The white Cancel bubble is the desktop shell status message. The cancellation
handler displayed the translated button caption indefinitely. It now clears
the operation message through the existing status function, preserving
password-protection recovery and optional-font warnings. Genuine permission
and other output errors remain visible. Shared tooltips and native dialogs
are unchanged. The separate dismissible Cancelled operation card is retained.

With the current 18 px thumb, SingleSlider's configured 100 px width produces a
109 px track; the old 100 px Word wrapper let it extend 7 px into the plus button.
The local Word wrapper reserves the extra half-thumb using the theme variable
and existing legacy fallback. Shared slider code, value mapping and events
are unchanged. The spacing applies to hosted Word too; other editors' layouts are unchanged.

## Verification

The regression loads the actual desktop renderer, production Word UI/SDK and
Wasm converter with a public blank. Only the native IPC boundary is a fixture:
Save/PDF cancellations and a permission error. Checks cover delayed message
cleanup, persistent font warnings, real tooltip hover/leave, zoom buttons and
both thumb endpoints, including trusted mouse drags. Native menu actions use
the PublicAction IPC fixture; this is not a native shortcut/Escape test.

Set EO_BROWSER=firefox (default chromium), EO_PLAYWRIGHT_MODULE to an absolute
Playwright module, EO_DESKTOP_ASSETS to an assembled public current asset tree,
and EO_STATUS_OUT to a fresh output directory, then run:

    node tests/desktop/status-feedback.cjs
    node --test tests/desktop/cancellation-feedback.test.cjs

Chromium uses its sandbox. Browsers use launchServer/connect; both connection
and owned server close in finally. The fixture binds loopback, blocks outside
requests and records loaded resource hashes and captures. The executed driver is saved;
start/end hashes guard the driver, source inputs and every served file.

The original approved guarded regression fails on the branded baseline and passes on the
branded candidate in Chrome 155 and Firefox 155: English/light and Arabic/dark,
DPR 1 and 2, 80 behavioral checks including trusted pointer drags. Before/after
Word JavaScript, HTML and all 3374 assembled files are byte-identical except the
expected 53 byte CSS width-rule change; theme inputs match byte for byte. Earlier
candidate runs omitted the copied theme and remain partial setup evidence.
Six handler tests failed before the status fix on current and frozen 0.2.1 source.
Current desktop units pass 244/244 before and 250/250 after; frozen tooltip-only
units pass 206/206 before and 212/212 after, with the required public asset and builder fixtures.

DPR is browser simulation. Native Arch/niri/Wayland dialogs, actual 200%
compositor scaling and physical focus transitions remain unverified. A sandboxed
headless Electron probe on development host failed before application start because its
sandbox helper was not configured. No bypass/setuid change, package, runtime
pin or release metadata change was made.

## Frozen 0.2.1 backport

The separate Product dd042fbc48 branch carries only cancellation status cleanup,
six focused tests and docs. DS 09516bf9c8/Web 26f3977f5a/SDK 46dfd9b4dc remain
unchanged. The frozen branch makes no slider-fix claim.

## Rebase onto current open-error handling

The release review current branch starts at Product 23a120a00e. Its open-error classifier,
file reader, main-process routes, recent-file helper, safety logger and translated
catalog source are byte-identical to that base. Only the approved one-line
cancellation cleanup changes renderer behavior. Existing documentation retains
every baseline line; four overlapping documentation appends were resolved as a
union.

Fresh checks: base desktop 256/256, candidate 262/262; six cancellation tests red
before reapplication. Chrome 155 and Firefox 155 again pass all 80 UI checks with
the exact final executed driver and guarded source/served inputs. Current Home
catalogs are regenerated; test fonts use the existing coherent standard pack.
Web 9f27ba11e3 and DS d2cade87f6 are unchanged and already descend from their
current integrated bases. The original frozen tooltip-only backport is unchanged;
release handling belongs to the lead and D. Native/platform limits above remain.
