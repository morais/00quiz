import { z } from "zod";
import { agentContext, apiError, appName, body, json, publishPack, snapshot, updatePreferences, type Env } from "./api";
import { PackInput, PreferencesPatch } from "./model";
import { type Principal } from "./auth";
import { authChallenge } from "./oauth";
import { readInstructions } from "./agentInstructions";

const tools = [
  { name: "get_quiz_instructions", title: "Get Quiz Instructions", readOnly: true,
    description: "Read the current quiz-host guidance. get_quiz_context advertises its version each run. Pass knownVersion to get a tiny changed:false response when your saved guidance is current; otherwise the full guidance and its version are returned.",
    schema: z.strictObject({ knownVersion: z.string().min(1).max(100).optional() }) },
  { name: "get_quiz_context", title: "Get Quiz Context", readOnly: true,
    description: "Read optional preferences, post-quiz feedback (20 most recently updated notes), user-local date, streaks, topic accuracy, recent answers, upcoming quiz days and the current quiz-host guidance version. Use recentFeedback to adapt future quizzes. Includes 7 history items; get_quiz_history can inspect up to 90.", schema: z.strictObject({}) },
  { name: "get_quiz_history", title: "Get Quiz History", readOnly: true,
    description: "Read previous quizzes, the user's actual choices, correct answers, explanations, daily scores and any post-quiz feedback. Use to adapt difficulty and revisit missed concepts.", schema: z.strictObject({ limit: z.number().int().min(1).max(90).default(14) }) },
  { name: "update_quiz_preferences", title: "Update Quiz Preferences", readOnly: false, destructive: true,
    description: "Save optional interests, language, difficulty or IANA timeZone, replacing the saved value of each field included. Set defaults based on your conversation when unset. Respect existing preferences; only change user-set values when asked. Empty interests and null language/difficulty let you choose. Omitted fields stay unchanged.", schema: PreferencesPatch },
  { name: "publish_daily_quiz", title: "Publish Daily Quiz", readOnly: false,
    description: "Publish exactly five multiple-choice questions with four distinct choices each, correctIndex 0–3, and an explanation. Follow the general-audience content limits in get_quiz_instructions. day is YYYY-MM-DD in the user's time zone, today through 7 days ahead. The friendly hostMessage may discuss yesterday's actual performance and introduce today's topics. Verify facts; provide reliable HTTPS sourceURL values where useful. A day's published quiz is immutable; identical retries are idempotent. The app shows answers after each attempt. Publishing does not schedule future quizzes.", schema: PackInput },
] as const;
const versions = new Set(["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
const rpc = (id: unknown, result: unknown) => json({ jsonrpc: "2.0", id, result });
const error = (id: unknown, code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });
let listing: unknown;
export async function routeMcp(req: Request, env: Env, principal: Principal): Promise<Response> {
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  let input: Record<string, unknown>;
  try {
    const parsed = await body(req);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
    input = parsed as Record<string, unknown>;
  } catch { return error(null, -32700, "Invalid or oversized JSON"); }
  const id = input.id ?? null;
  if (input.jsonrpc !== "2.0" || typeof input.method !== "string") return error(id, -32600, "Invalid JSON-RPC request");
  if (input.method.startsWith("notifications/") && id === null) return new Response(null, { status: 202 });
  if (id === null || !(typeof id === "string" || typeof id === "number")) return error(null, -32600, "Request id required");
  if (input.method === "initialize") {
    const asked = (input.params as { protocolVersion?: string })?.protocolVersion;
    return rpc(id, { protocolVersion: asked && versions.has(asked) ? asked : "2026-07-28",
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: appName(env), version: "1.1.0" },
      instructions: "On each run read get_quiz_context. Read get_quiz_instructions if agentInstructions.version is new to you, then follow the current guidance." });
  }
  if (input.method === "ping") return rpc(id, {});
  if (input.method === "tools/list") {
    listing ??= tools.map(t => ({ name: t.name, title: t.title, description: t.description,
      inputSchema: z.toJSONSchema(t.schema, { io: "input" }),
      annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: "destructive" in t, idempotentHint: true, openWorldHint: false } }));
    return rpc(id, { tools: listing });
  }
  if (input.method !== "tools/call") return error(id, -32601, "Method not found");
  const params = input.params as { name?: unknown; arguments?: unknown } | undefined;
  const tool = tools.find(t => t.name === params?.name);
  if (!tool) return error(id, -32602, "Unknown tool");
  const scope = tool.readOnly ? "quiz:read" : "quiz:write";
  if (!principal.scopes.includes(scope)) return authChallenge(env, 403, [scope]);
  const parsed = tool.schema.safeParse(params?.arguments ?? {});
  if (!parsed.success) return error(id, -32602, parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
  try {
    let result: unknown;
    switch (tool.name) {
      case "get_quiz_instructions": result = await readInstructions((parsed.data as { knownVersion?: string }).knownVersion); break;
      case "get_quiz_context": {
        const context = await agentContext(env, principal.tenantId);
        result = { ...context, history: context.history.slice(0, 7) }; break;
      }
      case "get_quiz_history": {
        const state = await snapshot(env, principal.tenantId);
        result = { today: state.today, history: state.history.slice(0, (parsed.data as { limit: number }).limit) }; break;
      }
      case "update_quiz_preferences": result = await updatePreferences(env, principal.tenantId, parsed.data); break;
      case "publish_daily_quiz": result = await publishPack(env, principal.tenantId, parsed.data); break;
    }
    return rpc(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
  } catch (cause) {
    const response = await apiError(cause).json();
    return rpc(id, { content: [{ type: "text", text: JSON.stringify(response) }], isError: true });
  }
}
