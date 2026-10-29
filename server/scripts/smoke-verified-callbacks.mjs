#!/usr/bin/env node
// Check production consent badges using only the dedicated synthetic reviewer.
// Deny every flow: no authorization codes or app/MCP access tokens are issued.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { reviewAccessPath } from "./review-access.mjs";

const origin = "https://api.00quiz.com";
const { accessCode } = JSON.parse(readFileSync(reviewAccessPath({ plugin: true }), "utf8"));
const callbacks = [
  ["https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT"],
  ["https://claude.ai/api/mcp/auth_callback", "Claude"],
  ["https://claude.com/api/mcp/auth_callback", "Claude"],
  ["https://chatgpt.com.evil.example/connector_platform_oauth_redirect", null],
];
async function request(path, options = {}) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, "Smoke test must never follow an external callback");
  let response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (response.status === 429) {
    console.log("Waiting for the production authentication rate-limit window.");
    await setTimeout(60000);
    response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(15000) });
  }
  return response;
}
const post = (path, body, headers = {}) => request(path, { method: "POST", headers: {
  "content-type": "application/x-www-form-urlencoded", origin, ...headers,
}, body: new URLSearchParams(body) });
const hidden = (html, name) => {
  const value = html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
  assert.ok(value, `Missing ${name}`);
  return value;
};

for (const [callback, name] of callbacks) {
  const verifier = randomBytes(32).toString("base64url");
  const registration = await request("/oauth/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Callback badge smoke test", redirect_uris: [callback] }) });
  assert.equal(registration.status, 201, "Client registration");
  const { client_id } = await registration.json();
  const params = new URLSearchParams({ client_id, redirect_uri: callback, response_type: "code",
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    resource: origin + "/mcp", scope: "quiz:read" });
  const start = await request("/oauth/authorize?" + params);
  assert.equal(start.status, 200, "Reviewer sign-in entry");
  const flow = hidden(await start.text(), "flow");
  const signedIn = await post("/auth/review/callback", { flow, accessCode });
  assert.equal(signedIn.status, 303, "Synthetic reviewer sign-in");
  const cookie = signedIn.headers.get("set-cookie").split(";", 1)[0];
  const consent = await request(signedIn.headers.get("location"), { headers: { cookie } });
  assert.equal(consent.status, 200, "Consent screen");
  const page = await consent.text();
  const csrf = hidden(page, "csrf");
  try {
    if (name) {
      assert.ok(page.includes("Verified client"), "Official callback should be recognized");
      assert.ok(!page.includes("Unverified client"));
      assert.ok(page.includes(`Connect ${name} to 00Quiz?`), "Use server-owned name, not registration name");
    } else {
      assert.ok(page.includes("Unverified client"), "Lookalike domain must stay unverified");
    }
  } finally {
    const denied = await post("/oauth/consent", { flow, csrf, decision: "deny" }, { cookie });
    assert.equal(denied.status, 303, "Delete the test flow without granting access");
    const redirect = new URL(denied.headers.get("location"));
    assert.equal(redirect.searchParams.get("error"), "access_denied");
    assert.equal(redirect.searchParams.get("iss"), origin);
    assert.equal(redirect.searchParams.has("code"), false);
  }
  console.log(`PASS: ${callback} → ${name ?? "unverified"}; test flow denied and removed.`);
}
