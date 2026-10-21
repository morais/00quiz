import * as z from "zod";
import { publicOrigin, type Principal } from "./auth";
import { instructionsMetadata } from "./agentInstructions";
import { addDays, dateInZone, FeedbackInput, PackInput, PreferencesPatch, presentPack, streaks,
  type AnswerRow, type PackRow, type Preferences, type QuestionData } from "./model";

export interface Env {
  DB: D1Database; PUBLIC_ORIGIN: string; APP_NAME?: string;
  APPLE_APP_CLIENT_ID?: string; APPLE_WEB_CLIENT_ID?: string; APPLE_WEB_REDIRECT_URI?: string;
  APPLE_TEAM_ID?: string; APPLE_KEY_ID?: string; APPLE_PRIVATE_KEY?: string;
  OAUTH_SIGNING_SECRET?: string; MCP_VERIFIED_CLIENTS?: string; REVIEW_TENANT_IDS?: string;
  OPENAI_APPS_CHALLENGE_TOKEN?: string;
  SOURCE_LIMITER?: RateLimit; SIGN_IN_LIMITER?: RateLimit; TENANT_LIMITER?: RateLimit;
  SIGNUP_ALERTS?: SendEmail; SIGNUP_ALERT_TO?: string; SIGNUP_ALERT_FROM?: string;
}
export const appName = (env: Env) => env.APP_NAME?.trim().slice(0, 60) || "Quiz";
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function body(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > 64000) throw new HttpError(413, "Request too large");
  // Bound the stream as well; a missing Content-Length must not bypass the cap.
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Expected JSON");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 64000) { await reader.cancel(); throw new HttpError(413, "Request too large"); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(data)); } catch { throw new HttpError(400, "Expected valid JSON"); }
}
export async function preferences(env: Env, tenantId: string): Promise<Preferences> {
  const row = await env.DB.prepare("SELECT * FROM preferences WHERE tenant_id = ?").bind(tenantId)
    .first<{ interests: string; language: string | null; difficulty: string | null; time_zone: string }>();
  return row ? { interests: JSON.parse(row.interests), language: row.language, difficulty: row.difficulty, timeZone: row.time_zone }
    : { interests: [], language: null, difficulty: null, timeZone: "UTC" };
}
export async function updatePreferences(env: Env, tenantId: string, input: unknown) {
  const patch = PreferencesPatch.parse(input);
  // Field-specific UPSERT preserves concurrent changes to other preferences.
  const fields: [string, unknown][] = Object.entries(patch).map(([key, value]) =>
    [key === "timeZone" ? "time_zone" : key, key === "interests" ? JSON.stringify(value) : value]);
  await env.DB.prepare("INSERT OR IGNORE INTO preferences (tenant_id, updated_at) VALUES (?, ?)")
    .bind(tenantId, new Date().toISOString()).run();
  if (fields.length) await env.DB.prepare(`UPDATE preferences SET ${fields.map(([key]) => `${key} = ?`).join(", ")}, updated_at = ? WHERE tenant_id = ?`)
    .bind(...fields.map(([, value]) => value), new Date().toISOString(), tenantId).run();
  return preferences(env, tenantId);
}
export async function publishPack(env: Env, tenantId: string, input: unknown, now = new Date()) {
  const pack = PackInput.parse(input), prefs = await preferences(env, tenantId);
  const today = dateInZone(now, prefs.timeZone);
  if (pack.day < today || pack.day > addDays(today, 7)) throw new HttpError(400, "Publish for today or the next 7 days in the user's time zone");
  const id = crypto.randomUUID(), questions = JSON.stringify(pack.questions);
  await env.DB.prepare(`INSERT OR IGNORE INTO quiz_packs (id, tenant_id, day, title, host_message, questions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, tenantId, pack.day, pack.title, pack.hostMessage, questions, now.toISOString()).run();
  const saved = await env.DB.prepare("SELECT * FROM quiz_packs WHERE tenant_id = ? AND day = ?").bind(tenantId, pack.day).first<PackRow>();
  if (!saved) throw new Error("Could not publish quiz");
  if (saved.questions !== questions || saved.title !== pack.title || saved.host_message !== pack.hostMessage)
    throw new HttpError(409, "This day's quiz is already published. Published quizzes are immutable; identical retries are safe.");
  return { id: saved.id, day: saved.day, published: true, questionCount: 5 };
}
export async function snapshot(env: Env, tenantId: string, now = new Date()) {
  const prefs = await preferences(env, tenantId), today = dateInZone(now, prefs.timeZone);
  const packs = (await env.DB.prepare(`SELECT p.*, f.message AS feedback_message, f.updated_at AS feedback_updated_at
    FROM quiz_packs p LEFT JOIN quiz_feedback f ON f.pack_id = p.id AND f.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.day <= ? ORDER BY p.day DESC LIMIT 90`)
    .bind(tenantId, today).all<PackRow & { feedback_message: string | null; feedback_updated_at: string | null }>()).results;
  const answers = (await env.DB.prepare(`SELECT a.* FROM answers a JOIN quiz_packs p ON p.id = a.pack_id
    WHERE a.tenant_id = ? AND p.day <= ? ORDER BY p.day DESC LIMIT 450`).bind(tenantId, today).all<AnswerRow>()).results;
  const allDays = (await env.DB.prepare(`SELECT p.day, COUNT(a.question_index) AS answered FROM quiz_packs p
    LEFT JOIN answers a ON a.pack_id = p.id WHERE p.tenant_id = ? AND p.day <= ? GROUP BY p.id ORDER BY p.day`)
    .bind(tenantId, today).all<{ day: string; answered: number }>()).results;
  const rendered = packs.map(pack => ({ ...presentPack(pack, answers.filter(a => a.pack_id === pack.id), today),
    feedback: pack.feedback_message === null ? null : { message: pack.feedback_message, updatedAt: pack.feedback_updated_at! } }));
  return { today, preferences: prefs, streak: streaks(allDays.map(d => ({ day: d.day, completed: d.answered === 5 })), today),
    quiz: rendered.find(p => p.day === today) ?? null, history: rendered.filter(p => p.day < today) };
}
export async function saveFeedback(env: Env, tenantId: string, packId: string, input: unknown, now = new Date()) {
  const { message } = FeedbackInput.parse(input);
  const pack = await env.DB.prepare("SELECT day FROM quiz_packs WHERE id = ? AND tenant_id = ?")
    .bind(packId, tenantId).first<{ day: string }>();
  if (!pack) throw new HttpError(404, "Quiz not found");
  const answered = await env.DB.prepare("SELECT COUNT(*) AS count FROM answers WHERE pack_id = ? AND tenant_id = ?")
    .bind(packId, tenantId).first<{ count: number }>();
  if (pack.day > dateInZone(now, (await preferences(env, tenantId)).timeZone) || answered?.count !== 5) {
    throw new HttpError(409, "Finish all five questions before sharing feedback");
  }
  if (!message) {
    await env.DB.prepare("DELETE FROM quiz_feedback WHERE pack_id = ? AND tenant_id = ?").bind(packId, tenantId).run();
    return { feedback: null };
  }
  await env.DB.prepare(`INSERT INTO quiz_feedback (pack_id, tenant_id, message, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(pack_id) DO UPDATE SET message = excluded.message, updated_at = excluded.updated_at
    WHERE quiz_feedback.tenant_id = excluded.tenant_id AND quiz_feedback.message <> excluded.message`)
    .bind(packId, tenantId, message, now.toISOString()).run();
  const saved = await env.DB.prepare("SELECT message, updated_at FROM quiz_feedback WHERE pack_id = ? AND tenant_id = ?")
    .bind(packId, tenantId).first<{ message: string; updated_at: string }>();
  return { feedback: { message: saved!.message, updatedAt: saved!.updated_at } };
}
export async function submitAnswer(env: Env, tenantId: string, packId: string, input: unknown, now = new Date()) {
  const value = z.strictObject({ questionIndex: z.number().int().min(0).max(4), choiceIndex: z.number().int().min(0).max(3) }).parse(input);
  const pack = await env.DB.prepare("SELECT * FROM quiz_packs WHERE id = ? AND tenant_id = ?").bind(packId, tenantId).first<PackRow>();
  if (!pack) throw new HttpError(404, "Quiz not found");
  const today = dateInZone(now, (await preferences(env, tenantId)).timeZone);
  // An identical retry remains valid after midnight, so a lost response can reconcile.
  let saved = await env.DB.prepare("SELECT * FROM answers WHERE pack_id = ? AND question_index = ? AND tenant_id = ?")
    .bind(packId, value.questionIndex, tenantId).first<AnswerRow>();
  if (!saved && pack.day !== today) throw new HttpError(409, "This quiz is closed. New answers are accepted on its local calendar day.");
  const question: QuestionData = JSON.parse(pack.questions)[value.questionIndex];
  if (!saved) {
    await env.DB.prepare(`INSERT OR IGNORE INTO answers (pack_id, tenant_id, question_index, choice_index, correct, answered_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(packId, tenantId, value.questionIndex, value.choiceIndex,
        Number(question.correctIndex === value.choiceIndex), now.toISOString()).run();
    saved = await env.DB.prepare("SELECT * FROM answers WHERE pack_id = ? AND question_index = ? AND tenant_id = ?")
      .bind(packId, value.questionIndex, tenantId).first<AnswerRow>();
  }
  if (saved?.choice_index !== value.choiceIndex) throw new HttpError(409, "You've already answered this question");
  return snapshot(env, tenantId, now);
}
export async function agentContext(env: Env, tenantId: string) {
  const state = await snapshot(env, tenantId);
  const topics: Record<string, { answered: number; correct: number }> = {};
  for (const pack of [state.quiz, ...state.history]) for (const question of pack?.questions ?? []) {
    if (!question.answer) continue;
    const tally = topics[question.topic] ??= { answered: 0, correct: 0 };
    tally.answered++; tally.correct += Number(question.answer.correct);
  }
  const scheduled = (await env.DB.prepare("SELECT day, title FROM quiz_packs WHERE tenant_id = ? AND day >= ? ORDER BY day")
    .bind(tenantId, state.today).all()).results;
  const recentFeedback = (await env.DB.prepare(`SELECT f.pack_id AS packId, p.day, p.title, f.message, f.updated_at AS updatedAt
    FROM quiz_feedback f JOIN quiz_packs p ON p.id = f.pack_id AND p.tenant_id = f.tenant_id
    WHERE f.tenant_id = ? AND p.day <= ? ORDER BY f.updated_at DESC, f.pack_id LIMIT 20`)
    .bind(tenantId, state.today).all()).results;
  return { ...state, topics, scheduled, recentFeedback, agentInstructions: await instructionsMetadata(publicOrigin(env)),
    instructions: "If agentInstructions.version is new to you, read get_quiz_instructions before preparing a quiz. The same guidance is at agentInstructions.url." };
}
export function apiError(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: "Invalid input", details: error.issues.map(i => ({ path: i.path, message: i.message })) }, 400);
  console.error("Request failed", error instanceof Error ? error.message : "unknown");
  return json({ error: "Could not complete the request" }, 500);
}
export async function routeApi(req: Request, env: Env, principal: Principal) {
  try {
    const path = new URL(req.url).pathname;
    if (path === "/v1/snapshot" && req.method === "GET") return json(await snapshot(env, principal.tenantId));
    if (path === "/v1/preferences" && req.method === "PATCH") return json(await updatePreferences(env, principal.tenantId, await body(req)));
    const feedback = /^\/v1\/quizzes\/([a-f0-9-]{36})\/feedback$/.exec(path);
    if (feedback && req.method === "PUT") {
      if (principal.kind !== "app") return json({ error: "Forbidden" }, 403);
      return json(await saveFeedback(env, principal.tenantId, feedback[1], await body(req)));
    }
    const answer = /^\/v1\/quizzes\/([a-f0-9-]{36})\/answers$/.exec(path);
    if (answer && req.method === "POST") return json(await submitAnswer(env, principal.tenantId, answer[1], await body(req)));
    return json({ error: "Not found" }, 404);
  } catch (error) { return apiError(error); }
}
