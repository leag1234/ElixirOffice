#!/usr/bin/env python3
"""Compare two wasm benches, reporting binary and normalized Office equality.

Only documented nondeterminism is normalized: ZIP order/timestamps, content-type
and font-table ordering, comment durableId values, and chart axis identifiers.
The semantic Office comparison checks nested embedded Office packages too.
"""
import argparse
import csv
import io
import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

def local(name):
    return name.rsplit("}", 1)[-1]

def normalize_xml(name, data):
    tree = ET.fromstring(data)
    if name.endswith("commentsIds.xml"):
        for node in tree.iter():
            for key in node.attrib:
                if local(key) == "durableId":
                    node.attrib[key] = "generated"
    if "/charts/" in name:
        axes = {}
        for node in tree.iter():
            if local(node.tag) == "axId" and "val" in node.attrib:
                value = node.attrib["val"]
                if value not in axes:
                    axes[value] = str(len(axes))
        for node in tree.iter():
            if local(node.tag) in ("axId", "crossAx") and node.attrib.get("val") in axes:
                node.attrib["val"] = axes[node.attrib["val"]]
    if name == "[Content_Types].xml" or name.endswith("fontTable.xml"):
        tree[:] = sorted(tree, key=lambda n: (n.tag, sorted(n.attrib.items())))
    return ET.canonicalize(ET.tostring(tree, encoding="unicode"))

def normalize_zip(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        result = {}
        for name in sorted(archive.namelist()):
            if name.endswith("/"):
                continue
            content = archive.read(name)
            if zipfile.is_zipfile(io.BytesIO(content)):
                result[name] = normalize_zip(content)
            elif name.endswith((".xml", ".rels")):
                result[name] = normalize_xml(name, content)
            else:
                result[name] = content
        return result

def compare(reference, candidate, expected):
    def rows(directory):
        with (directory / "wasm.csv").open() as source:
            return [r for r in csv.DictReader(source) if not r["file"].startswith("(")]
    rr, cr = rows(reference), rows(candidate)
    inventory = lambda rs: {(r["file"], r["step"], r["run"]) for r in rs}
    failures = []
    if inventory(rr) != inventory(cr):
        failures.append("benchmark inventory differs")
    files = sorted({r["file"] for r in rr})
    if len(files) != expected:
        failures.append("expected %d files, found %d" % (expected, len(files)))
    for label, rs in (("reference", rr), ("candidate", cr)):
        if any(r["rc"] != "0" or int(r["out_bytes"]) <= 0 for r in rs):
            failures.append(label + " conversion failures")
    binary_equal, office_equal = 0, 0
    differences = []
    for name in files:
        rd, cd = reference / "wasm" / name, candidate / "wasm" / name
        if not (rd / "Editor.bin").is_file() or not (cd / "Editor.bin").is_file():
            failures.append(name + ": missing Editor.bin")
            continue
        if (rd / "Editor.bin").read_bytes() == (cd / "Editor.bin").read_bytes():
            binary_equal += 1
        for original in rd.glob("back.*"):
            output = cd / original.name
            if not output.is_file():
                failures.append(name + ": missing round trip")
                continue
            try:
                equal = normalize_zip(original.read_bytes()) == normalize_zip(output.read_bytes())
            except (ET.ParseError, zipfile.BadZipFile) as error:
                failures.append(name + ": invalid Office package: " + str(error))
                continue
            if equal:
                office_equal += 1
            else:
                differences.append(name)
    failures.extend(differences)
    if office_equal != expected:
        failures.append("not all Office outputs match")
    return {"files": len(files), "conversions": len(cr), "binary_identical": binary_equal,
            "office_normalized_identical": office_equal, "failures": failures,
            "office_content_pass": not failures}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--expected-files", type=int, default=38)
    args = parser.parse_args()
    result = compare(args.reference, args.candidate, args.expected_files)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["office_content_pass"] else 1)
