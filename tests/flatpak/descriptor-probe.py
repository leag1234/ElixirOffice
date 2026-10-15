# SPDX-License-Identifier: AGPL-3.0-only
import ctypes,os,json
libc=ctypes.CDLL(None,use_errno=True);libc.close_range.argtypes=[ctypes.c_uint,ctypes.c_uint,ctypes.c_int];libc.close_range.restype=ctypes.c_int
ctypes.set_errno(0);result=libc.close_range(200,199,0);invalid=ctypes.get_errno()
ctypes.set_errno(0);result=libc.close_range(200,0xffffffff,0);unsupported=ctypes.get_errno()
fd=os.open('/dev/null',os.O_RDONLY);os.dup2(fd,200,inheritable=True);os.close(fd)
g=ctypes.CDLL('libglib-2.0.so.0');g.g_spawn_sync.argtypes=[ctypes.c_char_p,ctypes.POINTER(ctypes.c_char_p),ctypes.POINTER(ctypes.c_char_p),ctypes.c_int,ctypes.c_void_p,ctypes.c_void_p,ctypes.POINTER(ctypes.c_char_p),ctypes.POINTER(ctypes.c_char_p),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_void_p)];g.g_spawn_sync.restype=ctypes.c_int
argv=(ctypes.c_char_p*5)(b'/usr/bin/test',b'!',b'-e',b'/proc/self/fd/200',None);status=ctypes.c_int(-1);error=ctypes.c_void_p();ok=g.g_spawn_sync(None,argv,None,0,None,None,None,None,ctypes.byref(status),ctypes.byref(error));os.close(200)
print(json.dumps({'close_range_errno':unsupported,'invalid_errno':invalid,'g_spawn_ok':ok,'child_exit_status':status.value,'synthetic_descriptor':200,'child_descriptor_closed':bool(ok and status.value==0)}))
if os.environ.get('EO_EXPECT_FALLBACK')=='1':assert result==-1 and invalid==22 and unsupported==38 and ok and status.value==0
else:assert invalid==1 and unsupported==1 and ok==0
