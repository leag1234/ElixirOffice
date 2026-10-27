// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Pinned library classes are injected after policy qualification; app startup
// does not import or construct them. No disk, identifier or network operation.
const {readCandidate}=require('./update-candidate.cjs');
function refused(){throw Error('Verified update provider refused');}
function capable(policy,runtime){if(!policy?.capability(runtime).enabled)refused();}
function assetURL(tag,name){return new URL('https://github.com/leag1234/elixiroffice/releases/download/'+encodeURIComponent(tag)+'/'+encodeURIComponent(name));}
function createVerifiedProvider({Provider,policy,runtime,now=Date.now}){
 const target=Object.freeze({...runtime});capable(policy,target);
 if(typeof Provider!=='function')refused();
 let candidate=null,info=null;
 class VerifiedProvider extends Provider{
  constructor(){super({platform:target.platform,isUseMultipleRangeRequest:false,executor:null});}
  setCandidate(value){
   const d=readCandidate(value,policy,{now:now(),runtime:target});
   candidate=value;
   info=Object.freeze({version:d.description.version,files:Object.freeze([Object.freeze({url:d.description.artifact.name,sha512:d.description.artifact.sha512,size:d.description.artifact.size})])});
  }
  clear(){candidate=null;info=null;}
  candidateFor(value){if(!info||value!==info)refused();readCandidate(candidate,policy,{now:now(),runtime:target});return candidate;}
  async getLatestVersion(){if(!candidate||!info)refused();this.candidateFor(info);return info;}
  resolveFiles(value){
   this.candidateFor(value);
   // A fresh mutable URL is library-facing data only, never download authority.
   return [Object.freeze({url:assetURL(candidate.tag,candidate.artifact.name),info:info.files[0]})];
  }
  setRequestHeaders(value){
   if(value!==null&&value!==undefined&&Object.keys(value).length)refused();
  }
  get fileExtraDownloadHeaders(){return null;}
  getBlockMapFiles(){refused();}
 }
 return new VerifiedProvider();
}
function bindVerifiedUpdater({Base,provider,policy,runtime,configPath,download,install}){
 const target=Object.freeze({...runtime});capable(policy,target);
 if(typeof Base!=='function'||typeof provider?.getLatestVersion!=='function')refused();
 return class VerifiedUpdater extends Base{
  constructor(app){
   capable(policy,target);
   if(!app)refused();
   super(null,app);
   this.logger=null;
   for(const [name,value] of Object.entries({autoDownload:false,autoInstallOnAppQuit:false,autoRunAppAfterInstall:false,allowDowngrade:false,disableWebInstaller:true,disableDifferentialDownload:true,forceDevUpdateConfig:false,allowPrerelease:true}))
    Object.defineProperty(this,name,{value,writable:false,configurable:false,enumerable:true});
   if(configPath)this.updateConfigPath=configPath;
  }
  async getUpdateInfoAndProvider(){
   capable(policy,target);await this.app.whenReady();
   return {info:await provider.getLatestVersion(),provider};
  }
  doDownloadUpdate(options){
   capable(policy,target);
   if(typeof download!=='function'||options.updateInfoAndProvider.provider!==provider)refused();
   return download({updater:this,options,candidate:provider.candidateFor(options.updateInfoAndProvider.info),execute:task=>super.executeDownload(task)});
  }
  doInstall(options){capable(policy,target);if(typeof install!=='function')refused();return install({updater:this,options});}
  quitAndInstall(){refused();}
 };
}
module.exports={createVerifiedProvider,bindVerifiedUpdater,assetURL};
