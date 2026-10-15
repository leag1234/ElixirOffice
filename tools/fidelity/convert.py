#!/usr/bin/env python3
"""Convert every corpus document (.docx, .odt...) to PDF through the DocumentServer conversion API.

The script runs inside the tooling container, on the same Docker network as the
DocumentServer container. It serves the corpus over a throw-away HTTP server so
that DocumentServer can download the input files, then calls POST /converter
(JSON variant of ConvertService.ashx, see server/DocService/sources/
converterservice.js) with a HS256 JWT signed with the inbox secret.

Any conversion error is reported with the DocumentServer error code and makes
the script exit non-zero (after trying every document).
"""
import argparse
import base64
import concurrent.futures as cf
import functools
import hashlib
import hmac
import http.server
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import corpus_anon as ca  # shared with compare.py: anonymous ids for the private corpus

# Old-style error codes returned by /converter (utils.mapAscServerErrorToOldError).
DS_ERRORS = {
    -1: "unknown error",
    -2: "conversion timeout",
    -3: "conversion error (x2t failed / corrupted / unreadable input)",
    -4: "error while downloading the input file",
    -5: "password protected or DRM",
    -6: "error accessing the conversion result database / queue",
    -7: "input parameters error",
    -8: "invalid token (JWT)",
    -9: "cannot detect the input format",
    -10: "size limit exceeded",
}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def jwt_hs256(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = b64url(json.dumps(header, separators=(",", ":")).encode()) + "." + \
        b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), signing_input.encode("ascii"), hashlib.sha256).digest()
    return signing_input + "." + b64url(sig)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # keep stdout readable
        pass


def start_file_server(root, port):
    handler = functools.partial(QuietHandler, directory=root)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def pdf_pages(path):
    out = subprocess.run(["pdfinfo", path], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError("pdfinfo failed: " + out.stderr.strip())
    m = re.search(r"^Pages:\s+(\d+)", out.stdout, re.M)
    return int(m.group(1)) if m else 0


def convert_one(doc, args, secret):
    doc_id, rel = doc["id"], doc.get("_rel", doc["file"])
    key = re.sub(r"[^0-9A-Za-z_\-.=]", "_", f"fid_{args.run_key}_{doc_id}")[:120]
    src_url = f"http://{args.serve_host}:{args.serve_port}/" + urllib.parse.quote(rel)
    payload = {
        "async": False,
        "filetype": os.path.splitext(rel)[1].lstrip(".").lower() or "docx",
        "outputtype": "pdf",
        "key": key,
        "url": src_url,
        "title": doc_id if args.anon else os.path.basename(rel),
    }
    token = jwt_hs256(payload, secret)
    body = dict(payload, token=token)
    req = urllib.request.Request(
        args.ds.rstrip("/") + "/converter",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "Authorization": "Bearer " + token},
        method="POST",
    )
    t0 = time.time()
    res = {"id": doc_id, "file": "" if args.anon else rel, "key": key, "ok": False}
    try:
        deadline = t0 + args.timeout
        while True:
            with urllib.request.urlopen(req, timeout=args.timeout) as r:
                answer = json.loads(r.read().decode())
            if "error" in answer:
                code = int(answer["error"])
                res["error_code"] = code
                res["error"] = DS_ERRORS.get(code, "unrecognised error code")
                break
            if answer.get("endConvert"):
                out_pdf = os.path.join(args.out, doc_id + ".pdf")
                with urllib.request.urlopen(answer["fileUrl"], timeout=args.timeout) as r, \
                        open(out_pdf, "wb") as fh:
                    fh.write(r.read())
                with open(out_pdf, "rb") as fh:
                    if fh.read(5) != b"%PDF-":
                        raise RuntimeError("downloaded result is not a PDF")
                res.update(ok=True, pages=pdf_pages(out_pdf),
                           sha256=hashlib.sha256(open(out_pdf, "rb").read()).hexdigest())
                break
            if time.time() > deadline:
                res["error"] = "client timeout waiting for endConvert"
                break
            time.sleep(1)
    except urllib.error.HTTPError as e:
        res["error"] = f"HTTP {e.code}: {e.read()[:300]!r}"
    except Exception as e:  # noqa: BLE001 - report everything, loudly
        res["error"] = f"{type(e).__name__}: {e}"
    if "error" in res:
        res["error"] = ca.scrub(res["error"])
    res["seconds"] = round(time.time() - t0, 2)
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--corpus", required=True, help="corpus dir containing manifest.csv")
    ap.add_argument("--out", required=True, help="output dir for <id>.pdf")
    ap.add_argument("--ds", required=True, help="DocumentServer base URL as seen from this container")
    ap.add_argument("--secret-file", required=True)
    ap.add_argument("--serve-host", required=True, help="hostname of this container on the docker network")
    ap.add_argument("--serve-port", type=int, default=8765)
    ap.add_argument("--run-key", required=True, help="unique per pass: DocumentServer caches results by key")
    ap.add_argument("--ids", default="", help="comma-separated subset of document ids")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--private", action="store_true", help="private corpus: anonymous ids only")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    secret = open(args.secret_file).read().strip()
    args.anon = ca.is_private(args.corpus, args.private)
    docs, _ = ca.load_docs(args.corpus, args.anon)
    if args.ids:
        wanted = set(args.ids.split(","))
        docs = [d for d in docs if d["id"] in wanted]
        missing = wanted - {d["id"] for d in docs}
        if missing:
            sys.exit(f"unknown ids: {sorted(missing)}")
    httpd = start_file_server(args.corpus, args.serve_port)

    t0 = time.time()
    results = []
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        for res in ex.map(lambda d: convert_one(d, args, secret), docs):
            status = f"ok  {res['pages']:>3} p" if res["ok"] else "FAILED"
            print(f"[convert] {res['id']:<5} {status}  {res['seconds']:>6.1f}s"
                  + ("" if res["ok"] else f"  {res.get('error_code', '')} {res['error']}"), flush=True)
            results.append(res)
    httpd.shutdown()
    total = round(time.time() - t0, 1)
    failed = [r for r in results if not r["ok"]]
    with open(os.path.join(args.out, "convert.json"), "w") as fh:
        json.dump({"seconds": total, "workers": args.workers, "documents": results}, fh, indent=1)
    print(f"[convert] {len(results) - len(failed)}/{len(results)} converted in {total}s")
    if failed:
        print("[convert] CONVERSION FAILURES:", file=sys.stderr)
        for r in failed:
            where = r["id"] if args.anon else f"{r['id']} ({r['file']})"
            print(f"  {where}: {r.get('error_code', '')} {r['error']}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    ca.guard(main)
