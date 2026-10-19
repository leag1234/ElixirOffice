# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
source=Path(__file__).resolve().parents[2]/"tools/release/desktop_beta.py"
spec=importlib.util.spec_from_file_location("sdk_release_inputs",source)
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
class SDKInputs(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  self.inventory=json.loads((source.parent/"desktop-test-inputs.json").read_text())
  self.inventory.update(schema=2,sdkjs_files=["pdf/src/thumbnails.js"])
  self.path=self.root/"inventory.json";self.path.write_text(json.dumps(self.inventory))
  for name in ["web-apps","sdkjs",""]:
   repo=self.root/name;repo.mkdir(exist_ok=True)
   self.git(repo,"init","-b","main");self.git(repo,"config","user.name","Public test fixture");self.git(repo,"config","user.email","fixture@example.invalid")
  for name in self.inventory["files"]:
   p=self.root/"web-apps"/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text("PUBLIC_RECORDED_"+name)
  for folder,count in self.inventory["locales"].items():
   p=self.root/"web-apps"/folder;p.mkdir(parents=True,exist_ok=True)
   for i in range(count):(p/("unit%02d.json"%i)).write_text("{}")
  self.git(self.root/"web-apps","add",".");self.git(self.root/"web-apps","commit","-m","Public recorded web inputs")
  self.web=self.git(self.root/"web-apps","rev-parse","HEAD")
  p=self.root/"sdkjs/pdf/src/thumbnails.js";p.parent.mkdir(parents=True);p.write_text("PUBLIC_RECORDED_SDK")
  for name in json.loads((source.parent/"desktop-test-inputs.json").read_text())["sdkjs_files"]:
   p=self.root/"sdkjs"/name
   if not p.exists():p.parent.mkdir(parents=True,exist_ok=True);p.write_text("PUBLIC_RECORDED_"+name)
  self.git(self.root/"sdkjs","add",".");self.git(self.root/"sdkjs","commit","-m","Public recorded SDK input")
  self.sdk=self.git(self.root/"sdkjs","rev-parse","HEAD")
  self.record()
 def git(self,repo,*args):
  return subprocess.check_output(["git","-C",str(repo),*args],text=True,stderr=subprocess.DEVNULL).strip()
 def record(self,mode="160000",object_id=None):
  self.git(self.root,"update-index","--add","--cacheinfo",mode,object_id or self.sdk,"sdkjs")
  self.git(self.root,"update-index","--add","--cacheinfo","160000",self.web,"web-apps")
  self.git(self.root,"commit","--allow-empty","-m","Public recorded DS links")
  self.ds=self.git(self.root,"rev-parse","HEAD")
 def export(self):
  return release.export_test_upstream(self.root,self.web,self.ds,self.root/"export",self.path)
 def test_sdk_uses_recorded_gitlink_despite_ambient_head_drift(self):
  p=self.root/"sdkjs/pdf/src/thumbnails.js";p.write_text("PUBLIC_AMBIENT_SDK")
  self.git(self.root/"sdkjs","add",".");self.git(self.root/"sdkjs","commit","-m","Different ambient SDK")
  result=release.export_test_upstream(self.root,self.web,self.ds,self.root/"export")
  self.assertEqual(result["inventory_sha256"],release.digest(source.parent/"desktop-test-inputs.json"))
  self.assertEqual(result["sdkjs_revision"],self.sdk)
  self.assertEqual((self.root/"export/sdkjs/pdf/src/thumbnails.js").read_text(),"PUBLIC_RECORDED_SDK")
  self.assertEqual(result["files"]["sdkjs/pdf/src/thumbnails.js"]["git_blob"],self.git(self.root/"sdkjs","rev-parse",self.sdk+":pdf/src/thumbnails.js"))
  for name in self.inventory["files"]:
   self.assertEqual((self.root/"export/web-apps"/name).read_text(),"PUBLIC_RECORDED_"+name)
  for name in json.loads((source.parent/"desktop-test-inputs.json").read_text())["sdkjs_files"]:
   recorded=subprocess.check_output(["git","-C",str(self.root/"sdkjs"),"show",self.sdk+":"+name])
   self.assertEqual((self.root/"export/sdkjs"/name).read_bytes(),recorded)
   self.assertEqual(result["files"]["sdkjs/"+name]["git_blob"],self.git(self.root/"sdkjs","rev-parse",self.sdk+":"+name))
  self.assertEqual(result["locale_count"],sum(self.inventory["locales"].values()))
  for name,record in result["files"].items():self.assertEqual(release.digest(self.root/"export"/name),record["sha256"])
 def test_missing_sdk_blob_is_rejected(self):
  self.inventory["sdkjs_files"]=["pdf/src/missing.js"];self.path.write_text(json.dumps(self.inventory))
  with self.assertRaisesRegex(ValueError,"SDK"):self.export()
  self.assertFalse((self.root/"export").exists())
 def test_symlink_sdk_blob_is_rejected(self):
  p=self.root/"sdkjs/pdf/src/thumbnails.js";p.unlink();p.symlink_to("public-missing-target")
  self.git(self.root/"sdkjs","add",".");self.git(self.root/"sdkjs","commit","-m","Public symlink fixture")
  self.sdk=self.git(self.root/"sdkjs","rev-parse","HEAD");self.record()
  with self.assertRaisesRegex(ValueError,"regular"):self.export()
 def test_unsafe_sdk_inventory_path_is_rejected(self):
  self.inventory["sdkjs_files"]=["../public-escape.js"];self.path.write_text(json.dumps(self.inventory))
  with self.assertRaisesRegex(ValueError,"path"):self.export()
  self.assertFalse((self.root/"export").exists())
 def test_sdk_entry_must_be_a_recorded_gitlink(self):
  blob=self.git(self.root/"web-apps","rev-parse",self.web+":"+self.inventory["files"][0])
  content=subprocess.check_output(["git","-C",str(self.root/"web-apps"),"cat-file","blob",blob])
  object_id=subprocess.check_output(["git","-C",str(self.root),"hash-object","-w","--stdin"],input=content).decode().strip()
  self.record("100644",object_id)
  with self.assertRaisesRegex(ValueError,"gitlink"):self.export()
 def test_legacy_web_only_inventory_remains_supported(self):
  self.inventory.update(schema=1);self.inventory.pop("sdkjs_files");self.path.write_text(json.dumps(self.inventory))
  result=self.export()
  self.assertEqual(result["schema"],1);self.assertNotIn("sdkjs_revision",result)
  self.assertTrue(all(name.startswith("web-apps/") for name in result["files"]))
if __name__=="__main__":unittest.main()
