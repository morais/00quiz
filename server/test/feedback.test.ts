import { afterEach, describe, expect, it } from "vitest";
import { agentContext, publishPack, saveFeedback, snapshot, submitAnswer, type Env } from "../src/api";
import { issueCredential, type Principal } from "../src/auth";
import { addDays } from "../src/model";
import { routeMcp } from "../src/mcp";
import worker from "../src/index";
import { migratedD1 } from "./d1";

const origin = "https://api.00quiz.com";
const now = new Date("2026-10-17T09:00:00Z");
const open: Array<{ close: () => void }> = [];
afterEach(() => { for (const db of open.splice(0)) db.close(); });
function setup() {
  const { db, d1 } = migratedD1(); open.push(db);
  for (const id of ["one", "two"]) db.prepare("INSERT INTO tenants VALUES (?, ?, NULL, ?, ?)")
    .run(id, id, now.toISOString(), now.toISOString());
  return { db, env: { DB: d1, PUBLIC_ORIGIN: origin } as Env };
}
async function quiz(env: Env, tenant = "one", time = now, complete = true) {
  const pack = await publishPack(env, tenant, {
    day: time.toISOString().slice(0, 10), title: "A little curiosity", hostMessage: "Welcome!",
    questions: Array.from({ length: 5 }, (_, i) => ({ prompt: `Question ${i}`, topic: "Space", choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "A is correct." })),
  }, time);
  if (complete) for (let i = 0; i < 5; i++) await submitAnswer(env, tenant, pack.id, { questionIndex: i, choiceIndex: i % 4 }, time);
  return pack;
}
const principal: Principal = { tenantId: "one", kind: "mcp", scopes: ["quiz:read", "quiz:write"], tokenHash: "test" };
const call = (name: string, args = {}) => new Request(origin + "/mcp", {
  method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
});

