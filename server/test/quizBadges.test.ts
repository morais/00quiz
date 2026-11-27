import { afterEach, describe, expect, it, vi } from "vitest";
import { publishPack, submitAnswer, updatePreferences, type Env } from "../src/api";
import { issueCredential, sha256Hex, type Principal } from "../src/auth";
import { deliverQuizBadges, nextQuizDay, pendingQuizBadge, QuizBadgeDelivery, routeQuizBadgeDevice } from "../src/quizBadges";
import worker from "../src/index";
import { migratedD1 } from "./d1";
const now = new Date("2026-11-27T12:00:00Z"), origin = "https://api.example.com";
const databases: Array<{ close(): void }> = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup() {
  const { db, d1 } = migratedD1(); databases.push(db);
  for (const id of ["one", "two"]) db.prepare("INSERT INTO tenants (id, created_at, updated_at) VALUES (?, ?, ?)").run(id, now.toISOString(), now.toISOString());
  const env: Env = { DB: d1, PUBLIC_ORIGIN: origin, APPLE_TEAM_ID: "TEAM", APPLE_APP_CLIENT_ID: "com.example.quiz", APNS_KEY_ID: "KEY", QUIZ_BADGES: {} as DurableObjectNamespace };
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  env.APNS_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", key.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const app = await issueCredential(env, "one", "app", "iPhone");
  const principal: Principal = { tenantId: "one", kind: "app", tokenHash: await sha256Hex(app.token), scopes: ["quiz:read", "quiz:write"] };
  return { db, env, principal };
}
const request = (enabled = true, extra = {}) => new Request(origin + "/v1/account/quiz-badge-device", { method: "PUT", body: JSON.stringify({ installationId: "2f1e9594-0000-4000-8000-000000000001", deviceToken: "ab".repeat(32), environment: "production", enabled, ...extra }) });
async function pack(env: Env, day = "2026-11-27") {
  return publishPack(env, "one", { day, title: "Today's show", hostMessage: "Welcome!", questions: Array.from({ length: 5 }, (_, i) => ({ prompt: `Question ${i}`, topic: "Space", choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "A is right." })) }, now);
}
async function complete(env: Env, id: string) {
  for (let i = 0; i < 5; i++) await submitAnswer(env, "one", id, { questionIndex: i, choiceIndex: 3 }, now);
}
function pushes() {
  const sent: Array<{ badge: number; headers: Headers }> = [];
  const fetcher = vi.fn(async (_url: unknown, input?: RequestInit) => {
    sent.push({ badge: JSON.parse(String(input?.body)).aps.badge, headers: new Headers(input?.headers) });
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher); return { sent, fetcher };
}
describe("optional quiz badges", () => {
  it("is off by default; counts only today's unfinished quiz and respects account/timezone", async () => {
    const { env, db } = await setup();
    expect(db.prepare("SELECT * FROM quiz_badge_devices").all()).toEqual([]);
    expect(await pendingQuizBadge(env, "one", now)).toBe(0);
    await pack(env, "2026-11-28"); expect(await pendingQuizBadge(env, "one", now)).toBe(0);
    const quiz = await pack(env); expect(await pendingQuizBadge(env, "one", now)).toBe(1);
    expect(await pendingQuizBadge(env, "two", now)).toBe(0);
    for (let i = 0; i < 4; i++) await submitAnswer(env, "one", quiz.id, { questionIndex: i, choiceIndex: 3 }, now);
    expect(await pendingQuizBadge(env, "one", now)).toBe(1);
    await submitAnswer(env, "one", quiz.id, { questionIndex: 4, choiceIndex: 3 }, now);
    expect(await pendingQuizBadge(env, "one", now)).toBe(0);
    expect(await pendingQuizBadge(env, "one", new Date("2026-11-28T00:01Z"))).toBe(1);
    expect(await pendingQuizBadge(env, "one", new Date("2026-11-29T00:01Z"))).toBe(0);
    await updatePreferences(env, "one", { timeZone: "Pacific/Honolulu" });
    expect(await pendingQuizBadge(env, "one", new Date("2026-11-28T09:59Z"))).toBe(0);
    expect(await pendingQuizBadge(env, "one", new Date("2026-11-28T10:01Z"))).toBe(1);
    expect(Math.abs(nextQuizDay(new Date("2026-03-08T05:01Z"), "America/New_York") - Date.parse("2026-03-09T04:00Z"))).toBeLessThan(1000);
  });
  it("requires app authorization and configured delivery; rechecks revoked credentials", async () => {
    const { env, principal, db } = await setup();
    expect((await routeQuizBadgeDevice(request(), env, { ...principal, kind: "mcp" })).status).toBe(403);
    expect((await routeQuizBadgeDevice(request(true, { environment: "development" }), env, principal)).status).toBe(503);
    const mcp = await issueCredential(env, "one", "mcp", "Agent");
    const req = request(); req.headers.set("authorization", `Bearer ${mcp.token}`);
    expect((await worker.fetch(req, env, {} as ExecutionContext)).status).toBe(401);
    expect((await routeQuizBadgeDevice(request(), env, principal)).status).toBe(200);
    db.prepare("UPDATE credentials SET revoked_at = ? WHERE token_hash = ?").run(now.toISOString(), principal.tokenHash);
    expect((await routeQuizBadgeDevice(request(), env, principal)).status).toBe(401);
  });
  it("sends badge-only updates, deduplicates, retries failures and clears after all five answers", async () => {
    const { env, principal, db } = await setup(); const quiz = await pack(env);
    await routeQuizBadgeDevice(request(), env, principal); const { sent, fetcher } = pushes();
    await deliverQuizBadges(env, "one", now); await deliverQuizBadges(env, "one", now);
    expect(sent.map(p => p.badge)).toEqual([1]);
    expect(sent[0].headers.get("apns-push-type")).toBe("alert");
    expect(sent[0].headers.get("apns-topic")).toBe("com.example.quiz");
    expect(Number(sent[0].headers.get("apns-expiration"))).toBeLessThanOrEqual(Date.parse("2026-11-28T00:00:01Z") / 1000);
    await complete(env, quiz.id); fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await deliverQuizBadges(env, "one", now);
    expect(db.prepare("SELECT last_badge FROM quiz_badge_devices").get()).toMatchObject({ last_badge: 1 });
    await deliverQuizBadges(env, "one", now); expect(sent.at(-1)?.badge).toBe(0);
    expect(db.prepare("SELECT last_badge FROM quiz_badge_devices").get()).toMatchObject({ last_badge: 0 });
  });
  it("clears disabled/revoked devices, removes invalid tokens, transfers ownership and cascades deletion", async () => {
    const { env, principal, db } = await setup(); await pack(env); const { sent, fetcher } = pushes();
    await routeQuizBadgeDevice(request(), env, principal); await deliverQuizBadges(env, "one", now);
    await routeQuizBadgeDevice(request(false), env, principal); await deliverQuizBadges(env, "one", now);
    expect(sent.map(p => p.badge)).toEqual([1, 0]); expect(db.prepare("SELECT * FROM quiz_badge_devices").all()).toEqual([]);
    await routeQuizBadgeDevice(request(), env, principal);
    db.prepare("UPDATE credentials SET revoked_at = ? WHERE token_hash = ?").run(now.toISOString(), principal.tokenHash);
    await deliverQuizBadges(env, "one", now); expect(sent.at(-1)?.badge).toBe(0);
    db.prepare("UPDATE credentials SET revoked_at = NULL WHERE token_hash = ?").run(principal.tokenHash);
    await routeQuizBadgeDevice(request(), env, principal);
    fetcher.mockResolvedValueOnce(Response.json({ reason: "BadDeviceToken" }, { status: 400 }));
    await deliverQuizBadges(env, "one", now); expect(db.prepare("SELECT * FROM quiz_badge_devices").all()).toEqual([]);
    await routeQuizBadgeDevice(request(), env, principal);
    const other = await issueCredential(env, "two", "app", "Other device");
    await routeQuizBadgeDevice(request(), env, { ...principal, tenantId: "two", tokenHash: await sha256Hex(other.token) });
    expect(db.prepare("SELECT tenant_id FROM quiz_badge_devices").all()).toEqual([{ tenant_id: "two" }]);
    db.prepare("DELETE FROM tenants WHERE id = 'two'").run(); expect(db.prepare("SELECT * FROM quiz_badge_devices").all()).toEqual([]);
  });
  it("serializes pending and completed pushes and refreshes badges on a new day", async () => {
    const { env, principal } = await setup(); const quiz = await pack(env); await pack(env, "2026-11-28");
    await routeQuizBadgeDevice(request(), env, principal);
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; }), inFlight = new Promise<void>(resolve => { started = resolve; });
    const { sent, fetcher } = pushes();
    fetcher.mockImplementationOnce(async (_url, input) => {
      sent.push({ badge: JSON.parse(String(input?.body)).aps.badge, headers: new Headers(input?.headers) });
      started(); await waiting; return new Response(null, { status: 200 });
    });
    vi.useFakeTimers(); vi.setSystemTime(now);
    const lane = new QuizBadgeDelivery({} as DurableObjectState, env);
    const first = lane.fetch(new Request("https://badge.internal/sync", { method: "POST", body: "one" }));
    await inFlight; await complete(env, quiz.id);
    const second = lane.fetch(new Request("https://badge.internal/sync", { method: "POST", body: "one" }));
    release(); await Promise.all([first, second]); expect(sent.map(p => p.badge)).toEqual([1, 0]);
    await deliverQuizBadges(env, "one", new Date("2026-11-28T00:01Z")); expect(sent.map(p => p.badge)).toEqual([1, 0, 1]);
  });
});
