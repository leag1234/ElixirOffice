// SPDX-License-Identifier: AGPL-3.0-only
(function(window){
 'use strict';
 window.EOComputerFonts={
  install(index){
   const LF=window.Common?.ElixirLocalFonts,A=window.AscFonts,app=A?.g_fontApplication;
   if(!LF||!A||!app)throw Error('Font engine is not ready');
   if(A.DesktopFontPolicyVersion!==1)throw Error('Computer font engine update is required');
   if(!LF.install())throw Error('Font engine is not ready');
   if(LF.desktopPolicy)return LF.desktopPolicy;
   // Freeze packaged inventory before registration. The web font path is untouched.
   const bundled=index.bundled.filter(face=>A.g_map_font_index[face.family]!==undefined);
   const options={substitutes:app.g_fontDictionary?.FD_Substitutes||{}};
   const preliminary=window.EOFontResolver.create(bundled,options);
   const protectedName=name=>preliminary.resolve({name,aliases:[...(app.GetSubstituteList?.(name)||[]),...(app.DocumentAltNames?.[name]?[app.DocumentAltNames[name]]:[])]})?.source==='bundled';
   const system=index.system.filter(face=>!protectedName(face.family));
   const resolver=window.EOFontResolver.create([...bundled,...system],options);
   const picker=A.FontPickerByCharacter,originalRanges=picker?.Ranges?.slice()||[];
   const candidates=window.EOFontResolver.scriptCandidates;
   function fallback(name,style,cp,baseline){
    if(!LF.hasConsent()||!picker?.IsUseNoSquaresMode||!Number.isInteger(cp)||cp<=0||cp>=0xe000&&cp<=0xf8ff||cp>=0xf0000)return null;
    const selected=resolver.resolve({name,style,codepoints:[cp],candidates:candidates(cp,name)});
    if(selected&&A.g_map_font_index[selected.family]!==undefined)return selected;
    const previous=baseline&&resolver.resolve({name:baseline,style,codepoints:[cp]});
    return previous&&A.g_map_font_index[previous.family]!==undefined?previous:null;
   }
   function rebuildRanges(){
    if(!picker||!originalRanges.length&&!system.length)return;
    const relevant=new Set(originalRanges.map(range=>window.EOFontResolver.normalize(range.Name)));
    for(const cp of [0x633,0xd85,0x5d0,0xe01,0x915,0xe81,0x3042,0x3105,0x4e00,0xac00])
     for(const name of candidates(cp))relevant.add(window.EOFontResolver.normalize(name));
    // Regional alternatives remain available for explicit document names.
    for(const region of ['JP','SC','TC','KR'])
     for(const name of candidates(0x4e00,'Noto Sans CJK '+region))relevant.add(window.EOFontResolver.normalize(name));
    const boundaries=new Set([0x590,0x600,0x900,0x980,0xd80,0xe00,0xe80,0xf00,0x1100,0x1200,0x2e80,0x3040,0x3100,0x3130,0x3190,0x3400,0xa000,0xa960,0xa980,0xac00,0xd800,0xe000,0xf900,0xfb00,0xfb1d,0xfb50,0xfe00,0xfe70,0xff00,0x1ee00,0x1ef00,0x20000,0x323b0]);
    for(const range of originalRanges){boundaries.add(range.Start);boundaries.add(range.End+1);}
    for(const faces of resolver.families.values())for(const face of faces)
     if(relevant.has(window.EOFontResolver.normalize(face.family)))
      for(const [start,end] of face.coverage){boundaries.add(start);boundaries.add(end+1);}
    const points=Array.from(boundaries).sort((a,b)=>a-b),ranges=[];
    let oldIndex=0;
    for(let i=0;i+1<points.length;i++){
     const start=points[i],end=points[i+1]-1;
     while(oldIndex<originalRanges.length&&originalRanges[oldIndex].End<start)oldIndex++;
     const previous=originalRanges[oldIndex],baseline=previous?.Start<=start?previous.Name:'';
     let name=baseline;
     const safe=baseline&&!window.EOFontResolver.fallbackFamilies.includes(baseline)&&[0,1,2,3].every(style=>resolver.resolve({name:baseline,style,codepoints:[start,end]}));
     if(!safe){
      name='';
      for(const candidate of candidates(start,baseline)){
       if(A.g_map_font_index[candidate]===undefined)continue;
       if([0,1,2,3].every(style=>resolver.resolve({name:candidate,style,codepoints:[start,end]}))){name=candidate;break;}
      }
      if(!name)name=baseline;
     }
     if(!name)continue;
     // Do not merge cmap/script boundaries: getFontsByString skips the picker inside LastRange.
     ranges.push({Start:start,End:end,Name:name});
    }
    picker.Ranges=ranges;picker.UsedRanges=[];picker.LastRange=null;
    picker.FontsByRange={};picker.FontsByRangeCount=0;picker.ExtendFontsByRangeCount=0;
   }
   A.DesktopFontPolicy=Object.freeze({id:index.id,pick:(file,cp,style,baseline)=>{
    if(!LF.hasConsent())return baseline&&!A.g_font_infos[A.g_map_font_index[baseline]]?.isLocalFont?baseline:'';
    return fallback(file.eoFamily||file.GetFamilyName(),style,cp,baseline)?.family||'';
   }});
   if(picker){
    const originalPick=picker.getFontBySymbol;
    picker.getFontBySymbol=function(cp){
     const base=originalPick.call(this,cp);
     if(!this.IsUseNoSquaresMode||!cp||cp>=0xe000&&cp<=0xf8ff||cp>=0xf0000)return base;
     // Preload every style-specific choice before synchronous glyph lookup.
     const sources=cp>=0x3400&&cp<=0x9fff||cp>=0xf900&&cp<=0xfaff||cp>=0x20000&&cp<=0x323af?
      ['','Noto Sans CJK JP','Noto Sans CJK SC','Noto Sans CJK TC','Noto Sans CJK KR']:[''];
     for(const source of sources)for(let style=0;style<4;style++){
      const selected=fallback(source,style,cp,base),name=selected?.family;
      if(name&&!this.FontsByRange[name]){this.FontsByRange[name]=name;this.FontsByRangeCount++;}
     }
     return base;
    };
   }
   let epoch=0,cachedBytes=0;
   const sharedStreams=new Map(),byteCache=new Map(),originalConsent=LF.setConsent,originalReadList=LF.readList;
   LF.setConsent=function(on){epoch++;byteCache.clear();cachedBytes=0;const result=originalConsent.apply(this,arguments);if(!on&&picker){picker.Ranges=originalRanges.slice();picker.UsedRanges=[];picker.LastRange=null;picker.FontsByRange={};picker.FontsByRangeCount=0;picker.ExtendFontsByRangeCount=0;}return result;};
   LF.readList=function(){
    return originalReadList.apply(this,arguments).then(faces=>{
     const bridge=LF.desktopBridge();
     if(!bridge)return faces;
     for(const fd of faces){
      if(!fd.fileId||fd.eoSharedBytes)continue;
      fd.eoSharedBytes=true;
      fd.blob=async function(){
       const current=epoch;
       if(!LF.hasConsent()||!await bridge.fontPermission())throw Error('Computer font access changed');
       let entry=byteCache.get(fd.fileId);
       if(!entry){
        const size=fd.bytes;
        if(!Number.isSafeInteger(size)||size<=0||size>128*1024*1024)throw Error('Computer font exceeds 128 MiB');
        while(cachedBytes+size>192*1024*1024){
         const key=Array.from(byteCache.keys()).find(key=>byteCache.get(key).ready);
         if(key===undefined)throw Error('Selected computer fonts exceed 192 MiB');
         cachedBytes-=byteCache.get(key).size;byteCache.delete(key);
        }
        entry={size,ready:false,promise:null};cachedBytes+=size;
        entry.promise=Promise.resolve().then(()=>bridge.font(fd.id)).then(bytes=>{
         if(epoch!==current||!LF.hasConsent())throw Error('Computer font access changed');
         const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
         if(data.byteLength!==size)throw Error('Computer font changed; reopen the document');
         entry.ready=true;
         return data.byteOffset===0&&data.byteLength===data.buffer.byteLength?data.buffer:data.slice().buffer;
        }).catch(error=>{if(byteCache.get(fd.fileId)===entry){byteCache.delete(fd.fileId);cachedBytes-=entry.size;}throw error;});
        byteCache.set(fd.fileId,entry);
       }else{byteCache.delete(fd.fileId);byteCache.set(fd.fileId,entry);}
       const buffer=await entry.promise;
       if(epoch!==current||!LF.hasConsent()||!await bridge.fontPermission())throw Error('Computer font access changed');
       // Core's loader accepts this Blob-like read interface, avoiding one TTC copy per face.
       return {arrayBuffer:async()=>{if(epoch!==current||!LF.hasConsent())throw Error('Computer font access changed');return buffer;}};
      };
     }
     return faces;
    });
   };
   const registered=()=>new Map(LF.localNames().map(name=>[window.EOFontResolver.normalize(name),name]));
   LF.resolveName=name=>registered().get(window.EOFontResolver.normalize(name))||null;
   LF.isLocal=name=>!!LF.resolveName(name);
   const originalRegister=LF.register;
   LF.register=function(){
    const list=LF.fonts;
    if(list)LF.fonts=window.EOFontResolver.prepare(list).filter(face=>resolve(face.family)?.source!=='bundled');
    try{
     const result=originalRegister.apply(this,arguments);
     for(const loader of A.g_font_files||[]){
      const fd=loader.localFontData;
      if(!fd||fd.faceIndex===undefined||loader.eoPhysicalIdentity)continue;
      loader.eoPhysicalIdentity=true;
      const originalData=loader.LoadFontFromData;
      loader.LoadFontFromData=function(data){
       let result;
       const existing=fd.fileId&&sharedStreams.get(fd.fileId);
       if(existing!==undefined&&A.g_fonts_streams?.[existing]){
        this.SetStreamIndex(existing);this.Status=0;
       }else{
        result=originalData.call(this,data);
        if(fd.fileId)sharedStreams.set(fd.fileId,this.stream_index);
       }
       // The private index is authoritative; duplicate PostScript names cannot select another instance.
       for(const owner of this.owners||[])owner.info['faceIndex'+owner.slot]=fd.faceIndex;
       return result;
      };
     }
     return result;
    }finally{LF.fonts=list;installPolicy();rebuildRanges();}
   };
   function resolve(name,style){
    const aliases=app.GetSubstituteList?.(name)||[];
    const alternate=app.DocumentAltNames?.[name];
    return resolver.resolve({name,style:style===undefined?0:style,aliases:[...aliases,...(alternate?[alternate]:[])]});
   }
   function installPolicy(){
    for(const key of ['GetFontFile','GetFontFileWeb']){
     const original=app[key];if(original?.eoDesktopPolicy)continue;
     const wrapped=function(name,style){const chosen=resolve(name,style);return original.call(this,chosen?.family||name,style);};
     wrapped.eoDesktopPolicy=true;app[key]=wrapped;
    }
    app.FontPickerMap={};
   }
   installPolicy();
   LF.desktopPolicy=Object.freeze({id:index.id,resolver,resolve,epoch:()=>epoch,fallback,rebuildRanges,nativeRanges:fonts=>{
    const selected=new Set(fonts.map(font=>font.name));
    return (picker?.Ranges||[]).filter(range=>selected.has(range.Name)).map(range=>({name:range.Name,start:range.Start,end:range.End}));
   }});
   return LF.desktopPolicy;
  }
 };
})(window);
