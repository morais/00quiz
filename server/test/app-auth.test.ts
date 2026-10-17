import { afterEach, describe, expect, it, vi } from "vitest";
import { migratedD1 } from "./d1";
import { signInWithApple, deleteAccount } from "../src/appAuth";
import { authenticate, issueCredential } from "../src/auth";
import { preferences, publishPack } from "../src/api";
import * as apple from "../src/apple";
import type { Env } from "../src/api";

const open: Array<{ close: () => void }> = [];
afterEach(() => { vi.restoreAllMocks(); for (const db of open.splice(0)) db.close(); });
function setup() {
  const { db, d1 } = migratedD1(); open.push(db);
  const env: Env = { DB: d1, PUBLIC_ORIGIN: "https://api.00quiz.com", APPLE_APP_CLIENT_ID: "com.00quiz.app", APPLE_PRIVATE_KEY: "mock" };
  const claims = { iss: "https://appleid.apple.com", aud: "com.00quiz.app", sub: "apple-one", iat: Date.now() / 1000, exp: Date.now() / 1000 + 600 };
  vi.spyOn(apple, "verifyNativeAppleLogin").mockResolvedValue({ claims, accessToken: "mock-apple-token" });
  vi.spyOn(apple, "revokeAppleToken").mockResolvedValue(undefined);
  return { db, env, claims };
}
const login = (extra = {}) => new Request("https://api.00quiz.com/v1/auth/apple", { method: "POST", body: JSON.stringify({ identityToken: "x".repeat(100), authorizationCode: "code", nonce: "n".repeat(32), ...extra }) });

describe("Apple account lifecycle", () => {
  it("initializes the first native sign-in's time zone without resetting saved preferences on later sign-ins", async () => {
    const { env } = setup();
    const first = await signInWithApple(login({ timeZone: "Europe/Lisbon" }), env);
    expect(first.status).toBe(201);
    const session = await first.json() as { token: string; tenant: { id: string } };
    expect((await preferences(env, session.tenant.id)).timeZone).toBe("Europe/Lisbon");
    await signInWithApple(login({ timeZone: "Asia/Tokyo" }), env);
    expect((await preferences(env, session.tenant.id)).timeZone).toBe("Europe/Lisbon");
    const principal = await authenticate(new Request("https://api.00quiz.com/v1", { headers: { Authorization: `Bearer ${session.token}` } }), env, "app");
    expect(principal?.tenantId).toBe(session.tenant.id);
  });
  it("rejects invalid time zones before creating an account", async () => {
    const { env, db } = setup();
    expect((await signInWithApple(login({ timeZone: "invalid-zone" }), env)).status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM tenants").get()).toMatchObject({ count: 0 });
  });
  it("requires matching Apple reauthentication and deletes all quiz data and agent credentials", async () => {
    const { env, db, claims } = setup();
    const response = await signInWithApple(login(), env);
    const session = await response.json() as { token: string; tenant: { id: string } };
    const principal = (await authenticate(new Request("https://api.00quiz.com/v1", { headers: { Authorization: `Bearer ${session.token}` } }), env, "app"))!;
    await issueCredential(env, session.tenant.id, "mcp", "Test agent");
    await publishPack(env, session.tenant.id, { day: new Date().toISOString().slice(0, 10), title: "Test", hostMessage: "Welcome", questions: Array.from({ length: 5 }, (_, i) => ({ prompt: `Question ${i}`, topic: "Testing", choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "A" })) });
    vi.mocked(apple.verifyNativeAppleLogin).mockResolvedValueOnce({ claims: { ...claims, sub: "someone-else" }, accessToken: "mock" });
    expect((await deleteAccount(login(), env, principal)).status).toBe(403);
    expect((await deleteAccount(login(), env, principal)).status).toBe(200);
    for (const table of ["tenants", "credentials", "preferences", "quiz_packs", "answers"]) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toMatchObject({ count: 0 });
    }
    expect(apple.revokeAppleToken).toHaveBeenCalledOnce();
  });
});
