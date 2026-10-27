// SPDX-License-Identifier: AGPL-3.0-only
// Original ElixirOffice implementation written from the published API contract,
// not from upstream implementation code. No upstream source has been copied.
'use strict';
class Lazy {
 #creator;
 #created=false;
 #value;
 constructor(creator){
  if(typeof creator!=='function')throw TypeError('Lazy creator must be a function');
  this.#creator=creator;
 }
 get hasValue(){return this.#created;}
 get value(){
  if(!this.#created){
   // A synchronous throw leaves the factory available for an explicit retry.
   const value=this.#creator();
   this.#value=value;
   this.#created=true;
   this.#creator=null;
  }
  return this.#value;
 }
}
module.exports=Object.freeze({Lazy});
