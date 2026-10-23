#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Repack an AppImage for external, user-initiated updates in a pinned builder."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
UPDATE_PREFIX = "gh-releases-zsync|leag1234|elixiroffice|"


def digest(path, algorithm="sha256"):
    h = hashlib.new(algorithm)
    with Path(path).open("rb") as f:
        for b in iter(lambda: f.read(1048576), b""):
            h.update(b)
    return h.hexdigest()


def update_information(channel):
    if channel not in {"latest", "latest-all", "latest-pre"}:
        raise ValueError("Unsupported update channel")
    return UPDATE_PREFIX + channel + "|ElixirOffice-*x86_64.AppImage.zsync"


def verify_zsync(image, control):
    data = Path(control).read_bytes()
    header, table = data.split(b"\n\n", 1)
    fields = dict(line.split(": ", 1) for line in header.decode("ascii").splitlines())
    if fields["Filename"] != Path(image).name or fields["URL"] != Path(image).name:
        raise ValueError("zsync refers to a different filename or URL")
    if int(fields["Length"]) != Path(image).stat().st_size or fields["SHA-1"] != digest(image, "sha1"):
        raise ValueError("zsync does not match final AppImage bytes")
    block = int(fields["Blocksize"])
    lengths = [int(x) for x in fields["Hash-Lengths"].split(",")]
    if block <= 0 or len(lengths) != 3 or not all(0 < x <= 32 for x in lengths):
        raise ValueError("Invalid zsync block parameters")
    count = (Path(image).stat().st_size + block - 1) // block
    if len(table) != count * sum(lengths[1:]):
        raise ValueError("Truncated or excess zsync rolling-block table")
    return fields


def pins(path):
    x = json.loads(Path(path).read_text())
    expected = {"appimagetool.AppImage", "runtime.elf", "zsync.deb", "appimagetool.LICENSE", "runtime.LICENSE", "file.deb", "libmagic1.deb", "libmagic-mgc.deb"}
    if x["architecture"] != "x86_64" or set(x["files"]) != expected:
        raise ValueError("Unexpected tool inventory")
    for item in x["files"].values():
        url = urllib.parse.urlsplit(item["url"])
        if url.scheme != "https" or url.hostname not in {"github.com", "raw.githubusercontent.com", "deb.debian.org"} or url.username or url.password:
            raise ValueError("Unexpected tool source")
        if not re.fullmatch("[0-9a-f]{64}", item["sha256"]) or not 0 < item["bytes"] <= 67108864:
            raise ValueError("Invalid tool content pin")
    update_information(x["channel"])
    return x


def tool_environment(cache, home):
    return dict(os.environ, ARCH="x86_64", HOME=str(home),
                PATH=str(cache / "file-tools/usr/bin") + ":" + str(cache / "zsync/usr/bin") + ":" + os.environ["PATH"],
                LD_LIBRARY_PATH=str(cache / "file-tools/usr/lib/x86_64-linux-gnu"),
                MAGIC=str(cache / "file-tools/usr/lib/file/magic.mgc"))


def verify_cached_tools(cache, manifest):
    """Read every raw pin without creating, chmodding, downloading or extracting."""
    cache = Path(cache).absolute()
    if ".." in cache.parts or any(p.is_symlink() for p in (cache, *cache.parents)):
        raise ValueError("Symlink or traversal in AppImage tool cache")
    failures = []
    for name, item in manifest["files"].items():
        file = cache / name
        try:
            metadata = file.lstat()
            valid = (stat.S_ISREG(metadata.st_mode) and metadata.st_size == item["bytes"]
                     and digest(file) == item["sha256"])
        except OSError:
            valid = False
        if not valid:
            failures.append(name)
    if failures:
        raise ValueError("AppImage tool cache " + str(cache) + " is missing or differs from pins: "
                         + ", ".join(failures) + "; restore the exact reviewed raw files "
                         "with their pinned size and SHA-256 before allocating a build (no automatic download)")
    return {name: dict(item) for name, item in manifest["files"].items()}


