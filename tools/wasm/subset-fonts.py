#!/usr/bin/env python3
"""Copy an explicitly requested font subset from a native version-2 selection.
Usage: subset-fonts.py SELECTION NAMES_JSON OUT [--font-root ROOT]
ROOT uses the benchmark layout root/<absolute font path>; default: source paths.
No font directory is scanned and no unrelated font file is opened.
"""
import argparse
import json
from pathlib import Path
import struct


def subset(selection, requested, out, font_root=None):
    data = Path(selection).read_bytes()
    wanted = set(requested)
    if not all(isinstance(name, str) and name for name in wanted):
        raise ValueError("font names must be nonempty strings")
    count = struct.unpack_from("<I", data)[0]
    pos, records, paths, found, total = 4, [], {}, set(), 0
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    (out / "fonts").mkdir()

    def string(at, end):
        size = struct.unpack_from("<I", data, at)[0]
        at += 4
        if at + size > end:
            raise ValueError("truncated native font string")
        return data[at:at + size].decode("utf-8"), at + size

    for _ in range(count):
        size = struct.unpack_from("<I", data, pos)[0]
        end = pos + size
        if size < 4 or end > len(data):
            raise ValueError("invalid native font record")
        at = pos + 4
        name, at = string(at, end)
        aliases = struct.unpack_from("<I", data, at)[0]
        at += 4
        names = {name}
        for _ in range(aliases):
            alias, at = string(at, end)
            names.add(alias)
        path_start = at
        source, at = string(at, end)
        if names & wanted:
            found.update(names & wanted)
            if source not in paths:
                candidate = Path(source)
                if font_root:
                    root = Path(font_root).resolve()
                    candidate = (root / source.lstrip("/")).resolve()
                    if not candidate.is_relative_to(root):
                        raise ValueError("font path escapes supplied root")
                raw = candidate.read_bytes()
                target = "fonts/font" + str(len(paths)) + ".ttf"
                (out / target).write_bytes(raw)
                paths[source] = "/" + target
                total += len(raw)
            encoded = paths[source].encode("utf-8")
            body = data[pos + 4:path_start] + struct.pack("<I", len(encoded)) + encoded + data[at:end]
            records.append(struct.pack("<I", len(body) + 4) + body)
        pos = end
    missing = sorted(wanted - found)
    if missing:
        raise ValueError("missing fonts: " + ", ".join(missing))
    (out / "font_selection.bin").write_bytes(struct.pack("<I", len(records)) + b"".join(records))
    report = {"families": sorted(found), "files": len(paths), "records": len(records), "bytes": total}
    (out / "fonts.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selection")
    parser.add_argument("names_json")
    parser.add_argument("out")
    parser.add_argument("--font-root")
    args = parser.parse_args()
    print(json.dumps(subset(args.selection, json.loads(Path(args.names_json).read_text()),
                            args.out, args.font_root), indent=2))
