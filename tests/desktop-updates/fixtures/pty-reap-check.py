# SPDX-License-Identifier: AGPL-3.0-only
"""Deterministic synthetic child/terminal simulation; no process or signal sent."""
import sys,runpy,tempfile,json,signal,termios,contextlib,io,errno
from pathlib import Path
from unittest.mock import patch
fixture=Path(__file__).with_name("signing-pty.py");mode=sys.argv[1]
now=[100.0];polls=[0];kills=[];reaped=[False]
def clock():
    now[0]+=0.01 if mode!="deadline" else 4.0
    return now[0]
def waitpid(pid,options):
    assert pid==32100
    if reaped[0]:raise ChildProcessError()
    polls[0]+=1
    if mode=="deadline":
        if options==0:
            reaped[0]=True
            return (pid,signal.SIGKILL)
        return (0,0)
    if polls[0]==1:return (0,0)
    if polls[0]==2:return (pid,0)
    raise ChildProcessError()
def kill(pid,sig):
    assert mode=="deadline","SIGKILL before the child exit deadline"
    assert now[0]>=116.0,"original12s deadline was shortened"
    kills.append((pid,sig))
def terminal_read(fd,size):
    if mode=="eof":return b""
    raise OSError(errno.EIO,"synthetic closed PTY")
with tempfile.TemporaryDirectory() as tmp:
    config=Path(tmp)/"config.json"
    config.write_text(json.dumps({"secret":"synthetic-only","node":"/not-executed","argv":[]}))
    output=io.StringIO()
    with patch.object(sys,"argv",[str(fixture),str(config)]),patch("pty.fork",return_value=(32100,99)), \
         patch("select.select",return_value=([99],[],[])),patch("os.read",side_effect=terminal_read), \
         patch("os.waitpid",side_effect=waitpid),patch("os.kill",side_effect=kill),patch("os.close"), \
         patch("time.monotonic",side_effect=clock),patch("time.sleep"), \
         patch("termios.tcgetattr",return_value=[0,0,0,termios.ECHO]),contextlib.redirect_stdout(output):
        try:
            runpy.run_path(str(fixture),run_name="__main__")
            assert mode!="deadline","deadline did not fail"
        except RuntimeError as error:
            assert mode=="deadline" and str(error)=="Synthetic signing CLI timed out"
    if mode=="deadline":
        assert kills==[(32100,signal.SIGKILL)] and reaped[0]
    else:
        result=json.loads(output.getvalue())
        assert result["status"]==0 and result["echoRestored"] is True
        assert not kills and polls[0]>=2
print("PASS deterministic "+mode)
