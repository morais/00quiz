#!/usr/bin/env python3
"""Assign one processed 00Quiz build to an existing internal TestFlight group.

Reads the App Store Connect API key and issuer ID from ~/.appstoreconnect.
Pass --app-id, --group-id, and --build explicitly; no account IDs are committed.
"""

import argparse
import base64
import glob
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.appstoreconnect.apple.com"


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def der_to_raw(der):
    index = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    parts = []
    for _ in range(2):
        length = der[index + 1]
        parts.append(der[index + 2:index + 2 + length].lstrip(b"\0").rjust(32, b"\0"))
        index += 2 + length
    return b"".join(parts)


def authorization():
    credential_root = pathlib.Path.home() / ".appstoreconnect"
    candidates = glob.glob(str(credential_root / "private_keys" / "AuthKey_*.p8"))
    configured_key = os.environ.get("ASC_KEY_PATH")
    if not configured_key and len(candidates) != 1:
        sys.exit("Set ASC_KEY_PATH to the App Store Connect API key (the folder has multiple keys)")
    key = pathlib.Path(configured_key or candidates[0])
    issuer_path = credential_root / "issuer_id"
    if not key.is_file() or not issuer_path.is_file():
        sys.exit("App Store Connect API credentials are missing")
    key_id = os.environ.get("ASC_KEY_ID", key.stem.removeprefix("AuthKey_"))
    issuer_id = os.environ.get("ASC_ISSUER_ID", issuer_path.read_text().strip())
    now = int(time.time())
    header = b64url(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
    payload = b64url(json.dumps({"iss": issuer_id, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}).encode())
    signing_input = header + b"." + payload
    signature_der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(key)],
                                   input=signing_input, capture_output=True, check=True).stdout
    return (signing_input + b"." + b64url(der_to_raw(signature_der))).decode()


def request(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + authorization(),
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response) if response.status != 204 else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            detail = json.loads(raw)
        except ValueError:
            detail = {"error": raw}
        return error.code, detail


def require_ok(status, result, action):
    if status < 200 or status >= 300:
        detail = "; ".join(item.get("detail", "") for item in result.get("errors", []))
        sys.exit(f"{action} failed ({status}): {detail or result}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Call Apple API without exposing credentials")
    parser.add_argument("method")
    parser.add_argument("path")
    parser.add_argument("--body-file")
    args = parser.parse_args()
    body = json.loads(pathlib.Path(args.body_file).read_text()) if args.body_file else None
    status, result = request(args.method, args.path, body)
    print(json.dumps({"status": status, "result": result}, indent=2))
