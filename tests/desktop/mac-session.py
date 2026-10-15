# SPDX-License-Identifier: AGPL-3.0-only
"""Read only validated Mac lock metadata; no UI or session settings changes."""
import ctypes,json
CG=ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
CF=ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
CG.CGSessionCopyCurrentDictionary.restype=ctypes.c_void_p
CF.CFGetTypeID.argtypes=[ctypes.c_void_p];CF.CFGetTypeID.restype=ctypes.c_ulong
CF.CFDictionaryGetTypeID.restype=ctypes.c_ulong
CF.CFBooleanGetTypeID.restype=ctypes.c_ulong
CF.CFDictionaryGetCount.argtypes=[ctypes.c_void_p];CF.CFDictionaryGetCount.restype=ctypes.c_long
CF.CFStringCreateWithCString.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_uint32];CF.CFStringCreateWithCString.restype=ctypes.c_void_p
CF.CFDictionaryGetValue.argtypes=[ctypes.c_void_p,ctypes.c_void_p];CF.CFDictionaryGetValue.restype=ctypes.c_void_p
CF.CFBooleanGetValue.argtypes=[ctypes.c_void_p];CF.CFBooleanGetValue.restype=ctypes.c_bool
CF.CFRelease.argtypes=[ctypes.c_void_p]
d=CG.CGSessionCopyCurrentDictionary();result={'valid':False,'locked':None}
if d:
 try:
  if CF.CFGetTypeID(d)==CF.CFDictionaryGetTypeID() and CF.CFDictionaryGetCount(d)>0:
   k=CF.CFStringCreateWithCString(None,b'CGSSessionScreenIsLocked',0x08000100)
   try:
    value=CF.CFDictionaryGetValue(d,k)
    if not value:result={'valid':True,'locked':False,'lockFlagPresent':False}
    elif CF.CFGetTypeID(value)==CF.CFBooleanGetTypeID():
     result={'valid':True,'locked':CF.CFBooleanGetValue(value),'lockFlagPresent':True}
   finally:CF.CFRelease(k)
 finally:CF.CFRelease(d)
print(json.dumps(result))
