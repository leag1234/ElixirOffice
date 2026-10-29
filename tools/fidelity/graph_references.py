#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Owner-operated, read-only Microsoft Graph PDF reference acquisition."""
import argparse
import collections
import datetime
import email.utils
import math
import fcntl
import hashlib
import json
import logging
import os
import re
import stat
import sys
import time
import urllib.parse
import uuid
from dataclasses import dataclass
from pathlib import Path

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = ["Files.Read"]
MAX_SOURCE = 2000000
MAX_PDF = 64 * 1024 * 1024
VERSION = "graph-onedrive-reference-v1"


class SafeError(Exception):
    """Only bounded public codes may reach stdout/stderr."""
    def __init__(self, code):
        self.code = code if re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", str(code)) else "INTERNAL_ERROR"
        super().__init__(self.code)


def public_path(path):
    path = Path(path).expanduser().resolve()
    if any(p in {"corpus-private", ("corpus-" "real")} for p in path.parts):
        raise SafeError("PRIVATE_INPUT_FORBIDDEN")
    return path


def outside_git(path):
    if any((parent / ".git").exists() for parent in [path, *path.parents]):
        raise SafeError("PRIVATE_STATE_MUST_BE_OUTSIDE_GIT")


def file_sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def text_sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def secure_file(path, flags, mode=0o600):
    try:
        fd = os.open(path, flags | getattr(os, "O_NOFOLLOW", 0), mode)
    except FileNotFoundError:
        raise
    except OSError:
        raise SafeError("PRIVATE_FILE_UNSAFE") from None
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
        os.close(fd)
        raise SafeError("PRIVATE_FILE_UNSAFE")
    os.fchmod(fd, mode)
    return fd


def private_directory(path):
    raw = Path(path).expanduser().absolute()
    if raw.is_symlink():
        raise SafeError("PRIVATE_DIRECTORY_SYMLINK")
    path = raw.resolve()
    outside_git(path)
    path.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise SafeError("PRIVATE_DIRECTORY_UNSAFE")
    path.chmod(0o700)
    return path


