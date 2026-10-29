# SPDX-License-Identifier: AGPL-3.0-only
"""All HTTP/authentication is synthetic; never access a Microsoft account."""
import hashlib
import contextlib
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from graph_references import (SafeError, PrivateStore, GraphHTTP, load_cases,
                              convert_case, write_results, OwnerAuth, folder_items)

class Response:
    def __init__(self, code=200, data=None, body=b"", headers=None):
        self.status_code=code;self.headers=headers or {};self.body=json.dumps(data).encode() if data is not None else body
        self.closed=False
    def iter_content(self,chunk_size=65536):
        for i in range(0,len(self.body),chunk_size):yield self.body[i:i+chunk_size]
    def close(self):self.closed=True

class Session:
    def __init__(self,responses):
        self.responses=list(responses);self.calls=[];self.trust_env=False
    def get(self,url,**kwargs):
        self.calls.append((url,kwargs))
        if not self.responses:raise AssertionError("Unexpected HTTP request")
        return self.responses.pop(0)

class GraphTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def case(self):
        content=b"original-public-fixture"
        file=self.root/"source.docx";file.write_bytes(content)
        key=hashlib.sha256(content).hexdigest()
        manifest=self.root/"selected.jsonl"
        manifest.write_text(json.dumps({"id":key,"input":str(file),"selection":{"bytes":len(content)}})+"\n")
        return load_cases(manifest)[0],manifest,content
    def test_manifest_hash_and_private_input_guard(self):
        case,manifest,_=self.case()
        self.assertEqual(case.sha,case.id)
        case.path.write_bytes(b"changed")
        with self.assertRaises(SafeError) as caught:load_cases(manifest)
        self.assertEqual(caught.exception.code,"LOCAL_INPUT_CHANGED")
        private=self.root/"corpus-private";private.mkdir()
        manifest.write_text(json.dumps({"id":case.id,"input":str(private/"unknown.docx")})+"\n")
        with self.assertRaises(SafeError) as caught:load_cases(manifest)
        self.assertEqual(caught.exception.code,"PRIVATE_INPUT_FORBIDDEN")
    def test_private_store_permissions_and_lock(self):
        directory=self.root/"auth";directory.mkdir(mode=0o777);directory.chmod(0o777)
        with PrivateStore(directory) as store:
            store.write("msal-cache.json","synthetic-cache")
            self.assertEqual(store.read("msal-cache.json"),"synthetic-cache")
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode),0o700)
            self.assertEqual(stat.S_IMODE((directory/"msal-cache.json").stat().st_mode),0o600)
            with self.assertRaises(SafeError):PrivateStore(directory).__enter__()
    def test_private_store_rejects_symlink_git_and_hardlink(self):
        actual=self.root/"actual";actual.mkdir()
        link=self.root/"link";link.symlink_to(actual,target_is_directory=True)
        with self.assertRaises(SafeError):PrivateStore(link).__enter__()
        repo=self.root/"repo";repo.mkdir();(repo/".git").write_text("worktree marker")
        with self.assertRaises(SafeError):PrivateStore(repo/"auth").__enter__()
        with PrivateStore(actual) as store:
            outside=self.root/"outside";outside.write_text("not-auth-state")
            os.link(outside,actual/"msal-cache.json")
            with self.assertRaises(SafeError):store.read("msal-cache.json")
    def test_download_redirect_never_receives_bearer(self):
        graph=Session([Response(302,headers={"Location":"https://unit.files.1drv.com/pdf?sig=synthetic"})])
        download=Session([Response(body=b"public-data")])
        client=GraphHTTP(graph,download,lambda:"unit-credential",sleep=lambda _:None)
        result=client.blob("/me/drive/items/unit/content",self.root/"blob",100)
        self.assertEqual(result["bytes"],11)
        self.assertEqual(graph.calls[0][1]["headers"]["Authorization"],"Bearer unit-credential")
        self.assertNotIn("Authorization",download.calls[0][1]["headers"])
        self.assertFalse(download.calls[0][1]["allow_redirects"])
    def test_unsafe_download_host_rejected_before_request(self):
        for url in ("http://unit.files.1drv.com/x","https://graph.microsoft.com.evil.invalid/x",
                    "https://localhost/x","https://user:pass@unit.files.1drv.com/x"):
            graph=Session([Response(302,headers={"Location":url})]);download=Session([])
            client=GraphHTTP(graph,download,lambda:"unit",sleep=lambda _:None)
            with self.assertRaises(SafeError):client.blob("/me/drive/items/unit/content",self.root/"no",100)
            self.assertEqual(download.calls,[])
    def test_graph_retry_after_and_bounded_blob(self):
        slept=[];session=Session([Response(429,headers={"Retry-After":"3"}),Response(data={"value":[]})])
        client=GraphHTTP(session,Session([]),lambda:"unit",sleep=slept.append)
        self.assertEqual(client.json("/me/drive/items/unit/children"),{"value":[]})
        self.assertEqual(slept,[3])
        client=GraphHTTP(Session([Response(body=b"123456")]),Session([]),lambda:"unit",sleep=lambda _:None)
        with self.assertRaises(SafeError) as caught:client.blob("/me/drive/items/unit/content",self.root/"too-big",3)
        self.assertEqual(caught.exception.code,"DOWNLOAD_TOO_LARGE")
        self.assertFalse((self.root/"too-big").exists())
    def test_graph_does_not_authenticate_arbitrary_urls(self):
        session=Session([]);client=GraphHTTP(session,Session([]),lambda:"unit",sleep=lambda _:None)
        with self.assertRaises(SafeError):client.json("https://elsewhere.invalid/private")
        self.assertEqual(session.calls,[])
    def test_conversion_integrity_resume_and_stale_failure_manifest(self):
        case,_,original=self.case();out=self.root/"out";out.mkdir()
        class FakeGraph:
            def __init__(self,etag_after="stable"):
                self.calls=0;self.etag_after=etag_after
            def blob(self,route,destination,limit):
                self.calls+=1;body=b"%PDF-unit" if "format=pdf" in route else original
                destination.write_bytes(body)
                return {"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest()}
            def json(self,route):return {"id":"item","size":len(original),"eTag":self.etag_after}
        inspect=lambda _:{"pages":1,"fontGlyphCounts":{"UnitFace":4},"fontEvidenceStatus":"extracted"}
        item={"id":"item","name":case.id+".docx","size":len(original),"eTag":"stable","file":{}}
        client=FakeGraph()
        first=convert_case(case,item,client,out,"context",inspect_pdf=inspect)
        self.assertEqual(first["status"],"ok");self.assertEqual(client.calls,2)
        cached=convert_case(case,item,client,out,"context",inspect_pdf=inspect)
        self.assertEqual(cached["status"],"cached");self.assertEqual(client.calls,2)
        (out/(case.id+".pdf")).write_bytes(b"corrupt")
        fixed=convert_case(case,item,client,out,"context",inspect_pdf=inspect)
        self.assertEqual(fixed["status"],"ok");self.assertEqual(client.calls,4)
        with self.assertRaises(SafeError) as caught:
            convert_case(case,{**item,"eTag":"new"},FakeGraph("changed"),out,"context",inspect_pdf=inspect)
        self.assertEqual(caught.exception.code,"CLOUD_INPUT_CHANGED")
        write_results([case],[{"id":case.id,"status":"failed","code":"CLOUD_INPUT_CHANGED"}],out)
        paired=json.loads((out/"paired-manifest.jsonl").read_text())
        self.assertNotEqual(paired["reference"],str(out/(case.id+".pdf")))
        self.assertIsNone(paired["reference"])
    def test_authentication_uses_only_files_read_and_private_tty(self):
        stream=io.StringIO()
        class Cache:
            has_state_changed=True
            def deserialize(self,text):pass
            def serialize(self):return "synthetic-only-cache"
        class App:
            def get_accounts(self):return [{"home_account_id":"unit-account"}] if getattr(self,"signed_in",False) else []
            def initiate_device_flow(self,scopes):
                self.scopes=scopes;return {"user_code":"UNIT-CODE","device_code":"must-not-print"}
            def acquire_token_by_device_flow(self,flow):self.signed_in=True;return {"access_token":"must-not-print"}
        app=App()
        fake=mock.Mock();fake.SerializableTokenCache=Cache;fake.PublicClientApplication.return_value=app
        with PrivateStore(self.root/"auth") as store:
            auth=OwnerAuth("00000000-0000-4000-8000-000000000000","consumers",store,
                           msal_module=fake,http_session=object(),prompt=lambda text:stream.write(text))
            self.assertEqual(auth.token(),"must-not-print");auth.close()
        self.assertEqual(app.scopes,["Files.Read"])
        self.assertIn("UNIT-CODE",stream.getvalue())
        self.assertNotIn("must-not-print",stream.getvalue())
        self.assertNotIn("client_credential",fake.PublicClientApplication.call_args.kwargs)
    def test_existing_blob_destination_is_never_deleted(self):
        destination=self.root/"existing";destination.write_bytes(b"keep-original")
        client=GraphHTTP(Session([Response(body=b"new")]),Session([]),lambda:"unit")
        with self.assertRaises(SafeError):client.blob("/me/drive/items/unit/content",destination,100)
        self.assertEqual(destination.read_bytes(),b"keep-original")
    def test_pagination_cannot_escape_supplied_folder(self):
        case,_,_=self.case()
        data={"value":[{"id":"item","name":case.id+".docx","file":{},"eTag":"one","size":case.size}],
              "@odata.nextLink":"https://graph.microsoft.com/v1.0/me/drive/items/other/children"}
        session=Session([Response(data={"id":"folder","folder":{}}),Response(data=data)])
        client=GraphHTTP(session,Session([]),lambda:"unit")
        with self.assertRaises(SafeError) as caught:folder_items(client,"EO-reference60",[case])
        self.assertEqual(caught.exception.code,"FOLDER_PAGINATION_REJECTED")
        self.assertEqual(len(session.calls),2)
    def test_folder_contains_only_exact_expected_files(self):
        case,_,_=self.case()
        data={"value":[{"id":"other","name":"unexpected-private-name.docx","file":{}}]}
        session=Session([Response(data={"id":"folder","folder":{}}),Response(data=data)])
        client=GraphHTTP(session,Session([]),lambda:"unit")
        with self.assertRaises(SafeError) as caught:folder_items(client,"EO-reference60",[case])
        self.assertEqual(caught.exception.code,"FOLDER_CONTENTS_NOT_EXACT")
    def test_retry_after_http_date_does_not_retry_early(self):
        import datetime
        from email.utils import format_datetime
        now=datetime.datetime(2026,1,1,tzinfo=datetime.timezone.utc)
        retry=format_datetime(now+datetime.timedelta(seconds=4),usegmt=True)
        slept=[];session=Session([Response(429,headers={"Retry-After":retry}),Response(data={"value":[]})])
        client=GraphHTTP(session,Session([]),lambda:"unit",sleep=slept.append,now=lambda:now)
        client.json("/me/drive/items/unit/children")
        self.assertEqual(slept,[4])
    def test_owner_account_changes_auth_context(self):
        class Cache:
            has_state_changed=False
        class App:
            def __init__(self,key):self.key=key
            def get_accounts(self):return [{"home_account_id":self.key}]
            def acquire_token_silent(self,*a,**kw):return {"access_token":"unit"}
        identities=[]
        for account in ("first","second"):
            fake=mock.Mock();fake.SerializableTokenCache=Cache;fake.PublicClientApplication.return_value=App(account)
            with PrivateStore(self.root/("auth-"+account)) as store:
                auth=OwnerAuth("00000000-0000-4000-8000-000000000000","consumers",store,msal_module=fake,http_session=object())
                auth.token();identities.append(auth.identity)
        self.assertNotEqual(*identities)
    def test_cache_ancestor_symlink_cannot_enter_public_collection(self):
        public=self.root/"corpus-public";public.mkdir()
        alias=self.root/"alias";alias.symlink_to(public,target_is_directory=True)
        with self.assertRaises(SafeError) as caught:PrivateStore(alias/"auth").__enter__()
        self.assertEqual(caught.exception.code,"CACHE_LOCATION_FORBIDDEN")
        self.assertFalse((public/"auth").exists())
    def test_real_msal_constructor_uses_only_injected_metadata_transport(self):
        import msal
        calls=[]
        class HTTP:
            def get(self,url,**kwargs):
                import requests
                calls.append(url)
                response=requests.Response();response.status_code=200
                value=({"metadata":[{"aliases":["login.microsoftonline.com","login.windows.net"],
                       "preferred_network":"login.microsoftonline.com","preferred_cache":"login.microsoftonline.com"}]}
                       if "discovery/instance" in url else {
                    "authorization_endpoint":"https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
                    "token_endpoint":"https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
                    "issuer":"https://login.microsoftonline.com/consumers/v2.0"})
                response._content=json.dumps(value).encode()
                return response
            def post(self,*a,**kw):raise AssertionError("No authentication permitted in contract test")
        with PrivateStore(self.root/"contract-auth") as store:
            auth=OwnerAuth("00000000-0000-4000-8000-000000000000","consumers",store,
                           msal_module=msal,http_session=HTTP())
            self.assertEqual(auth.app.get_accounts(),[])
            auth.close()
        self.assertTrue(calls)
        self.assertTrue(all("openid-configuration" in url or "discovery/instance" in url for url in calls))
    def test_cli_end_to_end_is_fully_offline_with_real_pdf_validation(self):
        import graph_references as module
        from test_differential import pdf
        case,manifest,original=self.case()
        reference=self.root/"real.pdf";pdf(reference,[[(20,170,"ALPHA BRAVO")]])
        body=reference.read_bytes()
        class FakeGraph:
            graph_url=staticmethod(GraphHTTP.graph_url)
            def json(self,route):
                if "root:/" in route:return {"id":"folder","folder":{}}
                if "/children" in route:return {"value":[{"id":"item","name":case.id+".docx","file":{},"eTag":"one","size":case.size}]}
                return {"id":"item","eTag":"one","size":case.size}
            def blob(self,route,destination,limit):
                data=body if "format=pdf" in route else original
                destination.write_bytes(data)
                return {"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
        class NoNetwork:
            def __init__(self):self.headers={};self.trust_env=True
            def get(self,*a,**kw):raise AssertionError("No real transport permitted")
            def close(self):pass
        sessions=[NoNetwork() for _ in range(3)]
        auth=mock.Mock();auth.identity="unit-context";auth.token.return_value="unit"
        args=["graph_references.py","--manifest",str(manifest),"--owner-run",
              "--client-id","00000000-0000-4000-8000-000000000000","--tenant","consumers",
              "--folder-path","EO-reference60","--cache-dir",str(self.root/"auth-live"),
              "--out",str(self.root/"references")]
        with mock.patch.object(sys,"argv",args),mock.patch.object(sys.stdin,"isatty",return_value=True), \
             mock.patch("requests.Session",side_effect=sessions), \
             mock.patch.object(module,"OwnerAuth",return_value=auth), \
             mock.patch.object(module,"GraphHTTP",return_value=FakeGraph()), \
             mock.patch.object(module.logging,"disable") as disable_logs, \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(module.main(),0)
        result=json.loads((self.root/"references/run-results.json").read_text())
        self.assertEqual(result["counts"],{"ok":1})
        self.assertEqual(result["runState"],"complete")
        self.assertEqual(result["results"][0]["pages"],1)
        self.assertTrue(result["results"][0]["fontGlyphCounts"])
        self.assertTrue(all(not session.trust_env for session in sessions))
        disable_logs.assert_called_once_with(module.logging.CRITICAL)
        paired=json.loads((self.root/"references/paired-manifest.jsonl").read_text())
        self.assertTrue(Path(paired["reference"]).is_file())
    def test_error_codes_cannot_echo_urls_or_tokens(self):
        self.assertEqual(SafeError("https://signed.invalid/unit").code,"INTERNAL_ERROR")
    def test_cli_plan_and_owner_tty_guard_never_authenticate(self):
        _,manifest,_=self.case()
        script=Path(__file__).with_name("graph_references.py")
        plan=subprocess.run([sys.executable,str(script),"--manifest",str(manifest),"--plan"],capture_output=True,text=True)
        self.assertEqual(plan.returncode,0,plan.stderr)
        live=subprocess.run([sys.executable,str(script),"--manifest",str(manifest),"--owner-run"],capture_output=True,text=True)
        self.assertNotEqual(live.returncode,0)
        self.assertIn("OWNER_TTY_REQUIRED",live.stderr)

if __name__=="__main__":unittest.main()
