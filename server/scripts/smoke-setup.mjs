// Isolated production setup checks. Fixture markers simulate persisted native
// evidence; real Apple authentication is covered by the backend tests.
// --capture-contract <file> saves only the public tool contract before release.
// --contract <file> compares that contract after release, byte for byte.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const origin = "https://api.00quiz.com";
const tenants = [randomUUID(), randomUUID()];
const app = `qq_app_${randomBytes(32).toString("base64url")}`;
const tokens = tenants.map(() => `qq_mcp_${randomBytes(32).toString("base64url")}`);
const digest = value => createHash("sha256").update(value).digest("hex");
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
const option = flag => { const index = process.argv.indexOf(flag); return index < 0 ? null : process.argv[index + 1]; };
function execute(statement) {
  execFileSync("npx", ["wrangler", "d1", "execute", "00quiz", "--remote", "--json", "--command", statement], { stdio: ["ignore", "pipe", "pipe"] });
}
let id = 0;
async function rpc(method, params, index = 0) {
  const response = await fetch(origin + "/mcp", { method: "POST", headers: {
    authorization: `Bearer ${tokens[index]}`, "content-type": "application/json",
  }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  assert.equal(response.status, 200);
  const value = await response.json(); assert.equal(value.error, undefined);
  return value.result;
}
async function tool(name, args = {}, index = 0) {
  const result = await rpc("tools/call", { name, arguments: args }, index);
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}
try {
  const now = new Date().toISOString(), expires = new Date(Date.now() + 20 * 60000).toISOString();
  execute(tenants.map((tenant, index) => `INSERT INTO tenants(id,created_at,updated_at) VALUES (${sql(tenant)},${sql(now)},${sql(now)});
    INSERT INTO credentials(token_hash,id,tenant_id,kind,audience,scopes,label,created_at,expires_at)
    VALUES (${sql(digest(tokens[index]))},${sql(randomUUID())},${sql(tenant)},'mcp',${sql(origin + "/mcp")},'quiz:read quiz:write','Setup smoke',${sql(now)},${sql(expires)});`).join("\n")
    + `INSERT INTO credentials(token_hash,id,tenant_id,kind,audience,scopes,label,created_at,expires_at)
      VALUES (${sql(digest(app))},${sql(randomUUID())},${sql(tenants[0])},'app',${sql(origin + "/v1")},'quiz:read quiz:write','Setup smoke',${sql(now)},${sql(expires)});`);
  const contract = JSON.stringify(await rpc("tools/list"));
  const capture = option("--capture-contract");
  if (capture) { writeFileSync(capture, contract); console.log(`Captured public tool contract (${digest(contract)}).`); }
  else {
    const baseline = option("--contract");
    if (baseline) assert.equal(contract, readFileSync(baseline, "utf8"), "Tool contract must remain unchanged");
    const context = await tool("get_quiz_context");
    assert.equal(context.setup.status, "unknown"); assert.equal(context.setup.optional, true);
    assert.equal(context.setup.appStoreURL, "https://apps.apple.com/app/id6823917960");
    assert.match(context.setup.instructions, /same Apple account/);
    assert.match(context.setup.instructions, /Keep the plugin connected/);
    const { setup, ...unchanged } = await tool("get_quiz_instructions", { knownVersion: context.agentInstructions.version });
    assert.deepEqual(unchanged, { version: context.agentInstructions.version, changed: false });
    assert.equal(setup.status, "unknown");
    const history = await tool("get_quiz_history", { limit: 3 });
    assert.deepEqual(history.history, []);
    assert.deepEqual(history.setup.recheck, { tool: "get_quiz_history", arguments: { limit: 3 } });
    // Optional guidance never blocks a requested write or changes its response.
    assert.deepEqual(await tool("update_quiz_preferences", { language: "Portuguese" }),
      { interests: [], language: "Portuguese", difficulty: null, timeZone: "UTC" });
    assert.equal((await tool("get_quiz_context")).setup.status, "unknown");
    execute(`DELETE FROM preferences WHERE tenant_id=${sql(tenants[0])}; UPDATE tenants SET first_native_sign_in_at=${sql(now)} WHERE id=${sql(tenants[0])};`);
    assert.equal((await tool("get_quiz_context")).setup.status, "finish_setup");
    const response = await fetch(origin + "/v1/preferences", { method: "PATCH", headers: {
      authorization: `Bearer ${app}`, "content-type": "application/json",
    }, body: JSON.stringify({}) });
    assert.equal(response.status, 200);
    const ready = await tool("get_quiz_context"); assert.deepEqual(ready.setup, { status: "ready" });
    assert.deepEqual(ready.preferences, context.preferences);
    const other = await tool("get_quiz_context", {}, 1);
    assert.equal(other.setup.status, "unknown"); assert.equal(other.quiz, null);
    for (const name of ["get_quiz_instructions", "get_quiz_history"]) assert.deepEqual((await tool(name)).setup, { status: "ready" });
    console.log("PASS: unchanged tool contract, optional guidance, preserved data/writes, same-connection setup transitions, and account isolation.");
  }
} finally {
  execute(`DELETE FROM tenants WHERE id IN (${tenants.map(sql).join(",")});`);
  console.log("Removed both isolated setup accounts and their credentials.");
}
