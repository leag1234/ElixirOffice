#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate the pinned Mac icon with Apple's headless tools, never the PNG converter."""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--master", type=Path, default=Path(__file__).with_name("mac-icon.png"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("mac-icon.icns"))
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("Apple sips and iconutil on macOS are required")
    master = args.master.resolve(strict=True)
    output = args.output.absolute()
    # Fixed native sizes, including both Retina representations of each size.
    with tempfile.TemporaryDirectory(prefix="eo-icon-") as temporary:
        iconset = Path(temporary) / "icon.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                pixels = size * scale
                name = f"icon_{size}x{size}" + ("@2x" if scale == 2 else "") + ".png"
                subprocess.run(["/usr/bin/sips", "-z", str(pixels), str(pixels),
                                str(master), "--out", str(iconset / name)],
                               check=True, stdout=subprocess.DEVNULL)
        generated = Path(temporary) / "icon.icns"
        subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset),
                        "-o", str(generated)], check=True)
        data = generated.read_bytes()
        if data[:4] != b"icns" or int.from_bytes(data[4:8], "big") != len(data):
            raise RuntimeError("Invalid Apple ICNS output")
        cursor, types = 8, []
        while cursor < len(data):
            if cursor + 8 > len(data):
                raise RuntimeError("Truncated ICNS entry")
            kind, length = data[cursor:cursor+4], int.from_bytes(data[cursor+4:cursor+8], "big")
            if length < 8 or cursor + length > len(data):
                raise RuntimeError("Invalid ICNS entry length")
            types.append(kind)
            cursor += length
        if b"icp4" in types or b"icp5" in types or not {b"ic04", b"ic05"}.issubset(types):
            raise RuntimeError("Apple ICNS output has unsafe or missing small icons")
        output.write_bytes(data)
        print("Generated", output, len(data), "bytes; entries:", ",".join(t.decode("ascii") for t in types))

if __name__ == "__main__":
    main()
