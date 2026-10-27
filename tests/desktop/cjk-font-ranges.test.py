# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util
import json
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[2] / "tools/desktop/cjk-font-ranges.py"
SPEC = importlib.util.spec_from_file_location("cjk_font_ranges", MODULE)
CJK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CJK)


class CjkFontRanges(unittest.TestCase):
    def test_lazy_and_pdf_trigger_ranges_cover_pinned_cjk_scripts(self):
        for codepoint in (0x1100, 0x11FF, 0x3042, 0x4E00, 0xAC00, 0xFF61, 0xFF76, 0xFF9F):
            self.assertTrue(CJK.is_cjk(codepoint), hex(codepoint))
        for codepoint in (0x0041, 0x03A9, 0x1F9D1):
            self.assertFalse(CJK.is_cjk(codepoint), hex(codepoint))
        self.assertIn("CJK_TRIGGER_RANGES", CJK.LAZY_LOADER)

    def test_script_ranges_select_regional_faces(self):
        infos = [["Other"], ["Noto Sans CJK HK"], ["Noto Sans CJK JP"],
                 ["Noto Sans CJK SC"], ["Noto Sans CJK TC"], ["Noto Sans CJK KR"],
                 ["Noto Sans Mono CJK HK"], ["Noto Sans Mono CJK JP"],
                 ["Noto Sans Mono CJK SC"], ["Noto Sans Mono CJK TC"],
                 ["Noto Sans Mono CJK KR"]]
        ranges = [0x3040, 0x30FF, 1, 0x3100, 0x312F, 1, 0x4E00, 0x9FFF, 1,
                  0xAC00, 0xD7AF, 1, 0x20, 0x7E, 0]
        source = ('window["__fonts_infos"]=' + json.dumps(infos) + ';\n' +
                  'window["__fonts_ranges"]=' + json.dumps(ranges) + ';\n')
        updated, changed = CJK.rewrite(source)
        _, actual = CJK.assignment(updated, "__fonts_ranges")
        self.assertEqual(actual, [0x3040, 0x30FF, 2, 0x3100, 0x312F, 4,
                                  0x4E00, 0x9FFF, 3, 0xAC00, 0xD7AF, 5,
                                  0x20, 0x7E, 0])
        self.assertEqual(changed, {"JP": 1, "SC": 1, "TC": 1, "KR": 1})
        _, aliased = CJK.assignment(updated, "__fonts_infos")
        self.assertEqual(aliased[2][0], "Elixir Fallback CJK JP")
        self.assertEqual(aliased[7][0], "Elixir Fallback Mono CJK JP")
        self.assertIn("__elixirCjkLazy", updated)
        self.assertIn("if(attempt<1200)", updated)
        self.assertIn("app.FontPickerMap[alias]=aliasFile", updated)
        self.assertIn("get_OfflineApp", updated)
        self.assertIn("wrapped.__elixirCjkInput=true", updated)
        self.assertIn("counter.m_bLoad||counter.m_bRead", updated)
        self.assertIn("info.CheckFontLoadStyles(activeLoader)", updated)
        self.assertIn("editor.WordControl.OnResize(true)", updated)
        self.assertNotIn("service.__elixirCjkPdf", updated)

    def test_missing_region_or_coverage_fails_closed(self):
        infos = [["Noto Sans CJK JP"], ["Noto Sans CJK SC"], ["Noto Sans CJK TC"]]
        source = ('window["__fonts_infos"]=' + json.dumps(infos) + ';\n' +
                  'window["__fonts_ranges"]=[12352,12543,0];\n')
        with self.assertRaisesRegex(ValueError, "ten pan-CJK"):
            CJK.rewrite(source)


if __name__ == "__main__":
    unittest.main()
