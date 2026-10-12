#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Extract Word's keyboard shortcuts from Microsoft's public support page.

Source: "Keyboard shortcuts in Word", Microsoft Support
  https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2

Usage:
  python3 tools/shortcuts/extract.py [page.html] > rows.json

Without an argument the page is downloaded. The output is the raw list of
(platform, section, subsection, action, keys) rows of the Windows and macOS
tabs; build_matrix.py turns it into docs/shortcuts-word.csv.
"""
import html
import json
import re
import sys
import urllib.request

URL = "https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2"


def fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def text(fragment):
    # The macOS tab draws the Command key as an image: keep it as "Cmd".
    fragment = re.sub(r'<img[^>]*mac-cmd[^>]*>', ' Cmd', fragment)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    s = re.sub(r"\s+", " ", html.unescape(fragment)).strip()
    s = re.sub(r"Cmd\s*\+", "Cmd+", s)
    s = re.sub(r"\s*\+\s*", "+", s)
    return s


def parse(page):
    panels = [(m.start(), m.group(1)) for m in re.finditer(r'<section id="tabpanel_1_([a-z-]+)"', page)]
    panels.append((len(page), None))
    rows = []
    for (a, platform), (b, _) in zip(panels, panels[1:]):
        if platform not in ("windows", "macos"):
            continue
        seg = page[a:b]
        toks = [(m.start(), "h", m.group(1), text(m.group(2))) for m in re.finditer(r"<h([23])[^>]*>(.*?)</h\1>", seg, re.S)]
        toks += [(m.start(), "t", None, m.group(0)) for m in re.finditer(r"<table.*?</table>", seg, re.S)]
        toks.sort()
        section = sub = ""
        for _, kind, level, value in toks:
            if kind == "h":
                if level == "2":
                    section, sub = value, ""
                else:
                    sub = value
                continue
            for tr in re.findall(r"<tr.*?</tr>", value, re.S):
                cells = [text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
                if len(cells) < 2 or cells[0].lower() in ("to do this", "key"):
                    continue
                rows.append({"platform": platform, "section": section, "sub": sub,
                             "action": cells[0], "keys": cells[1]})
    return rows


if __name__ == "__main__":
    page = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else fetch()
    json.dump(parse(page), sys.stdout, indent=1, ensure_ascii=False)
