/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// PDF-only entry point for the browser worker's fixed in-memory paths.
#include "PdfFile/OnlineOfficeBinToPdf.h"
#include "pdf-edit.h"
#include <cstring>
#include <cstdlib>
int main(int argc, char** argv)
{
    setenv("APPLICATION_NAME", "ElixirOffice", 1);
    if (argc == 2 && std::strcmp(argv[1], "--inspect-pdf") == 0) return elixirPdfEdit(true);
    if (argc == 2 && std::strcmp(argv[1], "--edit-pdf") == 0) return elixirPdfEdit(false);
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
