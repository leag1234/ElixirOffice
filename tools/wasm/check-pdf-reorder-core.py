#!/usr/bin/env python3
"""Fail closed before compiling a runtime that attests PDF reorder safety."""
import hashlib
import re
import sys
from pathlib import Path


def check(core):
    source = (Path(core) / "PdfFile/PdfEditor.cpp").read_text()
    # Match the reviewed branch, rather than accepting a token in a comment or
    # an unrelated method. Source refactors require a fresh guard review.
    source = re.sub(r"//[^\n]*|/\*.*?\*/", "", source, flags=re.S)
    method = source.split("bool CPdfEditor::EditPage(", 1)[1].split("\n}\n", 1)[0]
    compact = re.sub(r"\s+", "", method)
    expected = (
        "if(bActualPos){"
        "pPageRef=pDoc->GetPageRef(_nPageIndex);"
        "nPageIndex=pCatalog->findPage(pPageRef.first,pPageRef.second);"
        "if(nPageIndex<1)returnfalse;"
        "}else{"
    )
    # Bind the whole reviewed method: disabled branches and later overrides
    # must not satisfy the guard. Whitespace/comments alone may differ.
    reviewed_method_sha256 = "6868a98c039636f52eaba5ada0c2c4b6184da194c3ee97e9e99efeeaf3a4918b"
    if expected not in compact or hashlib.sha256(compact.encode()).hexdigest() != reviewed_method_sha256:
        raise ValueError("EditPage lacks the reviewed original-page identity lookup")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("usage: check-pdf-reorder-core.py CORE")
        check(sys.argv[1])
    except (OSError, UnicodeError, IndexError, ValueError) as error:
        sys.exit("reorderSafe core guard: " + str(error))
