# SPDX-License-Identifier: AGPL-3.0-only
"""release review(a): one pre-existing, derived noncustom worksheet field only."""
import base64
from datetime import datetime
import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def normalize(name, data):
    if name == 'docProps/core.xml':
        root = ET.fromstring(data)
        modified = root.findall('{http://purl.org/dc/terms/}modified')
        if not modified:
            return data
        assert len(modified) == 1, 'Ambiguous modified timestamp'
        node = modified[0]
        assert node.get('{http://www.w3.org/2001/XMLSchema-instance}type') == 'dcterms:W3CDTF', 'Unexpected timestamp type'
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', node.text or ''), 'Invalid W3CDTF'
        datetime.strptime(node.text, '%Y-%m-%dT%H:%M:%SZ')
        pattern = rb'(<dcterms:modified\b[^>]*>)([^<]*)(</dcterms:modified>)'
        matches = list(re.finditer(pattern, data))
        assert len(matches) == 1 and matches[0].group(2).decode() == node.text, 'Ambiguous timestamp bytes'
        # release review: preserve the tags, attributes and every other core-property byte.
        return re.sub(pattern, lambda m: m.group(1) + b'VALIDATED-SERIALIZATION-TIME' + m.group(3), data)
    if not re.fullmatch(r'xl/worksheets/sheet[0-9]+\.xml', name):
        return data
    root = ET.fromstring(data)
    fmt = root.find(NS + 'sheetFormatPr')
    if fmt is None or fmt.get('customHeight') not in (None, '0', 'false'):
        return data
    # Preserve every byte outside this one approved attribute, including row heights.
    pattern = rb'(<(?:[A-Za-z_][\w.-]*:)?sheetFormatPr\b[^>]*?)\sdefaultRowHeight="[^"]*"'
    out, count = re.subn(pattern, rb'\1', data)
    assert count <= 1, 'Ambiguous sheetFormatPr'
    return out

def compare(before, after):
    with zipfile.ZipFile(io.BytesIO(before)) as a, zipfile.ZipFile(io.BytesIO(after)) as b:
        names = a.namelist()
        assert len(names) == len(set(names)), 'Duplicate ZIP entry'
        assert len(b.namelist()) == len(set(b.namelist())), 'Duplicate ZIP entry'
        assert set(names) == set(b.namelist()), 'OOXML parts changed'
        derived = []
        for name in names:
            left, right = a.read(name), b.read(name)
            assert normalize(name, left) == normalize(name, right), 'OOXML changed: ' + name
            if left != right:
                derived.append(name)
        return {'equivalent': True, 'allowedMetadataParts': derived}

if __name__ == '__main__':
    value = json.load(sys.stdin)
    print(json.dumps(compare(base64.b64decode(value['before'], validate=True),
                             base64.b64decode(value['after'], validate=True))))
