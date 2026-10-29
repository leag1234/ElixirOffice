# Windows silent update: 0.5 design and native validation plan

Status: design only; no installer behavior change or physical PC test is authorized by release review.
Source inspected: product c023eb9cc53e3fedba19c9944b670fb0d0668a6c.
The reviewed interactive update flow remains the reference. A successful standalone
QA installation is not evidence that an in-application update completed.

## Existing behavior

The automatic-install preference defaults off. Enabling it must be persisted before
a background download starts (desktop/update-controller.cjs and
tests/desktop/update-controller.test.cjs). Download completion does not confer manual
exit intent: a fresh click when ready is required. A qualified, physically eligible
installation may install on an ordinary user quit with explicit automatic opt-in;
window closure, crash, shutdown, timer and unknown exit reasons cannot trigger it.

The source already distinguishes the two flows:
- Manual ready-click: session.install receives automatic=false.
- Opted-in background update at user quit: automatic=true.
- desktop/update-runtime.cjs:55-70 translates automatic=true into silent=true and
  always requests relaunch=false.
- desktop/update-installers.cjs:12-28 builds --updated with /S only for silent=true,
  and --force-run only if explicitly requested by a caller. The runtime does not
  request it. No shell is used, no elevation is requested, and only a narrow
  Windows environment allowlist reaches the installer.
- desktop/update-library-bridge.cjs:71 onwards binds library install options to a
  once-only armed transaction and verified lease.

Therefore 0.5 is principally native qualification of an existing silent path.
Changing the manual button to silent, changing defaults, or automatic relaunch
would be separate product decisions and are not proposed here.

## Required invariants

Keep signed candidate verification, expiry, version/sequence anti-rollback,
artifact size/SHA512, immutable receipt/lease provenance and final lease validation.
Keep physical eligibility and per-user identity checks, guarded cache access,
once-only handoff and cancellation. Do not fall back to an unverified installer,
library disk hint, unsigned candidate, shell command or privileged install.

The dirty-document barrier precedes installer launch. Cancel must restore the
application and leave documents usable without starting NSIS. Dirty documents
must never be discarded automatically.

The adapter's ACK is a child spawn event, not an NSIS exit status or installed
version proof (update-installers.cjs, update-handoff.cjs). After spawn, the child
is detached/unref'ed and the application may quit. A silent update can therefore
fail after ACK while the old app is already closed. Do not label ACK as successful
installation. A future durable completion mechanism needs its own design/review;
do not extend the short handoff timeout to 317 seconds.

## Differences and risks versus the wizard

The user sees no wizard progress or cancellation after handoff. A later install
failure is less visible. The retained QA050 receipt reports a successful separate
silent per-user installation taking 317 seconds on the Core i3 test PC; its cause
was not measured. It does not prove the update path's duration, nor an antivirus,
compression, disk or CPU root cause. UI must explain that applying an update may
take several minutes, without promising an unmeasured bound.

Keep automatic opt-in off by default and manual wizard behavior available.
Keep relaunch off for ordinary quit. Never disable Defender, SmartScreen,
firewall, signing checks or installer locks. Stop native work if UAC or SmartScreen
appears. Concurrent app starts, a second installer, low disk, interrupted extraction,
restart and installer failure require explicit recovery observations; avoid assuming
NSIS atomic rollback. Retain verified cache/diagnostics according to existing policy.

## Future dedicated-PC QA

Target: the lead's dedicated Windows test PC (currently .209, same pinned host key
as the historical .38). release review authorizes this plan only; no connection, install
or update was performed. Confirm fresh assignment and installed baseline first.
Use a separate update-enabled QA identity and reviewed test signing context for
destructive failure injection; QA050 disables updates and cannot by itself cover
the update flow. Do not mutate a normal owner installation for synthetic tests.

1. Record OS, CPU/RAM, disk free space, baseline version and identity; bind exact
   candidate SHA, size, signature context and source revision. Use public canaries.
2. Control: manual download, fresh ready-click, dirty-save/cancel decisions and
   wizard install. Record installed version and successful document render/reopen.
3. Automatic off: no background install; background download alone never quits.
   Automatic on: persist opt-in, reach ready, then ordinary user quit; observe one
   /S launch, no wizard, no elevation, no automatic relaunch.
4. Dirty document cancel: no installer PID and application/documents remain usable.
   Save success: verify saved contents and continue; save failure: no handoff.
   Test window close, shutdown/crash simulation and cancelled download separately.
5. Refusal cases: wrong signature, expired/rollback candidate, changed bytes,
   cache substitution and conflicting lease; no installer process in each case.
   Reuse existing refusal tests before controlled native cases; never weaken trust.
6. Measure download, final hash/revalidation, spawn, application exit, installer
   exit and first subsequent launch as distinct timestamps. Record only owned PIDs,
   installer exit code, peak RSS/CPU and installation identity; no document text,
   environment secrets or broad process command dumps.
7. Slow i3 case: allow the measured installer to finish; capture exit status in an
   independent owned observer after application quit. Then verify installed version,
   clean launch, public document render, normal quit, shortcuts and uninstall entry.
   Spawn ACK alone fails this acceptance criterion.
8. In a disposable QA identity, test second launch/installer conflict, disk-full
   refusal and interrupted installer recovery. Verify understandable recovery and
   preserved user profile/documents. Do not force-kill normal user processes.

Acceptance requires native evidence of completed installation and next-launch
identity for both flows, all refusal/dirty-document cases passing, and an explicit
account of any remaining recovery limit. Unit tests and the earlier 317-second
standalone install cannot substitute for this evidence.
