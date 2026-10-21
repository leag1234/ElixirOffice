# SPDX-License-Identifier: AGPL-3.0-only
# Scope every injected event to this app's actual native PID.
import ctypes,os,sys,time,signal
from pathlib import Path
ROOT=Path(os.environ['EO_DESKTOP_ROOT']).resolve() if os.environ.get('EO_DESKTOP_ROOT') else Path(__file__).resolve().parents[2]
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
xvfb_pid=os.environ.get('EO_XVFB_PID')
xvfb_identity=None
def desktop_ready():
 global xvfb_identity
 assert xvfb_pid,'Native input requires an explicitly owned Xvfb; owner desktop is forbidden'
 if xvfb_pid:
  import re
  display=os.environ.get('DISPLAY','')
  assert re.fullmatch(r':[1-9][0-9]+',display),'Headless input requires a private numbered display'
  process=Path('/proc')/str(int(xvfb_pid))
  assert process.stat().st_uid==os.getuid(),'Xvfb must belong to this test user'
  command=(process/'cmdline').read_bytes()
  arguments=command.rstrip(bytes([0])).split(bytes([0]))
  assert Path(os.fsdecode(arguments[0])).name=='Xvfb' and display.encode() in arguments,'Explicit live Xvfb PID/display required'
  assert b'-ac' not in arguments and b'-auth' in arguments,'Private display requires X authorization'
  authority=Path(os.environ['XAUTHORITY']).resolve()
  assert authority.is_relative_to(ROOT) and authority.stat().st_mode&0o777==0o600,'Private X authority required'
  assert os.fsencode(str(authority)) in arguments,'Xvfb must use this runner authority'
  identity=(command,(process/'stat').read_text().rsplit(')',1)[1].split()[19])
  if xvfb_identity is None:xvfb_identity=identity
  assert identity==xvfb_identity,'Xvfb process identity changed'
desktop_ready()
def property_pid(w):
 typ=ctypes.c_ulong();fmt=ctypes.c_int();n=ctypes.c_ulong();after=ctypes.c_ulong();ptr=ctypes.c_void_p()
 x.XGetWindowProperty(d,w,pid_atom,0,1,False,0,ctypes.byref(typ),ctypes.byref(fmt),ctypes.byref(n),ctypes.byref(after),ctypes.byref(ptr))
 result=None
 if ptr.value:
  if fmt.value==32 and n.value:result=ctypes.cast(ptr,ctypes.POINTER(ctypes.c_ulong))[0]
  x.XFree(ptr)
 return result
def safe():
 desktop_ready()
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
def key(sym,control=False,alt=False,shift=False):
 code=x.XKeysymToKeycode(d,sym);assert code
 shifted=x.XkbKeycodeToKeysym(d,code,0,0)!=sym
 if shifted:assert x.XkbKeycodeToKeysym(d,code,0,1)==sym,'Unsupported keyboard level'
 modifiers=([x.XKeysymToKeycode(d,0xffe1)] if shifted or shift else [])+([x.XKeysymToKeycode(d,0xffe3)] if control else [])+([x.XKeysymToKeycode(d,0xffe9)] if alt else [])
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

if sys.argv[1]=='windows':
 import json
 x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
 found=[]
 def visit(w):
  if property_pid(w)==expected:
   name=ctypes.c_void_p()
   if x.XFetchName(d,w,ctypes.byref(name)) and name.value:
    transient=ctypes.c_ulong();has_transient=bool(x.XGetTransientForHint(d,w,ctypes.byref(transient)))
    found.append({'id':hex(w),'name':ctypes.cast(name,ctypes.c_char_p).value.decode('utf-8','replace'),'transient':has_transient,'parent':hex(transient.value)})
    x.XFree(name)
  root=ctypes.c_ulong();parent=ctypes.c_ulong();children=ctypes.c_void_p();count=ctypes.c_uint()
  if x.XQueryTree(d,w,ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(count)):
   ids=list(ctypes.cast(children,ctypes.POINTER(ctypes.c_ulong))[:count.value]) if children.value else []
   if children.value:x.XFree(children)
   for child in ids:visit(child)
 visit(x.XDefaultRootWindow(d))
 for item in found:
  typ=ctypes.c_ulong();fmt=ctypes.c_int();count=ctypes.c_ulong();after=ctypes.c_ulong();ptr=ctypes.c_void_p()
  atom=x.XInternAtom(d,b'_NET_WM_NAME',False)
  x.XGetWindowProperty(d,int(item['id'],16),atom,0,2048,False,0,ctypes.byref(typ),ctypes.byref(fmt),ctypes.byref(count),ctypes.byref(after),ctypes.byref(ptr))
  if ptr.value:
   if fmt.value==8 and count.value:item['name']=ctypes.string_at(ptr,count.value).decode('utf-8','replace')
   x.XFree(ptr)
 print(json.dumps(found));x.XCloseDisplay(d);sys.exit(0)
