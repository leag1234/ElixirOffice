// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
class TabDrags{
 #entries=new Map();#now;#limit;#ttl;
 constructor({now=Date.now,limit=32,ttl=30000}={}){this.#now=now;this.#limit=limit;this.#ttl=ttl;}
 #prune(){for(const [token,entry] of this.#entries)if(entry.expires<=this.#now())this.#entries.delete(token);}
 begin(documentId,windowId,token){
  this.#prune();
  if(typeof token!=='string'||!(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/).test(token)||typeof documentId!=='string'||typeof windowId!=='string')throw Error('Invalid document drag');
  if(this.#entries.has(token)||this.#entries.size>=this.#limit)throw Error('Document drag unavailable');
  this.#entries.set(token,{documentId,windowId,expires:this.#now()+this.#ttl});return true;
 }
 peek(token){this.#prune();const entry=this.#entries.get(token);return entry?{...entry}:null;}
 take(token,{callerWindowId,targetWindowId}){
  const entry=this.peek(token);if(!entry)return null;
  if(callerWindowId!==entry.windowId&&callerWindowId!==targetWindowId)throw Error('Document drag belongs to another window');
  this.#entries.delete(token);return entry;
 }
}
module.exports={TabDrags};
