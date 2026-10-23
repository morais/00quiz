import { afterEach, describe, expect, it, vi } from "vitest";
import { migratedD1 } from "./d1";
import { authenticate, issueCredential, revokeCredential, sha256Base64url, sha256Hex } from "../src/auth";
import { exchangeCode, registerClient } from "../src/oauth";
import type { Env } from "../src/api";

const day = 86_400_000;
const start = Date.parse("2026-10-23T09:00:00Z");
const open: Array<{ close(): void }> = [];
afterEach(() => { vi.useRealTimers(); for (const db of open.splice(0)) db.close(); });

function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
  const { db, d1 } = migratedD1(); open.push(db);
  db.prepare("INSERT INTO tenants (id, created_at, updated_at) VALUES ('one', ?, ?)")
    .run(new Date().toISOString(), new Date().toISOString());
  const env = { DB: d1, PUBLIC_ORIGIN: "https://api.00quiz.com",
    OAUTH_SIGNING_SECRET: "test-signing-secret-with-at-least-32-characters",
    APPLE_WEB_CLIENT_ID: "com.example.quiz.web", APPLE_WEB_REDIRECT_URI: "https://api.00quiz.com/auth/apple/callback",
    APPLE_PRIVATE_KEY: "test-key-not-used-for-code-exchange" } as Env;
  const request = (token: string) => new Request("https://api.00quiz.com/mcp", { headers: { authorization: `Bearer ${token}` } });
  return { db, env, request };
}

describe("MCP connection lifetime", () => {
  it("keeps daily agents authorized for a year while native sessions still expire after 90 days", async () => {
    const { env, request } = setup();
    const mcp = await issueCredential(env, "one", "mcp", "Daily quiz agent");
    const app = await issueCredential(env, "one", "app", "iPhone");
    expect(Date.parse(mcp.expiresAt) - start).toBe(365 * day);
    expect(Date.parse(app.expiresAt) - start).toBe(90 * day);
    vi.setSystemTime(start + 100 * day);
    expect(await authenticate(request(mcp.token), env, "mcp")).toMatchObject({ tenantId: "one", kind: "mcp" });
    expect(await authenticate(request(app.token), env, "app")).toBeNull();
    vi.setSystemTime(start + 365 * day - 1);
    expect(await authenticate(request(mcp.token), env, "mcp")).not.toBeNull();
    vi.setSystemTime(start + 365 * day);
    expect(await authenticate(request(mcp.token), env, "mcp")).toBeNull();
  });

  it("honors revocation immediately and does not silently extend an older grant", async () => {
    const { db, env, request } = setup();
    const mcp = await issueCredential(env, "one", "mcp", "Agent");
    const principal = (await authenticate(request(mcp.token), env, "mcp"))!;
    await revokeCredential(env, principal);
    expect(await authenticate(request(mcp.token), env, "mcp")).toBeNull();

    const legacy = await issueCredential(env, "one", "mcp", "Existing agent");
    db.prepare("UPDATE credentials SET expires_at = ? WHERE token_hash = ?")
      .run(new Date(start + 30 * day).toISOString(), await sha256Hex(legacy.token));
    vi.setSystemTime(start + 31 * day);
    expect(await authenticate(request(legacy.token), env, "mcp")).toBeNull();
  });

  it("advertises the same one-year lifetime to the OAuth client", async () => {
    const { db, env } = setup();
    const redirect = "https://client.example/callback";
    const registered = await registerClient(new Request("https://api.00quiz.com/oauth/register", {
      method: "POST", body: JSON.stringify({ client_name: "Daily agent", redirect_uris: [redirect] }),
    }), env);
    expect(registered.status).toBe(201);
    const { client_id } = await registered.json() as { client_id: string };
    const code = "c".repeat(43), verifier = "v".repeat(43);
    db.prepare(`INSERT INTO oauth_codes
      (code_hash, tenant_id, client_id, redirect_uri, code_challenge, resource, scopes, expires_at)
      VALUES (?, 'one', ?, ?, ?, ?, 'quiz:read quiz:write', ?)`)
      .run(await sha256Hex(code), client_id, redirect, await sha256Base64url(verifier),
        "https://api.00quiz.com/mcp", new Date(start + 300_000).toISOString());
    const response = await exchangeCode(new Request("https://api.00quiz.com/oauth/token", {
      method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id,
        code, code_verifier: verifier, redirect_uri: redirect, resource: "https://api.00quiz.com/mcp" }),
    }), env);
    expect(response.status).toBe(200);
    const result = await response.json() as { access_token: string; expires_in: number; scope: string };
    expect(result.expires_in).toBe(365 * 86_400);
    expect(result.scope).toBe("quiz:read quiz:write");
    const saved = db.prepare("SELECT expires_at FROM credentials WHERE token_hash = ?")
      .get(await sha256Hex(result.access_token)) as { expires_at: string };
    expect(Date.parse(saved.expires_at) - start).toBe(result.expires_in * 1000);
  });
});
