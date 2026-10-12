#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
: "${FONT_TOOL_IMAGE:?immutable generator image SHA}"
: "${FONT_TOOL_ROOT:?documentserver directory in that image}"
: "${CORE_FONTS:?licensed free-font checkout}"
: "${FONT_PACK:?licensed free-font pack}"
: "${FONT_OUTPUT:?completed free-only font generation directory}"
: "${SDK_OUTPUT:?production output containing sdkjs/}"
: "${WEBAPPS_OUTPUT:?production output containing web-apps/}"
: "${THEME_SOURCE:?pinned SDK slide/themes/src directory}"
: "${THEME_OUTPUT:?fresh generated theme directory}"
case "$FONT_TOOL_IMAGE" in sha256:*) ;; *) echo "Pin a sha256 image ID" >&2; exit 1;; esac
[ ! -e "$THEME_OUTPUT" ] || { echo "Choose a fresh theme output directory" >&2; exit 1; }
mkdir -p "$THEME_OUTPUT"
docker run --rm --name "eo-desktop-A-themes-$$" --network none --user "$(id -u):$(id -g)" --entrypoint /bin/sh \
 -e FONT_TOOL_ROOT="$FONT_TOOL_ROOT" -v "$CORE_FONTS:/input:ro" -v "$FONT_PACK:/pack:ro" \
 -v "$SDK_OUTPUT/sdkjs:/sdkjs:ro" -v "$WEBAPPS_OUTPUT/web-apps:/web-apps:ro" -v "$FONT_OUTPUT:/font-output:ro" -v "$THEME_SOURCE:/theme-input:ro" -v "$THEME_OUTPUT:/out" "$FONT_TOOL_IMAGE" -c '
 set -e
 cp /theme-input/*.pptx /out/
 mkdir /tmp/eo-theme-converter
 cp -R "$FONT_TOOL_ROOT/server/FileConverter/bin/." /tmp/eo-theme-converter/
 cp /font-output/font_selection.bin /tmp/eo-theme-converter/font_selection.bin
 chmod u+w /tmp/eo-theme-converter/DoctRenderer.config
 cat > /tmp/eo-theme-converter/DoctRenderer.config <<EOF
<Settings><file>/sdkjs/common/Native/native.js</file><file>/sdkjs/common/Native/jquery_native.js</file><allfonts>/font-output/AllFonts-native.js</allfonts><file>/web-apps/vendor/xregexp/xregexp-all-min.js</file><sdkjs>/sdkjs</sdkjs></Settings>
EOF
 export LD_LIBRARY_PATH=/tmp/eo-theme-converter
 "$FONT_TOOL_ROOT/server/tools/allthemesgen" --converter-dir=/tmp/eo-theme-converter --src=/out --output=/out --allfonts=/font-output/AllFonts-native.js --change-sdk=false'
[ -s "$THEME_OUTPUT/themes.js" ] || { echo "Theme catalog missing" >&2; exit 1; }
python3 - "$THEME_OUTPUT" "$THEME_SOURCE" <<'PYCHECK'
import json,sys
from pathlib import Path
output,source=map(Path,sys.argv[1:])
names=json.loads((output/'themes.js').read_text().split('=',1)[1].strip().rstrip(';'))
assert len(names)==len(list(source.glob('*.pptx')))>0, 'Incomplete theme catalog'
for index in range(1,len(names)+1):assert (output/f'theme{index}'/'theme.bin').stat().st_size>0
print('PASS',len(names),'compiled themes')
PYCHECK
