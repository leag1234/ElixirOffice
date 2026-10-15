# SPDX-License-Identifier: AGPL-3.0-only
FROM debian@sha256:a4672c0cb26fbdde88e38fa2dfb6c681942306680e41e4378b28770b6e79ee91
RUN apt-get update && apt-get install -y --no-install-recommends flatpak flatpak-builder bubblewrap ostree dbus appstream-util desktop-file-utils ca-certificates python3 xz-utils zstd fuse3 gcc libc6-dev && rm -rf /var/lib/apt/lists/*
RUN useradd --uid 1000 --create-home builder && mkdir -p /work && chown builder:builder /work
COPY close-range-fallback.c /tmp/close-range-fallback.c
RUN mkdir -p /opt/eo-builder && cc -shared -fPIC -O2 -Wall -Wextra -Werror /tmp/close-range-fallback.c -o /opt/eo-builder/close-range-fallback.so && rm /tmp/close-range-fallback.c
USER 1000:1000
WORKDIR /work
ENV XDG_DATA_HOME=/work/data XDG_CONFIG_HOME=/work/config XDG_CACHE_HOME=/work/cache FLATPAK_USER_DIR=/work/flatpak
