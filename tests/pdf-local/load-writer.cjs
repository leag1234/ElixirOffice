// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function(upstream){
 const base=path.join(upstream,'web-apps/apps/common/main/lib/elixir-local');
 const messages=(await fs.readFile(path.join(base,'PdfMessages.js'),'utf8')).replace('define([],function(){',"define('common/main/lib/elixir-local/PdfMessages',[],function(){");
 const writer=(await fs.readFile(path.join(base,'PdfWriter.js'),'utf8')).replace("define(['common/main/lib/elixir-local/PdfMessages'],function(PdfMessages){","define('PdfWriterProof',['common/main/lib/elixir-local/PdfMessages'],function(PdfMessages){");
 return messages+writer;
};
