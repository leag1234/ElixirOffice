# Local document passwords

Desktop and browser convert-locally mode support encrypted DOCX, XLSX, PPTX,
ODT, ODS and ODP using the full pinned x2t runtime. Hosted password handling
and hosted editing/revision permissions keep their existing paths.

Opening an encrypted document shows the normal masked password dialog. A
wrong password permits a retry; Cancel ends opening and clears the local
password state. Desktop returns to Home. Passwords must be nonempty, at most
255 UTF-16 code units, valid Unicode and representable in the conversion XML.
Spaces are preserved. XML punctuation and supplementary Unicode are escaped
and tested. Empty-password encrypted files are unavailable locally: Office
inputs that open without an explicit password fail closed; the pinned ODF
reader rejects any encryption map when its password is empty before decrypting.

Desktop Save writes the current file with its current password. Browser Save
downloads an encrypted copy with the current format/name; it does not silently
overwrite the original browser-selected file. Save As on a protected document
offers Keep, Change and Remove. Change uses the normal password/repeat dialog;
Remove explicitly requests an unprotected output. Before saving that removal,
a separate warning explains that an unprotected file may overwrite the encrypted
original; choosing No blocks conversion/writing. The reset-password
command uses the same confirmation. Normal Add/Change uses PasswordDialog and
requires matching password and repeat fields; no separate unconfirmed text field
is introduced. A converted copy does not
change the password retained by the original editing session. The existing
Protect document password command is enabled only for these six local editing
formats with protection permission; it encrypts on the successful save.
Encrypted PDF input/protection belongs to the separate PDF implementation.

## Persistence and recovery

Password strings travel only from the local dialog to the conversion worker
and its in-memory XML/filesystem. They are excluded from logs, progress/stats,
settings, native IPC and browser staging. Workers are terminated after each
conversion; job fields and dialog fields are cleared, and disposing or failing
an open clears the private session reference and restores password API hooks.
This is reference cleanup, not a claim of secure erasure of JavaScript memory.

AutoRecover is disabled for the entire session once encryption/password
protection is encountered or requested, including after Remove. Desktop closes
the native recovery gate synchronously, invalidates pending snapshots, drains
its existing write queue and removes only this session's known active recovery
copy before acknowledging the lock. Cleanup failure remains locked and blocks
protection. Ordinary unprotected recovery remains available. The desktop shows
a persistent explanation of the disabled recovery policy.

PDF, printing and other unprotected copies require an explicit confirmation
when the active document is protected. The native bridge also requires the
unprotected-copy intent; export cannot bypass the renderer confirmation by
omitting it. A successfully written file commits the new password state even
if cancellation arrives while writing. Failed writes retain the old state.
A recents-settings failure after replacement is nonfatal. If the existing
atomic writer reports replacement but cannot confirm durability, the native
password path verifies destination bytes, acknowledges their actual state and
shows a durability warning; it retains the writer's original backup. If the
replacement cannot be verified it reports failure. This does not erase old
plaintext files, existing historical copies or the atomic writer's safety
backup after a late filesystem failure.

## Language and confirmations

Password choices, the password and confirmation fields, and warnings before
exporting an unprotected copy or removing protection use the editor’s language. Keep retains the current
password, Change opens the password and confirmation fields, and Remove
requests an unprotected output. If a translation cannot be loaded, readable
English wording remains available.

An unprotected document saves or copies directly without a password-choice
dialog. Use the Protect document command to add a password.

No or Cancel keeps the existing protection and stops the operation. A failed
save retains the prior password. Removing protection from a separate copy
does not change the original editing session’s password.

## Validation scope

The conversion and persistence safeguards remain in place. Historical
runtime, browser and platform checks, with their limits, are retained in
the validation record.
