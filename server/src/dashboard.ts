import { appleEmail, exchangeAppleCode, verifyAppleIdToken } from "./apple";
import { appName, snapshot, type Env } from "./api";
import { ensureReviewFixture } from "./review";
import { base64url, constantTimeEqual, decodeBase64url, findOrCreateTenant, publicOrigin, randomToken, sha256Hex } from "./auth";
import { appleAuthorize, reviewTenantForAccessCode } from "./oauth";
import { tenantAllowed, tooManyRequests } from "./rateLimit";

const flowCookieName = "qq_dashboard_flow";
const sessionCookieName = "qq_dashboard_session";
const flowLifetimeSeconds = 600;
const sessionLifetimeSeconds = 86400;

type LoginFlow = { state: string; nonce: string; exp: number };
type Session = {
  kind: "apple" | "review"; tenantId: string; exp: number;
  appleSubject?: string; reviewCodeHash?: string;
};

function configured(env: Env): boolean {
  return Boolean(env.OAUTH_SIGNING_SECRET && env.OAUTH_SIGNING_SECRET.length >= 32);
}

function appleConfigured(env: Env): boolean {
  return configured(env) && Boolean(env.APPLE_WEB_CLIENT_ID && env.APPLE_WEB_REDIRECT_URI && env.APPLE_PRIVATE_KEY);
}

function reviewConfigured(env: Env): boolean {
  return configured(env) && Boolean(env.REVIEW_TENANT_IDS?.trim());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function page(env: Env, body: string, status = 200, signedIn = false): Response {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(appName(env))} · Dashboard</title><style>
    :root{color-scheme:light dark;--bg:#fcf9f2;--fg:#193b31;--muted:#52665f;--line:#d9e3db;--card:#fff;--accent:#1f503d}
    @media(prefers-color-scheme:dark){:root{--bg:#111a17;--fg:#f5f8f2;--muted:#a0b8a7;--line:#304138;--card:#192a21;--accent:#8cd9a8}}
    *{box-sizing:border-box}body{font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:720px;margin:0 auto;padding:24px;line-height:1.45}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:32px}header strong{font-size:22px;font-weight:800}
    h1{font-size:23px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 12px}p,.muted{color:var(--muted)}main{border:1px solid var(--line);border-radius:18px;padding:28px;background:var(--card)}
    a{color:var(--accent)}.apple-button{display:block;width:100%;text-align:center;padding:10px 18px;margin:20px 0 0;border-radius:6px;background:var(--fg);color:var(--bg);font-weight:600;text-decoration:none}
    input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);max-width:100%;width:100%}
    ol{padding-left:24px}article{border-top:1px solid var(--line);padding:16px 0}.host,.explanation{white-space:pre-wrap}.feedback{border-left:3px solid var(--accent);padding-left:12px}.stats{display:flex;flex-wrap:wrap;gap:20px;margin:20px 0}.stats strong{display:block;font-size:24px}summary{font-weight:600}button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:6px;padding:10px 18px;background:var(--accent);color:var(--bg)}details{margin-top:24px}summary{cursor:pointer}details form{margin-top:12px}details button{margin-top:12px}
    .logout{margin:0}.logout button{background:transparent;color:var(--accent);padding:4px 0}.items{list-style:none;margin:0;padding:0}.items li{padding:12px 0;border-top:1px solid var(--line)}.items li:first-child{border-top:0}.item-title{font-weight:600}.item-meta{font-size:13px;color:var(--muted);margin-top:3px}
    .count{font-size:13px;color:var(--muted);font-weight:400;margin-left:6px}.empty{color:var(--muted);margin:0}
  </style><header><strong>${escapeHtml(appName(env))}</strong>${signedIn ? '<form class="logout" method="post" action="/dashboard/logout"><button>Sign out</button></form>' : ""}</header><main>${body}</main><footer><p><a href="https://00quiz.com/">00Quiz</a> · <a href="https://00quiz.com/privacy">Privacy</a> · <a href="https://00quiz.com/support">Support</a> · <a href="https://00quiz.com/terms">Terms</a></p></footer></html>`, {
    status, headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "same-origin", "x-content-type-options": "nosniff",
    },
  });
}

function redirect(env: Env, path: string): Response {
  return new Response(null, { status: 303, headers: {
    Location: `${publicOrigin(env)}${path}`, "cache-control": "no-store",
  } });
}

function cookie(req: Request, name: string): string | null {
  return req.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

async function hmac(env: Env, purpose: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.OAUTH_SIGNING_SECRET!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`dashboard:${purpose}:${value}`))));
}

async function signed<T>(env: Env, purpose: string, value: T): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(value)));
  return `${payload}.${await hmac(env, purpose, payload)}`;
}

async function verified<T>(env: Env, purpose: string, raw: string | null): Promise<T | null> {
  if (!configured(env) || !raw || raw.length > 2048) return null;
  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra || !constantTimeEqual(signature, await hmac(env, purpose, payload))) return null;
  try { return JSON.parse(new TextDecoder().decode(decodeBase64url(payload))) as T; }
  catch { return null; }
}

function flowCookie(value: string): string {
  return `${flowCookieName}=${value}; Path=/auth/apple/callback; Max-Age=${flowLifetimeSeconds}; HttpOnly; Secure; SameSite=None`;
}

function clearFlowCookie(): string {
  return `${flowCookieName}=; Path=/auth/apple/callback; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

