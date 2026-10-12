# SPDX-License-Identifier: AGPL-3.0-only
"""Shared helper for the private (real teacher) corpus: anonymous document ids.

A corpus is private when it is passed with --private, when EO_PRIVATE_CORPUS=1, or when its
path contains "corpus-private". Then every id a tool prints, writes or uses as a file name is
anon_id(relative path): file names and document titles never reach stdout, stderr, reports
or result files. Manifest rows keep only the anonymous id, and every error text or traceback
goes through scrub() before it is printed. See docs/fidelity.md.
"""
import csv
import hashlib
import os
import sys
import traceback
import urllib.parse

SALT = b"elixiroffice-private-corpus/v1"
PRIVATE_DIR_MARKER = "corpus-private"
_active = None  # scrubber of the private corpus loaded in this process


def anon_id(rel):
    """Stable anonymous id of a document, from its path relative to the corpus root."""
    rel = rel.replace("\\", "/")
    return "doc-" + hashlib.sha256(SALT + b"\0" + rel.encode("utf-8")).hexdigest()[:10]


def is_private(corpus_dir, flag=False):
    if flag or os.environ.get("EO_PRIVATE_CORPUS") == "1":
        return True
    return PRIVATE_DIR_MARKER in os.path.realpath(corpus_dir)


class Scrubber:
    """Replaces every known file name (path, base name, stem, URL-quoted forms) by its id."""

    def __init__(self, rels):
        pairs = {}
        for rel in rels:
            aid = anon_id(rel)
            base = os.path.basename(rel)
            stem = os.path.splitext(base)[0]
            for s in (rel, base, urllib.parse.quote(rel), urllib.parse.quote(base)):
                if s:
                    pairs[s] = aid
            if len(stem) >= 3:  # shorter stems would mangle ordinary text
                pairs[stem] = aid
        self.pairs = sorted(pairs.items(), key=lambda kv: -len(kv[0]))

    def __call__(self, text):
        text = str(text)
        for s, aid in self.pairs:
            text = text.replace(s, aid)
        return text


def load_docs(corpus_dir, private):
    """Manifest rows of a corpus -> (docs, scrub).

    Private rows carry only "id" and an empty "file"; the relative path is kept as "_rel",
    for opening the file only, and is never printed. Non-private rows are returned unchanged.
    """
    global _active
    with open(os.path.join(corpus_dir, "manifest.csv"), newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not private:
        return rows, scrub
    _active = Scrubber([r["file"] for r in rows])
    docs = [{"id": anon_id(r["file"]), "file": "", "_rel": r["file"]} for r in rows]
    return docs, scrub


def scrub(text):
    """Scrubbed text in private mode, the text unchanged otherwise."""
    return _active(text) if _active else str(text)


def guard(main):
    """Run a tool's main(). In private mode a failure prints only scrubbed text, never the raw
    exception or traceback (which may name a file)."""
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:
        if _active is None:
            raise
        sys.stderr.write(scrub(f"{type(e).__name__}: {e}") + "\n")
        sys.stderr.write(scrub(traceback.format_exc()))
        sys.exit(1)
