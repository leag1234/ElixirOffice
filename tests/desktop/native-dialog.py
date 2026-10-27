# SPDX-License-Identifier: AGPL-3.0-only
"""Linux native PDF-warning assertions for an explicitly owned test bus."""
import json, os, re, socket, stat, struct, subprocess, time, hashlib, sys
from urllib.parse import quote, unquote
from pathlib import Path

def nodes(tree, depth=0):
    assert depth <= 10, "Native subtree depth exceeded"
    children = tree.get("children", [])
    assert isinstance(children, list) and len(children) <= 100
    result = [tree]
    for child in children:
        result.extend(nodes(child, depth + 1))
    assert len(result) <= 150, "Native subtree size exceeded"
    return result

def match_warning(snapshot, expected, focused=False):
    assert snapshot["pid"] == expected["pid"], "Foreign native process"
    assert snapshot["window"] == expected["window"], "Native window changed"
    assert snapshot["mapped"] is True, "Native warning is not mapped"
    assert snapshot["bounds"] == expected["bounds"], "Native geometry changed"
    assert len(snapshot["dialogs"]) == 1, "Ambiguous native dialogs"
    dialog = snapshot["dialogs"][0]
    assert dialog["role"] in ("alert", "dialog"), "Expected native warning role"
    assert dialog["rect"] == snapshot["bounds"], "Accessible/native bounds differ"
    assert dialog["visible"] and dialog["showing"], "Native warning not visible"
    all_nodes = nodes(dialog)
    assert all(n["pid"] == expected["pid"] for n in all_nodes), "Foreign accessible subtree"
    body = [n for n in all_nodes if n["name"] == expected["body"]]
    assert len(body) == 1 and body[0]["role"] == "label" and body[0]["visible"] and body[0]["showing"], "Exact visible PDF warning absent or ambiguous"
    assert all(n["role"] in ("alert","dialog","filler","icon","label","push button") for n in all_nodes), "Unexpected native warning control"
    assert expected["body"] and expected["cancel"] and expected["saveCopy"]
    assert expected["cancel"] != expected["saveCopy"], "Ambiguous expected choices"
    buttons = [n for n in all_nodes if n["role"] == "push button"]
    assert len(buttons) == 2, "Expected exactly two native choices"
    assert sorted(n["name"] for n in buttons) == sorted([expected["cancel"], expected["saveCopy"]]), "Native choices changed"
    assert all(n["enabled"] and n["sensitive"] and n["visible"] and n["showing"] for n in buttons), "Native choice unavailable"
    assert expected["choose"] in ("cancel", "saveCopy")
    selected = [n for n in buttons if n["name"] == expected[expected["choose"]]]
    assert len(selected) == 1
    if focused:
        assert selected[0]["focused"] and sum(bool(n["focused"]) for n in buttons) == 1, "Native choice focus changed"
    return selected[0]["key"]

_display_identity = None

