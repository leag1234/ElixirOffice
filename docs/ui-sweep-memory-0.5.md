# Word UI sweep memory investigation — 0.5

Status: investigation pending; no production fix. Lead disposition: bus release review,
2026-10-29. The cause of the retained growth is not established.

## Observed failure

The corrected context-menu harness ran against its owned Linux server instance,
using SDK 2bfc742e on integrated 1d83570 and product 0ba2696. AI was unconfigured;
opening its setup dialog did not make a provider request. Inputs were public
synthetic documents and public test fixtures.

The continuous Word sweep recorded 330 passed **click checks**, across 23 completed
contexts, before its final, 24th context (footnote) lost the browser. This was
not 330 scenarios. At 10:31:22 Europe/Paris the kernel identified a memory-cgroup
OOM in the owned test service. The killed Chromium process reported 3,972,528 KiB
anonymous RSS; its process group was limited to 4 GiB with no swap. Systemd's
reported 675.6 MiB peak does not describe that kernel-observed process peak and
must not be used to deny the OOM. The unit's OOMPolicy stopped the remaining
batch before Cell, Slide and shortcut qualification.

The original failing log, kernel receipt and source provenance remain outside
Git in the task evidence; see bus validation report and:

    /srv/elixiroffice/wt/html-dialog-harness-A-work/word-oom-kernel.log

The full-run result stays failed. There is no matched full-run memory baseline
and no evidence yet assigning responsibility to the harness, SDK policy,
dialog lifecycle, history, rendering caches or another component.

## Functional qualification is separate

The current workaround schedules the existing 48 contexts (Word 24, Cell 15,
Slide 9) in 13 groups of at most four through the original --only option, with
fresh browsers and unchanged assertions, source skip rules and 4 GiB limit.
This establishes functional coverage when those groups pass. It does not fix
or qualify memory growth in a continuous editing session. The lead accepted
this separation for the small dialog-harness/policy candidate.

## Proposed investigation

Use a dedicated owned Linux instance, public synthetic inputs, fixed font mode
and AI off. Retain the existing process-tree CPU, 4 GiB memory, zero-swap and PID
limits.

1. Reproduce the original scenario sequence with the integrated SDK and candidate
   separately. Keep input, browser, server, fonts and action order fixed; record
   source/binary hashes and every failed run.
2. At fixed action counts record owned process-tree RSS, JS heap, DOM node and
   listener counts, live dialogs, editor/history/image/font cache counts, workers
   and the active document lifecycle. Record counts rather than document text,
   font bytes, credentials or input values. Include browser/renderer/GPU PIDs.
3. Separate text-only reset cycles, setup-open/Cancel cycles, drawing/clipboard
   cycles and the original full sequence. Compare resetting one document with
   closing it and opening a fresh one in the same browser, then with restarting
   the browser. This distinguishes retained harness/editor history from a
   process-wide cache or leak.
4. If forced GC is used diagnostically, predeclare its checkpoints and keep both
   before/after measurements plus the unforced arm. It is not a production fix
   or a substitute for the normal memory qualification.
5. Reduce the first sustained growth to a small public reproducer; determine
   which references retain the objects before proposing a narrowly scoped fix.

Acceptance for a future fix requires an explained reproducer, a meaningful
regression test and the complete original continuous Word sequence under the
existing 4 GiB budget. Fresh-browser functional results alone are insufficient.
