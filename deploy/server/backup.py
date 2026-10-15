#!/usr/bin/env python3
"""Stopped-volume backup/restore for the supplied standalone compose."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

FILES = ("server.env", "docker-compose.yml", "Caddyfile", "example.json")
VOLUME_KEYS = {"data", "state", "postgres", "redis", "rabbitmq", "logs", "caddy_data", "caddy_config"}

def command(args, capture=False):
    return subprocess.check_output(args, text=True) if capture else subprocess.check_call(args)

def compose(directory, project, *args, capture=False):
    return command(["docker", "compose", "-p", project, "--env-file",
                    str(directory / "server.env"), "-f",
                    str(directory / "docker-compose.yml"), *args], capture)

def volumes(directory, project):
    config = json.loads(compose(directory, project, "config", "--format", "json", capture=True))
    # Configuration contains credentials: never print or write the rendered object.
    result = {key: value["name"] for key, value in config["volumes"].items()}
    if set(result) != VOLUME_KEYS or any(not value.startswith(project + "_") for value in result.values()):
        raise ValueError("expected eight project-owned volumes; external/custom names are unsupported")
    return result

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def helper(image, volume, output, shell, readonly=False):
    command(["docker", "run", "--rm", "--network", "none",
             "--mount", "type=volume,src=" + volume + ",dst=/volume" + (",readonly" if readonly else ""),
             "--mount", "type=bind,src=" + str(output) + ",dst=/backup,readonly",
             image, "sh", "-ec", shell])

def archive(image, volume, destination):
    # Stream to a host-owned mode600 file; container root must not create host files.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        subprocess.check_call(["docker", "run", "--rm", "--network", "none",
            "--mount", "type=volume,src=" + volume + ",dst=/volume,readonly",
            image, "tar", "-C", "/volume", "-cpf", "-", "."], stdout=stream)

def restore_validated(manifest, output, project, expected):
    if manifest["project"] != project or manifest["volumes"] != expected:
        raise ValueError("backup project/volume names do not match")
    expected_files = {*FILES, *(key + ".tar" for key in expected)}
    if set(manifest["sha256"]) != expected_files:
        raise ValueError("backup manifest file set does not match")
    for name, sha in manifest["sha256"].items():
        if digest(output / name) != sha:
            raise ValueError("backup checksum mismatch: " + name)

def run(args):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", args.project):
        raise ValueError("invalid compose project name")
    if not re.fullmatch(r"[A-Za-z0-9._/:-]+@sha256:[a-f0-9]{64}", args.helper_image):
        raise ValueError("use a pinned helper image")
    install = Path(args.install).resolve()
    output = Path(args.output).resolve()
    if "," in str(output) or "," in str(install):
        raise ValueError("commas in paths are unsupported")
    if args.action == "backup":
        expected = volumes(install, args.project)
        # Never let Docker create an empty volume in place of a missing installation.
        for value in expected.values():
            command(["docker", "volume", "inspect", value], capture=True)
        output.mkdir(mode=0o700, parents=True, exist_ok=False)
        compose(install, args.project, "stop")
        hashes = {}
        for name in FILES:
            shutil.copyfile(install / name, output / name)
            os.chmod(output / name, 0o600)
            hashes[name] = digest(output / name)
        for key, value in expected.items():
            archive(args.helper_image, value, output / (key + ".tar"))
            hashes[key + ".tar"] = digest(output / (key + ".tar"))
        (output / "manifest.json").write_text(json.dumps(
            {"project": args.project, "volumes": expected, "sha256": hashes}, indent=2) + "\n")
        os.chmod(output / "manifest.json", 0o600)
        print("Backup complete; installation remains stopped.")
    else:
        if not args.replace_volumes:
            raise ValueError("restore requires --replace-volumes; persistent contents will be replaced")
        # Refuse live processes before copying configuration or changing a volume.
        live = command(["docker", "ps", "-q", "--filter",
                        "label=com.docker.compose.project=" + args.project], capture=True).strip()
        if live:
            raise ValueError("project has running containers; stop it before restore")
        manifest = json.loads((output / "manifest.json").read_text())
        expected = volumes(output, args.project)
        restore_validated(manifest, output, args.project, expected)
        install.mkdir(mode=0o700, parents=True, exist_ok=True)
        for name in FILES:
            shutil.copyfile(output / name, install / name)
            os.chmod(install / name, 0o644 if name == "example.json" else 0o600)
        compose(install, args.project, "down")  # no --volumes
        compose(install, args.project, "create")  # creates labelled volumes without starting
        for key, value in expected.items():
            helper(args.helper_image, value, output,
                   "find /volume -mindepth 1 -maxdepth 1 -exec rm -rf {} +; "
                   "tar -C /volume -xpf /backup/" + key + ".tar")
        print("Restore complete; installation remains stopped. Start and verify the restored image.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("backup", "restore"), default="backup")
    parser.add_argument("--install", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--helper-image", required=True)
    parser.add_argument("--replace-volumes", action="store_true")
    try:
        run(parser.parse_args())
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        # Command arguments never include secret values; rendered config isn't emitted.
        parser.exit(1, str(error) + "\n")
