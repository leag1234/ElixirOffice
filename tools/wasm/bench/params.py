# SPDX-License-Identifier: AGPL-3.0-only
"""Shared helpers: x2t task XML and format codes (Common/OfficeFileFormats.h)."""
from xml.sax.saxutils import escape

FMT = {
    "docx": 0x0041, "odt": 0x0043, "pptx": 0x0081, "odp": 0x0083,
    "xlsx": 0x0101, "ods": 0x0103,
    "doct": 0x2001, "xlst": 0x2002, "pptt": 0x2003,
}
# editor format for each office format
CANVAS = {"docx": "doct", "odt": "doct", "xlsx": "xlst", "ods": "xlst", "pptx": "pptt", "odp": "pptt"}
# office format written back from the editor format
BACK = {"doct": "docx", "xlst": "xlsx", "pptt": "pptx"}


def task_xml(src, dst, fmt_to, fonts_js=None, font_dir=None, temp_dir=None, themes=None):
    parts = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<TaskQueueDataConvert>",
        f"<m_sFileFrom>{escape(src)}</m_sFileFrom>",
        f"<m_sFileTo>{escape(dst)}</m_sFileTo>",
        f"<m_nFormatTo>{fmt_to}</m_nFormatTo>",
        "<m_bIsNoBase64>true</m_bIsNoBase64>",
    ]
    if fonts_js:
        parts.append(f"<m_sAllFontsPath>{escape(fonts_js)}</m_sAllFontsPath>")
    if font_dir:
        parts.append(f"<m_sFontDir>{escape(font_dir)}</m_sFontDir>")
    if themes:
        parts.append(f"<m_sThemeDir>{escape(themes)}</m_sThemeDir>")
    if temp_dir:
        parts.append(f"<m_sTempDir>{escape(temp_dir)}</m_sTempDir>")
    parts.append("</TaskQueueDataConvert>")
    return "\n".join(parts)
