# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded, local PDF diagnostics; scores are not a Word-equivalence verdict."""
import collections
import gzip
import hashlib
import html
import json
import re
import subprocess
import unicodedata
from pathlib import Path

SCHEMA = "eo-office-differential-v1"
TOKEN = re.compile(r"[^\W_]+(?:['’-][^\W_]+)*", re.UNICODE)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def normalize(text):
    return unicodedata.normalize("NFKC", text).replace("\u00ad", "").casefold()


def walk(layout):
    yield layout
    if hasattr(layout, "__iter__"):
        for item in layout:
            yield from walk(item)


def extract_pdf(path, max_pages=300, max_glyphs=1000000):
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTChar, LTTextLine
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    if reader.is_encrypted:
        raise ValueError("Encrypted reference/candidate PDF is unsupported")
    if len(reader.pages) > max_pages:
        raise ValueError("PDF page limit exceeded")
    pages, lines, glyphs = [], [], []
    tokens = collections.defaultdict(list)
    for index, page in enumerate(reader.pages):
        if page.get("/Rotate", 0) % 360 or page.mediabox != page.cropbox:
            raise ValueError("Rotated/cropped PDF needs explicit coordinate support")
        box = [float(n) for n in page.mediabox]
        if box[0] != 0 or box[1] != 0:
            raise ValueError("Non-zero PDF origin is unsupported")
        pages.append({"page": index + 1, "box": box})
    for index, layout in enumerate(extract_pages(str(path)), 1):
        for line in walk(layout):
            if not isinstance(line, LTTextLine):
                continue
            chars = [item for item in walk(line) if isinstance(item, LTChar)]
            if not chars:
                continue
            # Retain the extractor's line sequence; sorting by x breaks RTL.
            text, mapping = "", []
            for char in chars:
                value = normalize(char.get_text())
                text += value
                mapping.extend([char] * len(value))
                glyphs.append({"text": char.get_text(), "font": char.fontname,
                               "size": char.size, "advance": char.adv,
                               "box": list(char.bbox), "page": index})
                if len(glyphs) > max_glyphs:
                    raise ValueError("PDF glyph limit exceeded")
            item = {"id": len(lines), "page": index, "box": list(line.bbox),
                    "text": text, "fonts": dict(collections.Counter(c.fontname for c in chars)),
                    "advance": sum(c.adv for c in chars)}
            lines.append(item)
            for match in TOKEN.finditer(text):
                token_chars = list(dict.fromkeys(mapping[match.start():match.end()]))
                tokens[match.group()].append({
                    "word": match.group(), "line": item["id"], "page": index,
                    "box": [min(c.x0 for c in token_chars), min(c.y0 for c in token_chars),
                            max(c.x1 for c in token_chars), max(c.y1 for c in token_chars)],
                    "advance": sum(c.adv for c in token_chars)})
    return {"pages": pages, "lines": lines, "glyphs": glyphs, "tokens": dict(tokens),
            "fontGlyphCounts": dict(collections.Counter(c["font"] for c in glyphs))}


def text_metrics(reference, candidate):
    ref, cand = reference["tokens"], candidate["tokens"]
    unique_ref = {word for word in ref if len(ref[word]) == 1}
    common = [word for word in unique_ref if len(cand.get(word, [])) == 1]
    common.sort(key=lambda word: (
        ref[word][0]["page"], -ref[word][0]["box"][3], ref[word][0]["box"][0], word))
    matches = [{"word": word, "reference": ref[word][0], "candidate": cand[word][0]}
               for word in common]
    correct = sum(m["reference"]["page"] == m["candidate"]["page"] for m in matches)
    pages = []
    for page in range(1, len(reference["pages"]) + 1):
        selected = [m for m in matches if m["reference"]["page"] == page]
        total = sum(1 for word in unique_ref if ref[word][0]["page"] == page)
        same = sum(m["reference"]["page"] == m["candidate"]["page"] for m in selected)
        pages.append({"page": page, "matchedUniqueTokens": len(selected),
                      "referenceUniqueTokens": total, "samePage": same,
                      "agreement": same / len(selected) if selected else None,
                      "coverage": len(selected) / total if total else None})
    first_page = next((m for m in matches if m["reference"]["page"] != m["candidate"]["page"]), None)
    # Compare adjacent uniquely matched tokens in extraction order. This is a
    # diagnostic, not source-paragraph or multi-column reading-order proof.
    ordered = sorted(matches, key=lambda m: (m["reference"]["line"], m["reference"]["box"][0]))
    first_wrap = None
    for left, right in zip(ordered, ordered[1:]):
        rs = left["reference"]["line"] == right["reference"]["line"]
        cs = left["candidate"]["line"] == right["candidate"]["line"]
        if rs != cs:
            first_wrap = {"left": left, "right": right,
                          "referenceSameLine": rs, "candidateSameLine": cs}
            break
    def enrich(match):
        if not match:
            return None
        return {**match, "referenceLine": reference["lines"][match["reference"]["line"]],
                "candidateLine": candidate["lines"][match["candidate"]["line"]]}
    if first_wrap:
        first_wrap["left"] = enrich(first_wrap["left"])
        first_wrap["right"] = enrich(first_wrap["right"])
    return {"uniqueReferenceTokens": len(unique_ref), "matchedUniqueTokens": len(matches),
            "samePage": correct, "agreement": correct / len(matches) if matches else None,
            "coverage": len(matches) / len(unique_ref) if unique_ref else None,
            "pages": pages, "firstPageDivergence": enrich(first_page),
            "firstWrapDivergence": first_wrap,
            "ordering": "reference PDF extraction order; heuristic for columns/RTL"}