function sessionCookie(value: string): string {
  return `${sessionCookieName}=${value}; Path=/dashboard; Max-Age=${sessionLifetimeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return `${sessionCookieName}=; Path=/dashboard; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function currentSession(req: Request, env: Env): Promise<Session | null> {
  const session = await verified<Session>(env, "session", cookie(req, sessionCookieName));
  if (!session || !Number.isFinite(session.exp) || session.exp <= Date.now() / 1000
    || !/^[a-f0-9-]{36}$/.test(session.tenantId)) return null;
  if (session.kind === "apple" && typeof session.appleSubject === "string") {
    const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE id = ? AND apple_subject = ?")
      .bind(session.tenantId, session.appleSubject).first();
    return tenant ? session : null;
  }
  if (session.kind === "review" && /^[a-f0-9]{64}$/.test(session.reviewCodeHash ?? "")) {
    const allowed = new Set((env.REVIEW_TENANT_IDS ?? "").split(",").map((id) => id.trim()));
    if (!allowed.has(session.tenantId)) return null;
    const credential = await env.DB.prepare(`SELECT r.tenant_id FROM review_credentials r JOIN tenants t ON t.id = r.tenant_id
      WHERE r.token_hash = ? AND r.tenant_id = ? AND r.revoked_at IS NULL AND r.expires_at > ? AND t.apple_subject IS NULL`)
      .bind(session.reviewCodeHash, session.tenantId, new Date().toISOString()).first();
    return credential ? session : null;
  }
  return null;
}

export async function dashboardLogin(req: Request, env: Env): Promise<Response> {
  if (await currentSession(req, env)) return redirect(env, "/dashboard");
  if (!appleConfigured(env) && !reviewConfigured(env)) return page(env, "<h1>Sign-in is not configured</h1>", 503);
  return page(env, `<h1>Sign in</h1><p>Use your ${escapeHtml(appName(env))} account to view your quizzes, preferences and progress. Answer questions in the iPhone app; this dashboard is read-only.</p>
    ${appleConfigured(env) ? '<a class="apple-button" href="/dashboard/login/apple">Sign in with Apple</a>' : ""}
    ${reviewConfigured(env) ? `<details><summary>Reviewer access</summary><p>Use the access code supplied in the secure reviewer instructions.</p>
      <form method="post" action="/dashboard/login/review"><label for="access-code">Review access code</label>
      <input id="access-code" name="accessCode" type="password" autocomplete="off" required maxlength="128">
      <button>Sign in as reviewer</button></form></details>` : ""}`);
}

export async function dashboardAppleLogin(env: Env): Promise<Response> {
  if (!appleConfigured(env)) return page(env, "<h1>Apple sign-in is not configured</h1>", 503);
  const flow: LoginFlow = {
    state: `qqdash_${randomToken(24)}`, nonce: randomToken(24),
    exp: Math.floor(Date.now() / 1000) + flowLifetimeSeconds,
  };
  const response = appleAuthorize(env, flow.state, flow.nonce);
  response.headers.set("set-cookie", flowCookie(await signed(env, "flow", flow)));
  return response;
}

export function isDashboardAppleState(state: string | null): boolean {
  return Boolean(state && /^qqdash_[A-Za-z0-9_-]{32}$/.test(state));
}

export async function dashboardAppleCallback(req: Request, env: Env, form: URLSearchParams, ctx?: ExecutionContext): Promise<Response> {
  const flow = await verified<LoginFlow>(env, "flow", cookie(req, flowCookieName));
  const invalid = () => {
    const response = page(env, '<h1>Sign-in expired</h1><p>Please start again from <a href="/dashboard/login">the login page</a>.</p>', 401);
    response.headers.set("set-cookie", clearFlowCookie());
    return response;
  };
  if (!flow || !isDashboardAppleState(flow.state) || !Number.isFinite(flow.exp)
    || flow.exp <= Date.now() / 1000 || !constantTimeEqual(flow.state, form.get("state") ?? "")
    || !/^[A-Za-z0-9_-]{32}$/.test(flow.nonce)) return invalid();
  if (form.get("error")) return invalid();
  try {
    const identityToken = form.get("id_token") ?? "";
    const code = form.get("code") ?? "";
    const claims = await verifyAppleIdToken(identityToken, env.APPLE_WEB_CLIENT_ID!, flow.nonce);
    const exchanged = await exchangeAppleCode(env, code, env.APPLE_WEB_CLIENT_ID!, env.APPLE_WEB_REDIRECT_URI!);
    const verifiedClaims = await verifyAppleIdToken(exchanged.idToken, env.APPLE_WEB_CLIENT_ID!, flow.nonce);
    if (!constantTimeEqual(claims.sub, verifiedClaims.sub)) throw new Error("Apple account changed");
    const tenant = await findOrCreateTenant(env, claims.sub, appleEmail(verifiedClaims), { source: "dashboard", ctx });
    const session: Session = {
      kind: "apple", tenantId: tenant.id, appleSubject: claims.sub,
      exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
    };
    const response = redirect(env, "/dashboard");
    response.headers.append("set-cookie", clearFlowCookie());
    response.headers.append("set-cookie", sessionCookie(await signed(env, "session", session)));
    return response;
  } catch (cause) {
    console.warn("Dashboard Apple sign-in failed", cause instanceof Error ? cause.message : "unknown error");
    return invalid();
  }
}

export async function dashboardReviewLogin(req: Request, env: Env): Promise<Response> {
  if (!reviewConfigured(env)) return page(env, "<h1>Not found</h1>", 404);
  if (req.headers.get("origin") !== publicOrigin(env)) return page(env, "<h1>Invalid request origin</h1>", 403);
  if (Number(req.headers.get("content-length") ?? 0) > 1024) return page(env, "<h1>Invalid request</h1>", 400);
  const reader = req.body?.getReader();
  if (!reader) return page(env, "<h1>Invalid request</h1>", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 1024) { await reader.cancel(); return page(env, "<h1>Invalid request</h1>", 400); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  const code = new URLSearchParams(raw).get("accessCode") ?? "";
  const tenantId = await reviewTenantForAccessCode(env, code);
  if (!tenantId || !(await ensureReviewFixture(env, tenantId))) return page(env, '<h1>Invalid or expired reviewer code</h1><p><a href="/dashboard/login">Try again</a>.</p>', 401);
  const session: Session = {
    kind: "review", tenantId, reviewCodeHash: await sha256Hex(code),
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  };
  const response = redirect(env, "/dashboard");
  response.headers.set("set-cookie", sessionCookie(await signed(env, "session", session)));
  return response;
}

function quizHtml(quiz: Awaited<ReturnType<typeof snapshot>>["history"][number]): string {
  return `<section><h2>${escapeHtml(quiz.day)} · ${escapeHtml(quiz.title)}</h2>
    <p>${quiz.completed ? `${quiz.score}/5 correct · completed` : `${quiz.questions.filter(q => q.answer).length}/5 answered`}</p>
    <p class="host">${escapeHtml(quiz.hostMessage)}</p>${quiz.feedback ? `<div class="feedback"><strong>Your feedback for future quizzes</strong><p class="host">${escapeHtml(quiz.feedback.message)}</p></div>` : ""}${quiz.questions.map(q => {
      const feedback = q.explanation === null ? "" : `<div class="feedback"><p><strong>${q.answer ? q.answer.correct ? "Correct" : "A little discovery" : "The answer"}</strong>${q.correctIndex === null ? "" : ` · ${String.fromCharCode(65 + q.correctIndex)}`}</p><p class="explanation">${escapeHtml(q.explanation)}</p>${q.sourceURL && /^https:\/\//.test(q.sourceURL) ? `<a href="${escapeHtml(q.sourceURL)}" rel="noreferrer noopener">Explore the source</a>` : ""}</div>`;
      return `<article><p class="muted">${q.index + 1}. ${escapeHtml(q.topic)}</p><h3>${escapeHtml(q.prompt)}</h3>
        <ol type="A">${q.choices.map((choice, index) => `<li>${escapeHtml(choice)}${q.answer?.choiceIndex === index ? " · Your answer" : ""}</li>`).join("")}</ol>${feedback}</article>`;
    }).join("")}</section>`;
}

export async function dashboard(req: Request, env: Env): Promise<Response> {
  const session = await currentSession(req, env);
  if (!session) {
    const response = redirect(env, "/dashboard/login"); response.headers.set("set-cookie", clearSessionCookie()); return response;
  }
  if (!(await tenantAllowed(env, session.tenantId))) return tooManyRequests();
  if (session.kind === "review") await ensureReviewFixture(env, session.tenantId);
  const state = await snapshot(env, session.tenantId), prefs = state.preferences;
  const upcoming = (await env.DB.prepare("SELECT day, title FROM quiz_packs WHERE tenant_id = ? AND day > ? ORDER BY day LIMIT 7")
    .bind(session.tenantId, state.today).all<{ day: string; title: string }>()).results;
  return page(env, `<h1>Your quiz show</h1>${session.kind === "review" ? '<p><strong>App Review · synthetic sample account</strong></p>' : ""}
    <p>Read-only view. Play and save answers in the 00Quiz iPhone app. Future questions stay hidden until their local day.</p>
    <div class="stats"><div><strong>${state.streak.current}</strong>day streak</div><div><strong>${state.streak.longest}</strong>best streak</div><div><strong>${state.streak.completedDays}</strong>completed days</div></div>
    <section><h2>Your preferences</h2><p>Interests: ${prefs.interests.length ? prefs.interests.map(escapeHtml).join(", ") : "Let my agent choose"}<br>
    Language: ${escapeHtml(prefs.language ?? "Let my agent choose")}<br>Difficulty: ${escapeHtml(prefs.difficulty ?? "Let my agent choose")}<br>Time zone: ${escapeHtml(prefs.timeZone)}</p></section>
    ${state.quiz ? quizHtml(state.quiz) : '<section><h2>Today</h2><p>No quiz published for today. Ask your connected agent to prepare your five.</p></section>'}
    <section><h2>Upcoming</h2>${upcoming.length ? `<ul>${upcoming.map(pack => `<li>${escapeHtml(pack.day)} · ${escapeHtml(pack.title)}</li>`).join("")}</ul>` : '<p>No future quizzes published.</p>'}</section>
    <section><h2>Past quizzes</h2>${state.history.length ? state.history.slice(0, 15).map(pack => `<details><summary>${escapeHtml(pack.day)} · ${escapeHtml(pack.title)} · ${pack.score}/5</summary>${quizHtml(pack)}</details>`).join("") : '<p>No previous quizzes.</p>'}</section>`, 200, true);
}

export function dashboardLogout(req: Request, env: Env): Response {
  if (req.headers.get("origin") !== publicOrigin(env)) return page(env, "<h1>Invalid request origin</h1>", 403);
  const response = redirect(env, "/dashboard/login");
  response.headers.set("set-cookie", clearSessionCookie());
  return response;
}
