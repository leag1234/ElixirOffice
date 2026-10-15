#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
[ "$(uname -s)" = Darwin ] || { echo "Build the DMG on macOS" >&2; exit 1; }
[ "$(uname -m)" = arm64 ] || { echo "This preview targets an Apple Silicon build host" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${MAC_BUILD_CACHE:?isolated cache folder}"
[ "$(node -p process.versions.node)" = 22.23.3 ] || { echo "Select the verified portable Node22.23.3 in PATH" >&2; exit 1; }
mkdir -p "$MAC_BUILD_CACHE"
MAC_BUILD_CACHE="$(cd "$MAC_BUILD_CACHE" && pwd)"
mkdir -p "$MAC_BUILD_CACHE/home" "$MAC_BUILD_CACHE/tmp"
env -i HOME="$MAC_BUILD_CACHE/home" TMPDIR="$MAC_BUILD_CACHE/tmp" PATH="$PATH" \
  python3 "$ROOT/tools/desktop/build-python.py" "$ROOT" "$MAC_BUILD_CACHE"
export PATH="$MAC_BUILD_CACHE/python/bin:$PATH"
python3 "$ROOT/tests/desktop/verify-resources.py" "$ROOT/desktop/assets"
python3 "$ROOT/tests/desktop/check-samples.py" "$ROOT/desktop/assets"
mkdir -p "$MAC_BUILD_CACHE/home" "$MAC_BUILD_CACHE/tmp"
cd "$ROOT/desktop"
env -i HOME="$MAC_BUILD_CACHE/home" TMPDIR="$MAC_BUILD_CACHE/tmp" PATH="$PATH" \
  ELECTRON_BUILDER_CACHE="$MAC_BUILD_CACHE/builder" CSC_IDENTITY_AUTO_DISCOVERY=false \
  npm ci --cache "$MAC_BUILD_CACHE/npm"
env -i HOME="$MAC_BUILD_CACHE/home" TMPDIR="$MAC_BUILD_CACHE/tmp" PATH="$PATH" \
  ELECTRON_BUILDER_CACHE="$MAC_BUILD_CACHE/builder" CSC_IDENTITY_AUTO_DISCOVERY=false \
  npm run test
env -i HOME="$MAC_BUILD_CACHE/home" TMPDIR="$MAC_BUILD_CACHE/tmp" PATH="$PATH" \
  ELECTRON_BUILDER_CACHE="$MAC_BUILD_CACHE/builder" CSC_IDENTITY_AUTO_DISCOVERY=false \
  node "$ROOT/tools/desktop/mac-licenses.cjs" "$MAC_BUILD_CACHE/electron"
env -i HOME="$MAC_BUILD_CACHE/home" TMPDIR="$MAC_BUILD_CACHE/tmp" PATH="$PATH" \
  ELECTRON_BUILDER_CACHE="$MAC_BUILD_CACHE/builder" CSC_IDENTITY_AUTO_DISCOVERY=false \
  npm run package:mac
