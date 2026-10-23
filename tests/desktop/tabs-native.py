# SPDX-License-Identifier: AGPL-3.0-only
# Runs on a newly created private Xvfb, never the owner's desktop.
from pathlib import Path
import subprocess,os,time,signal,json,secrets,socket,struct,argparse
parser=argparse.ArgumentParser(description='Run document tabs on a fresh private authorized Xvfb.')
parser.add_argument('--suite',choices=['tabs','detach','navigation','backstage','home','home-capture','release','compact','recovery','header-alignment'],default='tabs')
suite=parser.parse_args().suite
driver_file=Path(__file__).with_name({'tabs':'tabs-native.cjs','detach':'tabs-detach-native.cjs','navigation':'navigation-native.cjs','backstage':'backstage-native.cjs','home':'home-native.cjs','home-capture':'home-capture-native.cjs','release':'release-native.cjs','compact':'compact-native.cjs','recovery':'compact-recovery-native.cjs','header-alignment':'header-alignment-native.cjs'}[suite])
required=['EO_NATIVE_WORK','EO_PRODUCT_ROOT','EO_ELECTRON','EO_PLAYWRIGHT','EO_XVFB','EO_NODE']
for name in required:
    if not os.environ.get(name):raise RuntimeError('Required environment variable: '+name)
w=Path(os.environ['EO_NATIVE_WORK'])
if not w.is_absolute():raise RuntimeError('EO_NATIVE_WORK must be absolute')
w.mkdir(exist_ok=False)
profile=w/'profile';profile.mkdir()
(profile/'desktop-settings.json').write_text(json.dumps({'recents':[],'fontConsent':False,'fontChoice':'declined',**({'customTitleBar':True} if suite in ['compact','recovery','header-alignment'] else {})}))
display=driver=None
def interrupted(number,frame):
    raise SystemExit(128+number)
for number in (signal.SIGTERM,signal.SIGINT):
    signal.signal(number,interrupted)

def session_members(session_id):
    # Both children start new Linux sessions. Inspect only those exact sessions,
    # including descendants whose direct parent or original leader has exited.
    members=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():continue
        try:
            fields=(entry/'stat').read_text().rsplit(')',1)[1].split()
            if int(fields[3])==session_id:members.append((int(entry.name),int(fields[2]),fields[0]))
        except (OSError,ValueError,IndexError):continue
    return members

def stop_session(child):
    if child is None:return []
    def live():return [item for item in session_members(child.pid) if item[2]!='Z']
    for number,seconds in ((signal.SIGTERM,3),(signal.SIGKILL,3)):
        groups={group for _pid,group,_state in live()}
        if child.poll() is None:groups.add(child.pid)
        for group in groups:
            try:os.killpg(group,number)
            except ProcessLookupError:pass
        deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            child.poll()
            if not live() and child.poll() is not None:return []
            time.sleep(.05)
    child.poll()
    return [pid for pid,_group,_state in live()]

try:
    n=next(n for n in range(310,990) if not Path('/tmp/.X11-unix/X'+str(n)).exists() and not Path('/tmp/.X'+str(n)+'-lock').exists())
    authority=w/'Xauthority'
    fields=[socket.gethostname().encode(),str(n).encode(),b'MIT-MAGIC-COOKIE-1',secrets.token_bytes(16)]
    with os.fdopen(os.open(authority,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as auth:
        auth.write(struct.pack('>H',256)+b''.join(struct.pack('>H',len(value))+value for value in fields))
    with (w/'xvfb.log').open('w') as xl,(w/'driver.log').open('w') as dl:
        previous=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
        try:
            display=subprocess.Popen([os.environ['EO_XVFB'],':'+str(n),'-screen','0','1440x1000x24','-nolisten','tcp','-auth',str(authority)],stdout=xl,stderr=xl,start_new_session=True)
        finally:signal.pthread_sigmask(signal.SIG_SETMASK,previous)
        for _ in range(100):
            if display.poll() is not None:raise RuntimeError('Xvfb exited')
            if Path('/tmp/.X11-unix/X'+str(n)).exists():break
            time.sleep(.05)
        else:raise RuntimeError('Private Xvfb did not become ready')
        env={**os.environ,'DISPLAY':':'+str(n),'XAUTHORITY':str(authority),'EO_XVFB_PID':str(display.pid),'EO_DESKTOP_ROOT':str(w),'EO_DESKTOP_PROFILE':str(profile),'XDG_CONFIG_HOME':str(w/'config'),'XDG_DATA_HOME':str(w/'data'),'XDG_CACHE_HOME':str(w/'cache'),'GSETTINGS_BACKEND':'memory','GTK_USE_PORTAL':'0','DBUS_SESSION_BUS_ADDRESS':'unix:path='+str(w/'no-session-bus'),'LANG':'C.UTF-8','LC_ALL':'C.UTF-8'}
        previous=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
        try:
            driver=subprocess.Popen([os.environ['EO_NODE'],str(driver_file)],env=env,stdout=dl,stderr=dl,start_new_session=True)
        finally:signal.pthread_sigmask(signal.SIG_SETMASK,previous)
        (w/'owned.json').write_text(json.dumps({'driverPid':driver.pid,'xvfbPid':display.pid,'display':env['DISPLAY']}))
        result=driver.wait(timeout=300)
        print('DRIVER_EXIT',result,flush=True)
        raise SystemExit(result)
finally:
    for number in (signal.SIGTERM,signal.SIGINT):signal.signal(number,signal.SIG_IGN)
    survivors=[]
    for child in [driver,display]:survivors.extend(stop_session(child))
    (w/'cleanup.json').write_text(json.dumps({'driverExited':driver is None or driver.poll() is not None,'displayExited':display is None or display.poll() is not None,'ownedSessionsExited':not survivors,'survivingOwnedPids':survivors}))
    if survivors:raise RuntimeError('Owned native test session did not stop')
