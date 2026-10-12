#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Build only: the owner accepts native Windows behavior on a real PC/VM later.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${WINDOWS_BUILDER_IMAGE:?immutable electronuserland/builder image digest}"
: "${WINDOWS_BUILD_CACHE:?isolated writable build cache outside source}"
[[ "$WINDOWS_BUILDER_IMAGE" =~ ^electronuserland/builder@sha256:[0-9a-f]{64}$ ]] || { echo "Pin the Windows builder image by digest" >&2; exit 1; }
[ -f "$ROOT/desktop/assets/desktop-manifest.json" ] || { echo "Assemble desktop assets first" >&2; exit 1; }
python3 "$ROOT/tests/desktop/verify-resources.py" "$ROOT/desktop/assets"
mkdir -p "$WINDOWS_BUILD_CACHE/home"
WINDOWS_BUILD_CACHE="$(cd "$WINDOWS_BUILD_CACHE" && pwd)"
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$ROOT,dst=/project" \
  --mount "type=bind,src=$WINDOWS_BUILD_CACHE,dst=/work" \
  --workdir /project/desktop \
  --env HOME=/work/home --env ELECTRON_BUILDER_CACHE=/work/builder-cache \
  --env CSC_IDENTITY_AUTO_DISCOVERY=false --env USE_SYSTEM_WINE=true \
  --entrypoint /bin/bash "$WINDOWS_BUILDER_IMAGE" \
  -c 'set -euo pipefail; npm ci; npm run test; npm run package:windows'