def raster_page(pdf, page, destination, dpi, box, max_pixels=16000000):
    width, height = (box[2] * dpi / 72, box[3] * dpi / 72)
    if width * height > max_pixels or width <= 0 or height <= 0:
        raise ValueError("PDF raster pixel budget exceeded")
    prefix = str(destination.with_suffix(""))
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
                    "-r", str(dpi), "-png", str(pdf), prefix],
                   check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return destination


def raster_metrics(reference, candidate, diff, dpi, tolerance=64, radius=1):
    from PIL import Image, ImageChops, ImageFilter
    a, b = Image.open(reference).convert("L"), Image.open(candidate).convert("L")
    width, height = max(a.width, b.width), max(a.height, b.height)
    aa, bb = Image.new("L", (width, height), 255), Image.new("L", (width, height), 255)
    aa.paste(a, (0, 0)); bb.paste(b, (0, 0))
    def near(x, y):
        low = y.filter(ImageFilter.MinFilter(2 * radius + 1))
        high = y.filter(ImageFilter.MaxFilter(2 * radius + 1))
        return ImageChops.lighter(ImageChops.subtract(low, x), ImageChops.subtract(x, high))
    difference = ImageChops.lighter(near(aa, bb), near(bb, aa))
    changed = difference.point(lambda v: 255 if v > tolerance else 0)
    ink_a, ink_b = aa.point(lambda v: 255 if v < 245 else 0), bb.point(lambda v: 255 if v < 245 else 0)
    union = ImageChops.lighter(ink_a, ink_b)
    changed = ImageChops.darker(changed, union)
    changed.save(diff)
    count = lambda x: x.histogram()[255]
    denominator = count(union)
    def bounds(image):
        bbox = image.getbbox()
        return {"pixels": list(bbox) if bbox else None,
                "mm": [v * 25.4 / dpi for v in bbox] if bbox else None}
    return {"samePixelSize": a.size == b.size, "referencePixels": list(a.size),
            "candidatePixels": list(b.size), "referenceInk": bounds(ink_a),
            "candidateInk": bounds(ink_b), "unionInkPixels": denominator,
            "changedInkPixels": count(changed),
            "diffInk": count(changed) / denominator if denominator else 0.0,
            "diffImage": diff.name, "dpi": dpi, "grayTolerance": tolerance,
            "neighbourhoodRadius": radius}


def diagnostic_score(page_ratio, agreement, raster_similarity):
    """Versioned exploratory index; missing text evidence is never perfect text."""
    if agreement is None or raster_similarity is None:
        return None
    return round(100 * (0.3 * page_ratio + 0.4 * agreement + 0.3 * raster_similarity), 3)


