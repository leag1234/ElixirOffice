#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# OpenDocument round-trip gate: what does a Save lose in .odt / .ods / .odp files?
#
# usage: tools/fidelity/odf-roundtrip.sh --app DIR [--out DIR] [--extra DIR]... [--jobs N]
#                                         [--baseline results.json] [--only REGEX]
#   --app DIR        extracted desktop package (contains the `elixiroffice` executable). Required.
#   --out DIR        run directory (default ./odf-roundtrip-<UTC timestamp>)
#   --extra DIR      more .odt/.ods/.odp files to round-trip (repeatable), e.g. a corpus converted by LibreOffice
#   --jobs N         parallel desktop instances (default 4, each has its own Xvfb display and profile)
#   --baseline FILE  results.json of an earlier run; exit 1 when a document or a feature got worse
#   --only REGEX     only the documents whose id matches (e.g. '^w0')
#   --keep-app-files keep the per-document desktop work folders (default: only the outputs are kept)
# environment:
#   EO_XVFB          Xvfb binary (default: xvfb from PATH)         EO_PLAYWRIGHT  playwright package dir
#   EO_NODE          node 22 (default: node)                         EO_ODF_LO_IMAGE LibreOffice tools image (default eo-odf-lo:trixie)
#   XKB_BINDIR, ELECTRON_DISABLE_SANDBOX etc. are passed through to the desktop.
# Steps: generate the synthetic corpus (odf_corpus.py) -> normalise with LibreOffice -> open, edit one character,
# save through the real converter in the packaged app (odf-roundtrip-app.cjs) -> render both versions with
# LibreOffice and compare pages (odf_render_compare.py) -> structural diff by feature (odf_struct.py) and loss
# table (odf_report.py). Nothing is pushed or published; the app is never given your own profile.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=""; OUT=""; JOBS=4; BASELINE=""; ONLY=""; EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="$2"; shift 2;; --out) OUT="$2"; shift 2;; --extra) EXTRA+=("$2"); shift 2;;
    --jobs) JOBS="$2"; shift 2;; --baseline) BASELINE="$2"; shift 2;; --only) ONLY="$2"; shift 2;;
    -h|--help) sed -n 2,22p "$0"; exit 0;; *) echo "unknown option $1" >&2; exit 64;;
  esac
done
[ -x "$APP/elixiroffice" ] || { echo "--app must point at an extracted package with an elixiroffice executable" >&2; exit 64; }
OUT="${OUT:-$PWD/odf-roundtrip-$(date -u +%Y%m%dT%H%M%SZ)}"
NODE="${EO_NODE:-node}"; IMAGE="${EO_ODF_LO_IMAGE:-eo-odf-lo:trixie}"
XVFB="${EO_XVFB:-$(command -v Xvfb || true)}"; PW="${EO_PLAYWRIGHT:-}"
[ -n "$XVFB" ] || { echo "Xvfb not found (set EO_XVFB)" >&2; exit 64; }
[ -n "$PW" ] || { echo "set EO_PLAYWRIGHT to a playwright (or playwright-core) package directory" >&2; exit 64; }
mkdir -p "$OUT"/{flat,orig,work,rt,render}
OUT="$(cd "$OUT" && pwd)"; APP="$(cd "$APP" && pwd)"

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -q -t "$IMAGE" -f "$HERE/Dockerfile.odf-lo" "$HERE" >/dev/null
lo() { docker run --rm -u "$(id -u):$(id -g)" -v "$OUT:/g" -v "$HERE:/t:ro" "$@"; }

echo "== corpus"
python3 "$HERE/odf_corpus.py" "$OUT/flat"
lo "$IMAGE" sh -c 'cd /g/flat && for t in odt:fodt ods:fods odp:fodp; do soffice --headless --norestore -env:UserInstallation=file:///tmp/p --convert-to ${t%%:*} --outdir /g/orig *.${t##*:} >/dev/null 2>&1; done'
lo "$IMAGE" python3 /t/odf_postprocess.py /g/orig
for d in ${EXTRA[@]+"${EXTRA[@]}"}; do cp -n "$d"/*.od[tsp] "$OUT/orig/" 2>/dev/null || true; done
echo "$(ls "$OUT/orig" | wc -l) documents"

echo "== round trip in the desktop (jobs: $JOBS)"
export APP OUT NODE XVFB PW HERE
ls "$OUT"/orig/*.od? | grep -E "${ONLY:-.}" | xargs -P "$JOBS" -I{} bash -c '
  f="{}"; n=$(basename "$f"); id="${n%.*}"
  mkdir -p "$OUT/work/$id"
  timeout 300 "$NODE" "$HERE/odf-roundtrip-app.cjs" "$f" "$APP/elixiroffice" "$OUT/work/$id" "$XVFB" "$PW" >"$OUT/work/$id/run.log" 2>&1 || true
  rt=$(ls "$OUT/work/$id"/roundtrip.od? 2>/dev/null | head -1); [ -n "$rt" ] && cp "$rt" "$OUT/rt/$id.${rt##*.}" || true'
[ "${EO_KEEP_APP_FILES:-0}" = 1 ] || rm -rf "$OUT"/work/*/{results,profiles,input,inplace.od?,display.log,desktop.Xauthority}

echo "== render and compare (LibreOffice)"
if [ -n "$ONLY" ]; then mkdir -p "$OUT/orig-sel"; for f in "$OUT"/orig/*.od?; do n=$(basename "$f"); [[ "${n%.*}" =~ $ONLY ]] && cp "$f" "$OUT/orig-sel/"; done; O=orig-sel; else O=orig; fi
lo "$IMAGE" python3 /t/odf_render_compare.py /g/$O /g/rt /g/render
echo "== report"
python3 "$HERE/odf_report.py" --run "$OUT" ${BASELINE:+--baseline "$BASELINE"}
echo "results: $OUT/results.json  loss table: $OUT/loss-table.md  per document: $OUT/documents.csv"
