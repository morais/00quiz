// Isolated synthetic account and invalid token: no human device is notified.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const origin = "https://api.00quiz.com", tenant = randomUUID(), installationId = randomUUID();
const tokens = { app: `qq_app_${randomBytes(32).toString("base64url")}`, mcp: `qq_mcp_${randomBytes(32).toString("base64url")}` };
const now = new Date().toISOString(), expiry = new Date(Date.now() + 15 * 60000).toISOString();
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "00quiz", "--remote", "--json", "--command", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}
async function register(kind, environment, enabled) {
  const response = await fetch(origin + "/v1/account/quiz-badge-device", { method: "PUT", headers: { Authorization: `Bearer ${tokens[kind]}`, "Content-Type": "application/json" }, body: JSON.stringify({ installationId, deviceToken: "a1".repeat(32), environment, enabled }) });
  return { status: response.status, value: await response.json() };
}
try {
  execute(`INSERT INTO tenants(id,created_at,updated_at) VALUES (${sql(tenant)},${sql(now)},${sql(now)});` + Object.entries(tokens).map(([kind, token]) => `INSERT INTO credentials(token_hash,id,tenant_id,kind,audience,scopes,label,created_at,expires_at) VALUES (${sql(createHash("sha256").update(token).digest("hex"))},${sql(randomUUID())},${sql(tenant)},${sql(kind)},${sql(origin + (kind === "app" ? "/v1" : "/mcp"))},'quiz:read quiz:write','Synthetic badge smoke',${sql(now)},${sql(expiry)});`).join(""));
  assert.equal(execute(`SELECT COUNT(*) AS n FROM quiz_badge_devices WHERE tenant_id=${sql(tenant)}`)[0].results[0].n, 0);
  assert.equal((await register("mcp", "production", true)).status, 401);
  assert.equal((await register("app", "development", true)).status, 503);
  assert.equal((await register("app", "production", true)).status, 200);
  let removed = false;
  for (let i = 0; i < 8; i++) {
    const count = execute(`SELECT COUNT(*) AS n FROM quiz_badge_devices WHERE tenant_id=${sql(tenant)}`)[0].results[0].n;
    if (!count) { removed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  assert.ok(removed, "APNs must prune this invalid device; authentication/transport failures retain it for retry");
  assert.equal((await register("app", "production", false)).status, 200);
  console.log("PASS: opt-in registration, app/MCP isolation, unavailable debug rejection, live production APNs invalid-token cleanup and opt-out.");
} finally {
  execute(`DELETE FROM tenants WHERE id=${sql(tenant)}`);
  console.log("Removed the isolated badge smoke account and registrations.");
}
