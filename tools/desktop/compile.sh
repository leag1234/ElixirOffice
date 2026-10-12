#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Compile only the caller's isolated source checkout; preserve pinned wasm bytes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${UPSTREAM:?isolated DocumentServer checkout}"
: "${OUTPUT:?new build output directory}"
: "${FULL_RUNTIME:?manifest-verified full release directory}"
: "${PDF_RELEASE:?manifest-verified PDF release directory}"
[ ! -e "$OUTPUT" ] || { echo "Choose a fresh build output directory" >&2; exit 1; }
python3 - "$OUTPUT" "$UPSTREAM" "$ROOT" <<'PY'
import sys
from pathlib import Path
output,upstream,product=map(lambda p:Path(p).resolve(),sys.argv[1:])
for source in [upstream,product]:
    if output==source or source.is_relative_to(output) or output.is_relative_to(source):
        raise SystemExit('Build output must be outside source trees')
PY
mkdir -p "$OUTPUT"
python3 "$UPSTREAM/sdkjs/common/wasm-convert/install-runtime.py" "$FULL_RUNTIME"
python3 "$ROOT/tools/wasm/install-runtime.py" "$PDF_RELEASE" "$UPSTREAM/sdkjs"
export PRODUCT_VERSION=9.3.4 BUILD_NUMBER=60 COMPANY_NAME=ElixirOffice
(
 cd "$UPSTREAM/sdkjs/build"
 npm ci
 BUILD_ROOT="$OUTPUT/sdk" SKIP_DEVELOP=1 node scripts/build-pipeline.cjs
)
mkdir -p "$UPSTREAM/web-apps/theme/elixiroffice"
cp -a "$ROOT/branding/web-apps/theme/elixiroffice/." "$UPSTREAM/web-apps/theme/elixiroffice/"
(
 cd "$UPSTREAM/web-apps/build"
 npm ci
 BUILD_ROOT="$OUTPUT/apps" THEME=elixiroffice node scripts/build-pipeline.js
)
# Generated locale/icon changes belong only to the build, not the reviewed sources.
make -C "$ROOT" restore-generated UPSTREAM="$UPSTREAM"
echo "SDK_OUTPUT=$OUTPUT/sdk"
echo "WEBAPPS_OUTPUT=$OUTPUT/apps"
