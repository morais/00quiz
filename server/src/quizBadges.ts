import { z } from "zod";
import { body, json, preferences, type Env } from "./api";
import { base64url, type Principal } from "./auth";
import { dateInZone } from "./model";

type PushEnvironment = "production" | "development";
type Device = { tenant_id: string; installation_id: string; credential_hash: string;
  device_token: string; environment: PushEnvironment; enabled: number; revision: string;
  last_badge: number | null; badge_day: string | null; authorized: number };
const registration = z.strictObject({ installationId: z.uuid(),
  deviceToken: z.string().regex(/^[a-f0-9]{32,512}$/).refine(v => v.length % 2 === 0),
  environment: z.enum(["production", "development"]), enabled: z.boolean() });

function configuration(env: Env, environment: PushEnvironment) {
  const keyId = environment === "production" ? env.APNS_KEY_ID : env.APNS_DEVELOPMENT_KEY_ID;
  const privateKey = environment === "production" ? env.APNS_PRIVATE_KEY : env.APNS_DEVELOPMENT_PRIVATE_KEY;
  const teamId = env.APPLE_TEAM_ID, topic = env.APPLE_APP_CLIENT_ID;
  return keyId && privateKey && teamId && topic ? { keyId, privateKey, teamId, topic } : null;
}

export async function routeQuizBadgeDevice(req: Request, env: Env, principal: Principal): Promise<Response> {
  if (principal.kind !== "app") return json({ error: "App sign-in required" }, 403);
  if (req.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const input = registration.parse(await body(req));
  if (input.enabled && (!configuration(env, input.environment) || !env.QUIZ_BADGES))
    return json({ error: "Quiz badges are not available for this build yet" }, 503);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM quiz_badge_devices WHERE tenant_id = ? AND installation_id != ?")
    .bind(principal.tenantId, input.installationId).first<{ n: number }>();
  if (input.enabled && (count?.n ?? 0) >= 10) return json({ error: "Device limit reached" }, 409);
  const now = new Date().toISOString(), revision = crypto.randomUUID();
  const valid = "SELECT 1 FROM credentials WHERE token_hash = ? AND tenant_id = ? AND kind = 'app' AND revoked_at IS NULL AND expires_at > ?";
  const results = await env.DB.batch([
    // Token ownership moves only after rechecking the app session atomically.
    env.DB.prepare(`DELETE FROM quiz_badge_devices WHERE environment = ? AND device_token = ?
      AND NOT (tenant_id = ? AND installation_id = ?) AND EXISTS (${valid})`)
      .bind(input.environment, input.deviceToken, principal.tenantId, input.installationId, principal.tokenHash, principal.tenantId, now),
    env.DB.prepare(`INSERT INTO quiz_badge_devices
      (tenant_id, installation_id, credential_hash, device_token, environment, enabled, revision, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (${valid})
      ON CONFLICT(tenant_id, installation_id) DO UPDATE SET credential_hash = excluded.credential_hash,
        device_token = excluded.device_token, environment = excluded.environment, enabled = excluded.enabled,
        revision = excluded.revision, updated_at = excluded.updated_at, last_badge = NULL`)
      .bind(principal.tenantId, input.installationId, principal.tokenHash, input.deviceToken, input.environment,
        Number(input.enabled), revision, now, principal.tokenHash, principal.tenantId, now),
  ]);
  return results[1].meta.changes ? json({ ok: true }) : json({ error: "Session ended" }, 401);
}

export async function pendingQuizBadge(env: Env, tenantId: string, now = new Date()): Promise<0 | 1> {
  const prefs = await preferences(env, tenantId), today = dateInZone(now, prefs.timeZone);
  const row = await env.DB.prepare(`SELECT p.id, COUNT(a.question_index) AS answered FROM quiz_packs p
    LEFT JOIN answers a ON a.pack_id = p.id AND a.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.day = ? GROUP BY p.id`).bind(tenantId, today).first<{ answered: number }>();
  return row && row.answered < 5 ? 1 : 0;
}

// Delivery failures never turn a saved answer or published quiz into an error.
// The five-minute sweep retries failures and handles prepublished days/midnight.
export async function notifyQuizBadge(env: Env, tenantId: string): Promise<void> {
  if (!env.QUIZ_BADGES) return;
  try {
    const device = await env.DB.prepare("SELECT 1 FROM quiz_badge_devices WHERE tenant_id = ? LIMIT 1").bind(tenantId).first();
    if (!device) return;
    const result = await env.QUIZ_BADGES.get(env.QUIZ_BADGES.idFromName(tenantId)).fetch("https://badge.internal/sync", {
      method: "POST", body: tenantId,
    });
    if (!result.ok) console.warn("Quiz badge delivery deferred", result.status);
  } catch { console.warn("Quiz badge delivery deferred"); }
}

export async function sweepQuizBadges(env: Env): Promise<void> {
  if (!env.QUIZ_BADGES) return;
  // Keyset batches keep cron work bounded without starving later accounts.
  let after = "";
  for (;;) {
    const rows = (await env.DB.prepare(`SELECT DISTINCT tenant_id FROM quiz_badge_devices
      WHERE tenant_id > ? ORDER BY tenant_id LIMIT 100`).bind(after).all<{ tenant_id: string }>()).results;
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 10)
      await Promise.all(rows.slice(i, i + 10).map(row => notifyQuizBadge(env, row.tenant_id)));
    after = rows[rows.length - 1].tenant_id;
  }
}

