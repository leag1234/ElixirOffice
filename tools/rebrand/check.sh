#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# List every upstream name (upstream fork name, visible ONLYOFFICE branding) that
# rename.sh would still rewrite, as file:line, and exit 1 if there is any (CI).
# Scans the whole of this repository (every tracked text file: code, docs, patches,
# baselines...) and the DocumentServer checkout with its submodules.
# It also runs the visible scan (help pages, editor pages and locales, example app,
# admin panel, welcome pages, installer defines, desktop, install guide): any upstream
# name there that is not attribution must be in VISIBLE_ALLOW of rebrand.py.
# Attribution (lineage sentences, copyright, licence files) and the names of the
# upstream images we consume as they are (docs/branding.md) are the only exceptions.
#   tools/rebrand/check.sh [--no-product] [--no-upstream] [DS_DIR]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
PRODUCT="--product $(cd "$HERE/../.." && pwd)"
USE_DS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-product) PRODUCT=""; shift ;;
    --no-upstream) USE_DS=0; shift ;;
    *) break ;;
  esac
done
DS=${1:-${UPSTREAM:-$HOME/elixiroffice/DocumentServer}}
[ -d "$DS/.git" ] || [ -f "$DS/.git" ] || USE_DS=0
if [ "$USE_DS" = 1 ]; then
  # shellcheck disable=SC2086
  exec python3 "$HERE/rebrand.py" check $PRODUCT "$DS"
fi
[ -n "$PRODUCT" ] || { echo "nothing to check" >&2; exit 2; }
exec python3 "$HERE/rebrand.py" check-product "${PRODUCT#--product }"
