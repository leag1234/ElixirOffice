#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Quality gate of the client-side PDF export (docs/client-pdf.md).

Input: a bench directory written by tools/client-pdf/bench.mjs (client/<id>.pdf, server/<id>.pdf,
bench.json) and the results.json of tools/fidelity/compare.py run with --ref-dir server
--cand-dir client. Checks, per document:
  * same page count; mean SSIM (client vs server) >= 0.99 over the corpus (pages below 0.97 reported);
  * text extractable: pdftotext of each page gives every character of the server's page (order and spaces
    ignored; characters only the client gives and the share of identical words are reported);
  * every font embedded (pdffonts);
  * client file size <= 1.3 x the server file;
  * no request carried data during the client export (bench.json uploads == 0).
Writes <bench>/gate.json, prints a summary, exit 1 when a check fails.
Usage: gate.py <bench dir> <compare results.json> [--aggregate-only] [--wasm]
--wasm enforces W1: SSIM >= 0.995, size <= 1.1, ToUnicode, wasm without fallback.
"""
import json, os, re, subprocess, sys
from pathlib import Path

def run(*a):
    return subprocess.run(a, capture_output=True, text=True, errors="replace").stdout

def pages(pdf):
    m = re.search(r"^Pages:\s+(\d+)", run("pdfinfo", pdf), re.M)
    return int(m.group(1)) if m else 0

def page_text(pdf, n):
    # same characters on the page, in any order: pdftotext's reading order and word cuts depend on how
    # text runs are cut, the characters must be the same
    t = run("pdftotext", "-f", str(n), "-l", str(n), "-enc", "UTF-8", pdf, "-")
    return "".join(sorted(re.sub(r"\s+", "", t)))

def page_words(pdf, n):
    t = run("pdftotext", "-f", str(n), "-l", str(n), "-enc", "UTF-8", pdf, "-")
    return sorted(t.split())

def fonts(pdf):
    rows = run("pdffonts", pdf).splitlines()[2:]
    out = []
    for r in rows:
        parts = r.split()
        # name type... emb sub uni object ID  -> emb is the 5th field from the end
        if len(parts) >= 6:
            out.append({"name": parts[0], "emb": parts[-5] == "yes", "uni": parts[-3] == "yes"})
    return out

def main():
    bench, results = sys.argv[1], sys.argv[2]
    agg_only = "--aggregate-only" in sys.argv
    wasm = "--wasm" in sys.argv
    b = {r["id"]: r for r in json.loads(Path(bench, "bench.json").read_text())}
    ssim = {d["id"]: d for d in json.loads(Path(results).read_text())["documents"]}
    docs, fails = [], []
    for i, r in sorted(b.items()):
        c, s = os.path.join(bench, "client", i + ".pdf"), os.path.join(bench, "server", i + ".pdf")
        d = {"id": i}
        if r.get("error") or not (os.path.exists(c) and os.path.exists(s)):
            d["error"] = r.get("error", "missing PDF"); docs.append(d); fails.append((i, "error")); continue
        if r.get("fallback"):
            d["fallback"] = r["fallback"]
        pc, ps = pages(c), pages(s)
        d["pages"] = [pc, ps]
        from collections import Counter
        txt_bad, extra = [], {}
        for n in range(1, min(pc, ps) + 1):
            cc, sc = Counter(page_text(c, n)), Counter(page_text(s, n))
            if sc - cc: txt_bad.append(n)              # a character of the server's text is missing
            if cc - sc: extra[n] = "".join(sorted((cc - sc).elements()))[:40]
        d["text_pages_differ"] = txt_bad
        d["text_extra_chars"] = extra                  # characters only the client PDF gives (reported, not a failure)
        wc = ws = 0
        for n in range(1, min(pc, ps) + 1):
            a, b2 = page_words(c, n), page_words(s, n)
            from collections import Counter
            wc += sum((Counter(a) & Counter(b2)).values()); ws += len(b2)
        d["words_same"] = round(wc / max(1, ws), 4)
        d["text_chars"] = sum(len(page_text(c, n)) for n in range(1, pc + 1))
        f = fonts(c)
        d["fonts"] = len(f)
        d["fonts_not_embedded"] = [x["name"] for x in f if not x["emb"]]
        d["fonts_no_tounicode"] = [x["name"] for x in f if not x["uni"]]
        d["size"] = [os.path.getsize(c), os.path.getsize(s)]
        d["size_ratio"] = round(d["size"][0] / max(1, d["size"][1]), 3)
        sd = ssim.get(i)
        if sd:
            pg = [p["ssim"] for p in sd["pages"] if p.get("status") == "compared"]
            d["ssim_mean"] = round(sum(pg) / len(pg), 5) if pg else 0
            d["ssim_min"] = min(pg) if pg else 0
        if not sd or len([p for p in sd["pages"] if p.get("status") == "compared"]) != ps or ps <= 0:
            fails.append((i, "incomplete comparison"))
        cl = r.get("client") or {}
        d["uploads"] = cl.get("uploads", 0)
        st = cl.get("stats") or {}
        if wasm and (st.get("backend") != "wasm" or st.get("fallbacks")):
            d["fallback"] = "wasm backend not used without fallback"
        if wasm and d["fonts_no_tounicode"]:
            fails.append((i, "ToUnicode"))
        d["ms"] = {"writer": st.get("totalMs"), "capture": st.get("captureMs"), "client_total": cl.get("ms"), "server_total": (r.get("server") or {}).get("ms")}
        for k, bad in (("pages", pc != ps), ("text", bool(txt_bad)), ("fonts", bool(d["fonts_not_embedded"])),
                       ("size", d["size"][0] / max(1, d["size"][1]) > (1.1 if wasm else 1.3)), ("uploads", d["uploads"] > 0), ("fallback", bool(d.get("fallback")))):
            if bad: fails.append((i, k))
        docs.append(d)
    ok = [d for d in docs if "ssim_mean" in d]
    allp = [p["ssim"] for i in ssim for p in ssim[i]["pages"] if p.get("status") == "compared" and i in b]
    summary = {
        "documents": len(docs), "pages": len(allp),
        "mean_ssim": round(sum(allp) / len(allp), 5) if allp else 0,
        "min_page_ssim": min(allp) if allp else 0,
        "pages_below_0_97": sum(1 for x in allp if x < 0.97),
        "page_count_mismatch": sum(1 for d in docs if d.get("pages") and d["pages"][0] != d["pages"][1]),
        "text_mismatch_docs": sum(1 for d in docs if d.get("text_pages_differ")),
        "words_same": round(sum(d.get("words_same", 0) for d in ok) / max(1, len(ok)), 4),
        "fonts_not_embedded_docs": sum(1 for d in docs if d.get("fonts_not_embedded")),
        "max_size_ratio": max((d["size_ratio"] for d in ok), default=0),
        "total_size_ratio": round(sum(d["size"][0] for d in ok) / max(1, sum(d["size"][1] for d in ok)), 3),
        "uploads": sum(d.get("uploads", 0) for d in docs),
        "fallbacks": sum(1 for d in docs if d.get("fallback")),
        "errors": sum(1 for d in docs if d.get("error")),
        "writer_ms_per_page": round(sum((d["ms"]["writer"] or 0) for d in ok) / max(1, sum(d["pages"][0] for d in ok)), 1),
    }
    summary["pass"] = summary["mean_ssim"] >= (0.995 if wasm else 0.99) and bool(docs) and not fails
    out = {"summary": summary, "failures": fails, "documents": [] if agg_only else docs}
    Path(bench, "gate.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(summary, indent=1))
    for i, k in fails:
        print("FAIL", "" if agg_only else i, k)
    sys.exit(0 if summary["pass"] else 1)

if __name__ == "__main__":
    main()
