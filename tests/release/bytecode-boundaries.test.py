#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Test release bytecode boundaries with actual Python imports, without packaging."""
import importlib.util, os, pathlib, shutil, subprocess, sys, tempfile, types, unittest
ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("desktop_beta", ROOT / "tools/release/desktop_beta.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
class BytecodeBoundaries(unittest.TestCase):
    def test_direct_driver_before_helper_imports(self):
        for isolated in (False, True):
            with self.subTest(isolated=isolated), tempfile.TemporaryDirectory() as folder:
                root = pathlib.Path(folder)
                for path in (ROOT / "tools/release").glob("*.py"): shutil.copyfile(path, root / path.name)
                result = subprocess.run([sys.executable, *(["-I"] if isolated else []), str(root / "desktop_beta.py"), "--help"], env={**os.environ, "PYTHONDONTWRITEBYTECODE":"0"}, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(list(root.rglob("*.pyc")), [])
    def test_explicit_child_environment_without_ambient_leaks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root / "logs").mkdir()
            (root / "helper.py").write_text("value=1\n")
            build = driver.Build.__new__(driver.Build)
            build.out, build.info = root, {"phases":[]}
            build.env = {"PATH":os.defpath, "UNRELATED_SECRET":"must-not-leak"}
            build.save = lambda: None
            build.run("probe", [sys.executable, "-c", "import os,helper; print(os.environ.get('PYTHONDONTWRITEBYTECODE')); assert 'UNRELATED_SECRET' not in os.environ"], env={"PATH":os.defpath, "PYTHONDONTWRITEBYTECODE":"0"}, cwd=root)
            self.assertEqual((root / "logs/probe.log").read_text().strip(), "1")
            self.assertEqual(list(root.rglob("*.pyc")), [])
    def test_remote_command_without_environment_forwarding(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root / "helper.py").write_text("value=1\n")
            build = driver.Build.__new__(driver.Build)
            build.args = types.SimpleNamespace(ssh_option=[])
            command = build.ssh({"host":"unused"}, [sys.executable, "-c", "import os,helper; assert os.environ['PYTHONDONTWRITEBYTECODE']=='1'"])
            result = subprocess.run(["bash","-c",command[-1]], cwd=root, env={"PATH":os.defpath,"PYTHONDONTWRITEBYTECODE":"0"}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(list(root.rglob("*.pyc")), [])
    def wrapper_probe(self, kind):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root / "tools/desktop").mkdir(parents=True)
            (root / "desktop/assets").mkdir(parents=True)
            (root / "desktop/assets/desktop-manifest.json").write_text("{}")
            path = root / "bin"; path.mkdir()
            (root / "helper.py").write_text("value=1\n")
            log = root / "probe.log"
            probe = root / "probe.py"
            probe.write_text("import os,helper\nwith open(" + repr(str(log)) + ", 'a') as f: f.write(os.environ.get('PYTHONDONTWRITEBYTECODE', 'missing')+'\\n')\n")
            import shlex
            run_probe = shlex.join([sys.executable, str(probe)])
            def shim(name, body):
                file = path / name; file.write_text("#!/bin/bash\nset -eu\n" + body + "\n"); file.chmod(0o755)
            shim("python3", run_probe)
            shim("npm", run_probe)
            shim("node", 'if [ "$1" = -p ]; then echo 22.23.3; else ' + run_probe + '; fi')
            shim("uname", 'if [ "$1" = -s ]; then echo Darwin; else echo arm64; fi')
            shim("docker", 'args=()\nwhile [ $# -gt 0 ]; do\nif [ "$1" = --env ]; then args+=("$2"); shift 2; else shift; fi\ndone\nenv -i PATH=/usr/bin:/bin "${args[@]}" ' + run_probe)
            shutil.copyfile(ROOT / f"tools/desktop/{kind}.sh", root / f"tools/desktop/{kind}.sh")
            env = {**os.environ, "PATH":str(path)+":"+os.defpath, "PYTHONDONTWRITEBYTECODE":"0", "MAC_BUILD_CACHE":str(root/"cache"), "WINDOWS_BUILD_CACHE":str(root/"cache"), "WINDOWS_BUILDER_IMAGE":driver.DEFAULT_WIN_IMAGE}
            result = subprocess.run(["bash", str(root/f"tools/desktop/{kind}.sh")], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = log.read_text().splitlines()
            self.assertEqual(len(rows), 7 if kind == "mac" else 2)
            self.assertEqual(set(rows), {"1"})
            self.assertEqual(list(root.rglob("*.pyc")), [])
    def test_mac_closed_environments(self):
        self.wrapper_probe("mac")
    def test_windows_host_and_container_environment(self):
        self.wrapper_probe("windows")

    def test_remote_clean_environment_reexec(self):
        import shlex
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            (root/"helper.py").write_text("value=1\n")
            probe=root/"probe.py"
            probe.write_text("import os,helper; assert os.environ.get('PYTHONDONTWRITEBYTECODE')=='1'; assert 'UNRELATED_SECRET' not in os.environ\n")
            script=root/"remote-build.sh"
            prefix=(ROOT/"tools/release/remote-build.sh").read_text().split('MODE="$1"',1)[0]
            script.write_text(prefix+"\n"+shlex.join([sys.executable,str(probe)])+"\n")
            result=subprocess.run(["bash",str(script)],cwd=root,env={"PATH":os.defpath,"HOME":str(root),"PYTHONDONTWRITEBYTECODE":"0","UNRELATED_SECRET":"must-not-leak"},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(list(root.rglob("*.pyc")),[])

if __name__ == "__main__": unittest.main()
