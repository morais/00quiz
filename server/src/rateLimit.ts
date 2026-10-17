import { json, type Env } from "./api";

// Workers Rate Limiting bindings are counted at the edge, so a refused request
// never reaches D1 and no limit costs a database write. Each binding is
// optional: a deployment without them (local tests, an old wrangler.toml)
// simply runs unlimited.

export const tooManyRequests = (): Response => {
  const response = json({ error: "Too many requests. Try again in a minute." }, 429);
  response.headers.set("Retry-After", "60");
  return response;
};

/// The client address Cloudflare observed, never a header the caller can set.
export function sourceKey(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

async function allowed(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try { return (await limiter.limit({ key })).success; }
  catch { return true; }
}

/// Every non-health request, per IP, before any credential lookup.
export function sourceAllowed(env: Env, req: Request): Promise<boolean> {
  return allowed(env.SOURCE_LIMITER, `source:${sourceKey(req)}`);
}

/// Sign-in and OAuth routes, per IP. They call Apple or write unauthenticated
/// rows, so they get a much smaller budget than ordinary API traffic.
export function signInAllowed(env: Env, req: Request): Promise<boolean> {
  return allowed(env.SIGN_IN_LIMITER, `sign-in:${sourceKey(req)}`);
}

/// Authenticated REST and MCP requests, per account.
export function tenantAllowed(env: Env, tenantId: string): Promise<boolean> {
  return allowed(env.TENANT_LIMITER, `tenant:${tenantId}`);
}
