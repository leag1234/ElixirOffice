# Local document passwords (H1 review candidate)

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
original; No is the default and blocks conversion/writing. The reset-password
command uses the same confirmation. Normal Add/Change uses PasswordDialog and
requires matching password and repeat fields; no separate unconfirmed text field
is introduced. A converted copy does not
change the password retained by the original editing session. The existing
Protect document password command is enabled only for these six local editing
formats with protection permission; it encrypts on the successful save.
Encrypted PDF input/protection belongs to the separate PDF work, not H1.

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

## Converter and native validation

Historical H1 full release (superseded by the G1b matched pair): `528e920e4f34-2618710bdd8d-st`, manifest SHA256
`ae62a0a65577bb6385b38ce79a9b93f948195bd0ac5fe58fdb470d6f4bb57832`.
It was built with the W0 procedure from core `528e920e4f34`, product build
commit `ea6590a2ea52109e0c39629145dd682a967f3f50`, and ten recorded overlays.
The new overlay rejects a failed Office integrity check under `EO_WASM`;
native upstream conversion is unchanged. The H1-era PDF-only release
`528e920e4f34-a6337ac5034f-st` is historical. G1b initially replaced these with
full `528e920e4f34-b84bad726b86-st` and PDF `528e920e4f34-7e3dabf57ea2-st`.
The current pins are authoritative in `tools/wasm/runtime-release.json` and
`tools/wasm/pdf-runtime-release.json`, including the SDK default URL; the
MSG32 safety rebuild supersedes the initial G1b pair.
Current matched safety pair: full `528e920e4f34-bd14d110aa08-st`
(manifest SHA256 `0d97c1fcec3355ed9f5d43e52357d3dda197abe35d0ffc1a74c0a0cf17b73964`)
and PDF-only `528e920e4f34-98ab90f5d735-st`
(manifest SHA256 `d9f0109b81130dbadb9f1e8b99e0e024899844a0874784bfc1310bf8fd34d0c6`).

Native Office validation accepts bounded compound files with valid FAT,
directory and encryption-stream chains. ODF validation parses a bounded XML
manifest by namespace and entry, rejects comments/malformed XML as protection,
and refuses partially encrypted packages. These are structural checks; the
native process receives no password and cannot authenticate ciphertext. The
supported output producer is the pinned worker, which performs decryption and
Office integrity checks. Existing ZIP/object-loss, identity/conflict and atomic
write guards remain in the save path.

## Evidence and limits

The branch is rebased onto the lead's G1a product `15e3465` and DocumentServer
`2a5a99be1e` (web-apps `694ee1d46a`, integration `8e9aa2fc8d`). Shared changes
keep the PDF module, permissions and drawingfile export path.

- 104 desktop units and eight password/lifecycle state tests pass, including
  queued recovery writes, cleanup failure, malformed manifests, failed/delivered
  writes and post-conversion cancellation/error cleanup.
- Twelve actual-runtime groups cover all six formats in both web and desktop
  workers: required/wrong/correct password, encryption, change and removal,
  Unicode/XML characters and invalid/empty option rejection.
- Three Office HMAC-only mutations are rejected; untampered counterparts open.
  The previous full release accepted the mutations.
- The public strict corpus passes 38/38 normalized outputs and 76 conversions
  against the approved ODS/colour baseline (30 Editor.bin files identical).
- The production-bundle browser passes all six real edits, encrypted Save and
  password-protected reopen; common Keep/Change/Remove, normal Protect and PDF
  refusal dialogs pass. The two-chart ODS open/edit/save/reopen gate passes.
- Linux packaged six-format acceptance passes Cancel/Home/frame teardown,
  wrong-password retry, real edit, encrypted Save/reopen, native Save As
  Keep/Change/Remove, explicit PDF refusal/consent and PDF output, sticky recovery
  locking, and after-close profile scans for both random test passwords.
  The tested package uses product `116dd8f`, SDK `0657fbd`, web-apps `14f3933`
  and integration `cee25db`; its AppImage SHA256 is
  `7df4bb657c9013decc81def950cb746cdf72775a0ade00ca9a5af67b74ed37ef`.
  The later `5f8ab19` change adds the adjacent-backup filename to the existing
  late-filesystem-failure warning and unit/harness coverage. One earlier XLSX
  native-dialog timeout remains unclassified; a focused retry and the complete
  run passed after stronger dialog-dismissal synchronization. Failed attempts
  remain in the task evidence. The package's core source metadata was corrected
  after discovering an empty checkout, and its core licence was added; the
  actual wasm manifest always selected core `528e920e4f34`.
- Hosted candidate checks match the exact-base control: smoke has zero failed
  checks and five console 404s in both; Windows screen-top reports the same
  1122-to-1020 scrolling failure. Candidate shortcut counts are 227/1 Windows,
  171/0 Mac plus 14/13 reserved-browser passes. This is compatibility evidence,
  not an all-green hosted gate.

LibreOffice is absent on development host and no system packages were installed, so an
independent Office/LibreOffice interoperability check remains unverified.
Native Windows/macOS H1 behavior is also unverified. Independent review and lead approval are required before integration or
publication.

The rebuilt current-source review AppImage passes all 18,449 extracted resource
and licence hashes and the complete native Word password/Save As/PDF/profile
path (exit 0). Its SHA256 is
`994b8e39c77ba6444b1cbb6956c24f97691980d4f02df6373b909422eed24680`.
The six-format native acceptance remains bound to the preceding package above.

MSG28 review follow-up: desktop104 and lifecycle/state9 pass, including reset
removal refusal (no write, old password retained) and explicit consent (one
unprotected write). Real UI harnesses include the new confirmation; this small
follow-up warning has not had a separate browser/native GUI rerun.
