// SPDX-License-Identifier: AGPL-3.0-only
#include "UnicodeConverter.h"
#include <cassert>
#include <iostream>
int main()
{
    NSUnicodeConverter::CUnicodeConverter converter;
    const std::wstring text = L"ASCII é — Ελληνικά 中文 😀";
    const std::string utf8 = u8"ASCII é — Ελληνικά 中文 😀";
    for (const char* name : {"UTF-8", "utf-8", "UTF8", "utf8"})
    {
        assert(converter.fromUnicode(text, name) == utf8);
        assert(converter.toUnicode(utf8, name, true) == text);
        assert(converter.toUnicode(utf8, name, false) == text);
    }
    assert(converter.toUnicode(utf8, 65001, true) == text);
    assert(converter.toUnicode(utf8, 65001, false) == text);
    for (bool exact : {false, true})
    {
        assert(converter.toUnicode(static_cast<const char*>(nullptr), 0, 65001, exact).empty());
        assert(converter.toUnicode(static_cast<const char*>(nullptr), 1, 65001, exact).empty());
        assert(converter.toUnicode("ignored", 0, 65001, exact).empty());
    }
    assert(converter.fromUnicode(L"", "UTF-8").empty());
    assert(converter.toUnicode("", "UTF-8", true).empty());
    // Other converter names retain the previous Latin-1 representation.
    assert(converter.fromUnicode(L"é", "ISO-8859-1") == std::string(1, '\xe9'));
    std::cout << "PASS UTF-8 ASCII/diacritics/non-Latin/supplementary aliases, numeric65001, empty and Latin-1 boundary\n";
}
