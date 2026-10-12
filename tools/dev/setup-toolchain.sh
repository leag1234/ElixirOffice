#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Run inside the dev container (make dev-tools), idempotent. The core C++ build
# (V8, 3rdParty, x2t; `make core/x2t`) needs clang, lld and the unversioned llvm-* tools
# (llvm-ar...), which the upstream dev image does not ship; they are lost when the
# container is recreated, so `make up` reinstalls them.
set -eu
# /build is a host directory (other owner): git refuses its V8 checkout otherwise
git config --global --get-all safe.directory | grep -qx '*' || git config --global --add safe.directory '*'
if command -v clang >/dev/null 2>&1 && [ -e /usr/bin/llvm-ar ]; then echo "toolchain: present"; exit 0; fi
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq clang lld llvm >/dev/null
# llvm-ar-18 -> llvm-ar, etc. (the V8 build calls the unversioned names)
for f in /usr/bin/llvm-*-[0-9]*; do
  b=${f##*/}; l=${b%-[0-9]*}
  [ -e "/usr/bin/$l" ] || ln -s "$b" "/usr/bin/$l"
done
echo "toolchain: installed"
