# Desktop preferences

File > Options groups recovery settings, your author name, AI setup and computer
fonts in a single page. Related controls have consistent spacing and readable
labels; the recovery interval sits alongside its checkbox. Save and Cancel use
the shared Fluent buttons in a trailing action area that remains visible when
the dialog scrolls. The dialog follows Home's light/dark appearance and adapts
to narrow windows and right-to-left layout.

Recovery and author changes are applied with Save; Cancel keeps their existing
values. Computer font choices retain their separate immediate native-consent
behavior. Disabling them requires reopening the document to use only bundled
fonts, as the existing notice explains. No permission or save behavior changes
are introduced by this layout.

Opening Options focuses the recovery checkbox before asynchronous fields finish
loading. Closing restores the captured editor focus when it still owns the
document, while respecting a newer dialog, control or document.

The regression in tests/desktop/options-layout.cjs covers English, French and
Arabic under light/dark appearance at 1360, 800 and 400 CSS pixels. It checks visible
Save controls, label spacing, viewport bounds, text contrast, first focus,
Escape and actual Save/Cancel behavior for recovery and author settings.
Linux qualification uses public generated documents and a source renderer/style
overlay on the published desktop package. Native Windows/macOS appearance and
a fresh installer build are separate checks. Existing untranslated font guidance
in some locales is unchanged by this layout.

## Rename a local document

File > Rename presents the current name in a labelled field, with the name
selected for replacement. Enter submits the same action as Save; Cancel and
Escape close without renaming. Save is the primary Fluent action. Invalid names,
existing destinations and changed originals still use the existing filesystem
validation, and an unsuccessful rename leaves the field and its status visible.
A pending rename cannot be submitted twice.

The dedicated unit regression runs the production renderer handler. The actual
Linux package-overlay regression in tests/desktop/rename-dialog.cjs exercises
English, French and Arabic across light/dark appearance and three window sizes;
it also checks Enter, Cancel, Escape, invalid names and collisions against
disposable copies and compares their actual file bytes. This qualifies the
renderer/style change, not a newly built installer or native Windows/macOS UI.

## Recover documents at startup

The startup recovery dialog separates each document name and date from its
Restore and Discard actions. It focuses the first available Restore action,
or Cancel when no copy can be restored. Names use bidirectional isolation;
a malformed date is omitted without blocking the other copies.

Damaged or unavailable copies have an explanatory message and a generic
unavailable-copy label. They do not offer Restore. Cancel and Escape keep all
records; Discard removes only the chosen record. Restoring a valid copy opens
its saved contents and preserves the other recovery records.

The three new labels are translated in all 45 canonical desktop catalogs.
A missing, empty or invalid individual translation falls back to English
while retaining the selected language and direction. The existing storage,
validation, restore and removal backend is unchanged.

The regression checks public synthetic records in English, French and Arabic,
light/dark appearance and three window sizes, including real byte-for-byte
restoration, cancellation and precise removal. Native Windows/macOS appearance
and a newly built installer are separate acceptance checks.
