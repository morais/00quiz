import { afterEach, describe, expect, it } from "vitest";
import { migratedD1 } from "./d1";
import { agentContext, body, preferences, publishPack, snapshot, submitAnswer, updatePreferences, type Env } from "../src/api";
import { authenticate, issueCredential, type Principal } from "../src/auth";
import { PackInput, addDays, dateInZone, streaks } from "../src/model";
import { routeMcp } from "../src/mcp";

const open: Array<{ close: () => void }> = [];
afterEach(() => { for (const db of open.splice(0)) db.close(); });
const now = new Date("2026-10-17T09:00:00Z");
function setup() {
  const { db, d1 } = migratedD1(); open.push(db);
  for (const id of ["one", "two"]) db.prepare("INSERT INTO tenants VALUES (?, ?, NULL, ?, ?)").run(id, id, now.toISOString(), now.toISOString());
  return { db, env: { DB: d1, PUBLIC_ORIGIN: "https://api.00quiz.com" } as Env };
}
const pack = (day = "2026-10-17") => ({ day, title: "A little curiosity", hostMessage: "Welcome back! Five new discoveries await.",
  questions: Array.from({ length: 5 }, (_, i) => ({ topic: "Space", prompt: `Which planet is number ${i + 1} from the Sun?`,
    choices: ["Mercury", "Venus", "Earth", "Mars"], correctIndex: i % 4, explanation: `Explanation ${i + 1}.`, sourceURL: "https://science.nasa.gov/solar-system/" })) });
