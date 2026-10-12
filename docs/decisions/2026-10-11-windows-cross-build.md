# Windows installer cross-build toolchain

The owner requires unsigned Windows x64 NSIS installers built on Linux before a Windows PC/VM is available. The prepared configuration fails with spawn wine ENOENT when generating the uninstaller. The existing electron-builder26.15.3 bundled Wine toolset1.0.1 downloads with its verified SHA256 but fails because its x86_64-windows/ntdll.dll path is absent. An explicit WINEDLLPATH probe also fails; both attempts and the loader trace are retained.

Use the official electronuserland/builder:22-wine image, pinned as electronuserland/builder@sha256:b226b27b1a7e95ad25eb3d6414ea90c56c04eb6d8329967f4d721dce50b989ff. It supplies Node22.22.2 and Wine11; the application remains Electron44.7.0 and electron-builder26.15.3 from the lockfile. The 6.32GB development image is not shipped. This larger isolated toolchain is justified by the failed smaller bundle and avoids installing system Wine or disabling executable metadata editing. The official v26 cross-build guide recommends this Wine image: https://www.electron.build/v26/docs/features/multi-platform-build/.

Run as the invoking user, mount only the owned fresh worktree and its separate cache, and forward only the explicitly listed non-secret build variables. No .env, SSH keys, Docker socket, home directory or signing credentials are mounted. The installer build needs outbound package/artifact downloads; the shipped app's network policy stays unchanged.

The unsigned preview explicitly skips signing while retaining product/version/icon/asar-integrity resources. Cross-build/payload checks do not establish native Windows installation, file associations, dialogs, fonts, privacy or SmartScreen acceptance; those await the owner host. Signing later uses owner certificates outside Git.
