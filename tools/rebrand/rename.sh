#!/bin/sh
# Rewrite the upstream names (upstream fork name, visible ONLYOFFICE branding) left in a
# DocumentServer checkout and its submodules; attribution is left intact.
# Idempotent: re-run after every upstream rebase (docs/branding.md).
#   tools/rebrand/rename.sh [--commit] [--branch elixir/rebrand] [--product] [DS_DIR]
# --product also rewrites this repository (docs, patches, baselines): one-off, review the diff.
# DS_DIR defaults to $UPSTREAM or /srv/elixiroffice/DocumentServer.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ARGS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) ARGS="$ARGS --commit"; shift ;;
    --branch) ARGS="$ARGS --branch $2"; shift 2 ;;
    --product) ARGS="$ARGS --product $(cd "$HERE/../.." && pwd)"; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) break ;;
  esac
done
DS=${1:-${UPSTREAM:-$HOME/elixiroffice/DocumentServer}}
# shellcheck disable=SC2086
exec python3 "$HERE/rebrand.py" rename $ARGS "$DS"
