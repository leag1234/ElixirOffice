#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Build only: the owner accepts native Windows behavior on a real PC/VM later.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${WINDOWS_BUILDER_IMAGE:?immutable electronuserland/builder image digest}"
: "${WINDOWS_BUILD_CACHE:?isolated writable build cache outside source}"
[[ "$WINDOWS_BUILDER_IMAGE" =~ ^electronuserland/builder@sha256:[0-9a-f]{64}$ ]] || { echo "Pin the Windows builder image by digest" >&2; exit 1; }
[ -f "$ROOT/desktop/assets/desktop-manifest.json" ] || { echo "Assemble desktop assets first" >&2; exit 1; }
python3 "$ROOT/tests/desktop/verify-resources.py" "$ROOT/desktop/assets"
mkdir -p "$WINDOWS_BUILD_CACHE/home"
WINDOWS_BUILD_CACHE="$(cd "$WINDOWS_BUILD_CACHE" && pwd)"
# The container cannot resolve a linked worktree; give the source-selection test a metadata-only index of
# the exact committed files (no objects, no history, no remotes) instead of exposing the repository.
GITMETA="$WINDOWS_BUILD_CACHE/gitmeta"
rm -rf "$GITMETA"; mkdir -p "$GITMETA/template"
git init --quiet --initial-branch=main --template="$GITMETA/template" "$GITMETA/repo"
git -C "$ROOT" ls-tree -r -z HEAD | python3 -c '
import sys
out=[]
for row in sys.stdin.buffer.read().split(b"\0"):
    if not row: continue
    head,name=row.split(b"\t",1); mode,kind,oid=head.split()
    assert kind==b"blob", kind
    out.append(mode+b" "+oid+b"\t"+name+b"\0")
sys.stdout.buffer.write(b"".join(out))' \
  | GIT_DIR="$GITMETA/repo/.git" GIT_WORK_TREE="$ROOT" git update-index -z --index-info
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$ROOT,dst=/project" \
  --mount "type=bind,src=$GITMETA/repo/.git,dst=/gitmeta,readonly" \
  --env GIT_DIR=/gitmeta --env GIT_WORK_TREE=/project \
  --mount "type=bind,src=$WINDOWS_BUILD_CACHE,dst=/work" \
  --workdir /project/desktop \
  --env HOME=/work/home --env ELECTRON_BUILDER_CACHE=/work/builder-cache \
  --env CSC_IDENTITY_AUTO_DISCOVERY=false --env USE_SYSTEM_WINE=true \
  --env PYTHONDONTWRITEBYTECODE=1 --env EO_RELEASE_REQUIRE_BUILDER=1 \
  --entrypoint /bin/bash "$WINDOWS_BUILDER_IMAGE" \
  -c 'set -euo pipefail; python3 /project/tools/desktop/build-python.py /project /work; export PATH="/work/python/bin:$PATH"; npm ci; npm run test; npm run package:windows'
