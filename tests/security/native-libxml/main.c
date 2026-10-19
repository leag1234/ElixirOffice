// SPDX-License-Identifier: AGPL-3.0-only
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/valid.h>
#include <libxml/xmlreader.h>
#include <libxml/globals.h>
#include <string.h>
#include <stdio.h>
#ifndef EO_XML_FIXTURE_ROOT
#error EO_XML_FIXTURE_ROOT must identify the synthetic fixture directory
#endif
int main(int argc,char **argv) {
 if(argc!=2)return 64;
 xmlDocPtr doc=NULL;

 if(!strcmp(argv[1],"external-subparser-blocked")||!strcmp(argv[1],"external-subparser-control")) {
  xmlParserCtxtPtr ctxt=xmlNewParserCtxt();
  if(!ctxt)return 1;
  doc=xmlNewDoc(BAD_CAST"1.0");
  if(!doc){xmlFreeParserCtxt(ctxt);return 1;}
  ctxt->myDoc=doc;
  int blocked=!strcmp(argv[1],"external-subparser-blocked");
  if(blocked)ctxt->options|=XML_PARSE_NOXXE;
  xmlNodePtr nodes=NULL;
  int result=xmlParseCtxtExternalEntity(ctxt,
    BAD_CAST"file://" EO_XML_FIXTURE_ROOT "/public-external.txt",NULL,&nodes);
  xmlChar *content=nodes?xmlNodeGetContent(nodes):NULL;
  int found=content&&xmlStrstr(content,BAD_CAST"PUBLIC_EXTERNAL_SENTINEL");
  xmlFree(content);xmlFreeNodeList(nodes);
  xmlFreeParserCtxt(ctxt);xmlFreeDoc(doc);xmlCleanupParser();
  return blocked?(found||result==0):(!found||result!=0);
 }
 if(!strcmp(argv[1],"ctxt-file-xxe-blocked")) {
  xmlParserCtxtPtr ctxt=xmlNewParserCtxt();
  if(!ctxt)return 1;
  ctxt->options|=XML_PARSE_NOXXE;
  doc=xmlCtxtReadFile(ctxt,"" EO_XML_FIXTURE_ROOT "/public-document.xml",NULL,XML_PARSE_NOENT|XML_PARSE_NOXXE);
  xmlChar *content=doc?xmlNodeGetContent(xmlDocGetRootElement(doc)):NULL;
  int found=content&&xmlStrstr(content,BAD_CAST"PUBLIC_EXTERNAL_SENTINEL");
  int ok=doc&&!found;
  xmlFree(content);if(doc)xmlFreeDoc(doc);xmlFreeParserCtxt(ctxt);xmlCleanupParser();
  return !ok;
 }

 if(!strcmp(argv[1],"plain")) {
  const char *text="<root a=\"PUBLIC_ATTRIBUTE\"><child>PUBLIC_XML_FIXTURE</child></root>";
  doc=xmlReadMemory(text,strlen(text),"public.xml",NULL,XML_PARSE_NOXXE);
  if(!doc)return 1;
  xmlChar *content=xmlNodeGetContent(xmlDocGetRootElement(doc));
  int ok=content&&!xmlStrcmp(content,BAD_CAST"PUBLIC_XML_FIXTURE");
  xmlFree(content);xmlFreeDoc(doc);xmlCleanupParser();return !ok;
 }
 if(!strcmp(argv[1],"xxe-blocked")||!strcmp(argv[1],"xxe-control")) {
  const char *text="<!DOCTYPE root [<!ENTITY ext SYSTEM \"file://" EO_XML_FIXTURE_ROOT "/public-external.txt\">]><root>&ext;</root>";
  int options=XML_PARSE_NOENT|XML_PARSE_DTDLOAD;
  int blocked=!strcmp(argv[1],"xxe-blocked");
  if(blocked)options|=XML_PARSE_NOXXE;
  doc=xmlReadMemory(text,strlen(text),"public.xml",NULL,options);
  xmlChar *content=doc?xmlNodeGetContent(xmlDocGetRootElement(doc)):NULL;
  int found=content&&xmlStrstr(content,BAD_CAST"PUBLIC_EXTERNAL_SENTINEL");
  xmlFree(content);if(doc)xmlFreeDoc(doc);xmlCleanupParser();
  return blocked?found:!found;
 }

 if(!strcmp(argv[1],"internal-entity")) {
  const char *text="<!DOCTYPE root [<!ENTITY inside \"PUBLIC_INTERNAL_SENTINEL\">]><root>&inside;</root>";
  doc=xmlReadMemory(text,strlen(text),"public.xml",NULL,XML_PARSE_NOENT|XML_PARSE_NOXXE);
  xmlChar *content=doc?xmlNodeGetContent(xmlDocGetRootElement(doc)):NULL;
  int ok=content&&!xmlStrcmp(content,BAD_CAST"PUBLIC_INTERNAL_SENTINEL");
  xmlFree(content);if(doc)xmlFreeDoc(doc);xmlCleanupParser();return !ok;
 }
 if(!strcmp(argv[1],"reader-xxe-blocked")) {
  const char *text="<!DOCTYPE root [<!ENTITY ext SYSTEM \"file://" EO_XML_FIXTURE_ROOT "/public-external.txt\">]><root>&ext;</root>";
  xmlTextReaderPtr reader=xmlReaderForMemory(text,strlen(text),"public.xml",NULL,XML_PARSE_NOENT|XML_PARSE_NOXXE);
  int found=0;
  if(reader) {
   while(xmlTextReaderRead(reader)==1) {
    const xmlChar *value=xmlTextReaderConstValue(reader);
    if(value&&xmlStrstr(value,BAD_CAST"PUBLIC_EXTERNAL_SENTINEL"))found=1;
   }
   xmlFreeTextReader(reader);
  }
  xmlCleanupParser();return found;
 }
 if(!strcmp(argv[1],"parameter-xxe-blocked")) {
  const char *text="<!DOCTYPE root [<!ENTITY % ext SYSTEM \"file://" EO_XML_FIXTURE_ROOT "/public-external.dtd\">%ext;]><root>&outside;</root>";
  doc=xmlReadMemory(text,strlen(text),"public.xml",NULL,XML_PARSE_NOENT|XML_PARSE_DTDLOAD|XML_PARSE_NOXXE);
  xmlChar *content=doc?xmlNodeGetContent(xmlDocGetRootElement(doc)):NULL;
  int found=content&&xmlStrstr(content,BAD_CAST"PUBLIC_EXTERNAL_SENTINEL");
  xmlFree(content);if(doc)xmlFreeDoc(doc);xmlCleanupParser();return found;
 }
 if(!strcmp(argv[1],"file-xxe-blocked")) {
  doc=xmlReadFile("" EO_XML_FIXTURE_ROOT "/public-document.xml",NULL,XML_PARSE_NOENT|XML_PARSE_NOXXE);
  if(!doc)return 1;
  xmlChar *content=xmlNodeGetContent(xmlDocGetRootElement(doc));
  int found=content&&xmlStrstr(content,BAD_CAST"PUBLIC_EXTERNAL_SENTINEL");
  xmlFree(content);xmlFreeDoc(doc);xmlCleanupParser();return found;
 }
 if(!strcmp(argv[1],"quiet-malformed")) {
  const char *text="<root><unclosed></root>";
  doc=xmlReadMemory(text,strlen(text),"public.xml",NULL,XML_PARSE_NOXXE);
  if(doc)xmlFreeDoc(doc);
  xmlCleanupParser();return doc?1:0;
 }
 if(!strcmp(argv[1],"idref-remove")) {
  const char *text="<!DOCTYPE root [<!ELEMENT root (item*)><!ELEMENT item EMPTY><!ATTLIST item id ID #IMPLIED ref IDREF #IMPLIED>]><root><item id=\"target\"/><item ref=\"target\"/></root>";
  doc=xmlReadMemory(text,strlen(text),"public.xml",NULL,XML_PARSE_DTDVALID|XML_PARSE_NOXXE);
  if(!doc)return 1;
  xmlNodePtr root=xmlDocGetRootElement(doc),a=root->children,b=a?a->next:NULL;
  if(!a||!b){xmlFreeDoc(doc);return 1;}
  xmlUnsetProp(a,BAD_CAST"id");xmlUnsetProp(b,BAD_CAST"ref");
  xmlFreeDoc(doc);xmlCleanupParser();return 0;
 }
 return 64;
}
