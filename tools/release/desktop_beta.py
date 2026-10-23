#!/usr/bin/env python3
"""Build an isolated desktop candidate; never integrate or publish it."""
# SPDX-License-Identifier: AGPL-3.0-only
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
DEFAULT_FONT_IMAGE = "sha256:88c561d6fb2bb8529df467fc0543becc6323e58d18734136e2396c683afeef96"
DEFAULT_WIN_IMAGE = "electronuserland/builder@sha256:b226b27b1a7e95ad25eb3d6414ea90c56c04eb6d8329967f4d721dce50b989ff"
ARTIFACTS = {"x2t.js", "x2t.wasm", "x2t.js.gz", "x2t.js.br", "x2t.wasm.gz", "x2t.wasm.br"}

_identity_spec = importlib.util.spec_from_file_location("build_identity", HERE / "build_identity.py")
build_identity = importlib.util.module_from_spec(_identity_spec)
_identity_spec.loader.exec_module(build_identity)

_update_spec = importlib.util.spec_from_file_location("appimage_update", HERE / "appimage_update.py")
appimage_update = importlib.util.module_from_spec(_update_spec)
_update_spec.loader.exec_module(appimage_update)


def appimage_names(version):
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){2}(?:-rc\.[1-9][0-9]*)?", version):
        raise ValueError("Invalid package version")
    name = "ElixirOffice-" + version + "-x86_64.AppImage"
    return name, name + ".zsync"


def validate_desktop_version(package, published_path=None):
    version = package.get("version", "")
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){2}(?:-rc\.[1-9][0-9]*)?", version):
        raise ValueError("Invalid desktop package version")
    if published_path is not None:
        build_identity.published(published_path, version)
    return version


def render_release_notes(template, identity):
    fields = {"VERSION":identity["version"], "BUILD_NUMBER":identity["build_number"],
              "PRODUCT_REVISION":identity["product_revision"],
              "RELEASE_STATUS":"This is a release candidate." if identity["channel"] == "rc" else "This is the final version rebuilt for acceptance."}
    for key, value in fields.items():
        template = template.replace("{{" + key + "}}", str(value))
    if "{{" in template:
        raise ValueError("Unresolved release note field")
    return template


def validate_update_packaging(package):
    config = package["build"]
    if config.get("publish", "unset") is not None or any(config.get(key, {}).get("publish") is not None for key in ("linux", "appImage")):
        raise ValueError("AppImage packaging must disable application update feeds explicitly")
    if config.get("appImage", {}).get("artifactName") != "ElixirOffice-${version}-x86_64.${ext}" or "--publish never" not in package["scripts"]["package"]:
        raise ValueError("AppImage naming/publish policy is not configured")


def public_artifact_names(folder):
    names = []
    for file in Path(folder).iterdir():
        if re.fullmatch(r"(?:(?:latest|beta|alpha)[^/]*|app-update)\.yml", file.name):
            raise ValueError("Application updater feed must not be published")
        if file.suffix in {".AppImage", ".zsync", ".deb", ".exe", ".dmg", ".flatpak"} or file.name.endswith("-evidence.tar") or file.name in {"RELEASE-NOTES.md", "MAC-INPUT.tar"}:
            if not file.is_file() or file.is_symlink():
                raise ValueError("Artifact must be a regular file")
            if file.suffix == ".zsync" and not (file.parent / file.name.removesuffix(".zsync")).is_file():
                raise ValueError("Orphan zsync artifact")
            names.append(file.name)
    for name in names:
        if name.endswith(".AppImage") and name + ".zsync" not in names:
            raise ValueError("Missing AppImage external update control file")
    return sorted(names)

def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as source:
        for data in iter(lambda: source.read(1024 * 1024), b""):
            h.update(data)
    return h.hexdigest()

def capture(args):
    return subprocess.check_output([str(x) for x in args], text=True).strip()

def git(repo, *args):
    return capture(["git", "-C", repo, *args])

def revision(repo, ref, integrated):
    if not ref or ref.startswith("-"):
        raise ValueError("Invalid revision")
    commit = git(repo, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}")
    subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", commit, integrated], check=True)
    return commit

def gitlinks(repo, commit):
    raw = subprocess.check_output(["git", "-C", str(repo), "ls-tree", "-r", "-z", commit])
    result = {}
    for row in raw.split(b"\0"):
        if not row:
            continue
        header, name = row.split(b"\t", 1)
        mode, kind, sha = header.decode().split()
        if mode == "160000":
            path = name.decode()
            if Path(path).is_absolute() or ".." in Path(path).parts:
                raise ValueError("Unsafe submodule path")
            result[path] = sha
    if not {"sdkjs", "web-apps", "core-fonts", "document-templates"}.issubset(result):
        raise ValueError("Incomplete DocumentServer gitlinks")
    return result

def pin(repo, commit, path):
    return json.loads(git(repo, "show", commit + ":" + path))

def pdf_source_pin(repo, commit):
    path = "tools/wasm/pdf-runtime-release.json"
    if not git(repo, "ls-tree", "--name-only", commit, "--", path):
        path = "tools/wasm/runtime-release.json"
    # Neither layout is accepted until verify_runtime(..., "pdf") proves its kind.
    return pin(repo, commit, path), path

def verify_runtime(folder, expected, kind=None):
    folder = Path(folder).resolve(strict=True)
    manifest = json.loads((folder / "manifest.json").read_text())
    if digest(folder / "manifest.json") != expected["manifest_sha256"] or manifest["artifact_version"] != expected["artifact_version"]:
        raise ValueError("Runtime does not match the selected source pin: " + str(folder))
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", manifest["artifact_version"]):
        raise ValueError("Unsafe runtime version")
    module_kind = manifest.get("build_flags", {}).get("module_kind")
    if kind == "full" and module_kind == "pdf" or kind == "pdf" and module_kind != "pdf":
        raise ValueError("Full/PDF runtime kind mismatch")
    if set(manifest["artifacts"]) != ARTIFACTS:
        raise ValueError("Runtime artifact set is incomplete")
    for name, item in manifest["artifacts"].items():
        file = folder / name
        if file.is_symlink() or file.stat().st_size != item["bytes"] or digest(file) != item["sha256"]:
            raise ValueError("Runtime checksum mismatch: " + name)
    return {"path": str(folder), **expected, "artifacts": manifest["artifacts"]}

