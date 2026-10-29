# mac-unattended exit 137: retained evidence and next-window probe

Status: offline investigation under release review. No Mac access or native run was made.
Base source: c023eb9cc53e3fedba19c9944b670fb0d0668a6c.

## What the receipts establish

The retained 0.3.3 build19 accepted-mac-disposition-build19.json explicitly records
unattendedExitCode=137, status UNVERIFIED and cause UNESTABLISHED. This is a repeated
symptom, not evidence that two runs share the same underlying cause.

For 0.4.0 build20, A-final-receipts/native-window-receipt.json records:
- Start 2026-10-28 10:30:00+01:00; end 10:32:57+01:00; shell exit 137.
- Deadline 10:40:00+01:00; deadlineStopped=false.
- Peak sampled owned RSS 1,384,016 KiB, largest sampled process 1,018,944 KiB;
  146 samples. RSS includes shared mappings and is not physical-memory pressure.
- native-after-audit.sh runs the quit probe, tabs probe, mac-unattended and then
  six-format smoke serially. Each writes a separate log.
- Existing mac-unattended stdout did not establish a completed phase. Its first
  PASS is after launch, edit, save and the network-denial check.

The retained timed wrapper sends its deadline signal at deadline minus 15 seconds,
and sets deadlineStopped when doing so. The observed 10:32:57 exit is over seven
minutes earlier. This receipt argues against that particular deadline branch;
it cannot exclude another external killer or prove an operating-system OOM kill.
The 0.4.0 independent six-format 6/6 result is a different run and remains valid;
it does not turn this failed unattended run into PASS.

## Hypotheses to distinguish

1. Memory pressure killing a Node/Electron process: plausible with the sampled
   process growth, but unproven without pressure/termination evidence. A peak of
   about 1 GiB alone does not establish the Mac's available memory or kill policy.
2. Node-side memory amplification: PDF bytes and conversion inputs/results cross
   Playwright as Array.from arrays; this can amplify allocations. The current
   trace does not place the failure at PDF or conversion, so do not optimize this
   path speculatively. Phase markers and Node heap/external/RSS separate this case.
3. Another supervisor, session/window cleanup or user action: shell 137 does not
   identify who sent a signal, or even prove the observed shell itself was signalled.
   The timed wrapper's own deadline branch appears inconsistent with this run.
4. Launch/import/readiness stall followed by a downstream kill: possible because
   the old first marker is late. A trace before heavy harness imports is necessary.
5. Owned-app cleanup: harness.cjs terminate() deliberately SIGKILLs the detached
   Darwin application group. This is a distinct mechanism; source alone does not
   prove it killed the Node harness. Record the harness PID/PPID and stop phases.

The previously reported forced-cleanup SIGSEGV is unresolved and must not be
relabelled as this exit-137 event. Native printing and dirty-close coverage also
remain separate acceptance scopes.

## Cheap optional instrumentation

mac-unattended-trace.cjs is inactive unless EO_MAC_UNATTENDED_TRACE is set.
When requested, it creates a new absolute output file exclusively (0600), emits
fixed phase names plus PID/PPID, RSS, heap/external/array-buffer bytes, CPU usage
and a one-second unref'ed heartbeat. It records no document content, filename,
argv, environment values or network endpoints. Markers cover module-load, first
launch/editable, PDF evaluate/return, ODF conversion, first stop, reopen and each
six-format case. Test assertions and cleanup behavior remain in place.

mac-unattended-observe.py is a passive independent observer. It creates a new
0700 results directory, enables the trace, samples only numeric descendant
PID/PPID/start-timestamp/RSS and records the actual direct-child return code/signal after wait.
Run the Node harness directly as its child to distinguish returncode=-9 from a
shell's ordinary exit137. It never sends signals, changes deadlines, reads broad
process argv or adjusts host policy. It cannot trap SIGKILL; if the observer is
also killed, its last samples survive but a final receipt may be absent.

For the next explicitly authorized Mac window, keep the existing outer owner
deadline and owned-process cleanup, and wrap only the unattended Node invocation:
python3 -B tests/desktop/mac-unattended-observe.py --results <new-private-absolute-directory> -- node tests/desktop/mac-unattended.cjs
All existing source/package identity and test prerequisites still apply. This is
a recipe, not authorization to run it now. Do not automatically repeat passed
packaging, six-format or unit gates.

The observer does not track descendants after reparenting, guarantee orphan
cleanup, attribute a signal sender, or prove OOM. Aggregate vm_stat counters are sampled at most once per ten
iterations on Darwin (unavailable is recorded explicitly); they do not label a kill
as OOM. This Darwin path is not natively qualified yet. Retain the existing wrapper's
owned PID tracking and before/after vm_stat evidence. Do not add root diagnostics,
broad process dumps, security changes or process-pattern killing. If a new trace
pins a phase, decide the next narrow measurement from that evidence.

## Offline validation

Six synthetic Linux tests exercise direct self-SIGKILL (-9), ordinary shell
exit137, real Node phase/memory records, exclusive output refusal, private modes
and disabled no-op tracing. Process start timestamp and synthetic aggregate
vm_stat counter parsing are also covered; actual Darwin availability is unverified. These are instrumentation tests, not Mac acceptance.
No native cause or fix is claimed.
