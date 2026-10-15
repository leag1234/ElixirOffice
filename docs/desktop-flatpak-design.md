# Current release version

MSG38 supersedes the original version/tag proposal below: desktop version 0.2.0, public title ElixirOffice 0.2.0 beta (desktop), pre-release tag v0.2.0. Original 0.1.0 preview receipts remain historical; the final bundle must be rebuilt from the integrated version-bump commit.

# Flatpak F0: desktop update study

Study only (MSG30, 2026-10-13); no build, installation or Flathub submission. Base productf45f0a2 / DS6d581e, Electron44.7.0 / electron-builder26.15.3. Await the integrated A G1b source and final combined full/PDF runtime pair.

## Recommendation and build inputs

Use a hand-written Flatpak manifest wrapping the exact pipeline-produced Linux unpacked app, rather than accepting electron-builder's Flatpak defaults. Keep the existing app ID **org.elixiroffice.desktop**, branch **beta**, command wrapper using **zypak-wrapper**. Use org.freedesktop.Platform and org.freedesktop.Sdk with org.electronjs.Electron2.BaseApp. The maintained Electron sample currently selects25.08 for runtime/BaseApp; treat that as a candidate, verify Electron44 ABI/dependencies, record exact OSTree commits and reject moving inputs before building. No unverified branch/commit is a final pin. [Official sample](https://github.com/flathub/org.flathub.electron-sample-app/blob/master/org.flathub.electron-sample-app.yml).

| Route | Benefit | Cost/decision |
| --- | --- | --- |
| electron-builder --linux flatpak | Existing package integration, app ID/icon/desktop entry and single-file artifact | Installed26.15.3 generates20.08 runtime/BaseApp, home filesystem and network permissions unless overridden; requires builder tools anyway. It does not solve portals or the atomic writer. |
| Hand-written manifest over pinned unpacked app | Reviewable permissions, source archive SHA, runtime/BaseApp commits, metadata and wrapper; no duplicate editor build | Small packaging module/driver extension and acceptance work. Recommended. |

