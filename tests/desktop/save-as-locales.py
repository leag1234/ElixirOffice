#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ElixirOffice contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Validate assembled Save As strings, including all editor format descriptions."""
import json
import sys
from pathlib import Path
assets=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[2]/'desktop/assets'
home=assets/'desktop-home'
languages=json.loads((home/'locales.json').read_text())
assert len(languages)==45
for language in languages:
    strings=json.loads((home/'i18n'/(language+'.json')).read_text())
    for key in ['saveFormat','saveReplace','replace','saveLossRtf','saveLossTxt','saveLossCsv','saveLossPdf']:
        assert isinstance(strings[key],str) and strings[key].strip(),(language,key)
    for suffix in ['Docx','Odt','Rtf','Txt','Xlsx','Ods','Csv','Pptx','Odp','Pdf']:
        for key in ['saveFormat'+suffix,'saveFormat'+suffix+'Desc']:
            assert isinstance(strings[key],str) and strings[key].strip(),(language,key)
print('PASS45 locales:10 format names/descriptions,4 loss warnings, format and overwrite labels')
