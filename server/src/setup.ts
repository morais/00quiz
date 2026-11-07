import type { Env } from "./api";

export type SetupStatus = "ready" | "finish_setup" | "unknown";

// No profile, identifiers or sign-in timestamps leave this module. Preferences
// are optional in 00Quiz; the row proves initialization, not selected values.
export async function accountSetup(env: Env, tenantId: string, tool: string, args: object) {
  const row = await env.DB.prepare(`SELECT first_native_sign_in_at,
    apple_subject IS NULL AS synthetic,
    EXISTS(SELECT 1 FROM preferences p WHERE p.tenant_id = t.id) AS initialized,
    EXISTS(SELECT 1 FROM quiz_packs p WHERE p.tenant_id = t.id) AS prepared
    FROM tenants t WHERE t.id = ?`).bind(tenantId)
    .first<{ first_native_sign_in_at: string | null; synthetic: number; initialized: number; prepared: number }>();
  const reviewer = Boolean(row?.synthetic && row.initialized && row.prepared
    && (env.REVIEW_TENANT_IDS ?? "").split(",").map(id => id.trim()).includes(tenantId));
  const ready = reviewer || Boolean(row?.first_native_sign_in_at && row.initialized);
  const status: SetupStatus = ready ? "ready"
    : row?.first_native_sign_in_at ? "finish_setup" : "unknown";
  if (status === "ready") return { status };
  return {
    status,
    optional: true,
    ...(status === "unknown" ? { question: "Have you already configured the 00Quiz app?" } : {}),
    appStoreURL: "https://apps.apple.com/app/id6823917960",
    instructions: `${status === "unknown" ? "Ask whether the app is configured; missing sign-in evidence does not mean it is unconfigured. " : ""}Offer this help optionally and continue the user's requested quiz work if they prefer. Open or install 00Quiz from the App Store, sign in with the same Apple account used for this connection, and finish the app's setup. Quiz interests, language, difficulty and reminders are optional. Return to this chat afterward. Keep the plugin connected; do not disconnect or reinstall it. Recheck by calling the same tool with the same arguments.`,
    recheck: { tool, arguments: args },
  };
}
