# SPDX-License-Identifier: AGPL-3.0-only
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("build_identity",ROOT/"tools/release/build_identity.py")
identity=importlib.util.module_from_spec(spec);spec.loader.exec_module(identity)
class Identity(unittest.TestCase):
    def fixture(self,root,**changes):
        p=Path(root)/"published.json"
        data={"schema":1,"repository":identity.REPOSITORY,"complete":True,"fetched_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"versions":["0.1.0","0.2.0","0.2.1-rc.41"]}
        data.update(changes);p.write_text(json.dumps(data));return p
    def test_fresh_complete_inventory_rejects_every_published_version(self):
        with tempfile.TemporaryDirectory() as root:
            p=self.fixture(root)
            for v in ["0.1.0","0.2.0","0.2.1-rc.41"]:
                with self.assertRaisesRegex(ValueError,"already published"):identity.published(p,v)
            self.assertTrue(identity.published(p,"0.2.1")["complete"])
            for changes in [{"complete":False},{"repository":"other/repo"},{"fetched_at":"2000-01-01T00:00:00Z"},{"fetched_at":"2999-01-01T00:00:00Z"},{"versions":["0.2.0","0.2.0"]},{"fetched_at":"invalid"}]:
                with self.assertRaises(ValueError):identity.published(self.fixture(root,**changes),"0.2.1")
    def test_monotonic_locked_allocation_consumes_number_and_rejects_reuse(self):
        with tempfile.TemporaryDirectory() as root:
            p=self.fixture(root);ledger=Path(root)/"ledger.json";ledger.write_text('{"schema":1,"builds":[]}')
            v={"build_number":42,"version":"0.2.1-rc.42","product_revision":"a"*40}
            before_hash=identity.sha(ledger)
            proof=identity.reserve(ledger,p,v)
            self.assertEqual(proof["ledger_sha256_before"],before_hash)
            self.assertEqual(proof["ledger_sha256_after"],identity.sha(ledger))
            self.assertEqual(json.loads(ledger.read_text())["builds"][0]["build_number"],42)
            for n in [42,41,0]:
                with self.assertRaises(ValueError):identity.allocation(ledger,{**v,"build_number":n})
            identity.allocation(ledger,{**v,"build_number":43})
            before=ledger.read_bytes()
            with self.assertRaises(ValueError):identity.reserve(ledger,self.fixture(root,complete=False),{**v,"build_number":43})
            self.assertEqual(before,ledger.read_bytes())
    def test_actual_debian_upgrade_ordering(self):
        for a,b in [("0.2.0","0.2.1~rc1"),("0.2.1~rc1","0.2.1~rc2"),("0.2.1~rc2","0.2.1-3"),("0.2.1-3","0.2.1-4"),("0.2.1~rc2","0.2.1~rc10")]:
            subprocess.run(["dpkg","--compare-versions",a,"lt",b],check=True)
    def test_stamp_uses_one_identity_in_package_lock_and_mac_input_source(self):
        with tempfile.TemporaryDirectory() as root:
            desktop=Path(root)/"desktop";desktop.mkdir()
            package=json.loads((ROOT/"desktop/package.json").read_text())
            (desktop/"package.json").write_text(json.dumps(package))
            (desktop/"package-lock.json").write_text('{"version":"0.2.1","packages":{"":{"version":"0.2.1"}}}')
            node=os.environ.get("EO_RELEASE_NODE","node")
            args=["0.2.1","rc",42,"a"*40,"b"*40]
            v=json.loads(subprocess.check_output([node,ROOT/"desktop/build-identity.cjs","create",json.dumps(args)],text=True))
            identity.stamp(root,v)
            actual=json.loads((desktop/"package.json").read_text());lock=json.loads((desktop/"package-lock.json").read_text())
            self.assertEqual(actual["version"],lock["packages"][""]["version"]);self.assertEqual(actual["version"],"0.2.1-rc.42")
            subprocess.run([node,ROOT/"desktop/build-identity.cjs","verify",desktop],check=True)
    def test_public_release_fetcher_paginates_and_does_not_mark_errors_complete(self):
        spec=importlib.util.spec_from_file_location("fetch_published",ROOT/"tools/release/fetch-published-versions.py")
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        calls=[]
        def fetch(url):
            calls.append(url)
            return [{"tag_name":"v0.2.0","draft":False,"assets":[]}]*100 if len(calls)==1 else [{"tag_name":"v0.2.1-rc.42","draft":False,"assets":[]},{"tag_name":"v0.2.1","draft":True,"assets":[]}]
        data=module.collect(fetch)
        self.assertEqual(len(calls),2);self.assertEqual(data["versions"],["0.2.0","0.2.1-rc.42"]);self.assertTrue(data["complete"])
        with self.assertRaises(ValueError):module.collect(lambda url:{"message":"failure"})
        historical=module.collect(lambda url:[{"tag_name":"v0.1.0-beta.2","draft":False,"assets":[{"name":"ElixirOffice-0.1.0-linux-amd64.deb"}]}])
        self.assertEqual(historical["versions"],["0.1.0"])

    def test_real_custom_deb_script_writes_candidate_control_version(self):
        import shutil
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);desktop=root/"desktop";scripts=root/"tools/desktop";scripts.mkdir(parents=True);desktop.mkdir()
            app=desktop/"dist/linux-unpacked";app.mkdir(parents=True)
            (app/"elixiroffice").write_text("#!/bin/sh\\nexit 0\\n");(app/"elixiroffice").chmod(0o755)
            shutil.copyfile(ROOT/"tools/desktop/deb.sh",scripts/"deb.sh")
            shutil.copyfile(ROOT/"desktop/build-identity.cjs",desktop/"build-identity.cjs")
            shutil.copyfile(ROOT/"desktop/icon.png",desktop/"icon.png")
            package=json.loads((ROOT/"desktop/package.json").read_text());(desktop/"package.json").write_text(json.dumps(package))
            (desktop/"package-lock.json").write_text('{"version":"0.2.1","packages":{"":{"version":"0.2.1"}}}')
            node=os.environ.get("EO_RELEASE_NODE","node")
            v=json.loads(subprocess.check_output([node,ROOT/"desktop/build-identity.cjs","create",json.dumps(["0.2.1","rc",42,"a"*40,"b"*40])],text=True))
            identity.stamp(root,v)
            subprocess.run(["bash",scripts/"deb.sh"],check=True,stdout=subprocess.DEVNULL)
            artifact=desktop/"dist/ElixirOffice-0.2.1-rc.42-linux-amd64.deb"
            self.assertEqual(subprocess.check_output(["dpkg-deb","-f",artifact,"Version"],text=True).strip(),"0.2.1~rc42")
    def test_publication_preparation_rechecks_completed_build_without_allocating(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);inventory=self.fixture(root)
            node=os.environ.get("EO_RELEASE_NODE","node")
            v=json.loads(subprocess.check_output([node,ROOT/"desktop/build-identity.cjs","create",json.dumps(["0.2.1","rc",42,"a"*40,"b"*40])],text=True))
            info=root/"BUILD-INFO.json";info.write_text(json.dumps({"state":"partial-unverified","build_identity":v}))
            command=["python3",ROOT/"tools/release/check-publication.py","--build-info",info,"--published-versions",inventory,"--node",node]
            result=subprocess.run(command,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
            self.fixture(root,versions=[v["version"]])
            self.assertNotEqual(subprocess.run(command,capture_output=True).returncode,0)
    def test_symlink_ledger_and_lock_are_rejected_without_losing_authority(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);p=self.fixture(root);target=root/"target.json";target.write_text('{"schema":1,"builds":[]}')
            ledger=root/"ledger.json";ledger.symlink_to(target);original=target.read_bytes()
            v={"build_number":42,"version":"0.2.1-rc.42","product_revision":"a"*40}
            with self.assertRaises(ValueError):identity.reserve(ledger,p,v)
            self.assertTrue(ledger.is_symlink());self.assertEqual(target.read_bytes(),original)
            ledger.unlink();ledger.write_bytes(original);lock=ledger.with_suffix(".json.lock");lock.symlink_to(target)
            with self.assertRaises(OSError):identity.reserve(ledger,p,v)
            self.assertEqual(ledger.read_bytes(),original);self.assertEqual(target.read_bytes(),original)
if __name__=="__main__":unittest.main()
