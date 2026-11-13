#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Open and save DOCX files as the editor does (sdkjs writes the editor binary, x2t turns it into a DOCX) so that
# the style ids can be compared (tests/fidelity/docx-style-ids.test.py).
#
# usage: docx-roundtrip-sdk.sh OUT_DIR file.docx...
# env:   EO_DOCBUILDER_BIN  directory of a docbuilder with its own copy of the converter files (it rewrites the font
#                           files next to it: never the shared one), its DoctRenderer.config pointing at the sdkjs to test
#        EO_X2T_JS          x2t.js of the WebAssembly converter (node), EO_NODE node 22
#        EO_DOCBUILDER_RUN  optional command prefix, e.g. "docker exec eo" (files are then read at the same paths)
set -e
out=$1; shift
mkdir -p "$out"
here=$(dirname "$0")
for f in "$@"; do
  n=$(basename "$f" .docx)
  cat > "$out/$n.docbuilder" <<EOT
builder.OpenFile("$(readlink -f "$f")", "");
var r = Asc.editor.asc_nativeGetFile();
var pp = Api.CreateParagraph(); pp.AddText(String(r)); Api.GetDocument().Push(pp);
builder.SaveFile("txt", "$(readlink -f "$out")/$n.bin.txt");
builder.CloseFile();
EOT
  (cd "$EO_DOCBUILDER_BIN" && LD_LIBRARY_PATH=. $EO_DOCBUILDER_RUN ./docbuilder "$(readlink -f "$out")/$n.docbuilder" >/dev/null)
  python3 - "$out/$n.bin.txt" "$out/$n.bin" <<'PY'
import re, sys
t = open(sys.argv[1], encoding="utf-8-sig").read()
m = re.search(r"DOCY;v\d+;(\d+);([A-Za-z0-9+/=]+)", t)
open(sys.argv[2], "wb").write(b"DOCY;v5;" + m.group(1).encode() + b";" + m.group(2).encode())
PY
  "$EO_NODE" "$here/docx-roundtrip-x2t.mjs" "$EO_X2T_JS" "$out/$n.bin" "$out/$n.docx" 8192 65
done
