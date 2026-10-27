#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Assign generated CJK fallback ranges to script-appropriate Noto CJK faces."""

import argparse
import json
import re
from pathlib import Path


CJK_TRIGGER_RANGES = (
    (0x1100, 0x11FF), (0x2E80, 0xA4CF), (0xAC00, 0xD7FF),
    (0xF900, 0xFAFF), (0xFF61, 0xFF9F), (0x20000, 0x323AF),
)


def is_cjk(codepoint):
    return any(low <= codepoint <= high for low, high in CJK_TRIGGER_RANGES)

LAZY_LOADER = r'''
;(function(){
 function install(attempt){
  var picker=window.AscFonts&&window.AscFonts.FontPickerByCharacter;
  var app=window.AscFonts&&(window.AscFonts.g_fontApplication||window.g_fontApplication);
  var editor=window.Asc&&window.Asc.editor;
  var loader=window.AscCommon&&window.AscCommon.g_font_loader;
  if(!picker||!app||!app.FontPickerMap||!app.GetFontFileWeb||!editor||!editor.asc_enterText||!editor.DocInfo||!editor.DocInfo.get_OfflineApp||!loader){
   if(attempt<1200)setTimeout(function(){install(attempt+1);},25);
   return;
  }
  if(picker.__elixirCjkLazy)return;
  var requested=false;
  var families=['Elixir Fallback CJK JP','Elixir Fallback CJK SC','Elixir Fallback CJK TC','Elixir Fallback CJK KR'];
  var aliases=[['Elixir Fallback CJK JP','Noto Sans CJK JP'],['Elixir Fallback CJK KR','Noto Sans CJK KR'],['Elixir Fallback CJK SC','Noto Sans CJK SC'],['Elixir Fallback CJK TC','Noto Sans CJK TC'],['Elixir Fallback CJK HK','Noto Sans CJK HK'],['Elixir Fallback Mono CJK JP','Noto Sans Mono CJK JP'],['Elixir Fallback Mono CJK KR','Noto Sans Mono CJK KR'],['Elixir Fallback Mono CJK SC','Noto Sans Mono CJK SC'],['Elixir Fallback Mono CJK TC','Noto Sans Mono CJK TC'],['Elixir Fallback Mono CJK HK','Noto Sans Mono CJK HK']];
  for(var aliasIndex=0;aliasIndex<aliases.length;aliasIndex++){
   var alias=aliases[aliasIndex][0],mapped=app.GetFontFileWeb(aliases[aliasIndex][1],0);
   if(mapped){var aliasFile=Object.create(mapped);aliasFile.m_wsFontName=alias;app.FontPickerMap[alias]=aliasFile;}
  }
  var CJK_TRIGGER_RANGES=__CJK_TRIGGER_RANGES__;
  function isCjk(codepoint){for(var rangeIndex=0;rangeIndex<CJK_TRIGGER_RANGES.length;rangeIndex++)if(codepoint>=CJK_TRIGGER_RANGES[rangeIndex][0]&&codepoint<=CJK_TRIGGER_RANGES[rangeIndex][1])return true;return false;}
  function containsCjk(value,isCodes){
   if(isCodes){for(var i=0;i<value.length;i++)if(isCjk(value[i]))return true;return false;}
   for(var offset=0;offset<value.length;offset++){var codepoint=value.charCodeAt(offset);if(codepoint>=0xD800&&codepoint<=0xDBFF&&offset+1<value.length)codepoint=((codepoint-0xD800)<<10)+(value.charCodeAt(++offset)-0xDC00)+0x10000;if(isCjk(codepoint))return true;}
   return false;
  }
  function request(){
   if(!requested&&editor.DocInfo.get_OfflineApp()){
    requested=true;
    picker.__elixirCjkLoadState='requested';
    var load=function(){
     var activeLoader=window.AscCommon&&window.AscCommon.g_font_loader;
     if(!activeLoader){requested=false;return;}
     if(activeLoader.isWorking&&activeLoader.isWorking()){picker.__elixirCjkLoadState='waiting';setTimeout(load,25);return;}
     var files=[];
     for(var i=0;i<families.length;i++){
      var index=window.AscFonts.g_map_font_index[families[i]],info=window.AscFonts.g_font_infos[index];
      if(!info)continue;
      info.NeedStyles=15;info.CheckFontLoadStyles(activeLoader);
      for(var style=0;style<2;style++){var id=info.GetFontID(activeLoader,style);if(id&&id.file&&files.indexOf(id.file)===-1)files.push(id.file);}
     }
     picker.__elixirCjkLoadState='loading';
     var checks=0,finish=function(){
      for(var i=0;i<files.length;i++)if(files[i].Status!==0){if(checks++<1200){setTimeout(finish,25);return;}picker.__elixirCjkLoadState='failed';requested=false;return;}
      picker.__elixirCjkLoadState='loaded';
      if(editor.WordControl&&editor.WordControl.OnResize)editor.WordControl.OnResize(true);
     };
     finish();
    };
    setTimeout(load,0);
   }
  }
  var originalString=picker.getFontsByString,originalCodes=picker.getFontsByString2,originalSymbol=picker.getFontBySymbol;
  picker.getFontsByString=function(value){var result=originalString.apply(this,arguments);if(value&&containsCjk(value,false))request();return result;};
  picker.getFontsByString2=function(value){var result=originalCodes.apply(this,arguments);if(value&&containsCjk(value,true))request();return result;};
  picker.getFontBySymbol=function(codepoint){var result=originalSymbol.apply(this,arguments),counter=window.AscCommon&&window.AscCommon.g_oIdCounter;if(isCjk(codepoint)&&(editor.isDocumentLoadComplete||(counter&&(counter.m_bLoad||counter.m_bRead))))request();return result;};
  function wrapEnter(attempt){
   var active=window.Asc&&window.Asc.editor,current=active&&active.asc_enterText;
   if(current&&!current.__elixirCjkInput){var wrapped=function(value){if(value&&containsCjk(value,typeof value!=='string'))request();return current.apply(this,arguments);};wrapped.__elixirCjkInput=true;active.asc_enterText=wrapped;}
   if(attempt<1200)setTimeout(function(){wrapEnter(attempt+1);},25);
  }
  wrapEnter(0);
  picker.__elixirCjkLazy=true;
 }
 install(0);
})();
'''


