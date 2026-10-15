// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const codes={pdf:513,docx:65,doc:66,odt:67,rtf:68,txt:69,docm:75,dotx:76,pptx:129,ppt:130,odp:131,ppsx:132,potx:135,xlsx:257,xls:258,ods:259,csv:260,xlsm:261,xltx:262};
const canonical={doc:'docx',rtf:'docx',txt:'docx',docm:'docx',dotx:'docx',xls:'xlsx',csv:'xlsx',xlsm:'xlsx',xltx:'xlsx',ppt:'pptx',ppsx:'pptx',potx:'pptx'};
const outputFormats={pdf:['pdf'],word:['docx','odt','rtf','txt','pdf'],cell:['xlsx','ods','csv'],slide:['pptx','odp','pdf']};
function kind(format){return format==='pdf'?'pdf':['docx','odt'].includes(format)?'word':['xlsx','ods'].includes(format)?'cell':['pptx','odp'].includes(format)?'slide':null;}
function output(input,format){
 if(!(input instanceof Uint8Array)||(input.length<1&&!['txt','csv'].includes(format))||input.length>512*1024*1024)throw Error('Invalid document output');
 const bytes=Buffer.from(input);
 if(format==='pdf'){if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF output');}
 else if(format==='rtf'){if(!bytes.subarray(0,6).toString().startsWith('{\\rtf'))throw Error('Invalid RTF output');}
 else if(['txt','csv'].includes(format)){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('Invalid UTF-8 output');}if(bytes.includes(0))throw Error('Invalid text output');}
 else if(!['docx','odt','xlsx','ods','pptx','odp'].includes(format)||bytes[0]!==80||bytes[1]!==75)throw Error('Invalid document output');
 return bytes;
}
module.exports={codes,canonical,exports:outputFormats,kind,output};