def owned_bus():
    assert sys.platform == "linux", "Native dialog guards require Linux"
    root = Path(os.environ["EO_DESKTOP_ROOT"]).resolve(strict=True)
    manifest = Path(os.environ["EO_NATIVE_A11Y"])
    assert manifest.is_absolute() and not manifest.is_symlink()
    parent = manifest.parent
    assert parent.resolve(strict=True).is_relative_to(root), "Accessibility bus must be inside the owned test root"
    assert not parent.is_symlink() and parent.stat().st_uid == os.getuid() and stat.S_IMODE(parent.stat().st_mode) == 0o700
    m = manifest.stat()
    assert stat.S_ISREG(m.st_mode) and m.st_uid == os.getuid() and stat.S_IMODE(m.st_mode) == 0o600
    address = "unix:path=" + quote(str(parent / "bus"), safe="/._-")
    assert os.environ["AT_SPI_BUS_ADDRESS"] == address, "Only the exact owned Unix bus is allowed"
    assert os.environ.get("ATSPI_DISABLE_P2P") == "1", "Private test bus must not use a secondary endpoint"
    peer = parent / "bus"
    s = peer.lstat()
    assert stat.S_ISSOCK(s.st_mode) and s.st_uid == os.getuid()
    assert os.environ.get("ACCESSIBILITY_ENABLED") == "1", "Explicit native accessibility required"
    runtime = Path(os.environ["XDG_RUNTIME_DIR"])
    assert runtime.resolve(strict=True).is_relative_to(root) and not runtime.is_symlink()
    assert runtime.stat().st_uid == os.getuid() and stat.S_IMODE(runtime.stat().st_mode) == 0o700
    session = os.environ["DBUS_SESSION_BUS_ADDRESS"]
    assert session.startswith("unix:path=")
    encoded_session = session[len("unix:path="):]
    decoded_session = unquote(encoded_session, errors="strict")
    assert quote(decoded_session, safe="/._-") == encoded_session, "Only one canonical disabled session endpoint is allowed"
    disabled_session = Path(decoded_session)
    assert disabled_session.is_absolute() and disabled_session.resolve().is_relative_to(root)
    assert disabled_session.name == "no-session-bus" and not disabled_session.exists(), "Normal desktop session bus forbidden"
    identity = json.loads(manifest.read_text())
    client = socket.socket(socket.AF_UNIX)
    client.settimeout(2)
    try:
        client.connect(str(peer))
        pid, uid, _ = struct.unpack("3i", client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    finally:
        client.close()
    assert uid == os.getuid() and pid == identity["daemon"]["pid"], "Foreign accessibility bus peer"
    cgroup = Path("/proc/self/cgroup").read_text()
    for name, executable in (("daemon", "dbus-daemon"), ("registry", "at-spi2-registryd")):
        row = identity[name]
        proc = Path("/proc") / str(row["pid"])
        assert proc.stat().st_uid == os.getuid()
        assert str((proc / "exe").resolve(strict=True)) == row["exe"] and Path(row["exe"]).name == executable
        assert (proc / "stat").read_text().rsplit(")", 1)[1].split()[19] == row["start"], "Accessibility process changed"
        assert (proc / "cgroup").read_text() == row["cgroup"] == cgroup, "Accessibility service outside owned test job"
    global _display_identity
    display = os.environ["DISPLAY"]
    assert display == os.environ["EO_DESKTOP_DISPLAY"] and re.fullmatch(r":[1-9][0-9]+", display)
    xvfb = Path("/proc") / str(int(os.environ["EO_XVFB_PID"]))
    assert xvfb.stat().st_uid == os.getuid() and (xvfb / "exe").resolve(strict=True).name == "Xvfb"
    args = (xvfb / "cmdline").read_bytes().rstrip(bytes([0])).split(bytes([0]))
    assert display.encode() in args and b"-nolisten" in args and b"tcp" in args
    auth = root / "desktop.Xauthority"
    assert os.environ["XAUTHORITY"] == str(auth) and auth.stat().st_uid == os.getuid() and stat.S_IMODE(auth.stat().st_mode) == 0o600
    assert str(auth).encode() in args and (xvfb / "cgroup").read_text() == cgroup
    current = ((xvfb / "exe").resolve(strict=True), (xvfb / "stat").read_text().rsplit(")", 1)[1].split()[19], args)
    if _display_identity is None:
        _display_identity = current
    assert current == _display_identity, "Private display identity changed"
    return identity

def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=3)

def native_window(pid):
    assert os.environ.get("EO_XVFB_PID"), "Exact native warning assertions require a private Xvfb"
    assert re.fullmatch(r":[1-9][0-9]+", os.environ["DISPLAY"])
    ids = list(dict.fromkeys(re.findall(r"0x[0-9a-f]+", command("xwininfo", "-root", "-tree"))))
    assert len(ids) <= 500
    dialogs = []
    for wid in ids:
        if int(wid, 16) <= 1:
            continue
        try:
            props = command("xprop", "-id", wid, "_NET_WM_PID", "WM_TRANSIENT_FOR", "_NET_WM_WINDOW_TYPE")
            if "_NET_WM_WINDOW_TYPE_DIALOG" not in props:
                continue
            if not re.search(r"_NET_WM_PID[^\n]*= " + str(pid) + r"(?:\n|$)", props):
                continue
            info = command("xwininfo", "-id", wid)
            if "Map State: IsViewable" not in info:
                continue
            parent = re.search(r"WM_TRANSIENT_FOR.*?(0x[0-9a-f]+)", props)
            assert parent and re.search(r"= " + str(pid) + r"(?:\n|$)", command("xprop", "-id", parent[1], "_NET_WM_PID")), "Foreign native parent"
            bounds = [int(re.search(label + r":\s+(-?\d+)", info)[1]) for label in ("Absolute upper-left X", "Absolute upper-left Y", "Width", "Height")]
            dialogs.append({"pid":pid, "window":wid, "mapped":True, "bounds":bounds})
        except subprocess.CalledProcessError as error:
            if "BadWindow" not in str(error.stderr):
                raise
    assert len(dialogs) == 1, "Expected one mapped owned native dialog"
    return dialogs[0]