def overlaps(start, end, low, high):
    return start <= high and end >= low


def region(start, end):
    if any(overlaps(start, end, low, high) for low, high in (
            (0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F),
            (0xAC00, 0xD7AF), (0xD7B0, 0xD7FF))):
        return "KR"
    if any(overlaps(start, end, low, high) for low, high in (
            (0x3040, 0x30FF), (0x31F0, 0x31FF), (0xFF61, 0xFF9F), (0x1B000, 0x1B16F))):
        return "JP"
    if any(overlaps(start, end, low, high) for low, high in (
            (0x3100, 0x312F), (0x31A0, 0x31BF))):
        return "TC"
    return "SC"


def assignment(source, name):
    match = re.search(r'(window\["' + re.escape(name) + r'"\]\s*=\s*)(\[[\s\S]*?\])(\s*;)', source)
    if not match:
        raise ValueError("Missing generated font metadata: " + name)
    return match, json.loads(match.group(2))


def rewrite(source):
    info_match, infos = assignment(source, "__fonts_infos")
    aliases = 0
    for info in infos:
        if info[0].startswith("Noto Sans CJK "):
            info[0] = info[0].replace("Noto Sans CJK ", "Elixir Fallback CJK ", 1)
            aliases += 1
        elif info[0].startswith("Noto Sans Mono CJK "):
            info[0] = info[0].replace("Noto Sans Mono CJK ", "Elixir Fallback Mono CJK ", 1)
            aliases += 1
    if aliases != 10:
        raise ValueError("Generated metadata must contain ten pan-CJK collection faces")
    source = source[:info_match.start(2)] + json.dumps(infos, separators=(",", ":")) + source[info_match.end(2):]
    match, ranges = assignment(source, "__fonts_ranges")
    indexes = {info[0]: index for index, info in enumerate(infos)}
    required = {suffix: indexes.get("Elixir Fallback CJK " + suffix) for suffix in ("JP", "SC", "TC", "KR")}
    if any(index is None for index in required.values()):
        raise ValueError("Generated metadata is missing a regional Noto Sans CJK face")
    changed = {suffix: 0 for suffix in required}
    for offset in range(0, len(ranges), 3):
        family = infos[ranges[offset + 2]][0]
        if not family.startswith("Elixir Fallback CJK "):
            continue
        suffix = region(ranges[offset], ranges[offset + 1])
        ranges[offset + 2] = required[suffix]
        changed[suffix] += 1
    if not all(changed.values()):
        raise ValueError("Generated CJK coverage did not exercise every regional fallback")
    encoded = json.dumps(ranges, separators=(",", ":"))
    updated = source[:match.start(2)] + encoded + source[match.end(2):]
    if "__elixirCjkLazy" in updated:
        raise ValueError("Generated metadata already contains the CJK lazy loader")
    loader = LAZY_LOADER.replace("__CJK_TRIGGER_RANGES__", json.dumps(CJK_TRIGGER_RANGES, separators=(",", ":")))
    return updated.rstrip() + loader, changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("allfonts", type=Path)
    args = parser.parse_args()
    source = args.allfonts.read_text(encoding="utf-8-sig")
    updated, changed = rewrite(source)
    args.allfonts.write_text(updated, encoding="utf-8", newline="\n")
    print("PASS regional CJK fallback ranges", json.dumps(changed, sort_keys=True))


if __name__ == "__main__":
    main()
