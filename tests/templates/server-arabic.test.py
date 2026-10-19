#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Verify current shared server templates against an explicit real font inventory."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/desktop"))
from home_templates import localized
from template_font_coverage import Pack
from template_font_styles import styled_text

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("assets", type=Path, help="actual server AllFonts.js and encoded fonts snapshot")
parser.add_argument("--output", type=Path)
args = parser.parse_args()
pack = Pack(args.assets)
brand = ROOT / "branding/example/nodejs/public/elixir/brand/templates"
manifest = json.loads((brand / "templates.json").read_text())
records = {r["file"]: r for r in json.loads((brand / "template-sources.json").read_text())["files"]}
rows = []
for template in manifest["templates"]:
    for language in template["languages"]:
        file = brand / language / template["file"]
        missing = pack.missing(file, character_fallback=True)
        assert not missing, (template["id"], language, missing)
        for key in ["file", "thumb"]:
            relative = language + "/" + template[key]
            raw = (brand / relative).read_bytes()
            assert records[relative]["sha256"] == hashlib.sha256(raw).hexdigest()
            assert records[relative]["bytes"] == len(raw)
        row = {"id": template["id"], "language": language, "renderedMissing": missing}
        if language == "ar":
            assert not pack.missing(file), (template["id"], "Arabic primary face coverage")
            assert localized(ROOT / "tools/example/template-layouts" / file.name, template["id"], language) == file.read_bytes()
            with zipfile.ZipFile(file) as archive:
                runs = [(text, properties) for text, properties in styled_text(archive)
                        if any(0x600 <= ord(c) <= 0x8ff for c in text)]
            assert runs and not any(properties.get("iCs") for _, properties in runs)
            row.update(primaryMissing=[], arabicRuns=len(runs), arabicItalicRuns=0)
        rows.append(row)

# A real font payload must be selected by the declared filename, even when file
# order is permuted or filenames are not numeric. Do not assume index == filename.
with tempfile.TemporaryDirectory(prefix="eo-server-font-map-") as directory:
    target = Path(directory)
    (target / "sdkjs/common").mkdir(parents=True)
    (target / "fonts").mkdir()
    variants = pack.variants["DejaVu Sans"]
    names = ["regular-face", "italic-face", "bold-face", "bold-italic-face"]
    for name, style in zip(names, ["regular", "italic", "bold", "bold-italic"]):
        index, face = variants[style]
        assert face == 0 and index >= 0
        shutil.copyfile(args.assets / "fonts" / pack.files[index], target / "fonts" / name)
    index_file = target / "sdkjs/common/AllFonts.js"
    data = ('window["__fonts_files"] = ' + json.dumps(names) + ';\n' +
            'window["__fonts_infos"] = [["DejaVu Sans",0,0,1,0,2,0,3,0]];\n' +
            'window["__fonts_ranges"] = [];\n')
    index_file.write_text(data)
    explicit = Pack(target)
    assert ord("م") in explicit.glyphs("DejaVu Sans", "regular")
    assert ord("م") in explicit.glyphs("DejaVu Sans", "bold")
    assert ord("م") not in explicit.glyphs("DejaVu Sans", "italic")
    assert ord("م") not in explicit.glyphs("DejaVu Sans", "bold-italic")
    assert not explicit.glyphs("Absent public test family")
    for bad in ["../outside", "/absolute", "", ".."]:
        index_file.write_text(data.replace(json.dumps(names), json.dumps([bad])))
        try:
            Pack(target)
        except ValueError:
            pass
        else:
            raise AssertionError("Unsafe font filename accepted: " + bad)
    index_file.write_text("".join(data.splitlines(keepends=True)[1:]))
    try:
        Pack(target)
    except ValueError:
        pass
    else:
        raise AssertionError("Absent font filename array accepted")

result = {"scope": "Actual explicit server font snapshot; shared DOCX coverage and source/preview hashes. Native layout and released artifact identity are separate.",
          "assets": str(args.assets.resolve()), "allFontsSHA256": hashlib.sha256((args.assets / "sdkjs/common/AllFonts.js").read_bytes()).hexdigest(),
          "fontFiles": len(pack.files), "offeredTemplates": len(rows), "arabicTemplates": sum(r["language"] == "ar" for r in rows),
          "rows": rows, "permutedFilenameAndNegativeControls": "PASS"}
if args.output:
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print("PASS", len(rows), "offered server templates, four Arabic upright/reproducible/zero missing; filename mapping and negative controls")
