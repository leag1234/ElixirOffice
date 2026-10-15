/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
#pragma once
#include <cstddef>
#include <cstring>
// Shared by the native writer and a fault-injected writer unit.
inline const char* elixirPdfPreservation(const unsigned char* input,std::size_t inputSize,
 const unsigned char* output,std::size_t outputSize,int inputPages,int outputPages) {
 if(!input || !output || outputSize<inputSize || std::memcmp(input,output,inputSize)!=0)return "original-changed";
 if(inputPages<1 || outputPages!=inputPages)return "page-count-changed";
 return nullptr;
}
