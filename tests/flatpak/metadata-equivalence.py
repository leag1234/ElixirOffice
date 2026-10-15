#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Reject added or missing Flatpak permissions in a prebuilt assembly."""
import configparser
import json
import sys
from pathlib import Path


def verify(manifest, metadata):
    expected = {
        "Application": {
            "name": manifest["app-id"],
            "runtime": manifest["runtime"] + "/x86_64/" + manifest["runtime-version"],
            "sdk": manifest["sdk"] + "/x86_64/" + manifest["runtime-version"],
            "base": "app/" + manifest["base"] + "/x86_64/" + manifest["base-version"],
            "command": manifest["command"],
        }
    }
    sets = {}
    kinds = {"share": "shared", "socket": "sockets", "device": "devices"}
    for arg in manifest["finish-args"]:
        key, value = arg.removeprefix("--").split("=", 1)
        if key in kinds:
            sets.setdefault(kinds[key], set()).add(value)
        elif key == "env":
            name, text = value.split("=", 1)
            expected.setdefault("Environment", {})[name] = text
        else:
            raise AssertionError("Unsupported permission requires explicit test coverage: " + key)
    expected["Context"] = {k: sorted(v) for k, v in sets.items()}
    actual = {section: dict(metadata[section]) for section in metadata.sections()}
    for key in sets:
        actual["Context"][key] = sorted(filter(None, actual["Context"][key].split(";")))
    assert actual == expected, (actual, expected)


if __name__ == "__main__":
    manifest = json.loads(Path(sys.argv[1]).read_text())
    metadata = configparser.ConfigParser(interpolation=None)
    metadata.optionxform = str
    metadata.read(sys.argv[2])
    verify(manifest, metadata)
    # A regression guard must reject excess filesystem access.
    metadata["Context"]["filesystems"] = "host;"
    try:
        verify(manifest, metadata)
    except AssertionError:
        pass
    else:
        raise AssertionError("Overbroad permissions were accepted")
    print("PASS exact metadata equivalence and excess-permission rejection")
