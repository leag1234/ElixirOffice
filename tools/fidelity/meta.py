#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Write the run metadata (meta.json) recorded in results.json and the report."""
import argparse
import glob
import hashlib
import json
import os


def file_sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--date-utc", required=True)
    ap.add_argument("--host", required=True)
    ap.add_argument("--image-name", required=True)
    ap.add_argument("--image-id", required=True)
    ap.add_argument("--image-repo-digest", default="")
    ap.add_argument("--image-created", default="")
    ap.add_argument("--ds-version", default="")
    ap.add_argument("--tools-image", required=True)
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--corpus-host", default="", help="corpus path on the host (for the record)")
    ap.add_argument("--ref-source", required=True)
    ap.add_argument("--ref-dir", required=True)
    ap.add_argument("--ref-dir-host", required=True)
    ap.add_argument("--timing", action="append", default=[], help="name=seconds")
    a = ap.parse_args()

    # Harness version = hash of the harness sources actually used for this run.
    here = os.path.dirname(os.path.abspath(__file__))
    h = hashlib.sha256()
    for f in sorted(glob.glob(os.path.join(here, "*.py")) + glob.glob(os.path.join(here, "*.sh"))
                    + glob.glob(os.path.join(here, "Dockerfile*")) + [os.path.join(here, "requirements.txt")]):
        h.update(os.path.basename(f).encode() + b"\0" + open(f, "rb").read())

    readme = os.path.join(a.corpus, "README.md")
    provisional = os.path.exists(readme) and "PROVISOIRE" in open(readme, encoding="utf-8").read()
    manifest = os.path.join(a.corpus, "manifest.csv")
    n_docs = sum(1 for _ in open(manifest, encoding="utf-8")) - 1
    msha = file_sha(manifest)

    src_file = os.path.join(a.ref_dir, "SOURCE.json")
    src = json.load(open(src_file)) if os.path.exists(src_file) else {}
    is_ref = a.ref_source.startswith("word-") and src.get("is_fidelity_reference", True)
    label = src.get("label") or a.ref_source
    if a.ref_source == "libreoffice":
        label = "libreoffice (NOT a fidelity reference)"
        is_ref = False
    if a.ref_source == "self":
        is_ref = False
    provenance = ""
    if src:
        provenance = "; ".join(f"{k}={v}" for k, v in src.items()
                               if k not in ("source", "label", "is_fidelity_reference"))

    meta = {
        "run_id": a.run_id,
        "date_utc": a.date_utc,
        "host": a.host,
        "image": {"name": a.image_name, "id": a.image_id, "repo_digest": a.image_repo_digest,
                  "created": a.image_created, "ds_version": a.ds_version},
        "corpus": {"path": a.corpus_host or a.corpus, "provisional": provisional,
                   "label": ("provisional" if provisional else "corpus") + f"@manifest-sha256:{msha[:12]}",
                   "manifest_sha256": msha, "documents": n_docs},
        "reference": {"source": a.ref_source, "label": label, "dir": a.ref_dir_host,
                      "is_fidelity_reference": bool(is_ref), "provenance": provenance},
        "harness": {"version": "sha256:" + h.hexdigest()[:16], "tools_image": a.tools_image},
        "timings": {k: float(v) for k, v in (t.split("=", 1) for t in a.timing)},
    }
    with open(a.out, "w") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
