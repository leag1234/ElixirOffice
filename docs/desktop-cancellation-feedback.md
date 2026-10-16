# Desktop cancellation status: 0.2.1 review backport

[Public issue 2](https://github.com/leag1234/elixiroffice/issues/2) reports a white
Cancel bubble remaining after cancelling Save/Print. The error handler used
the translated button caption as an indefinite status. The one-line fix clears
transient feedback through the existing status function, preserving the
password-protection recovery warning and actual output errors.

Six tests execute the real renderer handlers for Save, wrapped Electron IPC,
PDF output, abort and structured cancellation, followed by permission errors;
the recovery warning survives. All six fail on frozen Product dd042fbc48 and
pass after the fix. Desktop units 212/212 pass with public asset/builder
fixtures. Run node --test tests/desktop/cancellation-feedback.test.cjs.

Shared tooltips/dialogs, converter and runtime pins remain unchanged.
DS 09516bf9c8/Web 26f3977f5a/SDK 46dfd9b4dc stay frozen. No zoom change, native
Arch/niri/Wayland qualification, packaging or release action.
