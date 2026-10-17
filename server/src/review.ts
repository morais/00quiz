import { z } from "zod";
import { body, json, preferences, snapshot, type Env } from "./api";
import { issueCredential, sha256Hex, type Principal } from "./auth";
import { addDays, dateInZone, type QuestionData } from "./model";
import { reviewTenantForAccessCode } from "./oauth";

export async function isReviewTenant(env: Env, tenantId: string): Promise<boolean> {
  if (!(env.REVIEW_TENANT_IDS ?? "").split(",").map(id => id.trim()).includes(tenantId)) return false;
  const tenant = await env.DB.prepare("SELECT apple_subject FROM tenants WHERE id = ?").bind(tenantId)
    .first<{ apple_subject: string | null }>();
  return Boolean(tenant && tenant.apple_subject === null);
}

export const reviewQuestions: QuestionData[] = [
  { prompt: "How many hearts does an octopus have?", topic: "Nature", choices: ["One", "Three", "Two", "Four"], correctIndex: 1,
    explanation: "Octopuses have three hearts. Two pump blood through the gills; one supplies the rest of the body." },
  { prompt: "Which planet takes longer to rotate once than to orbit the Sun?", topic: "Space", choices: ["Mars", "Jupiter", "Venus", "Mercury"], correctIndex: 2,
    explanation: "Venus takes about 243 Earth days to rotate once, longer than its roughly 225-Earth-day orbit of the Sun." },
  { prompt: "Whose name gave us the word ‘algorithm’?", topic: "Technology", choices: ["Al-Khwarizmi", "Euclid", "Ada Lovelace", "Archimedes"], correctIndex: 0,
    explanation: "The word ‘algorithm’ comes from the name of the mathematician al-Khwarizmi." },
  { prompt: "What holds a traditional stone arch together?", topic: "Architecture", choices: ["A cornerstone", "A lintel", "A buttress", "A keystone"], correctIndex: 3,
    explanation: "A keystone is the central stone at the top of an arch, locking the surrounding stones in place." },
  { prompt: "Why can’t sound travel through empty space?", topic: "Science", choices: ["It is too cold", "There is no medium", "Gravity stops it", "Light absorbs it"], correctIndex: 1,
    explanation: "Sound needs a medium to travel through. Empty space is a vacuum, so sound cannot travel through it." },
];

async function fixtureId(tenant: string, day: string): Promise<string> {
  const h = await sha256Hex(`00quiz-review:${tenant}:${day}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Only a configured synthetic tenant can receive these sample packs. Repeated
// reads preserve answers and any packs a reviewer published through MCP.
export async function ensureReviewFixture(env: Env, tenantId: string, now = new Date()): Promise<boolean> {
  if (!(await isReviewTenant(env, tenantId))) return false;
  await env.DB.prepare("INSERT OR IGNORE INTO preferences (tenant_id, updated_at) VALUES (?, ?)").bind(tenantId, now.toISOString()).run();
  const prefs = await preferences(env, tenantId), today = dateInZone(now, prefs.timeZone);
  for (let offset = 3; offset >= 0; offset--) {
    const day = addDays(today, -offset), id = await fixtureId(tenantId, day);
    await env.DB.prepare(`INSERT OR IGNORE INTO quiz_packs (id, tenant_id, day, title, host_message, questions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, tenantId, day, "A world of little wonders",
      "Welcome to the sample show! These five fixed questions let you try the full quiz. In your own account, your connected agent chooses the questions and writes this introduction.",
      JSON.stringify(reviewQuestions), now.toISOString()).run();
    if (!offset) continue;
    const saved = await env.DB.prepare("SELECT id FROM quiz_packs WHERE tenant_id = ? AND day = ?").bind(tenantId, day).first<{ id: string }>();
    if (saved?.id !== id) continue;
    const score = [0, 4, 3, 5][offset];
    await env.DB.batch(reviewQuestions.map((q, index) => env.DB.prepare(`INSERT OR IGNORE INTO answers
      (pack_id, tenant_id, question_index, choice_index, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, tenantId, index, index < score ? q.correctIndex : (q.correctIndex + 1) % 4, index < score ? 1 : 0, `${day}T09:00:00Z`)));
  }
  return true;
}

export async function signInForReview(req: Request, env: Env): Promise<Response> {
  if (!env.REVIEW_TENANT_IDS?.trim()) return json({ error: "Not found" }, 404);
  const parsed = z.strictObject({ accessCode: z.string().regex(/^qq_review_[A-Za-z0-9_-]{43}$/) }).safeParse(await body(req));
  if (!parsed.success) return json({ error: "Invalid review access code" }, 401);
  const tenantId = await reviewTenantForAccessCode(env, parsed.data.accessCode);
  if (!tenantId || !(await ensureReviewFixture(env, tenantId))) return json({ error: "Invalid or expired review access" }, 401);
  const credential = await issueCredential(env, tenantId, "app", "App Review sample account");
  return json({ token: credential.token, expiresAt: credential.expiresAt, tenant: { id: tenantId, isReview: true } }, 201);
}

export async function resetReviewQuiz(env: Env, principal: Principal): Promise<Response> {
  if (principal.kind !== "app") return json({ error: "Forbidden" }, 403);
  if (!(await ensureReviewFixture(env, principal.tenantId))) return json({ error: "Not found" }, 404);
  const prefs = await preferences(env, principal.tenantId), day = dateInZone(new Date(), prefs.timeZone);
  await env.DB.prepare(`DELETE FROM answers WHERE tenant_id = ? AND pack_id IN
    (SELECT id FROM quiz_packs WHERE tenant_id = ? AND day = ?)`)
    .bind(principal.tenantId, principal.tenantId, day).run();
  return json(await snapshot(env, principal.tenantId));
}
