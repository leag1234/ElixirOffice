/* SPDX-License-Identifier: AGPL-3.0-only */
#include "../../tools/wasm/cmake/pdf-preservation.h"
#include <cassert>
#include <vector>
#include <cstring>
struct FaultInjectedWriter {
 int pages;
 std::vector<unsigned char> output;
};
int main() {
 const std::vector<unsigned char> input={'%','P','D','F','-','p','u','b','l','i','c'};
 for(int pages:{0,1,2,3}) {
  FaultInjectedWriter writer{pages,input};writer.output.push_back('x');
  const char* reason=elixirPdfPreservation(input.data(),input.size(),writer.output.data(),writer.output.size(),2,writer.pages);
  if(pages==2)assert(!reason);else assert(reason && std::strcmp(reason,"page-count-changed")==0);
 }
 auto output=input;output[0]='x';
 assert(std::strcmp(elixirPdfPreservation(input.data(),input.size(),output.data(),output.size(),2,2),"original-changed")==0);
 assert(elixirPdfPreservation(input.data(),input.size(),input.data(),input.size()-1,2,2));
 assert(elixirPdfPreservation(nullptr,0,input.data(),input.size(),2,2));
}
