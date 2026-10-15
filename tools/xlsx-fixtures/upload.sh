#!/usr/bin/env bash
# Upload the xlsx fixtures to a running DocumentServer "example" app.
#
# Usage: tools/xlsx-fixtures/upload.sh [--no-replace] <base-url>
#   e.g. tools/xlsx-fixtures/upload.sh http://localhost:8099/example
#
# By default an existing copy with the same name is first removed through the
# example app's own API (DELETE file?filename=...), so names stay stable and
# the editor URLs below keep working. With --no-replace the example app keeps
# the old copy and stores the new one as "name (1).xlsx".
# Note: the example app stores files per client IP, so open the editor from
# the same origin (e.g. through the same host / ssh tunnel) used for upload.
set -euo pipefail

replace=1
if [ "${1:-}" = "--no-replace" ]; then replace=0; shift; fi
base="${1:?usage: $0 [--no-replace] <base-url, e.g. http://localhost:8099/example>}"
base="${base%/}"
dir="$(cd "$(dirname "$0")/../../tests/fixtures/xlsx" && pwd)"

for f in "$dir"/*.xlsx; do
  name="$(basename "$f")"
  if [ "$replace" = 1 ]; then
    curl -fsS -o /dev/null -X DELETE -H "Content-Type: text/xml" \
      "$base/file?filename=$name" || true
  fi
  resp="$(curl -fsS -F "uploadedFile=@$f" "$base/upload")"
  stored="$(printf '%s' "$resp" | sed -n 's/.*"filename": *"\([^"]*\)".*/\1/p')"
  if [ -z "$stored" ]; then
    echo "upload failed for $name: $resp" >&2
    exit 1
  fi
  echo "$base/editor?fileName=${stored// /%20}"
done
