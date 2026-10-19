// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
module.exports=function report(count){
 if(!Number.isSafeInteger(count)||count<1||count>300)throw Error('Public print fixture requires 1 to 300 pages');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'],kids=[];
 for(let page=0;page<count;page++){
  const pn=objects.length+1,cn=pn+1;kids.push(pn+' 0 R');
  let drawing='q 0.1 0.35 0.65 rg 36 740 520 38 re f Q\nBT /F1 15 Tf 36 805 Td (PUBLIC VECTOR PRINT PAGE '+String(page+1).padStart(4,'0')+') Tj ET\n';
  for(let row=0;row<55;row++)drawing+='BT /F1 9 Tf 36 '+(720-row*11)+' Td (Public line '+String(row+1).padStart(2,'0')+' - preserved vector text, shapes and page '+(page+1)+'.) Tj ET\n';
  drawing+='q 0.8 0.15 0.1 rg '+(36+page%250)+' 24 12 12 re f Q';
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /Font << /F1 3 0 R >> >> /Contents '+cn+' 0 R >>','<< /Length '+Buffer.byteLength(drawing)+' >>\nstream\n'+drawing+'\nendstream');
 }
 objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+count+' >>';let data='%PDF-1.4\n',offsets=[0];
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(data));data+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
 const xref=Buffer.byteLength(data);data+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(data);
};