def atomic_text(path, value):
    path = Path(path)
    if path.is_symlink():
        raise SafeError("OUTPUT_SYMLINK")
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex)
    created = False
    try:
        fd = secure_file(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        created = True
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        if created:
            temporary.unlink(missing_ok=True)


class PrivateStore:
    def __init__(self, path):
        self.raw = Path(path)
        self.directory = None
        self.lock = None

    def __enter__(self):
        locations = (self.raw.expanduser().absolute(), self.raw.expanduser().resolve())
        if any(p in {"corpus-public", "corpus-private", ("corpus-" "real")} for location in locations for p in location.parts):
            raise SafeError("CACHE_LOCATION_FORBIDDEN")
        self.directory = private_directory(self.raw)
        fd = secure_file(self.directory / ".lock", os.O_RDWR | os.O_CREAT)
        self.lock = os.fdopen(fd, "r+")
        try:
            fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            self.lock = None
            raise SafeError("AUTH_CACHE_IN_USE") from None
        return self

    def filename(self, name):
        if not re.fullmatch(r"[a-z][a-z0-9.-]{0,60}", name) or ".." in name:
            raise SafeError("PRIVATE_FILE_NAME_INVALID")
        return self.directory / name

    def read(self, name):
        path = self.filename(name)
        try:
            fd = secure_file(path, os.O_RDONLY)
        except FileNotFoundError:
            return None
        with os.fdopen(fd, "r", encoding="utf-8") as stream:
            value = stream.read(16 * 1024 * 1024 + 1)
        if len(value) > 16 * 1024 * 1024:
            raise SafeError("AUTH_CACHE_TOO_LARGE")
        return value

    def write(self, name, value):
        path = self.filename(name)
        if path.exists() or path.is_symlink():
            fd = secure_file(path, os.O_RDONLY)
            os.close(fd)
        atomic_text(path, value)

    def __exit__(self, *_):
        if self.lock:
            self.lock.close()


def owner_prompt(message):
    # Never put the one-time user code in stdout, redirected logs or the bus.
    with open("/dev/tty", "w", encoding="utf-8") as terminal:
        if not terminal.isatty():
            raise SafeError("OWNER_TTY_REQUIRED")
        terminal.write(message + "\n")
        terminal.flush()


class OwnerAuth:
    def __init__(self, client_id, tenant, store, msal_module=None, http_session=None, prompt=owner_prompt):
        try:
            client_id = str(uuid.UUID(client_id))
            if tenant not in {"common", "organizations", "consumers"}:
                tenant = str(uuid.UUID(tenant))
        except ValueError:
            raise SafeError("APP_IDENTIFIERS_INVALID") from None
        if msal_module is None:
            try:
                import msal as msal_module
            except ImportError:
                raise SafeError("AUTH_DEPENDENCIES_MISSING") from None
        self.store, self.prompt = store, prompt
        self.cache = msal_module.SerializableTokenCache()
        serialized = store.read("msal-cache.json")
        if serialized:
            try:
                self.cache.deserialize(serialized)
            except Exception:
                raise SafeError("AUTH_CACHE_INVALID") from None
        self.app = msal_module.PublicClientApplication(
            client_id, authority="https://login.microsoftonline.com/" + tenant,
            token_cache=self.cache, http_client=http_session)
        self.identity_base = client_id + ":" + tenant
        self.identity = text_sha(self.identity_base)

    def token(self):
        try:
            accounts = self.app.get_accounts()
            if len(accounts) > 1:
                raise SafeError("MULTIPLE_CACHED_ACCOUNTS_USE_SEPARATE_CACHE")
            result = self.app.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None
            if not result or "access_token" not in result:
                flow = self.app.initiate_device_flow(scopes=SCOPES)
                code = flow.get("user_code")
                if not isinstance(code, str) or not re.fullmatch(r"[A-Z0-9-]{4,32}", code):
                    raise SafeError("DEVICE_FLOW_UNAVAILABLE")
                self.prompt("Open https://microsoft.com/devicelogin in your own browser. Enter: " + code)
                result = self.app.acquire_token_by_device_flow(flow)
            if not isinstance(result, dict) or not isinstance(result.get("access_token"), str):
                raise SafeError("OWNER_SIGN_IN_OR_CONSENT_REQUIRED")
            accounts = self.app.get_accounts()
            if len(accounts) != 1 or not isinstance(accounts[0].get("home_account_id"), str):
                raise SafeError("ACCOUNT_CONTEXT_UNAVAILABLE")
            self.identity = text_sha(self.identity_base + ":" + accounts[0]["home_account_id"])
            return result["access_token"]
        except SafeError:
            raise
        except Exception:
            raise SafeError("AUTHENTICATION_FAILED") from None

    def close(self):
        if self.cache.has_state_changed:
            self.store.write("msal-cache.json", self.cache.serialize())


class GraphHTTP:
    def __init__(self, graph_session, download_session, token, sleep=time.sleep, now=None):
        self.graph, self.download, self.token, self.sleep = graph_session, download_session, token, sleep
        self.now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))

    @staticmethod
    def graph_url(route):
        url = GRAPH + route if route.startswith("/") else route
        parsed = urllib.parse.urlsplit(url)
        if (parsed.scheme != "https" or parsed.hostname != "graph.microsoft.com"
                or parsed.username or parsed.password or parsed.port not in {None, 443}
                or not parsed.path.startswith("/v1.0/me/drive/") or parsed.fragment):
            raise SafeError("GRAPH_URL_REJECTED")
        return url

    @staticmethod
    def download_url(url):
        try:
            parsed = urllib.parse.urlsplit(url)
            host = parsed.hostname or ""
            permitted = (host == "graph.microsoft.com" or any(
                host.endswith(suffix) for suffix in
                (".1drv.com", ".sharepoint.com", ".sharepointonline.com",
                 ".storage.live.com", ".livefilestore.com")))
            if (parsed.scheme != "https" or not permitted or parsed.username or parsed.password
                    or parsed.port not in {None, 443} or parsed.fragment):
                raise SafeError("DOWNLOAD_URL_REJECTED")
        except ValueError:
            raise SafeError("DOWNLOAD_URL_REJECTED") from None
        return url

    def request(self, url, authenticated):
        session = self.graph if authenticated else self.download
        for attempt in range(3):
            headers = {"Authorization": "Bearer " + self.token()} if authenticated else {}
            try:
                response = session.get(url, headers=headers, timeout=(10, 90),
                                       allow_redirects=False, stream=True)
            except Exception:
                raise SafeError("NETWORK_ERROR") from None
            if response.status_code not in {429, 500, 502, 503, 504}:
                if response.status_code in {401, 403}:
                    response.close()
                    raise SafeError("AUTH_OR_PERMISSION_REQUIRED" if authenticated else "DOWNLOAD_ACCESS_DENIED")
                return response
            retry = response.headers.get("Retry-After", "")
            response.close()
            if attempt == 2:
                raise SafeError("RETRY_LIMIT")
            if retry.isdecimal():
                delay = int(retry)
            else:
                try:
                    timestamp = email.utils.parsedate_to_datetime(retry)
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=datetime.timezone.utc)
                    delay = max(0, math.ceil((timestamp - self.now()).total_seconds()))
                except (ValueError, TypeError, OverflowError):
                    delay = 2 ** attempt
            if delay > 300:
                raise SafeError("THROTTLED_TRY_LATER")
            self.sleep(delay)
        raise SafeError("RETRY_LIMIT")

    def json(self, route):
        response = self.request(self.graph_url(route), True)
        try:
            if response.status_code != 200:
                raise SafeError("GRAPH_HTTP_" + str(response.status_code))
            body = bytearray()
            for block in response.iter_content(65536):
                body.extend(block)
                if len(body) > 2 * 1024 * 1024:
                    raise SafeError("GRAPH_METADATA_TOO_LARGE")
            try:
                value = json.loads(body)
            except (ValueError, UnicodeDecodeError):
                raise SafeError("GRAPH_JSON_INVALID") from None
            if not isinstance(value, dict):
                raise SafeError("GRAPH_JSON_INVALID")
            return value
        finally:
            response.close()

    def blob(self, route, destination, limit):
        destination = Path(destination)
        response = self.request(self.graph_url(route), True)
        created = False
        try:
            for _ in range(4):
                if response.status_code == 200:
                    break
                if response.status_code != 302:
                    raise SafeError("GRAPH_HTTP_" + str(response.status_code))
                location = response.headers.get("Location", "")
                response.close()
                response = self.request(self.download_url(location), False)
            else:
                raise SafeError("DOWNLOAD_REDIRECT_LIMIT")
            digest, size = hashlib.sha256(), 0
            fd = secure_file(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
            created = True
            with os.fdopen(fd, "wb") as stream:
                for block in response.iter_content(65536):
                    size += len(block)
                    if size > limit:
                        raise SafeError("DOWNLOAD_TOO_LARGE")
                    stream.write(block)
                    digest.update(block)
                stream.flush()
                os.fsync(stream.fileno())
            return {"bytes": size, "sha256": digest.hexdigest()}
        except BaseException:
            if created:
                destination.unlink(missing_ok=True)
            raise
        finally:
            response.close()


@dataclass
class Case:
    id: str
    path: Path
    sha: str
    size: int
    record: dict


def load_cases(manifest):
    manifest = public_path(manifest)
    if manifest.suffix != ".jsonl" or manifest.stat().st_size > 8 * 1024 * 1024:
        raise SafeError("MANIFEST_FORMAT_OR_SIZE_INVALID")
    cases, seen = [], set()
    with manifest.open() as stream:
        for line in stream:
            if not line.strip():
                continue
            record = json.loads(line)
            key = record.get("id", "")
            if not isinstance(key, str) or not re.fullmatch(r"[0-9a-f]{64}", key) or key in seen:
                raise SafeError("MANIFEST_IDS_INVALID")
            path = public_path(manifest.parent / record["input"])
            size = path.stat().st_size
            if path.suffix.lower() != ".docx" or not 0 < size <= MAX_SOURCE:
                raise SafeError("DOCX_FORMAT_OR_SIZE_UNSUPPORTED")
            if file_sha(path) != key:
                raise SafeError("LOCAL_INPUT_CHANGED")
            seen.add(key)
            cases.append(Case(key, path, key, size, record))
            if len(cases) > 1000:
                raise SafeError("MANIFEST_CASE_LIMIT")
    if not cases:
        raise SafeError("MANIFEST_EMPTY")
    return cases


def pdf_info(path):
    try:
        from pypdf import PdfReader
        reader = PdfReader(path)
        if reader.is_encrypted or not 1 <= len(reader.pages) <= 300:
            raise SafeError("REFERENCE_PDF_UNSUPPORTED")
        result = {"pages": len(reader.pages), "fontGlyphCounts": None, "fontEvidenceStatus": "unverified"}
        try:
            from differential import extract_pdf
            result["fontGlyphCounts"] = extract_pdf(path)["fontGlyphCounts"]
            result["fontEvidenceStatus"] = "extracted"
        except Exception:
            pass  # A valid PDF is retained even if glyph extraction is unsupported.
        return result
    except SafeError:
        raise
    except Exception:
        raise SafeError("PDF_INVALID") from None


def convert_case(case, item, client, output, context, inspect_pdf=pdf_info):
    output = Path(output)
    if case.path.stat().st_size != case.size or file_sha(case.path) != case.sha:
        raise SafeError("LOCAL_INPUT_CHANGED")
    if (not isinstance(item.get("id"), str) or not isinstance(item.get("eTag"), str)
            or item.get("size") != case.size):
        raise SafeError("CLOUD_ITEM_METADATA_INVALID")
    proof = {"tool": VERSION, "toolSHA256": file_sha(Path(__file__)), "inputSHA256": case.sha, "contextSHA256": text_sha(context),
             "itemSHA256": text_sha(item["id"]), "eTagSHA256": text_sha(item["eTag"])}
    pdf, metadata = output / (case.id + ".pdf"), output / (case.id + ".json")
    if pdf.is_symlink() or metadata.is_symlink():
        raise SafeError("OUTPUT_SYMLINK")
    if pdf.is_file() and metadata.is_file():
        try:
            previous = json.loads(metadata.read_text())
            if isinstance(previous, dict) and previous.get("proof") == proof and previous.get("pdfSHA256") == file_sha(pdf):
                return {**previous, "status": "cached"}
        except (ValueError, OSError):
            pass
    original = output / (".original-" + uuid.uuid4().hex)
    converted = output / (".converted-" + uuid.uuid4().hex)
    route = "/me/drive/items/" + urllib.parse.quote(item["id"], safe="")
    started = time.monotonic()
    try:
        cloud = client.blob(route + "/content", original, MAX_SOURCE)
        if cloud["sha256"] != case.sha or cloud["bytes"] != case.size:
            raise SafeError("CLOUD_INPUT_CHANGED")
        receipt = client.blob(route + "/content?format=pdf", converted, MAX_PDF)
        with converted.open("rb") as stream:
            if stream.read(5) != b"%PDF-":
                raise SafeError("PDF_INVALID")
        after = client.json(route + "?$select=id,eTag,size")
        if after.get("eTag") != item["eTag"] or after.get("size") != case.size or after.get("id") != item["id"]:
            raise SafeError("CLOUD_INPUT_CHANGED")
        if case.path.stat().st_size != case.size or file_sha(case.path) != case.sha:
            raise SafeError("LOCAL_INPUT_CHANGED")
        info = inspect_pdf(converted)
        result = {"id": case.id, "status": "ok", "referenceSource": "graph-onedrive-pdf",
                  "proof": proof, "pdfSHA256": receipt["sha256"], "bytes": receipt["bytes"],
                  **info, "exportedUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "applicationBuild": "unknown", "fontEnvironment": "Microsoft cloud; inspect PDF faces",
                  "seconds": round(time.monotonic() - started, 3)}
        converted.replace(pdf)
        atomic_text(metadata, json.dumps(result, indent=2) + "\n")
        return result
    finally:
        original.unlink(missing_ok=True)
        converted.unlink(missing_ok=True)


def folder_items(client, folder, cases):
    if not folder or any(not part or part in {".", ".."} or "\\" in part or ":" in part
                         for part in folder.split("/")):
        raise SafeError("FOLDER_PATH_INVALID")
    metadata = client.json("/me/drive/root:/" + urllib.parse.quote(folder, safe="/"))
    if "folder" not in metadata or not isinstance(metadata.get("id"), str):
        raise SafeError("FOLDER_NOT_FOUND")
    route = "/me/drive/items/" + urllib.parse.quote(metadata["id"], safe="") + "/children"
    page = route + "?$select=id,name,size,eTag,file"
    items, visited = {}, set()
    while page:
        url = client.graph_url(page)
        if urllib.parse.urlsplit(url).path != urllib.parse.urlsplit(GRAPH + route).path or url in visited:
            raise SafeError("FOLDER_PAGINATION_REJECTED")
        visited.add(url)
        if len(visited) > 100:
            raise SafeError("FOLDER_PAGINATION_LIMIT")
        data = client.json(page)
        for item in data.get("value", []):
            name = item.get("name")
            if not isinstance(name, str) or name in items or "file" not in item:
                raise SafeError("FOLDER_CONTENTS_NOT_EXACT")
            items[name] = item
        page = data.get("@odata.nextLink")
    expected = {case.id + ".docx" for case in cases}
    if set(items) != expected:
        raise SafeError("FOLDER_CONTENTS_NOT_EXACT")
    return metadata["id"], items


def write_results(cases, results, output, state="complete", global_error=None):
    output = Path(output)
    by_id = {result["id"]: result for result in results}
    rows = []
    pairs = []
    for case in cases:
        result = by_id.get(case.id, {"id": case.id, "status": "not-requested"})
        rows.append(result)
        valid = result["status"] in {"ok", "cached"}
        reference = str(output / (case.id + ".pdf")) if valid else None
        pairs.append({**case.record, "reference": reference,
                      "reference_source": "graph-onedrive-pdf",
                      "reference_status": result["status"]})
    atomic_text(output / "paired-manifest.jsonl", "".join(json.dumps(p, ensure_ascii=False) + "\n" for p in pairs))
    atomic_text(output / "run-results.json", json.dumps({
        "schema": 1, "source": "graph-onedrive-pdf", "cases": len(cases),
        "runState": state, "processed": len(results), "globalError": global_error,
        "counts": dict(collections.Counter(row["status"] for row in rows)),
        "note": "Cloud conversion references; not proven Word-web UI or Word-desktop equivalence.",
        "results": rows}, indent=2) + "\n")


class Parser(argparse.ArgumentParser):
    def error(self, _message):
        raise SafeError("ARGUMENTS_INVALID")


def main():
    parser = Parser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--owner-run", action="store_true")
    parser.add_argument("--client-id")
    parser.add_argument("--tenant")
    parser.add_argument("--folder-path")
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--pilot-file", type=Path)
    args = parser.parse_args()
    if not args.plan:
        if not args.owner_run:
            raise SafeError("OWNER_FLAG_REQUIRED")
        if not sys.stdin.isatty():
            raise SafeError("OWNER_TTY_REQUIRED")
    cases = load_cases(args.manifest)
    wanted = {case.id for case in cases}
    if args.pilot_file:
        pilot = json.loads(public_path(args.pilot_file).read_text())
        wanted = {row["id"] for row in pilot["cases"]}
        if not wanted or not wanted.issubset({case.id for case in cases}):
            raise SafeError("PILOT_IDS_INVALID")
    if args.plan:
        print(json.dumps({"cases": len(cases), "requested": len(wanted),
                          "bytes": sum(case.size for case in cases),
                          "cloudOperations": 0, "referenceSource": "graph-onedrive-pdf"}))
        return 0
    if not all((args.client_id, args.tenant, args.folder_path, args.cache_dir, args.out)):
        raise SafeError("OWNER_SETTINGS_REQUIRED")
    output = public_path(args.out)
    outside_git(output)
    output.mkdir(parents=True, mode=0o700, exist_ok=True)
    marker = output / ".eo-graph-reference-output"
    if marker.is_symlink():
        raise SafeError("OUTPUT_SYMLINK")
    if not marker.exists() and any(output.iterdir()):
        raise SafeError("UNOWNED_OUTPUT_DIRECTORY")
    output.chmod(0o700)
    marker.touch(mode=0o600)
    cache = args.cache_dir.expanduser().resolve()
    if cache.is_relative_to(output) or output.is_relative_to(cache):
        raise SafeError("AUTH_CACHE_AND_OUTPUT_MUST_BE_SEPARATE")
    try:
        import requests
    except ImportError:
        raise SafeError("AUTH_DEPENDENCIES_MISSING") from None
    # Include descendant loggers; progress/errors use bounded public codes.
    logging.disable(logging.CRITICAL)
    sessions = [requests.Session() for _ in range(3)]
    for session in sessions:
        session.trust_env = False  # No ambient .netrc credentials/proxy authorization.
        session.headers["User-Agent"] = "ElixirOffice-owner-reference/1"
    results = []
    write_results(cases, results, output, state="running")
    try:
        with PrivateStore(args.cache_dir) as store:
            auth = OwnerAuth(args.client_id, args.tenant, store, http_session=sessions[0])
            try:
                client = GraphHTTP(sessions[1], sessions[2], auth.token)
                folder_id, items = folder_items(client, args.folder_path, cases)
                context = auth.identity + ":" + folder_id
                for case in cases:
                    if case.id not in wanted:
                        continue
                    try:
                        result = convert_case(case, items[case.id + ".docx"], client, output, context)
                    except SafeError as error:
                        result = {"id": case.id, "status": "failed", "code": error.code}
                    except Exception:
                        result = {"id": case.id, "status": "failed", "code": "CONVERSION_FAILED"}
                    results.append(result)
                    write_results(cases, results, output, state="running")
                    print(case.id[:12], result["status"], result.get("code", ""), flush=True)
                    if result.get("code") == "AUTH_OR_PERMISSION_REQUIRED":
                        break
            finally:
                auth.close()
    except SafeError as error:
        write_results(cases, results, output, state="blocked", global_error=error.code)
        raise
    finally:
        for session in sessions:
            session.close()
    write_results(cases, results, output, state="complete" if len(results) == len(wanted) else "blocked")
    return 2 if any(r["status"] == "failed" for r in results) else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SafeError as error:
        print("ERROR " + error.code, file=sys.stderr)
        raise SystemExit(2)
    except KeyboardInterrupt:
        print("STOPPED", file=sys.stderr)
        raise SystemExit(130)
    except Exception:
        print("ERROR INTERNAL_ERROR", file=sys.stderr)
        raise SystemExit(2)
