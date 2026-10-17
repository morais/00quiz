// An isolated synthetic account exercises the deployed REST/MCP contract.
// Only hashed, short-lived credentials enter D1. Raw credentials remain in
// this process, and cascading cleanup removes the fixture on completion.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const origin = "https://api.00quiz.com", tenant = randomUUID();
const app = `qq_app_${randomBytes(32).toString("base64url")}`;
const mcp = `qq_mcp_${randomBytes(32).toString("base64url")}`;
const now = new Date(), expires = new Date(now.getTime() + 20 * 60000).toISOString();
const digest = token => createHash("sha256").update(token).digest("hex");
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return execFileSync("npx", ["wrangler", "d1", "execute", "00quiz", "--remote", "--json", "--command", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
async function call(path, token, method = "GET", value) {
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: value ? JSON.stringify(value) : undefined });
  return { status: response.status, value: await response.json() };
}
let requestID = 0;
const tool = async (name, args = {}) => call("/mcp", mcp, "POST", { jsonrpc: "2.0", id: ++requestID, method: "tools/call", params: { name, arguments: args } });
try {
  const guidanceResponse = await fetch(origin + "/agent-instructions");
  assert.equal(guidanceResponse.status, 200);
  const guidance = await guidanceResponse.json();
  assert.match(guidance.version, /^[a-f0-9]{64}$/);
  const validator = guidanceResponse.headers.get("etag"); assert.ok(validator);
  const check = await fetch(origin + "/agent-instructions", { method: "HEAD", headers: { "If-None-Match": validator } });
  assert.equal(check.status, 304);
  execute(`INSERT INTO tenants(id,created_at,updated_at) VALUES (${sql(tenant)},${sql(now.toISOString())},${sql(now.toISOString())});` +
    [["app", app], ["mcp", mcp]].map(([kind, token]) => `INSERT INTO credentials(token_hash,id,tenant_id,kind,audience,scopes,label,created_at,expires_at) VALUES (${sql(digest(token))},${sql(randomUUID())},${sql(tenant)},${sql(kind)},${sql(origin + (kind === "app" ? "/v1" : "/mcp"))},'quiz:read quiz:write','Isolated deployment smoke',${sql(now.toISOString())},${sql(expires)});`).join(""));
  assert.equal((await call("/v1/snapshot", mcp)).status, 401);
  assert.equal((await call("/mcp", app, "POST", {})).status, 401);
  assert.equal((await call("/v1/preferences", app, "PATCH", { timeZone: "Europe/Lisbon" })).status, 200);
  const context = await tool("get_quiz_context"); assert.equal(context.status, 200);
  assert.equal(context.value.result.structuredContent.agentInstructions.version, guidance.version);
  const guidanceTool = (await tool("get_quiz_instructions")).value.result.structuredContent;
  assert.equal(guidanceTool.version, guidance.version);
  assert.equal(guidanceTool.instructions, guidance.instructions);
  assert.deepEqual((await tool("get_quiz_instructions", { knownVersion: guidance.version })).value.result.structuredContent,
    { version: guidance.version, changed: false });
  const day = context.value.result.structuredContent.today;
  const input = { day, title: "Deployment check", hostMessage: "A private synthetic test quiz.", questions: Array.from({ length: 5 }, (_, i) => ({ prompt: `Synthetic check ${i + 1}: choose option A.`, topic: "Smoke test", choices: ["Option A", "Option B", "Option C", "Option D"], correctIndex: 0, explanation: "Option A is correct for this synthetic check." })) };
  const published = await tool("publish_daily_quiz", input);
  assert.equal(published.value.result.isError, undefined);
  const id = published.value.result.structuredContent.id;
  assert.equal((await tool("publish_daily_quiz", input)).value.result.structuredContent.id, id);
  const initial = (await call("/v1/snapshot", app)).value;
  assert.equal(initial.quiz.questions.length, 5);
  assert.ok(initial.quiz.questions.every(q => q.correctIndex === null && q.explanation === null));
  for (let i = 0; i < 5; i++) {
    const answer = await call(`/v1/quizzes/${id}/answers`, app, "POST", { questionIndex: i, choiceIndex: i === 4 ? 1 : 0 });
    assert.equal(answer.status, 200);
    assert.equal(answer.value.quiz.questions[i].correctIndex, 0);
  }
  assert.equal((await call(`/v1/quizzes/${id}/answers`, app, "POST", { questionIndex: 0, choiceIndex: 1 })).status, 409);
  const final = (await call("/v1/snapshot", app)).value;
  assert.equal(final.quiz.score, 4); assert.equal(final.quiz.completed, true); assert.equal(final.streak.current, 1);
  const feedback = (await tool("get_quiz_context")).value.result.structuredContent;
  assert.deepEqual(feedback.topics["Smoke test"], { answered: 5, correct: 4 });
  const registration = await fetch(origin + "/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "00Quiz deployment check", redirect_uris: ["https://example.com/quiz-callback"] }) });
  assert.equal(registration.status, 201);
  const client = await registration.json();
  const authorize = new URL(origin + "/oauth/authorize");
  authorize.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: "https://example.com/quiz-callback", response_type: "code", code_challenge_method: "S256", code_challenge: "A".repeat(43), resource: origin + "/mcp", scope: "quiz:read quiz:write" });
  const redirect = await fetch(authorize, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  const destination = new URL(redirect.headers.get("location"));
  assert.equal(destination.origin, "https://appleid.apple.com");
  assert.equal(destination.searchParams.get("client_id"), "com.00quiz.web");
  console.log("PASS: versioned guidance, HTTP 304, compact MCP change check, REST/MCP isolation, publish/retry, scoring, streaks, agent feedback, and OAuth-to-Apple redirect.");
} finally {
  execute(`DELETE FROM tenants WHERE id=${sql(tenant)};`);
  console.log("Removed the synthetic deployment account and all quiz/credential data.");
}