def output_path(date, label):
    datetime.date.fromisoformat(date)
    if label and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,40}", label):
        raise ValueError("Invalid run label")
    return Path("/srv/elixiroffice/release") / ("desktop-0.2.0-" + date + ("-" + label if label else ""))

def endpoint(host, root):
    if not host or host.startswith("-") or not re.fullmatch(r"[A-Za-z0-9_.@:-]+", host):
        raise ValueError("Provide a valid SSH host")
    path = Path(root or "")
    if not root or not path.is_absolute() or ".." in path.parts or any(ord(c) < 32 for c in root):
        raise ValueError("Use an absolute owned remote root")
    if not re.fullmatch(r"release-beta2(?:-[A-Za-z0-9-]+)?", path.name):
        raise ValueError("Use a dedicated release-beta2 remote root")
    return {"host": host, "root": root}

def checksum_inventory(folder, names):
    result = {}
    for name in names:
        file = folder / name
        if file.is_symlink() or not file.is_file() or file.stat().st_size == 0:
            raise ValueError("Missing or empty artifact: " + name)
        result[name] = {"bytes": file.stat().st_size, "sha256": digest(file)}
    (folder / "SHA256SUMS").write_text("".join(value["sha256"] + "  " + name + "\n" for name, value in sorted(result.items())))
    return result

