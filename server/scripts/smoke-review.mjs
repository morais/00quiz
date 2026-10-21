#!/usr/bin/env node
// Exercise only the dedicated synthetic review tenant. Never print credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { reviewAccessPath } from "./review-access.mjs";

const origin = "https://api.00quiz.com";
const { accessCode, tenantId } = JSON.parse(readFileSync(reviewAccessPath(), "utf8"));
const digest = x => createHash("sha256").update(x).digest("hex");
const hashes = [];
let app;
const post = (path, value, extra = {}) => fetch(origin + path, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", ...extra }, body: new URLSearchParams(value) });
const call = (path, token, method = "GET", value) => fetch(origin + path, { method,
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: value === undefined ? undefined : JSON.stringify(value) });
const hidden = (html, name) => {
  const value = html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
  assert.ok(value, `Missing ${name}`); return value;
};
try {
  assert.equal((await call("/v1/auth/review", null, "POST", { accessCode: "invalid" })).status, 401);
  const loginResponse = await call("/v1/auth/review", null, "POST", { accessCode });
  assert.equal(loginResponse.status, 201);
  const login = await loginResponse.json();
  assert.equal(login.tenant.id, tenantId); assert.equal(login.tenant.isReview, true);
  app = login.token; hashes.push(digest(app));
  let state = await (await call("/v1/review/reset", app, "POST")).json();
  assert.equal(state.quiz.questions.length, 5);
  assert.ok(state.quiz.questions.every(q => q.answer === null && q.correctIndex === null));
  assert.ok(state.history.length >= 3);
  const keys = [1, 2, 0, 3, 1];
  for (let i = 0; i < 5; i++) {
    const response = await call(`/v1/quizzes/${state.quiz.id}/answers`, app, "POST", { questionIndex: i, choiceIndex: i < 4 ? keys[i] : 0 });
    assert.equal(response.status, 200); state = await response.json();
  }
  assert.equal(state.quiz.completed, true); assert.equal(state.quiz.score, 4);
  assert.ok(state.quiz.questions.every(q => q.answer && q.correctIndex !== null && q.explanation));
  assert.equal((await call("/mcp", app, "POST", {})).status, 401);

  const callback = "https://review.example/quiz-callback", verifier = randomBytes(32).toString("base64url");
  const registration = await call("/oauth/register", null, "POST", { client_name: "00Quiz review smoke", redirect_uris: [callback] });
  assert.equal(registration.status, 201); const { client_id: clientId } = await registration.json();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code",
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"), resource: origin + "/mcp", scope: "quiz:read quiz:write" });
  const page = await (await fetch(origin + "/oauth/authorize?" + params)).text();
  const flow = hidden(page, "flow");
  const signedIn = await post("/auth/review/callback", { flow, accessCode }, { origin });
  assert.equal(signedIn.status, 303);
  const cookie = signedIn.headers.get("set-cookie").split(";", 1)[0];
  const consent = await fetch(signedIn.headers.get("location"), { headers: { cookie } });
  const csrf = hidden(await consent.text(), "csrf");
  const decision = await post("/oauth/consent", { flow, csrf, decision: "approve" }, { origin, cookie });
  assert.equal(decision.status, 303);
  const code = new URL(decision.headers.get("location")).searchParams.get("code");
  const exchange = await post("/oauth/token", { grant_type: "authorization_code", client_id: clientId, redirect_uri: callback,
    code, code_verifier: verifier, resource: origin + "/mcp" });
  assert.equal(exchange.status, 200); const { access_token: mcp } = await exchange.json(); hashes.push(digest(mcp));
  assert.equal((await call("/v1/snapshot", mcp)).status, 401);
  const response = await call("/mcp", mcp, "POST", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_quiz_context", arguments: {} } });
  assert.equal(response.status, 200); const context = (await response.json()).result.structuredContent;
  assert.equal(context.quiz.score, 4);
  const connections = (await (await call("/v1/account/mcp-connections", app)).json()).connections;
  assert.ok(connections.some(x => x.clientName.includes("review smoke")));
  console.log("PASS: native reviewer login, real quiz scoring, redacted answers, repeat testing, reviewer OAuth/PKCE/consent, MCP context and credential separation");
} finally {
  if (app) assert.equal((await call("/v1/review/reset", app, "POST")).status, 200);
  if (hashes.length) execFileSync("npx", ["wrangler", "d1", "execute", "00quiz", "--remote", "--command",
    `UPDATE credentials SET revoked_at='${new Date().toISOString()}' WHERE tenant_id='${tenantId}' AND token_hash IN (${hashes.map(x => `'${x}'`).join(",")})`],
    { cwd: new URL("../", import.meta.url), stdio: "ignore" });
  console.log("Restored today’s sample quiz and revoked the smoke-test grants.");
}
