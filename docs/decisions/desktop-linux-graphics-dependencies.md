# Declare the Linux graphics runtime interfaces

Status: proposed for release review.

Electron requires both directly linked libraries and interfaces loaded at runtime. Successive clean-install audits exposed missing ALSA first and then GBM; build 13 resolved ALSA automatically but still lacked libgbm.so.1. An earlier audit after installing Xvfb concealed GBM, so dependency qualification must precede all test tooling.

Keep the builder's existing Debian dependencies and explicitly add ALSA (with the t64 alternative), GBM and the GL, EGL, GLES and OpenGL dispatch interfaces. These are system runtime libraries used by the existing Electron application. Their package dependencies select compatible graphics implementations; this does not bundle a new rendering framework.

The exact local electron-builder 26.15.3 defaults used with Electron 44.7.0 omit ALSA and GBM. The independently retrieved community [AUR package](https://aur.archlinux.org/packages/elixiroffice-bin) (0.2.4-1) declares 33 dependency groups, including Mesa and libglvnd. Each group's relevant runtime providers was checked against Ubuntu 26.04 metadata and the official [Debian 12](https://deb.debian.org/debian/dists/bookworm/main/binary-amd64/Packages.xz) and [Debian 13](https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.xz) indexes.

| Interface | Ubuntu 26.04 / Debian 13 | Debian 12 |
| --- | --- | --- |
| ALSA | libasound2t64 | libasound2 |
| GBM | libgbm1 | libgbm1 |
| GL / EGL | libgl1, libegl1 | libgl1, libegl1 |
| GLES / OpenGL | libgles2, libopengl0 | libgles2, libopengl0 |

The graphics closure also supplies DRM, GLX and X11/XCB integration transitively. The existing GTK/NSS dependencies supply the other audited interfaces. Hardware-specific Vulkan, video, input-method and desktop-service plugins discovered on a fully provisioned host are not all mandatory application dependencies. A host trace alone cannot establish what a minimal installation needs.

In the diagnostic minimal container, all six packaged ELF files reached zero missing dependencies after adding GBM; the GL dispatch candidates were installed before adding only Xvfb and xauth. Chromium then hit a container namespace EPERM before CDP. A host diagnostic with the frozen executable/resources and a different system sandbox helper reached the editor and opened a public DOCX with zero page errors; SIGSEGV was observed during subsequent cleanup, with cause unclassified. These results do not certify a clean native package. Require a fresh installation of the reviewed DEB and separately record the final native gates before claiming qualification.

Final DEB dependency qualification requires a normal apt/dpkg installation, fixed-point ldd, dlopen/LD_DEBUG checks and Arch/Electron dependency cross-checks against the final build identity. The minimal-container namespace EPERM and different-helper host diagnostics do not establish a clean native start.
