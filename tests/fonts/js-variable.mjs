// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),[sdk,root]=process.argv.slice(2);
const fontkit=require(path.join(sdk,'common/clientpdf/vendor/fontkit/fontkit.umd.min.js'));
require(path.join(sdk,'common/clientpdf/eo-pdf.js'));
for(const key of ['variable-regular','variable-medium-alias','variable-bold']){
 const directory=path.join(root,key),meta=JSON.parse(fs.readFileSync(path.join(directory,'metadata.json')));
 const font={...meta,key:meta.fileKey+'#'+meta.faceIndex,bytes:new Uint8Array(fs.readFileSync(path.join(directory,meta.path)))};
 const writer=new globalThis.EOPdf.Writer({fontkit,producer:'ElixirOffice selected variable proof',getFont:async()=>font,getImage:async()=>null});
 await writer.feed(new Uint8Array(fs.readFileSync(path.join(directory,'drawing.bin'))));
 const pdf=await writer.finish();fs.writeFileSync(path.join(directory,'js-output.pdf'),pdf);
 console.log(key,pdf.length,JSON.stringify(writer.stats));
}
