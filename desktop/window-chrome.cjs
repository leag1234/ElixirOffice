// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const COMPACT_HEIGHT=36;
// The compact Linux/X11 frame is opt-in. Unqualified platforms keep the system frame;
// callers must verify overlay support before offering the Linux preference.
function policy({platform=process.platform,customTitleBar=false,overlayAvailable=false,displayBackend='x11'}={}){
 const available=platform==='linux'&&displayBackend==='x11'&&overlayAvailable===true;
 const compact=available&&customTitleBar===true;
 const windowOptions=compact?{titleBarStyle:'hidden',titleBarOverlay:Object.freeze({height:COMPACT_HEIGHT})}:{};
 return Object.freeze({available,effectiveFrame:compact?'compact':'native',titleHeight:compact?COMPACT_HEIGHT:0,windowOptions:Object.freeze(windowOptions)});
}
module.exports={COMPACT_HEIGHT,policy};