const principal: Principal = { tenantId: "one", kind: "mcp", scopes: ["quiz:read", "quiz:write"], tokenHash: "test" };
const rpc = (name: string, args = {}) => new Request("https://api.00quiz.com/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });

describe("daily quiz integrity", () => {
  it("requires five questions, four distinct choices and valid source URLs", () => {
    expect(PackInput.safeParse({ ...pack(), questions: pack().questions.slice(1) }).success).toBe(false);
    const input = pack(); input.questions[0].choices[1] = "Mercury";
    expect(PackInput.safeParse(input).success).toBe(false);
    const source = pack(); source.questions[0].sourceURL = "javascript:alert(1)";
    expect(PackInput.safeParse(source).success).toBe(false);
    expect(PackInput.safeParse(pack("2026-02-31")).success).toBe(false);
  });
  it("publishes atomically, retries safely, and cannot replace published questions", async () => {
    const { env } = setup();
    const first = await publishPack(env, "one", pack(), now);
    expect((await publishPack(env, "one", pack(), now)).id).toBe(first.id);
    await expect(publishPack(env, "one", { ...pack(), hostMessage: "Replacement" }, now)).rejects.toMatchObject({ status: 409 });
    await expect(publishPack(env, "one", pack("2026-10-16"), now)).rejects.toMatchObject({ status: 400 });
    await expect(publishPack(env, "one", pack("2026-10-25"), now)).rejects.toMatchObject({ status: 400 });
    expect((await snapshot(env, "two", now)).quiz).toBeNull();
    expect((await snapshot(env, "one", now)).quiz?.questions).toHaveLength(5);
  });
  it("reveals only attempted answer keys and enforces one choice even across retries", async () => {
    const { env } = setup(); const published = await publishPack(env, "one", pack(), now);
    const initial = (await snapshot(env, "one", now)).quiz!;
    expect(initial.questions.every(q => q.correctIndex === null && q.explanation === null && q.sourceURL === null)).toBe(true);
    const updated = await submitAnswer(env, "one", published.id, { questionIndex: 0, choiceIndex: 1 }, now);
    expect(updated.quiz!.questions[0]).toMatchObject({ correctIndex: 0, explanation: "Explanation 1.", answer: { choiceIndex: 1, correct: false } });
    expect(updated.quiz!.questions[1].correctIndex).toBeNull();
    await expect(submitAnswer(env, "one", published.id, { questionIndex: 0, choiceIndex: 0 }, now)).rejects.toMatchObject({ status: 409 });
    await submitAnswer(env, "one", published.id, { questionIndex: 0, choiceIndex: 1 }, now);
    await expect(submitAnswer(env, "two", published.id, { questionIndex: 0, choiceIndex: 1 }, now)).rejects.toMatchObject({ status: 404 });
    for (let i = 1; i < 5; i++) await submitAnswer(env, "one", published.id, { questionIndex: i, choiceIndex: i % 4 }, now);
    expect((await snapshot(env, "one", now)).streak.current).toBe(1);
    expect((await snapshot(env, "one", now)).quiz).toMatchObject({ completed: true, score: 4 });
  });
  it("uses the account time zone, hides future packs and closes past quizzes", async () => {
    const { env } = setup();
    await updatePreferences(env, "one", { timeZone: "Pacific/Honolulu" });
    const localNow = new Date("2026-10-18T02:00:00Z");
    const published = await publishPack(env, "one", pack(), localNow);
    await publishPack(env, "one", pack("2026-10-18"), localNow);
    expect((await snapshot(env, "one", localNow)).today).toBe("2026-10-17");
    expect((await snapshot(env, "one", localNow)).history).toHaveLength(0);
    await submitAnswer(env, "one", published.id, { questionIndex: 0, choiceIndex: 0 }, localNow);
    const tomorrow = new Date("2026-10-18T12:00:00Z");
    await submitAnswer(env, "one", published.id, { questionIndex: 0, choiceIndex: 0 }, tomorrow);
    await expect(submitAnswer(env, "one", published.id, { questionIndex: 1, choiceIndex: 0 }, tomorrow)).rejects.toMatchObject({ status: 409 });
    expect((await snapshot(env, "one", tomorrow)).history[0].questions[1].correctIndex).toBe(1);
  });
  it("returns the latest 90 packs with their answers", async () => {
    const { db, env } = setup();
    const questions = JSON.stringify(pack().questions);
    for (let i = 0; i < 95; i++) {
      const day = addDays("2026-10-17", -i);
      db.prepare("INSERT INTO quiz_packs VALUES (?, 'one', ?, 'Old', 'Hello', ?, ?)").run(`pack-${i}`, day, questions, now.toISOString());
      db.prepare("INSERT INTO answers VALUES (?, 'one', 0, ?, 1, ?)").run(`pack-${i}`, i % 4, `${day}T09:00:00Z`);
    }
    const state = await snapshot(env, "one", now);
    expect(state.history).toHaveLength(89);
    expect([state.quiz!, ...state.history].map(p => p.questions[0].answer?.choiceIndex)).toEqual(Array.from({ length: 90 }, (_, i) => i % 4));
    expect(state.streak).toEqual({ current: 0, longest: 0, completedDays: 0 });
  });
  it("keeps optional preferences empty until set and preserves omitted values", async () => {
    const { env } = setup();
    expect(await preferences(env, "one")).toEqual({ interests: [], language: null, difficulty: null, timeZone: "UTC" });
    await updatePreferences(env, "one", { interests: ["Architecture"], language: "Portuguese" });
    await updatePreferences(env, "one", { difficulty: "challenging" });
    expect(await preferences(env, "one")).toMatchObject({ interests: ["Architecture"], language: "Portuguese", difficulty: "challenging" });
    await expect(updatePreferences(env, "one", { timeZone: "invalid" })).rejects.toThrow();
  });
  it("does not accept answer submission or publishing through the wrong credential surface", async () => {
    const { env } = setup();
    const app = await issueCredential(env, "one", "app", "iPhone");
    const mcp = await issueCredential(env, "one", "mcp", "Agent");
    expect(await authenticate(new Request("https://api.00quiz.com/mcp", { headers: { Authorization: `Bearer ${app.token}` } }), env, "mcp")).toBeNull();
    expect(await authenticate(new Request("https://api.00quiz.com/v1/snapshot", { headers: { Authorization: `Bearer ${mcp.token}` } }), env, "app")).toBeNull();
    const denied = await routeMcp(rpc("publish_daily_quiz", pack()), env, { ...principal, scopes: ["quiz:read"] });
    expect(denied.status).toBe(403);
    const noAnswerTool = await routeMcp(rpc("submit_answer"), env, principal);
    expect(await noAnswerTool.json()).toMatchObject({ error: { code: -32602 } });
  });
  it("publishes schemas through MCP and reports semantic errors as tool errors", async () => {
    const { env } = setup();
    const listing = await routeMcp(new Request("https://api.00quiz.com/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) }), env, principal);
    const data = await listing.json() as { result: { tools: { name: string; title: string; annotations: Record<string, unknown> }[] } };
    expect(data.result.tools).toHaveLength(5);
    const hints = Object.fromEntries(data.result.tools.map(t => [t.name, t.annotations]));
    for (const t of data.result.tools) expect(t.annotations.title).toBe(t.title);
    expect(hints.get_quiz_context).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(hints.update_quiz_preferences).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(hints.publish_daily_quiz).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    const result = await routeMcp(rpc("publish_daily_quiz", pack("2020-01-01")), env, principal);
    expect(await result.json()).toMatchObject({ result: { isError: true } });
    expect((await agentContext(env, "one")).topics).toEqual({});
  });
  it("bounds chunked requests without Content-Length", async () => {
    await expect(body(new Request("https://test", { method: "POST", body: JSON.stringify({ text: "a".repeat(65000) }) }))).rejects.toMatchObject({ status: 413 });
  });
});

describe("stored streak summary", () => {
  // The old full scan, kept as the reference the stored summary must match.
  const fullScan = (db: ReturnType<typeof setup>["db"], today: string) => streaks((db.prepare(`SELECT p.day, COUNT(a.question_index) AS answered
    FROM quiz_packs p LEFT JOIN answers a ON a.pack_id = p.id WHERE p.tenant_id = 'one' GROUP BY p.id`).all() as { day: string; answered: number }[])
    .map(d => ({ day: d.day, completed: d.answered === 5 })), today);
  const play = async (env: Env, day: string, at: Date, count = 5) => {
    const { id } = await publishPack(env, "one", pack(day), at);
    for (let i = 0; i < count; i++) await submitAnswer(env, "one", id, { questionIndex: i, choiceIndex: 0 }, at);
  };
  it("matches a full scan over gaps, partial days and a rebuilt summary", async () => {
    const { db, env } = setup();
    let seed = 7; const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 60; i++) {
      const day = addDays("2026-08-01", i), at = new Date(`${day}T09:00:00Z`);
      if (random() < 0.85) await play(env, day, at, random() < 0.7 ? 5 : Math.floor(random() * 5));
      if (i === 30) db.prepare("DELETE FROM tenant_streaks").run();
      expect((await snapshot(env, "one", at)).streak).toEqual(fullScan(db, day));
    }
    expect(fullScan(db, "2026-09-29").longest).toBeGreaterThan(2);
  });
  it("matches a full scan when a time zone change completes days out of order", async () => {
    const { db, env } = setup();
    const at = new Date("2026-10-16T11:00:00Z");
    await play(env, "2026-10-15", new Date("2026-10-15T11:00:00Z"));
    await updatePreferences(env, "one", { timeZone: "Pacific/Kiritimati" });
    await play(env, "2026-10-17", at);
    expect((await snapshot(env, "one", at)).streak).toEqual(fullScan(db, "2026-10-17"));
    await updatePreferences(env, "one", { timeZone: "Pacific/Honolulu" });
    expect((await snapshot(env, "one", at)).streak).toEqual(fullScan(db, "2026-10-16"));
    await play(env, "2026-10-16", at);
    expect((await snapshot(env, "one", at)).streak).toEqual(fullScan(db, "2026-10-16"));
    expect((await snapshot(env, "one", new Date("2026-10-17T11:00:00Z"))).streak).toEqual({ current: 3, longest: 3, completedDays: 3 });
  });
});

describe("streak calendar rules", () => {
  it("counts consecutive completed calendar days regardless of score and leaves today open", () => {
    expect(streaks([{ day: "2026-10-15", completed: true }, { day: "2026-10-16", completed: true }, { day: "2026-10-17", completed: false }], "2026-10-17"))
      .toEqual({ current: 2, longest: 2, completedDays: 2 });
    expect(streaks([{ day: "2026-10-14", completed: true }, { day: "2026-10-16", completed: false }, { day: "2026-10-17", completed: true }], "2026-10-17").current).toBe(1);
    expect(streaks([{ day: "2026-10-14", completed: true }, { day: "2026-10-16", completed: true }], "2026-10-17").current).toBe(1);
    expect(streaks([{ day: "2026-10-14", completed: true }], "2026-10-17").current).toBe(0);
  });
  it("handles DST and date line boundaries", () => {
    expect(dateInZone(new Date("2026-10-25T01:30:00Z"), "Europe/Lisbon")).toBe("2026-10-25");
    expect(dateInZone(new Date("2026-10-17T13:00:00Z"), "Pacific/Kiritimati")).toBe("2026-10-18");
  });
});
