# SPDX-License-Identifier: AGPL-3.0-only
import ast,types,unittest,signal
from pathlib import Path
source=Path(__file__).with_name('native-input.py')
class Cleanup(unittest.TestCase):
 def run_case(self,lose=False,fail=False,inactive=False):
  events=[]; state={'focus':not inactive}
  class X:
   def XKeysymToKeycode(self,d,s):return s
   def XkbKeycodeToKeysym(self,d,c,g,l):return c
   def XFlush(self,d):pass
  class XT:
   def XTestFakeKeyEvent(self,d,k,down,t):
    if fail and k==ord('q') and down:return 0
    events.append((k,down))
    if lose and k==ord('q') and down:state['focus']=False
    return 1
  ns=dict(signal=signal,cleanup_signals={signal.SIGTERM,signal.SIGINT},x=X(),xt=XT(),d=None,held=[],safe=lambda:state['focus'],time=types.SimpleNamespace(sleep=lambda _:None))
  tree=ast.parse(source.read_text()); funcs=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('raw','key')]
  exec(compile(ast.Module(body=funcs,type_ignores=[]),str(source),'exec'),ns)
  try:ns['key'](ord('q'),control=True)
  except AssertionError:
   if not(fail or inactive):raise
  self.assertEqual(ns['held'],[])
  self.assertEqual(sorted(k for k,d in events if d),sorted(k for k,d in events if not d))
  if inactive:self.assertEqual(events,[])
  with self.assertRaises(AssertionError):ns['raw'](42,0)
 def test_sigterm_at_dispatch_boundary_releases_pressed_keys(self):
  events=[]; pending={"term":False}; holder={}
  class FakeSignal:
   SIGTERM=15; SIGINT=2; SIG_BLOCK=0; SIG_SETMASK=1
   def __init__(self):self.mask=set()
   def pthread_sigmask(self,how,mask):
    previous=set(self.mask)
    if how==self.SIG_BLOCK:self.mask.update(mask)
    else:self.mask=set(mask)
    if pending["term"] and self.SIGTERM not in self.mask:
     pending["term"]=False
     holder["ns"]["interrupted"](self.SIGTERM,None)
    return previous
  fake_signal=FakeSignal()
  class X:
   def XKeysymToKeycode(self,d,s):return s
   def XkbKeycodeToKeysym(self,d,c,g,l):return c
   def XFlush(self,d):pass
  class XT:
   def XTestFakeKeyEvent(self,d,k,down,t):
    events.append((k,down))
    if k==ord("q") and down:
     if fake_signal.SIGTERM not in fake_signal.mask:raise AssertionError("dispatch was not signal-masked")
     pending["term"]=True
    return 1
  ns=dict(signal=fake_signal,cleanup_signals={fake_signal.SIGTERM,fake_signal.SIGINT},x=X(),xt=XT(),d=None,held=[],safe=lambda:True,time=types.SimpleNamespace(sleep=lambda _:None))
  holder["ns"]=ns
  tree=ast.parse(source.read_text()); funcs=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ("interrupted","raw","key")]
  exec(compile(ast.Module(body=funcs,type_ignores=[]),str(source),"exec"),ns)
  with self.assertRaises(SystemExit) as caught:ns["key"](ord("q"),control=True)
  self.assertEqual(caught.exception.code,128+fake_signal.SIGTERM)
  self.assertEqual(ns["held"],[])
  self.assertEqual(sorted(k for k,d in events if d),sorted(k for k,d in events if not d))
  self.assertIn((ord("q"),1),events)
  self.assertIn((ord("q"),0),events)
  self.assertEqual(fake_signal.mask,set())
  self.assertFalse(pending["term"])
 def test_normal(self):self.run_case()
 def test_focus_lost_on_close(self):self.run_case(lose=True)
 def test_failed_second_press(self):self.run_case(fail=True)
 def test_inactive_no_input(self):self.run_case(inactive=True)
if __name__=='__main__':unittest.main()