if sys.argv[1]=='focus':
 w=int(sys.argv[2],16);transient=ctypes.c_ulong()
 assert property_pid(w)==expected or (x.XGetTransientForHint(d,w,ctypes.byref(transient)) and property_pid(transient.value)==expected),'Window is not owned by the tested app'
 x.XRaiseWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XSetInputFocus.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong]
 x.XRaiseWindow(d,w);x.XSetInputFocus(d,w,2,0);x.XFlush(d);time.sleep(.2);assert safe()
elif sys.argv[1]=='drag':
 assert safe(),'Drag must start in the tested app'
 coords=list(map(int,sys.argv[2:]));assert len(coords)==4
 x.XDefaultScreen.argtypes=[ctypes.c_void_p];x.XDefaultScreen.restype=ctypes.c_int
 x.XDisplayWidth.argtypes=x.XDisplayHeight.argtypes=[ctypes.c_void_p,ctypes.c_int]
 screen_number=x.XDefaultScreen(d);width=x.XDisplayWidth(d,screen_number);height=x.XDisplayHeight(d,screen_number)
 assert all(0<=coords[i]<width and 0<=coords[i+1]<height for i in (0,2)),'Drag coordinates outside private display'
 xt.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
 xt.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
 assert xt.XTestFakeMotionEvent(d,screen_number,coords[0],coords[1],0);x.XFlush(d);time.sleep(.1)
 x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
 x.XQueryPointer.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_uint)]
 root=ctypes.c_ulong();child=ctypes.c_ulong();rx=ctypes.c_int();ry=ctypes.c_int();wx=ctypes.c_int();wy=ctypes.c_int();mask=ctypes.c_uint()
 assert x.XQueryPointer(d,x.XDefaultRootWindow(d),ctypes.byref(root),ctypes.byref(child),ctypes.byref(rx),ctypes.byref(ry),ctypes.byref(wx),ctypes.byref(wy),ctypes.byref(mask))
 assert property_pid(child.value)==expected,'Drag start window must belong to the tested app'
 pressed=False
 try:
  previous=signal.pthread_sigmask(signal.SIG_BLOCK,cleanup_signals)
  try:assert xt.XTestFakeButtonEvent(d,1,1,0);pressed=True;x.XFlush(d)
  finally:signal.pthread_sigmask(signal.SIG_SETMASK,previous)
  time.sleep(.15)
  for step in range(1,36):
   desktop_ready();assert safe(),'Drag focus left the tested app'
   px=round(coords[0]+(coords[2]-coords[0])*step/35);py=round(coords[1]+(coords[3]-coords[1])*step/35)
   assert xt.XTestFakeMotionEvent(d,screen_number,px,py,0);x.XFlush(d);time.sleep(.025)
 finally:
  if pressed:
   previous=signal.pthread_sigmask(signal.SIG_BLOCK,cleanup_signals)
   try:assert xt.XTestFakeButtonEvent(d,1,0,0);x.XFlush(d)
   finally:signal.pthread_sigmask(signal.SIG_SETMASK,previous)
 time.sleep(.3)
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
elif sys.argv[1]=='tabclose':key(ord('w'),control=True)
elif sys.argv[1]=='ctrlf4':key(0xffc1,control=True)
elif sys.argv[1]=='newdoc':key(ord('n'),control=True)
elif sys.argv[1]=='savedoc':key(ord('s'),control=True)
elif sys.argv[1]=='saveas':key(0xffc9)
elif sys.argv[1]=='discard':key(ord('d'),alt=True)
elif sys.argv[1]=='quit':key(ord('q'),control=True)
elif sys.argv[1]=='close':key(0xffc1,alt=True)
elif sys.argv[1]=='escape':key(0xff1b)
elif sys.argv[1]=='return':key(0xff0d)
elif sys.argv[1]=='filemenu':key(ord('f'),alt=True)
elif sys.argv[1]=='undo':key(ord('z'),control=True)
elif sys.argv[1]=='redo':key(ord('y'),control=True)
elif sys.argv[1]=='tabmenu':key(0xffc7,shift=True)
elif sys.argv[1]=='down':key(0xff54)
elif sys.argv[1]=='right':key(0xff53)
elif sys.argv[1]=='left':key(0xff51)
elif sys.argv[1]=='tab':key(0xff09)
else:raise ValueError('Unknown native test action')
x.XCloseDisplay(d)
