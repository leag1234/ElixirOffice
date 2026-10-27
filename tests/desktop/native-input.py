# SPDX-License-Identifier: AGPL-3.0-only
# Scope every injected event to this app's actual native PID.
import ctypes,os,sys,time,signal,json,hashlib
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
# Optional exact-dialog guards are supplied only by the native test harness.
exact_window=int(os.environ["EO_NATIVE_WINDOW"],16) if os.environ.get("EO_NATIVE_WINDOW") else None
warning_guard=globals().get("_native_warning_guard")
assert warning_guard is None or callable(warning_guard)
native_identity=json.loads(os.environ["EO_NATIVE_IDENTITY"]) if os.environ.get("EO_NATIVE_IDENTITY") else None
assert exact_window is None or native_identity, "Exact dialog input requires the captured native identity"
class WindowAttributes(ctypes.Structure):
 _fields_=[('x',ctypes.c_int),('y',ctypes.c_int),('width',ctypes.c_int),('height',ctypes.c_int),('border_width',ctypes.c_int),('depth',ctypes.c_int),('visual',ctypes.c_void_p),('root',ctypes.c_ulong),('window_class',ctypes.c_int),('bit_gravity',ctypes.c_int),('win_gravity',ctypes.c_int),('backing_store',ctypes.c_int),('backing_planes',ctypes.c_ulong),('backing_pixel',ctypes.c_ulong),('save_under',ctypes.c_int),('colormap',ctypes.c_ulong),('map_installed',ctypes.c_int),('map_state',ctypes.c_int),('all_event_masks',ctypes.c_long),('your_event_mask',ctypes.c_long),('do_not_propagate_mask',ctypes.c_long),('override_redirect',ctypes.c_int),('screen',ctypes.c_void_p)]
x.XGetWindowAttributes.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(WindowAttributes)];x.XGetWindowAttributes.restype=ctypes.c_int
x.XDefaultRootWindow.argtypes=[ctypes.c_void_p];x.XDefaultRootWindow.restype=ctypes.c_ulong
x.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int]
native_x_error=False
@ctypes.CFUNCTYPE(ctypes.c_int,ctypes.c_void_p,ctypes.c_void_p)
def native_x_error_handler(_display,_event):
 global native_x_error
 native_x_error=True
 return 0
x.XSetErrorHandler.argtypes=[ctypes.c_void_p];x.XSetErrorHandler(ctypes.cast(native_x_error_handler,ctypes.c_void_p))
dialog_atom=x.XInternAtom(d,b"_NET_WM_WINDOW_TYPE_DIALOG",False)
type_atom=x.XInternAtom(d,b"_NET_WM_WINDOW_TYPE",False)
def owned(w):
 if property_pid(w)==expected:return True
 parent=ctypes.c_ulong()
 return bool(x.XGetTransientForHint(d,w,ctypes.byref(parent)) and property_pid(parent.value)==expected)
def window_attributes(w):
 a=WindowAttributes()
 return a if x.XGetWindowAttributes(d,w,ctypes.byref(a)) else None
def dialog_type(w):
 typ=ctypes.c_ulong();fmt=ctypes.c_int();n=ctypes.c_ulong();after=ctypes.c_ulong();ptr=ctypes.c_void_p()
 rc=x.XGetWindowProperty(d,w,type_atom,0,32,False,0,ctypes.byref(typ),ctypes.byref(fmt),ctypes.byref(n),ctypes.byref(after),ctypes.byref(ptr))
 try:return rc==0 and fmt.value==32 and ptr.value and dialog_atom in [ctypes.cast(ptr,ctypes.POINTER(ctypes.c_ulong))[i] for i in range(n.value)]
 finally:
  if ptr.value:x.XFree(ptr)
def exact_dialog_live():
 x.XSync(d,False);assert not native_x_error,"Native window error"
 a=window_attributes(exact_window)
 assert a and a.map_state==2 and owned(exact_window) and dialog_type(exact_window),"Expected mapped owned native dialog changed"
 root=ctypes.c_ulong();parent=ctypes.c_ulong();children=ctypes.c_void_p();n=ctypes.c_uint()
 assert x.XQueryTree(d,x.XDefaultRootWindow(d),ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(n))
 try:ids=[ctypes.cast(children,ctypes.POINTER(ctypes.c_ulong))[i] for i in range(n.value)] if children.value else []
 finally:
  if children.value:x.XFree(children)
 for wid in ids:
  if wid==exact_window:continue
  a=window_attributes(wid)
  assert not (a and a.map_state==2 and dialog_type(wid) and owned(wid)),"Additional mapped owned native dialog"
 x.XSync(d,False);assert not native_x_error
