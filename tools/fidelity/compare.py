#!/usr/bin/env python3
"""Page-by-page layout comparison: reference PDFs vs candidate (ElixirOffice) PDFs.

Modes
  compare.py --ref-dir R --cand-dir C --corpus K --out RUN [--meta meta.json] [--baseline old.json]
      rasterise both sides, compare, write RUN/results.json and RUN/report/index.html;
      with --baseline, exit 1 if any document score regresses beyond tolerance.
  compare.py --check RESULTS.json --baseline OLD.json
      regression check only, on two existing results files.

Per page (reference page i vs candidate page i):
  * SSIM (grayscale, gaussian window sigma 1.5, Wang et al. constants);
  * tolerant pixel diff: a pixel differs when its gray level is more than
    --tol-level away from every pixel of the other image within a 3x3
    neighbourhood (absorbs 1 px of anti-aliasing / sub-pixel jitter);
    reported as a fraction of the inked area (union of both sides);
  * block shifts: the reference page is cut into horizontal ink blocks
    (row projection, small gaps merged, tall blocks split); each block is
    searched by normalised cross-correlation on candidate pages i-2..i+2;
    we report its vertical/horizontal offset in mm, or the page it moved to,
    or "lost" when it is not found (content changed);
  * text flow: 3-word shingles of each reference page (pdftotext) are located
    in the candidate pages -> which candidate page(s) the content went to.
"""
import argparse
import concurrent.futures as cf
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter

import cv2
import numpy as np
from PIL import Image, ImageDraw
from skimage.metrics import structural_similarity

import corpus_anon as ca  # shared with convert.py: anonymous ids for the private corpus

SCHEMA = 1
MM_PER_INCH = 25.4

# ----------------------------------------------------------------------------
# Scoring parameters (kept in results.json so that runs stay comparable)
# ----------------------------------------------------------------------------
DEFAULT_PARAMS = {
    "dpi": 120,
    "ink_level": 200,          # gray < 200 counts as ink
    "tol_level": 64,           # gray-level tolerance of the pixel diff
    "tol_radius_px": 1,        # spatial tolerance of the pixel diff (3x3)
    "ssim_ok": 0.98,           # metric B threshold
    "shift_tol_mm": 1.0,       # a block moved if |dy| > this
    "match_min_score": 0.5,    # below: block "lost" (content differs)
    "other_page_min_score": 0.8,  # needed to declare a block moved to another page
    "page_window": 2,          # block search on candidate pages i-2..i+2
    "page_mismatch_penalty": 25.0,  # metric C, points per page of difference
}

# ----------------------------------------------------------------------------
# PDF helpers (poppler)
# ----------------------------------------------------------------------------


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed: {p.stderr.strip()[:500]}")
    return p.stdout


def pdf_info(pdf):
    out = run(["pdfinfo", "-f", "1", "-l", "9999", pdf])
    sizes = [(float(w) * MM_PER_INCH / 72, float(h) * MM_PER_INCH / 72)
             for w, h in re.findall(r"^Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts", out, re.M)]
    producer = re.search(r"^Producer:\s*(.*)$", out, re.M)
    creator = re.search(r"^Creator:\s*(.*)$", out, re.M)
    return {"pages": len(sizes), "sizes_mm": [[round(w, 1), round(h, 1)] for w, h in sizes],
            "producer": producer.group(1).strip() if producer else "",
            "creator": creator.group(1).strip() if creator else ""}


def pdf_fonts(pdf):
    """Embedded font names (subset prefix removed). Column widths come from the
    dashed separator line, since names may contain spaces."""
    lines = run(["pdffonts", pdf]).splitlines()
    if len(lines) < 2:
        return []
    width = len(lines[1].split(" ")[0])
    fonts = []
    for line in lines[2:]:
        name = line[:width].strip().split("+", 1)[-1]
        if name and name not in fonts:
            fonts.append(name)
    return fonts


