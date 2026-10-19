// SPDX-License-Identifier: AGPL-3.0-only
#include "DesktopEditor/xml/include/xmlutils.h"
#include "DesktopEditor/xml/src/xmllight_private.h"
#include <libxml/parserInternals.h>
#include <libxml/xmlIO.h>
#include <algorithm>
#include <cstring>
#include <cstdlib>
#include <string>
static int opens=0;
static const char sentinel[]="PUBLIC_EXTERNAL_SENTINEL";
static int match(const char* uri){return uri&&std::strstr(uri,"public-external");}
static void* openInput(const char*){++opens;return new size_t(0);}
static int readInput(void* context,char* output,int size){
 size_t& at=*static_cast<size_t*>(context);
 size_t count=std::min(size_t(size),sizeof(sentinel)-1-at);
 std::memcpy(output,sentinel+at,count);at+=count;return int(count);
}
static int closeInput(void* context){delete static_cast<size_t*>(context);return 0;}
class ProductReader:public XmlUtils::CXmlLiteReader{
public:xmlTextReaderPtr native(){return m_pInternal->getNativeReader();}
};
int main(int argc,char** argv){
 if(argc!=2)return 64;
 xmlRegisterInputCallbacks(match,openInput,readInput,closeInput);
 std::string mode(argv[1]);
 if(mode=="nonet-root-http"||mode=="nonet-root-ftp"){
  xmlParserCtxtPtr ctxt=xmlNewParserCtxt();ctxt->options=XML_PARSE_NONET;ctxt->input_id=1;
  auto input=xmlNoNetExternalEntityLoader(mode=="nonet-root-ftp"?"ftp://public-external.invalid/entity":"http://public-external.invalid/entity",nullptr,ctxt);
  if(input)xmlFreeInputStream(input);
  xmlFreeParserCtxt(ctxt);return opens?1:0;
 }
 const std::string hostile="<!DOCTYPE root [<!ENTITY ext SYSTEM \"file:///public-external.txt\">]><root>&ext;</root>";
 if(mode=="reader-memory"||mode=="reader-restart"||mode=="reader-network"||mode=="reader-wide"||mode=="reader-buffer"||mode=="reader-file"||mode=="reader-dtd-file"||mode=="reader-dtd-network"){
  ProductReader reader;std::string xml=hostile;
  if(mode=="reader-network")xml="<!DOCTYPE root [<!ENTITY ext SYSTEM \"http://public-external.invalid/entity\">]><root>&ext;</root>";
  if(mode=="reader-dtd-file")xml="<!DOCTYPE root SYSTEM \"file:///public-external.dtd\"><root/>";
  if(mode=="reader-dtd-network")xml="<!DOCTYPE root SYSTEM \"http://public-external.invalid/public-external.dtd\"><root/>";
  bool initialized;
  if(mode=="reader-wide")initialized=reader.FromString(std::wstring(xml.begin(),xml.end()));
  else if(mode=="reader-buffer")initialized=reader.FromStringA(xml.data(),int(xml.size()));
  else if(mode=="reader-file"){
   const char* path=std::getenv("EO_XML_WRAPPER_FILE");if(!path)return 64;
   initialized=reader.FromFile(std::wstring(path,path+std::strlen(path)));
  }else initialized=reader.FromStringA(xml);
  if(!initialized)return 1;
  if(mode=="reader-restart"&&!reader.MoveToStart())return 1;
  xmlTextReaderSetParserProp(reader.native(),XML_PARSER_LOADDTD,1);
  xmlTextReaderSetParserProp(reader.native(),XML_PARSER_SUBST_ENTITIES,1);
  while(xmlTextReaderRead(reader.native())==1){}
  return opens?1:0;
 }
 if(mode=="reader-plain"){
  ProductReader reader;
  if(!reader.FromStringA("<root>PUBLIC_INTERNAL_FIXTURE</root>"))return 1;
  bool found=false;while(xmlTextReaderRead(reader.native())==1){const xmlChar* value=xmlTextReaderConstValue(reader.native());found|=value&&!xmlStrcmp(value,BAD_CAST"PUBLIC_INTERNAL_FIXTURE");}
  return !found||opens;
 }
 if(mode=="canonical-plain"||mode=="canonical-hostile"){
  const std::string xml=mode=="canonical-plain"?"<root>PUBLIC_INTERNAL_FIXTURE</root>":hostile;
  xmlSubstituteEntitiesDefault(1);const auto out=XmlUtils::NSXmlCanonicalizator::Execute(xml);xmlSubstituteEntitiesDefault(0);
  return opens||out.find("PUBLIC_EXTERNAL_SENTINEL")!=std::string::npos||(mode=="canonical-plain"&&out.find("PUBLIC_INTERNAL_FIXTURE")==std::string::npos);
 }
 if(mode=="dom-hostile"){
  xmlSubstituteEntitiesDefault(1);XmlUtils::CXmlNode node;node.FromXmlStringA(hostile);
  bool leaked=node.GetText().find(L"PUBLIC_EXTERNAL_SENTINEL")!=std::wstring::npos;
  xmlSubstituteEntitiesDefault(0);return leaked||opens;
 }
 if(mode=="dom-plain"||mode=="dom-xinclude-not-executed"){
  XmlUtils::CXmlNode node;
  std::wstring xml=mode=="dom-plain"?L"<root>PUBLIC_INTERNAL_FIXTURE</root>":L"<root xmlns:xi=\"http://www.w3.org/2001/XInclude\">PUBLIC_INTERNAL_FIXTURE<xi:include href=\"file:///public-external.txt\" parse=\"text\"/></root>";
  return !node.FromXmlString(xml)||node.GetText().find(L"PUBLIC_INTERNAL_FIXTURE")==std::wstring::npos||opens;
 }
 return 64;
}
