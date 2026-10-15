#!/usr/bin/env bash
# Client-side PDF gate: SSIM (tools/fidelity/compare.py, client vs server PDF) + text, fonts, size, uploads.
# Usage: tools/client-pdf/gate.sh <bench dir> [corpus dir]   (bench dir written by bench.mjs)
# Runs in the fidelity tools image (python, poppler); TOOLS_IMAGE overrides it.
set -euo pipefail
B=$(readlink -f "$1"); K=$(readlink -f "${2:-$(dirname "$0")/../../corpus/provisional}"); H=$(cd "$(dirname "$0")/.." && pwd)
IMG=${TOOLS_IMAGE:-eo-cpdf-tools}
# Private corpus (docs/fidelity.md): the container cannot see the path, so the flag is set here.
PRIV=""
case "$K" in *corpus-private*) PRIV=--private ;; esac
if [ "${EO_PRIVATE_CORPUS:-0}" = 1 ]; then PRIV=--private; fi
docker image inspect "$IMG" >/dev/null 2>&1 || docker build -q -t "$IMG" -f "$H/client-pdf/Dockerfile.tools" "$H/client-pdf" >/dev/null
docker run --rm -u "$(id -u):$(id -g)" -v "$B:/b" -v "$K:/k:ro" -v "$H:/t:ro" "$IMG" sh -c '
  python3 /t/fidelity/compare.py --ref-dir /b/server --cand-dir /b/client --corpus /k --out /b/cmp --workers 8 '"$PRIV"' > /b/compare.log 2>&1 || true
  python3 /t/client-pdf/gate.py /b /b/cmp/results.json '"${GATE_FLAGS:-}"
