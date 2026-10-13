# SPDX-License-Identifier: AGPL-3.0-only
# Derive pristine blanks by changing only their default proofing-language element.
import io,re,zipfile
LANGUAGES=dict(zip(
 'en fr de es it pt pt-pt nl pl ru ja zh zh-tw ar az be bg ca cs da el eu fi gl he hu hy id ko lo lv ms no ro si sk sl sq sr sr-cyrl sv tr uk ur vi'.split(),
 'en-US fr-FR de-DE es-ES it-IT pt-BR pt-PT nl-NL pl-PL ru-RU ja-JP zh-CN zh-TW ar-SA az-Latn-AZ be-BY bg-BG ca-ES cs-CZ da-DK el-GR eu-ES fi-FI gl-ES he-IL hu-HU hy-AM id-ID ko-KR lo-LA lv-LV ms-MY nb-NO ro-RO si-LK sk-SK sl-SI sq-AL sr-Latn-RS sr-Cyrl-RS sv-SE tr-TR uk-UA ur-PK vi-VN'.split()))
def localized(source,locale):
 language=LANGUAGES[locale].encode('ascii')
 out=io.BytesIO()
 with zipfile.ZipFile(source) as original,zipfile.ZipFile(out,'w') as target:
  for entry in original.infolist():
   data=original.read(entry)
   if entry.filename=='word/styles.xml':
    data,count=re.subn(rb'<w:lang\b[^>]*/>',b'<w:lang w:val="'+language+b'" w:bidi="'+language+b'" w:eastAsia="'+language+b'"/>',data)
    assert count==1,'Expected one pristine default-language element'
   target.writestr(entry,data)
 return out.getvalue()
