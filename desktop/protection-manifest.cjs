// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const namespace='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';
// A bounded manifest parser, without DTDs or entity expansion. It recognizes XML
// structure/namespaces rather than treating comments or text as encryption.
function protectedEntries(xml){
 const bad=()=>{throw Error('Invalid OpenDocument protection manifest')};
 if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml))bad();
 xml=xml.replace(/<!--(?:[^-]|-(?!->))*-->/g,'').replace(/<\?xml\s[\s\S]*?\?>/g,'');
 if(/<!|<\?/.test(xml))bad();
 function text(value){return value.replace(/&([^;]*);/g,(_all,name)=>{const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(named,name))return named[name];if(/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(name)){const n=name[1]==='x'?parseInt(name.slice(2),16):Number(name.slice(1));if(n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff))return String.fromCodePoint(n);}bad();});}
 const stack=[],entries=new Map();let root=false,pos=0,nodes=0;
 const tokens=/<[^>]*>|[^<]+/g;let match;
 while((match=tokens.exec(xml))){
  if(match.index!==pos)bad();pos=tokens.lastIndex;const token=match[0];
  if(token[0]!=='<'){if(token.trim())bad();continue;}
  const tag=/^<(\/?)([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/.exec(token);if(!tag)bad();
  if(tag[1]){if(tag[3].trim()||tag[4]||!stack.length||stack.pop().qualified!==tag[2])bad();continue;}
  if(++nodes>100000||stack.length>32)bad();
  const parent=stack.at(-1),ns=Object.assign({},parent?.ns),attributes={};let rest=tag[3];
  while(rest.trim()){
   const attr=/^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"<]*"|'[^'<]*')/.exec(rest);if(!attr||Object.hasOwn(attributes,attr[1]))bad();
   const value=text(attr[2].slice(1,-1));if(/&(?![^;]*;)/.test(attr[2].slice(1,-1)))bad();attributes[attr[1]]=value;
   if(attr[1]==='xmlns')ns['']=value;else if(attr[1].startsWith('xmlns:'))ns[attr[1].slice(6)]=value;
   rest=rest.slice(attr[0].length);
  }
  function expanded(name,isAttribute){const parts=name.split(':');if(parts.length>2)bad();const prefix=parts.length===2?parts[0]:'';if(prefix&&!ns[prefix])bad();return [isAttribute&&!prefix?'':ns[prefix]||'',parts.at(-1)];}
  const [uri,name]=expanded(tag[2],false),node={qualified:tag[2],uri,name,ns,entry:parent?.entry};
  if(!parent){if(root||name!=='manifest'||uri!==namespace)bad();root=true;}
  if(uri===namespace&&name==='file-entry'){
   if(!parent||parent.name!=='manifest'||parent.uri!==namespace)bad();
   const key=Object.keys(attributes).find(k=>{if(k==='xmlns'||k.startsWith('xmlns:'))return false;const a=expanded(k,true);return a[0]===namespace&&a[1]==='full-path';});
   if(!key||entries.has(attributes[key]))bad();node.entry={path:attributes[key],encrypted:false};entries.set(node.entry.path,node.entry);
  }
  if(uri===namespace&&name==='encryption-data'){
   if(!parent||parent.name!=='file-entry'||!node.entry||node.entry.encrypted)bad();node.entry.encrypted=true;
  }
  if(!tag[4])stack.push(node);
 }
 if(pos!==xml.length||stack.length||!root)bad();return entries;
}
module.exports={protectedEntries};