def compare(reference_path, candidate_path, output, dpi=100, max_pages=300):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    reference = extract_pdf(reference_path, max_pages)
    candidate = extract_pdf(candidate_path, max_pages)
    text = text_metrics(reference, candidate)
    with gzip.open(output / "glyphs.json.gz", "wt", encoding="utf-8") as stream:
        json.dump({"reference": reference["glyphs"], "candidate": candidate["glyphs"]},
                  stream, ensure_ascii=False)
    raster = []
    count = max(len(reference["pages"]), len(candidate["pages"]))
    for index in range(count):
        entry = {"page": index + 1}
        if index >= min(len(reference["pages"]), len(candidate["pages"])):
            entry.update({"status": "missing-page", "diffInk": 1.0})
        else:
            rp, cp = output / f"reference-{index+1}.png", output / f"candidate-{index+1}.png"
            rb, cb = reference["pages"][index]["box"], candidate["pages"][index]["box"]
            raster_page(reference_path, index + 1, rp, dpi, rb)
            raster_page(candidate_path, index + 1, cp, dpi, cb)
            entry.update(raster_metrics(rp, cp, output / f"diff-{index+1}.png", dpi))
            entry["pageBoxDeltaPoints"] = [c - r for r, c in zip(rb, cb)]
            entry["pageBoxTolerancePoints"] = 0.1
            entry["pageBoxWithinTolerance"] = all(abs(d) <= 0.1 for d in entry["pageBoxDeltaPoints"])
            entry.update({"status": "compared", "referenceImage": rp.name,
                          "candidateImage": cp.name, "samePageBox": rb == cb})
        raster.append(entry)
    ratio = min(len(reference["pages"]), len(candidate["pages"])) / count if count else 0
    similarity = sum(1 - r["diffInk"] if r.get("pageBoxWithinTolerance", False) else 0 for r in raster) / count if count else None
    return {"schema": SCHEMA, "status": "compared",
            "pageCounts": {"reference": len(reference["pages"]), "candidate": len(candidate["pages"])},
            "text": text, "raster": raster,
            "fonts": {"reference": reference["fontGlyphCounts"], "candidate": candidate["fontGlyphCounts"]},
            "glyphEvidence": "glyphs.json.gz",
            "diagnosticScore": diagnostic_score(ratio, text["agreement"], similarity),
            "scoreVersion": "exploratory-v1-page30-text40-raster30-box0.1pt",
            "limits": ["Not a Word-equivalence verdict; inspect text coverage separately.",
                       "Unique tokens omit repeated words; columns/RTL ordering is heuristic.",
                       "Reference provenance is caller supplied, not verified by this harness."]}


def write_html(result, path):
    escape = lambda value: html.escape(str(value), quote=True)
    pct = lambda value: f"{100 * value:.1f}%" if isinstance(value, (int, float)) else "unavailable"
    summary = {
        "Status": result.get("status", "unknown"),
        "Reference source": result.get("referenceSource", "unspecified"),
        "Font mode": result.get("provenance", {}).get("fontMode", "unspecified"),
        "Page counts (reference / candidate)": result.get("pageCounts", {}),
        "Unique-token same-page agreement": pct(result.get("text", {}).get("agreement")),
        "Unique-token coverage": pct(result.get("text", {}).get("coverage")),
        "Exploratory diagnostic score": result.get("diagnosticScore", "unavailable"),
    }
    fragments = ['<!doctype html><html lang="en"><meta charset="utf-8">',
                 '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'">',
                 "<title>Office differential report</title>",
                 "<style>body{font:16px system-ui;margin:2em;max-width:1600px}img{width:30%;border:1px solid #888}pre{white-space:pre-wrap;overflow-wrap:anywhere}th,td{text-align:left;padding:.4em;border-bottom:1px solid #ccc}details{margin:1em 0}</style>",
                 "<h1>" + escape(result.get("id", "Office comparison")) + "</h1>",
                 "<p>Diagnostic only; self references do not measure fidelity to Microsoft Office. Interpret agreement together with token coverage.</p>",
                 "<table>" + "".join("<tr><th>" + escape(k) + "</th><td>" + escape(v) + "</td></tr>" for k, v in summary.items()) + "</table>"]
    if result.get("error"):
        fragments.append("<p>Error: " + escape(result["error"]) + "</p>")
    text = result.get("text", {})
    divergences = {key: text.get(key) for key in ("firstPageDivergence", "firstWrapDivergence")}
    fragments.append("<details><summary>First supported divergences</summary><pre>" + escape(json.dumps(divergences, ensure_ascii=False, indent=2)) + "</pre></details>")
    for page in result.get("raster", []):
        fragments.append("<h2>Page " + escape(page["page"]) + "</h2>")
        fragments.append("<p>Reference / candidate / difference mask</p>")
        for key in ("referenceImage", "candidateImage", "diffImage"):
            if key in page:
                fragments.append('<img alt="' + escape(key) + '" src="' + escape(page[key]) + '">')
        fragments.append("<details><summary>Page measurements</summary><pre>" + escape(json.dumps(page, indent=2)) + "</pre></details>")
    fragments.append("<details><summary>Complete diagnostics and provenance</summary><pre>" +
                     escape(json.dumps(result, ensure_ascii=False, indent=2)) + "</pre></details>")
    Path(path).write_text('\n'.join(fragments) + '\n</html>\n')
