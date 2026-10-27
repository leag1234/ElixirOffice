# Windows update-store lock design

## Scope and invariant

The update cache has one persistent `guard-v2` file. Ownership is the kernel-held open-file lock, not the pathname or file contents. The file is never deleted. A second process must fail immediately while the first handle is open, and the lock must disappear automatically when the owning process exits or crashes. Linux continues to use the existing verified `/usr/bin/flock --exclusive --nonblock 3` path without a fallback.

## Windows primitive

Electron 44.9.1 embeds Node 24.22.0 and libuv 1.52.1. In that exact libuv source, `UV_FS_O_EXLOCK` is `0x10000000`; `uv_fs_open` maps it to a Windows `CreateFileW` open with no sharing. Node passes numeric filesystem flags to libuv even though it does not export this flag in `fs.constants`. The Windows guard open therefore adds the numeric flag only after an exact Node/libuv runtime check. Any platform, version, open, ownership, inode, link, ACL, flush or close mismatch fails closed. There is no `O_EXCL` pathname lease, retry, stale-file deletion, PID recovery or advisory fallback.

The flag must be present on the first and only open of `guard-v2`; applying it after `fs.open` would be too late. The existing post-open identity and Windows ACL checks remain mandatory. Releasing closes the held handle once. Process death lets Windows close it automatically.

## Qualification

Unit tests call the exact-runtime gate directly for accepted and rejected identities, and use an I/O recorder to prove the store passes its actual `process.versions` and puts `0x10000000` on the first guard open. They also prove runtime drift is rejected before opening and the persistent guard is preserved. A source test binds the numeric value and no-share behavior to the pinned Node/libuv source supplied explicitly to the test. Linux lock tests pin the existing helper invocation and demonstrate concurrent refusal plus crash release unchanged.

A Windows-only native script must run with the packaged Electron/Node runtime in the owner window. It creates an owned private cache, proves first holder success, simultaneous second-process refusal, success after graceful close, refusal while a child holds the lock, and success after that child is terminated. It records runtime versions and fixed verdicts only. Every parent release and exact spawned child is tracked; readiness must be exactly `LOCKED`, early exit and child errors fail, the body is bounded to 90 seconds, cleanup has one shared additional 30-second budget, each individual wait is limited to 15 seconds, and failure cleanup releases parent handles and terminates and reaps owned children before cache removal. Production `nsis` policy remains false until that native receipt is reviewed.

## Reproduction commands

The source verifier is explicit and never searches the host:

```sh
EO_NODE_SOURCE=/absolute/path/to/node-v24.22.0 node tests/desktop-updates/windows-update-lock-libuv-source.cjs
```

The native gate requires an empty test-owned directory whose ACL grants access only to the current user, Administrators and SYSTEM. Run the script with the packaged Electron runtime in Node mode:

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
$env:EO_WINDOWS_LOCK_ROOT='C:\absolute\private\empty-test-root'
& 'C:\path\to\ElixirOffice.exe' tests\desktop-updates\windows-update-lock-native.cjs
```

The expected output is one JSON object with `verdict: PASS`, Node 24.22.0, libuv 1.52.1 and five checks. Any other result keeps Windows updates closed.
