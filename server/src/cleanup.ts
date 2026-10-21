import type { Env } from "./api";

/// Deletes OAuth flows, authorization codes, and credentials that can never be
/// used again. Runs from the daily cron. Expired rows are already refused on
/// read; this only reclaims storage. Each statement seeks an `expires_at` index, so a sweep that finds
/// nothing writes nothing.
export async function sweepExpiredAuthData(env: Env, now = new Date()): Promise<void> {
  const cutoff = now.toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_flows WHERE expires_at <= ?").bind(cutoff),
    env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").bind(cutoff),
    env.DB.prepare("DELETE FROM credentials WHERE expires_at <= ?").bind(cutoff),
    env.DB.prepare("DELETE FROM credentials WHERE revoked_at IS NOT NULL").bind(),
    env.DB.prepare("DELETE FROM review_credentials WHERE expires_at <= ? OR revoked_at IS NOT NULL").bind(cutoff),
  ]);
}
