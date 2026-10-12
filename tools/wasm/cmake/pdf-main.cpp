/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// PDF-only entry point for the browser worker's fixed in-memory paths.
#include "PdfFile/OnlineOfficeBinToPdf.h"
int main()
{
    NSFonts::IApplicationFonts* fonts = NSFonts::NSApplication::Create();
    fonts->InitializeFromFolder(L"/fonts");
    bool ok;
    {
        CPdfFile pdf(fonts);
        pdf.CreatePdf();
        pdf.SetTempDirectory(L"/tmp/pdf");
        CConvertFromBinParams params;
        params.m_sMediaDirectory = L"/p";
        ok = NSOnlineOfficeBinToPdf::ConvertBinToPdf(&pdf, L"/p/in.bin", L"/p/out.pdf", true, &params);
    }
    fonts->Release();
    return ok ? 0 : 1;
}
