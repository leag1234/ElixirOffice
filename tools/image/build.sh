#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# ElixirOffice production image (docs/dev.md). Runs on the build host (<build-host>).
#
#   tools/image/build.sh [base|fonts|runtime|all]     (default all; env below)
#
# 1. base: DocumentServer/build bake (upstream stages + branding/build/elixiroffice.hcl) ->
#    <REGISTRY>/documentserver:<TAG>-base. The AI client overlay (below) is applied to the sources first.
# 2. fonts: branding/build/Dockerfile.fonts adds the font pack -> <REGISTRY>/documentserver:<TAG>-fonts.
# 3. runtime: validated PDF runtime and shared nginx configuration -> <REGISTRY>/documentserver:<TAG>.
# Times, sizes and revisions go to $LOGS/image-<TAG>.json (the build record). Nothing is pushed.
#
# Env: DS (DocumentServer checkout, default ../DocumentServer next to this repository), TAG
#   (default <date>-<DocumentServer commit>), REGISTRY (elixiroffice), BUILDER (eo), FONT_GROUPS
#   (metric; metric,school adds Andika, OpenDyslexic, Comic Neue), LOGS (<repo>/../logs).
#   X2T_RELEASE (pinned PDF release dir; default ../wasm-artifacts/<pinned version>),
#   RUNTIME_BASE (runtime-only input image, default <TAG>-fonts).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DS="${DS:-$REPO/../DocumentServer}"
BRAND="$REPO/branding"
REGISTRY="${REGISTRY:-elixiroffice}"
BUILDER="${BUILDER:-eo}"
FONT_GROUPS="${FONT_GROUPS:-metric}"
LOGS="${LOGS:-$REPO/../logs}"
STEP="${1:-all}"
mkdir -p "$LOGS"
[ -d "$DS/build" ] || { echo "error: no DocumentServer checkout at $DS (set DS=)" >&2; exit 1; }

rev() { # <dir>: commit recorded next to the checkout by the sync (<dir>.rev, kept out of the build context) or by git
  if [ -f "${1%/}.rev" ]; then cat "${1%/}.rev"; else git -C "$1" rev-parse --short=9 HEAD 2>/dev/null || echo unknown; fi
}
DS_REV="$(rev "$DS")"; REPO_REV="$(rev "$REPO")"
TAG="${TAG:-$(date +%Y%m%d)-$DS_REV}"
# versioned static URLs (/<version>-<hash>/, served immutable): a new hash per image busts browser caches
DS_VERSION_HASH="${DS_VERSION_HASH:-$(printf '%s' "$DS_REV$REPO_REV$FONT_GROUPS" | sha1sum | cut -c1-8)}"
REC="$LOGS/image-$TAG.json"
echo "image: $REGISTRY/documentserver:$TAG  (DocumentServer $DS_REV, product repo $REPO_REV, hash $DS_VERSION_HASH, fonts $FONT_GROUPS)"

# Demo/production overlay on the sources, not committed (docs/install-server.md, known limits): the AI client calls its
# same-origin endpoint with credentials omitted, which never carries the HTTP Basic login of the gateway.
# To upstream into elixir/ai.
overlay() {
  local f="$DS/web-apps/apps/common/main/lib/elixir-ai/Core.js"
  [ -f "$f" ] || { echo "error: $f missing" >&2; exit 1; }
  sed -i "s/credentials: 'omit'/credentials: 'same-origin'/" "$f"
  echo "overlay: $(grep -c "credentials: 'same-origin'" "$f") same-origin fetch(es) in elixir-ai/Core.js"
}

