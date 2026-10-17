#!/usr/bin/env python3
"""Upload and verify native App Store screenshots; never submit a release.

ASC_KEY_PATH must select the existing App Store Connect API key. Uses the same
credential-safe Apple helper as TestFlight. Re-running skips identical assets.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("apple", Path(__file__).with_name("apple-api.py"))
apple = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apple)


def api(method, path, body=None):
    status, result = apple.request(method, path, body)
    if not 200 <= status < 300:
        details = "; ".join(x.get("detail", "") for x in result.get("errors", []))
        raise RuntimeError(f"{method} {path}: {status}: {details}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-id", required=True)
    parser.add_argument("--metadata", type=Path, default=ROOT / "docs/appstore/metadata.json")
    args = parser.parse_args()
    metadata = json.loads(args.metadata.read_text())
    versions = api("GET", f"/v1/apps/{args.app_id}/appStoreVersions?limit=200")["data"]
    version = next(x for x in versions if x["attributes"]["platform"] == "IOS" and x["attributes"]["versionString"] == metadata["version"])
    locales = api("GET", f"/v1/appStoreVersions/{version['id']}/appStoreVersionLocalizations")["data"]
    locale = next(x for x in locales if x["attributes"]["locale"] == metadata["locale"])
    sets = api("GET", f"/v1/appStoreVersionLocalizations/{locale['id']}/appScreenshotSets")["data"]
    target = next((x for x in sets if x["attributes"]["screenshotDisplayType"] == metadata["screenshotDisplayType"]), None)
    if not target:
        target = api("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets",
            "attributes": {"screenshotDisplayType": metadata["screenshotDisplayType"]},
            "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": locale["id"]}}}}})["data"]
    set_id = target["id"]
    collection = f"/v1/appScreenshotSets/{set_id}/appScreenshots"
    existing = {x["attributes"]["fileName"]: x for x in api("GET", collection)["data"]}
    ordered = []
    for filename in metadata["screenshots"]:
        path = args.metadata.parent / "screenshots" / filename
        data = path.read_bytes(); checksum = hashlib.md5(data).hexdigest()
        old = existing.get(filename)
        if old and old["attributes"].get("sourceFileChecksum") == checksum:
            ordered.append(old["id"]); print("Already uploaded", filename, flush=True); continue
        if old:
            raise RuntimeError(f"A different asset named {filename} exists; review it before replacing")
        reservation = api("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots",
            "attributes": {"fileName": filename, "fileSize": len(data)},
            "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}}}})["data"]
        for operation in reservation["attributes"]["uploadOperations"]:
            headers = {x["name"]: x["value"] for x in operation["requestHeaders"]}
            request = urllib.request.Request(operation["url"], method=operation["method"], headers=headers,
                data=data[operation["offset"]:operation["offset"] + operation["length"]])
            try:
                with urllib.request.urlopen(request) as response:
                    if not 200 <= response.status < 300: raise RuntimeError("Upload rejected")
            except Exception as error:
                raise RuntimeError(f"Transfer failed for {filename}: {type(error).__name__}") from None
        api("PATCH", "/v1/appScreenshots/" + reservation["id"], {"data": {"type": "appScreenshots", "id": reservation["id"],
            "attributes": {"uploaded": True, "sourceFileChecksum": checksum}}})
        ordered.append(reservation["id"]); print("Uploaded", filename, flush=True)
    api("PATCH", f"/v1/appScreenshotSets/{set_id}/relationships/appScreenshots",
        {"data": [{"type": "appScreenshots", "id": x} for x in ordered]})
    for attempt in range(12):
        rows = api("GET", collection)["data"]
        states = [(x["attributes"]["fileName"], x["attributes"].get("assetDeliveryState", {})) for x in rows]
        failed = [(name, state) for name, state in states if state.get("state") == "FAILED"]
        if failed: raise RuntimeError(f"Apple screenshot processing failed: {failed}")
        if len(rows) == len(ordered) and all(state.get("state") == "COMPLETE" for _, state in states):
            print(f"Verified {len(rows)} complete screenshots in {metadata['screenshotDisplayType']}", flush=True)
            return
        time.sleep(5)
    raise RuntimeError("Screenshots uploaded; Apple has not finished processing them yet. Re-run to verify.")


if __name__ == "__main__":
    main()
