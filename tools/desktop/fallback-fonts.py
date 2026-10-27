#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Build pinned OFL desktop fallbacks and copy the unmodified pan-CJK OTCs.

FontTools 4.58.0 is required for variable-font instances. Build-time downloads only;
--offline uses the verified cache. No glyph subsetting or outline slanting is performed.
"""
import argparse, hashlib, io, json, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSION = "4.58.0"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(source, cache, offline):
    target = cache / source["sha256"]
    if target.exists():
        data = target.read_bytes()
    elif offline:
        raise ValueError("Missing offline source: " + source["sha256"])
    else:
        with urllib.request.urlopen(source["url"], timeout=60) as response:
            data = response.read()
    if digest(data) != source["sha256"]:
        raise ValueError("Source SHA256 mismatch: " + source["url"])
    if not target.exists():
        target.write_bytes(data)
    return data


def notice(entry):
    if entry.get("mode") == "copy":
        return (
            entry["upstreamFamily"] + " " + entry["version"] + " — " + entry["copyright"] + "\n"
            "Unmodified static pan-CJK OTC Regular/Bold files. The collections retain "
            "their original JP/KR/SC/TC/HK and matching monospace names; generated "
            "application metadata exposes distinct Elixir Fallback aliases so installed "
            "system fonts keep priority. Italic is synthesized by the editor.\n"
            "Sources: " + ", ".join(source["url"] for source in entry["fonts"]) + "\n"
            "Source SHA256: " + ", ".join(source["sha256"] for source in entry["fonts"]) + "\n"
        )
    return (
        entry["upstreamFamily"] + " — copyright and OFL terms in OFL.txt.\n"
        "Desktop derivative: static wdth=100, wght=400/700 instances; "
        "family renamed to " + entry["family"] + ". No glyph subsetting, "
        "metric adjustment or pre-slanted outlines. Italic is synthesized by the editor.\n"
        "Source: " + entry["font"]["url"] + "\n"
        "Source SHA256: " + entry["font"]["sha256"] + "\n")


def verify(out):
    spec = json.loads((HERE / "fallback-fonts.json").read_text())
    manifest = json.loads((out / "desktop-fallbacks.json").read_text())
    assert manifest["fontTools"] == VERSION, "Fallback tool version mismatch"
    expected = []
    for entry in spec:
        outputs = entry["fonts"] if entry.get("mode") == "copy" else entry["outputs"]
        for output in outputs:
            if entry.get("mode") == "copy":
                filename = entry["directory"] + "/" + output["filename"]
                source_sha = output["sha256"]
            else:
                filename = entry["directory"] + "/" + entry["family"].replace(" ", "") + "-" + output["style"] + ".ttf"
                source_sha = entry["font"]["sha256"]
            data = (out / filename).read_bytes()
            assert len(data) == output["bytes"] and digest(data) == output["sha256"], "Fallback output mismatch"
            expected.append({"family": entry["family"], "style": output["style"], "file": filename,
                             "bytes": len(data), "sha256": digest(data), "sourceSha256": source_sha})
        assert digest((out / entry["directory"] / "OFL.txt").read_bytes()) == entry["license"]["sha256"], "Fallback OFL mismatch"
        assert digest((out / entry["directory"] / "NOTICE.txt").read_bytes()) == entry["noticeSha256"], "Fallback NOTICE mismatch"
    assert manifest["files"] == expected, "Fallback manifest mismatch"
    actual = {str(p.relative_to(out)) for p in out.rglob("*") if p.suffix.lower() in (".ttf", ".otf", ".ttc")}
    assert actual == {f["file"] for f in expected}, "Unexpected fallback font payload"
    print("PASS pinned desktop fallback bytes, manifest, OFL and NOTICE")


def build(out, cache, offline=False):
    import fontTools
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    if fontTools.__version__ != VERSION:
        raise ValueError("Use FontTools " + VERSION + " for reproducible static instances")
    if out.exists():
        raise ValueError("Choose a fresh output directory")
    cache.mkdir(parents=True, exist_ok=True)
    spec = json.loads((HERE / "fallback-fonts.json").read_text())
    # Verify every input before creating any output.
    inputs = [(entry,
               [(source, fetch(source, cache, offline)) for source in
                (entry["fonts"] if entry.get("mode") == "copy" else [entry["font"]])],
               fetch(entry["license"], cache, offline)) for entry in spec]
    out.mkdir(parents=True)
    manifest = []
    for entry, sources, license_bytes in inputs:
        folder = out / entry["directory"]
        folder.mkdir()
        (folder / "OFL.txt").write_bytes(license_bytes)
        (folder / "NOTICE.txt").write_text(notice(entry), encoding="utf-8", newline="\n")
        if entry.get("mode") == "copy":
            for source, data in sources:
                target = folder / source["filename"]
                target.write_bytes(data)
                manifest.append({"family": entry["family"], "style": source["style"],
                                 "file": str(target.relative_to(out)), "bytes": len(data),
                                 "sha256": digest(data), "sourceSha256": source["sha256"]})
            continue
        data = sources[0][1]
        for style, weight in [("Regular", 400), ("Bold", 700)]:
            font = TTFont(io.BytesIO(data), recalcTimestamp=False)
            font = instantiateVariableFont(font, {"wdth": 100, "wght": weight}, inplace=True)
            assert "fvar" not in font and "gvar" not in font
            names = font["name"]
            # Replace all family/full/PostScript aliases; retain copyright/licence/version.
            for name_id in (1, 2, 3, 4, 6, 16, 17, 18, 21, 22, 25):
                names.removeNames(nameID=name_id)
            family = entry["family"]
            postscript = family.replace(" ", "") + "-" + style
            for name_id, value in [(1, family), (2, style), (3, postscript + ";ElixirOffice"),
                                   (4, family + " " + style), (6, postscript),
                                   (16, family), (17, style)]:
                names.setName(value, name_id, 3, 1, 0x409)
            if "STAT" in font:
                del font["STAT"]
            font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0x61) | (0x20 if weight == 700 else 0x40)
            font["head"].macStyle = 1 if weight == 700 else 0
            font["OS/2"].usWeightClass = weight
            target = folder / (postscript + ".ttf")
            font.save(target)
            raw = target.read_bytes()
            manifest.append({"family": family, "style": style, "file": str(target.relative_to(out)),
                             "bytes": len(raw), "sha256": digest(raw),
                             "sourceSha256": entry["font"]["sha256"]})
    (out / "desktop-fallbacks.json").write_text(json.dumps(
        {"fontTools": VERSION, "files": manifest}, indent=2) + "\n")
    print("PASS", len(manifest), "desktop fallback files:", sum(f["bytes"] for f in manifest), "bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument("--out", type=Path)
    choice.add_argument("--verify", type=Path)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify(args.verify)
    else:
        if args.cache is None:
            parser.error("--cache is required with --out")
        build(args.out, args.cache, args.offline)
        verify(args.out)
