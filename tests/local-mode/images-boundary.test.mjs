/* SPDX-License-Identifier: AGPL-3.0-only */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const sourcePath=process.env.EO_LOCAL_IMAGES_SOURCE;assert(sourcePath&&path.isAbsolute(sourcePath),'Own Images.js source required');
function setup(){
 let Images,calls={send:0,upload:0};
 const stockSend=()=>{calls.send++;return'hosted-send'},stockUpload=()=>{calls.upload++;return'hosted-upload'};
 const api={documentId:'same',documentUserId:'same',DocInfo:{get_OfflineApp:()=>true},asc_isOffline:()=>true,AddImageUrl(){},asc_checkImageUrlAndAction(){}};
 const world={fetch(){throw Error('Boundary test must not fetch')},Asc:{editor:api,c_oAscError:{ID:{No:0,UplImageUrl:1}}},AscCommon:{sendImgUrls:stockSend,UploadImageFiles:stockUpload,c_oAscImageUploadProp:{SupportedFormats:['png','jpg']}}};
 const errors=[],context={window:world,Asc:world.Asc,AscCommon:world.AscCommon,Map,Set,Array,Error,Promise,define(_deps,factory){Images=factory()}};
 context.define.amd=true;
 vm.runInNewContext(fs.readFileSync(sourcePath,'utf8'),context,{filename:sourcePath});
 const options={signal:()=>null,enqueue:job=>Promise.resolve().then(job),onError:e=>errors.push(e)};
 return{Images,world,api,options,calls,stockSend,stockUpload,errors};
}
test('active hosted API with overlapping identifiers keeps stock dispatch; offline owner handles only its active frame',async()=>{
 const e=setup(),controller=e.Images.install(e.api,e.options);
 const hosted={documentId:'same',documentUserId:'same',DocInfo:{get_OfflineApp:()=>false},asc_isOffline:()=>false};
 e.world.Asc.editor=hosted;
 assert.equal(e.world.AscCommon.UploadImageFiles([],hosted.documentId,hosted.documentUserId,null,null,null,null,()=>{}),'hosted-upload');
 assert.equal(e.world.AscCommon.sendImgUrls(hosted,[],()=>{}),'hosted-send');
 assert.deepEqual(e.calls,{send:1,upload:1});
 e.world.Asc.editor=e.api;e.api.DocInfo.get_OfflineApp=()=>false;
 assert.equal(e.world.AscCommon.UploadImageFiles([],'same','same',null,null,null,null,()=>{}),'hosted-upload');
 e.api.DocInfo.get_OfflineApp=()=>true;
 const result=await new Promise(resolve=>e.world.AscCommon.UploadImageFiles([],'same','same',null,null,null,null,(error,urls)=>resolve({error,length:urls.length})));
 assert.deepEqual(result,{error:1,length:0});assert.equal(e.calls.upload,2);assert.deepEqual(e.errors,[]);
 controller.dispose();assert.equal(e.world.AscCommon.UploadImageFiles,e.stockUpload);assert.equal(e.world.AscCommon.sendImgUrls,e.stockSend);
});
test('second session is rejected before handlers change; ready activation and disposal preserve current SDK functions',()=>{
 const e=setup(),controller=e.Images.install(e.api,e.options);
 const originalFormats=e.world.AscCommon.c_oAscImageUploadProp.SupportedFormats;assert(originalFormats.includes('webp'));
 const send=e.world.AscCommon.sendImgUrls,upload=e.world.AscCommon.UploadImageFiles,add=e.api.AddImageUrl;
 assert.throws(()=>e.Images.assertAvailable(),/Only one local picture session/);
 assert.throws(()=>e.Images.install({...e.api},e.options),/Only one local picture session/);
 assert.equal(e.world.AscCommon.sendImgUrls,send);assert.equal(e.world.AscCommon.UploadImageFiles,upload);assert.equal(e.api.AddImageUrl,add);
 const nextSDK=()=> 'late-sdk';e.world.AscCommon.sendImgUrls=nextSDK;controller.activate();assert.notEqual(e.world.AscCommon.sendImgUrls,nextSDK);
 controller.dispose();assert.equal(e.world.AscCommon.sendImgUrls,nextSDK);assert.equal(e.world.AscCommon.UploadImageFiles,e.stockUpload);
 assert.doesNotThrow(()=>e.Images.assertAvailable());assert(!e.world.AscCommon.c_oAscImageUploadProp.SupportedFormats.includes('webp'));
});
test('disposal does not replace a handler changed by a later owner',()=>{
 const e=setup(),controller=e.Images.install(e.api,e.options),later=()=> 'later';
 e.world.AscCommon.sendImgUrls=later;e.world.AscCommon.UploadImageFiles=later;e.api.AddImageUrl=later;
 controller.dispose();assert.equal(e.world.AscCommon.sendImgUrls,later);assert.equal(e.world.AscCommon.UploadImageFiles,later);assert.equal(e.api.AddImageUrl,later);
});