def exact_dialog_focused():
 w=ctypes.c_ulong();r=ctypes.c_int();x.XGetInputFocus(d,ctypes.byref(w),ctypes.byref(r))
 for _ in range(15):
  if w.value==exact_window:return True
  if w.value<=1:return False
  root=ctypes.c_ulong();parent=ctypes.c_ulong();children=ctypes.c_void_p();n=ctypes.c_uint()
  if not x.XQueryTree(d,w.value,ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(n)):return False
  if children.value:x.XFree(children)
  w=parent
 return False
def native_owner_ready():
 if native_identity:
  p=Path("/proc")/str(expected)
  assert native_identity["pid"]==expected and p.stat().st_uid==os.getuid() and os.getsid(expected)==expected
  assert str((p/"exe").resolve(strict=True))==native_identity["executable"]
  assert (p/"stat").read_text().rsplit(")",1)[1].split()[19]==native_identity["startTime"]
  command=(p/"cmdline").read_bytes()
  assert hashlib.sha256(command).hexdigest()==native_identity["commandSha256"]
  assert b"--no-sandbox" not in command and b"--disable-setuid-sandbox" not in command
  Path(native_identity["profile"]).resolve(strict=True).relative_to((ROOT/"profiles").resolve(strict=True))
 if exact_window is not None:exact_dialog_live()

def desktop_ready():
 global xvfb_identity
 native_owner_ready()
 if xvfb_pid:
  import re
  display=os.environ.get('DISPLAY','')
  assert re.fullmatch(r':[1-9][0-9]+',display),'Headless input requires a private numbered display'
  process=Path('/proc')/str(int(xvfb_pid))
  assert process.stat().st_uid==os.getuid(),'Xvfb must belong to this test user'
  command=(process/'cmdline').read_bytes()
  arguments=command.rstrip(bytes([0])).split(bytes([0]))
  assert Path(os.fsdecode(arguments[0])).name=='Xvfb' and display.encode() in arguments,'Explicit live Xvfb PID/display required'
  identity=(command,(process/'stat').read_text().rsplit(')',1)[1].split()[19])
  if xvfb_identity is None:xvfb_identity=identity
  assert identity==xvfb_identity,'Xvfb process identity changed'
 else:
  state=__import__('subprocess').check_output(['loginctl','show-session','c2','-p','Active','-p','LockedHint'],text=True)
  assert 'Active=yes' in state and 'LockedHint=no' in state,'Desktop inactive or locked'
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
 if exact_window is not None and not exact_dialog_focused():return False
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
  if warning_guard is not None:warning_guard()
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


def close_window_policy(rows,pid):
 assert len(rows)<=500
 owned_rows=[r for r in rows if r["pid"]==pid and r["mapped"]]
 assert not any(r["dialog"] for r in owned_rows),"Native close refused while an owned dialog is mapped"
 windows=[r for r in owned_rows if r["normal"] and not r["transient"]]
 assert len(windows)==1,"Native close requires exactly one mapped owned normal window"
 chosen=windows[0]
 assert chosen["delete_protocol"],"Owned window does not advertise WM_DELETE_WINDOW"
 return chosen["window"]