def pdf_text_pages(pdf):
    txt = run(["pdftotext", "-enc", "UTF-8", pdf, "-"])
    pages = txt.split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return pages


def rasterise(pdf, outdir, dpi):
    os.makedirs(outdir, exist_ok=True)
    for old in glob.glob(os.path.join(outdir, "p-*.png")):
        os.remove(old)
    run(["pdftoppm", "-r", str(dpi), "-png", pdf, os.path.join(outdir, "p")])
    files = glob.glob(os.path.join(outdir, "p-*.png"))
    files.sort(key=lambda f: int(re.search(r"-(\d+)\.png$", f).group(1)))
    return files


DATE_RE = re.compile(rb"(/(?:CreationDate|ModDate)\s*\(D:)[^)]*(\))|(<xmp:(?:CreateDate|ModifyDate|MetadataDate)>)[^<]*(<)")


def sha256_nodates(path):
    """sha256 of the PDF with creation/modification timestamps blanked."""
    data = open(path, "rb").read()
    data = DATE_RE.sub(lambda m: (m.group(1) or m.group(3)) + b"X" + (m.group(2) or m.group(4)), data)
    return hashlib.sha256(data).hexdigest()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ----------------------------------------------------------------------------
# Image comparison
# ----------------------------------------------------------------------------


def load_gray(path):
    return np.asarray(Image.open(path).convert("L"), dtype=np.uint8)


def pad_to(img, h, w):
    if img.shape == (h, w):
        return img
    out = np.full((h, w), 255, dtype=np.uint8)
    out[: img.shape[0], : img.shape[1]] = img
    return out


def tolerant_diff(a, b, level, radius):
    k = np.ones((2 * radius + 1, 2 * radius + 1), np.uint8)
    bmin, bmax = cv2.erode(b, k), cv2.dilate(b, k)
    amin, amax = cv2.erode(a, k), cv2.dilate(a, k)
    a16, b16 = a.astype(np.int16), b.astype(np.int16)
    bad_a = (a16 < bmin.astype(np.int16) - level) | (a16 > bmax.astype(np.int16) + level)
    bad_b = (b16 < amin.astype(np.int16) - level) | (b16 > amax.astype(np.int16) + level)
    return bad_a | bad_b


def find_blocks(gray, ink_level, ds, gap, max_h):
    """Horizontal ink blocks of a (downsampled) page: list of (y0, y1, x0, x1, ink)."""
    ink = gray < ink_level
    rows = ink.sum(axis=1)
    blocks, y, h = [], 0, len(rows)
    while y < h:
        if rows[y] == 0:
            y += 1
            continue
        y0, last = y, y
        while y < h and (rows[y] > 0 or y - last <= gap):
            if rows[y] > 0:
                last = y
            y += 1
        y1 = last + 1
        n = max(1, int(np.ceil((y1 - y0) / max_h)))
        step = int(np.ceil((y1 - y0) / n))
        for s in range(y0, y1, step):
            e = min(y1, s + step)
            sub = ink[s:e]
            cnt = int(sub.sum())
            if e - s < 3 or cnt < 30:
                continue
            cols = np.nonzero(sub.any(axis=0))[0]
            blocks.append((s, e, int(cols[0]), int(cols[-1]) + 1, cnt))
    return blocks


def blur(img, ds, dpi):
    """Gaussian blur (~0.5 mm) so that block matching follows layout position and
    tolerates glyph-level differences (font substitution, hinting)."""
    sigma = 0.5 * dpi / MM_PER_INCH / ds
    return cv2.GaussianBlur(img.astype(np.float32), (0, 0), sigma)