def stage_cached_tools(source, destination, manifest):
    """Copy raw pins into disposable build storage; never trust derived receipts."""
    source, destination = Path(source).absolute(), Path(destination).absolute()
    verify_cached_tools(source, manifest)
    if (".." in destination.parts
            or any(p.is_symlink() for p in (destination, *destination.parents))
            or source.is_relative_to(destination) or destination.is_relative_to(source)):
        raise ValueError("Persistent raw tools and derived build cache must be disjoint regular paths")
    destination.mkdir(parents=True, exist_ok=True)
    for name, item in manifest["files"].items():
        file = destination / name
        if file.exists() or file.is_symlink():
            metadata = file.lstat()
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_size != item["bytes"]
                    or digest(file) != item["sha256"]):
                raise ValueError("Existing staged tool differs from pin: " + name)
            continue
        with tempfile.NamedTemporaryFile(dir=destination, delete=False) as output:
            temp = Path(output.name)
            try:
                with (source / name).open("rb") as input_file:
                    shutil.copyfileobj(input_file, output, 1024 * 1024)
                output.flush()
                os.fsync(output.fileno())
                if temp.stat().st_size != item["bytes"] or digest(temp) != item["sha256"]:
                    raise ValueError("Staged tool differs from pin: " + name)
                # Exclusive publication: another writer cannot replace an input.
                os.link(temp, file)
            finally:
                temp.unlink(missing_ok=True)
    verify_cached_tools(destination, manifest)


def prepare(cache, manifest, allow_download=True):
    if not allow_download:
        verify_cached_tools(cache, manifest)
    cache.mkdir(parents=True, exist_ok=True)
    for name, item in manifest["files"].items():
        file = cache / name
        if file.is_symlink():
            raise ValueError("Tool cache contains a symlink")
        if not file.exists():
            if not allow_download:
                raise ValueError("Cached-only AppImage tool is missing: " + name
                                 + "; restore its exact pinned bytes (downloads disabled)")
            with tempfile.NamedTemporaryFile(dir=cache, delete=False) as out:
                temp = Path(out.name)
                try:
                    with urllib.request.urlopen(item["url"], timeout=120) as response:
                        size = 0
                        while True:
                            b = response.read(1048576)
                            if not b:
                                break
                            size += len(b)
                            if size > item["bytes"]:
                                raise ValueError("Tool download exceeds pin")
                            out.write(b)
                    out.flush()
                    if size != item["bytes"] or digest(temp) != item["sha256"]:
                        raise ValueError("Tool download differs from pin")
                    temp.replace(file)
                finally:
                    temp.unlink(missing_ok=True)
        if file.stat().st_size != item["bytes"] or digest(file) != item["sha256"]:
            raise ValueError("Cached tool differs from pin: " + name)
    (cache / "appimagetool.AppImage").chmod(0o755)
    (cache / "runtime.elf").chmod(0o755)
    zsync = cache / "zsync"
    if zsync.is_symlink():
        raise ValueError("Symlink in derived tool cache")
    if zsync.exists():
        shutil.rmtree(zsync)
    subprocess.run(["dpkg-deb", "-x", cache / "zsync.deb", zsync], check=True)
    copyright = zsync / "usr/share/doc/zsync/copyright"
    if digest(copyright) != manifest["zsync_copyright_sha256"]:
        raise ValueError("zsync copyright differs from pin")
    file_tools = cache / "file-tools"
    if file_tools.is_symlink():
        raise ValueError("Symlink in derived file tool cache")
    if file_tools.exists():
        shutil.rmtree(file_tools)
    for name in ("file", "libmagic1", "libmagic-mgc"):
        subprocess.run(["dpkg-deb", "-x", cache / (name + ".deb"), file_tools], check=True)
        if digest(file_tools / "usr/share/doc" / name / "copyright") != manifest["file_copyright_sha256"][name]:
            raise ValueError("file/libmagic copyright differs from pin")
    env = tool_environment(cache, cache / "home")
    subprocess.run([file_tools / "usr/bin/file", "--version"], env=env, check=True)
    file_probe = subprocess.check_output([file_tools / "usr/bin/file", cache / "runtime.elf"], env=env, text=True)
    if "ELF 64-bit" not in file_probe or "x86-64" not in file_probe:
        raise ValueError("Pinned file tool did not recognize the pinned x86_64 ELF runtime")
    tool = cache / "tool"
    if tool.is_symlink():
        raise ValueError("Symlink in derived tool cache")
    if tool.exists():
        shutil.rmtree(tool)
    tool.mkdir()
    subprocess.run([cache / "appimagetool.AppImage", "--appimage-extract"], cwd=tool, check=True)
    # Re-extract verified inputs on a new cache; no apt/dpkg install database is used.
    subprocess.run([tool / "squashfs-root/AppRun", "--version"], check=True)
    return {"inputs": manifest, "copyright_sha256": digest(copyright), "file_probe": file_probe.strip(), "file_copyright_sha256": manifest["file_copyright_sha256"]}



