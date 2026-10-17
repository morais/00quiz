import { apiError, routeApi, json, type Env } from "./api";
import { routeMcp } from "./mcp";
import { serveInstructions } from "./agentInstructions";
import { ensureReviewFixture, resetReviewQuiz, signInForReview } from "./review";
import { authenticate } from "./auth";
import { deleteAccount, signInWithApple, signOut } from "./appAuth";
import { disconnectMcpConnection, listMcpConnections } from "./mcpConnections";
import { maybeSweep } from "./cleanup";
import { signInAllowed, sourceAllowed, tenantAllowed, tooManyRequests } from "./rateLimit";
import { appleCallback, authChallenge, authorizationServerMetadata, beginAuthorization,
  decideConsent, exchangeCode, protectedResourceMetadata, registerClient, showConsent,
  showReviewLogin, reviewCallback } from "./oauth";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const path = new URL(req.url).pathname, method = req.method;
      if (path === "/health" && method === "GET") return json({ ok: true, app: "00Quiz" });
      if (!(await sourceAllowed(env, req))) return tooManyRequests();
      if (path === "/agent-instructions" && (method === "GET" || method === "HEAD")) return serveInstructions(req);
      if (path === "/" || path === "/privacy") return new Response(page(path === "/privacy"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (path.startsWith("/oauth/") || path.startsWith("/auth/") || path === "/v1/auth/apple" || path === "/v1/auth/review" || path === "/v1/auth/delete-account") {
        if (!(await signInAllowed(env, req))) return tooManyRequests(); maybeSweep(env, ctx);
      }
      if ((path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") && method === "GET") return protectedResourceMetadata(env);
      if (path === "/.well-known/oauth-authorization-server" && method === "GET") return authorizationServerMetadata(env);
      if (path === "/oauth/register" && method === "POST") return registerClient(req, env);
      if (path === "/oauth/authorize" && method === "GET") return beginAuthorization(req, env);
      if (path === "/oauth/login" && method === "GET") return showReviewLogin(req, env);
      if (path === "/auth/apple/callback" && method === "POST") return appleCallback(req, env, ctx);
      if (path === "/auth/review/callback" && method === "POST") return reviewCallback(req, env);
      if (path === "/oauth/consent" && method === "GET") return showConsent(req, env);
      if (path === "/oauth/consent" && method === "POST") return decideConsent(req, env);
      if (path === "/oauth/token" && method === "POST") return exchangeCode(req, env);
      if (path === "/v1/auth/apple" && method === "POST") return signInWithApple(req, env, ctx);
      if (path === "/v1/auth/review" && method === "POST") return signInForReview(req, env);
      if (path === "/mcp") {
        const principal = await authenticate(req, env, "mcp");
        if (!principal) return authChallenge(env);
        if (!(await tenantAllowed(env, principal.tenantId))) return tooManyRequests();
        return routeMcp(req, env, principal);
      }
      if (path.startsWith("/v1/")) {
        const principal = await authenticate(req, env, "app");
        if (!principal) return json({ error: "Unauthorized" }, 401);
        if (!(await tenantAllowed(env, principal.tenantId))) return tooManyRequests();
        if (path === "/v1/auth/logout" && method === "POST") return signOut(env, principal);
        if (path === "/v1/auth/delete-account" && method === "POST") return deleteAccount(req, env, principal);
        if (path === "/v1/review/reset" && method === "POST") return resetReviewQuiz(env, principal);
        if (path === "/v1/snapshot" && method === "GET") await ensureReviewFixture(env, principal.tenantId);
        if (path === "/v1/account/mcp-connections" && method === "GET") return listMcpConnections(env, principal);
        const connection = /^\/v1\/account\/mcp-connections\/([a-f0-9-]{32,36})$/.exec(path);
        if (connection && method === "DELETE") return disconnectMcpConnection(env, principal, connection[1]);
        return routeApi(req, env, principal);
      }
      return json({ error: "Not found" }, 404);
    } catch (cause) { return apiError(cause); }
  },
};

function page(privacy: boolean) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>00Quiz${privacy ? " · Privacy" : ""}</title><style>body{font:18px system-ui;max-width:640px;margin:10vh auto;padding:24px;line-height:1.6;background:#fcf9f2;color:#193b31}a{color:inherit}h1{font-size:48px}</style><h1>00Quiz</h1>${privacy
    ? `<h2>Your quiz, your agent.</h2><p>00Quiz stores your Apple account identifier, optional email, optional quiz preferences, time zone, daily questions, answers and scores. Your email is not your account identifier.</p><p>Your connected MCP agent can read your quiz preferences, quizzes and performance and publish question packs after you approve its access. It cannot submit answers for you. The agent service you choose processes data under its own terms.</p><p>Account data is stored in Cloudflare D1. App credentials are held in iOS Keychain; the server stores only hashes of app and MCP credentials. The app caches quiz data on your device. There is no advertising or cross-app tracking.</p><p>Disconnect agents in Settings. Delete your account and its associated quiz data in the app after confirming with Apple. Local reminders are optional.</p><p>Contact: <a href="https://00quiz.com/support">00quiz.com/support</a></p>`
    : `<p>Five questions. Something new, every day.</p><p>Connect your own MCP agent, let it choose questions around your interests, and build a daily streak on iPhone.</p><p>MCP endpoint: <code>https://api.00quiz.com/mcp</code></p><p><a href="/privacy">Privacy</a> · <a href="https://00quiz.com/support">Support</a></p>`}</html>`;
}