def native_close(focus_only=False):
 # A bare private Xvfb has no window manager to translate Alt-F4. Send the
 # native ICCCM window-deletion request; never destroy/kill a client directly.
 assert xvfb_pid and exact_window is None and native_identity
 import runpy,re
 guard_module=runpy.run_path(str(Path(__file__).with_name("native-dialog.py")))
 def window():
  guard_module["main_identity"](guard_module["owned_bus"]())
  command=guard_module["command"]
  ids=list(dict.fromkeys(re.findall(r"0x[0-9a-f]+",command("xwininfo","-root","-tree"))))
  assert len(ids)<=500
  rows=[]
  for wid in ids:
   if int(wid,16)<=1:continue
   try:
    props=command("xprop","-id",wid,"_NET_WM_PID","_NET_WM_WINDOW_TYPE","WM_TRANSIENT_FOR","WM_PROTOCOLS")
    pid=re.search(r"_NET_WM_PID[^\n]*= ([0-9]+)(?:\n|$)",props)
    if not pid or int(pid[1])!=expected:continue
    mapped="Map State: IsViewable" in command("xwininfo","-id",wid)
    rows.append({"pid":int(pid[1]),"window":wid,"mapped":mapped,"normal":"_NET_WM_WINDOW_TYPE_NORMAL" in props,"dialog":"_NET_WM_WINDOW_TYPE_DIALOG" in props,"transient":bool(re.search(r"WM_TRANSIENT_FOR.*?(0x[0-9a-f]+)",props)),"delete_protocol":bool(re.search(r"WM_PROTOCOLS[^\n]*\bWM_DELETE_WINDOW\b",props))})
   except __import__("subprocess").CalledProcessError as error:
    if "BadWindow" not in str(error.stderr):raise
  return int(close_window_policy(rows,expected),16)
 selected=window()
 if focus_only:
  # A cancelled modal can leave a bare Xvfb focused on the root. Restore only
  # the one revalidated owned normal window, then keep every input guard.
  assert window()==selected,"Native focus target changed"
  x.XRaiseWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
  x.XSetInputFocus.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong]
  x.XRaiseWindow(d,selected);x.XSetInputFocus(d,selected,2,0);x.XFlush(d);time.sleep(.2)
 assert safe(),"Native close focus is not owned by this app"
 # Bind focus to this exact normal window, including a focused child surface.
 focus=ctypes.c_ulong();revert=ctypes.c_int();x.XGetInputFocus(d,ctypes.byref(focus),ctypes.byref(revert))
 for _ in range(15):
  if focus.value==selected:break
  assert focus.value>1,"Native close target does not own focus"
  root=ctypes.c_ulong();parent=ctypes.c_ulong();children=ctypes.c_void_p();count=ctypes.c_uint()
  assert x.XQueryTree(d,focus.value,ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(count))
  if children.value:x.XFree(children)
  focus=parent
 else:raise AssertionError("Native close target does not contain focus")
 if focus_only:return
 class Data(ctypes.Union):
  _fields_=[("b",ctypes.c_char*20),("s",ctypes.c_short*10),("l",ctypes.c_long*5)]
 class ClientMessage(ctypes.Structure):
  _fields_=[("type",ctypes.c_int),("serial",ctypes.c_ulong),("send_event",ctypes.c_int),("display",ctypes.c_void_p),("window",ctypes.c_ulong),("message_type",ctypes.c_ulong),("format",ctypes.c_int),("data",Data)]
 class Event(ctypes.Union):
  _fields_=[("client",ClientMessage),("pad",ctypes.c_long*24)]
 event=Event();event.client.type=33;event.client.display=d;event.client.window=selected
 event.client.message_type=x.XInternAtom(d,b"WM_PROTOCOLS",False);event.client.format=32
 event.client.data.l[0]=x.XInternAtom(d,b"WM_DELETE_WINDOW",False);event.client.data.l[1]=0
 x.XSendEvent.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_long,ctypes.POINTER(Event)];x.XSendEvent.restype=ctypes.c_int
 assert window()==selected,"Native close target changed"
 assert safe(),"Native close focus changed before request"
 assert x.XSendEvent(d,selected,False,0,ctypes.byref(event)),"Native close request failed"
 x.XSync(d,False);assert not native_x_error,"Native close window error"

desktop_ready()
if sys.argv[1]=='focus':
 w=int(sys.argv[2],16);transient=ctypes.c_ulong()
 assert property_pid(w)==expected or (x.XGetTransientForHint(d,w,ctypes.byref(transient)) and property_pid(transient.value)==expected),'Window is not owned by the tested app'
 x.XRaiseWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XSetInputFocus.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong]
 x.XRaiseWindow(d,w);x.XSetInputFocus(d,w,2,0);x.XFlush(d);time.sleep(.2);assert safe()
elif sys.argv[1] in ('path','save-path','path-only'):
 value=sys.argv[2];assert Path(value).resolve().is_relative_to(ROOT) if hasattr(Path(),'is_relative_to') else str(Path(value).resolve()).startswith(str(ROOT)+'/')
 key(ord('l'),control=True);time.sleep(.3);key(ord('a'),control=True);time.sleep(.1)
 for c in value:key(ord(c))
 if sys.argv[1]=='save-path':key(0xff0d);time.sleep(1);key(ord('s'),alt=True)
 elif sys.argv[1]=='path':key(ord('o'),alt=True)
elif sys.argv[1]=='open':key(ord('o'),alt=True)
elif sys.argv[1]=='text':
 for c in sys.argv[2]:key(ord(c))
elif sys.argv[1]=='save':key(ord('s'),alt=True)
elif sys.argv[1]=='replace':key(ord('r'),alt=True)
elif sys.argv[1]=='copy':key(ord('p'),alt=True)
elif sys.argv[1]=='allow':key(ord('a'),alt=True)
elif sys.argv[1]=='discard':key(ord('d'),alt=True)
elif sys.argv[1]=='quit':key(ord('q'),control=True)
elif sys.argv[1]=='focus-main':native_close(focus_only=True)
elif sys.argv[1]=='close':
 if xvfb_pid:native_close()
 else:key(0xffc1,alt=True)
elif sys.argv[1]=='escape':key(0xff1b)
elif sys.argv[1]=='return':key(0xff0d)
elif sys.argv[1]=='right':key(0xff53)
elif sys.argv[1]=='left':key(0xff51)
elif sys.argv[1]=='tab':key(0xff09)
x.XCloseDisplay(d)