let cachedToken: { keyId: string; teamId: string; privateKey: string; token: string; issuedAt: number } | undefined;
export async function apnsProviderToken(config: NonNullable<ReturnType<typeof configuration>>, now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.keyId === config.keyId && cachedToken.teamId === config.teamId &&
      cachedToken.privateKey === config.privateKey && now >= cachedToken.issuedAt && now - cachedToken.issuedAt < 50 * 60000)
    return cachedToken.token;
  const encode = (v: unknown) => base64url(new TextEncoder().encode(JSON.stringify(v)));
  const input = `${encode({ alg: "ES256", kid: config.keyId })}.${encode({ iss: config.teamId, iat: Math.floor(now / 1000) })}`;
  const pem = config.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)));
  const token = `${input}.${base64url(signature)}`;
  cachedToken = { ...config, token, issuedAt: now }; return token;
}

export async function deliverQuizBadges(env: Env, tenantId: string, now = new Date()): Promise<void> {
  const desired = await pendingQuizBadge(env, tenantId, now);
  const timeZone = (await preferences(env, tenantId)).timeZone, today = dateInZone(now, timeZone);
  const devices = (await env.DB.prepare(`SELECT d.*, CASE WHEN c.kind = 'app' AND c.tenant_id = d.tenant_id
      AND c.revoked_at IS NULL AND c.expires_at > ? THEN 1 ELSE 0 END AS authorized
    FROM quiz_badge_devices d LEFT JOIN credentials c ON c.token_hash = d.credential_hash
    WHERE d.tenant_id = ? LIMIT 10`).bind(now.toISOString(), tenantId).all<Device>()).results;
  await Promise.all(devices.map(async device => {
    const active = device.enabled === 1 && device.authorized === 1;
    const badge = active ? desired : 0;
    if (active && device.last_badge === badge && (badge === 0 || device.badge_day === today)) return;
    const config = configuration(env, device.environment);
    if (!config) return;
    const remove = () => env.DB.prepare("DELETE FROM quiz_badge_devices WHERE tenant_id = ? AND installation_id = ? AND revision = ?")
      .bind(tenantId, device.installation_id, device.revision).run();
    try {
      const host = device.environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
      const result = await fetch(`https://${host}/3/device/${device.device_token}`, {
        method: "POST", headers: { authorization: `bearer ${await apnsProviderToken(config)}`,
          "apns-topic": config.topic, "apns-push-type": "alert", "apns-priority": "5",
          "apns-collapse-id": "00quiz-pending-quiz",
          // A pending badge must not be delivered on a later local day.
          "apns-expiration": String(badge ? Math.floor(nextQuizDay(now, timeZone) / 1000)
            : Math.floor(now.getTime() / 1000) + 86400), "content-type": "application/json" },
        body: JSON.stringify({ aps: { badge } }), signal: AbortSignal.timeout(10000),
      });
      const detail = await result.json().catch(() => ({})) as { reason?: string };
      if (result.ok) {
        if (!active) await remove();
        else await env.DB.prepare("UPDATE quiz_badge_devices SET last_badge = ?, badge_day = ? WHERE tenant_id = ? AND installation_id = ? AND revision = ?")
          .bind(badge, today, tenantId, device.installation_id, device.revision).run();
      } else if (result.status === 410 || result.status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(detail.reason ?? "")) {
        await remove();
      } else { console.warn("Quiz badge rejected; retry scheduled", result.status); }
    } catch { console.warn("Quiz badge transport deferred"); }
  }));
}

export function nextQuizDay(now: Date, timeZone: string): number {
  const today = dateInZone(now, timeZone);
  let low = now.getTime(), high = low + 36 * 3600000;
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (dateInZone(new Date(mid), timeZone) === today) low = mid; else high = mid;
  }
  return high;
}

// One delivery lane per account: a pending push already in flight finishes
// before the completion clear. Every request reads current database truth.
export class QuizBadgeDelivery {
  private lane: Promise<void> = Promise.resolve();
  constructor(_state: DurableObjectState, private env: Env) {}
  async fetch(req: Request): Promise<Response> {
    const tenantId = await req.text();
    if (!tenantId || tenantId.length > 128) return new Response(null, { status: 400 });
    const delivery = this.lane.then(() => deliverQuizBadges(this.env, tenantId));
    this.lane = delivery.catch(() => {});
    await delivery;
    return new Response(null, { status: 204 });
  }
}
