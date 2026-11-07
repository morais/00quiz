import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migratedD1, migrationsDir } from "./d1";
import { accountSetup } from "../src/setup";
import { findOrCreateTenant, issueCredential, issueNativeAppCredential, type Principal } from "../src/auth";
import { agentContext, preferences, publishPack, snapshot, updatePreferences, type Env } from "../src/api";
import { routeMcp } from "../src/mcp";
import { ensureReviewFixture, reviewQuestions } from "../src/review";
import { agentInstructions } from "../src/agentInstructions";

const handles: Array<{ close(): void }> = [];
afterEach(() => { vi.restoreAllMocks(); for (const db of handles.splice(0)) db.close(); });
function fixture(before?: string) {
  const { db, d1 } = migratedD1(before); handles.push(db);
  for (const id of ["one", "two", "review"]) db.prepare(`INSERT INTO tenants
    (id, apple_subject, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, id === "review" ? null : `apple-${id}`, `${id}@private.example`, "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  return { db, env: { DB: d1, PUBLIC_ORIGIN: "https://api.00quiz.com", REVIEW_TENANT_IDS: "review" } as Env };
}
const principal: Principal = { tenantId: "one", kind: "mcp", scopes: ["quiz:read", "quiz:write"], tokenHash: "test" };
async function call(env: Env, name: string, args = {}, tenantId = "one") {
  const response = await routeMcp(new Request(`${env.PUBLIC_ORIGIN}/mcp`, { method: "POST", body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args },
  }) }), env, { ...principal, tenantId });
  const { result } = await response.json() as { result: { structuredContent: Record<string, any>; content: { text: string }[]; isError?: boolean } };
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  return result;
}
const marker = (db: ReturnType<typeof fixture>["db"], id = "one") =>
  (db.prepare("SELECT first_native_sign_in_at AS value FROM tenants WHERE id = ?").get(id) as { value: string | null }).value;

describe("native setup evidence", () => {
  it("backfills earliest retained native evidence only, including revoked and expired logins", async () => {
    const { db, env } = fixture("0005_native_sign_in.sql");
    await issueCredential(env, "one", "app", "iOS app");
    db.exec("UPDATE credentials SET created_at='2026-10-02T00:00:00.000Z', expires_at='2026-10-03T00:00:00.000Z', revoked_at='2026-10-03T00:00:00.000Z'");
    await issueCredential(env, "one", "app", "iOS app");
    await issueCredential(env, "two", "mcp", "iOS app");
    await issueCredential(env, "two", "app", "Operator fixture");
    await issueCredential(env, "review", "app", "iOS app");
    await issueCredential(env, "two", "app", "iOS app");
    db.exec("UPDATE credentials SET created_at='invalid' WHERE tenant_id='two' AND kind='app' AND label='iOS app'");
    await updatePreferences(env, "two", { interests: ["History"] });
    db.exec(readFileSync(join(migrationsDir, "0005_native_sign_in.sql"), "utf8"));
    expect(marker(db)).toBe("2026-10-02T00:00:00.000Z");
    expect(marker(db, "two")).toBeNull();
    expect(marker(db, "review")).toBeNull();
    expect(await accountSetup(env, "two", "get_quiz_context", {})).toMatchObject({ status: "unknown" });
  });

  it("keeps plugin/dashboard sign-ins and generic app credentials unknown; native login is immutable and isolated", async () => {
    const { db, env } = fixture();
    for (const source of ["mcp", "dashboard"] as const) {
      const tenant = await findOrCreateTenant(env, "apple-one", null, { source });
      expect(tenant.id).toBe("one"); expect(marker(db)).toBeNull();
    }
    await issueCredential(env, "one", "app", "Operator");
    await updatePreferences(env, "one", { language: "Portuguese" });
    expect((await accountSetup(env, "one", "get_quiz_context", {})).status).toBe("unknown");
    await issueNativeAppCredential(env, "one", "Europe/Lisbon");
    const first = marker(db); expect(first).toBeTruthy();
    await issueNativeAppCredential(env, "one", "Asia/Tokyo");
    expect(marker(db)).toBe(first); expect(marker(db, "two")).toBeNull();
    expect((await accountSetup(env, "one", "get_quiz_context", {})).status).toBe("ready");
    expect((await accountSetup(env, "two", "get_quiz_context", {})).status).toBe("unknown");
    expect((await preferences(env, "one")).language).toBe("Portuguese");
    db.exec("DELETE FROM credentials WHERE tenant_id='one'");
    expect(marker(db)).toBe(first);
  });

  it("rolls back preferences and credentials when recording the marker fails", async () => {
    const { db, env } = fixture();
    db.exec("CREATE TRIGGER reject_marker BEFORE UPDATE OF first_native_sign_in_at ON tenants BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(issueNativeAppCredential(env, "one", "Europe/Lisbon")).rejects.toThrow("test failure");
    expect(marker(db)).toBeNull();
    for (const table of ["preferences", "credentials"]) expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toMatchObject({ n: 0 });
  });

  it("rechecks unknown → finish_setup → ready without a new connection or required preference selections", async () => {
    const { db, env } = fixture();
    const read = async () => (await call(env, "get_quiz_context")).structuredContent.setup;
    const unknown = await read();
    expect(unknown).toMatchObject({ status: "unknown", optional: true, question: expect.any(String),
      appStoreURL: "https://apps.apple.com/app/id6823917960", recheck: { tool: "get_quiz_context", arguments: {} } });
    expect(unknown.instructions).toContain("same Apple account");
    expect(unknown.instructions).toContain("Keep the plugin connected");
    expect(JSON.stringify(unknown)).not.toMatch(/private\.example|apple-one|first_native_sign_in_at/);
    db.exec("UPDATE tenants SET first_native_sign_in_at='2026-10-02T00:00:00.000Z' WHERE id='one'");
    expect(await read()).toMatchObject({ status: "finish_setup", optional: true });
    await issueNativeAppCredential(env, "one", "Europe/Lisbon");
    expect(await read()).toEqual({ status: "ready" });
    expect(await preferences(env, "one")).toEqual({ interests: [], language: null, difficulty: null, timeZone: "Europe/Lisbon" });
  });

  it("recognizes only prepared allowlisted synthetic reviewers, without inventing native evidence", async () => {
    const { db, env } = fixture();
    expect((await accountSetup(env, "review", "get_quiz_context", {})).status).toBe("unknown");
    await ensureReviewFixture(env, "review");
    expect((await call(env, "get_quiz_context", {}, "review")).structuredContent.setup).toEqual({ status: "ready" });
    expect(marker(db, "review")).toBeNull();
    env.REVIEW_TENANT_IDS = "one";
    expect((await accountSetup(env, "review", "get_quiz_context", {})).status).toBe("unknown");
    await updatePreferences(env, "one", {});
    await publishPack(env, "one", { day: new Date().toISOString().slice(0, 10), title: "Test", hostMessage: "Hello", questions: reviewQuestions });
    expect((await accountSetup(env, "one", "get_quiz_context", {})).status).toBe("unknown");
  });

  it("adds guidance alongside preserved read data and leaves writes usable before native setup", async () => {
    const { env } = fixture();
    await updatePreferences(env, "one", { interests: ["Nature"] });
    const published = await call(env, "publish_daily_quiz", { day: new Date().toISOString().slice(0, 10),
      title: "Today's quiz", hostMessage: "Hello", questions: reviewQuestions });
    expect(published.isError).toBeUndefined(); expect(published.structuredContent.setup).toBeUndefined();
    const context = (await call(env, "get_quiz_context")).structuredContent;
    const { setup, ...data } = context;
    expect(data).toEqual(JSON.parse(JSON.stringify(await agentContext(env, "one"))));
    expect(setup.status).toBe("unknown");
    const { setup: historySetup, ...history } = (await call(env, "get_quiz_history", { limit: 3 })).structuredContent;
    const state = await snapshot(env, "one");
    expect(history).toEqual({ today: state.today, history: state.history.slice(0, 3) });
    expect(historySetup.recheck).toEqual({ tool: "get_quiz_history", arguments: { limit: 3 } });
    const guidance = await agentInstructions();
    const { setup: instructionsSetup, ...unchanged } = (await call(env, "get_quiz_instructions", { knownVersion: guidance.version })).structuredContent;
    expect(unchanged).toEqual({ version: guidance.version, changed: false });
    expect(instructionsSetup.status).toBe("unknown");
    expect((await call(env, "get_quiz_context", {}, "two")).structuredContent.quiz).toBeNull();
  });
});
