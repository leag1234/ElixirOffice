<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Windows document and font access

When Windows temporarily refuses a save because another process is inspecting or locking a file, ElixirOffice retries with a shared five-second window and keeps the saving indicator active. The app remains responsive during the wait. Administrators can set `EO_WINDOWS_SAVE_RETRY_MS` to an integer from 0 to 15000 milliseconds; an invalid value uses the five-second default.

If replacement is still refused, an existing regular file with a verified backup can use a final in-place save. ElixirOffice verifies the original, backup and staged output before opening the original for writing, writes all output bytes before truncating, synchronizes the file, and checks the final size and hash before removing the backup. New destinations and files with multiple hard links do not use this fallback.

If an in-place write fails, the app attempts to restore the original only while the target path and open handle still identify the original file with one link. A verified restoration removes its backup. A failed or unsafe restoration retains the original backup and shows a translated warning with its file name, without exposing the folder path. Keep that backup when recovering the original document. Closing the app waits for the warning to be acknowledged; if the warning cannot be displayed, the window stays open. A failed save does not mark the document as saved.

The fallback cannot provide atomic replacement across a crash, power loss or failed restoration. Its recovery guarantee is the retained original backup; the target may be incomplete if restoration cannot finish. Detected external changes stop replacement or restoration. Use Save As if another application keeps the file locked or is changing it.

Cancel interrupts a pending retry. A forced close waits for active writes to finish cleanup or restoration, and blocks queued writes while closing. If closing is abandoned, new writes become available again. A close timeout keeps the window open while cleanup finishes.

AutoRecover uses the same guarded save strategy. A failed save does not prevent a later save, document open or recovery attempt once the file is available. An optional failure to update recent-file preferences does not invalidate a successful document save.

## Computer fonts

Computer fonts follow the desktop font permission setting. ElixirOffice searches system and per-user font folders, including `%LOCALAPPDATA%\Microsoft\Windows\Fonts`, and exact local font files registered with Windows. It skips unreadable or unsupported files and continues with readable fonts. Registered files do not authorize scanning their parent folders. Remote UNC paths and device-namespace registry entries are rejected.

Registry discovery runs once when building the font index. If the bounded PowerShell query is unavailable, fixed `reg.exe query` commands read the current-user and machine font keys. A failed hive or malformed record does not discard healthy records from another hive or the same response. Queries use fixed arguments without a command shell.

The scan briefly retries temporary Windows read refusals within a shared one-second window. A later individual font read has its own one-second window. Directory links cannot send the scan outside approved folders or trap it in a loop. Redirected registered-file paths are rejected. A font changed since it was listed is rejected until the list is refreshed.

If no readable fonts are available, the app reports that computer fonts are unavailable. It continues to use available bundled fonts. The desktop index keeps its background worker, private cache, memory and scan limits, content checks and permission-revocation behavior. An unreadable optional cache can be rebuilt from readable fonts.

The local diagnostic log records fixed stage and filesystem error codes for consent, listing and reading. It does not record document paths, font paths or error-message contents. File permissions, cloud availability and locks held by other applications can still require action on the computer.

## Repeated document saves

Windows needs write access to flush a saved backup. ElixirOffice opens that backup with write access before flushing, so a second or later save does not fail merely because the backup was opened read-only. AutoRecover and preference writes use the same correction. Genuine backup-access or flush failures still stop before changing the original. Linux/macOS keep equivalent save behavior and their existing directory synchronization.