describe("post-quiz feedback", () => {
  it("saves an account-owned note without changing answers, scores, streaks or saved preferences", async () => {
    const { env } = setup(); const pack = await quiz(env);
    const before = await snapshot(env, "one", now);
    expect(before.quiz!.feedback).toBeNull();
    const saved = await saveFeedback(env, "one", pack.id, { message: "  More space, a little harder.  " }, now);
    expect(saved.feedback).toEqual({ message: "More space, a little harder.", updatedAt: now.toISOString() });
    const after = await snapshot(env, "one", now);
    expect(after.quiz!.feedback).toEqual(saved.feedback);
    expect({ ...after, quiz: { ...after.quiz!, feedback: null } }).toEqual(before);
    expect((await agentContext(env, "two")).recentFeedback).toEqual([]);
    expect((await snapshot(env, "two", now)).quiz).toBeNull();
  });

  it("requires all five answers and rejects other accounts and quizzes from a future local day", async () => {
    const { env, db } = setup(); const pack = await quiz(env, "one", now, false);
    await expect(saveFeedback(env, "two", pack.id, { message: "My note" }, now)).rejects.toMatchObject({ status: 404 });
    await expect(saveFeedback(env, "one", pack.id, { message: "My note" }, now)).rejects.toMatchObject({ status: 409 });
    for (let i = 0; i < 4; i++) await submitAnswer(env, "one", pack.id, { questionIndex: i, choiceIndex: 0 }, now);
    await expect(saveFeedback(env, "one", pack.id, { message: "My note" }, now)).rejects.toMatchObject({ status: 409 });
    await submitAnswer(env, "one", pack.id, { questionIndex: 4, choiceIndex: 0 }, now);
    db.prepare("UPDATE quiz_packs SET day = '2026-10-18' WHERE id = ?").run(pack.id);
    await expect(saveFeedback(env, "one", pack.id, { message: "My note" }, now)).rejects.toMatchObject({ status: 409 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM quiz_feedback").get()).toMatchObject({ count: 0 });
  });

  it("preserves identical retries, edits one note per quiz, validates input and supports removing the note", async () => {
    const { env, db } = setup(); const pack = await quiz(env);
    const first = await saveFeedback(env, "one", pack.id, { message: "More variety" }, now);
    expect(await saveFeedback(env, "one", pack.id, { message: "More variety" }, new Date(now.getTime() + 1000))).toEqual(first);
    await expect(saveFeedback(env, "one", pack.id, { message: "a".repeat(1001) }, now)).rejects.toThrow();
    await expect(saveFeedback(env, "one", pack.id, { message: "New", tenantId: "two" }, now)).rejects.toThrow();
    const edit = await saveFeedback(env, "one", pack.id, { message: "Fewer dates" }, new Date(now.getTime() + 2000));
    expect(edit.feedback?.message).toBe("Fewer dates");
    expect(db.prepare("SELECT COUNT(*) AS count FROM quiz_feedback").get()).toMatchObject({ count: 1 });
    expect(await saveFeedback(env, "one", pack.id, { message: "  \n " }, now)).toEqual({ feedback: null });
    expect((await agentContext(env, "one")).recentFeedback).toEqual([]);
    expect((await snapshot(env, "one", now)).quiz!.feedback).toBeNull();
  });

  it("exposes recent notes through read-only MCP context and older notes through history", async () => {
    const { env } = setup();
    for (let i = 0; i < 22; i++) {
      const time = new Date(`${addDays("2026-09-01", i)}T09:00:00Z`);
      const pack = await quiz(env, "one", time);
      await saveFeedback(env, "one", pack.id, { message: `Preference ${i}` }, new Date(now.getTime() + i * 1000));
    }
    const result = await (await routeMcp(call("get_quiz_context"), env, { ...principal, scopes: ["quiz:read"] })).json() as {
      result: { structuredContent: { recentFeedback: Array<{ message: string; day: string }>; history: unknown[] } };
    };
    expect(result.result.structuredContent.history).toHaveLength(7);
    const notes = result.result.structuredContent.recentFeedback;
    expect(notes).toHaveLength(20);
    expect(notes[0]).toMatchObject({ message: "Preference 21", day: "2026-09-22" });
    expect(notes[19].message).toBe("Preference 2");
    const history = await (await routeMcp(call("get_quiz_history", { limit: 90 }), env, principal)).json() as {
      result: { structuredContent: { history: Array<{ feedback: { message: string } }> } };
    };
    expect(history.result.structuredContent.history.at(-1)!.feedback.message).toBe("Preference 0");
    expect(await (await routeMcp(call("save_quiz_feedback", { message: "Forged" }), env, principal)).json())
      .toMatchObject({ error: { code: -32602 } });
  });

  it("accepts native sessions while rejecting MCP credentials on the feedback endpoint", async () => {
    const { env } = setup(); const pack = await quiz(env);
    const app = await issueCredential(env, "one", "app", "iPhone");
    const mcp = await issueCredential(env, "one", "mcp", "Agent");
    const req = (token: string) => new Request(`${origin}/v1/quizzes/${pack.id}/feedback`, {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ message: "More architecture" }),
    });
    expect((await worker.fetch(req(mcp.token), env, {} as ExecutionContext)).status).toBe(401);
    const saved = await worker.fetch(req(app.token), env, {} as ExecutionContext);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ feedback: { message: "More architecture" } });
  });

  it("cascades with quiz/account deletion and enforces the tenant pair in the database", async () => {
    const { env, db } = setup(); const one = await quiz(env); const two = await quiz(env, "two");
    await saveFeedback(env, "one", one.id, { message: "Mine" }, now);
    await saveFeedback(env, "two", two.id, { message: "Theirs" }, now);
    expect(() => db.prepare("UPDATE quiz_feedback SET tenant_id = 'two' WHERE pack_id = ?").run(one.id)).toThrow();
    db.prepare("DELETE FROM tenants WHERE id = 'one'").run();
    expect(db.prepare("SELECT message FROM quiz_feedback").all()).toEqual([{ message: "Theirs" }]);
  });
});