def match_blocks(ref_ds, ref_bl, cand_bl_pages, page_idx, p, ds, dpi):
    """Locate every reference block of page `page_idx` on nearby candidate pages.

    ref_ds: downsampled reference page (block segmentation); ref_bl / cand_bl_pages:
    blurred downsampled pages (matching). The match maximises normalised
    cross-correlation minus a small distance prior (0.004 per mm) so that
    repeated motifs (table rows, writing lines) resolve to the nearest
    occurrence instead of an arbitrary one. Only vertical offsets decide
    "moved" (dx is reported but font substitution makes it noisy)."""
    px_per_mm = dpi / MM_PER_INCH
    blocks = find_blocks(ref_ds, p["ink_level"], ds,
                         gap=max(2, int(round(1.7 * px_per_mm / ds))),
                         max_h=max(20, int(round(50 * px_per_mm / ds))))
    pad, sx = 3, int(round(8 * px_per_mm / ds))
    lam = 0.004 * ds / px_per_mm   # distance prior: 0.004 per mm
    out = []
    lo = max(0, page_idx - p["page_window"])
    hi = min(len(cand_bl_pages), page_idx + p["page_window"] + 1)
    for (y0, y1, x0, x1, cnt) in blocks:
        ty0, ty1 = max(0, y0 - pad), min(ref_ds.shape[0], y1 + pad)
        tx0, tx1 = max(0, x0 - pad), min(ref_ds.shape[1], x1 + pad)
        tpl = ref_bl[ty0:ty1, tx0:tx1]
        rec = {"y0": y0 * ds, "y1": y1 * ds, "x0": x0 * ds, "x1": x1 * ds, "ink": cnt}
        if tpl.std() < 1.0:
            continue
        same, other = None, None  # (adjusted, score, page, dy, dx)
        for j in range(lo, hi):
            cand = cand_bl_pages[j]
            rx0 = max(0, tx0 - sx)
            region = cand[:, rx0:min(cand.shape[1], tx1 + sx)]
            if region.shape[0] < tpl.shape[0] or region.shape[1] < tpl.shape[1]:
                big = np.full((max(region.shape[0], tpl.shape[0]), max(region.shape[1], tpl.shape[1])),
                              255.0, np.float32)
                big[: region.shape[0], : region.shape[1]] = region
                region = big
            res = cv2.matchTemplate(region, tpl, cv2.TM_CCOEFF_NORMED)
            res = np.nan_to_num(res, nan=-1.0, posinf=-1.0, neginf=-1.0)
            exp_y, exp_x = ty0, tx0 - rx0
            if j == page_idx:
                yy = np.abs(np.arange(res.shape[0]) - exp_y)[:, None].astype(np.float32)
                xx = np.abs(np.arange(res.shape[1]) - exp_x)[None, :].astype(np.float32)
                adj = res - lam * np.sqrt(yy ** 2 + xx ** 2)
            else:
                adj = res
            k = np.unravel_index(int(np.argmax(adj)), adj.shape)
            hit = (float(adj[k]), float(res[k]), j, int(k[0]) - exp_y, int(k[1]) - exp_x)
            if j == page_idx:
                same = hit
            elif other is None or hit[0] > other[0]:
                other = hit
        # Prefer the same page whenever the block is plausibly there: text-like
        # blocks look alike across pages, so "moved to another page" needs a
        # clearly better match there and a poor one here.
        if same and (same[1] >= p["match_min_score"] or other is None or other[1] < p["other_page_min_score"]):
            best = same
        elif other:
            best = other
        else:
            continue
        _, score, j, dy, dx = best
        rec.update(score=round(score, 3), page=j + 1, dy_px=dy * ds,
                   dy_mm=round(dy * ds / px_per_mm, 2), dx_mm=round(dx * ds / px_per_mm, 2))
        if j != page_idx:
            rec["status"] = "other-page"
        elif score < p["match_min_score"]:
            rec["status"] = "lost"
        elif abs(rec["dy_mm"]) > p["shift_tol_mm"]:
            rec["status"] = "moved"
        else:
            rec["status"] = "same"
        out.append(rec)
    return out


