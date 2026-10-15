#!/usr/bin/env python3
"""Check wire bytes, MIME, cache headers and encoding negotiation on an own instance."""
import argparse
import gzip
import hashlib
import json
import random
import subprocess
import urllib.request
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument("base")
parser.add_argument("release", type=Path)
parser.add_argument("--version-prefix", default="")
args = parser.parse_args()
manifest = json.loads((args.release / "manifest.json").read_text())
base = args.base.rstrip("/") + "/" + args.version_prefix.strip("/")
base = base.rstrip("/")
pointer = base + "/sdkjs/common/clientpdf/runtime/current.json"
with urllib.request.urlopen(pointer) as response:
    assert response.headers.get_content_type() == "application/json"
    assert response.headers.get("Cache-Control") == "no-store"
    assert json.load(response)["artifact_version"] == manifest["artifact_version"]
prefix = base + "/sdkjs/common/clientpdf/runtime/" + manifest["artifact_version"] + "/"
cases = [("", ""), ("identity", ""), ("gzip", "gzip"), ("br, gzip", "br"),
         ("br;q=0, gzip", "gzip"), ("br;q=0.000, gzip;q=0", ""),
         ("br;q=0.5, gzip;q=1", "gzip"), ("gzip;q=0, br", "br"), ("deflate", ""),
         ("br;q=0.799, gzip;q=0.8", "gzip"), ("br;q=0.800, gzip;q=0.799", "br"),
         ("br;q=0.009, gzip;q=0.01", "gzip"), ("br;q=0.4, gzip;q=0.40", "br"),
         ("br;q=0.999, gzip;q=1.000", "gzip"), ("br;q=1.000, gzip;q=0.999", "br")]
for name, mime in (("x2t.wasm", "application/wasm"), ("x2t.js", "application/javascript")):
    raw = (args.release / name).read_bytes()
    for accept, encoding in cases:
        request = urllib.request.Request(prefix + name, headers={"Accept-Encoding": accept})
        with urllib.request.urlopen(request) as response:
            body = response.read()
            assert response.headers.get_content_type() == mime
            assert (response.headers.get("Content-Encoding") or "") == encoding
            assert response.headers.get("Vary") == "Accept-Encoding"
            assert "max-age=31536000" in response.headers.get("Cache-Control", "")
            assert "immutable" in response.headers.get("Cache-Control", "")
            assert int(response.headers["Content-Length"]) == len(body)
        wire_name = name + (".br" if encoding == "br" else ".gz" if encoding == "gzip" else "")
        item = manifest["artifacts"][wire_name]
        assert len(body) == item["bytes"]
        assert hashlib.sha256(body).hexdigest() == item["sha256"]
        decoded = (subprocess.check_output(["node", "-e", "const z=require('node:zlib'),fs=require('node:fs');process.stdout.write(z.brotliDecompressSync(fs.readFileSync(0)))"], input=body) if encoding == "br"
                   else gzip.decompress(body) if encoding == "gzip" else body)
        assert decoded == raw
        print(name, "Accept-Encoding=" + repr(accept), "encoding=" + (encoding or "identity"), "bytes=" + str(len(body)), "PASS")
print("runtime HTTP checks PASS (pointer and " + str(len(cases) * 2) + " negotiated/decoded artifact responses)")
# Exercise quality ordering across first/second/third fractional digits.
for _ in range(64):
    rng = globals().setdefault("_quality_rng", random.Random(20261009))
    br, gz = rng.randrange(1001), rng.randrange(1001)
    accept = "br;q=%.3f, gzip;q=%.3f" % (br / 1000, gz / 1000)
    expected = "" if br == gz == 0 else "br" if br >= gz else "gzip"
    request = urllib.request.Request(prefix + "x2t.wasm", method="HEAD", headers={"Accept-Encoding": accept})
    with urllib.request.urlopen(request) as response:
        assert (response.headers.get("Content-Encoding") or "") == expected, accept
print("64 deterministic HTTP HEAD quality-ordering cases PASS")
