#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Regression test of the French school cursive substitutes on synthetic fixtures (no real documents).
# Usage: tools/fonts/test-school-cursive.sh [IMAGE]   (image with the font pack, e.g. elixiroffice/documentserver:fonts-7;
# the "script" check needs an x2t that writes w:family to the font table binary table, see docs/fonts.md)
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
IMAGE=${1:-elixiroffice/documentserver:fonts}
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
python3 "$HERE/school_cursive_fixture.py" gen "$W/corpus"
"$HERE/../fidelity/run.sh" --ref self --corpus "$W/corpus" --runs-dir "$W/runs" --baselines-dir "$W/base" \
  --image "$IMAGE" --keep-going >/dev/null
TOOLS=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^eo-fidelity-tools:' | head -1)
docker run --rm -u "$(id -u):$(id -g)" -v "$HERE:/t:ro" -v "$W/runs:/runs:ro" "$TOOLS" \
  python /t/school_cursive_fixture.py check /runs/latest-self/ours
