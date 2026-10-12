# SPDX-License-Identifier: AGPL-3.0-only
"""Single-page HTML report for a fidelity run (written next to results.json).

Usage as a script: python3 report.py RUN/results.json  (re-renders RUN/report/index.html)
"""
import html
import json
import os
import sys

CSS = """
:root{--bg:#fff;--fg:#1d1d1f;--mut:#666;--line:#ddd;--card:#f6f6f8;--bad:#b3261e;--warn:#9a5b00;--ok:#1e7a34;--accent:#2457c5}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#eee;--mut:#aaa;--line:#333;--card:#222226;--bad:#ff7b72;--warn:#e3b341;--ok:#56d364;--accent:#79a6ff}}
*{box-sizing:border-box}body{margin:0;padding:16px 24px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
h1{font-size:22px;margin:0 0 8px}h2{font-size:18px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
h3{font-size:16px;margin:24px 0 6px}a{color:var(--accent)}
.banner{padding:10px 14px;border-radius:6px;margin:8px 0;font-weight:600}
.banner.bad{background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad);border:1px solid var(--bad)}
.banner.warn{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn);border:1px solid var(--warn)}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--card);cursor:pointer;user-select:none;white-space:nowrap}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.meta td:first-child{color:var(--mut);white-space:nowrap;width:1%}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}.card{background:var(--card);border-radius:8px;padding:10px 14px;min-width:150px}
.card b{display:block;font-size:22px}.card span{color:var(--mut);font-size:12px}
.flag{display:inline-block;padding:0 6px;border-radius:4px;font-size:12px;margin:1px;border:1px solid}
.flag.bad{color:var(--bad);border-color:var(--bad)}.flag.warn{color:var(--warn);border-color:var(--warn)}
.pages{display:grid;grid-template-columns:repeat(3,minmax(0,240px)) 1fr;gap:6px 10px;align-items:start}
.pages img{width:100%;max-width:240px;border:1px solid var(--line);background:#fff;display:block}
.pages .hdr{font-weight:600;color:var(--mut);font-size:12px}.pm{font-size:12px}.pm div{margin:1px 0}
.missing{display:flex;align-items:center;justify-content:center;height:120px;border:1px dashed var(--bad);color:var(--bad);font-size:12px}
.legend span{display:inline-block;width:12px;height:12px;vertical-align:middle;margin:0 4px 0 10px;border:1px solid #888}
code{font-size:12px;overflow-wrap:anywhere}.mut{color:var(--mut)}.scroll{overflow-x:auto}
@media (max-width:760px){body{padding:12px 16px}.pages{grid-template-columns:repeat(3,minmax(0,1fr))}.pages .pm{grid-column:1/-1}}
"""

JS = """
document.querySelectorAll('table.sortable th').forEach((th,i)=>{th.addEventListener('click',()=>{
 const tb=th.closest('table').tBodies[0];const rows=[...tb.rows];const asc=th.dataset.asc!=='1';th.dataset.asc=asc?'1':'0';
 rows.sort((a,b)=>{const x=a.cells[i].dataset.v??a.cells[i].textContent,y=b.cells[i].dataset.v??b.cells[i].textContent;
  const nx=parseFloat(x),ny=parseFloat(y);const c=(!isNaN(nx)&&!isNaN(ny))?nx-ny:String(x).localeCompare(String(y));return asc?c:-c});
 rows.forEach(r=>tb.appendChild(r));});});
"""

FLAG_CLASS = {"page-count-mismatch": "bad", "conversion-failed": "bad", "no-reference": "warn",
              "page-size-mismatch": "warn", "nondeterministic": "bad"}


def e(x):
    return html.escape(str(x))


def fmt(v, nd=4):
    return "–" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else str(v))


def flags_html(flags):
    return "".join(f'<span class="flag {FLAG_CLASS.get(f, "warn")}">{e(f)}</span>' for f in flags)