def main_identity(identity):
    pid = int(os.environ["EO_NATIVE_PID"])
    proc = Path("/proc") / str(pid)
    expected = json.loads(os.environ["EO_NATIVE_IDENTITY"])
    assert expected["pid"] == pid and proc.stat().st_uid == os.getuid() and os.getsid(pid) == pid
    assert str((proc / "exe").resolve(strict=True)) == expected["executable"] == identity["applicationExecutable"]
    assert (proc / "stat").read_text().rsplit(")", 1)[1].split()[19] == expected["startTime"]
    command_line = (proc / "cmdline").read_bytes()
    assert hashlib.sha256(command_line).hexdigest() == expected["commandSha256"]
    assert b"--no-sandbox" not in command_line and b"--disable-setuid-sandbox" not in command_line
    assert (proc / "cgroup").read_text() == Path("/proc/self/cgroup").read_text()
    Path(expected["profile"]).resolve(strict=True).relative_to((Path(os.environ["EO_DESKTOP_ROOT"]) / "profiles").resolve(strict=True))
    return pid

def read_warning(node, pid, Atspi):
    references = {}
    count = [0]
    def read(n, key, depth=0):
        count[0] += 1
        assert count[0] <= 150 and depth <= 10, "Native subtree bound exceeded"
        n.clear_cache()
        assert n.get_process_id() == pid, "Foreign native descendant"
        st = n.get_state_set()
        component = n.get_component_iface()
        rect = component.get_extents(Atspi.CoordType.SCREEN) if component else None
        references[key] = n
        row = {"pid":pid, "key":key, "role":n.get_role_name(), "name":n.get_name(), "rect":None if rect is None else [rect.x,rect.y,rect.width,rect.height], "children":[]}
        for name, state in (("visible",Atspi.StateType.VISIBLE),("showing",Atspi.StateType.SHOWING),("focused",Atspi.StateType.FOCUSED),("enabled",Atspi.StateType.ENABLED),("sensitive",Atspi.StateType.SENSITIVE)):
            row[name] = st.contains(state)
        assert n.get_child_count() <= 100
        for j in range(n.get_child_count()):
            row["children"].append(read(n.get_child_at_index(j), key + "/" + str(j), depth + 1))
        return row
    return read(node, "0"), references

def warning_guard(node, labels, choose, window, Atspi, GLib):
    identity = owned_bus()
    pid = main_identity(identity)
    native = native_window(pid)
    assert native["window"] == window, "Native warning window changed before binding"
    expected = {**native, **labels, "choose":choose}
    references = {}
    def snapshot():
        main_identity(owned_bus())
        current = native_window(pid)
        tree, refs = read_warning(node, pid, Atspi)
        references.clear()
        references.update(refs)
        return {**current, "dialogs":[tree]}
    selected = match_warning(snapshot(), expected)
    assert references[selected].get_component_iface().grab_focus(), "Native button refused focus"
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        context = GLib.MainContext.default()
        for _ in range(20):
            if not context.pending() or time.monotonic() >= deadline:
                break
            context.iteration(False)
        try:
            match_warning(snapshot(), expected, focused=True)
            break
        except AssertionError:
            time.sleep(.05)
    else:
        raise AssertionError("Expected native button did not acquire focus")
    def guard():
        match_warning(snapshot(), expected, focused=True)
    guard()
    return guard, {"window":native["window"], "warning":labels["body"], "choice":labels[choose], "confirmed":True}