base() {
  overlay
  local t0=$(date +%s)
  ( cd "$DS/build" && BRAND_DIR="$BRAND" TAG="$TAG-base" REGISTRY="$REGISTRY" DS_VERSION_HASH="$DS_VERSION_HASH" \
      BUILDX_BAKE_ENTITLEMENTS_FS=0 \
      docker buildx bake --builder "$BUILDER" --progress=plain -f docker-bake.hcl -f "$BRAND/build/elixiroffice.hcl" \
      --allow=fs=/tmp --allow=fs.read=.. --allow=fs.read="$BRAND" --load standalone )
  echo $(( $(date +%s) - t0 )) > "$LOGS/image-$TAG.base.sec"
  echo "base: done in $(cat "$LOGS/image-$TAG.base.sec") s"
}

fonts() {
  local t0=$(date +%s)
  docker build --progress=plain -f "$BRAND/build/Dockerfile.fonts" \
    --build-arg "BASE=$REGISTRY/documentserver:$TAG-base" --build-arg "FONT_GROUPS=$FONT_GROUPS" \
    --build-arg "REVISION=$REPO_REV" -t "$REGISTRY/documentserver:$TAG-fonts" "$BRAND/fonts"
  echo $(( $(date +%s) - t0 )) > "$LOGS/image-$TAG.fonts.sec"
  echo "fonts: done in $(cat "$LOGS/image-$TAG.fonts.sec") s"
}

prepare_runtime() {
  local version
  version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact_version"])' "$REPO/tools/wasm/runtime-release.json")
  RUNTIME_CONTEXT="$LOGS/runtime-$TAG"
  python3 "$HERE/prepare-runtime.py" "${X2T_RELEASE:-$REPO/../wasm-artifacts/$version}" "$RUNTIME_CONTEXT"
}

runtime() {
  local t0=$(date +%s)
  docker build --progress=plain -f "$BRAND/build/Dockerfile.runtime" \
    --build-arg "BASE=${RUNTIME_BASE:-$REGISTRY/documentserver:$TAG-fonts}" \
    -t "$REGISTRY/documentserver:$TAG" "$RUNTIME_CONTEXT"
  echo $(( $(date +%s) - t0 )) > "$LOGS/image-$TAG.runtime.sec"
  echo "runtime: done in $(cat "$LOGS/image-$TAG.runtime.sec") s"
}

record() {
  local id size
  id=$(docker image inspect "$REGISTRY/documentserver:$TAG" --format '{{.Id}}')
  size=$(docker image inspect "$REGISTRY/documentserver:$TAG" --format '{{.Size}}')
  python3 - "$REC" "$TAG" "$id" "$size" "$DS_REV" "$REPO_REV" "$FONT_GROUPS" "$DS_VERSION_HASH" \
    "$(cat "$LOGS/image-$TAG.base.sec" 2>/dev/null || echo null)" "$(cat "$LOGS/image-$TAG.fonts.sec" 2>/dev/null || echo null)" "$(cat "$LOGS/image-$TAG.runtime.sec" 2>/dev/null || echo null)" "$REPO/tools/wasm/runtime-release.json" <<'PY'
import json, sys, time
p, tag, iid, size, ds, repo, groups, h, b, f, runtime, pin_path = sys.argv[1:]
pin = json.load(open(pin_path))
json.dump({"image": f"documentserver:{tag}", "id": iid, "bytes": int(size), "documentserver_rev": ds, "product_rev": repo,
           "font_groups": groups, "version_hash": h, "base_seconds": json.loads(b), "fonts_seconds": json.loads(f),
           "runtime_seconds": json.loads(runtime), "runtime_version": pin["artifact_version"],
           "runtime_manifest_sha256": pin["manifest_sha256"], "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, open(p, "w"), indent=2)
PY
  echo "record: $REC"
}

case "$STEP" in
  base) base ;;
  fonts) prepare_runtime; fonts; runtime; record ;;
  all) prepare_runtime; base; fonts; runtime; record ;;
  runtime) prepare_runtime; runtime; record ;;
  *) echo "usage: build.sh [base|fonts|runtime|all]" >&2; exit 2 ;;
esac
docker image ls "$REGISTRY/documentserver" --format '{{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}' | head -5
