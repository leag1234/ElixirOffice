/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */
#include "pdf-edit.h"
#include "pdf-preservation.h"
#include "PdfFile/OnlineOfficeBinToPdf.h"
#include "PdfFile/PdfReader.h"
#include "PdfFile/lib/xpdf/PDFDoc.h"
#include "PdfFile/lib/xpdf/Catalog.h"
#include "PdfFile/lib/xpdf/XRef.h"
#include "PdfFile/lib/xpdf/Dict.h"
#include "DesktopEditor/common/File.h"
#include <cstring>
#include <cmath>
#include <vector>
namespace {
const unsigned int maxBytes=128*1024*1024;
const char* inspectObject(Object& obj,int depth,int& budget) {
 if(depth>32 || --budget<0)return "complexity";
 if(obj.isName("Sig"))return "signature";
 Dict* dict=obj.isDict()?obj.getDict():(obj.isStream()?obj.streamGetDict():nullptr);
 if(dict) {
  Object type,subtype,rect;dict->lookup("Type",&type);dict->lookup("Subtype",&subtype);dict->lookup("Rect",&rect);
  bool annotation=type.isName("Annot") || (subtype.isName() && rect.isArray());rect.free();
  if(annotation){
   const char* allowed[]={"Text","Widget","Link","Highlight","Underline","StrikeOut","Squiggly","Ink","Line","Square","Circle","Polygon","PolyLine","FreeText","Popup"};
   bool known=false;for(const char* name:allowed)if(subtype.isName(name))known=true;
   type.free();subtype.free();if(!known)return "annotation";
  }else{type.free();subtype.free();}
  for(int i=0;i<dict->getLength();++i) {
   const char* key=dict->getKey(i);
   if(std::strcmp(key,"XFA")==0)return "xfa";
   if(std::strcmp(key,"JS")==0 || std::strcmp(key,"AA")==0)return "scripted";
   if(std::strcmp(key,"Linearized")==0)return "linearized";
   if(std::strcmp(key,"ByteRange")==0)return "signature";
   Object child;
   if(std::strcmp(key,"FT")==0)dict->getVal(i,&child);else dict->getValNF(i,&child);
   const char* reason=nullptr;
   if(child.isName("Sig"))reason="signature";
   else if(std::strcmp(key,"FT")==0 && child.isName() && !child.isName("Tx"))reason="form";
   if(!reason)reason=inspectObject(child,depth+1,budget);
   child.free();if(reason)return reason;
  }
 } else if(obj.isArray()) {
  for(int i=0;i<obj.arrayGetLength();++i) {
   Object child;obj.arrayGetNF(i,&child);
   const char* reason=inspectObject(child,depth+1,budget);
   child.free();if(reason)return reason;
  }
 }
 return nullptr;
}
bool destination(Object& value,Catalog* catalog) {
 Object array;
 if(value.isDict()){
  if(value.dictGetLength()!=1 || std::strcmp(value.dictGetKey(0),"D")!=0)return false;
  value.dictLookup("D",&array);
 }else value.copy(&array);
 if(!array.isArray() || array.arrayGetLength()<2 || array.arrayGetLength()>6){array.free();return false;}
 Object page,mode;array.arrayGetNF(0,&page);array.arrayGet(1,&mode);
 bool ok=page.isRef() && catalog->findPage(page.getRef().num,page.getRef().gen)>0;
 int length=0;
 if(mode.isName("Fit")||mode.isName("FitB"))length=2;
 else if(mode.isName("FitH")||mode.isName("FitBH")||mode.isName("FitV")||mode.isName("FitBV"))length=3;
 else if(mode.isName("XYZ"))length=5;
 else if(mode.isName("FitR"))length=6;
 ok=ok && length && array.arrayGetLength()==length;
 for(int i=2;ok && i<length;++i){
  Object coordinate;array.arrayGet(i,&coordinate);
  ok=(coordinate.isNum() && std::isfinite(coordinate.getNum())) || (coordinate.isNull() && !mode.isName("FitR"));coordinate.free();
 }
 page.free();mode.free();array.free();return ok;
}
bool destinationTree(Object& node,Catalog* catalog,int depth,int& budget) {
 if(depth>16 || --budget<0 || !node.isDict())return false;
 for(int i=0;i<node.dictGetLength();++i){
  const char* key=node.dictGetKey(i);
  if(std::strcmp(key,"Kids") && std::strcmp(key,"Names") && std::strcmp(key,"Limits"))return false;
 }
 Object kids,names,limits;node.dictLookup("Kids",&kids);node.dictLookup("Names",&names);node.dictLookup("Limits",&limits);
 bool ok=limits.isNull() || (limits.isArray() && limits.arrayGetLength()==2);
 if(ok && limits.isArray()){
  for(int i=0;i<2;++i){Object bound;limits.arrayGet(i,&bound);ok=ok&&bound.isString();bound.free();}
 }
 if(ok && kids.isArray() && names.isNull()){
  ok=kids.arrayGetLength()>0 && kids.arrayGetLength()<=20000;
  for(int i=0;ok && i<kids.arrayGetLength();++i){Object child;kids.arrayGet(i,&child);ok=destinationTree(child,catalog,depth+1,budget);child.free();}
 }else if(ok && names.isArray() && kids.isNull()){
  ok=names.arrayGetLength()>0 && names.arrayGetLength()%2==0 && names.arrayGetLength()<=40000;
  for(int i=0;ok && i<names.arrayGetLength();i+=2){
   Object name,target;names.arrayGet(i,&name);names.arrayGet(i+1,&target);
   ok=--budget>=0 && name.isString() && destination(target,catalog);name.free();target.free();
  }
 }else ok=false;
 kids.free();names.free();limits.free();return ok;
}
bool namedDestinations(Object& catalog,PDFDoc* doc) {
 Object names;catalog.dictLookup("Names",&names);
 if(names.isNull()){names.free();return true;}
 bool ok=names.isDict() && names.dictGetLength()==1 && std::strcmp(names.dictGetKey(0),"Dests")==0;
 if(ok){
  Object tree;names.dictLookup("Dests",&tree);int budget=20000;
  ok=destinationTree(tree,doc->getCatalog(),0,budget);tree.free();
 }
 names.free();return ok;
}
const char* inspect(CPdfReader& reader,NSFonts::IApplicationFonts* fonts,const std::wstring& file=L"/p/in.pdf") {
 if(!reader.LoadFromFile(fonts,file))return "protected-or-invalid";
 PDFDoc* doc=reader.GetPDFDocument(0);
 if(!doc || doc->isEncrypted())return "encrypted";
 if(!doc->okToChange() || !doc->okToAddNotes())return "permissions";
 if(doc->getNumPages()<1 || doc->getNumPages()>2000)return "page-limit";
 XRef* xref=doc->getXRef();if(!xref || xref->getNumObjects()>200000)return "complexity";
 Object catalog;xref->getCatalog(&catalog);
 if(!catalog.isDict()){catalog.free();return "catalog";}
 const char* allowed[]={"Type","Pages","Outlines","AcroForm","Metadata","Lang","Version","PageLayout","PageMode","ViewerPreferences","Names"};
 for(int i=0;i<catalog.dictGetLength();++i) {
  bool known=false;
  for(const char* key:allowed)if(std::strcmp(catalog.dictGetKey(i),key)==0)known=true;
  if(!known){catalog.free();return "unsupported-catalog";}
 }
 if(!namedDestinations(catalog,doc)){catalog.free();return "unsupported-catalog";}
 Object acroForm,sigFlags;sigFlags.initNull();catalog.dictLookup("AcroForm",&acroForm);
 if(acroForm.isDict())acroForm.dictLookup("SigFlags",&sigFlags);
 bool signedFlag=!sigFlags.isNull() && !(sigFlags.isInt() && sigFlags.getInt()==0);
 sigFlags.free();acroForm.free();catalog.free();if(signedFlag)return "signature";
 int budget=500000;
 for(int i=1;i<xref->getNumObjects();++i) {
  XRefEntry* entry=xref->getEntry(i);if(entry->type==xrefEntryFree)continue;
  Object obj;xref->fetch(i,entry->type==xrefEntryCompressed?0:entry->gen,&obj);
  const char* reason=inspectObject(obj,0,budget);obj.free();if(reason)return reason;
 }
 return nullptr;
}
bool read(const wchar_t* file,std::vector<BYTE>& bytes,unsigned int limit) {
 NSFile::CFileBinary input;
 if(!input.OpenFile(file))return false;
 auto size=input.GetFileSize();if(size<5 || size>limit)return false;
 bytes.resize(size);return input.ReadFile(bytes.data(),size);
}
void policy(const char* reason) {
 std::string value=std::string("{\"writable\":")+(reason?"false":"true")+",\"reason\":\""+(reason?reason:"")+"\",\"writer\":\"original-append\",\"reorderSafe\":"+(reason?"false":"true")+"}";
 NSFile::CFileBinary file;if(file.CreateFileW(L"/p/policy.json"))file.WriteFile(reinterpret_cast<BYTE*>(&value[0]),value.size());
}
}
int elixirPdfEdit(bool inspectOnly) {
 policy("writer-failure");
 std::vector<BYTE> input;if(!read(L"/p/in.pdf",input,maxBytes)){policy("size-or-invalid");return inspectOnly?0:2;}
 NSFonts::IApplicationFonts* fonts=NSFonts::NSApplication::Create();
 fonts->InitializeFromFolder(L"/fonts");
 bool ok=false;
 {
  CPdfReader reader(fonts);const char* reason=inspect(reader,fonts);
  policy(reason?reason:(inspectOnly?nullptr:"writer-failure"));
  const int inputPages=reason?0:reader.GetPDFDocument(0)->getNumPages();
  if(!reason && !inspectOnly) {
   CPdfFile pdf(fonts);pdf.SetTempDirectory(L"/tmp/pdf");
   if(pdf.LoadFromFile(L"/p/in.pdf") && pdf.EditPdf(L"/p/out.pdf")) {
    std::vector<BYTE> changes;
    NSFile::CFileBinary probe;
    if(!probe.OpenFile(L"/p/changes.bin"))ok=true;
    else if(read(L"/p/changes.bin",changes,64*1024*1024) && changes[0]=='%' && changes[1]=='P' && changes[2]=='D' && changes[3]=='F') {
     CConvertFromBinParams params;params.m_sMediaDirectory=L"/p";
     ok=S_OK==pdf.AddToPdfFromBinary(changes.data()+4,changes.size()-4,&params);
    }
    if(ok)pdf.EditClose();
   }
   std::vector<BYTE> output;
   // Keep policy false until both independent parsing and preservation checks pass.
   ok=ok && read(L"/p/out.pdf",output,256*1024*1024);
   if(ok){
    CPdfReader outputReader(fonts);const char* outputReason=inspect(outputReader,fonts,L"/p/out.pdf");
    if(!outputReason)outputReason=elixirPdfPreservation(input.data(),input.size(),output.data(),output.size(),inputPages,outputReader.GetPDFDocument(0)->getNumPages());
    policy(outputReason);ok=!outputReason;
   }
  }
 }
 fonts->Release();
 return inspectOnly?0:(ok?0:2);
}