def summarise_blocks(blocks):
    tot = sum(b["ink"] for b in blocks) or 1
    def frac(st):
        return round(sum(b["ink"] for b in blocks if b["status"] in st) / tot, 4)
    same_page = [b for b in blocks if b["status"] in ("same", "moved")]
    dys = sorted((b["dy_mm"], b["ink"], b["dy_px"]) for b in same_page)
    med, med_px = 0.0, 0
    if dys:  # ink-weighted median vertical offset
        half, acc = sum(w for _, w, _ in dys) / 2, 0
        for v, w, vp in dys:
            acc += w
            if acc >= half:
                med, med_px = v, vp
                break
    to_pages = Counter()
    for b in blocks:
        if b["status"] == "other-page":
            to_pages[b["page"]] += b["ink"]
    return {
        "n": len(blocks),
        "moved": sum(1 for b in blocks if b["status"] == "moved"),
        "other_page": sum(1 for b in blocks if b["status"] == "other-page"),
        "lost": sum(1 for b in blocks if b["status"] == "lost"),
        "displaced_ink_frac": frac(("moved", "other-page", "lost")),
        "median_dy_mm": med,
        "median_dy_px": med_px,
        "max_abs_dy_mm": max((abs(b["dy_mm"]) for b in same_page), default=0.0),
        "max_abs_dy_px": max((abs(b["dy_px"]) for b in same_page), default=0),
        "to_pages": {str(k): round(v / tot, 3) for k, v in sorted(to_pages.items())},
    }


