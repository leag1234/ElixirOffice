// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Computed-color checks for named Home surfaces, not whole-page WCAG certification.
module.exports=function inspectAppearance(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d'),colors=new Map();
 const rgba=value=>{if(colors.has(value))return colors.get(value);ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const p=[...ctx.getImageData(0,0,1,1).data];p[3]/=255;colors.set(value,p);return p;};
 const over=(front,back)=>front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3]));
 const background=el=>{const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);let rgb=[255,255,255];for(const p of chain)rgb=over(rgba(getComputedStyle(p).backgroundColor),rgb);return rgb;};
 const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const visible=el=>!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
 const selectors=['.section-title','.tile-label','.rail-item>span','.connect-text h2','.connect-text p','.acct-name','.acct-sub','.acct-item>span:not(.switch)','.acct-privacy>span','.field-label','.dialog h2','.dialog p','.dialog .btn','.files th','.file-base','.file-ext','.file-where','.c-mod','.c-size','.toast-text','.toast-link','.menu button>span','.chip','.loc-opt','.loc-label','.desktop-footer'];
 const text=[];
 for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
  if(!visible(el)||!el.textContent.trim())continue;
  const s=getComputedStyle(el),bg=background(el),fg=over(rgba(s.color),bg);
  text.push({selector,text:el.textContent.trim(),color:s.color,background:bg,ratio:contrast(fg,bg),minimum:4.5});
 }
 const fields=[];
 for(const el of document.querySelectorAll('.field,.search input')){
  if(!visible(el))continue;const placeholder=!el.value&&!!el.placeholder,s=getComputedStyle(el,placeholder?'::placeholder':null),bg=background(el),front=rgba(s.color).slice();front[3]*=Number(s.opacity||1);const fg=over(front,bg);
  fields.push({id:el.id,placeholder,color:s.color,background:bg,ratio:contrast(fg,bg),minimum:4.5});
 }
 const borders=[];
 for(const el of document.querySelectorAll('.field')){
  if(!visible(el))continue;const s=getComputedStyle(el),bg=background(el.parentElement),fg=over(rgba(s.borderTopColor),bg);
  borders.push({id:el.id,color:s.borderTopColor,background:bg,ratio:contrast(fg,bg),minimum:3});
 }
 let focus=null;const active=document.activeElement;
 if(active&&visible(active)){const s=getComputedStyle(active);if(active.matches(':focus-visible')&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0){const bg=background(active.parentElement);focus={id:active.id,color:s.outlineColor,background:bg,ratio:contrast(over(rgba(s.outlineColor),bg),bg),minimum:3};}else if(active.matches('.menu button:focus-visible,.acct-item:focus-visible')){focus={id:active.id,missing:true,ratio:0,minimum:3};}}
 return{theme:document.documentElement.getAttribute('data-eo-theme'),colorScheme:getComputedStyle(document.documentElement).colorScheme,bodyBackground:getComputedStyle(document.body).backgroundColor,text,fields,borders,focus};
};
