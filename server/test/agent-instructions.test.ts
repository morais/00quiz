import { describe, expect, it } from "vitest";
import { agentInstructions, buildInstructionsDocument, readInstructions } from "../src/agentInstructions";
import { agentContext, type Env } from "../src/api";
import type { Principal } from "../src/auth";
import worker from "../src/index";
import { routeMcp } from "../src/mcp";
import { migratedD1 } from "./d1";

const origin = "https://quiz.example";
const publicEnv = { PUBLIC_ORIGIN: origin, DB: { prepare() { throw new Error("Public instructions must not query D1"); } } } as unknown as Env;
const ctx = {} as ExecutionContext;
const principal: Principal = { tenantId: "tenant", kind: "mcp", scopes: ["quiz:read"], tokenHash: "test" };
const get = (method = "GET", etag?: string) => worker.fetch(new Request(`${origin}/agent-instructions`, {
  method, headers: etag ? { "If-None-Match": etag } : undefined,
}), publicEnv, ctx);
const tool = (argumentsValue = {}, scopes = principal.scopes) => routeMcp(new Request(`${origin}/mcp`, {
  method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_quiz_instructions", arguments: argumentsValue } }),
}), publicEnv, { ...principal, scopes });

describe("versioned agent guidance", () => {
  it("derives a stable version from content and invalidates it automatically on an edit", async () => {
    const first = await buildInstructionsDocument("Original guidance");
    expect((await buildInstructionsDocument("Original guidance")).version).toBe(first.version);
    expect((await buildInstructionsDocument("Changed guidance")).version).not.toBe(first.version);
    expect(first.version).toMatch(/^[a-f0-9]{64}$/);
  });

  it("serves public guidance without user data, authentication or database access", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(await agentInstructions());
    expect(response.headers.get("ETag")).toBe(`"${(await agentInstructions()).version}"`);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("returns body-free 304s for matching, weak, multiple and wildcard validators", async () => {
    const tag = (await get()).headers.get("ETag")!;
    for (const validator of [tag, `W/${tag}`, `"old", W/${tag}`, "*"]) {
      const response = await get("GET", validator);
      expect(response.status).toBe(304);
      expect(await response.text()).toBe("");
      expect(response.headers.get("ETag")).toBe(tag);
    }
  });

  it("returns the new document when a cached version is stale, including HEAD checks", async () => {
    const changed = await get("GET", '"old-version"');
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual(await agentInstructions());
    const head = await get("HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await get("HEAD", head.headers.get("ETag")!)).status).toBe(304);
    expect((await get("POST")).status).toBe(404);
  });

  it("offers the same document through MCP and returns only a small marker when unchanged", async () => {
    const document = await agentInstructions();
    const first = await (await tool()).json();
    expect(first).toMatchObject({ result: { structuredContent: { ...document, changed: true } } });
    const unchanged = await (await tool({ knownVersion: document.version })).json() as { result: { structuredContent: unknown } };
    expect(unchanged.result.structuredContent).toEqual({ version: document.version, changed: false });
    expect(await readInstructions("old-version")).toMatchObject({ ...document, changed: true });
    expect((await tool({}, ["quiz:write"])).status).toBe(403);
  });

  it("advertises the version in ordinary context without repeating the whole guidance", async () => {
    const { db, d1 } = migratedD1();
    try {
      db.prepare("INSERT INTO tenants VALUES ('tenant', 'tenant', NULL, '2026-01-01', '2026-01-01')").run();
      const state = await agentContext({ DB: d1, PUBLIC_ORIGIN: origin }, "tenant");
      expect(state.agentInstructions).toEqual({ version: (await agentInstructions()).version,
        url: `${origin}/agent-instructions`, tool: "get_quiz_instructions" });
      expect(state.instructions.length).toBeLessThan(200);
      expect(state.instructions).not.toContain("You are the user's friendly quiz host");
    } finally { db.close(); }
  });
});
