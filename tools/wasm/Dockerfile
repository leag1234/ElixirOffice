# SPDX-License-Identifier: AGPL-3.0-only
# Build environment for x2t.wasm: the official Emscripten image plus the few
# tools the core build and the size report need.
FROM emscripten/emsdk:5.0.4
RUN apt-get update \
 && apt-get install -y --no-install-recommends ccache ninja-build brotli zip \
 && rm -rf /var/lib/apt/lists/*
