#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${THEMES:?generated complete presentation theme directory}"
: "${SDK_OUTPUT:?production output root containing sdkjs/}"
: "${WEBAPPS_OUTPUT:?production output root containing web-apps/}"
: "${FONT_FILES:?generated bundled free font directory}"
: "${ALL_FONTS:?matching generated AllFonts.js}"
: "${PDF_RUNTIME:?verified directory containing current.json and versioned PDF runtime}"
: "${FONT_IMAGES:?matching generated font preview directory}"
: "${CORE_FONTS:?licensed upstream free core font directory}"
: "${FONT_PACK:?licensed generated ElixirOffice font pack}"
: "${TEMPLATES:?directory with actual new.docx/new.xlsx/new.pptx}"
: "${UPSTREAM:?DocumentServer source checkout matching production inputs}"
DESKTOP_TARGET="${DESKTOP_TARGET:-linux}"
case "$DESKTOP_TARGET" in linux|windows) ;; *) echo "DESKTOP_TARGET must be linux or windows" >&2; exit 1 ;; esac
GENERATED_FONT_SET="$(cat "$FONT_FILES/../font-set.txt")"
FONT_SET="${FONT_SET:-$GENERATED_FONT_SET}"
[ "$FONT_SET" = "$GENERATED_FONT_SET" ] || { echo "Font set metadata does not match generated inputs" >&2; exit 1; }
python3 "$ROOT/tests/desktop/prune.test.py"
python3 "$ROOT/tools/desktop/resources.py"  --font-set "$FONT_SET" --themes "$THEMES" --sdk "$SDK_OUTPUT" --apps "$WEBAPPS_OUTPUT" --fonts "$FONT_FILES" --allfonts "$ALL_FONTS" --pdf-runtime "$PDF_RUNTIME" --templates "$TEMPLATES" --upstream "$UPSTREAM" --font-images "$FONT_IMAGES" --font-source "$CORE_FONTS" --font-source "$FONT_PACK" --out "$ROOT/desktop/assets"
cd "$ROOT/desktop"
if [ "$DESKTOP_TARGET" = windows ]; then
  bash "$ROOT/tools/desktop/windows.sh"
else
  npm ci
  npm run test
  npm run package
fi
