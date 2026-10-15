#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate local PDF messages from the existing desktop locale catalogs."""
import argparse,json
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('out',type=Path)
args=parser.parse_args()
catalogs=json.loads(Path(__file__).with_name('i18n-extra.json').read_text())
selected={language:{key:value for key,value in strings.items() if key.startswith('pdfReason') or key in ['pdfSaveCopy','pdfReadOnlyState']} for language,strings in catalogs.items()}
args.out.write_text('/* SPDX-License-Identifier: AGPL-3.0-only */\n'+
 'define([],function(){\n var catalogs='+json.dumps(selected,ensure_ascii=False,separators=(',',':'))+';\n'+
 ' var keys='+json.dumps({'complexity': 'pdfReasonComplexity', 'signature': 'pdfReasonSignature', 'annotation': 'pdfReasonAnnotation', 'xfa': 'pdfReasonXfa', 'scripted': 'pdfReasonScript', 'linearized': 'pdfReasonLinearized', 'form': 'pdfReasonForm', 'protected-or-invalid': 'pdfReasonInvalid', 'encrypted': 'pdfReasonEncrypted', 'permissions': 'pdfReasonPermissions', 'page-limit': 'pdfReasonPages', 'catalog': 'pdfReasonCatalog', 'unsupported-catalog': 'pdfReasonCatalogUnsupported', 'size-or-invalid': 'pdfReasonSize', 'writer-failure': 'pdfReasonWriter', 'original-changed': 'pdfReasonOriginal', 'page-count-changed': 'pdfReasonPageCount', 'runtime-unavailable': 'pdfReasonRuntime', 'cancelled': 'pdfReasonCancelled', 'timeout': 'pdfReasonTimeout'})+';\n'+
 " function message(reason,language,strings){language=String(language||'en').toLowerCase().replace(/_/g,'-');var local=catalogs[language]||catalogs[language.split('-')[0]]||catalogs.en,key=keys[reason]||keys['runtime-unavailable'];strings=strings||local;return (strings[key]||local[key]||catalogs.en[key])+' '+(strings.pdfSaveCopy||local.pdfSaveCopy||catalogs.en.pdfSaveCopy); }\n function readOnlyMessage(reason,language,strings){language=String(language||'en').toLowerCase().replace(/_/g,'-');var local=catalogs[language]||catalogs[language.split('-')[0]]||catalogs.en;return ((strings&&strings.pdfReadOnlyState)||local.pdfReadOnlyState||catalogs.en.pdfReadOnlyState)+' '+message(reason,language,strings); }\n return {message:message,readOnlyMessage:readOnlyMessage,catalogs:catalogs};\n});\n")