def watch():
    # GTK native dialogs are event sources outside Chromium's root child list.
    # Subscribe before opening Save As; never traverse the editor accessible tree.
    import gi, selectors, sys, runpy
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi, GLib
    identity = owned_bus()
    pid = main_identity(identity)
    Atspi.set_timeout(1000, 1000)
    sources, errors = [], []
    event_count = 0
    deadline = time.monotonic() + 40
    def metadata(node):
        node.clear_cache()
        assert node.get_process_id() == pid, "Foreign native event source"
        component = node.get_component_iface()
        rect = component.get_extents(Atspi.CoordType.SCREEN) if component else None
        return node.get_role_name(), None if rect is None else [rect.x,rect.y,rect.width,rect.height]
    def received(event, *unused):
        nonlocal event_count
        try:
            event_count += 1
            assert event_count <= 50, "Native event bound exceeded"
            role, _ = metadata(event.source)
            if role in ("alert", "dialog") and all(event.source != old for old in sources):
                sources.append(event.source)
        except BaseException as error:
            errors.append(str(error))
    listener = Atspi.EventListener.new(received, None)
    selector = selectors.DefaultSelector()
    request, buffer = None, b""
    try:
        assert listener.register("window:create") and listener.register("window:activate")
        selector.register(sys.stdin, selectors.EVENT_READ)
        print(json.dumps({"kind":"ready", "pid":os.getpid()}), flush=True)
        while time.monotonic() < deadline:
            context = GLib.MainContext.default()
            for _ in range(100):
                if not context.pending() or time.monotonic() >= deadline:
                    break
                context.iteration(False)
            assert not errors, str(errors)
            if request is None and selector.select(0):
                part = os.read(sys.stdin.fileno(), 4096)
                assert part, "Native warning request closed before a complete message"
                buffer += part
                assert len(buffer) <= 8192, "Native warning request too large"
                if b"\n" in buffer:
                    line, rest = buffer.split(b"\n", 1)
                    assert not rest, "Extra native warning request"
                    request = json.loads(line)
                    assert set(request) == {"window","choose","body","cancel","saveCopy"}
                    assert re.fullmatch(r"0x[0-9a-f]+", request["window"])
                    assert request["choose"] in ("cancel","saveCopy")
                    assert all(isinstance(request[k],str) and 0 < len(request[k]) <= 2000 for k in ("body","cancel","saveCopy"))
            if request:
                main_identity(owned_bus())
                native = native_window(pid)
                assert native["window"] == request["window"], "Expected native warning changed"
                matches = []
                for source in sources:
                    source.clear_cache()
                    st = source.get_state_set()
                    if st.contains(Atspi.StateType.DEFUNCT) or not st.contains(Atspi.StateType.SHOWING):
                        continue
                    _, bounds = metadata(source)
                    if bounds == native["bounds"]:
                        matches.append(source)
                assert len(matches) <= 1, "Ambiguous exact native warning event sources"
                if matches:
                    labels = {key:request[key] for key in ("body","cancel","saveCopy")}
                    guard, receipt = warning_guard(matches[0], labels, request["choose"], request["window"], Atspi, GLib)
                    # This trusted in-process callable supplements the existing physical
                    # X11 per-key ownership/focus and held-key cleanup checks.
                    original_args = sys.argv[:]
                    original_window = os.environ.get("EO_NATIVE_WINDOW")
                    try:
                        os.environ["EO_NATIVE_WINDOW"] = request["window"]
                        sys.argv = [str(Path(__file__).with_name("native-input.py")), "return"]
                        runpy.run_path(sys.argv[0], init_globals={"_native_warning_guard":guard}, run_name="__main__")
                    finally:
                        sys.argv = original_args
                        if original_window is None:
                            os.environ.pop("EO_NATIVE_WINDOW", None)
                        else:
                            os.environ["EO_NATIVE_WINDOW"] = original_window
                    print(json.dumps({"kind":"confirmed", **receipt}), flush=True)
                    return
            time.sleep(.02)
        raise AssertionError("Expected native warning event deadline")
    finally:
        selector.close()
        listener.deregister("window:create")
        listener.deregister("window:activate")

if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["--match"]:
        data = json.load(sys.stdin)
        print(json.dumps(match_warning(data["snapshot"], data["expected"], data.get("focused", False))))
    elif sys.argv[1:] == ["--validate-bus"]:
        owned_bus()
    elif sys.argv[1:] == ["--watch"]:
        watch()
    else:
        raise SystemExit("Expected --match, --validate-bus or --watch")
