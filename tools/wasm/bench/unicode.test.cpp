/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
#include "UnicodeConverter/UnicodeConverter.h"
#include <cassert>
#include <cstdio>
#include <string>
int main()
{
 NSUnicodeConverter::CUnicodeConverter converter;
 const std::wstring cases[]={L"ASCII",L"café Ελληνικά العربية 中文",L"\U0001F44B",L"a\U0001F44Bb",L""};
 for(const auto& text:cases){
  const auto bytes=converter.fromUnicode(text,"UTF-8");
  assert(converter.toUnicode(bytes,"UTF-8")==text);
  assert(converter.toUnicode(bytes,65001)==text);
  const auto utf16=converter.fromUnicode(text,"UTF-16LE");
  assert(converter.toUnicode(utf16,"UTF-16LE")==text);
  assert(converter.toUnicode(utf16,1200)==text);
 }
 assert(converter.fromUnicode(L"café \U0001F44B","UTF-8")==u8"café \U0001F44B");
 std::puts("PASS actual CUnicodeConverter UTF8/UTF16 name/codepage, multilingual and supplementary scalars");
}
