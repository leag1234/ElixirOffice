# SPDX-License-Identifier: AGPL-3.0-only
# Scope every injected event to this app's actual native PID.
import ctypes,os,sys,time,signal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
x=ctypes.CDLL("libX11.so.6");xt=ctypes.CDLL("libXtst.so.6")
x.XOpenDisplay.restype=ctypes.c_void_p;x.XOpenDisplay.argtypes=[ctypes.c_char_p]
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XKeysymToKeycode.restype=ctypes.c_uint
x.XFlush.argtypes=[ctypes.c_void_p];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
xt.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
d=x.XOpenDisplay(os.environ.get("DISPLAY",":1").encode())
if not d:raise RuntimeError("active X display inaccessible")

x.XGetInputFocus.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int)]
x.XFetchName.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_void_p)]
x.XQueryTree.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_uint)]
x.XFree.argtypes=[ctypes.c_void_p]

x.XInternAtom.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int];x.XInternAtom.restype=ctypes.c_ulong
x.XGetWindowProperty.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_long,ctypes.c_long,ctypes.c_int,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_void_p)]
pid_atom=x.XInternAtom(d,b"_NET_WM_PID",False)
x.XGetTransientForHint.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong)]
x.XkbKeycodeToKeysym.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_int];x.XkbKeycodeToKeysym.restype=ctypes.c_ulong
expected=int(os.environ['EO_NATIVE_PID'])
startup=__import__('subprocess').check_output(['loginctl','show-session','c2','-p','Active','-p','LockedHint'],text=True)
assert 'Active=yes' in startup and 'LockedHint=no' in startup,'Desktop inactive or locked before focus'
def property_pid(w):
 typ=ctypes.c_ulong();fmt=ctypes.c_int();n=ctypes.c_ulong();after=ctypes.c_ulong();ptr=ctypes.c_void_p()
 x.XGetWindowProperty(d,w,pid_atom,0,1,False,0,ctypes.byref(typ),ctypes.byref(fmt),ctypes.byref(n),ctypes.byref(after),ctypes.byref(ptr))
 result=None
 if ptr.value:
  if fmt.value==32 and n.value:result=ctypes.cast(ptr,ctypes.POINTER(ctypes.c_ulong))[0]
  x.XFree(ptr)
 return result
def safe():
 state=__import__('subprocess').check_output(['loginctl','show-session','c2','-p','Active','-p','LockedHint'],text=True)
 assert 'Active=yes' in state and 'LockedHint=no' in state,'Desktop inactive or locked'
 w=ctypes.c_ulong();r=ctypes.c_int();x.XGetInputFocus(d,ctypes.byref(w),ctypes.byref(r))
 for _ in range(15):
  if w.value<=1:return False
  if property_pid(w.value)==expected:return True
  transient=ctypes.c_ulong()
  if x.XGetTransientForHint(d,w.value,ctypes.byref(transient)) and property_pid(transient.value)==expected:return True
  root=ctypes.c_ulong();parent=ctypes.c_ulong();children=ctypes.c_void_p();n=ctypes.c_uint()
  if not x.XQueryTree(d,w.value,ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(n)):return False
  if children.value:x.XFree(children)
  w=parent
 return False
held=[]
def interrupted(signum,frame):
 raise SystemExit(128+signum)
signal.signal(signal.SIGTERM,interrupted)
signal.signal(signal.SIGINT,interrupted)
cleanup_signals={signal.SIGTERM,signal.SIGINT}
def raw(key,down):
 if down:
  assert safe(),'Focus is not owned by the tested app'
  assert key not in held,'Key already pressed by this helper'
 else:
  assert key in held,'Refuse to release a key not pressed by this helper'
 previous=signal.pthread_sigmask(signal.SIG_BLOCK,cleanup_signals)
 try:
  assert xt.XTestFakeKeyEvent(d,key,down,0),'XTest key event failed'
  if down:held.append(key)
  else:held.remove(key)
  x.XFlush(d)
 finally:signal.pthread_sigmask(signal.SIG_SETMASK,previous)
def key(sym,control=False,alt=False):
 code=x.XKeysymToKeycode(d,sym);assert code
 shifted=x.XkbKeycodeToKeysym(d,code,0,0)!=sym
 if shifted:assert x.XkbKeycodeToKeysym(d,code,0,1)==sym,'Unsupported keyboard level'
 modifiers=([x.XKeysymToKeycode(d,0xffe1)] if shifted else [])+([x.XKeysymToKeycode(d,0xffe3)] if control else [])+([x.XKeysymToKeycode(d,0xffe9)] if alt else [])
 try:
  for m in modifiers:raw(m,1)
  raw(code,1);raw(code,0)
 finally:
  # Key-up cleanup is limited to keys this helper successfully pressed.
  # The app may have closed on key-down; never leave a modifier held.
  previous=signal.pthread_sigmask(signal.SIG_BLOCK,cleanup_signals)
  errors=[]
  try:
   for pressed in reversed(held[:]):
    try:raw(pressed,0)
    except BaseException as error:errors.append(error)
  finally:signal.pthread_sigmask(signal.SIG_SETMASK,previous)
  if errors:raise errors[0]
 time.sleep(.03)

if sys.argv[1]=='focus':
 w=int(sys.argv[2],16);transient=ctypes.c_ulong()
 assert property_pid(w)==expected or (x.XGetTransientForHint(d,w,ctypes.byref(transient)) and property_pid(transient.value)==expected),'Window is not owned by the tested app'
 x.XRaiseWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XSetInputFocus.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong]
 x.XRaiseWindow(d,w);x.XSetInputFocus(d,w,2,0);x.XFlush(d);time.sleep(.2);assert safe()
elif sys.argv[1] in ('path','save-path'):
 value=sys.argv[2];assert Path(value).resolve().is_relative_to(ROOT) if hasattr(Path(),'is_relative_to') else str(Path(value).resolve()).startswith(str(ROOT)+'/')
 key(ord('l'),control=True);time.sleep(.3);key(ord('a'),control=True);time.sleep(.1)
 for c in value:key(ord(c))
 if sys.argv[1]=='save-path':key(0xff0d);time.sleep(1);key(ord('s'),alt=True)
 else:key(ord('o'),alt=True)
elif sys.argv[1]=='open':key(ord('o'),alt=True)
elif sys.argv[1]=='text':
 for c in sys.argv[2]:key(ord(c))
elif sys.argv[1]=='save':key(ord('s'),alt=True)
elif sys.argv[1]=='replace':key(ord('r'),alt=True)
elif sys.argv[1]=='copy':key(ord('p'),alt=True)
elif sys.argv[1]=='allow':key(ord('a'),alt=True)
elif sys.argv[1]=='discard':key(ord('d'),alt=True)
elif sys.argv[1]=='quit':key(ord('q'),control=True)
elif sys.argv[1]=='close':key(0xffc1,alt=True)
elif sys.argv[1]=='escape':key(0xff1b)
elif sys.argv[1]=='return':key(0xff0d)
elif sys.argv[1]=='right':key(0xff53)
elif sys.argv[1]=='left':key(0xff51)
elif sys.argv[1]=='tab':key(0xff09)
x.XCloseDisplay(d)
