import { afterEach, describe, expect, it, vi } from "vitest";
import { migratedD1 } from "./d1";
import { ensureReviewFixture, resetReviewQuiz, signInForReview } from "../src/review";
import { authenticate, sha256Hex, type Principal } from "../src/auth";
import { publishPack, snapshot, submitAnswer, type Env } from "../src/api";
import { reviewTenantForAccessCode } from "../src/oauth";

const handles: Array<{ close(): void }> = [];
afterEach(() => { vi.useRealTimers(); for (const db of handles.splice(0)) db.close(); });
const code = "qq_review_" + "A".repeat(43);
const request = (value = code) => new Request("https://api.00quiz.com/v1/auth/review", { method: "POST", body: JSON.stringify({ accessCode: value }) });

async function setup() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  const { db, d1 } = migratedD1(); handles.push(db);
  db.exec("INSERT INTO tenants(id,created_at,updated_at) VALUES ('review','now','now'); INSERT INTO tenants(id,apple_subject,created_at,updated_at) VALUES ('real','apple-subject','now','now')");
  db.prepare("INSERT INTO review_credentials(token_hash,tenant_id,expires_at) VALUES (?,?,?)").run(await sha256Hex(code), "review", "2027-10-17T12:00:00Z");
  const env: Env = { DB: d1, PUBLIC_ORIGIN: "https://api.00quiz.com", REVIEW_TENANT_IDS: "review" };
  return { db, env };
}

describe("dedicated App Review account", () => {
  it("is disabled without configuration and rejects invalid, expired, revoked and unallowlisted codes", async () => {
    const { db, env } = await setup();
    expect((await signInForReview(request(), { ...env, REVIEW_TENANT_IDS: undefined })).status).toBe(404);
    expect((await signInForReview(request("invalid"), env)).status).toBe(401);
    expect((await signInForReview(request(), { ...env, REVIEW_TENANT_IDS: "other" })).status).toBe(401);
    db.exec("UPDATE review_credentials SET revoked_at='revoked'");
    expect((await signInForReview(request(), env)).status).toBe(401);
    db.exec("UPDATE review_credentials SET revoked_at=NULL, expires_at='2026-01-01T00:00:00Z'");
    expect((await signInForReview(request(), env)).status).toBe(401);
    expect(db.prepare("SELECT COUNT(*) AS count FROM credentials").get()).toMatchObject({ count: 0 });
  });
  it("issues an app-only credential with fresh redacted questions and sample history", async () => {
    const { env } = await setup();
    const response = await signInForReview(request(), env);
    expect(response.status).toBe(201);
    const login = await response.json() as { token: string; tenant: { id: string; isReview: boolean } };
    expect(login.tenant).toEqual({ id: "review", isReview: true });
    const authorized = new Request("https://api.00quiz.com/v1/snapshot", { headers: { Authorization: `Bearer ${login.token}` } });
    expect((await authenticate(authorized, env, "app"))?.tenantId).toBe("review");
    expect(await authenticate(authorized, env, "mcp")).toBeNull();
    const state = await snapshot(env, "review");
    expect(state.quiz?.questions).toHaveLength(5);
    expect(state.quiz?.questions.every(q => q.correctIndex === null && q.explanation === null && q.answer === null)).toBe(true);
    expect(state.history).toHaveLength(3); expect(state.streak.current).toBe(3);
  });
  it("preserves answers on refresh, supports repeat testing and creates a fresh next day", async () => {
    const { env } = await setup();
    await ensureReviewFixture(env, "review");
    const state = await snapshot(env, "review"), id = state.quiz!.id;
    await submitAnswer(env, "review", id, { questionIndex: 0, choiceIndex: 1 });
    await ensureReviewFixture(env, "review");
    expect((await snapshot(env, "review")).quiz?.score).toBe(1);
    const principal: Principal = { tenantId: "review", kind: "app", tokenHash: "test", scopes: ["quiz:read", "quiz:write"] };
    expect((await resetReviewQuiz(env, principal)).status).toBe(200);
    expect((await snapshot(env, "review")).quiz?.questions.every(q => q.answer === null)).toBe(true);
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    await ensureReviewFixture(env, "review");
    expect((await snapshot(env, "review")).quiz?.day).toBe("2026-10-18");
  });
  it("cannot seed, reset or sign into a real Apple account even if misconfigured", async () => {
    const { db, env } = await setup(); env.REVIEW_TENANT_IDS = "review,real";
    db.exec("UPDATE review_credentials SET tenant_id='real'");
    expect(await reviewTenantForAccessCode(env, code)).toBeNull();
    expect((await signInForReview(request(), env)).status).toBe(401);
    expect(await ensureReviewFixture(env, "real")).toBe(false);
    expect((await resetReviewQuiz(env, { tenantId: "real", kind: "app", tokenHash: "x", scopes: [] })).status).toBe(404);
    expect(db.prepare("SELECT COUNT(*) AS count FROM quiz_packs WHERE tenant_id='real'").get()).toMatchObject({ count: 0 });
  });
  it("does not replace or fill answers on packs supplied through MCP", async () => {
    const { env, db } = await setup();
    const { reviewQuestions } = await import("../src/review");
    const agent = await publishPack(env, "review", { day: "2026-10-18", title: "From the reviewer’s agent", hostMessage: "A real tool-published pack", questions: reviewQuestions });
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    await ensureReviewFixture(env, "review");
    expect(db.prepare("SELECT title FROM quiz_packs WHERE id=?").get(agent.id)).toMatchObject({ title: "From the reviewer’s agent" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM answers WHERE pack_id=?").get(agent.id)).toMatchObject({ count: 0 });
  });
});
