// SPDX-License-Identifier: AGPL-3.0-only
#include "OfficeUtils/src/ZipUtilsCP.h"
#include "EpubFile/CEpubFile.h"
#include <string>
#include <iostream>
#include "DesktopEditor/raster/Metafile/svg/CSvgFile.h"
#include "DesktopEditor/graphics/pro/Graphics.h"
#include "DesktopEditor/raster/Metafile/svg/SvgObjects/CText.h"
#include <cstdlib>
#include "DesktopEditor/common/PackagePath.h"
int main(int argc, char** argv) {
 if(argc!=5)return 64;
 auto wide=[](const char* s){std::string a(s);return NSFile::CUtf8Converter::GetUnicodeStringFromUTF8(reinterpret_cast<BYTE*>(a.data()),static_cast<LONG>(a.size()));};
 const std::string mode(argv[1]);
 if(mode=="absolute"){std::wstring out;bool ok=NSPackagePath::Absolute(wide(argv[2]),out);std::wcout<<out<<std::endl;return ok?0:1;}
 if(mode=="zip-load"||mode=="zip-load-memory"){
  BYTE* bytes=nullptr;ULONG size=0;bool ok=false;
  if(mode=="zip-load")ok=ZLibZipUtils::LoadFileFromArchive(wide(argv[2]).c_str(),L"payload",&bytes,size);
  else{BYTE* input=nullptr;DWORD count=0;if(!NSFile::CFileBinary::ReadAllBytes(wide(argv[2]),&input,count))return 1;
   ok=ZLibZipUtils::LoadFileFromArchive(input,count,L"payload",&bytes,size);delete[] input;}
  std::cout<<"LOAD "<<ok<<" "<<size<<std::endl;delete[] bytes;return ok?0:1;
 }
 if(mode=="zip-extract-memory"){
  int count=0;auto callback=[](const std::wstring&,BYTE*,const long&,void* context){++*static_cast<int*>(context);};
  bool ok=ZLibZipUtils::ExtractFiles(wide(argv[2]).c_str(),callback,&count);
  std::cout<<"CALLBACK "<<count<<std::endl;return ok?0:1;
 }
 if(mode=="svg-file"||mode=="svg-string"||mode=="svg-textpath-file"||mode=="svg-textpath-string"){
  NSFonts::IApplicationFonts* appFonts=nullptr;NSFonts::IFontManager* manager=nullptr;
  if(const char* folder=std::getenv("EO_TEST_FONT_DIR")){
   appFonts=NSFonts::NSApplication::Create();appFonts->InitializeFromFolder(wide(folder),false);
   manager=appFonts->GenerateFontManager();NSFonts::IFontsCache* cache=NSFonts::NSFontCache::Create();
   cache->SetStreams(appFonts->GetStreams());manager->SetOwnerCache(cache);
  }
  CSvgFile svg;svg.SetFontManager(manager);bool ok=false;
  if(mode=="svg-file"||mode=="svg-textpath-file")ok=svg.OpenFromFile(wide(argv[2]));
  else{std::wstring text;NSFile::CFileBinary::ReadAllTextUtf8(wide(argv[2]),text);ok=svg.ReadFromWString(text);svg.SetWorkingDirectory(wide(argv[3]));}
  CBgraFrame frame;frame.put_Width(16);frame.put_Height(16);frame.put_Stride(-64);
  BYTE* data=new BYTE[16*16*4]();frame.put_Data(data);
  NSGraphics::IGraphicsRenderer* renderer=NSGraphics::Create();renderer->CreateFromBgraFrame(&frame);
  renderer->SetFontManager(manager);renderer->put_Width(16);renderer->put_Height(16);renderer->SetSwapRGB(false);renderer->BeginCommand(c_nImageType);
  bool drawn=false;
  if(mode=="svg-textpath-file"||mode=="svg-textpath-string"){
   // Exercise the actual textPath object from a valid SVG fragment, independently of parent text layout.
   std::wstring text;NSFile::CFileBinary::ReadAllTextUtf8(wide(argv[2]),text);
   SVG::CSvgReader reader;if(ok&&reader.ReadFromString(text)){
    while(reader.GetName()!="textPath"&&reader.ReadNextNode()){}
    if(reader.GetName()=="textPath"){
     SVG::CTextPath* path=SVG::CObject::Create<SVG::CTextPath>(reader,&svg,nullptr,manager);
     if(path){drawn=path->Draw(renderer,&svg);path->Release();}
    }
   }
  }else drawn=ok&&svg.Draw(renderer,0,0,16,16);
  renderer->EndCommand(c_nImageType);
  std::cout<<"SVG "<<ok<<" "<<drawn<<" PIXEL "<<int(data[0])<<" "<<int(data[1])<<" "<<int(data[2])<<" "<<int(data[3])<<std::endl;
  int red=0;for(int i=0;i<256;++i)if(data[4*i+2]>200&&data[4*i+1]<60&&data[4*i]<70)++red;
  renderer->Release();svg.SetFontManager(nullptr);if(manager)manager->Release();if(appFonts)appFonts->Release();std::cout<<"RED "<<red<<std::endl;return 0;
 }
 if(std::string(argv[1])=="win-component") return NSPackagePath::WindowsComponent(wide(argv[2]))?0:1;
 if(std::string(argv[1])=="zip" || std::string(argv[1])=="zip-flat" || std::string(argv[1])=="zip-clear"){
  int rc=ZLibZipUtils::UnzipToDir(wide(argv[2]).c_str(),wide(argv[3]).c_str(),nullptr,nullptr,std::string(argv[1])=="zip-flat",std::string(argv[1])=="zip-clear");
  std::cout<<"ZIP_RESULT "<<rc<<std::endl;return rc==0?0:1;
 }
 if(std::string(argv[1])=="epub"){
  CEpubFile epub;epub.SetTempDirectory(wide(argv[3]));
  HRESULT rc=epub.Convert(wide(argv[2]),wide(argv[4]),true);
  std::cout<<"EPUB_RESULT "<<rc<<std::endl;return rc==S_OK?0:1;
 }
 return 64;
}