SANDBOX_WARNING = "ElixirOffice: unprivileged user namespaces are unavailable, starting without the Chromium sandbox; use the .deb or the Flatpak for the sandboxed variant"
FORBIDDEN_FLAGS = ("--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu-sandbox", "--disable-seccomp-filter-sandbox")
MIME_TYPES = ['application/msword', 'application/pdf', 'application/rtf', 'application/vnd.ms-excel', 'application/vnd.ms-excel.sheet.macroEnabled.12', 'application/vnd.ms-powerpoint', 'application/vnd.ms-word.document.macroEnabled.12', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', 'application/vnd.openxmlformats-officedocument.presentationml.template', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.template', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template', 'text/csv', 'text/plain']

def prepare_launcher(appdir):
    appdir = Path(appdir)
    desktop = appdir / "org.elixiroffice.desktop.desktop"
    launcher = appdir / "AppRun"
    if desktop.is_symlink() or launcher.is_symlink():
        raise ValueError("Launcher metadata must be regular files")
    text = desktop.read_text()
    if len(re.findall(r"^Exec=.*$", text, re.M)) != 1 or len(re.findall(r"^MimeType=.*$", text, re.M)) != 1:
        raise ValueError("Unexpected generated desktop fields")
    old_exec = re.search(r"^Exec=(.*)$", text, re.M).group(1)
    old_mime = set(filter(None, re.search(r"^MimeType=(.*)$", text, re.M).group(1).split(";")))
    if old_exec not in ("AppRun --no-sandbox %U", "AppRun %U") or old_mime not in (set(MIME_TYPES), set(MIME_TYPES) - {"application/pdf"}):
        raise ValueError("Unrecognized upstream desktop launcher")
    text = re.sub(r"^Exec=.*$", "Exec=AppRun %U", text, flags=re.M)
    text = re.sub(r"^MimeType=.*$", "MimeType=" + ";".join(MIME_TYPES) + ";", text, flags=re.M)
    if any(flag in text for flag in FORBIDDEN_FLAGS):
        raise ValueError("Forbidden flag in desktop file")
    original = launcher.read_text()
    start = original.index("HAVE_NO_SANDBOX=0\n")
    end = original.index("\natexit()\n", start)
    expected = 'if [ $HAVE_NO_SANDBOX -eq 0 ] && ! unshare -Ur true 2>/dev/null ; then\n  NO_SANDBOX=(--no-sandbox)\nfi\n'
    if expected not in original[start:end] or original.count("NO_SANDBOX=(--no-sandbox)") != 1:
        raise ValueError("Unrecognized upstream sandbox fallback")
    replacement = ('for arg in "${args[@]}" ; do\n'
                   '  case "$arg" in\n'
                   '    --no-sandbox|--no-sandbox=*|--disable-setuid-sandbox|--disable-setuid-sandbox=*|--disable-gpu-sandbox|--disable-gpu-sandbox=*|--disable-seccomp-filter-sandbox|--disable-seccomp-filter-sandbox=*)\n'
                   '      echo "ElixirOffice: explicit sandbox bypass flags are not supported" >&2; trap - EXIT; exit 64 ;;\n'
                   '  esac\n'
                   'done\n'
                   'NO_SANDBOX=()\n'
                   'if ! unshare -Ur true 2>/dev/null ; then\n'
                   '  NO_SANDBOX=(--no-sandbox)\n'
                   '  printf "%s\\n" "' + SANDBOX_WARNING + '" >&2\n'
                   'fi\n')
    updated = original[:start] + replacement + original[end:]
    desktop.write_text(text)
    launcher.write_text(updated)
    return {"desktop_exec": "AppRun %U", "mime_types": MIME_TYPES,
            "userns_fallback": "conditional-with-stderr-warning",
            "desktop_sha256": digest(desktop), "apprun_sha256": digest(launcher)}


def build(work, cache, manifest, name, channel):
    image = work / "input.AppImage"
    image.chmod(0o755)
    subprocess.run([image, "--appimage-extract"], cwd=work, check=True)
    appdir = work / "squashfs-root"
    launcher_receipt = prepare_launcher(appdir)
    licence = appdir / "usr/share/licenses/elixiroffice-appimage-runtime"
    licence.mkdir(parents=True)
    shutil.copyfile(cache / "runtime.LICENSE", licence / "LICENSE")
    info = update_information(channel)
    env = tool_environment(cache, work / "home")
    subprocess.run([cache / "tool/squashfs-root/AppRun", "--runtime-file", cache / "runtime.elf", "-u", info, appdir, name], cwd=work, env=env, check=True)
    final = work / name
    control = work / (name + ".zsync")
    actual = subprocess.check_output([final, "--appimage-updateinformation"], text=True).strip()
    if actual != info:
        raise ValueError("Embedded update information differs")
    headers = verify_zsync(final, control)
    verify_rolling_blocks(final, control, work, cache / "zsync/usr/bin/zsync")
    return {"launcher": launcher_receipt, "update_information": info, "zsync_headers": headers,
            "rolling_blocks_verified_offline": True,
            "files": {p.name: {"bytes": p.stat().st_size, "sha256": digest(p)} for p in (final, control)}}


def verify_rolling_blocks(image, control, work, executable):
    # All source blocks must match locally: missing blocks cannot be downloaded.
    raw = Path(control).read_bytes()
    checked = Path(work) / "verify.zsync"
    checked.write_bytes(raw.replace(("URL: " + Path(image).name + "\n").encode(), b"URL: http://127.0.0.1:9/blocked\n", 1))
    output = Path(work) / "verify-image"
    if output.exists():
        raise ValueError("Verification output already exists")
    subprocess.run([executable, "-i", image, "-o", output, checked], cwd=work, check=True)
    if digest(output) != digest(image):
        raise ValueError("zsync seed verification differs from final image")
    output.unlink()


def owned(path):
    path = Path(path).absolute()
    if ".." in path.parts:
        raise ValueError("Parent traversal in builder path")
    if not any(path.is_relative_to(root) for root in ("/srv/elixiroffice/cache", "/srv/elixiroffice/wt")):
        raise ValueError("Builder work must stay in owned data work/cache")
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError("Symlink in builder path")
    marker = path / ".appimage-update-owned"
    if path.exists():
        if path.stat().st_uid != os.getuid() or not marker.is_file() or marker.is_symlink():
            raise ValueError("Existing builder directory is not owned")
    else:
        path.mkdir(parents=True)
        marker.write_text("ElixirOffice AppImage packaging workspace\n")
    return path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pins", type=Path, default=HERE / "appimage-tools.json")
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--work", type=Path)
    p.add_argument("--tool-cache", type=Path, help="Verified persistent raw tools; copied to the owned build cache without downloads")
    p.add_argument("--cached-tools-only", action="store_true", help="Reject missing raw tools instead of downloading them")
    p.add_argument("--appimage", type=Path)
    p.add_argument("--image")
    p.add_argument("--channel", default="latest-all")
    p.add_argument("--prepare-only", action="store_true")
    p.add_argument("--inside", choices=["prepare", "build"], help=argparse.SUPPRESS)
    p.add_argument("--name", help=argparse.SUPPRESS)
    a = p.parse_args()
    manifest = pins(a.pins)
    if a.inside:
        if not Path("/.dockerenv").is_file() or os.getuid() != 1000:
            raise ValueError("Internal operations require the non-root builder")
        result = prepare(a.cache, manifest, allow_download=not a.cached_tools_only) if a.inside == "prepare" else build(a.work, a.cache, manifest, a.name, a.channel)
        destination = a.cache if a.inside == "prepare" else a.work
        (destination / "receipt.json").write_text(json.dumps(result, indent=2) + "\n")
        return
    image = a.image or manifest["builder_image"]
    if not re.fullmatch(r"(?:[A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}", image) or image.startswith("-"):
        raise ValueError("Builder image must be pinned")
    if image != manifest["builder_image"]:
        raise ValueError("Builder differs from reviewed manifest; re-pin with provenance review")
    if a.tool_cache:
        verify_cached_tools(a.tool_cache, manifest)
        # Reject aliases/nesting before the owned-directory marker can be written.
        raw, target = a.tool_cache.absolute(), a.cache.absolute()
        if raw.is_relative_to(target) or target.is_relative_to(raw):
            raise ValueError("Persistent raw tools and build cache must be disjoint")
        a.cached_tools_only = True
    elif a.cached_tools_only:
        verify_cached_tools(a.cache, manifest)
    cache = owned(a.cache)
    if a.tool_cache:
        stage_cached_tools(a.tool_cache, cache, manifest)
    base = ["docker", "run", "--rm", "--user=1000:1000", "--cpus=2", "--memory=4g", "--memory-swap=4g", "--pids-limit=512", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--mount", "type=bind,source=" + str(HERE) + ",target=/driver,readonly", "--mount", "type=bind,source=" + str(a.pins.resolve()) + ",target=/pins.json,readonly", "--mount", "type=bind,source=" + str(cache) + ",target=/cache"]
    command = ["python3", "/driver/appimage_update.py", "--pins", "/pins.json", "--cache", "/cache"]
    if a.cached_tools_only:
        command += ["--cached-tools-only"]
    network = "--network=none" if a.cached_tools_only else "--network=bridge"
    subprocess.run(base + [network, image, *command, "--inside", "prepare"], check=True)
    if a.prepare_only:
        return
    if not a.work or not a.appimage or not re.fullmatch(r"ElixirOffice-[0-9]+(?:\.[0-9]+){2}(?:-rc\.[1-9][0-9]*)?-x86_64\.AppImage", a.appimage.name):
        raise ValueError("Provide the final-named AppImage and work directory")
    work = owned(a.work)
    if (work / "input.AppImage").exists():
        raise ValueError("Build work already used; never overwrite an attempt")
    shutil.copyfile(a.appimage, work / "input.AppImage")
    # Final packaging may read the verified tool cache but cannot change it.
    base[-1] += ",readonly"
    subprocess.run(base + ["--network=none", "--mount", "type=bind,source=" + str(work) + ",target=/work", image, *command, "--inside", "build", "--work", "/work", "--name", a.appimage.name, "--channel", a.channel], check=True)
    print(work / "receipt.json")


if __name__ == "__main__":
    main()
