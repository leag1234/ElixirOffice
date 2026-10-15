// SPDX-License-Identifier: AGPL-3.0-only
// Test-only native actions in the launched application's own process.
#import <Cocoa/Cocoa.h>
#include <node_api.h>
#include <unistd.h>
static napi_value boolean(napi_env env,bool value){napi_value result;napi_get_boolean(env,value,&result);return result;}
static napi_value pid(napi_env env,napi_callback_info){napi_value result;napi_create_int32(env,getpid(),&result);return result;}
static bool ready(napi_env env){if(![NSThread isMainThread]||!NSApp){napi_throw_error(env,nullptr,"Own AppKit process unavailable");return false;}return true;}
static napi_value closeWindow(napi_env env,napi_callback_info){
 if(!ready(env))return nullptr;
 for(NSWindow* window in [NSApp windows])if([window isVisible]&&[NSStringFromClass([window class]) isEqualToString:@"ElectronNSWindow"]){
  [window performClose:nil];return boolean(env,true);
 }
 return boolean(env,false);
}
static napi_value quit(napi_env env,napi_callback_info){
 if(!ready(env))return nullptr;[NSApp terminate:nil];return boolean(env,true);
}
static napi_value keyEquivalent(napi_env env,NSString* key,unsigned short code){
 if(!ready(env))return nullptr;
 NSEvent* event=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:NSEventModifierFlagCommand timestamp:0 windowNumber:0 context:nil characters:key charactersIgnoringModifiers:key isARepeat:NO keyCode:code];
 return boolean(env,[[NSApp mainMenu] performKeyEquivalent:event]);
}
static napi_value commandW(napi_env env,napi_callback_info){return keyEquivalent(env,@"w",13);}
static napi_value commandQ(napi_env env,napi_callback_info){return keyEquivalent(env,@"q",12);}
static bool press(NSView* view,NSString* title,int depth,int& budget){
 if(depth>20||--budget<0)return false;
 if([view isKindOfClass:[NSButton class]]){
  NSButton* button=(NSButton*)view;
  if([button isEnabled]&&![button isHidden]&&[[button title] isEqualToString:title]){[button performClick:nil];return true;}
 }
 for(NSView* child in [view subviews])if(press(child,title,depth+1,budget))return true;
 return false;
}
static napi_value pressButton(napi_env env,napi_callback_info info){
 if(!ready(env))return nullptr;size_t count=1,size=0;napi_value args[1];napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
 if(!count||napi_get_value_string_utf8(env,args[0],nullptr,0,&size)!=napi_ok||size>2048){napi_throw_error(env,nullptr,"Expected own native button title");return nullptr;}
 char* text=(char*)calloc(size+1,1);napi_get_value_string_utf8(env,args[0],text,size+1,&size);NSString* title=[NSString stringWithUTF8String:text];free(text);
 for(NSWindow* window in [NSApp windows]){
  if(![window isVisible]||(![window sheetParent]&&window!=[NSApp modalWindow]))continue;
  int budget=10000;if(press([window contentView],title,0,budget))return boolean(env,true);
 }
 return boolean(env,false);
}
static napi_value hasSavePanel(napi_env env,napi_callback_info){
 if(!ready(env))return nullptr;
 for(NSWindow* window in [NSApp windows])
  if([window isVisible]&&[window isKindOfClass:[NSSavePanel class]]&&![window isKindOfClass:[NSOpenPanel class]])return boolean(env,true);
 return boolean(env,false);
}
NAPI_MODULE_INIT(){
 napi_property_descriptor fields[]={
 {"pid",nullptr,pid,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"closeWindow",nullptr,closeWindow,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"quit",nullptr,quit,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"commandW",nullptr,commandW,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"commandQ",nullptr,commandQ,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"pressButton",nullptr,pressButton,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"hasSavePanel",nullptr,hasSavePanel,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(env,exports,7,fields);return exports;
}