Local installed FlatpakTarget.js confirms those defaults and the zypak wrapper. Single-file output is also described by [electron-builder](https://www.electron.build/docs/flatpak/). Do not copy its home/network defaults. Preserve Electron renderer sandboxing; do not add --no-sandbox or unrestricted host-spawn access as a shortcut.

Source inputs: exact integrated product/DocumentServer/submodule revisions, package lock, Electron44.7.0 and its cached checksum, hashed assembled resources/licences, both announced x2t manifest/six-artifact sets, Linux unpacked archive SHA, manifest/wrapper/metadata SHA, builder image digest and Flatpak OSTree commits. Reuse corresponding-source/privacy audits. Prestage verified SDK/BaseApp/runtime and source caches; actual build disables downloads and has no build network permission. Offline construction means cached prerequisites, not automatic first-time availability. [Builder reference](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html).

## Sandbox and application gaps

Start with display X11/Xwayland, shared IPC, GPU DRI and PulseAudio for existing slide audio; add native Wayland only after a separate gate. These are explicit display/media accesses, not a complete isolation claim. No --filesystem=host/home, blanket Documents grant, network, unrestricted session/system bus or org.freedesktop.Flatpak host-spawn permission. Portals provide document selection, print and external links. [Electron guidance](https://docs.flatpak.org/en/latest/electron.html), [permissions](https://docs.flatpak.org/en/latest/sandbox-permissions.html).

Open/Save As must use the real FileChooser portal with the live session bus; never fall back silently to a nonportal chooser inside the restricted sandbox. Electron documents portal-specific default-path limitations; installed linux portal1.8 versions need a real compatibility test with our Electron version. Desktop launch needs file forwarding (Flatpak --file-forwarding with @@u %U @@), so only explicit selected/associated files become accessible; raw host CLI paths are not blanket grants. Drag/drop must prove its selected-file access or give a clear error and use Open. [Electron dialog](https://www.electronjs.org/docs/latest/api/dialog), [FileChooser](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.FileChooser.html).

**Required first F1 gate: atomic Save through the document portal.** files.cjs creates a sibling temp and backup, renames into the target, fsyncs its directory, and Rename uses hard links. A portal file grant is not evidence that all those operations or stable inode/conflict checks work. Test all against an actual portal-selected synthetic file, including repeated Save and cleanup failure. If unsupported, design a narrowly granted user-selected folder/portal-aware transaction with preserved conflict/backup guarantees and explicit consent; do not weaken atomic saving or broaden to home/host. Recent grants must also survive restart or trigger a new chooser. The document portal exposes selected entries through FUSE; directory-export support varies by interface version. [Documents](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Documents.html). This compatibility is unverified, not a proved failure.

Use Flatpak's read-only host-font mounts /run/host/fonts, /run/host/local-fonts and /run/host/user-fonts instead of direct host-directory permissions. Current desktop/fonts.cjs scans ordinary Linux paths, so F1 needs a small Flatpak-specific roots hook plus canonical containment checks. Retain Options consent before custom font enumeration/read and revoke cached font data. The OS mount itself is available independently of our application consent; do not describe the consent as removing that mount. Bundled editor fonts remain the default. [Font integration](https://docs.flatpak.org/en/latest/desktop-integration.html).

Default package has no network permission. Local editing/PDF/Help/spelling use bundled assets. Optional AI requires a deliberate per-launch --share=network or per-app override and existing application endpoint/key/consent; never auto-grant it. Without network, a configured AI request cannot succeed. Current UI does not distinguish this Flatpak capability: F1 should show an unavailable-in-offline-sandbox explanation or document the existing failure rather than promise working AI. External Ctrl+click uses shell.openExternal through OpenURI/xdg-open portal, launching the host handler even when the app has no network; never flatpak-spawn --host.

Normal app config/data/cache/recovery live under ~/.var/app/org.elixiroffice.desktop/ via Flatpak XDG variables; Electron's existing userData-based settings/recovery should follow them, to be proved. H1 protected-session recovery remains disabled. Help stays eoapp/local assets; native print needs the Print portal, including Cancel and an explicit separate physical-print limitation. [Command reference](https://docs.flatpak.org/en/latest/flatpak-command-reference.html).

## Metadata, deliverable and gates

Export org.elixiroffice.desktop.desktop, matching icon and AppStream metainfo under the app prefix. Reuse existing file-format inventory and add application/pdf explicitly to the Linux MimeType list (fileAssociations already has pdf; the current Linux explicit list omits it). Use portal-forwarding Exec, Office categories, AGPL-3.0-only project licence, accurate third-party notices, synthetic screenshots, release version0.1.0/tag beta3 and release notes; validate metadata. No invented new MIME types or Flathub submission.

Deliver ElixirOffice-0.1.0-x86_64.flatpak with SHA256/size, exact build info and corresponding source alongside AppImage/.deb. Installation is flatpak install --user <bundle>. A single bundle excludes its runtime dependencies and repository AppStream catalogue; first installation may need a trusted runtime repository or separately staged offline runtime. Keep app metainfo in its payload and explain the distinction. Offline application use is not a promise of dependency-free offline installation. [Single-file bundles](https://docs.flatpak.org/en/latest/single-file-bundles.html).

Acceptance: extracted resource/licence checks and no-network/least-permission metadata; actual portal open/edit/atomic save/fresh reopen/PDF all6 formats, native Save As/rename/conflict, Help3, ordinary recovery3, H1 protected recovery lock/Keep/Change/Remove/PDF consent and password-profile scan, font consent/disable, file associations/CLI/drop, Ctrl+click, print Cancel. Successful physical printing remains separate. Current tests/desktop/harness.cjs sets GTK_USE_PORTAL=0 and a nonexistent session bus: it cannot establish Flatpak portal acceptance. Add an explicit owned Flatpak harness mode and keep the AppImage tests intact.

## Tools and permission boundary

| Host | Read-only inventory | Needed next |
| --- | --- | --- |
| development host | Docker and bwrap; flatpak and flatpak-builder absent | Packaging builder environment, cached runtimes/BaseApp and namespace support |
| build-host | Docker28.1.1; flatpak, flatpak-builder and bwrap absent | Prefer an owned digest-pinned builder container outside prod; Flatpak, builder, bubblewrap, OSTree and required build dependencies inside that container. Nested namespace/FUSE feasibility must be proved, no privileged launch proposed. |
| linux | Flatpak1.12.7,bwrap,Docker; builder absent; xdg-desktop-portal1.8.1 and gtk1.8.0 installed | Native portal acceptance; builder optional. Its old portal compatibility is unverified. |

No system package installation is needed for F0 and none was done. F1 options: approve the dedicated build-host builder container, or an isolated user installation of the Flatpak-packaged builder on linux. [Builder distribution](https://docs.flatpak.org/en/latest/flatpak-builder.html). No runtime/Builder download or install has been attempted. Native host installation of flatpak/flatpak-builder would need separate lead approval.

The strict linux rule permits only /srv/elixiroffice/bench/. FLATPAK_USER_DIR can relocate the user installation there, but ordinary flatpak run also creates ~/.var/app and portal permission records outside it. Do not claim a custom user install alone satisfies that rule. Before F1 acceptance, prove fully isolated application/portal storage under the owned root, or obtain a narrow lead-approved exception for this app's new data/portal records; never inspect or change other existing home data. No Mac build or installation is needed for Flatpak.

F0 source/tool inventory and official documentation only. Builder/container feasibility, runtime commits, portal transactions and packaged smoke remain unverified. Wait for lead F1/environment decision and release-build go.

Independent F0 design review approves study only: owned review-flatpak-F0.md SHA256181a90771f0fd2defb81b99a504f8b5ac80fa900c72d4c9c4f07bb17aaa233f9. No build/release authorization.

## F1 working-branch preview, 2026-10-13

Build-only approval subsequently allowed immutable A G1b working-branch preview inputs. Full b84bad726b86/PDF7e3dabf57ea2 share the same core/build recipe and eleven overlays; D password integrity3 and worker12 passed against that full runtime. The preview is not an integrated release.

An isolated digest-pinned non-root Docker builder, two CPUs/four GiB, no network/capabilities, unchanged default AppArmor and a targeted namespace seccomp profile was used for initialization and finish. build host kernel5.4 lacks genuine mount IDs needed by the build security check; development host kernel7.0 permits that check but its profile blocks nested Bubblewrap mounts. Neither host policy nor a validator was weakened. Plain prebuilt assembly succeeds; export1.14.10 still sandboxes its icon validator. Explicitly approved export-only operations in an owned linux release root with Flatpak1.12.7 produced a bundle. No owner installation, app launch, remotes, portals or settings were changed.

Preview `ElixirOffice-0.1.0-x86_64-BRANCH-PREVIEW.flatpak`:382630040bytes, SHA25604e195a36925110a886587bde63a99b95a3a308afcb483ed2f9fe6d792be6838; export commit a11534c91f61d4ef6364347946eada8a74fe9137c3fcd76552eae866f24b25f9. Private OSTree import exit0 preserves that exact commit, but emits retained GLib/OSTree null-remote critical diagnostics; it is not a clean-log claim. Actual imported metadata exactly matches the manifest and rejects excess permissions;18414resource/licence checks and all18721payload/BaseApp files/link targets match, executable bits retained, no setuid/setgid files. AppStream relaxed non-network and desktop validators pass; builder-lint is unavailable. No host/home/network grants. Metadata screenshots remain provisional.

Final integrated-source rebuild, user installation, six-format portal transactions, recovery/password policy, Help, fonts consent and mapping, AI-without-network explanation, associations, print and other native gates remain unverified. No final release, integration or publication is claimed. Packaging source and exact receipts are ready for lead review.