def export_test_upstream(upstream, web_revision, ds_revision, destination, inventory_path=None):
    """Export test source blobs from recorded gitlinks, never ambient HEAD."""
    source = Path(upstream) / "web-apps"
    raw = subprocess.check_output(["git", "-C", str(source), "ls-tree", "-r", "-z", web_revision])
    entries = {}
    inventory_path = Path(inventory_path or HERE / "desktop-test-inputs.json")
    inventory = json.loads(inventory_path.read_text())
    schema = inventory.get("schema")
    if schema not in (1, 2):
        raise ValueError("Unsupported desktop test inventory schema")
    sdk_required = inventory.get("sdkjs_files", [])
    if schema == 2 and (not isinstance(sdk_required, list) or not sdk_required):
        raise ValueError("Schema 2 requires SDK source inputs")
    for name in sdk_required:
        if (not isinstance(name, str) or not name or name.startswith("/") or
                any(part in ("", ".", "..") for part in name.split("/")) or
                chr(92) in name or ":" in name or any(ord(char) < 32 for char in name)):
            raise ValueError("Unsafe SDK test input path")
    if len(set(sdk_required)) != len(sdk_required):
        raise ValueError("Duplicate SDK test input path")
    required = set(inventory["files"])
    locale_prefixes = {name + "/": count for name, count in inventory["locales"].items()}
    for row in raw.split(b"\0"):
        if not row:
            continue
        header, name = row.split(b"\t", 1)
        mode, kind, blob = header.decode().split()
        name = name.decode()
        locale = any(name.startswith(prefix) and re.fullmatch(r"[A-Za-z0-9_-]+\.json", name[len(prefix):]) for prefix in locale_prefixes)
        if name in required or locale or name in inventory["optional_files"]:
            if mode not in {"100644", "100755"} or kind != "blob":
                raise ValueError("Test upstream inputs must be regular tracked files")
            entries[name] = blob
    if not required.issubset(entries):
        raise ValueError("Missing recorded upstream inputs for desktop tests")
    locale_counts = {prefix.rstrip("/"): sum(name.startswith(prefix) for name in entries) for prefix in locale_prefixes}
    if any(locale_counts[prefix.rstrip("/")] != count for prefix, count in locale_prefixes.items()):
        raise ValueError("Expected all 45 recorded locale source files in each editor")
    locale_count = sum(locale_counts.values())
    sdk_entries = {}
    sdk_revision = None
    if schema == 2:
        if not re.fullmatch(r"[0-9a-f]{40}", ds_revision):
            raise ValueError("SDK export requires a recorded DocumentServer revision")
        link = subprocess.check_output(["git", "-C", str(upstream), "ls-tree", "-z", ds_revision, "--", "sdkjs"]).split(b"\0")
        if len(link) != 2 or not link[0]:
            raise ValueError("Missing recorded SDK gitlink")
        header, link_name = link[0].split(b"\t", 1)
        mode, kind, sdk_revision = header.decode().split()
        if mode != "160000" or kind != "commit" or link_name != b"sdkjs":
            raise ValueError("SDK source must be a recorded gitlink")
        sdk_source = Path(upstream) / "sdkjs"
        raw_sdk = subprocess.check_output(["git", "-C", str(sdk_source), "ls-tree", "-r", "-z", sdk_revision])
        for row in raw_sdk.split(b"\0"):
            if not row:
                continue
            header, name = row.split(b"\t", 1)
            mode, kind, blob = header.decode().split()
            name = name.decode()
            if name in sdk_required:
                if mode not in {"100644", "100755"} or kind != "blob":
                    raise ValueError("SDK inputs must be regular tracked files")
                sdk_entries[name] = blob
        if not set(sdk_required).issubset(sdk_entries):
            raise ValueError("Missing recorded SDK inputs for desktop tests")
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    manifest = {"schema": schema, "documentserver_revision": ds_revision,
                "web_apps_revision": web_revision, "locale_count": locale_count,
                "locale_counts": locale_counts, "inventory_sha256": digest(inventory_path), "files": {}}
    for name, blob in sorted(entries.items()):
        target = destination / "web-apps" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(["git", "-C", str(source), "cat-file", "blob", blob]))
        manifest["files"]["web-apps/" + name] = {"git_blob": blob, "bytes": target.stat().st_size,
                                              "sha256": digest(target)}
    if sdk_revision is not None:
        manifest["sdkjs_revision"] = sdk_revision
    for name, blob in sorted(sdk_entries.items()):
        target = destination / "sdkjs" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(["git", "-C", str(sdk_source), "cat-file", "blob", blob]))
        manifest["files"]["sdkjs/" + name] = {"git_blob": blob, "bytes": target.stat().st_size,
                                             "sha256": digest(target)}
    (destination / "INPUTS.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return {**manifest, "manifest_sha256": digest(destination / "INPUTS.json")}

def verify_archive_resources(archive, assets):
    manifest = json.loads((Path(assets) / "desktop-manifest.json").read_text())
    with tarfile.open(archive) as tar:
        for name, expected in manifest["files"].items():
            path = Path(name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("Unsafe desktop resource path")
            member = tar.getmember("desktop/assets/" + name)
            if not member.isfile() or member.size != expected["bytes"]:
                raise ValueError("Archive lost or changed resource: " + name)
            h = hashlib.sha256()
            with tar.extractfile(member) as source:
                for data in iter(lambda: source.read(1024 * 1024), b""):
                    h.update(data)
            if h.hexdigest() != expected["sha256"]:
                raise ValueError("Archive resource checksum mismatch: " + name)
    return len(manifest["files"])

def clean_environment(node, cache):
    return {"PATH": str(Path(node).parent) + ":/usr/local/bin:/usr/bin:/bin",
            "HOME": str(Path.home()), "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
            "npm_config_cache": str(Path(cache) / "npm"),
            "PYTHONDONTWRITEBYTECODE": "1", "EO_RELEASE_REQUIRE_BUILDER": "1"}

def appimage_tool_cache(root):
    """Manifest-addressed raw inputs live outside disposable release/task caches."""
    root = Path(root).absolute()
    protected = Path("/srv/elixiroffice/cache/release-tools")
    if (".." in root.parts or not root.is_relative_to(protected)
            or any(p.is_symlink() for p in (root, *root.parents))):
        raise ValueError("Persistent AppImage tool cache must be a regular path under "
                         "/srv/elixiroffice/cache/release-tools (protected from task cleanup)")
    return root / digest(HERE / "appimage-tools.json")


def host_preflight(plan, env):
    """Read-only host checks; never install packages, pull images or allocate a build."""
    failures, result = [], {"python_pip": {}, "docker_images": {}}
    for label, command in (
        ("version", ["python3", "-m", "pip", "--version"]),
        ("python_option", ["python3", "-m", "pip", "--help"]),
    ):
        try:
            probe = subprocess.run(command, env=env, capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            failures.append("python3 -m pip is unavailable (" + label + "); select a build environment with pip and --python support")
            continue
        if probe.returncode or (label == "python_option" and "--python" not in probe.stdout):
            failures.append("python3 -m pip lacks " + label + "; select a build environment with pip and --python support")
        elif label == "version":
            result["python_pip"]["version"] = probe.stdout.strip()
        else:
            result["python_pip"]["supports_python_option"] = True
    images = {"font_tool": plan["font_tool_image"]}
    if "windows" in plan["targets"]:
        images["windows_builder"] = plan["windows_image"]
    if "linux" in plan["targets"]:
        images["appimage_builder"] = plan["appimage_update"]["image"]
    checked = {}
    for role, image in images.items():
        if not re.fullmatch(r"(?:[A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}", image) or image.startswith("-"):
            raise ValueError("Preflight requires an immutable image pin: " + role)
        if image not in checked:
            try:
                probe = subprocess.run(["docker", "image", "inspect", "--format", "{{.Id}}", image],
                                       env=env, capture_output=True, text=True, timeout=20)
            except (OSError, subprocess.TimeoutExpired):
                checked[image] = None
            else:
                actual = probe.stdout.strip()
                checked[image] = actual if probe.returncode == 0 and re.fullmatch(r"sha256:[0-9a-f]{64}", actual) else None
        actual = checked[image]
        if actual is None or (image.startswith("sha256:") and actual != image):
            failures.append("Required pinned Docker image is not available locally: " + role + " " + image + "; restore the exact reviewed image before building (no automatic pull)")
        else:
            result["docker_images"][role] = {"pin": image, "image_id": actual}
    if "linux" in plan["targets"]:
        try:
            update = plan["appimage_update"]
            if digest(HERE / "appimage-tools.json") != update["pins_sha256"]:
                raise ValueError("AppImage tool manifest changed after planning")
            files = appimage_update.verify_cached_tools(Path(update["tool_cache"]),
                                                       appimage_update.pins(HERE / "appimage-tools.json"))
            result["appimage_tools"] = {"cache": update["tool_cache"],
                                       "pins_sha256": update["pins_sha256"], "files": files}
        except (OSError, ValueError) as error:
            failures.append(str(error))
    if failures:
        raise ValueError("Release host preflight failed: " + "; ".join(failures))
    return result

class Build:
    def __init__(self, args, plan):
        self.args, self.plan = args, plan
        self.out = Path(plan["output"])
        self.job = self.out.name
        self.work = Path("/srv/elixiroffice/wt") / ("release-beta2-D-" + self.job)
        self.product, self.upstream = self.work / "product", self.work / "DocumentServer"
        self.driver = self.work / "release-driver"
        self.test_upstream = self.work / "test-upstream"
        self.info = {"build_identity": plan.get("build_identity"), "schema": 1, "state": "running", "started": datetime.datetime.now(ZoneInfo("Europe/Paris")).isoformat(), "inputs": plan, "phases": [], "gates": {}, "artifacts": {}, "published": False}
        # No inherited credentials, npm configuration or Docker daemon selectors.
        self.env = clean_environment(args.node, args.cache)

    def save(self):
        temp = self.out / "BUILD-INFO.json.tmp"
        temp.write_text(json.dumps(self.info, indent=2) + "\n")
        temp.replace(self.out / "BUILD-INFO.json")

    def run(self, name, command, env=None, cwd=None):
        record = {"name": name, "command": [str(x) for x in command], "log": "logs/" + name + ".log", "started": datetime.datetime.now(ZoneInfo("Europe/Paris")).isoformat()}
        self.info["phases"].append(record)
        self.save()
        print(name, flush=True)
        with (self.out / record["log"]).open("w") as log:
            result = subprocess.run([str(x) for x in command], env=env or self.env, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
        record["exit_code"] = result.returncode
        record["finished"] = datetime.datetime.now(ZoneInfo("Europe/Paris")).isoformat()
        self.save()
        if result.returncode:
            raise RuntimeError(name + " failed; see " + record["log"])

    def ssh(self, remote, command, **kwargs):
        return ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", *self.args.ssh_option, remote["host"], shlex.join([str(x) for x in command])]

    def checkout(self):
        self.work.mkdir(parents=True, exist_ok=False)
        self.driver.mkdir()
        for name, sha in self.plan["driver_files"].items():
            if digest(HERE / name) != sha:
                raise ValueError("Release driver changed after planning: " + name)
            shutil.copyfile(HERE / name, self.driver / name)
        self.run("product-checkout", ["git", "-C", self.args.product_repo, "worktree", "add", "--detach", self.product, self.plan["product_revision"]])
        self.run("ds-checkout", ["git", "-C", self.args.documentserver_repo, "worktree", "add", "--detach", self.upstream, self.plan["documentserver_revision"]])
        for name, sha in self.plan["submodules"].items():
            self.run("checkout-" + name.replace("/", "-"), ["git", "-C", Path(self.args.documentserver_repo) / name, "worktree", "add", "--detach", self.upstream / name, sha])
        if digest(self.product / "desktop/build-identity.cjs") != self.plan["identity_module_sha256"]:
            raise ValueError("Selected source build identity differs from driver")
        build_identity.stamp(self.product, self.plan["build_identity"])


    def test_inventory(self):
        selected = self.product / "tools/release/desktop-test-inputs.json"
        return selected if selected.is_file() else self.driver / "desktop-test-inputs.json"

    def assemble(self):
        self.run("python-environment", ["python3", "-m", "venv", "--without-pip", self.work / "python"])
        python = self.work / "python/bin/python"
        self.run("python-dependencies", ["python3", "-m", "pip", "--python", python, "install", "--cache-dir", Path(self.args.cache) / "pip", "-r", self.product / "tools/desktop/requirements.txt", "fonttools==4.58.0"])
        self.env["PATH"] = str(python.parent) + ":" + self.env["PATH"]
        env = {**self.env, "UPSTREAM": str(self.upstream), "OUTPUT": str(self.work / "production"), "FULL_RUNTIME": self.plan["full_runtime"]["path"], "PDF_RELEASE": self.plan["pdf_runtime"]["path"]}
        self.run("production", ["bash", self.product / "tools/desktop/compile.sh"], env)
        self.run("font-pack", [python, self.product / "branding/fonts/build.py", "--out", self.work / "font-pack", "--cache", Path(self.args.cache) / "font-downloads"])
        self.run("desktop-fallbacks", [python, self.product / "tools/desktop/fallback-fonts.py", "--out", self.work / "desktop-fallbacks", "--cache", Path(self.args.cache) / "font-downloads"])
        env.update(FONT_TOOL_IMAGE=self.args.font_tool_image, FONT_TOOL_ROOT=self.args.font_tool_root, CORE_FONTS=str(self.upstream / "core-fonts"), FONT_PACK=str(self.work / "font-pack"), FONT_OUTPUT=str(self.work / "fonts"), FONT_SET="standard", DESKTOP_FALLBACKS=str(self.work / "desktop-fallbacks"))
        self.run("fonts", ["bash", self.product / "tools/desktop/fonts.sh"], env)
        env.update(CORE_FONTS=str(self.work / "fonts/inputs/core"), FONT_PACK=str(self.work / "fonts/inputs/pack"), SDK_OUTPUT=str(self.work / "production/sdk"), WEBAPPS_OUTPUT=str(self.work / "production/apps"), THEME_SOURCE=str(self.upstream / "sdkjs/slide/themes/src"), THEME_OUTPUT=str(self.work / "themes"))
        self.run("themes", ["bash", self.product / "tools/desktop/themes.sh"], env)
        env.update(THEMES=str(self.work / "themes"), FONT_FILES=str(self.work / "fonts/fonts"), ALL_FONTS=str(self.work / "fonts/AllFonts.js"), FONT_IMAGES=str(self.work / "fonts/Images"), PDF_RUNTIME=str(self.upstream / "sdkjs/common/clientpdf/runtime"), TEMPLATES=str(self.upstream / "document-templates/new/en-US"))
        self.run("resources", [python, self.product / "tools/desktop/resources.py", "--font-set", "standard", "--themes", env["THEMES"], "--sdk", env["SDK_OUTPUT"], "--apps", env["WEBAPPS_OUTPUT"], "--fonts", env["FONT_FILES"], "--allfonts", env["ALL_FONTS"], "--pdf-runtime", env["PDF_RUNTIME"], "--templates", env["TEMPLATES"], "--upstream", self.upstream, "--font-images", env["FONT_IMAGES"], "--font-source", env["CORE_FONTS"], "--font-source", env["FONT_PACK"], "--font-source", env["DESKTOP_FALLBACKS"], "--out", self.product / "desktop/assets"], env)
        self.run("resource-audit", [python, self.product / "tests/desktop/verify-resources.py", self.product / "desktop/assets"])
        self.run("sample-audit", [python, self.product / "tests/desktop/check-samples.py", self.product / "desktop/assets"])
        self.env.update(ELECTRON_CACHE=str(Path(self.args.cache) / "electron"), ELECTRON_BUILDER_CACHE=str(Path(self.args.cache) / "builder"), CSC_IDENTITY_AUTO_DISCOVERY="false")
        self.run("desktop-install", ["npm", "ci"], cwd=self.product / "desktop")
        self.info["test_upstream"] = export_test_upstream(
            self.upstream, self.plan["submodules"]["web-apps"],
            self.plan["documentserver_revision"], self.test_upstream, self.test_inventory())
        unit_home = self.work / "unit-home"
        unit_home.mkdir()
        self.save()
        self.run("desktop-units", ["npm", "test"],
                 env={**self.env, "HOME": str(unit_home), "EO_UPSTREAM": str(self.test_upstream)},
                 cwd=self.product / "desktop")
        self.info["tools"] = {"node": capture([self.args.node, "--version"]), "python": capture([python, "--version"]), "fonttools": capture([python, "-c", "import fontTools;print(fontTools.__version__)"]), "pillow": capture([python, "-c", "import PIL;print(PIL.__version__)"])}
        self.info["desktop_manifest_sha256"] = digest(self.product / "desktop/assets/desktop-manifest.json")
        self.save()

    def fixtures(self):
        destination = self.work / "fixtures"
        destination.mkdir()
        for kind in ("docx", "xlsx", "pptx"):
            shutil.copyfile(self.upstream / ("document-templates/sample/sample." + kind), destination / ("sample." + kind))

    def archive(self, include_assets=True):
        if json.loads((self.product / "desktop/build-info.json").read_text()) != self.plan["build_identity"]:
            raise ValueError("Archive build identity differs from planned identity")
        file = self.work / ("mac-input.tar" if include_assets else "test-input.tar")
        with tarfile.open(file, "w") as tar:
            folders = ("desktop", "tools/desktop", "tests/desktop",
                       "branding/example/nodejs/public/elixir/brand/templates",
                       "branding/desktop-templates",
                       "tools/example/template-layouts")
            for folder in folders:
                source = self.product / folder
                def filtered(item):
                    excluded = tuple(root + "/" + name for root in folders
                                     for name in ("node_modules", ".git", "__pycache__")) + ("desktop/dist",)
                    if any(item.name == path or item.name.startswith(path + "/") for path in excluded):
                        return None
                    if not include_assets and (item.name == "desktop/assets" or item.name.startswith("desktop/assets/")):
                        return None
                    return item
                tar.add(source, arcname=folder, filter=filtered)
            tar.add(self.work / "fixtures", arcname="fixtures")
            # mac.sh cleans EO_UPSTREAM but uses this exact isolated HOME.
            tar.add(self.test_upstream, arcname="cache/home/elixiroffice/DocumentServer")
            tar.add(self.driver / "packaged-smoke.cjs", arcname="tools/release/packaged-smoke.cjs")
            tar.add(self.driver / "remote-build.sh", arcname="tools/release/remote-build.sh")
            tar.add(self.test_inventory(), arcname="tools/release/desktop-test-inputs.json")
            playwright = Path(self.args.playwright_core)
            tar.add(playwright, arcname="test-tools/playwright-core")
            if not include_assets:
                tar.add(self.args.node, arcname="test-tools/node")
                licence = Path(self.args.node).resolve().parents[1] / "LICENSE"
                tar.add(licence, arcname="test-tools/LICENSE.node")
        if include_assets:
            verify_archive_resources(file, self.product / "desktop/assets")
        return file

    def transport(self, remote, files, operation):
        target = str(Path(remote["root"]) / self.job)
        code = """import pathlib,sys,os
root=pathlib.Path(sys.argv[1]); job=pathlib.Path(sys.argv[2])
assert job.parent==root
for p in (root,*root.parents):
    assert not p.is_symlink(), "Remote path contains a symlink"
parent=root
while not parent.exists():
    parent=parent.parent
assert parent.stat().st_uid==os.getuid(), "Remote parent is not owned by this user"
marker=root/".release-beta2-D-owned"
if root.exists():
    assert root.stat().st_uid==os.getuid()
    assert marker.is_file() and not marker.is_symlink(), "Existing root is not a release-owned folder"
else:
    root.mkdir(parents=True)
    marker.write_text("ElixirOffice beta2 release workspace\n")
assert not job.exists() and not job.is_symlink()
job.mkdir()
"""
        self.run(operation + "-mkdir", self.ssh(remote, ["python3", "-c", code, remote["root"], target]))
        for index, file in enumerate(files):
            with Path(file).open("rb") as source, (self.out / ("logs/" + operation + "-transfer-" + str(index) + ".log")).open("w") as log:
                result = subprocess.run(self.ssh(remote, ["python3", "-c", "import sys,pathlib,shutil;p=pathlib.Path(sys.argv[1]);assert not p.exists();f=p.open('xb');shutil.copyfileobj(sys.stdin.buffer,f);f.close()", str(Path(target) / Path(file).name)]), stdin=source, stdout=log, stderr=log)
            if result.returncode:
                raise RuntimeError(operation + " transfer failed")
            self.run(operation + "-verify-" + str(index), self.ssh(remote, ["python3", "-c", "import hashlib,sys;h=hashlib.sha256();f=open(sys.argv[1],'rb');[h.update(b) for b in iter(lambda:f.read(1048576),b'')];assert h.hexdigest()==sys.argv[2]", str(Path(target) / Path(file).name), digest(file)]))
        return target

    def packages(self):
        version = validate_desktop_version(json.loads((self.product / "desktop/package.json").read_text()))
        self.info["product_version"] = version
        if "linux" in self.args.targets:
            self.run("linux-packages", ["npm", "run", "package"], cwd=self.product / "desktop")
            appimage, control = appimage_names(version)
            unpacked = self.product / "desktop/dist/linux-unpacked"
            if (unpacked / "resources/app-update.yml").exists():
                raise ValueError("Unexpected application updater feed in resources")
            self.run("linux-packaged-version", [self.args.node, self.product / "tools/desktop/check-version.cjs", unpacked / "resources/app.asar"])
            update_work = self.work / "appimage-update"
            self.run("appimage-external-update", ["python3", self.driver / "appimage_update.py",
                     "--pins", self.driver / "appimage-tools.json", "--cache", self.work / "appimage-tools",
                     "--tool-cache", self.plan["appimage_update"]["tool_cache"],
                     "--work", update_work, "--appimage", self.product / "desktop/dist" / appimage,
                     "--channel", self.plan["appimage_update"]["channel"],
                     "--image", self.plan["appimage_update"]["image"]])
            for name in (appimage, control):
                shutil.copy2(update_work / name, self.out / name)
            appimage_update.verify_zsync(self.out / appimage, self.out / control)
            self.info["appimage_update"] = json.loads((update_work / "receipt.json").read_text())
            self.info["appimage_tools"] = json.loads((self.work / "appimage-tools/receipt.json").read_text())
            shutil.copyfile(self.product / "desktop/dist" / f"ElixirOffice-{version}-linux-amd64.deb", self.out / f"ElixirOffice-{version}-linux-amd64.deb")
            self.save()
            self.run("deb-extract", ["dpkg-deb", "-x", self.out / f"ElixirOffice-{version}-linux-amd64.deb", self.work / "deb"])
            deb_version = capture(["dpkg-deb", "-f", self.out / f"ElixirOffice-{version}-linux-amd64.deb", "Version"])
            if deb_version != self.plan["build_identity"]["deb_version"]:
                raise ValueError("DEB version differs from selected desktop version")
            self.run("deb-packaged-version", [self.args.node, self.product / "tools/desktop/check-version.cjs", self.work / "deb/opt/ElixirOffice/resources/app.asar"])
            self.run("deb-resource-audit", ["python3", self.product / "tests/desktop/verify-resources.py", self.work / "deb/opt/ElixirOffice/resources/assets"])
        if "windows" in self.args.targets:
            env = {**self.env, "WINDOWS_BUILDER_IMAGE": self.args.windows_image, "WINDOWS_BUILD_CACHE": str(Path(self.args.cache) / self.job / "windows")}
            # windows.sh uses /work/home inside its read/write cache mount.
            shutil.copytree(self.test_upstream, Path(env["WINDOWS_BUILD_CACHE"]) / "home/elixiroffice/DocumentServer")
            self.run("windows-package", ["bash", self.product / "tools/desktop/windows.sh"], env)
            self.run("windows-audit", [self.args.node, self.product / "tools/desktop/check-windows.cjs", self.product / "desktop/dist", self.work / "windows-audit"])
            shutil.copyfile(self.product / "desktop/dist" / f"ElixirOffice-{version}-win-x64.exe", self.out / f"ElixirOffice-{version}-win-x64.exe")
        if "mac" in self.args.targets and self.args.mac_export_only:
            archive = self.archive()
            shutil.copyfile(archive, self.out / "MAC-INPUT.tar")
            self.info["gates"]["mac-six-format"] = "unverified-manual-export"
            self.info["mac_input"] = {"file": "MAC-INPUT.tar", "sha256": digest(archive),
                                     "build_identity": self.plan["build_identity"],
                                     "test_upstream_manifest_sha256": self.info["test_upstream"]["manifest_sha256"],
                                     "instructions": "Extract in an owned folder; run /bin/bash tools/release/remote-build.sh mac ROOT yes TEST_UPSTREAM_MANIFEST_SHA256"}
            self.save()
        elif "mac" in self.args.targets:
            archive = self.archive()
            target = self.transport(self.plan["mac"], [archive], "mac")
            self.run("mac-build-and-smoke", self.ssh(self.plan["mac"], ["/bin/bash", "-c", 'cd "$1"; tar -xf mac-input.tar; /bin/bash tools/release/remote-build.sh mac "$1" "$2" "$3"', "release", target, "no" if self.args.build_only else "yes", self.info["test_upstream"]["manifest_sha256"]]))
            name = f"ElixirOffice-{version}-mac-arm64.dmg"
            with (self.out / name).open("xb") as output:
                result = subprocess.run(self.ssh(self.plan["mac"], ["cat", str(Path(target) / "desktop/dist" / name)]), stdout=output)
            if result.returncode:
                raise RuntimeError("Mac artifact retrieval failed")
            remote_sha = capture(self.ssh(self.plan["mac"], ["shasum", "-a", "256", str(Path(target) / "desktop/dist" / name)])).split()[0]
            if digest(self.out / name) != remote_sha:
                raise ValueError("Mac artifact transport checksum mismatch")
            self.retrieve_results(self.plan["mac"], target, "mac", not self.args.build_only)
            self.info["gates"]["mac-six-format"] = "unverified" if self.args.build_only else "pass"

    def retrieve_results(self, remote, target, label, smoke_required=True):
        archive = self.out / (label + "-evidence.tar")
        with archive.open("xb") as output:
            result = subprocess.run(self.ssh(remote, ["tar", "-C", target, "-cf", "-", "results"]), stdout=output)
        if result.returncode:
            raise RuntimeError("Evidence transport failed")
        # Read specific bounded report members; never extract remote paths.
        with tarfile.open(archive) as evidence:
            if smoke_required:
                member = evidence.getmember("results/six-format-smoke.json")
                if member.size > 1024 * 1024 or not member.isfile():
                    raise ValueError("Invalid packaged report")
                report = json.load(evidence.extractfile(member))
                required = {"docx", "xlsx", "pptx", "odt", "ods", "odp"}
                rows = report["rows"]
                if len(rows) != 6 or {row["format"] for row in rows} != required or any(row["status"] != "pass" or row.get("pdfBackend") != "wasm" for row in rows):
                    raise ValueError("Six-format packaged report is missing or failed")
                self.info["gates"][label + "-report"] = report
        self.info["gates"][label + "-evidence"] = {"file": archive.name, "sha256": digest(archive)}

    def linux_smoke(self):
        archive = self.archive(False)
        app = next(self.out.glob("*.AppImage"))
        target = self.transport(self.plan["linux"], [archive, app], "linux")
        self.run("linux-packaged-smoke", self.ssh(self.plan["linux"], ["/bin/bash", "-c", 'cd "$1"; tar -xf test-input.tar; /bin/bash tools/release/remote-build.sh linux "$1" yes "$2"', "release", target, self.info["test_upstream"]["manifest_sha256"]]))
        self.retrieve_results(self.plan["linux"], target, "linux")
        self.info["gates"]["linux-six-format"] = "pass"

    def execute(self):
        # Recheck host state before creating outputs or consuming a build number.
        self.info["host_preflight"] = host_preflight(self.plan, self.env)
        self.out.parent.mkdir(parents=True, exist_ok=True)
        self.out.mkdir(exist_ok=False)
        (self.out / "logs").mkdir()
        self.save()
        try:
            self.info["build_allocation"] = build_identity.reserve(self.args.build_ledger, self.args.published_versions, self.plan["build_identity"])
            self.info["publication_inventory"] = build_identity.published(self.args.published_versions, self.plan["build_identity"]["version"])
            self.save()
            for key, system, machine in (("mac", "Darwin", "arm64"), ("linux", "Linux", "x86_64")):
                if key in self.plan:
                    remote = self.plan[key]
                    code = "import platform,sys;assert platform.system()==sys.argv[1];assert platform.machine()==sys.argv[2]"
                    interpreter = ["/usr/bin/arch", "-arm64", "/usr/bin/python3"] if key == "mac" else ["python3"]
                    self.run(key + "-preflight", self.ssh(remote, [*interpreter, "-c", code, system, machine]))
            self.checkout()
            self.assemble()
            self.fixtures()
            self.packages()
            if "linux" in self.args.targets and not self.args.build_only:
                self.linux_smoke()
            notes = render_release_notes((self.driver / "desktop-release-notes.md").read_text(), self.plan["build_identity"])
            (self.out / "RELEASE-NOTES.md").write_text(notes)

            names = public_artifact_names(self.out)
            self.info["artifacts"] = checksum_inventory(self.out, names)
            complete = set(self.args.targets) == {"linux", "windows", "mac"} and not self.args.build_only and all(self.info["gates"].get(x) == "pass" for x in ("linux-six-format", "mac-six-format"))
            self.info["state"] = "review-candidate" if complete else "partial-unverified"
            self.save()
            print(self.out)
            return 0 if complete else 2
        except BaseException as error:
            self.info["state"] = "failed"
            self.info["error"] = str(error)
            self.save()
            raise

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--product-rev", required=True)
    p.add_argument("--build-number", required=True, type=int, help="Unique monotonically increasing allocation, 1..65535")
    p.add_argument("--channel", required=True, choices=["rc", "final"])
    p.add_argument("--published-versions", required=True, type=Path, help="Complete release inventory fetched within one hour")
    p.add_argument("--build-ledger", required=True, type=Path, help="Lead-controlled allocation ledger; actual builds reserve a number under lock")

    p.add_argument("--documentserver-rev", required=True)
    p.add_argument("--product-repo", type=Path, default=Path.home() / "elixiroffice/elixiroffice")
    p.add_argument("--documentserver-repo", type=Path, default=Path.home() / "elixiroffice/DocumentServer")
    p.add_argument("--wasm-artifacts", type=Path, default=Path.home() / "elixiroffice/wasm-artifacts")
    p.add_argument("--full-runtime", type=Path, help="Optional location override; must match the selected SDK pin")
    p.add_argument("--full-manifest-sha256", help="Optional assertion of the source pin; cannot override it")
    p.add_argument("--pdf-release", type=Path)
    p.add_argument("--date", default=datetime.datetime.now(ZoneInfo("Europe/Paris")).date().isoformat())
    p.add_argument("--label", default="")
    p.add_argument("--node", default=os.environ.get("EO_RELEASE_NODE", "node"))
    p.add_argument("--cache", default="/srv/elixiroffice/cache/release-beta2-D")
    p.add_argument("--appimage-tool-cache", type=Path, default=Path("/srv/elixiroffice/cache/release-tools/appimage"),
                   help="Protected persistent raw tool root, independent of --cache; files are addressed by manifest SHA-256")
    p.add_argument("--appimage-builder-image", help="Optional assertion of the reviewed isolated builder image pin")
    p.add_argument("--appimage-channel", choices=["latest", "latest-all", "latest-pre"], default="latest-all")
    p.add_argument("--font-tool-image", default=DEFAULT_FONT_IMAGE)
    p.add_argument("--font-tool-root", default="/var/www/elixiroffice/documentserver")
    p.add_argument("--windows-image", default=DEFAULT_WIN_IMAGE)
    p.add_argument("--linux-host", default=os.environ.get("EO_RELEASE_LINUX_HOST"))
    p.add_argument("--linux-root", default=os.environ.get("EO_RELEASE_LINUX_ROOT"))
    p.add_argument("--mac-export-only", action="store_true", help="Stage MAC-INPUT.tar for authorized local Mac builds; no SSH and never a complete candidate")
    p.add_argument("--mac-host")
    p.add_argument("--mac-root", default=os.environ.get("EO_RELEASE_MAC_ROOT"))
    p.add_argument("--playwright-core", type=Path, default=os.environ.get("EO_RELEASE_PLAYWRIGHT_CORE"), help="Required installed playwright-core directory, or EO_RELEASE_PLAYWRIGHT_CORE")
    p.add_argument("--ssh-option", action="append", default=[])
    p.add_argument("--targets", default="linux,windows,mac")
    p.add_argument("--build-only", action="store_true", help="Explicit partial preview; never returns a complete candidate")
    p.add_argument("--plan", action="store_true", help="Validate immutable source/runtime inputs without building")
    return p

def make_plan(args):
    args.targets = args.targets.split(",")
    if not args.targets or len(set(args.targets)) != len(args.targets) or set(args.targets) - {"linux", "windows", "mac"}:
        raise ValueError("Select linux,windows,mac once each")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.font_tool_image) or not re.fullmatch(r"electronuserland/builder@sha256:[0-9a-f]{64}", args.windows_image):
        raise ValueError("Builder images must use immutable digests")
    if not args.playwright_core or not (Path(args.playwright_core) / "package.json").is_file():
        raise ValueError("Provide --playwright-core or EO_RELEASE_PLAYWRIGHT_CORE with an installed package")
    product = revision(args.product_repo, args.product_rev, "main")
    package = pin(args.product_repo, product, "desktop/package.json")
    validate_desktop_version(package)
    # Syntax only here; after resolving the RC/final identity below,
    # build_identity.published applies the fresh published-version guard.
    if "linux" in args.targets:
        validate_update_packaging(package)
    ds = revision(args.documentserver_repo, args.documentserver_rev, "elixir/dev")
    modules = gitlinks(args.documentserver_repo, ds)
    identity_module = HERE.parents[1] / "desktop/build-identity.cjs"
    identity_source = git(args.product_repo, "show", product + ":desktop/build-identity.cjs")
    if identity_source.strip() != identity_module.read_text().strip():
        raise ValueError("Selected build identity module differs from driver")
    identity = json.loads(capture([args.node, identity_module, "create",
                                  json.dumps([package["version"], args.channel, args.build_number, product, ds])]))
    publication = build_identity.published(args.published_versions, identity["version"])
    build_identity.allocation(args.build_ledger, identity)

    full_pin = pin(args.documentserver_repo / "sdkjs", modules["sdkjs"], "common/wasm-convert/runtime-release.json")
    pdf_pin, pdf_pin_path = pdf_source_pin(args.product_repo, product)
    for recorded in (full_pin, pdf_pin):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", recorded["artifact_version"]) or not re.fullmatch(r"[0-9a-f]{64}", recorded["manifest_sha256"]):
            raise ValueError("Invalid recorded runtime pin")
    if args.full_manifest_sha256 and args.full_manifest_sha256 != full_pin["manifest_sha256"]:
        raise ValueError("Full manifest assertion differs from the selected SDK pin")
    full = verify_runtime(args.full_runtime or args.wasm_artifacts / full_pin["artifact_version"], full_pin, "full")
    pdf = verify_runtime(args.pdf_release or args.wasm_artifacts / pdf_pin["artifact_version"], pdf_pin, "pdf")
    if full["artifact_version"] == pdf["artifact_version"]:
        raise ValueError("Full converter and PDF-only release must be distinct")
    output = output_path(args.date, args.label)
    if output.exists() or output.is_symlink() or output.parent.is_symlink():
        raise ValueError("Output already exists; never overwrite a prior candidate")
    cache = Path(args.cache).resolve()
    if not cache.is_relative_to("/srv/elixiroffice/cache"):
        raise ValueError("Large caches must stay under /srv/elixiroffice/cache")
    plan = {"product_revision": product, "documentserver_revision": ds, "submodules": modules, "sdk_source_full_pin": full_pin, "full_runtime": full, "pdf_runtime": pdf, "output": str(output), "targets": args.targets, "build_only": args.build_only, "driver_files": {name: digest(HERE / name) for name in ("desktop-beta.sh", "desktop_beta.py", "build_identity.py", "packaged-smoke.cjs", "remote-build.sh", "desktop-beta3-release-notes.md", "desktop-release-notes.md", "desktop-test-inputs.json", "appimage_update.py", "appimage-tools.json")}, "font_tool_image": args.font_tool_image, "windows_image": args.windows_image}
    plan["build_identity"] = identity
    plan["identity_module_sha256"] = digest(identity_module)
    plan["publication_inventory"] = publication
    plan["build_ledger_planning_snapshot_sha256"] = digest(args.build_ledger)
    update_pins = appimage_update.pins(HERE / "appimage-tools.json")
    image = args.appimage_builder_image or update_pins["builder_image"]
    if not re.fullmatch(r"(?:[A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}", image) or image.startswith("-"):
        raise ValueError("AppImage builder must be pinned")
    if image != update_pins["builder_image"]:
        raise ValueError("AppImage builder differs from reviewed manifest; re-pin with provenance review")
    plan["appimage_update"] = {"channel": args.appimage_channel, "image": image,
                              "information": appimage_update.update_information(args.appimage_channel),
                              "pins_sha256": digest(HERE / "appimage-tools.json")}
    if "linux" in args.targets:
        plan["appimage_update"]["tool_cache"] = str(appimage_tool_cache(args.appimage_tool_cache))
    plan["pdf_source_pin_path"] = pdf_pin_path
    plan["mac_export_only"] = args.mac_export_only
    if "mac" in args.targets and not args.mac_export_only:
        plan["mac"] = endpoint(args.mac_host, args.mac_root or "")
    if "linux" in args.targets and not args.build_only:
        plan["linux"] = endpoint(args.linux_host, args.linux_root)
    plan["host_preflight"] = host_preflight(plan, clean_environment(args.node, args.cache))
    return plan

if __name__ == "__main__":
    try:
        args = parser().parse_args()
        plan = make_plan(args)
        if args.plan:
            print(json.dumps(plan, indent=2))
            sys.exit(0)
        args.node = str(Path(shutil.which(args.node) or args.node).resolve(strict=True))
        if capture([args.node, "--version"]) != "v22.23.3":
            raise ValueError("Select pinned Node22.23.3")
        sys.exit(Build(args, plan).execute())
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