def diff_image(ref, cand, diff, ink_level, blocks):
    """RGB overlay: light gray = ink present on both sides within tolerance,
    red = only/darker in the reference, blue = only/darker in ours;
    orange boxes = reference blocks that moved, magenta = lost, purple = other page."""
    h, w = ref.shape
    out = np.full((h, w, 3), 255, np.uint8)
    ink = (ref < ink_level) | (cand < ink_level)
    out[ink] = (205, 205, 205)
    show = cv2.dilate(diff.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    ref_darker = ref.astype(np.int16) < cand.astype(np.int16)
    out[show & ref_darker] = (220, 30, 30)
    out[show & ~ref_darker] = (30, 90, 230)
    img = Image.fromarray(out)
    d = ImageDraw.Draw(img)
    colors = {"moved": (255, 140, 0), "lost": (220, 0, 220), "other-page": (120, 40, 200)}
    for b in blocks:
        c = colors.get(b["status"])
        if c:
            d.rectangle([b["x0"], b["y0"], b["x1"], b["y1"]], outline=c, width=3)
            label = (f"{b['dy_mm']:+.1f}mm" if b["status"] == "moved"
                     else ("p%d" % b["page"] if b["status"] == "other-page" else "?"))
            d.text((b["x1"] + 4, b["y0"]), label, fill=c)
    return img


def thumb(img, path, width=240):
    img = img.convert("RGB")
    r = width / img.width
    img.resize((width, max(1, int(img.height * r))), Image.LANCZOS).save(path, quality=85)


# ----------------------------------------------------------------------------
# Text flow
# ----------------------------------------------------------------------------


def shingles(text, n=3):
    words = re.findall(r"\w+", text.lower())
    return [" ".join(words[k:k + n]) for k in range(max(0, len(words) - n + 1))]


def text_flow(ref_pages, cand_pages):
    where = {}
    for j, t in enumerate(cand_pages):
        for s in set(shingles(t)):
            where.setdefault(s, []).append(j)
    flow = []
    for i, t in enumerate(ref_pages):
        sh = shingles(t)
        if not sh:
            flow.append({"words": 0})
            continue
        c, found = Counter(), 0
        for s in sh:
            js = where.get(s)
            if js:
                found += 1
                c[min(js, key=lambda j: abs(j - i)) + 1] += 1
        start = next((min(where[s], key=lambda j: abs(j - i)) + 1 for s in sh if s in where), None)
        flow.append({"words": len(sh), "found": round(found / len(sh), 3),
                     "to_pages": {str(k): round(v / len(sh), 3) for k, v in sorted(c.items())},
                     "starts_on": start})
    return flow


# ----------------------------------------------------------------------------
# Document comparison
# ----------------------------------------------------------------------------


def compare_doc(job):
    doc, ref_pdf, cand_pdf, run_dir, p = job
    did = doc["id"]
    t0 = time.time()
    res = {"id": did, "file": doc.get("file", ""), "category": doc.get("category", ""),
           "flags": [], "pages": []}
    if not ref_pdf or not os.path.exists(ref_pdf):
        res["status"] = "no-reference"
        res["flags"].append("no-reference")
        return res
    if not cand_pdf or not os.path.exists(cand_pdf):
        res["status"] = "conversion-failed"
        res["flags"].append("conversion-failed")
        res["ref"] = pdf_info(ref_pdf)
        res["ref_pages"], res["cand_pages"] = res["ref"]["pages"], 0
        res["page_delta"] = -res["ref_pages"]
        return res
    dpi = p["dpi"]
    ref_info, cand_info = pdf_info(ref_pdf), pdf_info(cand_pdf)
    res["ref"], res["cand"] = ref_info, cand_info
    res["ref"]["sha256"], res["cand"]["sha256"] = sha256(ref_pdf), sha256(cand_pdf)
    res["ref"]["sha256_nodates"], res["cand"]["sha256_nodates"] = sha256_nodates(ref_pdf), sha256_nodates(cand_pdf)
    res["ref"]["fonts"], res["cand"]["fonts"] = pdf_fonts(ref_pdf), pdf_fonts(cand_pdf)
    ref_png = rasterise(ref_pdf, os.path.join(run_dir, "raster", "ref", did), dpi)
    cand_png = rasterise(cand_pdf, os.path.join(run_dir, "raster", "ours", did), dpi)
    nref, ncand = len(ref_png), len(cand_png)
    res.update(ref_pages=nref, cand_pages=ncand, page_delta=ncand - nref)
    if nref != ncand:
        res["flags"].append("page-count-mismatch")
    flow = text_flow(pdf_text_pages(ref_pdf), pdf_text_pages(cand_pdf))

    ds = 2
    cand_gray = [load_gray(f) for f in cand_png]
    cand_bl = [blur(cv2.resize(g, (g.shape[1] // ds, g.shape[0] // ds), interpolation=cv2.INTER_AREA), ds, dpi)
               for g in cand_gray]
    tdir = os.path.join(run_dir, "report", "thumbs", did)
    fdir = os.path.join(run_dir, "report", "full", did)
    os.makedirs(tdir, exist_ok=True)
    os.makedirs(fdir, exist_ok=True)
    identical_pages = 0
    for i in range(max(nref, ncand)):
        n = i + 1
        page = {"n": n}
        if i < nref:
            ref_img = Image.open(ref_png[i])
            thumb(ref_img, os.path.join(tdir, f"p{n:03d}-ref.jpg"))
            page["ref_png"] = os.path.relpath(ref_png[i], os.path.join(run_dir, "report"))
        if i < ncand:
            thumb(Image.open(cand_png[i]), os.path.join(tdir, f"p{n:03d}-ours.jpg"))
            page["ours_png"] = os.path.relpath(cand_png[i], os.path.join(run_dir, "report"))
        if i >= ncand:
            page["status"] = "missing-in-ours"
        elif i >= nref:
            page["status"] = "extra-in-ours"
        else:
            ref = load_gray(ref_png[i])
            cand = cand_gray[i]
            if ref.shape == cand.shape and np.array_equal(ref, cand):
                identical_pages += 1
                page["pixel_identical"] = True
            else:
                page["pixel_identical"] = False
            h, w = max(ref.shape[0], cand.shape[0]), max(ref.shape[1], cand.shape[1])
            page["size_px"] = {"ref": list(ref.shape), "ours": list(cand.shape)}
            if abs(ref.shape[0] - cand.shape[0]) > 2 or abs(ref.shape[1] - cand.shape[1]) > 2:
                page["size_mismatch"] = True
                if "page-size-mismatch" not in res["flags"]:
                    res["flags"].append("page-size-mismatch")
            ref_p, cand_p = pad_to(ref, h, w), pad_to(cand, h, w)
            page["ssim"] = round(float(structural_similarity(
                ref_p, cand_p, data_range=255, gaussian_weights=True, sigma=1.5,
                use_sample_covariance=False)), 5)
            diff = tolerant_diff(ref_p, cand_p, p["tol_level"], p["tol_radius_px"])
            ink = (ref_p < p["ink_level"]) | (cand_p < p["ink_level"])
            page["diff_ink"] = round(float(diff.sum()) / max(1, int(ink.sum())), 5)
            page["diff_page"] = round(float(diff.mean()), 6)
            ref_ds = cv2.resize(ref, (ref.shape[1] // ds, ref.shape[0] // ds), interpolation=cv2.INTER_AREA)
            blocks = match_blocks(ref_ds, blur(ref_ds, ds, dpi), cand_bl, i, p, ds, dpi)
            page["blocks"] = summarise_blocks(blocks)
            page["block_list"] = [b for b in blocks if b["status"] != "same"]
            page["status"] = "compared"
            dimg = diff_image(ref_p, cand_p, diff, p["ink_level"], blocks)
            dimg.save(os.path.join(fdir, f"p{n:03d}-diff.png"), optimize=True)
            thumb(dimg, os.path.join(tdir, f"p{n:03d}-diff.jpg"))
            page["diff_png"] = os.path.relpath(os.path.join(fdir, f"p{n:03d}-diff.png"),
                                               os.path.join(run_dir, "report"))
        if i < len(flow):
            page["text_flow"] = flow[i]
        res["pages"].append(page)
    res["status"] = "compared"
    res["determinism"] = {
        "pdf_bytes_identical": res["ref"]["sha256"] == res["cand"]["sha256"],
        "pdf_identical_except_dates": res["ref"]["sha256_nodates"] == res["cand"]["sha256_nodates"],
        "pixel_identical_pages": identical_pages,
        "all_pixel_identical": nref == ncand and identical_pages == nref,
    }
    res["seconds"] = round(time.time() - t0, 2)
    return res


# ----------------------------------------------------------------------------
# Scores
# ----------------------------------------------------------------------------


def score_doc(res, p):
    """Three candidate metrics (see docs/fidelity.md). Missing/extra pages count as
    failed pages; a conversion failure scores 0 everywhere."""
    if res["status"] == "no-reference":
        return None
    if res["status"] == "conversion-failed":
        return {"mean_ssim": 0.0, "pct_pages_ok": 0.0, "penalty": 0.0}
    n = max(res["ref_pages"], res["cand_pages"]) or 1
    cmp_pages = [pg for pg in res["pages"] if pg["status"] == "compared"]
    mean_ssim = sum(pg["ssim"] for pg in cmp_pages) / n
    ok = sum(1 for pg in cmp_pages if pg["ssim"] >= p["ssim_ok"])
    page_scores = [1.0 - 0.5 * min(1.0, pg["diff_ink"]) - 0.5 * pg["blocks"]["displaced_ink_frac"]
                   for pg in cmp_pages]
    penalty = 100.0 * sum(page_scores) / n - p["page_mismatch_penalty"] * abs(res["page_delta"])
    return {"mean_ssim": round(mean_ssim, 5),
            "pct_pages_ok": round(100.0 * ok / n, 2),
            "penalty": round(max(0.0, min(100.0, penalty)), 2)}


def global_scores(docs):
    scored = [d for d in docs if d.get("scores")]
    if not scored:
        return {}
    tot_pages = sum(max(d.get("ref_pages", 0), d.get("cand_pages", 0)) or 1 for d in scored)
    ok_pages = sum((d["scores"]["pct_pages_ok"] / 100.0) * (max(d.get("ref_pages", 0), d.get("cand_pages", 0)) or 1)
                   for d in scored)
    return {
        "documents_scored": len(scored),
        "mean_ssim": round(sum(d["scores"]["mean_ssim"] for d in scored) / len(scored), 5),
        "pct_pages_ok": round(100.0 * ok_pages / tot_pages, 2),
        "penalty": round(sum(d["scores"]["penalty"] for d in scored) / len(scored), 2),
        "page_count_mismatches": sum(1 for d in scored if d.get("page_delta")),
        "conversion_failures": sum(1 for d in scored if d["status"] == "conversion-failed"),
    }


# ----------------------------------------------------------------------------
# Regression check
# ----------------------------------------------------------------------------

TOLERANCES = {"mean_ssim": 0.002, "pct_pages_ok": 0.0, "penalty": 0.5}


def check_regression(new, old, tol):
    """Return (exit_code, lines). 0 ok, 1 regression, 3 incomparable."""
    lines = []
    ns, os_ = new["meta"].get("reference", {}), old["meta"].get("reference", {})
    if ns.get("source") != os_.get("source"):
        return 3, [f"incomparable: reference source {ns.get('source')!r} vs baseline {os_.get('source')!r}"]
    for k in ("dpi", "tol_level", "tol_radius_px", "ink_level", "ssim_ok", "shift_tol_mm",
              "page_mismatch_penalty", "match_min_score", "other_page_min_score", "page_window"):
        if new["params"].get(k) != old["params"].get(k):
            return 3, [f"incomparable: parameter {k} = {new['params'].get(k)} vs baseline {old['params'].get(k)}"]
    newd = {d["id"]: d for d in new["documents"]}
    worst = 0
    for od in old["documents"]:
        if not od.get("scores"):
            continue
        nd = newd.get(od["id"])
        if nd is None or not nd.get("scores"):
            lines.append(f"REGRESSION {od['id']}: scored in baseline, not scored now "
                         f"({nd['status'] if nd else 'absent'})")
            worst = 1
            continue
        for m, t in tol.items():
            delta = nd["scores"][m] - od["scores"][m]
            if delta < -t - 1e-12:
                lines.append(f"REGRESSION {od['id']} {m}: {od['scores'][m]} -> {nd['scores'][m]} "
                             f"({delta:+.4f}, tolerance {t})")
                worst = 1
            elif delta > t:
                lines.append(f"improved   {od['id']} {m}: {od['scores'][m]} -> {nd['scores'][m]} ({delta:+.4f})")
    return worst, lines


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ref-dir", help="reference PDFs: <dir>/<id>.pdf")
    ap.add_argument("--cand-dir", help="candidate (ours) PDFs: <dir>/<id>.pdf")
    ap.add_argument("--corpus", help="corpus dir with manifest.csv")
    ap.add_argument("--out", help="run directory")
    ap.add_argument("--meta", help="run metadata JSON written by run.sh")
    ap.add_argument("--ids", default="")
    ap.add_argument("--private", action="store_true", help="private corpus: anonymous ids only, no file names or titles in outputs")
    ap.add_argument("--dpi", type=int, default=DEFAULT_PARAMS["dpi"])
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--baseline", help="previous results.json; exit 1 on regression")
    ap.add_argument("--check", help="results.json to check against --baseline (no comparison run)")
    for m, t in TOLERANCES.items():
        ap.add_argument(f"--tol-{m.replace('_', '-')}", type=float, default=t,
                        help=f"allowed drop of {m} per document (default {t})")
    args = ap.parse_args()
    tol = {m: getattr(args, "tol_" + m) for m in TOLERANCES}

    if args.check:
        if not args.baseline:
            sys.exit("--check needs --baseline")
        new, old = json.load(open(args.check)), json.load(open(args.baseline))
        code, lines = check_regression(new, old, tol)
        print("\n".join(lines) or "no change beyond tolerance")
        print("REGRESSION CHECK: " + {0: "PASS", 1: "FAIL", 3: "INCOMPARABLE"}[code])
        sys.exit(code)

    for req in ("ref_dir", "cand_dir", "corpus", "out"):
        if not getattr(args, req):
            sys.exit(f"--{req.replace('_', '-')} is required")
    p = dict(DEFAULT_PARAMS, dpi=args.dpi)
    docs, _ = ca.load_docs(args.corpus, ca.is_private(args.corpus, args.private))
    if args.ids:
        wanted = set(args.ids.split(","))
        docs = [d for d in docs if d["id"] in wanted]
    meta = json.load(open(args.meta)) if args.meta else {}
    os.makedirs(os.path.join(args.out, "report"), exist_ok=True)

    jobs = []
    for d in docs:
        ref = os.path.join(args.ref_dir, d["id"] + ".pdf")
        cand = os.path.join(args.cand_dir, d["id"] + ".pdf")
        jobs.append((d, ref if os.path.exists(ref) else None, cand if os.path.exists(cand) else None, args.out, p))
    if not any(j[1] for j in jobs):
        sys.exit(f"no reference PDF found in {args.ref_dir} (expected <id>.pdf, e.g. {docs[0]['id']}.pdf)")

    t0 = time.time()
    results = []
    with cf.ProcessPoolExecutor(max_workers=args.workers) as ex:
        for r in ex.map(compare_doc, jobs):
            r["scores"] = score_doc(r, p)
            s = r["scores"]
            print(f"[compare] {r['id']:<5} {r['status']:<17} "
                  + (f"pages {r['ref_pages']}->{r['cand_pages']}  ssim {s['mean_ssim']:.4f}  "
                     f"ok {s['pct_pages_ok']:5.1f}%  penalty {s['penalty']:5.1f}" if s and r['status'] == 'compared' else "")
                  + ("  [" + ",".join(r["flags"]) + "]" if r["flags"] else ""), flush=True)
            results.append(r)

    det_docs = [r for r in results if r.get("determinism")]
    out = {
        "schema": SCHEMA,
        "meta": meta,
        "params": p,
        "global": global_scores(results),
        "determinism": {
            "documents": len(det_docs),
            "all_pixel_identical": sum(1 for r in det_docs if r["determinism"]["all_pixel_identical"]),
            "pdf_bytes_identical": sum(1 for r in det_docs if r["determinism"]["pdf_bytes_identical"]),
            "pdf_identical_except_dates": sum(1 for r in det_docs if r["determinism"]["pdf_identical_except_dates"]),
            "nondeterministic": [r["id"] for r in det_docs if not r["determinism"]["all_pixel_identical"]],
        },
        "missing_reference": [r["id"] for r in results if r["status"] == "no-reference"],
        "conversion_failed": [r["id"] for r in results if r["status"] == "conversion-failed"],
        "compare_seconds": round(time.time() - t0, 1),
        "documents": results,
    }
    res_path = os.path.join(args.out, "results.json")
    with open(res_path, "w") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    import report  # local module
    report.write_report(out, os.path.join(args.out, "report", "index.html"))
    g = out["global"]
    print(f"[compare] global ({g.get('documents_scored')} docs): mean_ssim {g.get('mean_ssim')}  "
          f"pct_pages_ok {g.get('pct_pages_ok')}%  penalty {g.get('penalty')}  "
          f"page-count mismatches {g.get('page_count_mismatches')}")
    if out["missing_reference"]:
        print(f"[compare] WARNING: no reference for {', '.join(out['missing_reference'])}", file=sys.stderr)
    print(f"[compare] results: {res_path}")
    print(f"[compare] report:  {os.path.join(args.out, 'report', 'index.html')}")
    if args.baseline:
        code, lines = check_regression(out, json.load(open(args.baseline)), tol)
        print("\n".join(lines) or "no change beyond tolerance")
        print("REGRESSION CHECK: " + {0: "PASS", 1: "FAIL", 3: "INCOMPARABLE"}[code])
        sys.exit(code)


if __name__ == "__main__":
    ca.guard(main)