def write_report(res, path):
    meta, g, det, params = res.get("meta", {}), res.get("global", {}), res.get("determinism", {}), res["params"]
    ref = meta.get("reference", {})
    out = ["<!doctype html><html lang='en'><head><meta charset='utf-8'>",
           "<meta name='viewport' content='width=device-width,initial-scale=1'>",
           f"<title>Fidelity {e(ref.get('source', ''))} {e(meta.get('run_id', ''))}</title><style>{CSS}</style></head><body>",
           "<h1>ElixirOffice: .docx layout fidelity</h1>"]
    if not ref.get("is_fidelity_reference", False):
        out.append(f"<div class='banner bad'>Reference: {e(ref.get('label', ref.get('source', '?')))}. "
                   "These figures do NOT measure fidelity to Word; they only validate the harness.</div>")
    if meta.get("corpus", {}).get("provisional"):
        out.append("<div class='banner warn'>PROVISIONAL corpus (public templates and generated documents): "
                   "no real teacher worksheet. The scores do not predict results on the real corpus.</div>")
    if res.get("conversion_failed"):
        out.append(f"<div class='banner bad'>Conversion failures: {e(', '.join(res['conversion_failed']))}</div>")
    if res.get("missing_reference"):
        out.append(f"<div class='banner warn'>No reference (excluded from the global score): "
                   f"{e(', '.join(res['missing_reference']))}</div>")

    # --- metadata
    img = meta.get("image", {})
    corpus = meta.get("corpus", {})
    rows = [
        ("Run", meta.get("run_id", "")),
        ("Date (UTC)", meta.get("date_utc", "")),
        ("Host", meta.get("host", "")),
        ("Rendering image", f"{img.get('name', '')}  id={img.get('id', '')}  digest={img.get('repo_digest') or 'none (local image)'}"),
        ("DocumentServer version", img.get("ds_version", "")),
        ("Corpus", f"{corpus.get('label', '')}  ({corpus.get('documents', '')} documents, manifest sha256 {corpus.get('manifest_sha256', '')[:16]})"),
        ("Reference", f"{ref.get('source', '')} : {ref.get('label', '')}"),
        ("Reference provenance", ref.get("provenance", "") or "undocumented (refs/<source>/SOURCE.json missing)"),
        ("Harness", f"{meta.get('harness', {}).get('version', '')}  tools {meta.get('harness', {}).get('tools_image', '')}"),
        ("Parameters", ", ".join(f"{k}={v}" for k, v in params.items())),
        ("Durations", ", ".join(f"{k} {v}s" for k, v in meta.get("timings", {}).items()) + f", comparison {res.get('compare_seconds')}s"),
    ]
    out.append("<h2>Run</h2><table class='meta'>")
    out += [f"<tr><td>{e(k)}</td><td><code>{e(v)}</code></td></tr>" for k, v in rows]
    out.append("</table>")

    # --- global
    out.append("<h2>Global scores</h2><div class='cards'>")
    for label, key, nd in (("A. Mean SSIM", "mean_ssim", 4), (f"B. % pages with SSIM ≥ {params['ssim_ok']}", "pct_pages_ok", 1),
                           ("C. Penalty score /100", "penalty", 1)):
        out.append(f"<div class='card'><b>{fmt(g.get(key), nd)}</b><span>{e(label)}</span></div>")
    out.append(f"<div class='card'><b>{g.get('page_count_mismatches', '–')}</b><span>docs with different page count</span></div>")
    out.append(f"<div class='card'><b>{g.get('conversion_failures', '–')}</b><span>conversion failures</span></div>")
    out.append(f"<div class='card'><b>{det.get('all_pixel_identical', '–')}/{det.get('documents', '–')}</b>"
               f"<span>pixel-identical docs (determinism if ref = ours)</span></div></div>")
    out.append("<p class='mut'>Three candidate metrics, to be chosen then frozen (docs/fidelity.md). "
               "Missing or extra pages count as 0.</p>")

    # --- table
    out.append("<h2>Documents</h2><p class='mut'>Click a header to sort.</p><div class='scroll'><table class='sortable'><thead><tr>"
               "<th>id</th><th>category</th><th class='n'>pages ref→ours</th><th class='n'>Δ</th>"
               "<th class='n'>A mean SSIM</th><th class='n'>B % pages OK</th><th class='n'>C penalties</th>"
               "<th class='n'>SSIM min</th><th class='n'>max ink diff</th><th class='n'>max displaced ink</th>"
               "<th class='n'>max shift (mm)</th><th>flags</th></tr></thead><tbody>")
    for d in res["documents"]:
        s = d.get("scores") or {}
        cmp = [p for p in d.get("pages", []) if p.get("status") == "compared"]
        flags = list(d.get("flags", []))
        if d.get("determinism") and ref.get("source") == "self" and not d["determinism"]["all_pixel_identical"]:
            flags.append("nondeterministic")
        mn = min((p["ssim"] for p in cmp), default=None)
        mx = max((p["diff_ink"] for p in cmp), default=None)
        disp = max((p["blocks"]["displaced_ink_frac"] for p in cmp), default=None)
        shift = max((p["blocks"]["max_abs_dy_mm"] for p in cmp), default=None)
        out.append(
            f"<tr><td><a href='#{e(d['id'])}'>{e(d['id'])}</a></td><td>{e(d.get('category', ''))}</td>"
            f"<td class='n' data-v='{d.get('ref_pages', -1)}'>{d.get('ref_pages', '–')}→{d.get('cand_pages', '–')}</td>"
            f"<td class='n'>{d.get('page_delta', '–')}</td>"
            f"<td class='n' data-v='{s.get('mean_ssim', -1)}'>{fmt(s.get('mean_ssim'))}</td>"
            f"<td class='n' data-v='{s.get('pct_pages_ok', -1)}'>{fmt(s.get('pct_pages_ok'), 1)}</td>"
            f"<td class='n' data-v='{s.get('penalty', -1)}'>{fmt(s.get('penalty'), 1)}</td>"
            f"<td class='n' data-v='{mn if mn is not None else -1}'>{fmt(mn)}</td>"
            f"<td class='n' data-v='{mx if mx is not None else -1}'>{fmt(mx, 3)}</td>"
            f"<td class='n' data-v='{disp if disp is not None else -1}'>{fmt(disp, 3)}</td>"
            f"<td class='n' data-v='{shift if shift is not None else -1}'>{fmt(shift, 1)}</td>"
            f"<td>{flags_html(flags)}</td></tr>")
    out.append("</tbody></table></div>")

    # --- per document
    out.append("<h2>Pages</h2><p class='legend'>Difference:<span style='background:#cdcdcd'></span>identical ink "
               "(tolerance)<span style='background:#dc1e1e'></span>only / darker in the reference"
               "<span style='background:#1e5ae6'></span>only / darker in ours"
               "<span style='border:2px solid #ff8c00'></span>moved block (mm)"
               "<span style='border:2px solid #7828c8'></span>block moved to another page"
               "<span style='border:2px solid #dc00dc'></span>bloc introuvable</p>")
    for d in res["documents"]:
        s = d.get("scores") or {}
        out.append(f"<h3 id='{e(d['id'])}'>{e(d['id'])} <span class='mut'>{e(d.get('file', ''))}</span> {flags_html(d.get('flags', []))}</h3>")
        if d["status"] != "compared":
            out.append(f"<p>{e(d['status'])}</p>")
            continue
        out.append(f"<p>Pages {d['ref_pages']} → {d['cand_pages']} · A {fmt(s.get('mean_ssim'))} · "
                   f"B {fmt(s.get('pct_pages_ok'), 1)} % · C {fmt(s.get('penalty'), 1)}</p>")
        rf, cf_ = d["ref"].get("fonts", []), d["cand"].get("fonts", [])
        out.append(f"<p class='pm'>Ref. fonts: <code>{e(', '.join(rf))}</code><br>Our fonts: <code>{e(', '.join(cf_))}</code></p>")
        out.append("<div class='pages'><div class='hdr'>reference</div><div class='hdr'>ours</div>"
                   "<div class='hdr'>difference</div><div class='hdr'>measures</div>")
        tdir = f"thumbs/{d['id']}"
        for p in d["pages"]:
            n = p["n"]
            def cell(kind, link_key):
                if kind == "ref" and "ref_png" not in p:
                    return "<div class='missing'>pas de page</div>"
                if kind == "ours" and "ours_png" not in p:
                    return "<div class='missing'>page manquante</div>"
                if kind == "diff" and "diff_png" not in p:
                    return "<div class='missing'>–</div>"
                return (f"<a href='{e(p[link_key])}'><img loading='lazy' alt='{kind} p{n}' "
                        f"src='{tdir}/p{n:03d}-{kind}.jpg'></a>")
            out.append(cell("ref", "ref_png") + cell("ours", "ours_png") + cell("diff", "diff_png"))
            m = [f"<div><b>page {n}</b> {e(p['status'])}</div>"]
            if p["status"] == "compared":
                b = p["blocks"]
                m.append(f"<div>SSIM {p['ssim']:.4f} · ink diff {p['diff_ink']:.3f}"
                         + (" · <b>pixel-identical</b>" if p.get("pixel_identical") else "") + "</div>")
                m.append(f"<div>blocks {b['n']}: moved {b['moved']}, other page {b['other_page']}, "
                         f"not found {b['lost']} · displaced ink {b['displaced_ink_frac']:.3f}</div>")
                m.append(f"<div>median vertical shift {b['median_dy_mm']:+.1f} mm, max {b['max_abs_dy_mm']:.1f} mm"
                         + (" · to pages " + ", ".join(f"{k} ({v:.0%})" for k, v in b["to_pages"].items()) if b["to_pages"] else "")
                         + "</div>")
                if p.get("size_mismatch"):
                    m.append(f"<div class='flag warn'>size px ref {p['size_px']['ref']} / ours {p['size_px']['ours']}</div>")
            tf = p.get("text_flow")
            if tf and tf.get("words"):
                m.append(f"<div>text: {tf['found']:.0%} found, spread over pages "
                         + ", ".join(f"{k} ({v:.0%})" for k, v in tf["to_pages"].items())
                         + f" ; starts on page {tf.get('starts_on')}</div>")
            out.append("<div class='pm'>" + "".join(m) + "</div>")
        out.append("</div>")
    out.append(f"<script>{JS}</script></body></html>")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))


if __name__ == "__main__":
    r = json.load(open(sys.argv[1]))
    write_report(r, os.path.join(os.path.dirname(sys.argv[1]), "report", "index.html"))
