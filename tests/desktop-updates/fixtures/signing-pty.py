# SPDX-License-Identifier: AGPL-3.0-only
"""Own synthetic CLI pseudo-terminal only; never interact with a user desktop."""
import os,sys,json,pty,select,time,signal,termios,base64,re,errno
config=json.load(open(sys.argv[1]))
pid,master=pty.fork()
if pid==0:
    if config.get("stdout_file"):
        fd=os.open(config["stdout_file"],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        if fd!=1:os.dup2(fd,1);os.close(fd)
    if config.get("secret_pipe"):
        read_fd,write_fd=os.pipe()
        os.write(write_fd,config["secret"].encode()+b"\n");os.close(write_fd)
        if read_fd!=3:os.dup2(read_fd,3);os.close(read_fd)
        os.set_inheritable(3,True)
    if config.get("secret_fd"):
        fd=os.open(config["secret_fd"],os.O_RDONLY)
        if fd!=3:os.dup2(fd,3);os.close(fd)
        os.set_inheritable(3,True)
    env={"PATH":"/usr/bin:/bin"}
    os.execve(config["node"],[config["node"],*config["argv"]],env)
transcript=bytearray();sent_secret=False;sent_approval=False;status=None
deadline=time.monotonic()+12
try:
    while time.monotonic()<deadline:
        ready,_,_=select.select([master],[],[],0.05)
        if ready:
            try:
                chunk=os.read(master,65536)
                if not chunk:break
                transcript.extend(chunk)
            except OSError as error:
                if error.errno==errno.EIO:break
                raise
        if b"Private key passphrase (hidden): " in transcript and not sent_secret:
            sent_secret=True
            if config.get("cancel_signal"):os.kill(pid,signal.SIGTERM)
            else:
                value=b"\x03" if config.get("cancel_secret") else config["secret"].encode()+b"\n"
                os.write(master,value)
        match=re.search(rb"Approval: type (SIGN [0-9a-f]{64}) \(hidden\): ",transcript)
        if match and not sent_approval:
            sent_approval=True
            if config.get("mutate"):
                with open(config["mutate"],"ab") as output:output.write(b"changed")
            value=b"NO" if config.get("deny") else match.group(1)
            os.write(master,value+b"\n")
        done,raw=os.waitpid(pid,os.WNOHANG)
        if done:
            status=os.waitstatus_to_exitcode(raw)
            # Drain terminal bytes still pending after the child's exit.
            while select.select([master],[],[],0)[0]:
                try:
                    chunk=os.read(master,65536)
                    if not chunk:break
                    transcript.extend(chunk)
                except OSError as error:
                    if error.errno!=errno.EIO:raise
                    break
            break
    while status is None:
        # EOF/EIO can precede waitpid readiness. Reap within the same deadline.
        done,raw=os.waitpid(pid,os.WNOHANG)
        if done:
            status=os.waitstatus_to_exitcode(raw)
            break
        remaining=deadline-time.monotonic()
        if remaining<=0:
            os.kill(pid,signal.SIGKILL);_,raw=os.waitpid(pid,0)
            raise RuntimeError("Synthetic signing CLI timed out")
        time.sleep(min(0.01,remaining))
    echo_restored=bool(termios.tcgetattr(master)[3]&termios.ECHO)
    print(json.dumps({"status":status,"transcriptBase64":base64.b64encode(transcript).decode(),"echoRestored":echo_restored,"secretPrompt":sent_secret,"approvalPrompt":sent_approval}))
finally:
    try:
        done,_=os.waitpid(pid,os.WNOHANG)
        if not done:os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
    except ChildProcessError:pass
    os.close(master)
